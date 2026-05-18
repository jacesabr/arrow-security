import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, guardLocations } from '@secureops/db'
import { eq, and, desc, gte } from 'drizzle-orm'
import { requireAuth, requireSupervisor } from '../lib/auth'
import { redisPublisher, createSubscriber } from '../lib/redis'
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
    const payload = request.user as { tenantId: string }
    const tenantId = payload.tenantId

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
