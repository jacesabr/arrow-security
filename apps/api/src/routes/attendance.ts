import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, attendanceRecords, sites, users, shifts } from '@secureops/db'
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm'
import { requireAuth, requireSupervisor } from '../lib/auth'

const reviewSchema = z.object({
  status: z.enum(['approved', 'flagged']),
  note: z.string().optional(),
})

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const checkInSchema = z.object({
  siteId: z.string(),
  type: z.enum(['check_in', 'check_out']),
  method: z.enum(['face', 'qr', 'manual']),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  selfieUrl: z.string().optional(),
  livenessScore: z.number().min(0).max(1).optional(),
})

export const attendanceRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /logsheet — per-guard rolling 30-day logsheet with paired check-in/out rows
  fastify.get('/logsheet', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const query = z.object({
      guardId: z.string(),
      since: z.string().optional(),
      until: z.string().optional(),
    }).parse(request.query)

    const since = query.since ? new Date(query.since) : thirtyDaysAgo
    const until = query.until ? new Date(query.until) : now

    const [guard] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        role: users.role,
        faceEnrolled: users.faceEnrolled,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(and(eq(users.id, query.guardId), eq(users.tenantId, payload.tenantId)))
      .limit(1)

    if (!guard) return reply.code(404).send({ error: 'Not found', message: 'Guard not found', statusCode: 404 })

    const records = await db
      .select({
        id: attendanceRecords.id,
        type: attendanceRecords.type,
        method: attendanceRecords.method,
        verifiedAt: attendanceRecords.verifiedAt,
        siteId: attendanceRecords.siteId,
        siteName: sites.name,
        selfieUrl: attendanceRecords.selfieUrl,
        isWithinGeofence: attendanceRecords.isWithinGeofence,
        outOfZoneReason: attendanceRecords.outOfZoneReason,
        selfieReviewStatus: attendanceRecords.selfieReviewStatus,
      })
      .from(attendanceRecords)
      .innerJoin(sites, eq(attendanceRecords.siteId, sites.id))
      .where(and(
        eq(attendanceRecords.tenantId, payload.tenantId),
        eq(attendanceRecords.guardId, query.guardId),
        gte(attendanceRecords.verifiedAt, since),
        lte(attendanceRecords.verifiedAt, until),
      ))
      .orderBy(attendanceRecords.verifiedAt)

    // Extend range 12 h back to catch overnight shifts starting just before `since`
    const extendedSince = new Date(since.getTime() - 12 * 60 * 60 * 1000)
    const guardShifts = await db
      .select({ id: shifts.id, siteId: shifts.siteId, startsAt: shifts.startsAt, endsAt: shifts.endsAt, status: shifts.status })
      .from(shifts)
      .where(and(
        eq(shifts.tenantId, payload.tenantId),
        eq(shifts.guardId, query.guardId),
        gte(shifts.endsAt, extendedSince),
        lte(shifts.startsAt, until),
      ))

    // Pair check_in / check_out using a FIFO queue per siteId
    type Row = {
      date: string
      siteId: string
      siteName: string
      checkInId: string
      checkInTime: Date
      checkInMethod: string
      checkInGeofence: boolean | null
      checkInOutOfZoneReason: string | null
      checkInSelfieUrl: string | null
      checkInSelfieReview: string | null
      checkOutId: string | null
      checkOutTime: Date | null
      checkOutMethod: string | null
      checkOutOutOfZoneReason: string | null
      hoursWorked: number | null
      scheduledStart: Date | null
      scheduledEnd: Date | null
      checkInOnTime: boolean | null
      checkOutOnTime: boolean | null
    }

    const openQueue = new Map<string, (typeof records)[0][]>()
    const rows: Row[] = []

    function findShift(siteId: string, checkInTime: Date) {
      return guardShifts.find(
        (s) => s.siteId === siteId && Math.abs(s.startsAt.getTime() - checkInTime.getTime()) < 4 * 60 * 60 * 1000,
      ) ?? null
    }

    for (const r of records) {
      if (!r.verifiedAt) continue
      if (r.type === 'check_in') {
        if (!openQueue.has(r.siteId)) openQueue.set(r.siteId, [])
        openQueue.get(r.siteId)!.push(r)
      } else {
        const queue = openQueue.get(r.siteId)
        if (queue && queue.length > 0) {
          const checkIn = queue.shift()!
          const hoursWorked = (r.verifiedAt.getTime() - checkIn.verifiedAt!.getTime()) / 3_600_000
          const matched = findShift(r.siteId, checkIn.verifiedAt!)
          rows.push({
            date: checkIn.verifiedAt!.toISOString().split('T')[0],
            siteId: r.siteId,
            siteName: r.siteName,
            checkInId: checkIn.id,
            checkInTime: checkIn.verifiedAt!,
            checkInMethod: checkIn.method,
            checkInGeofence: checkIn.isWithinGeofence,
            checkInOutOfZoneReason: checkIn.outOfZoneReason ?? null,
            checkInSelfieUrl: checkIn.selfieUrl ?? null,
            checkInSelfieReview: checkIn.selfieReviewStatus ?? null,
            checkOutId: r.id,
            checkOutTime: r.verifiedAt,
            checkOutMethod: r.method,
            checkOutOutOfZoneReason: r.outOfZoneReason ?? null,
            hoursWorked: Math.round(hoursWorked * 10) / 10,
            scheduledStart: matched?.startsAt ?? null,
            scheduledEnd: matched?.endsAt ?? null,
            checkInOnTime: matched ? checkIn.verifiedAt!.getTime() <= matched.startsAt.getTime() + 15 * 60_000 : null,
            checkOutOnTime: matched ? r.verifiedAt.getTime() >= matched.endsAt.getTime() - 30 * 60_000 : null,
          })
        }
      }
    }

    // Flush any unmatched check_ins (no check_out yet)
    for (const [, queue] of openQueue) {
      for (const checkIn of queue) {
        if (!checkIn.verifiedAt) continue
        const matched = findShift(checkIn.siteId, checkIn.verifiedAt)
        rows.push({
          date: checkIn.verifiedAt.toISOString().split('T')[0],
          siteId: checkIn.siteId,
          siteName: checkIn.siteName,
          checkInId: checkIn.id,
          checkInTime: checkIn.verifiedAt,
          checkInMethod: checkIn.method,
          checkInGeofence: checkIn.isWithinGeofence,
          checkInOutOfZoneReason: checkIn.outOfZoneReason ?? null,
          checkInSelfieUrl: checkIn.selfieUrl ?? null,
          checkInSelfieReview: checkIn.selfieReviewStatus ?? null,
          checkOutId: null,
          checkOutTime: null,
          checkOutMethod: null,
          checkOutOutOfZoneReason: null,
          hoursWorked: null,
          scheduledStart: matched?.startsAt ?? null,
          scheduledEnd: matched?.endsAt ?? null,
          checkInOnTime: matched ? checkIn.verifiedAt.getTime() <= matched.startsAt.getTime() + 15 * 60_000 : null,
          checkOutOnTime: null,
        })
      }
    }

    rows.sort((a, b) => a.checkInTime.getTime() - b.checkInTime.getTime())

    const completedRows = rows.filter((r) => r.hoursWorked !== null)
    const totalHours = completedRows.reduce((s, r) => s + (r.hoursWorked ?? 0), 0)

    return reply.send({
      data: {
        guard,
        rows,
        summary: {
          totalShifts: rows.length,
          completedShifts: completedRows.length,
          totalHours: Math.round(totalHours * 10) / 10,
          onTimeCheckIns: rows.filter((r) => r.checkInOnTime === true).length,
          lateCheckIns: rows.filter((r) => r.checkInOnTime === false).length,
          since: since.toISOString(),
          until: until.toISOString(),
        },
      },
    })
  })

  // GET /report — attendance compliance report (supervisors+)
  fastify.get('/report', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const query = z.object({
      since: z.string().optional(),
      until: z.string().optional(),
      guardId: z.string().optional(),
      siteId: z.string().optional(),
    }).parse(request.query)

    const since = query.since ? new Date(query.since) : thirtyDaysAgo
    const until = query.until ? new Date(query.until) : now

    const conditions = [
      eq(attendanceRecords.tenantId, payload.tenantId),
      gte(attendanceRecords.verifiedAt, since),
      lte(attendanceRecords.verifiedAt, until),
    ]
    if (query.guardId) conditions.push(eq(attendanceRecords.guardId, query.guardId))
    if (query.siteId) conditions.push(eq(attendanceRecords.siteId, query.siteId))

    const rows = await db
      .select({
        guardId: attendanceRecords.guardId,
        guardName: users.name,
        checkIns: sql<number>`sum(case when ${attendanceRecords.type} = 'check_in' then 1 else 0 end)`,
        checkOuts: sql<number>`sum(case when ${attendanceRecords.type} = 'check_out' then 1 else 0 end)`,
        withinGeofence: sql<number>`sum(case when ${attendanceRecords.isWithinGeofence} = true then 1 else 0 end)`,
        outsideGeofence: sql<number>`sum(case when ${attendanceRecords.isWithinGeofence} = false then 1 else 0 end)`,
        faceMethod: sql<number>`sum(case when ${attendanceRecords.method} = 'face' then 1 else 0 end)`,
        qrMethod: sql<number>`sum(case when ${attendanceRecords.method} = 'qr' then 1 else 0 end)`,
        manualMethod: sql<number>`sum(case when ${attendanceRecords.method} = 'manual' then 1 else 0 end)`,
        lastSeen: sql<string>`max(${attendanceRecords.verifiedAt})`,
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.guardId, users.id))
      .where(and(...conditions))
      .groupBy(attendanceRecords.guardId, users.name)
      .orderBy(users.name)

    return reply.send({ data: rows })
  })

  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }
    const query = z.object({
      guardId: z.string().optional(),
      siteId: z.string().optional(),
      limit: z.coerce.number().default(50),
    }).parse(request.query)

    const conditions = [eq(attendanceRecords.tenantId, payload.tenantId)]
    if (query.guardId) conditions.push(eq(attendanceRecords.guardId, query.guardId))
    if (query.siteId) conditions.push(eq(attendanceRecords.siteId, query.siteId))

    // Guards can only see their own records
    if (payload.role === 'guard') {
      conditions.push(eq(attendanceRecords.guardId, payload.sub))
    }

    const records = await db
      .select()
      .from(attendanceRecords)
      .where(and(...conditions))
      .orderBy(desc(attendanceRecords.verifiedAt))
      .limit(query.limit)

    return reply.send({ data: records })
  })

  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = checkInSchema.parse(request.body)

    let isWithinGeofence: boolean | null = null
    if (body.latitude != null && body.longitude != null) {
      const [site] = await db.select().from(sites).where(and(eq(sites.id, body.siteId), eq(sites.tenantId, payload.tenantId))).limit(1)
      if (site?.latitude && site?.longitude) {
        const dist = haversineMeters(body.latitude, body.longitude, Number(site.latitude), Number(site.longitude))
        isWithinGeofence = dist <= (site.geofenceRadiusMeters ?? 200)
      }
    }

    const [record] = await db
      .insert(attendanceRecords)
      .values({
        ...body,
        tenantId: payload.tenantId,
        guardId: payload.sub,
        verifiedAt: new Date(),
        isWithinGeofence,
      })
      .returning()

    return reply.code(201).send({ data: record })
  })

  // PATCH /:id/review — supervisor approves or flags a selfie check-in
  fastify.patch('/:id/review', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string }
    const body = reviewSchema.parse(request.body)

    const [updated] = await db
      .update(attendanceRecords)
      .set({
        selfieReviewStatus: body.status,
        selfieReviewNote: body.note ?? null,
        selfieReviewedBy: payload.sub,
        selfieReviewedAt: new Date(),
      })
      .where(and(eq(attendanceRecords.id, id), eq(attendanceRecords.tenantId, payload.tenantId)))
      .returning()

    if (!updated) return reply.code(404).send({ error: 'Not found', message: 'Attendance record not found', statusCode: 404 })
    return reply.send({ data: updated })
  })
}
