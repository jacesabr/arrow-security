import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, auditLog } from '@secureops/db'
import { eq, and, desc, gte } from 'drizzle-orm'
import { requireTenantAdmin } from '../lib/auth'

export const auditLogRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({
      userId: z.string().optional(),
      action: z.string().optional(),
      resourceType: z.string().optional(),
      since: z.string().optional(),
      limit: z.coerce.number().default(100).transform(n => Math.min(n, 500)),
    }).parse(request.query)

    const conditions = [eq(auditLog.tenantId, payload.tenantId)]
    if (query.userId) conditions.push(eq(auditLog.userId, query.userId))
    if (query.action) conditions.push(eq(auditLog.action, query.action))
    if (query.resourceType) conditions.push(eq(auditLog.resourceType, query.resourceType))
    if (query.since) conditions.push(gte(auditLog.createdAt, new Date(query.since)))

    const rows = await db.select().from(auditLog).where(and(...conditions))
      .orderBy(desc(auditLog.createdAt)).limit(query.limit)

    return reply.send({ data: rows })
  })
}
