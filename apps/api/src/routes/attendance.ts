import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, attendanceRecords, sites } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'

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
}
