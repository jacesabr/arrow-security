import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, supervisorSites, users } from '@secureops/db'
import { eq, and } from 'drizzle-orm'
import { requireTenantAdmin, requireSupervisor } from '../lib/auth'

export const supervisorSitesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /supervisor-sites/:supervisorId — list sites assigned to a supervisor
  fastify.get('/:supervisorId', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const { supervisorId } = request.params as { supervisorId: string }

    // Verify the supervisor belongs to this tenant
    const [sup] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, supervisorId), eq(users.tenantId, payload.tenantId)))
      .limit(1)
    if (!sup) return reply.code(404).send({ error: 'Not found', message: 'Supervisor not found', statusCode: 404 })

    const rows = await db
      .select({ siteId: supervisorSites.siteId, assignedAt: supervisorSites.assignedAt })
      .from(supervisorSites)
      .where(eq(supervisorSites.supervisorId, supervisorId))

    return reply.send({ data: rows })
  })

  // POST /supervisor-sites — assign supervisor to sites
  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const { supervisorId, siteIds } = z.object({
      supervisorId: z.string(),
      siteIds: z.array(z.string()).min(1),
    }).parse(request.body)

    // Verify supervisor belongs to tenant
    const [sup] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, supervisorId), eq(users.tenantId, payload.tenantId)))
      .limit(1)
    if (!sup) return reply.code(404).send({ error: 'Not found', message: 'Supervisor not found', statusCode: 404 })

    await db
      .insert(supervisorSites)
      .values(siteIds.map((siteId) => ({ supervisorId, siteId })))
      .onConflictDoNothing()

    return reply.code(201).send({ data: { supervisorId, siteIds } })
  })

  // DELETE /supervisor-sites/:supervisorId/:siteId — remove assignment
  fastify.delete('/:supervisorId/:siteId', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { supervisorId, siteId } = request.params as { supervisorId: string; siteId: string }
    const payload = request.user as { tenantId: string }

    const [sup] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, supervisorId), eq(users.tenantId, payload.tenantId)))
      .limit(1)
    if (!sup) return reply.code(404).send({ error: 'Not found', message: 'Supervisor not found', statusCode: 404 })

    await db
      .delete(supervisorSites)
      .where(and(eq(supervisorSites.supervisorId, supervisorId), eq(supervisorSites.siteId, siteId)))
    return reply.send({ data: { message: 'Removed' } })
  })

  // GET /supervisor-sites/by-site/:siteId — supervisors assigned to a site.
  // Used by /sites/[id] when an admin is confirming a pending site so they
  // can see + adjust which supervisors cover it.
  fastify.get('/by-site/:siteId', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const { siteId } = request.params as { siteId: string }

    const rows = await db
      .select({
        supervisorId: supervisorSites.supervisorId,
        assignedAt: supervisorSites.assignedAt,
        name: users.name,
        username: users.username,
      })
      .from(supervisorSites)
      .innerJoin(users, eq(supervisorSites.supervisorId, users.id))
      .where(and(eq(supervisorSites.siteId, siteId), eq(users.tenantId, payload.tenantId)))

    return reply.send({ data: rows })
  })

  // GET /supervisor-sites/my-sites — supervisor sees their own assigned sites
  fastify.get('/my-sites', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { sub: string; role: string }
    if (payload.role !== 'supervisor') return reply.send({ data: [] })
    const rows = await db
      .select({ siteId: supervisorSites.siteId })
      .from(supervisorSites)
      .where(eq(supervisorSites.supervisorId, payload.sub))
    return reply.send({ data: rows.map((r) => r.siteId) })
  })
}
