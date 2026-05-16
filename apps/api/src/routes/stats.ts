import type { FastifyPluginAsync } from 'fastify'
import { db, users, sites, incidents, shifts, patrols, attendanceRecords } from '@secureops/db'
import { eq, and, count, gte, lt } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const tid = payload.tenantId

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const [
      [guardsRow],
      [sitesRow],
      [openIncidentsRow],
      [activeShiftsRow],
      [todayPatrolsRow],
      [todayAttendanceRow],
    ] = await Promise.all([
      db.select({ c: count() }).from(users).where(and(eq(users.tenantId, tid), eq(users.role, 'guard'))),
      db.select({ c: count() }).from(sites).where(eq(sites.tenantId, tid)),
      db.select({ c: count() }).from(incidents).where(and(eq(incidents.tenantId, tid), eq(incidents.status, 'open'))),
      db.select({ c: count() }).from(shifts).where(and(eq(shifts.tenantId, tid), eq(shifts.status, 'active'))),
      db.select({ c: count() }).from(patrols).where(and(eq(patrols.tenantId, tid), gte(patrols.startedAt, todayStart), lt(patrols.startedAt, todayEnd))),
      db.select({ c: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.tenantId, tid), gte(attendanceRecords.verifiedAt, todayStart))),
    ])

    return reply.send({
      data: {
        guards: guardsRow.c,
        sites: sitesRow.c,
        openIncidents: openIncidentsRow.c,
        activeShifts: activeShiftsRow.c,
        todayPatrols: todayPatrolsRow.c,
        todayAttendance: todayAttendanceRow.c,
      },
    })
  })
}
