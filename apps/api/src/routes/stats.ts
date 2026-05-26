import type { FastifyPluginAsync } from 'fastify'
import { db, users, sites, shifts, patrols, attendanceRecords } from '@secureops/db'
import { eq, and, count, gte, lt, inArray } from 'drizzle-orm'
import { requireAuth, getSupervisorSiteIds } from '../lib/auth'

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const tid = payload.tenantId

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    // ── Guard: scope everything to themselves ──────────────────────────────
    if (payload.role === 'guard') {
      const [
        [activeShiftsRow],
        [todayPatrolsRow],
        [todayAttendanceRow],
      ] = await Promise.all([
        db.select({ c: count() }).from(shifts).where(and(eq(shifts.tenantId, tid), eq(shifts.guardId, payload.sub), eq(shifts.status, 'active'))),
        db.select({ c: count() }).from(patrols).where(and(eq(patrols.tenantId, tid), eq(patrols.guardId, payload.sub), gte(patrols.startedAt, todayStart), lt(patrols.startedAt, todayEnd))),
        db.select({ c: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.tenantId, tid), eq(attendanceRecords.guardId, payload.sub), gte(attendanceRecords.verifiedAt, todayStart))),
      ])

      const guardSites = await db
        .selectDistinct({ siteId: shifts.siteId })
        .from(shifts)
        .where(and(eq(shifts.tenantId, tid), eq(shifts.guardId, payload.sub)))

      return reply.send({
        data: {
          guards: 1,
          sites: guardSites.length,
          activeShifts: activeShiftsRow.c,
          todayPatrols: todayPatrolsRow.c,
          todayAttendance: todayAttendanceRow.c,
        },
      })
    }

    // ── Supervisor: scope to their assigned sites ──────────────────────────
    const supervisorSiteIds = await getSupervisorSiteIds(payload.sub, payload.role)
    if (supervisorSiteIds !== null && supervisorSiteIds.length === 0) {
      return reply.send({
        data: { guards: 0, sites: 0, activeShifts: 0, todayPatrols: 0, todayAttendance: 0 },
      })
    }

    const siteScope = supervisorSiteIds
    const shiftSiteFilter = siteScope ? inArray(shifts.siteId, siteScope) : undefined
    const patrolSiteFilter = siteScope ? inArray(patrols.siteId, siteScope) : undefined
    const attendanceSiteFilter = siteScope ? inArray(attendanceRecords.siteId, siteScope) : undefined

    let guardsCount: number
    let sitesCount: number
    if (siteScope) {
      const guardRows = await db
        .selectDistinct({ guardId: shifts.guardId })
        .from(shifts)
        .where(and(eq(shifts.tenantId, tid), inArray(shifts.siteId, siteScope)))
      guardsCount = guardRows.length
      sitesCount = siteScope.length
    } else {
      const [g] = await db.select({ c: count() }).from(users).where(and(eq(users.tenantId, tid), eq(users.role, 'guard')))
      const [s] = await db.select({ c: count() }).from(sites).where(eq(sites.tenantId, tid))
      guardsCount = g.c
      sitesCount = s.c
    }

    const [
      [activeShiftsRow],
      [todayPatrolsRow],
      [todayAttendanceRow],
    ] = await Promise.all([
      db.select({ c: count() }).from(shifts).where(and(
        eq(shifts.tenantId, tid),
        eq(shifts.status, 'active'),
        ...(shiftSiteFilter ? [shiftSiteFilter] : []),
      )),
      db.select({ c: count() }).from(patrols).where(and(
        eq(patrols.tenantId, tid),
        gte(patrols.startedAt, todayStart),
        lt(patrols.startedAt, todayEnd),
        ...(patrolSiteFilter ? [patrolSiteFilter] : []),
      )),
      db.select({ c: count() }).from(attendanceRecords).where(and(
        eq(attendanceRecords.tenantId, tid),
        gte(attendanceRecords.verifiedAt, todayStart),
        ...(attendanceSiteFilter ? [attendanceSiteFilter] : []),
      )),
    ])

    return reply.send({
      data: {
        guards: guardsCount,
        sites: sitesCount,
        activeShifts: activeShiftsRow.c,
        todayPatrols: todayPatrolsRow.c,
        todayAttendance: todayAttendanceRow.c,
      },
    })
  })
}
