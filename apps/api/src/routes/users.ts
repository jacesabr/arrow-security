import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, users } from '@secureops/db'
import { eq, and, inArray, or } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin, getSupervisorGuardIds } from '../lib/auth'
import { hash, Algorithm } from '@node-rs/argon2'
import { getDownloadUrl } from '../lib/storage'

async function hashPassword(pw: string): Promise<string> {
  return hash(pw, { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
}

const createUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  name: z.string().min(2),
  role: z.enum(['tenant_admin', 'supervisor', 'guard', 'client_viewer']),
  password: z.string().min(8),
})

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { tenantId: string; sub: string; role: string }

    const conditions = [eq(users.tenantId, payload.tenantId)]

    if (payload.role === 'guard') {
      // Guards only see themselves
      conditions.push(eq(users.id, payload.sub))
    } else if (payload.role === 'supervisor') {
      // Supervisors see their guards + themselves
      const guardIds = await getSupervisorGuardIds(payload.sub, payload.role)
      if (!guardIds || guardIds.length === 0) {
        conditions.push(eq(users.id, payload.sub))
      } else {
        conditions.push(or(inArray(users.id, guardIds), eq(users.id, payload.sub))!)
      }
    }
    // admins see all tenant users (no extra condition)

    const all = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        tenantId: users.tenantId,
        faceEnrolled: users.faceEnrolled,
        profilePhotoKey: users.profilePhotoKey,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(users.name)

    const withPhotos = await Promise.all(
      all.map(async (u) => ({
        ...u,
        profilePhotoUrl: u.profilePhotoKey
          ? await getDownloadUrl(u.profilePhotoKey).catch(() => null)
          : null,
      })),
    )
    return reply.send({ data: withPhotos })
  })

  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = createUserSchema.parse(request.body)
    const { password, ...rest } = body
    const [user] = await db
      .insert(users)
      .values({ ...rest, tenantId: payload.tenantId, passwordHash: await hashPassword(password) })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        tenantId: users.tenantId,
        faceEnrolled: users.faceEnrolled,
        createdAt: users.createdAt,
      })
    return reply.code(201).send({ data: user })
  })

  fastify.patch('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string }
    const body = createUserSchema.omit({ password: true }).partial().extend({
      password: z.string().min(8).optional(),
    }).parse(request.body)
    const { password, ...rest } = body
    const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() }
    if (password) updates.passwordHash = await hashPassword(password)
    const [user] = await db
      .update(users)
      .set(updates)
      .where(and(eq(users.id, id), eq(users.tenantId, payload.tenantId)))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        faceEnrolled: users.faceEnrolled,
      })
    if (!user) return reply.code(404).send({ error: 'Not found', message: 'User not found', statusCode: 404 })
    return reply.send({ data: user })
  })

  fastify.patch('/me/fcm-token', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { sub: string; tenantId: string }
    const { token } = z.object({ token: z.string().min(1) }).parse(request.body)
    const [updated] = await db
      .update(users)
      .set({ fcmToken: token, updatedAt: new Date() })
      .where(and(eq(users.id, payload.sub), eq(users.tenantId, payload.tenantId)))
      .returning({ id: users.id })
    if (!updated) return reply.code(404).send({ error: 'Not found', message: 'User not found', statusCode: 404 })
    return reply.send({ data: { ok: true } })
  })
}
