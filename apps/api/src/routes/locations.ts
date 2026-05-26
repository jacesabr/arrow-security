import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  db,
  guardLocations,
  shifts,
  sites,
  users,
  supervisorSites,
} from '@secureops/db'
import { eq, and, gte, inArray } from 'drizzle-orm'
import { requireAuth, requireSupervisor, getSupervisorGuardIds } from '../lib/auth'
import { redisPublisher, createSubscriber } from '../lib/redis'
import { sendPush } from '../lib/push'
import {
  processPing,
  closeOpenVisitForShift,
  type Transition,
} from '../lib/geofence-state'
import { latLngToCell } from 'h3-js'

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function computeDwells(
  pings: { latitude: number; longitude: number; recordedAt: Date }[],
  radiusMeters = 30,
  minDurationMs = 20 * 60 * 1000
) {
  if (pings.length === 0) return []

  const dwells: { lat: number; lng: number; startedAt: Date; endedAt: Date; durationMinutes: number; pingCount: number }[] = []

  let clusterLats = [pings[0].latitude]
  let clusterLngs = [pings[0].longitude]
  let clusterStart = pings[0].recordedAt
  let clusterEnd = pings[0].recordedAt

  for (let i = 1; i < pings.length; i++) {
    const ping = pings[i]
    const centLat = clusterLats.reduce((a, b) => a + b, 0) / clusterLats.length
    const centLng = clusterLngs.reduce((a, b) => a + b, 0) / clusterLngs.length
    const dist = haversineMeters(centLat, centLng, ping.latitude, ping.longitude)

    if (dist <= radiusMeters) {
      clusterLats.push(ping.latitude)
      clusterLngs.push(ping.longitude)
      clusterEnd = ping.recordedAt
    } else {
      const duration = clusterEnd.getTime() - clusterStart.getTime()
      if (duration >= minDurationMs) {
        dwells.push({
          lat: clusterLats.reduce((a, b) => a + b, 0) / clusterLats.length,
          lng: clusterLngs.reduce((a, b) => a + b, 0) / clusterLngs.length,
          startedAt: clusterStart,
          endedAt: clusterEnd,
          durationMinutes: Math.round(duration / 60000),
          pingCount: clusterLats.length,
        })
      }
      clusterLats = [ping.latitude]
      clusterLngs = [ping.longitude]
      clusterStart = ping.recordedAt
      clusterEnd = ping.recordedAt
    }
  }

  // Close last cluster
  const duration = clusterEnd.getTime() - clusterStart.getTime()
  if (duration >= minDurationMs) {
    dwells.push({
      lat: clusterLats.reduce((a, b) => a + b, 0) / clusterLats.length,
      lng: clusterLngs.reduce((a, b) => a + b, 0) / clusterLngs.length,
      startedAt: clusterStart,
      endedAt: clusterEnd,
      durationMinutes: Math.round(duration / 60000),
      pingCount: clusterLats.length,
    })
  }

  return dwells
}

/**
 * Look up the shift owning this ping and the guard's role in a single query.
 * Returns null when no shift was claimed, the shift doesn't belong to this
 * tenant/guard, or the shift isn't currently active.
 */
async function loadActiveShiftWithRole(
  tenantId: string,
  guardId: string,
  shiftId: string
): Promise<{ shiftId: string; siteId: string; role: string } | null> {
  const [row] = await db
    .select({
      shiftId: shifts.id,
      siteId: shifts.siteId,
      status: shifts.status,
      role: users.role,
    })
    .from(shifts)
    .innerJoin(users, eq(shifts.guardId, users.id))
    .where(
      and(
        eq(shifts.id, shiftId),
        eq(shifts.tenantId, tenantId),
        eq(shifts.guardId, guardId)
      )
    )
    .limit(1)

  if (!row || row.status !== 'active') return null
  return { shiftId: row.shiftId, siteId: row.siteId, role: row.role }
}

