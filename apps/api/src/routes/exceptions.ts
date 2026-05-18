import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, shiftExceptions } from '@secureops/db'
import { eq, and, desc, gte } from 'drizzle-orm'
import { requireSupervisor } from '../lib/auth'

export const exceptionsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — list exceptions
  fastify.get('/', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({
      guardId: z.string().optional(),
      shiftId: z.string().optional(),
      code: z.enum(['missed_punch', 'late_in', 'early_out', 'long_break', 'absent', 'overtime', 'no_show', 'unauthorized_absence']).optional(),
      from: z.string().optional(),
      limit: z.coerce.number().default(50),
    }).parse(request.query)

    const conditions = [eq(shiftExceptions.tenantId, payload.tenantId)]
    if (query.guardId) conditions.push(eq(shiftExceptions.guardId, query.guardId))
    if (query.shiftId) conditions.push(eq(shiftExceptions.shiftId, query.shiftId))
    if (query.code) conditions.push(eq(shiftExceptions.code, query.code))
    if (query.from) conditions.push(gte(shiftExceptions.createdAt, new Date(query.from)))

    const all = await db
      .select()
      .from(shiftExceptions)
      .where(and(...conditions))
      .orderBy(desc(shiftExceptions.createdAt))
      .limit(query.limit)

    return reply.send({ data: all })
  })

  // POST / — create exception
  fastify.post('/', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = z.object({
      shiftId: z.string(),
      guardId: z.string(),
      code: z.enum(['missed_punch', 'late_in', 'early_out', 'long_break', 'absent', 'overtime', 'no_show', 'unauthorized_absence']),
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      description: z.string().optional(),
    }).parse(request.body)

    const [exception] = await db
      .insert(shiftExceptions)
      .values({
        ...body,
        tenantId: payload.tenantId,
      })
      .returning()

    return reply.code(201).send({ data: exception })
  })

  // PATCH /:id/resolve — resolve an exception
  fastify.patch('/:id/resolve', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string }
    const body = z.object({
      resolutionNote: z.string().optional(),
    }).parse(request.body)

    const [exception] = await db
      .update(shiftExceptions)
      .set({
        resolutionNote: body.resolutionNote,
        resolvedBy: payload.sub,
        resolvedAt: new Date(),
      })
      .where(and(eq(shiftExceptions.id, id), eq(shiftExceptions.tenantId, payload.tenantId)))
      .returning()

    if (!exception) {
      return reply.code(404).send({ error: 'Not found', message: 'Exception not found', statusCode: 404 })
    }
    return reply.send({ data: exception })
  })
}
