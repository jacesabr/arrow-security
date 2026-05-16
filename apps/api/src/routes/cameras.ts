import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, cameras } from '@secureops/db'
import { eq, and } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin } from '../lib/auth'

export const camerasRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const query = z.object({ siteId: z.string().optional() }).parse(request.query)
    const conditions = [eq(cameras.tenantId, payload.tenantId)]
    if (query.siteId) conditions.push(eq(cameras.siteId, query.siteId))
    const all = await db.select().from(cameras).where(and(...conditions)).orderBy(cameras.name)
    return reply.send({ data: all })
  })

  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = z.object({
      siteId: z.string(),
      name: z.string(),
      rtspUrl: z.string(),
      frigateId: z.string().optional(),
      go2rtcStream: z.string().optional(),
    }).parse(request.body)
    const [camera] = await db.insert(cameras).values({ ...body, tenantId: payload.tenantId }).returning()
    return reply.code(201).send({ data: camera })
  })

  // Webhook from Frigate MQTT bridge — update camera status
  fastify.post('/frigate-event', async (request, reply) => {
    const body = z.object({
      after: z.object({
        camera: z.string(),
        label: z.string(),
        score: z.number(),
        id: z.string(),
      }),
    }).safeParse(request.body)

    if (!body.success) return reply.code(400).send({ error: 'Invalid payload' })

    // TODO: fan out to Novu notification + Zammad ticket creation
    fastify.log.info({ event: body.data }, 'Frigate event received')
    return reply.send({ ok: true })
  })
}