/**
 * Gather FCM tokens for everyone who should be alerted when a guard goes
 * off-site: tenant admins + supervisors assigned to the shift's site.
 */
async function gatherOffSiteNotifyTokens(
  tenantId: string,
  shiftSiteId: string
): Promise<string[]> {
  const supervisorsAtSite = await db
    .select({ userId: supervisorSites.supervisorId })
    .from(supervisorSites)
    .where(eq(supervisorSites.siteId, shiftSiteId))

  const supervisorIds = supervisorsAtSite.map((r) => r.userId)

  const admins = await db
    .select({ fcmToken: users.fcmToken })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        inArray(users.role, ['tenant_admin', 'platform_admin'])
      )
    )

  const supervisorTokens =
    supervisorIds.length === 0
      ? []
      : await db
          .select({ fcmToken: users.fcmToken })
          .from(users)
          .where(and(eq(users.tenantId, tenantId), inArray(users.id, supervisorIds)))

  const tokens = [...admins, ...supervisorTokens]
    .map((r) => r.fcmToken)
    .filter((t): t is string => !!t)
  return Array.from(new Set(tokens))
}

/**
 * Abandon the shift + force-logout the guard when their off-site visit crosses
 * the hysteresis threshold. The persistent record is the shift_site_visits row
 * itself (its enteredAt/exitedAt bracket the off-site window) — we don't create
 * a separate "incident" any more.
 *
 * Returns nothing meaningful; the POST /locations handler just signals the
 * mobile client to log out by setting shiftAbandoned on the response.
 */
async function handleGuardOffSite(args: {
  tenantId: string
  guardId: string
  guardName: string
  shiftId: string
  shiftSiteId: string
  visitId: string
  visitEnteredAt: Date
  visitEnteredLat: number | null
  visitEnteredLng: number | null
  now: Date
}): Promise<void> {
  // The latch is now the shift status itself: as soon as we flip it to
  // 'abandoned', loadActiveShiftWithRole returns null on subsequent pings and
  // the state machine doesn't run again for this shift. No incidentId latch
  // needed.

  // Stamp the shift as abandoned and close any open visit at the trigger time.
  // We use the visit's enteredAt as the abandonment time (event-time honest),
  // not "now" — the guard actually left the site at enteredAt.
  await db
    .update(shifts)
    .set({ status: 'abandoned', updatedAt: new Date() })
    .where(eq(shifts.id, args.shiftId))

  await closeOpenVisitForShift(
    args.shiftId,
    args.now,
    args.visitEnteredLat,
    args.visitEnteredLng
  )

  // Broadcast over SSE so live supervisor dashboards see it immediately.
  try {
    await redisPublisher.publish(
      `sse:${args.tenantId}`,
      JSON.stringify({
        type: 'guard_off_site',
        guardId: args.guardId,
        shiftId: args.shiftId,
        visitId: args.visitId,
        siteId: args.shiftSiteId,
        exitedAt: args.visitEnteredAt,
      })
    )
  } catch {
    // Redis unavailable — shift is still abandoned in DB regardless.
  }

  // Push notification to admins + supervisors of the shift's site.
  try {
    const tokens = await gatherOffSiteNotifyTokens(args.tenantId, args.shiftSiteId)
    await sendPush(
      tokens,
      'Guard off-site',
      `${args.guardName || 'A guard'} left their assigned site during their shift.`,
      { shiftId: args.shiftId, visitId: args.visitId, type: 'off_site_during_shift' }
    )
  } catch {
    // Never let push failure break the request.
  }
}

const pingSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().optional(),
  heading: z.number().optional(),
  speed: z.number().optional(),
  altitude: z.number().optional(),
  shiftId: z.string().optional(),
  battery: z.number().int().min(0).max(100).optional(),
  recordedAt: z.string().optional(),
})

