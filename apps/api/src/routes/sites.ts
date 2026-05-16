import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, sites } from '@secureops/db'
import { eq, and } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin } from '../lib/auth'

const createSiteSchema = z.object({
  clientId: z.string(),
  name: z.string().min(2),
  address: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  geofenceRadiusMeters: z.number().default(200),
  frigateUrl: z.string().url().optional(),
  go2rtcUrl: z.string().url().optional(),
})

export const sitesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; role: string }
    const all = await db
      .select()
      .from(sites)
      .where(payload.role === 'platform_admin' ? undefined : eq(sites.tenantId, payload.tenantId))
      .orderBy(sites.name)
    return reply.send({ data: all })
  })

  fastify.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; role: string }

    const conditions = payload.role === 'platform_admin'
      ? eq(sites.id, id)
      : and(eq(sites.id, id), eq(sites.tenantId, payload.tenantId))

    const [site] = await db.select().from(sites).where(conditions).limit(1)
    if (!site) return reply.code(404).send({ error: 'Not found', message: 'Site not found', statusCode: 404 })
    return reply.send({ data: site })
  })

  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = createSiteSchema.parse(request.body)
    const [site] = await db.insert(sites).values({ ...body, tenantId: payload.tenantId }).returning()
    return reply.code(201).send({ data: site })
  })

  fastify.patch('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const body = createSiteSchema.partial().parse(request.body)
    const [site] = await db
      .update(sites)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(sites.id, id), eq(sites.tenantId, payload.tenantId)))
      .returning()
    if (!site) return reply.code(404).send({ error: 'Not found', message: 'Site not found', statusCode: 404 })
    return reply.send({ data: site })
  })
}
