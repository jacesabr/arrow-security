import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, postOrders, postOrderAcks } from '@secureops/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { requireAuth, requireSupervisor, requireTenantAdmin } from '../lib/auth'

export const postOrdersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — list post orders for site
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({
      siteId: z.string().optional(),
    }).parse(request.query)

    const conditions = [eq(postOrders.tenantId, payload.tenantId)]
    if (query.siteId) conditions.push(eq(postOrders.siteId, query.siteId))

    const all = await db
      .select()
      .from(postOrders)
      .where(and(...conditions))
      .orderBy(desc(postOrders.createdAt))

    return reply.send({ data: all })
  })

  // POST / — create post order
  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = z.object({
      siteId: z.string(),
      title: z.string().min(1),
      content: z.string().min(1),
      version: z.string().optional(),
      isActive: z.boolean().optional(),
      requiresAck: z.boolean().optional(),
    }).parse(request.body)

    const [order] = await db
      .insert(postOrders)
      .values({
        ...body,
        tenantId: payload.tenantId,
        createdBy: payload.sub,
      })
      .returning()

    return reply.code(201).send({ data: order })
  })

  // GET /:id — get single post order with ack stats
  fastify.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }

    const [order] = await db
      .select()
      .from(postOrders)
      .where(and(eq(postOrders.id, id), eq(postOrders.tenantId, payload.tenantId)))
      .limit(1)

    if (!order) {
      return reply.code(404).send({ error: 'Not found', message: 'Post order not found', statusCode: 404 })
    }

    const [ackStats] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postOrderAcks)
      .where(and(eq(postOrderAcks.postOrderId, id), eq(postOrderAcks.tenantId, payload.tenantId)))

    return reply.send({ data: { ...order, ackCount: ackStats?.count ?? 0 } })
  })

  // PATCH /:id — update post order
  fastify.patch('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const body = z.object({
      title: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      version: z.string().optional(),
      isActive: z.boolean().optional(),
      requiresAck: z.boolean().optional(),
    }).parse(request.body)

    const [order] = await db
      .update(postOrders)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(postOrders.id, id), eq(postOrders.tenantId, payload.tenantId)))
      .returning()

    if (!order) {
      return reply.code(404).send({ error: 'Not found', message: 'Post order not found', statusCode: 404 })
    }
    return reply.send({ data: order })
  })

  // POST /:id/ack — guard acknowledges a post order
  fastify.post('/:id/ack', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string }
    const body = z.object({
      shiftId: z.string().optional(),
    }).parse(request.body)

    // Verify post order exists in tenant
    const [order] = await db
      .select()
      .from(postOrders)
      .where(and(eq(postOrders.id, id), eq(postOrders.tenantId, payload.tenantId)))
      .limit(1)

    if (!order) {
      return reply.code(404).send({ error: 'Not found', message: 'Post order not found', statusCode: 404 })
    }

    const [ack] = await db
      .insert(postOrderAcks)
      .values({
        tenantId: payload.tenantId,
        postOrderId: id,
        guardId: payload.sub,
        shiftId: body.shiftId,
      })
      .returning()

    return reply.code(201).send({ data: ack })
  })

  // GET /:id/acks — list acknowledgements for a post order
  fastify.get('/:id/acks', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }

    // Verify post order exists in tenant
    const [order] = await db
      .select()
      .from(postOrders)
      .where(and(eq(postOrders.id, id), eq(postOrders.tenantId, payload.tenantId)))
      .limit(1)

    if (!order) {
      return reply.code(404).send({ error: 'Not found', message: 'Post order not found', statusCode: 404 })
    }

    const acks = await db
      .select()
      .from(postOrderAcks)
      .where(and(eq(postOrderAcks.postOrderId, id), eq(postOrderAcks.tenantId, payload.tenantId)))
      .orderBy(desc(postOrderAcks.ackedAt))

    return reply.send({ data: acks })
  })
}