export const locationsRoutes: FastifyPluginAsync = async (fastify) => {
  // Guard posts a location ping
  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; name?: string }
    const body = pingSchema.parse(request.body)

    const h3Res8 = latLngToCell(body.latitude, body.longitude, 8)

    const [loc] = await db
      .insert(guardLocations)
      .values({
        tenantId: payload.tenantId,
        guardId: payload.sub,
        shiftId: body.shiftId ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy: body.accuracy ?? null,
        heading: body.heading ?? null,
        speed: body.speed ?? null,
        altitude: body.altitude ?? null,
        battery: body.battery ?? null,
        h3Res8,
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
      })
      .returning()

    // Broadcast to all open supervisor SSE connections for this tenant via Redis Pub/Sub
    const event = JSON.stringify({
      type: 'location',
      guardId: payload.sub,
      lat: body.latitude,
      lng: body.longitude,
      accuracy: body.accuracy ?? null,
      heading: body.heading ?? null,
      battery: body.battery ?? null,
      ts: loc.recordedAt,
    })

    try {
      await redisPublisher.publish(`sse:${payload.tenantId}`, event)
    } catch {
      // Redis unavailable — skip broadcast, still return 201
    }

    // ── Geofence state machine ────────────────────────────────────────────────
    // Drive shift_site_visits from this ping when it belongs to an active shift.
    // Returns one or more transitions; the only one that requires action is
    // off_site_threshold_crossed (guards only → abandon shift + force logout).
    //
    // Failures here must NEVER fail the ping insert — wrap in try/catch.
    let abandonedShiftId: string | null = null

    if (body.shiftId) {
      try {
        const shift = await loadActiveShiftWithRole(
          payload.tenantId,
          payload.sub,
          body.shiftId
        )

        if (shift) {
          const tenantSiteRows = await db
            .select({
              id: sites.id,
              latitude: sites.latitude,
              longitude: sites.longitude,
              geofenceRadiusMeters: sites.geofenceRadiusMeters,
            })
            .from(sites)
            .where(and(eq(sites.tenantId, payload.tenantId), eq(sites.status, 'active')))

          const transitions: Transition[] = await processPing(
            {
              guardId: payload.sub,
              tenantId: payload.tenantId,
              shiftId: shift.shiftId,
              latitude: body.latitude,
              longitude: body.longitude,
              recordedAt: loc.recordedAt,
            },
            tenantSiteRows
          )

          for (const t of transitions) {
            if (t.kind === 'off_site_threshold_crossed' && shift.role === 'guard') {
              await handleGuardOffSite({
                tenantId: payload.tenantId,
                guardId: payload.sub,
                guardName: payload.name ?? '',
                shiftId: shift.shiftId,
                shiftSiteId: shift.siteId,
                visitId: t.visitId,
                visitEnteredAt: t.enteredAt,
                visitEnteredLat: t.enteredLat,
                visitEnteredLng: t.enteredLng,
                now: loc.recordedAt,
              })
              abandonedShiftId = shift.shiftId
            }
          }
        }
      } catch (err) {
        // State machine errors must not break the ping submission. Log and
        // continue — raw guard_locations remains the audit trail and we can
        // re-derive segments offline if needed.
        request.log.error({ err, shiftId: body.shiftId }, 'geofence state machine failed')
      }
    }

    // When the shift was just abandoned, signal the mobile app to log out the
    // guard. The mobile client checks for this field on every ping response.
    if (abandonedShiftId) {
      return reply.code(201).send({
        data: loc,
        shiftAbandoned: {
          shiftId: abandonedShiftId,
          reason: 'off_site_during_shift',
        },
      })
    }

    return reply.code(201).send({ data: loc })
  })

  // Dwell analysis — detect where a guard stayed 20+ minutes in one spot
  fastify.get('/dwell', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const query = z.object({
      guardId: z.string(),
      since: z.string().optional(),
      hours: z.coerce.number().default(8),
    }).parse(request.query)

    if (payload.role === 'supervisor') {
      const allowed = await getSupervisorGuardIds(payload.sub, payload.role)
      if (!allowed || !allowed.includes(query.guardId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Guard not at your site', statusCode: 403 })
      }
    }

    const since = query.since
      ? new Date(query.since)
      : new Date(Date.now() - query.hours * 60 * 60 * 1000)

    const pings = await db
      .select({
        latitude: guardLocations.latitude,
        longitude: guardLocations.longitude,
        recordedAt: guardLocations.recordedAt,
      })
      .from(guardLocations)
      .where(
        and(
          eq(guardLocations.tenantId, payload.tenantId),
          eq(guardLocations.guardId, query.guardId),
          gte(guardLocations.recordedAt, since)
        )
      )
      .orderBy(guardLocations.recordedAt)

    const dwells = computeDwells(pings.map(p => ({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      recordedAt: p.recordedAt,
    })))

    return reply.send({ data: dwells })
  })

  // Get location history for a guard (optionally filtered by shift or time window)
  fastify.get('/history', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const query = z.object({
      guardId: z.string().optional(),
      shiftId: z.string().optional(),
      since: z.string().optional(),
      limit: z.coerce.number().default(500),
    }).parse(request.query)

    const conditions = [eq(guardLocations.tenantId, payload.tenantId)]
    if (query.guardId) conditions.push(eq(guardLocations.guardId, query.guardId))
    if (payload.role === 'guard') conditions.push(eq(guardLocations.guardId, payload.sub))
    if (payload.role === 'supervisor') {
      const allowed = await getSupervisorGuardIds(payload.sub, payload.role)
      if (!allowed || allowed.length === 0) return reply.send({ data: [] })
      if (query.guardId && !allowed.includes(query.guardId)) return reply.send({ data: [] })
      if (!query.guardId) conditions.push(inArray(guardLocations.guardId, allowed))
    }
    if (query.shiftId) conditions.push(eq(guardLocations.shiftId, query.shiftId))
    if (query.since) conditions.push(gte(guardLocations.recordedAt, new Date(query.since)))

    const rows = await db
      .select()
      .from(guardLocations)
      .where(and(...conditions))
      .orderBy(guardLocations.recordedAt)
      .limit(query.limit)

    return reply.send({ data: rows })
  })

  // SSE stream of live guard positions for the supervisor dashboard
  fastify.get('/live', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const tenantId = payload.tenantId

    // Determine which guards this user can see live
    // - guard: only themselves
    // - supervisor: only guards at their sites
    // - admin: all (allowedGuardIds = null = no filter)
    let allowedGuardIds: Set<string> | null = null
    if (payload.role === 'guard') {
      allowedGuardIds = new Set([payload.sub])
    } else if (payload.role === 'supervisor') {
      const ids = await getSupervisorGuardIds(payload.sub, payload.role)
      allowedGuardIds = new Set(ids ?? [])
    }

    reply.hijack()

    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    res.write(': connected\n\n')

    const send = (data: string) => {
      try {
        res.write(`data: ${data}\n\n`)
      } catch {
        // client disconnected
      }
    }

    // Each SSE connection gets its own subscriber to avoid ioredis subscriber-mode conflicts
    const sub = createSubscriber()
    try {
      await sub.subscribe(`sse:${tenantId}`)
    } catch {
      // Redis unavailable — SSE still open but won't receive pings until Redis recovers
    }

    sub.on('message', (_channel: string, msg: string) => {
      if (allowedGuardIds !== null) {
        // Filter: skip events from guards outside this user's scope
        try {
          const evt = JSON.parse(msg)
          if (evt.guardId && !allowedGuardIds.has(evt.guardId)) return
        } catch {
          return
        }
      }
      send(msg)
    })

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 25000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      sub.unsubscribe().then(() => sub.quit()).catch(() => sub.disconnect())
    })
  })
}
