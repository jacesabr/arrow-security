import type { FastifyPluginAsync } from 'fastify'
import { db } from '@secureops/db'
import { sql } from 'drizzle-orm'
import { requireSupervisor, getSupervisorSiteIds } from '../lib/auth'

// GET /api/site-stats — one row per site the caller can see, with per-site
// counters that supervisors and admins need at a glance:
//
//   totalGuards        — distinct guards scheduled here in last 30 days
//   onShift            — shifts at this site that are status='active' now
//   missing            — shifts open right now but not started yet
//   weeklyAttendancePct — completed / (completed + missed) over last 7 days
//   weeklyTardinessPct  — distinct guards who had a tardy check-in (≥5 min
//                         past shift start) this week, ÷ total weekly guards
//
// Supervisor: scoped to their assigned sites.
// Admin:      every site in the tenant.

export const siteStatsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const supervisorSiteIds = await getSupervisorSiteIds(payload.sub, payload.role)
    const siteScope = supervisorSiteIds === null
      ? sql``
      : supervisorSiteIds.length === 0
        ? sql`AND FALSE`
        : sql`AND st.id = ANY(${supervisorSiteIds})`

    const rows = await db.execute(sql`
      SELECT
        st.id   AS site_id,
        st.name AS site_name,

        -- Guards: distinct people scheduled here in the last 30 days. We use
        -- "ever scheduled recently" as the rolling roster — there is no
        -- explicit guard↔site assignment table in the data model.
        (SELECT COUNT(DISTINCT s.guard_id)
           FROM shifts s
          WHERE s.site_id   = st.id
            AND s.tenant_id = st.tenant_id
            AND s.starts_at >= NOW() - INTERVAL '30 days') AS total_guards,

        -- Currently working (status active, shift window open)
        (SELECT COUNT(*) FROM shifts s
          WHERE s.site_id   = st.id
            AND s.tenant_id = st.tenant_id
            AND s.status    = 'active'
            AND s.starts_at <= NOW()
            AND s.ends_at   >= NOW()) AS on_shift,

        -- Scheduled / missed but window is open and they haven't checked in
        (SELECT COUNT(*) FROM shifts s
          WHERE s.site_id   = st.id
            AND s.tenant_id = st.tenant_id
            AND s.status    IN ('scheduled', 'missed')
            AND s.starts_at <= NOW()
            AND s.ends_at   >= NOW()) AS missing,

        -- This-week numerator / denominator for attendance %
        (SELECT COUNT(*) FROM shifts s
          WHERE s.site_id   = st.id
            AND s.tenant_id = st.tenant_id
            AND s.status    = 'completed'
            AND s.starts_at >= NOW() - INTERVAL '7 days') AS weekly_completed,
        (SELECT COUNT(*) FROM shifts s
          WHERE s.site_id   = st.id
            AND s.tenant_id = st.tenant_id
            AND s.status    IN ('completed', 'missed')
            AND s.starts_at >= NOW() - INTERVAL '7 days') AS weekly_finished,

        -- Tardy this-week numerator: distinct guards whose first check-in for
        -- a shift at this site was ≥5 minutes after the shift's start.
        (SELECT COUNT(DISTINCT s.guard_id)
           FROM shifts s
           JOIN attendance_records a
             ON a.guard_id  = s.guard_id
            AND a.site_id   = s.site_id
            AND a.type      = 'check_in'
            AND a.verified_at >= s.starts_at + INTERVAL '5 minutes'
            AND a.verified_at <= s.ends_at
          WHERE s.site_id   = st.id
            AND s.tenant_id = st.tenant_id
            AND s.starts_at >= NOW() - INTERVAL '7 days') AS weekly_tardy_guards,

        -- Tardy this-week denominator: distinct guards who worked this site
        -- in the last 7 days (only those who actually had a chance to be
        -- tardy — i.e. their shift was completed or missed).
        (SELECT COUNT(DISTINCT s.guard_id)
           FROM shifts s
          WHERE s.site_id   = st.id
            AND s.tenant_id = st.tenant_id
            AND s.starts_at >= NOW() - INTERVAL '7 days') AS weekly_guard_pool

      FROM sites st
      WHERE st.tenant_id = ${payload.tenantId}
        ${siteScope}
      ORDER BY st.name ASC
    `)

    const sites = (rows as any[]).map((r) => {
      const finished  = Number(r.weekly_finished)
      const completed = Number(r.weekly_completed)
      const pool      = Number(r.weekly_guard_pool)
      const tardy     = Number(r.weekly_tardy_guards)
      return {
        siteId:               r.site_id,
        siteName:             r.site_name,
        totalGuards:          Number(r.total_guards),
        onShift:              Number(r.on_shift),
        missing:              Number(r.missing),
        weeklyAttendancePct:  finished === 0 ? null : Math.round((completed / finished) * 1000) / 10,
        weeklyTardinessPct:   pool === 0     ? null : Math.round((tardy / pool)     * 1000) / 10,
      }
    })

    return reply.send({ data: sites })
  })
}
