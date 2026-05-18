import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, guardLocations } from '@secureops/db'
import { eq, and, desc, gte } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'
import { redisPublisher, createSubscriber } from '../lib/redis'
import { latLngToCell } from 'h3-js'

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
