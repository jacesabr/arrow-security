import type { FastifyPluginAsync } from 'fastify'
import { db, users, sites, incidents, shifts, patrols, attendanceRecords } from '@secureops/db'
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
        [openIncidentsRow],
        [activeShiftsRow],
        [todayPatrolsRow],
        [todayAttendanceRow],
      ] = await Promise.all([
        db.select({ c: count() }).from(incidents).where(and(eq(incidents.tenantId, tid), eq(incidents.reportedBy, payload.sub), eq(incidents.status, 'open'))),
        db.select({ c: count() }).from(shifts).where(and(eq(shifts.tenantId, tid), eq(shifts.guardId, payload.sub), eq(shifts.status, 'active'))),
        db.select({ c: count() }).from(patrols).where(and(eq(patrols.tenantId, tid), eq(patrols.guardId, payload.sub), gte(patrols.startedAt, todayStart), lt(patrols.startedAt, todayEnd))),
        db.select({ c: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.tenantId, tid), eq(attendanceRecords.guardId, payload.sub), gte(attendanceRecords.verifiedAt, todayStart))),
      ])

      // For a guard, "sites" means the distinct sites they've ever been scheduled at.
      const guardSites = await db
        .selectDistinct({ siteId: shifts.siteId })
        .from(shifts)
        .where(and(eq(shifts.tenantId, tid), eq(shifts.guardId, payload.sub)))

      return reply.send({
        data: {
          guards: 1,
          sites: guardSites.length,
          openIncidents: openIncidentsRow.c,
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
        data: { guards: 0, sites: 0, openIncidents: 0, activeShifts: 0, todayPatrols: 0, todayAttendance: 0 },
      })
    }

    const siteScope = supervisorSiteIds // null = admin (no scope), else array
    const incidentSiteFilter = siteScope ? inArray(incidents.siteId, siteScope) : undefined
    const shiftSiteFilter = siteScope ? inArray(shifts.siteId, siteScope) : undefined
    const patrolSiteFilter = siteScope ? inArray(patrols.siteId, siteScope) : undefined
    const attendanceSiteFilter = siteScope ? inArray(attendanceRecords.siteId, siteScope) : undefined

    // For supervisor: "guards" = distinct guards ever scheduled at their sites.
    // For admin: all guards in tenant.
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
      [openIncidentsRow],
      [activeShiftsRow],
      [todayPatrolsRow],
      [todayAttendanceRow],
    ] = await Promise.all([
      db.select({ c: count() }).from(incidents).where(and(
        eq(incidents.tenantId, tid),
        eq(incidents.status, 'open'),
        ...(incidentSiteFilter ? [incidentSiteFilter] : []),
      )),
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
        openIncidents: openIncidentsRow.c,
        activeShifts: activeShiftsRow.c,
        todayPatrols: todayPatrolsRow.c,
        todayAttendance: todayAttendanceRow.c,
      },
    })
  })
}
