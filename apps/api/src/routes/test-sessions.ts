import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, testSessions } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'

// /api/test-sessions
//
// Stores movement-classifier test runs server-side so an in-progress session
// survives the user closing/reopening the app. Each session is scoped to one
// user; nothing here is visible to anyone else (a guard sees only their own,
// a supervisor sees only their own, etc.). This is intentional — test runs
// are noisy and only useful to whoever ran them.

const sampleSchema = z.object({
  ts: z.number(),                                          // ms-epoch from device
  activity: z.enum(['walking', 'driving', 'idle', 'unknown']),
  confidence: z.number().min(0).max(100).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  speed: z.number().optional(),
})

type Sample = z.infer<typeof sampleSchema>

// Buckets a stream of (ts, activity) samples by time elapsed between
// consecutive entries. The activity assigned to the EARLIER sample is
// credited the gap until the next one. The final sample's gap is until
// `endedAt` (or until "now" if the session is still open).
function aggregate(samples: Sample[], endedAt: number): {
  walkingSeconds: number; drivingSeconds: number; idleSeconds: number
} {
  const out = { walkingSeconds: 0, drivingSeconds: 0, idleSeconds: 0 }
  if (samples.length === 0) return out
  // Sort just in case the client posted out of order
  const sorted = [...samples].sort((a, b) => a.ts - b.ts)
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    const nextTs = i + 1 < sorted.length ? sorted[i + 1].ts : endedAt
    const gapMs = Math.max(0, nextTs - s.ts)
    const secs = gapMs / 1000
    if (s.activity === 'walking') out.walkingSeconds += secs
    else if (s.activity === 'driving') out.drivingSeconds += secs
    else if (s.activity === 'idle') out.idleSeconds += secs
    // 'unknown' contributes to nothing
  }
  out.walkingSeconds = Math.round(out.walkingSeconds)
  out.drivingSeconds = Math.round(out.drivingSeconds)
  out.idleSeconds   = Math.round(out.idleSeconds)
  return out
}

export const testSessionsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST / — start a new session
  fastify.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const [row] = await db
      .insert(testSessions)
      .values({
        tenantId: payload.tenantId,
        userId: payload.sub,
        samples: [] as any,
      })
      .returning()
    return reply.code(201).send({ data: row })
  })

  // POST /:id/samples — append samples (batched). Aggregates are recomputed
  // on every batch so the GET endpoint always has a fresh snapshot, even
  // while the session is still open.
  fastify.post('/:id/samples', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const { id } = request.params as { id: string }
    const body = z.object({ samples: z.array(sampleSchema).min(1).max(500) }).parse(request.body)

    const [existing] = await db
      .select()
      .from(testSessions)
      .where(and(eq(testSessions.id, id), eq(testSessions.tenantId, payload.tenantId)))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'Not found', message: 'Session not found', statusCode: 404 })
    if (existing.userId !== payload.sub) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Not your session', statusCode: 403 })
    }
    if (existing.endedAt) {
      return reply.code(400).send({ error: 'Bad request', message: 'Session already ended', statusCode: 400 })
    }

    const merged = [...(existing.samples as any as Sample[]), ...body.samples]
    const agg = aggregate(merged, Date.now())

    const [row] = await db
      .update(testSessions)
      .set({
        samples: merged as any,
        walkingSeconds: agg.walkingSeconds,
        drivingSeconds: agg.drivingSeconds,
        idleSeconds:    agg.idleSeconds,
      })
      .where(eq(testSessions.id, id))
      .returning()
    return reply.send({ data: { id: row.id, ...agg, sampleCount: merged.length } })
  })

  // PATCH /:id/end — mark session ended, final aggregate
  fastify.patch('/:id/end', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const { id } = request.params as { id: string }
    const [existing] = await db
      .select()
      .from(testSessions)
      .where(and(eq(testSessions.id, id), eq(testSessions.tenantId, payload.tenantId)))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'Not found', message: 'Session not found', statusCode: 404 })
    if (existing.userId !== payload.sub) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Not your session', statusCode: 403 })
    }
    if (existing.endedAt) {
      return reply.send({ data: existing })
    }
    const endedAt = new Date()
    const agg = aggregate(existing.samples as any as Sample[], endedAt.getTime())
    const [row] = await db
      .update(testSessions)
      .set({
        endedAt,
        walkingSeconds: agg.walkingSeconds,
        drivingSeconds: agg.drivingSeconds,
        idleSeconds:    agg.idleSeconds,
      })
      .where(eq(testSessions.id, id))
      .returning()
    return reply.send({ data: row })
  })

  // GET / — list the caller's recent sessions. Returns metadata only (no
  // samples) so the list view stays light.
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const { limit } = z.object({ limit: z.coerce.number().min(1).max(100).default(20) }).parse(request.query)
    const rows = await db
      .select({
        id:              testSessions.id,
        startedAt:       testSessions.startedAt,
        endedAt:         testSessions.endedAt,
        walkingSeconds:  testSessions.walkingSeconds,
        drivingSeconds:  testSessions.drivingSeconds,
        idleSeconds:     testSessions.idleSeconds,
      })
      .from(testSessions)
      .where(and(eq(testSessions.tenantId, payload.tenantId), eq(testSessions.userId, payload.sub)))
      .orderBy(desc(testSessions.startedAt))
      .limit(limit)
    return reply.send({ data: rows })
  })

  // GET /:id — single session with samples (for the per-session graph)
  fastify.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string }
    const { id } = request.params as { id: string }
    const [row] = await db
      .select()
      .from(testSessions)
      .where(and(eq(testSessions.id, id), eq(testSessions.tenantId, payload.tenantId)))
      .limit(1)
    if (!row) return reply.code(404).send({ error: 'Not found', message: 'Session not found', statusCode: 404 })
    if (row.userId !== payload.sub) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Not your session', statusCode: 403 })
    }
    return reply.send({ data: row })
  })
}
