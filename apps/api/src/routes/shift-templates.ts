import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, shiftTemplates, shifts } from '@secureops/db'
import { eq, and, lt, gt } from 'drizzle-orm'
import { requireTenantAdmin } from '../lib/auth'

export const shiftTemplatesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — list active templates for this tenant
  fastify.get('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({ siteId: z.string().optional(), guardId: z.string().optional() }).parse(request.query)
    const conditions = [eq(shiftTemplates.tenantId, payload.tenantId), eq(shiftTemplates.active, true)]
    if (query.siteId) conditions.push(eq(shiftTemplates.siteId, query.siteId))
    if (query.guardId) conditions.push(eq(shiftTemplates.guardId, query.guardId))
    const all = await db.select().from(shiftTemplates).where(and(...conditions))
    return reply.send({ data: all })
  })

  // POST / — create template
  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = z.object({
      siteId: z.string(),
      guardId: z.string(),
      dayOfWeek: z.number().int().min(0).max(6),
      startHour: z.number().int().min(0).max(23),
      startMinute: z.number().int().min(0).max(59).default(0),
      endHour: z.number().int().min(0).max(23),
      endMinute: z.number().int().min(0).max(59).default(0),
      notes: z.string().optional(),
    }).parse(request.body)
    const [tpl] = await db.insert(shiftTemplates).values({ ...body, tenantId: payload.tenantId }).returning()
    return reply.code(201).send({ data: tpl })
  })

  // DELETE /:id — deactivate (soft delete)
  fastify.delete('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const [tpl] = await db.update(shiftTemplates)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.tenantId, payload.tenantId)))
      .returning()
    if (!tpl) return reply.code(404).send({ error: 'Not found', message: 'Template not found', statusCode: 404 })
    return reply.send({ data: tpl })
  })

  // POST /materialise — given weekStart (YYYY-MM-DD Monday), generate shifts for that week
  fastify.post('/materialise', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const { weekStart } = z.object({ weekStart: z.string() }).parse(request.body)

    const monday = new Date(weekStart)
    monday.setUTCHours(0, 0, 0, 0)

    // Fetch all active templates for this tenant
    const templates = await db.select().from(shiftTemplates)
      .where(and(eq(shiftTemplates.tenantId, payload.tenantId), eq(shiftTemplates.active, true)))

    const created: any[] = []
    const skipped: any[] = []

    for (const tpl of templates) {
      // Calculate date for this template's day of week (0=Sun, 1=Mon, ..., 6=Sat)
      const dayOffset = (tpl.dayOfWeek - 1 + 7) % 7 // offset from Monday
      const shiftDate = new Date(monday)
      shiftDate.setUTCDate(monday.getUTCDate() + dayOffset)

      const startsAt = new Date(shiftDate)
      startsAt.setUTCHours(tpl.startHour, tpl.startMinute, 0, 0)

      const endsAt = new Date(shiftDate)
      endsAt.setUTCHours(tpl.endHour, tpl.endMinute, 0, 0)
      // Handle overnight shifts
      if (endsAt <= startsAt) endsAt.setUTCDate(endsAt.getUTCDate() + 1)

      // Check for overlapping shift
      const overlapping = await db.select({ id: shifts.id }).from(shifts)
        .where(and(
          eq(shifts.tenantId, payload.tenantId),
          eq(shifts.guardId, tpl.guardId),
          lt(shifts.startsAt, endsAt),
          gt(shifts.endsAt, startsAt),
        )).limit(1)

      if (overlapping.length > 0) {
        skipped.push({ templateId: tpl.id, reason: 'overlap' })
        continue
      }

      const [shift] = await db.insert(shifts).values({
        tenantId: payload.tenantId,
        siteId: tpl.siteId,
        guardId: tpl.guardId,
        startsAt,
        endsAt,
        notes: tpl.notes ?? undefined,
        published: false,
      }).returning()
      created.push(shift)
    }

    return reply.send({ data: { created: created.length, skipped: skipped.length, shifts: created } })
  })
}
