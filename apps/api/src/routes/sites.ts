import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, sites, shifts } from '@secureops/db'
import { eq, and, inArray } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin, getSupervisorSiteIds } from '../lib/auth'

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
    const payload = request.user as { tenantId: string; sub: string; role: string }

    let scopedSiteIds: string[] | null = null

    if (payload.role === 'guard') {
      const rows = await db
        .selectDistinct({ siteId: shifts.siteId })
        .from(shifts)
        .where(and(eq(shifts.tenantId, payload.tenantId), eq(shifts.guardId, payload.sub)))
      // Guards without any scheduled shifts can still pick from any tenant site
      // (the check-in flow auto-picks the nearest one by GPS).
      scopedSiteIds = rows.length > 0 ? rows.map((r) => r.siteId) : null
    } else {
      scopedSiteIds = await getSupervisorSiteIds(payload.sub, payload.role)
    }

    if (scopedSiteIds !== null && scopedSiteIds.length === 0) {
      return reply.send({ data: [] })
    }

    const conditions = [eq(sites.tenantId, payload.tenantId)]
    if (scopedSiteIds) conditions.push(inArray(sites.id, scopedSiteIds))

    const all = await db
      .select()
      .from(sites)
      .where(and(...conditions))
      .orderBy(sites.name)
    return reply.send({ data: all })
  })

  fastify.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string; role: string }

    const [site] = await db.select().from(sites).where(and(eq(sites.id, id), eq(sites.tenantId, payload.tenantId))).limit(1)
    if (!site) return reply.code(404).send({ error: 'Not found', message: 'Site not found', statusCode: 404 })

    // Authorise: supervisors must own this site; guards must be scheduled there
    if (payload.role === 'supervisor') {
      const allowed = await getSupervisorSiteIds(payload.sub, payload.role)
      if (!allowed || !allowed.includes(id)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not assigned to this site', statusCode: 403 })
      }
    } else if (payload.role === 'guard') {
      const [match] = await db
        .select({ id: shifts.id })
        .from(shifts)
        .where(and(eq(shifts.tenantId, payload.tenantId), eq(shifts.guardId, payload.sub), eq(shifts.siteId, id)))
        .limit(1)
      if (!match) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Not scheduled at this site', statusCode: 403 })
      }
    }

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
