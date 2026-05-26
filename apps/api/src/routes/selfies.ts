import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, selfieRecords, attendanceRecords, sites, users } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth, requireSupervisor } from '../lib/auth'
import { putObject, getDownloadUrl } from '../lib/storage'

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const [header, b64] = dataUrl.split(',')
  const contentType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  return { buffer: Buffer.from(b64, 'base64'), contentType }
}

const submitSchema = z.object({
  // Optional: when the guard is at a location not yet in our sites table, the
  // mobile app sends siteId omitted (or empty string) + GPS. The server auto-
  // creates a `pending` site at those coords and binds the attendance row to
  // it. An admin reviews the pending site on /sites/:id and confirms.
  siteId: z.string().optional(),
  checkType: z.enum(['check_in', 'check_out']),
  imageData: z.string().min(100),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  outOfZoneReason: z.string().trim().max(500).optional(),
})

export const selfiesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST / — guard submits selfie; uploads image to R2, creates selfie_record + attendance_record atomically
  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const body = submitSchema.parse(request.body)

    let site: typeof sites.$inferSelect | undefined
    let createdPendingSite = false

    if (body.siteId) {
      const rows = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, body.siteId), eq(sites.tenantId, payload.tenantId)))
        .limit(1)
      site = rows[0]
      if (!site) return reply.code(404).send({ error: 'Not found', message: 'Site not found', statusCode: 404 })
    } else {
      // No siteId — guard is at an unknown location. Require GPS so we have
      // somewhere to centre the pending geofence.
      if (body.latitude == null || body.longitude == null) {
        return reply.code(400).send({
          error: 'Bad request',
          message: 'Latitude and longitude are required when checking in at a new location.',
          statusCode: 400,
        })
      }
      const ts = new Date()
      const label = `Pending site · ${ts.toISOString().slice(0, 16).replace('T', ' ')}`
      const [pending] = await db
        .insert(sites)
        .values({
          tenantId: payload.tenantId,
          clientId: null,
          name: label,
          // Admin will fill the real address from the map on /sites/:id.
          address: `${body.latitude.toFixed(6)}, ${body.longitude.toFixed(6)}`,
          latitude: body.latitude,
          longitude: body.longitude,
          geofenceRadiusMeters: 200,
          status: 'pending',
        })
        .returning()
      site = pending
      createdPendingSite = true
    }

    let isWithinGeofence: boolean | null = null
    let distanceMeters: number | null = null
    if (body.latitude != null && body.longitude != null && site.latitude && site.longitude) {
      distanceMeters = Math.round(haversineMeters(body.latitude, body.longitude, Number(site.latitude), Number(site.longitude)))
      isWithinGeofence = distanceMeters <= (site.geofenceRadiusMeters ?? 200)
    }

    // For freshly-created pending sites the guard is by definition at the
    // centre point we just dropped — skip the out-of-zone reason gate.
    if (!createdPendingSite && isWithinGeofence === false && !body.outOfZoneReason) {
      return reply.code(400).send({
        error: 'Bad request',
        message: 'A reason is required when checking in outside the site geofence.',
        statusCode: 400,
      })
    }

    // Upload image to R2 before writing DB records
    const { buffer, contentType } = dataUrlToBuffer(body.imageData)
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
    // Key: {tenantId}/selfies/{YYYY-MM-DD}/{guardId}-{timestamp}.jpg
    const ext = contentType === 'image/png' ? 'png' : 'jpg'
    const imageKey = `${payload.tenantId}/selfies/${dateStr}/${payload.sub}-${now.getTime()}.${ext}`

    await putObject(imageKey, buffer, contentType)

    const result = await db.transaction(async (tx) => {
      const [attendance] = await tx
        .insert(attendanceRecords)
        .values({
          tenantId: payload.tenantId,
          guardId: payload.sub,
          siteId: site!.id,
          type: body.checkType,
          method: 'face',
          latitude: body.latitude,
          longitude: body.longitude,
          isWithinGeofence,
          outOfZoneReason: isWithinGeofence === false ? body.outOfZoneReason ?? null : null,
          verifiedAt: now,
          selfieReviewStatus: 'pending',
        })
        .returning()

      const [selfie] = await tx
        .insert(selfieRecords)
        .values({
          tenantId: payload.tenantId,
          guardId: payload.sub,
          siteId: site!.id,
          attendanceRecordId: attendance.id,
          checkType: body.checkType,
          imageKey,
          latitude: body.latitude,
          longitude: body.longitude,
          capturedAt: now,
        })
        .returning()

      return { selfie, attendance, distanceMeters, isWithinGeofence, createdPendingSite, siteId: site!.id }
    })

    return reply.code(201).send({ data: result })
  })

  // GET / — supervisor/admin lists selfies (no image data, just metadata + presigned URL)
  fastify.get('/', { preHandler: requireSupervisor }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({
      guardId: z.string().optional(),
      siteId: z.string().optional(),
      limit: z.coerce.number().default(50),
    }).parse(request.query)

    const conditions = [eq(selfieRecords.tenantId, payload.tenantId)]
    if (query.guardId) conditions.push(eq(selfieRecords.guardId, query.guardId))
    if (query.siteId) conditions.push(eq(selfieRecords.siteId, query.siteId))

    const rows = await db
      .select({
        id: selfieRecords.id,
        guardId: selfieRecords.guardId,
        guardName: users.name,
        siteId: selfieRecords.siteId,
        siteName: sites.name,
        attendanceRecordId: selfieRecords.attendanceRecordId,
        checkType: selfieRecords.checkType,
        imageKey: selfieRecords.imageKey,
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

    // Attach a short-lived presigned URL to each row
    const withUrls = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        imageUrl: await getDownloadUrl(r.imageKey).catch(() => null),
      })),
    )

    return reply.send({ data: withUrls })
  })

  // GET /:id — single selfie with presigned image URL
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
        imageKey: selfieRecords.imageKey,
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

    const imageUrl = await getDownloadUrl(row.imageKey).catch(() => null)
    return reply.send({ data: { ...row, imageUrl } })
  })

}
