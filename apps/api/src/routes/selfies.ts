import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, selfieRecords, attendanceRecords, sites, users } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth, requireSupervisor } from '../lib/auth'

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const submitSchema = z.object({
  siteId: z.string(),
  checkType: z.enum(['check_in', 'check_out']),
  imageData: z.string().min(100),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

const reviewSchema = z.object({
  status: z.enum(['approved', 'flagged']),
  note: z.string().optional(),
})

export const selfiesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST / — guard submits selfie; creates selfie_record + attendance_record atomically
  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = submitSchema.parse(request.body)

    // Verify site belongs to this tenant
    const [site] = await db
      .select()
      .from(sites)
      .where(and(eq(sites.id, body.siteId), eq(sites.tenantId, payload.tenantId)))
      .limit(1)

    if (!site) return reply.code(404).send({ error: 'Not found', message: 'Site not found', statusCode: 404 })

    let isWithinGeofence: boolean | null = null
    let distanceMeters: number | null = null
    if (body.latitude != null && body.longitude != null && site.latitude && site.longitude) {
      distanceMeters = Math.round(haversineMeters(body.latitude, body.longitude, Number(site.latitude), Number(site.longitude)))
      isWithinGeofence = distanceMeters <= (site.geofenceRadiusMeters ?? 200)
    }

    const result = await db.transaction(async (tx) => {
      const [attendance] = await tx
        .insert(attendanceRecords)
        .values({
          tenantId: payload.tenantId,
          guardId: payload.sub,
          siteId: body.siteId,
          type: body.checkType,
          method: 'face',
          latitude: body.latitude,
          longitude: body.longitude,
          isWithinGeofence,
          verifiedAt: new Date(),
          selfieReviewStatus: 'pending',
        })
        .returning()

      const [selfie] = await tx
        .insert(selfieRecords)
        .values({
          tenantId: payload.tenantId,
          guardId: payload.sub,
          siteId: body.siteId,
          attendanceRecordId: attendance.id,
          checkType: body.checkType,
          imageData: body.imageData,
          latitude: body.latitude,
          longitude: body.longitude,
          capturedAt: new Date(),
        })
        .returning()

      return { selfie, attendance, distanceMeters, isWithinGeofence }
    })

    return reply.code(201).send({ data: result })
  })

  // GET / — supervisor/admin lists selfies with guard + site detail
  fastify.get('/', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({
      guardId: z.string().optional(),
      siteId: z.string().optional(),
      reviewStatus: z.enum(['pending', 'approved', 'flagged']).optional(),
      limit: z.coerce.number().default(50),
    }).parse(request.query)

    const conditions = [eq(selfieRecords.tenantId, payload.tenantId)]
    if (query.guardId) conditions.push(eq(selfieRecords.guardId, query.guardId))
    if (query.siteId) conditions.push(eq(selfieRecords.siteId, query.siteId))
    if (query.reviewStatus) conditions.push(eq(selfieRecords.reviewStatus, query.reviewStatus))

    const rows = await db
      .select({
        id: selfieRecords.id,
        guardId: selfieRecords.guardId,
        guardName: users.name,
        siteId: selfieRecords.siteId,
        siteName: sites.name,
        attendanceRecordId: selfieRecords.attendanceRecordId,
        checkType: selfieRecords.checkType,
        imageData: selfieRecords.imageData,
        latitude: selfieRecords.latitude,
        longitude: selfieRecords.longitude,
        capturedAt: selfieRecords.capturedAt,
        reviewStatus: selfieRecords.reviewStatus,
        reviewNote: selfieRecords.reviewNote,
        reviewedAt: selfieRecords.reviewedAt,
      })
      .from(selfieRecords)
      .innerJoin(users, eq(selfieRecords.guardId, users.id))
      .innerJoin(sites, eq(selfieRecords.siteId, sites.id))
      .where(and(...conditions))
      .orderBy(desc(selfieRecords.capturedAt))
      .limit(query.limit)

    return reply.send({ data: rows })
  })

  // GET /:id — single selfie (image included)
  fastify.get('/:id', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }

    const [row] = await db
      .select({
        id: selfieRecords.id,
        guardId: selfieRecords.guardId,
        guardName: users.name,
        siteId: selfieRecords.siteId,
        siteName: sites.name,
        attendanceRecordId: selfieRecords.attendanceRecordId,
        checkType: selfieRecords.checkType,
        imageData: selfieRecords.imageData,
        latitude: selfieRecords.latitude,
        longitude: selfieRecords.longitude,
        capturedAt: selfieRecords.capturedAt,
        reviewStatus: selfieRecords.reviewStatus,
        reviewNote: selfieRecords.reviewNote,
        reviewedAt: selfieRecords.reviewedAt,
      })
      .from(selfieRecords)
      .innerJoin(users, eq(selfieRecords.guardId, users.id))
      .innerJoin(sites, eq(selfieRecords.siteId, sites.id))
      .where(and(eq(selfieRecords.id, id), eq(selfieRecords.tenantId, payload.tenantId)))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'Not found', message: 'Selfie not found', statusCode: 404 })
    return reply.send({ data: row })
  })

  // PATCH /:id/review — supervisor marks approved or flagged
  fastify.patch('/:id/review', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string }
    const body = reviewSchema.parse(request.body)

    const [updated] = await db
      .update(selfieRecords)
      .set({
        reviewStatus: body.status,
        reviewNote: body.note ?? null,
        reviewedBy: payload.sub,
        reviewedAt: new Date(),
      })
      .where(and(eq(selfieRecords.id, id), eq(selfieRecords.tenantId, payload.tenantId)))
      .returning()

    if (!updated) return reply.code(404).send({ error: 'Not found', message: 'Selfie not found', statusCode: 404 })

    // Mirror review status onto the linked attendance record
    if (updated.attendanceRecordId) {
      await db
        .update(attendanceRecords)
        .set({
          selfieReviewStatus: body.status,
          selfieReviewNote: body.note ?? null,
          selfieReviewedBy: payload.sub,
          selfieReviewedAt: new Date(),
        })
        .where(eq(attendanceRecords.id, updated.attendanceRecordId))
    }

    return reply.send({ data: updated })
  })
}
