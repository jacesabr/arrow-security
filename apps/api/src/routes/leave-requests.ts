import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, leaveRequests } from '@secureops/db'
import { eq, and, desc, gte, inArray } from 'drizzle-orm'
import { requireAuth, requireSupervisor, getSupervisorGuardIds } from '../lib/auth'

export const leaveRequestsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — list leave requests
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const query = z.object({
      guardId: z.string().optional(),
      status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
      from: z.string().optional(),
    }).parse(request.query)

    const conditions = [eq(leaveRequests.tenantId, payload.tenantId)]

    // Guards can only see their own requests
    if (payload.role === 'guard') {
      conditions.push(eq(leaveRequests.guardId, payload.sub))
    } else if (payload.role === 'supervisor') {
      // Supervisors only see requests from guards at their sites
      const guardIds = await getSupervisorGuardIds(payload.sub, payload.role)
      if (!guardIds || guardIds.length === 0) return reply.send({ data: [] })
      if (query.guardId) {
        if (!guardIds.includes(query.guardId)) return reply.send({ data: [] })
        conditions.push(eq(leaveRequests.guardId, query.guardId))
      } else {
        conditions.push(inArray(leaveRequests.guardId, guardIds))
      }
    } else if (query.guardId) {
      conditions.push(eq(leaveRequests.guardId, query.guardId))
    }

    if (query.status) conditions.push(eq(leaveRequests.status, query.status))
    if (query.from) conditions.push(gte(leaveRequests.startDate, new Date(query.from)))

    const all = await db
      .select()
      .from(leaveRequests)
      .where(and(...conditions))
      .orderBy(desc(leaveRequests.createdAt))

    return reply.send({ data: all })
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
