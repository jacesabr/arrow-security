import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, shifts, users } from '@secureops/db'
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin, requireSupervisor, getSupervisorSiteIds } from '../lib/auth'
import { solveSchedule } from '../lib/scheduler'
import { computeShiftMovement, computeAndStoreShiftMovement } from '../lib/shift-movement'

export const shiftsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const query = z.object({
      guardId: z.string().optional(),
      siteId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(request.query)

    const conditions = [eq(shifts.tenantId, payload.tenantId)]
    if (payload.role === 'guard') conditions.push(eq(shifts.guardId, payload.sub))
    else if (query.guardId) conditions.push(eq(shifts.guardId, query.guardId))

    // Scope supervisors to their assigned sites
    if (payload.role === 'supervisor') {
      const siteIds = await getSupervisorSiteIds(payload.sub, payload.role)
      if (siteIds !== null) {
        if (siteIds.length === 0) return reply.send({ data: [] })
        conditions.push(inArray(shifts.siteId, siteIds))
      }
    }

    if (query.siteId) conditions.push(eq(shifts.siteId, query.siteId))
    if (query.from) conditions.push(gte(shifts.startsAt, new Date(query.from)))
    if (query.to) conditions.push(lte(shifts.endsAt, new Date(query.to)))

    // Build extra WHERE fragments matching the same scoping logic.
    const guardScope = payload.role === 'guard'
      ? sql`AND s.guard_id = ${payload.sub}`
      : query.guardId
        ? sql`AND s.guard_id = ${query.guardId}`
        : sql``
    const supervisorScope = payload.role === 'supervisor'
      ? await (async () => {
          const siteIds = await getSupervisorSiteIds(payload.sub, payload.role)
          if (siteIds === null) return sql``
          if (siteIds.length === 0) return sql`AND FALSE`
          return sql`AND s.site_id = ANY(${siteIds})`
        })()
      : sql``
    const siteScope = query.siteId ? sql`AND s.site_id = ${query.siteId}` : sql``
    const fromScope = query.from ? sql`AND s.starts_at >= ${new Date(query.from)}` : sql``
    const toScope   = query.to   ? sql`AND s.ends_at   <= ${new Date(query.to)}`   : sql``

    // Pull every shift plus its site name and the closest check-in / check-out
    // attendance timestamps. LATERAL subqueries keep the join O(N) over shifts
    // and let Postgres pick the right index per shift. The 30/60-minute padding
    // either side of the shift window absorbs guards who clock in slightly
    // early or out slightly late — adjust if the real tolerance is different.
    const rows = await db.execute(sql`
      SELECT
        s.id, s.tenant_id, s.site_id, s.guard_id, s.starts_at, s.ends_at,
        s.status, s.notes, s.published, s.created_at,
        st.name AS site_name,
        ci.verified_at AS check_in_at,
        co.verified_at AS check_out_at
      FROM shifts s
      LEFT JOIN sites st ON st.id = s.site_id
      LEFT JOIN LATERAL (
        SELECT verified_at
        FROM attendance_records
        WHERE guard_id = s.guard_id
          AND site_id  = s.site_id
          AND type     = 'check_in'
          AND verified_at >= s.starts_at - INTERVAL '30 minutes'
          AND verified_at <= s.ends_at
        ORDER BY verified_at ASC
        LIMIT 1
      ) ci ON TRUE
      LEFT JOIN LATERAL (
        SELECT verified_at
        FROM attendance_records
        WHERE guard_id = s.guard_id
          AND site_id  = s.site_id
          AND type     = 'check_out'
          AND verified_at >= s.starts_at
          AND verified_at <= s.ends_at + INTERVAL '60 minutes'
        ORDER BY verified_at DESC
        LIMIT 1
      ) co ON TRUE
      WHERE s.tenant_id = ${payload.tenantId}
        ${guardScope}
        ${supervisorScope}
        ${siteScope}
        ${fromScope}
        ${toScope}
      ORDER BY s.starts_at DESC
    `)

    // db.execute returns snake_case keys; map to camelCase to match other endpoints.
    const data = (rows as any[]).map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      siteId: r.site_id,
      guardId: r.guard_id,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: r.status,
      notes: r.notes,
      published: r.published,
      createdAt: r.created_at,
      siteName: r.site_name,
      checkInAt:  r.check_in_at,
      checkOutAt: r.check_out_at,
    }))

    return reply.send({ data })
  })

  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = z.object({
      siteId: z.string(),
      guardId: z.string(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      notes: z.string().optional(),
    }).parse(request.body)

    const [shift] = await db
      .insert(shifts)
      .values({ ...body, tenantId: payload.tenantId, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) })
      .returning()

    return reply.code(201).send({ data: shift })
  })

  fastify.patch('/:id/status', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const { status } = z.object({
      status: z.enum(['scheduled', 'active', 'completed', 'missed']),
    }).parse(request.body)

    const [shift] = await db
      .update(shifts)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(shifts.id, id), eq(shifts.tenantId, payload.tenantId)))
      .returning()

    if (!shift) return reply.code(404).send({ error: 'Not found', message: 'Shift not found', statusCode: 404 })

    // When a shift completes, asynchronously compute movement breakdown.
    // Don't block the response on this — it walks every ping for the shift.
    if (status === 'completed') {
      computeAndStoreShiftMovement(shift.id, shift.tenantId, shift.startsAt, shift.endsAt)
        .catch((err) => fastify.log.error({ err, shiftId: shift.id }, 'shift movement compute failed'))
    }

    return reply.send({ data: shift })
  })

  // GET /:id/movement — per-shift movement summary + audit graph series.
  // Always re-derives the series from guard_locations; uses persisted totals if
  // available, otherwise computes them fresh.
  fastify.get('/:id/movement', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string; role: string }

    const [shift] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, id), eq(shifts.tenantId, payload.tenantId)))
      .limit(1)
    if (!shift) return reply.code(404).send({ error: 'Not found', message: 'Shift not found', statusCode: 404 })

    // Authorise
    if (payload.role === 'guard' && shift.guardId !== payload.sub) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Not your shift', statusCode: 403 })
    }
    if (payload.role === 'supervisor') {
      const allowed = await getSupervisorSiteIds(payload.sub, payload.role)
      if (!allowed || !allowed.includes(shift.siteId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Shift not at your site', statusCode: 403 })
      }
    }

    const result = await computeShiftMovement(shift.id, shift.tenantId, shift.startsAt, shift.endsAt)
    return reply.send({ data: { shift, movement: result } })
  })

  // POST /:id/movement/recompute — force a recompute and persist (admin / supervisor).
  fastify.post('/:id/movement/recompute', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string; role: string }

    const [shift] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, id), eq(shifts.tenantId, payload.tenantId)))
      .limit(1)
    if (!shift) return reply.code(404).send({ error: 'Not found', message: 'Shift not found', statusCode: 404 })

    if (payload.role === 'supervisor') {
      const allowed = await getSupervisorSiteIds(payload.sub, payload.role)
      if (!allowed || !allowed.includes(shift.siteId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Shift not at your site', statusCode: 403 })
      }
    }

    const result = await computeAndStoreShiftMovement(shift.id, shift.tenantId, shift.startsAt, shift.endsAt)
    return reply.send({ data: result })
  })

  fastify.delete('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const [deleted] = await db
      .delete(shifts)
      .where(and(eq(shifts.id, id), eq(shifts.tenantId, payload.tenantId)))
      .returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found', message: 'Shift not found', statusCode: 404 })
    return reply.send({ data: deleted })
  })

  // POST /api/shifts/solve — run CP-SAT solver to re-assign guards for a week
  fastify.post('/solve', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const { weekStart } = z.object({ weekStart: z.string() }).parse(request.body) // ISO date string e.g. "2025-05-19"

    const weekStartDate = new Date(weekStart)
    const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000)

    // Fetch all shifts in the week for this tenant
    const weekShifts = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.tenantId, payload.tenantId),
          gte(shifts.startsAt, weekStartDate),
          lte(shifts.startsAt, weekEndDate),
        )
      )

    if (weekShifts.length === 0) {
      return reply.send({ data: { status: 'no_shifts', assignments: [], solve_ms: 0, gaps: [] } })
    }

    // Fetch all guards for this tenant
    const guards = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, payload.tenantId), eq(users.role, 'guard')))

    if (guards.length === 0) {
      return reply.send({ data: { status: 'no_guards', assignments: [], solve_ms: 0, gaps: weekShifts.map(s => s.id) } })
    }

    // Build solver-compatible shift objects derived from startsAt/endsAt timestamps
    const solverShifts = weekShifts.map(s => {
      const start = new Date(s.startsAt)
      const end = new Date(s.endsAt)
      // getDay() returns 0=Sun, adjust to 0=Mon
      const rawDay = start.getDay()
      const day = rawDay === 0 ? 6 : rawDay - 1
      const startHour = start.getHours()
      const durationHours = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60)))
      return { id: s.id, site_id: s.siteId, day, start_hour: startHour, duration_hours: durationHours }
    })

    const uniqueSiteIds = [...new Set(weekShifts.map(s => s.siteId))]

    // Simplification: all guards are eligible for all sites in scope
    const solverGuards = guards.map(g => ({
      id: g.id,
      site_ids: uniqueSiteIds,
      max_hours_per_week: 48,
    }))

    const result = await solveSchedule({ guards: solverGuards, shifts: solverShifts, max_solve_seconds: 5 })

    // Apply assignments back to DB
    for (const a of result.assignments) {
      await db
        .update(shifts)
        .set({ guardId: a.guard_id, updatedAt: new Date() })
        .where(and(eq(shifts.id, a.shift_id), eq(shifts.tenantId, payload.tenantId)))
    }

    return reply.send({ data: result })
  })
}
