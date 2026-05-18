import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, appReleases } from '@secureops/db'
import { eq, desc, ne } from 'drizzle-orm'
import multipart from '@fastify/multipart'

const API_BASE = process.env.API_URL ?? 'https://arrow-security-api.onrender.com/api'

function requireUpdateToken(token: string | undefined): boolean {
  const expected = process.env.APP_UPDATE_TOKEN
  return !!expected && token === expected
}

export const appUpdateRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20 MB max

  // POST / — Capgo plugin calls this on every app launch to check for updates.
  // Body includes version_name (current bundle on device). Only returns a URL when a newer
  // version is available; returns {} otherwise so the plugin skips the download.
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, string> | undefined
    const deviceVersion = body?.version_name ?? ''

    const [current] = await db
      .select({ version: appReleases.version })
      .from(appReleases)
      .where(eq(appReleases.isCurrent, true))
      .limit(1)

    // No bundle published yet, or device already has the latest — nothing to do.
    if (!current || deviceVersion === current.version) {
      return reply.send({})
    }

    return reply.send({
      version: current.version,
      url: `${API_BASE}/app-update/bundle`,
    })
  })

  // GET /bundle — download the current JS bundle zip (called by Capgo plugin after update check)
  fastify.get('/bundle', async (request, reply) => {
    const [current] = await db
      .select({ bundleData: appReleases.bundleData, version: appReleases.version })
      .from(appReleases)
      .where(eq(appReleases.isCurrent, true))
      .limit(1)

    if (!current) {
      return reply.code(404).send({ error: 'No bundle available' })
    }

    const buffer = Buffer.from(current.bundleData, 'base64')
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="bundle-${current.version}.zip"`)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(buffer)
  })

  // POST /publish — CI posts the new bundle here after each build.
  // Protected by X-Update-Token header matching APP_UPDATE_TOKEN env var.
  fastify.post('/publish', async (request, reply) => {
    if (!requireUpdateToken(request.headers['x-update-token'] as string)) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const query = z.object({ version: z.string().min(1) }).parse(request.query)

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No file uploaded' })

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    const buf = Buffer.concat(chunks)

    if (buf.length === 0) return reply.code(400).send({ error: 'Empty bundle' })

    // Mark all existing releases as not current
    await db.update(appReleases).set({ isCurrent: false })

    // Insert new release as current
    await db.insert(appReleases).values({
      version: query.version,
      bundleData: buf.toString('base64'),
      bundleSize: buf.length,
      isCurrent: true,
    })

    // Keep only the 3 most recent old releases to avoid unbounded DB growth
    const old = await db
      .select({ id: appReleases.id })
      .from(appReleases)
      .where(ne(appReleases.isCurrent, true))
      .orderBy(desc(appReleases.createdAt))
      .offset(3)

    for (const row of old) {
      await db.delete(appReleases).where(eq(appReleases.id, row.id))
    }

    fastify.log.info({ version: query.version, sizeKB: Math.round(buf.length / 1024) }, 'app bundle published')
    return reply.code(201).send({ data: { version: query.version, sizeBytes: buf.length } })
  })
}
