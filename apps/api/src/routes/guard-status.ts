import type { FastifyPluginAsync } from 'fastify'
import { db, shifts, sites, users, supervisorSites } from '@secureops/db'
import { eq, and, gte, lte, inArray, sql, ne } from 'drizzle-orm'
import { requireSupervisor, getSupervisorSiteIds } from '../lib/auth'

export const guardStatusRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }

    const supervisorSiteIds = await getSupervisorSiteIds(payload.sub, payload.role)

    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const shiftConditions = [
      eq(shifts.tenantId, payload.tenantId),
      gte(shifts.startsAt, windowStart),
    ]

    if (supervisorSiteIds !== null) {
      if (supervisorSiteIds.length === 0) return reply.send({ data: [] })
      shiftConditions.push(inArray(shifts.siteId, supervisorSiteIds))
    }

    const activeShifts = await db
      .select({
        shiftId: shifts.id,
        siteId: shifts.siteId,
        siteName: sites.name,
        guardId: shifts.guardId,
        guardName: users.name,
        guardUsername: users.username,
        shiftStatus: shifts.status,
        shiftStartsAt: shifts.startsAt,
        shiftEndsAt: shifts.endsAt,
      })
      .from(shifts)
      .innerJoin(sites, eq(shifts.siteId, sites.id))
      .innerJoin(users, eq(shifts.guardId, users.id))
      .where(and(...shiftConditions))
      .orderBy(shifts.startsAt)

    if (activeShifts.length === 0) return reply.send({ data: [] })

    const guardIds = [...new Set(activeShifts.map((s) => s.guardId))]

    // Latest attendance per guard (DISTINCT ON for efficiency)
    const attRows = await db.execute(sql`
      SELECT DISTINCT ON (guard_id)
        id, guard_id, type, selfie_url, liveness_score, is_within_geofence,
        selfie_review_status, verified_at
      FROM attendance_records
      WHERE tenant_id = ${payload.tenantId}
        AND guard_id = ANY(${guardIds}::text[])
      ORDER BY guard_id, verified_at DESC
    `)

    // Latest GPS ping per guard (within last 2 hours)
    const pingRows = await db.execute(sql`
      SELECT DISTINCT ON (guard_id)
        guard_id, latitude, longitude, recorded_at, battery, accuracy
      FROM guard_locations
      WHERE tenant_id = ${payload.tenantId}
        AND guard_id = ANY(${guardIds}::text[])
        AND recorded_at > NOW() - INTERVAL '2 hours'
      ORDER BY guard_id, recorded_at DESC
    `)

    type AttRow = {
      id: string; guard_id: string; type: string; selfie_url: string | null
      liveness_score: number | null; is_within_geofence: boolean | null
      selfie_review_status: string | null; verified_at: string
    }
    type PingRow = {
      guard_id: string; latitude: number; longitude: number
      recorded_at: string; battery: number | null; accuracy: number | null
    }

    const attByGuard = new Map<string, AttRow>(
      (attRows as unknown as AttRow[]).map((r) => [r.guard_id, r])
    )
    const pingByGuard = new Map<string, PingRow>(
      (pingRows as unknown as PingRow[]).map((r) => [r.guard_id, r])
    )

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    // Deduplicate — keep only the most recent shift per guard
    const seen = new Set<string>()
    const result = []
    for (const s of activeShifts) {
      if (seen.has(s.guardId)) continue
      seen.add(s.guardId)

      const att = attByGuard.get(s.guardId)
      const ping = pingByGuard.get(s.guardId)

      result.push({
        shiftId: s.shiftId,
        siteId: s.siteId,
        siteName: s.siteName,
        guardId: s.guardId,
        guardName: s.guardName,
        guardUsername: s.guardUsername,
        shiftStatus: s.shiftStatus,
        shiftStartsAt: s.shiftStartsAt,
        shiftEndsAt: s.shiftEndsAt,
        attendanceId: att?.id ?? null,
        lastCheckInAt: att?.verified_at ?? null,
        lastCheckInType: att?.type ?? null,
        selfieUrl: att?.selfie_url ?? null,
        livenessScore: att?.liveness_score ?? null,
        isWithinGeofence: att?.is_within_geofence ?? null,
        selfieReviewStatus: att?.selfie_review_status ?? null,
        lastPingAt: ping?.recorded_at ?? null,
        lastLat: ping?.latitude ?? null,
        lastLng: ping?.longitude ?? null,
        battery: ping?.battery ?? null,
        accuracy: ping?.accuracy ?? null,
        isOnline: ping ? new Date(ping.recorded_at) > oneHourAgo : false,
      })
    }

    return reply.send({ data: result })
  })

  // GET /api/guard-status/missing
  //
  // Guards whose shift window is open right now but they haven't checked in
  // (status still 'scheduled' or already 'missed'). Supervisor sees only the
  // shifts at sites they cover; tenant_admin / platform_admin see all shifts
  // in their tenant. Each row carries the assigned supervisor (if any) and
  // the site so the admin can drill in.
  fastify.get('/missing', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const now = new Date()

    const supervisorSiteIds = await getSupervisorSiteIds(payload.sub, payload.role)

    const conditions = [
      eq(shifts.tenantId, payload.tenantId),
      lte(shifts.startsAt, now),
      gte(shifts.endsAt, now),
      ne(shifts.status, 'active'),
      ne(shifts.status, 'completed'),
    ]
    if (supervisorSiteIds !== null) {
      if (supervisorSiteIds.length === 0) return reply.send({ data: [] })
      conditions.push(inArray(shifts.siteId, supervisorSiteIds))
    }

    const rows = await db
      .select({
        shiftId: shifts.id,
        siteId: shifts.siteId,
        siteName: sites.name,
        guardId: shifts.guardId,
        guardName: users.name,
        guardUsername: users.username,
        shiftStatus: shifts.status,
        shiftStartsAt: shifts.startsAt,
        shiftEndsAt: shifts.endsAt,
      })
      .from(shifts)
      .innerJoin(sites, eq(shifts.siteId, sites.id))
      .innerJoin(users, eq(shifts.guardId, users.id))
      .where(and(...conditions))
      .orderBy(shifts.startsAt)

    if (rows.length === 0) return reply.send({ data: [] })

    // Pull the supervisor(s) assigned to each affected site in one query.
    const affectedSiteIds = [...new Set(rows.map((r) => r.siteId))]
    const supervisorRows = await db
      .select({
        siteId: supervisorSites.siteId,
        supervisorId: users.id,
        supervisorName: users.name,
        supervisorUsername: users.username,
      })
      .from(supervisorSites)
      .innerJoin(users, eq(supervisorSites.supervisorId, users.id))
      .where(inArray(supervisorSites.siteId, affectedSiteIds))

    // First supervisor per site wins for the headline display; the full list
    // is still in `supervisors[]` for the detail view.
    const supByStorageSite = new Map<string, { id: string; name: string; username: string }[]>()
    for (const s of supervisorRows) {
      const list = supByStorageSite.get(s.siteId) ?? []
      list.push({ id: s.supervisorId, name: s.supervisorName, username: s.supervisorUsername })
      supByStorageSite.set(s.siteId, list)
    }

    const data = rows.map((r) => {
      const sups = supByStorageSite.get(r.siteId) ?? []
      return {
        shiftId: r.shiftId,
        guardId: r.guardId,
        guardName: r.guardName,
        guardUsername: r.guardUsername,
        siteId: r.siteId,
        siteName: r.siteName,
        shiftStatus: r.shiftStatus,
        shiftStartsAt: r.shiftStartsAt,
        shiftEndsAt: r.shiftEndsAt,
        minutesLate: Math.max(0, Math.floor((now.getTime() - new Date(r.shiftStartsAt).getTime()) / 60000)),
        supervisor: sups[0] ?? null,
        supervisors: sups,
      }
    })

    return reply.send({ data })
  })
}
