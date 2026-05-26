import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../lib/auth'
import { getUploadPresignedUrl, getDownloadUrl } from '../lib/storage'

const presignBodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  folder: z.enum(['selfies', 'documents']),
})

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-]/g, '_')
}

export const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/presign', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = presignBodySchema.parse(request.body)

    const sanitized = sanitizeFilename(body.filename)
    const key = `${payload.tenantId}/${body.folder}/${Date.now()}-${sanitized}`

    const uploadUrl = await getUploadPresignedUrl(key, body.contentType)

    return reply.code(200).send({
      data: {
        uploadUrl,
        key,
        expiresIn: 300,
      },
    })
  })

  fastify.get('/url', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const { key } = z.object({ key: z.string().min(1) }).parse(request.query)

    // Ensure the key belongs to this tenant
    if (!key.startsWith(`${payload.tenantId}/`)) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Key does not belong to your tenant', statusCode: 403 })
    }

    const url = await getDownloadUrl(key)

    return reply.send({ data: { url } })
  })
}
