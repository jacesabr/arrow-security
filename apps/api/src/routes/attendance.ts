import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, attendanceRecords, sites, users } from '@secureops/db'
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
