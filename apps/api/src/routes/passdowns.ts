import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, passdowns } from '@secureops/db'
import { eq, and, desc, gte } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'

export const passdownsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — list passdowns
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({
      siteId: z.string().optional(),
      from: z.string().optional(),
      limit: z.coerce.number().default(50),
    }).parse(request.query)

    const conditions = [eq(passdowns.tenantId, payload.tenantId)]
    if (query.siteId) conditions.push(eq(passdowns.siteId, query.siteId))
    if (query.from) conditions.push(gte(passdowns.createdAt, new Date(query.from)))

    const all = await db
      .select()
      .from(passdowns)
      .where(and(...conditions))
      .orderBy(desc(passdowns.createdAt))
      .limit(query.limit)

    return reply.send({ data: all })
  })

  // POST / — create passdown
  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = z.object({
      siteId: z.string(),
      toGuardId: z.string().optional(),
      fromShiftId: z.string().optional(),
      notes: z.string().min(1),
    }).parse(request.body)

    const [passdown] = await db
      .insert(passdowns)
      .values({
        ...body,
        tenantId: payload.tenantId,
        fromGuardId: payload.sub,
      })
      .returning()

    return reply.code(201).send({ data: passdown })
  })
}
