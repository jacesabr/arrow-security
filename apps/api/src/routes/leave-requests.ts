import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, leaveRequests, supervisorSites, shifts, users } from '@secureops/db'
import { eq, and, or, desc, gte, inArray } from 'drizzle-orm'
import { requireAuth, requireSupervisor, getSupervisorGuardIds } from '../lib/auth'

export const leaveRequestsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — list leave requests
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const query = z.object({
      guardId: z.string().optional(),
      supervisorId: z.string().optional(), // admin filter
      status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
      from: z.string().optional(),
    }).parse(request.query)

    const conditions = [eq(leaveRequests.tenantId, payload.tenantId)]

    if (payload.role === 'guard') {
      // Guard sees only their own requests
      conditions.push(eq(leaveRequests.guardId, payload.sub))
    } else if (payload.role === 'supervisor') {
      // Supervisor sees their team's requests + their own
      const teamIds = await getSupervisorGuardIds(payload.sub, payload.role) ?? []
      const scopeIds = [...new Set([...teamIds, payload.sub])]
      if (query.guardId) {
        if (!scopeIds.includes(query.guardId)) return reply.send({ data: [] })
        conditions.push(eq(leaveRequests.guardId, query.guardId))
      } else {
        conditions.push(inArray(leaveRequests.guardId, scopeIds))
      }
    } else {
      // Admin / platform_admin — optional filter dropdowns
      if (query.guardId) conditions.push(eq(leaveRequests.guardId, query.guardId))
      if (query.supervisorId) {
        // Resolve supervisor → guards who've worked their sites
        const siteRows = await db
          .select({ siteId: supervisorSites.siteId })
          .from(supervisorSites)
          .where(eq(supervisorSites.supervisorId, query.supervisorId))
        const siteIds = siteRows.map(r => r.siteId)
        if (siteIds.length === 0) return reply.send({ data: [] })
        const guardRows = await db
          .selectDistinct({ guardId: shifts.guardId })
          .from(shifts)
          .where(inArray(shifts.siteId, siteIds))
        const guardIds = guardRows.map(r => r.guardId)
        if (guardIds.length === 0) return reply.send({ data: [] })
        // Filter doesn't include supervisor themselves — admin is filtering by
        // "this supervisor's team", so adding the supervisor's own row would
        // muddy the answer. Admins after a supervisor's own request can use
        // ?guardId=<supervisorId> directly.
        conditions.push(inArray(leaveRequests.guardId, guardIds))
      }
    }

    if (query.status) conditions.push(eq(leaveRequests.status, query.status))
    if (query.from) conditions.push(gte(leaveRequests.startDate, new Date(query.from)))

    // Join users so the supervisor view shows whose request it is without an
    // extra round trip. Spread the leave-request row keys so existing consumers
    // (guards) don't notice the join.
    const rows = await db
      .select({
        leave: leaveRequests,
        guardName: users.name,
        guardUsername: users.username,
      })
      .from(leaveRequests)
      .leftJoin(users, eq(users.id, leaveRequests.guardId))
      .where(and(...conditions))
      .orderBy(desc(leaveRequests.createdAt))

    return reply.send({
      data: rows.map((r) => ({ ...r.leave, guardName: r.guardName, guardUsername: r.guardUsername })),
    })
  })

  // POST / — guard submits leave request
  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = z.object({
      leaveType: z.enum(['casual', 'sick', 'earned', 'unpaid']).optional(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      reason: z.string().optional(),
    }).parse(request.body)

    const [request_] = await db
      .insert(leaveRequests)
      .values({
        ...body,
        tenantId: payload.tenantId,
        guardId: payload.sub,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
      })
      .returning()

    return reply.code(201).send({ data: request_ })
  })

  // PATCH /:id/review — supervisor reviews a leave request
  fastify.patch('/:id/review', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const body = z.object({
      status: z.enum(['approved', 'rejected']),
      reviewNote: z.string().optional(),
    }).parse(request.body)

    // Supervisors can only review leave from guards at their sites
    if (payload.role === 'supervisor') {
      const [existing] = await db
        .select({ guardId: leaveRequests.guardId })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, payload.tenantId)))
        .limit(1)
      if (!existing) {
        return reply.code(404).send({ error: 'Not found', message: 'Leave request not found', statusCode: 404 })
      }
      const allowed = await getSupervisorGuardIds(payload.sub, payload.role)
      if (!allowed || !allowed.includes(existing.guardId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Guard not at your site', statusCode: 403 })
      }
    }

    const [leaveRequest] = await db
      .update(leaveRequests)
      .set({
        status: body.status,
        reviewNote: body.reviewNote,
        reviewedBy: payload.sub,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, payload.tenantId)))
      .returning()

    if (!leaveRequest) {
      return reply.code(404).send({ error: 'Not found', message: 'Leave request not found', statusCode: 404 })
    }
    return reply.send({ data: leaveRequest })
  })

  // PATCH /:id/cancel — guard cancels their own pending request
  fastify.patch('/:id/cancel', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string }

    // Fetch the request to validate ownership and status
    const [existing] = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, payload.tenantId)))
      .limit(1)

    if (!existing) {
      return reply.code(404).send({ error: 'Not found', message: 'Leave request not found', statusCode: 404 })
    }
    if (existing.guardId !== payload.sub) {
      return reply.code(403).send({ error: 'Forbidden', message: 'You can only cancel your own leave requests', statusCode: 403 })
    }
    if (existing.status !== 'pending') {
      return reply.code(409).send({ error: 'Conflict', message: 'Only pending leave requests can be cancelled', statusCode: 409 })
    }

    const [updated] = await db
      .update(leaveRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(leaveRequests.id, id))
      .returning()

    return reply.send({ data: updated })
  })
}
