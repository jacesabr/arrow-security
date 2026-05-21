import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '@secureops/db'
import { sql } from 'drizzle-orm'
import { requireAuth, requireSupervisor, getSupervisorSiteIds } from '../lib/auth'

// Reports endpoints — admin/supervisor monthly summary of every guard's
// shifts + movement (walking / driving / idle). Designed for the birds-eye
// /reports page and the per-guard drill-down on /guards/[id].
//
// Scoping:
//   - tenant_admin / platform_admin: every guard in the tenant
//   - supervisor: only guards who have a shift at one of the supervisor's
//     assigned sites in the requested month
//
// At 5k guards the LEFT JOIN aggregation hits ~110k shift rows / month;
// the (tenant_id, guard_id, starts_at) index added in 0001_guard_stats.sql
// keeps this O(shifts_in_month) per request.

function parseMonth(monthStr: string | undefined): { start: Date; end: Date; key: string } {
  const now = new Date()
  const m = monthStr && /^\d{4}-\d{2}$/.test(monthStr)
    ? new Date(`${monthStr}-01T00:00:00Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
  const key = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`
  return { start: m, end, key }
}

export const guardStatsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/guard-stats?month=YYYY-MM — list every guard with their monthly aggregates.
  // Returns one row per guard, including guards who have no shifts this month
  // (their counters all read 0) so the birds-eye view doesn't hide anyone.
  fastify.get('/', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const { month } = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }).parse(request.query)
    const { start, end, key } = parseMonth(month)

    const supervisorSiteIds = await getSupervisorSiteIds(payload.sub, payload.role)
    const siteScope = supervisorSiteIds === null
      ? sql``
      : supervisorSiteIds.length === 0
        ? sql`AND FALSE`
        : sql`AND s.site_id = ANY(${supervisorSiteIds})`

    const rows = await db.execute(sql`
      SELECT
        u.id          AS guard_id,
        u.name        AS guard_name,
        u.username,
        COALESCE(SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END), 0)::int AS shifts_completed,
        COALESCE(SUM(CASE WHEN s.status = 'missed'    THEN 1 ELSE 0 END), 0)::int AS shifts_missed,
        COALESCE(SUM(CASE WHEN s.status = 'active'    THEN 1 ELSE 0 END), 0)::int AS shifts_active,
        COALESCE(SUM(CASE WHEN s.status = 'scheduled' THEN 1 ELSE 0 END), 0)::int AS shifts_scheduled,
        COALESCE(SUM(s.walking_seconds), 0)::int    AS walking_seconds,
        COALESCE(SUM(s.driving_seconds), 0)::int    AS driving_seconds,
        COALESCE(SUM(s.stationary_seconds), 0)::int AS idle_seconds
      FROM users u
      LEFT JOIN shifts s
        ON s.guard_id = u.id
        AND s.tenant_id = u.tenant_id
        AND s.starts_at >= ${start.toISOString()}
        AND s.starts_at <  ${end.toISOString()}
        ${siteScope}
      WHERE u.tenant_id = ${payload.tenantId}
        AND u.role = 'guard'
      GROUP BY u.id, u.name, u.username
      ORDER BY u.name ASC
    `)

    const guards = (rows as any[]).map((r) => {
      const walking = Number(r.walking_seconds)
      const driving = Number(r.driving_seconds)
      const idle = Number(r.idle_seconds)
      const tracked = walking + driving + idle
      return {
        guardId: r.guard_id,
        guardName: r.guard_name,
        guardUsername: r.username,
        shiftsCompleted: Number(r.shifts_completed),
        shiftsMissed:    Number(r.shifts_missed),
        shiftsActive:    Number(r.shifts_active),
        shiftsScheduled: Number(r.shifts_scheduled),
        walkingSeconds:  walking,
        drivingSeconds:  driving,
        idleSeconds:     idle,
        trackedSeconds:  tracked,
        // Percent of tracked time spent moving (walking + driving). The
        // remainder is idle — the cheap "is this guard actually working?"
        // signal an admin scrolls to find. Null when nothing tracked yet.
        activePct: tracked === 0 ? null : Math.round(((walking + driving) / tracked) * 1000) / 10,
      }
    })

    return reply.send({ data: { month: key, guards } })
  })

  // GET /api/guard-stats/:guardId?month=YYYY-MM — single guard summary + per-shift breakdown.
  // Auth: a guard can query their own stats; supervisor sees guards at their
  // sites; admin sees anyone.
  fastify.get('/:guardId', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const { guardId } = request.params as { guardId: string }
    const { month } = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }).parse(request.query)
    const { start, end, key } = parseMonth(month)

    const isSelf = guardId === payload.sub
    if (payload.role === 'guard' && !isSelf) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Guards can only view their own stats', statusCode: 403 })
    }

    // Supervisor scope only applies when they're querying OTHER guards. Their
    // own self-query bypasses the site filter (a supervisor's shifts may be
    // at any site they cover, but we don't want to fail because we filtered
    // them out somehow).
    const supervisorSiteIds = isSelf ? null : await getSupervisorSiteIds(payload.sub, payload.role)
    if (supervisorSiteIds !== null && supervisorSiteIds.length === 0) {
      return reply.code(403).send({ error: 'Forbidden', message: 'No site access', statusCode: 403 })
    }
    const siteScope = supervisorSiteIds === null
      ? sql``
      : sql`AND s.site_id = ANY(${supervisorSiteIds})`

    // 1. User row (always scoped to tenant). Note we DON'T filter by role here
    // — supervisors have shifts too and should be able to see their own stats
    // on this endpoint. The list endpoint above still scopes to role='guard'.
    const guardRows = await db.execute(sql`
      SELECT id, name, username, created_at
      FROM users
      WHERE id = ${guardId} AND tenant_id = ${payload.tenantId}
      LIMIT 1
    `) as any[]
    const guard = guardRows[0]
    if (!guard) return reply.code(404).send({ error: 'Not found', message: 'Guard not found', statusCode: 404 })

    // 2. Per-shift breakdown — also gives us the hours-worked derivation via attendance.
    const shiftRows = await db.execute(sql`
      SELECT
        s.id, s.site_id, st.name AS site_name,
        s.starts_at, s.ends_at, s.status,
        s.walking_seconds, s.driving_seconds, s.stationary_seconds,
        ci.verified_at AS check_in_at,
        co.verified_at AS check_out_at
      FROM shifts s
      LEFT JOIN sites st ON st.id = s.site_id
      LEFT JOIN LATERAL (
        SELECT verified_at FROM attendance_records
        WHERE guard_id = s.guard_id AND site_id = s.site_id
          AND type = 'check_in'
          AND verified_at >= s.starts_at - INTERVAL '30 minutes'
          AND verified_at <= s.ends_at
        ORDER BY verified_at ASC LIMIT 1
      ) ci ON TRUE
      LEFT JOIN LATERAL (
        SELECT verified_at FROM attendance_records
        WHERE guard_id = s.guard_id AND site_id = s.site_id
          AND type = 'check_out'
          AND verified_at >= s.starts_at
          AND verified_at <= s.ends_at + INTERVAL '60 minutes'
        ORDER BY verified_at DESC LIMIT 1
      ) co ON TRUE
      WHERE s.guard_id = ${guardId}
        AND s.tenant_id = ${payload.tenantId}
        AND s.starts_at >= ${start.toISOString()}
        AND s.starts_at <  ${end.toISOString()}
        ${siteScope}
      ORDER BY s.starts_at DESC
    `) as any[]

    const shifts = shiftRows.map((r) => {
      const walking = Number(r.walking_seconds ?? 0)
      const driving = Number(r.driving_seconds ?? 0)
      const idle    = Number(r.stationary_seconds ?? 0)
      const workedMs = r.check_in_at && r.check_out_at
        ? new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()
        : 0
      return {
        shiftId: r.id,
        siteId: r.site_id,
        siteName: r.site_name,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        status: r.status,
        checkInAt: r.check_in_at,
        checkOutAt: r.check_out_at,
        workedSeconds: Math.max(0, Math.floor(workedMs / 1000)),
        walkingSeconds: walking,
        drivingSeconds: driving,
        idleSeconds: idle,
      }
    })

    // 3. Roll up the per-shift numbers we just fetched (cheaper + consistent than a second SUM query)
    const summary = shifts.reduce(
      (acc, s) => {
        acc.shiftsCompleted += s.status === 'completed' ? 1 : 0
        acc.shiftsMissed    += s.status === 'missed'    ? 1 : 0
        acc.shiftsActive    += s.status === 'active'    ? 1 : 0
        acc.shiftsScheduled += s.status === 'scheduled' ? 1 : 0
        acc.walkingSeconds  += s.walkingSeconds
        acc.drivingSeconds  += s.drivingSeconds
        acc.idleSeconds     += s.idleSeconds
        acc.workedSeconds   += s.workedSeconds
        return acc
      },
      { shiftsCompleted: 0, shiftsMissed: 0, shiftsActive: 0, shiftsScheduled: 0,
        walkingSeconds: 0, drivingSeconds: 0, idleSeconds: 0, workedSeconds: 0 },
    )
    const tracked = summary.walkingSeconds + summary.drivingSeconds + summary.idleSeconds

    return reply.send({
      data: {
        month: key,
        guard: { id: guard.id, name: guard.name, username: guard.username, createdAt: guard.created_at },
        summary: {
          ...summary,
          trackedSeconds: tracked,
          activePct: tracked === 0 ? null : Math.round(((summary.walkingSeconds + summary.drivingSeconds) / tracked) * 1000) / 10,
        },
        shifts,
      },
    })
  })
}
