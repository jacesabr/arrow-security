import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, checkpoints, patrols, patrolScans } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin } from '../lib/auth'

export const patrolRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Checkpoints ────────────────────────────────────────────────────────────
  fastify.get('/checkpoints', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({ siteId: z.string().optional() }).parse(request.query)
    const conditions = [eq(checkpoints.tenantId, payload.tenantId)]
    if (query.siteId) conditions.push(eq(checkpoints.siteId, query.siteId))
    const all = await db.select().from(checkpoints).where(and(...conditions))
    return reply.send({ data: all })
  })

  fastify.post('/checkpoints', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = z.object({
      siteId: z.string(),
      name: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      nfcTagId: z.string().optional(),
      orderInRoute: z.string().optional(),
    }).parse(request.body)

    const qrCode = `SOCP-${payload.tenantId.slice(0, 6)}-${body.siteId.slice(0, 6)}-${Date.now()}`
    const [cp] = await db.insert(checkpoints).values({ ...body, tenantId: payload.tenantId, qrCode }).returning()
    return reply.code(201).send({ data: cp })
  })

  // ── Patrols ────────────────────────────────────────────────────────────────
  fastify.post('/start', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = z.object({ siteId: z.string(), shiftId: z.string().optional() }).parse(request.body)
    const [patrol] = await db
      .insert(patrols)
      .values({ ...body, tenantId: payload.tenantId, guardId: payload.sub })
      .returning()
    return reply.code(201).send({ data: patrol })
  })

  fastify.post('/:patrolId/scan', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const { patrolId } = request.params as { patrolId: string }
    const body = z.object({
      checkpointId: z.string(),
      method: z.enum(['qr', 'nfc', 'manual']),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }).parse(request.body)

    const [scan] = await db
      .insert(patrolScans)
      .values({ ...body, patrolId, tenantId: payload.tenantId })
      .returning()

    return reply.code(201).send({ data: scan })
  })

  fastify.patch('/:patrolId/complete', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const { patrolId } = request.params as { patrolId: string }
    const [patrol] = await db
      .update(patrols)
      .set({ status: 'completed', completedAt: new Date() })
      .where(and(eq(patrols.id, patrolId), eq(patrols.tenantId, payload.tenantId)))
      .returning()
    if (!patrol) return reply.code(404).send({ error: 'Not found', message: 'Patrol not found', statusCode: 404 })
    return reply.send({ data: patrol })
  })
}
