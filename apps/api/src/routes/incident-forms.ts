import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, incidentFormTemplates, incidentFormResponses } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth, requireSupervisor } from '../lib/auth'

const fieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'select', 'checkbox', 'textarea']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
})

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(fieldSchema),
})

export const incidentFormsRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Templates ────────────────────────────────────────────────────────────

  fastify.get('/templates', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const rows = await db
      .select()
      .from(incidentFormTemplates)
      .where(eq(incidentFormTemplates.tenantId, tenantId))
      .orderBy(desc(incidentFormTemplates.createdAt))
    return reply.send({ data: rows })
  })

  fastify.post('/templates', { preHandler: requireSupervisor }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = createTemplateSchema.parse(request.body)
    const [template] = await db
      .insert(incidentFormTemplates)
      .values({ ...body, tenantId, description: body.description ?? null })
      .returning()
    return reply.code(201).send({ data: template })
  })

  fastify.patch('/templates/:id', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as { tenantId: string }
    const body = createTemplateSchema.partial().parse(request.body)
    const [template] = await db
      .update(incidentFormTemplates)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(incidentFormTemplates.id, id), eq(incidentFormTemplates.tenantId, tenantId)))
      .returning()
    if (!template) return reply.code(404).send({ error: 'Not found', message: 'Template not found', statusCode: 404 })
    return reply.send({ data: template })
  })

  fastify.delete('/templates/:id', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as { tenantId: string }
    // Soft delete — set active = false
    const [template] = await db
      .update(incidentFormTemplates)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(incidentFormTemplates.id, id), eq(incidentFormTemplates.tenantId, tenantId)))
      .returning()
    if (!template) return reply.code(404).send({ error: 'Not found', message: 'Template not found', statusCode: 404 })
    return reply.send({ data: { ok: true } })
  })

  // ── Responses ────────────────────────────────────────────────────────────

  fastify.get('/responses', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { incidentId } = z.object({ incidentId: z.string() }).parse(request.query)
    const rows = await db
      .select()
      .from(incidentFormResponses)
      .where(and(eq(incidentFormResponses.tenantId, tenantId), eq(incidentFormResponses.incidentId, incidentId)))
      .orderBy(desc(incidentFormResponses.submittedAt))
    return reply.send({ data: rows })
  })

  fastify.post('/responses', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = z.object({
      incidentId: z.string(),
      templateId: z.string(),
      responses: z.record(z.unknown()),
    }).parse(request.body)
    const [response] = await db
      .insert(incidentFormResponses)
      .values({
        tenantId: payload.tenantId,
        incidentId: body.incidentId,
        templateId: body.templateId,
        submittedBy: payload.sub,
        responses: body.responses,
      })
      .returning()
    return reply.code(201).send({ data: response })
  })
}
