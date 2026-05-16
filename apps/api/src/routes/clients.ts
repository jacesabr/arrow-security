import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, clients } from '@secureops/db'
import { eq, and } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin } from '../lib/auth'

export const clientsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const all = await db.select().from(clients).where(eq(clients.tenantId, payload.tenantId)).orderBy(clients.name)
    return reply.send({ data: all })
  })

  fastify.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const [client] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.tenantId, payload.tenantId))).limit(1)
    if (!client) return reply.code(404).send({ error: 'Not found', message: 'Client not found', statusCode: 404 })
    return reply.send({ data: client })
  })

  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = z.object({
      name: z.string().min(2),
      contactName: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
    }).parse(request.body)

    const [client] = await db.insert(clients).values({ ...body, tenantId: payload.tenantId }).returning()
    return reply.code(201).send({ data: client })
  })

  fastify.patch('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const body = z.object({
      name: z.string().min(2).optional(),
      contactName: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
    }).parse(request.body)

    const [client] = await db
      .update(clients)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.tenantId, payload.tenantId)))
      .returning()

    if (!client) return reply.code(404).send({ error: 'Not found', message: 'Client not found', statusCode: 404 })
    return reply.send({ data: client })
  })
}
