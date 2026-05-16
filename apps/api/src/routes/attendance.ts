import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, attendanceRecords } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'
import { SLA_HOURS } from '@secureops/shared'

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

    const [record] = await db
      .insert(attendanceRecords)
      .values({
        ...body,
        tenantId: payload.tenantId,
        guardId: payload.sub,
        verifiedAt: new Date(),
      })
      .returning()

    return reply.code(201).send({ data: record })
  })
}
