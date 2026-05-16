import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, tenants } from '@secureops/db'
import { eq } from 'drizzle-orm'
import { requirePlatformAdmin } from '../lib/auth'

const createTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  tier: z.enum(['bronze', 'silver', 'gold']).default('bronze'),
  frappeSiteUrl: z.string().url(),
  zammadUrl: z.string().url(),
  novuAppId: z.string().optional(),
  minioBucket: z.string().optional(),
  compreFaceAppKey: z.string().optional(),
})

export const tenantsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requirePlatformAdmin }, async (_request, reply) => {
    const all = await db.select().from(tenants).orderBy(tenants.createdAt)
    return reply.send({ data: all })
  })

  fastify.get('/:id', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
    if (!tenant) return reply.code(404).send({ error: 'Not found', message: 'Tenant not found', statusCode: 404 })
    return reply.send({ data: tenant })
  })

  fastify.post('/', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const body = createTenantSchema.parse(request.body)
    const [tenant] = await db.insert(tenants).values(body).returning()
    return reply.code(201).send({ data: tenant })
  })

  fastify.patch('/:id/status', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = z.object({ status: z.enum(['trial', 'active', 'suspended']) }).parse(request.body)
    const [tenant] = await db.update(tenants).set({ status, updatedAt: new Date() }).where(eq(tenants.id, id)).returning()
    if (!tenant) return reply.code(404).send({ error: 'Not found', message: 'Tenant not found', statusCode: 404 })
    return reply.send({ data: tenant })
  })
}
