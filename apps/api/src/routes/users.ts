import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, users } from '@secureops/db'
import { eq, and } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin } from '../lib/auth'
import { createHash } from 'crypto'

function hashPassword(pw: string): string {
  return createHash('sha256').update(pw + process.env.PASSWORD_SALT!).digest('hex')
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
    const payload = request.user as { tenantId: string; role: string }
    const all = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        tenantId: users.tenantId,
        faceEnrolled: users.faceEnrolled,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        payload.role === 'platform_admin' ? undefined : eq(users.tenantId, payload.tenantId),
      )
      .orderBy(users.name)
    return reply.send({ data: all })
  })

  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const payload = request.user as { tenantId: string }
    const body = createUserSchema.parse(request.body)
    const { password, ...rest } = body
    const [user] = await db
      .insert(users)
      .values({ ...rest, tenantId: payload.tenantId, passwordHash: hashPassword(password) })
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
    const body = createUserSchema.omit({ password: true }).partial().parse(request.body)
    const [user] = await db
      .update(users)
      .set({ ...body, updatedAt: new Date() })
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
}
