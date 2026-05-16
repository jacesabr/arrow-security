import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, shifts } from '@secureops/db'
import { eq, and, gte, lte } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin } from '../lib/auth'

export const shiftsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const query = z.object({
      guardId: z.string().optional(),
      siteId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(request.query)

    const conditions = [eq(shifts.tenantId, payload.tenantId)]
    if (payload.role === 'guard') conditions.push(eq(shifts.guardId, payload.sub))
    else if (query.guardId) conditions.push(eq(shifts.guardId, query.guardId))
    if (query.siteId) conditions.push(eq(shifts.siteId, query.siteId))
    if (query.from) conditions.push(gte(shifts.startsAt, new Date(query.from)))
    if (query.to) conditions.push(lte(shifts.endsAt, new Date(query.to)))

    const all = await db.select().from(shifts).where(and(...conditions)).orderBy(shifts.startsAt)
    return reply.send({ data: all })
  })

  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = z.object({
      siteId: z.string(),
      guardId: z.string(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      notes: z.string().optional(),
    }).parse(request.body)

    const [shift] = await db
      .insert(shifts)
      .values({ ...body, tenantId: payload.tenantId, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) })
      .returning()

    return reply.code(201).send({ data: shift })
  })

  fastify.patch('/:id/status', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const { status } = z.object({
      status: z.enum(['scheduled', 'active', 'completed', 'missed']),
    }).parse(request.body)

    const [shift] = await db
      .update(shifts)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(shifts.id, id), eq(shifts.tenantId, payload.tenantId)))
      .returning()

    if (!shift) return reply.code(404).send({ error: 'Not found', message: 'Shift not found', statusCode: 404 })
    return reply.send({ data: shift })
  })
}
