import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, patrols } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'

export const patrolRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Patrols ────────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const query = z.object({
      siteId: z.string().optional(),
      status: z.enum(['in_progress', 'completed']).optional(),
      limit: z.coerce.number().default(50),
    }).parse(request.query)

    const conditions = [eq(patrols.tenantId, payload.tenantId)]
    if (payload.role === 'guard') conditions.push(eq(patrols.guardId, payload.sub))
    if (query.siteId) conditions.push(eq(patrols.siteId, query.siteId))
    if (query.status) conditions.push(eq(patrols.status, query.status))

    const all = await db.select().from(patrols).where(and(...conditions)).orderBy(desc(patrols.startedAt)).limit(query.limit)
    return reply.send({ data: all })
  })

  fastify.post('/start', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = z.object({ siteId: z.string(), shiftId: z.string().optional() }).parse(request.body)
    const [patrol] = await db
      .insert(patrols)
      .values({ ...body, tenantId: payload.tenantId, guardId: payload.sub })
      .returning()
    return reply.code(201).send({ data: patrol })
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
