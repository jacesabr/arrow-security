import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, panicEvents } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth, requireSupervisor } from '../lib/auth'
import { redisPublisher } from '../lib/redis'

const triggerSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
  shiftId: z.string().optional(),
})

export const panicRoutes: FastifyPluginAsync = async (fastify) => {
  // Guard triggers panic
  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = triggerSchema.parse(request.body)

    const [event] = await db
      .insert(panicEvents)
      .values({
        tenantId: payload.tenantId,
        guardId: payload.sub,
        shiftId: body.shiftId ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        accuracy: body.accuracy ?? null,
      })
      .returning()

    // Broadcast to SSE clients for this tenant
    const broadcast = JSON.stringify({
      type: 'panic',
      panicId: event.id,
      guardId: payload.sub,
      lat: body.latitude ?? null,
      lng: body.longitude ?? null,
      ts: event.triggeredAt,
    })
    try {
      await redisPublisher.publish(`sse:${payload.tenantId}`, broadcast)
    } catch { /* Redis unavailable */ }

    return reply.code(201).send({ data: event })
  })

  // List active panics
  fastify.get('/', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const events = await db
      .select()
      .from(panicEvents)
      .where(eq(panicEvents.tenantId, payload.tenantId))
      .orderBy(desc(panicEvents.triggeredAt))
      .limit(50)
    return reply.send({ data: events })
  })

  // Acknowledge panic
  fastify.patch('/:id/acknowledge', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string }
    const [event] = await db
      .update(panicEvents)
      .set({ status: 'acknowledged', acknowledgedBy: payload.sub, acknowledgedAt: new Date() })
      .where(and(eq(panicEvents.id, id), eq(panicEvents.tenantId, payload.tenantId)))
      .returning()
    if (!event) return reply.code(404).send({ error: 'Not found', message: 'Panic event not found', statusCode: 404 })
    return reply.send({ data: event })
  })

  // Resolve panic
  fastify.patch('/:id/resolve', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string }
    const { notes } = z.object({ notes: z.string().optional() }).parse(request.body)
    const [event] = await db
      .update(panicEvents)
      .set({ status: 'resolved', resolvedBy: payload.sub, resolvedAt: new Date(), notes: notes ?? null })
      .where(and(eq(panicEvents.id, id), eq(panicEvents.tenantId, payload.tenantId)))
      .returning()
    if (!event) return reply.code(404).send({ error: 'Not found', message: 'Panic event not found', statusCode: 404 })
    return reply.send({ data: event })
  })
}
