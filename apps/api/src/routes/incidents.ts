import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, incidents } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth, requireSupervisor } from '../lib/auth'
import { SLA_HOURS } from '@secureops/shared'

const createIncidentSchema = z.object({
  siteId: z.string(),
  title: z.string().min(3),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  mediaUrls: z.array(z.string()).optional(),
})

export const incidentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; role: string }
    const query = z.object({
      status: z.string().optional(),
      severity: z.string().optional(),
      siteId: z.string().optional(),
      limit: z.coerce.number().default(50),
    }).parse(request.query)

    const conditions = [eq(incidents.tenantId, payload.tenantId)]
    if (query.siteId) conditions.push(eq(incidents.siteId, query.siteId))

    const all = await db
      .select()
      .from(incidents)
      .where(and(...conditions))
      .orderBy(desc(incidents.createdAt))
      .limit(query.limit)

    return reply.send({ data: all })
  })

  fastify.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const [incident] = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.id, id), eq(incidents.tenantId, payload.tenantId)))
      .limit(1)
    if (!incident) return reply.code(404).send({ error: 'Not found', message: 'Incident not found', statusCode: 404 })
    return reply.send({ data: incident })
  })

  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = createIncidentSchema.parse(request.body)

    const slaHours = SLA_HOURS[body.severity]
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000)

    const [incident] = await db
      .insert(incidents)
      .values({
        ...body,
        tenantId: payload.tenantId,
        reportedBy: payload.sub,
        slaDeadline,
      })
      .returning()

    return reply.code(201).send({ data: incident })
  })

  fastify.patch('/:id/status', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const { status } = z.object({
      status: z.enum(['open', 'acknowledged', 'in_progress', 'resolved', 'closed']),
    }).parse(request.body)

    const now = new Date()
    const updates: Record<string, unknown> = { status, updatedAt: now }
    if (status === 'acknowledged') updates.acknowledgedAt = now
    if (status === 'resolved') updates.resolvedAt = now
    if (status === 'closed') updates.closedAt = now

    const [incident] = await db
      .update(incidents)
      .set(updates)
      .where(and(eq(incidents.id, id), eq(incidents.tenantId, payload.tenantId)))
      .returning()

    if (!incident) return reply.code(404).send({ error: 'Not found', message: 'Incident not found', statusCode: 404 })
    return reply.send({ data: incident })
  })
}
