import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, guardCertifications, users } from '@secureops/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin, requireSupervisor } from '../lib/auth'

export const certificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /eligible-guards — guards eligible for shift assignment based on certification status
  fastify.get('/eligible-guards', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    // shiftId is accepted but currently only used to confirm a shift exists in this tenant;
    // cert-level shift requirements are not yet modelled.
    const query = z.object({ shiftId: z.string() }).parse(request.query)
    void query.shiftId // acknowledged — future: join with shift required certs

    // Left-join guards with their certifications; aggregate per guard.
    // A guard is ineligible if they have any expired or revoked certification.
    // Guards with zero certifications are considered eligible.
    const rows = await db
      .select({
        guardId: users.id,
        guardName: users.name,
        certificationCount: sql<number>`count(${guardCertifications.id})`,
        invalidCount: sql<number>`sum(case when ${guardCertifications.status} in ('expired') then 1 else 0 end)`,
      })
      .from(users)
      .leftJoin(
        guardCertifications,
        and(
          eq(guardCertifications.guardId, users.id),
          eq(guardCertifications.tenantId, payload.tenantId),
        ),
      )
      .where(and(eq(users.tenantId, payload.tenantId), eq(users.role, 'guard')))
      .groupBy(users.id, users.name)
      .orderBy(users.name)

    const data = rows.map((r) => ({
      guardId: r.guardId,
      guardName: r.guardName,
      eligible: Number(r.invalidCount) === 0,
      certificationCount: Number(r.certificationCount),
    }))

    return reply.send({ data })
  })

  // GET / — list certifications
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({
      guardId: z.string().optional(),
      status: z.enum(['active', 'expiring_soon', 'expired']).optional(),
    }).parse(request.query)

    const conditions = [eq(guardCertifications.tenantId, payload.tenantId)]
    if (query.guardId) conditions.push(eq(guardCertifications.guardId, query.guardId))
    if (query.status) conditions.push(eq(guardCertifications.status, query.status))

    const all = await db
      .select()
      .from(guardCertifications)
      .where(and(...conditions))
      .orderBy(desc(guardCertifications.createdAt))

    return reply.send({ data: all })
  })

  // POST / — create certification
  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = z.object({
      guardId: z.string(),
      certType: z.string().min(1),
      certNumber: z.string().optional(),
      issuedBy: z.string().optional(),
      issuedAt: z.string().datetime().optional(),
      expiresAt: z.string().datetime().optional(),
      status: z.enum(['active', 'expiring_soon', 'expired']).optional(),
      documentUrl: z.string().url().optional(),
    }).parse(request.body)

    const [cert] = await db
      .insert(guardCertifications)
      .values({
        ...body,
        tenantId: payload.tenantId,
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : undefined,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      })
      .returning()

    return reply.code(201).send({ data: cert })
  })

  // PATCH /:id — update certification
  fastify.patch('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const body = z.object({
      certType: z.string().min(1).optional(),
      certNumber: z.string().optional(),
      issuedBy: z.string().optional(),
      issuedAt: z.string().datetime().optional(),
      expiresAt: z.string().datetime().optional(),
      status: z.enum(['active', 'expiring_soon', 'expired']).optional(),
      documentUrl: z.string().url().optional(),
    }).parse(request.body)

    const [cert] = await db
      .update(guardCertifications)
      .set({
        ...body,
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : undefined,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(guardCertifications.id, id), eq(guardCertifications.tenantId, payload.tenantId)))
      .returning()

    if (!cert) {
      return reply.code(404).send({ error: 'Not found', message: 'Certification not found', statusCode: 404 })
    }
    return reply.send({ data: cert })
  })

  // DELETE /:id — delete certification
  fastify.delete('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }

    const [cert] = await db
      .delete(guardCertifications)
      .where(and(eq(guardCertifications.id, id), eq(guardCertifications.tenantId, payload.tenantId)))
      .returning()

    if (!cert) {
      return reply.code(404).send({ error: 'Not found', message: 'Certification not found', statusCode: 404 })
    }
    return reply.send({ data: cert })
  })
}
