import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, users, tenants } from '@secureops/db'
import { eq, and } from 'drizzle-orm'
import { createHash } from 'crypto'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenantSlug: z.string().optional(),
})

function hashPassword(pw: string): string {
  return createHash('sha256').update(pw + process.env.PASSWORD_SALT!).digest('hex')
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    let tenantId: string | null = null
    if (body.tenantSlug) {
      const [tenant] = await db
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.slug, body.tenantSlug))
        .limit(1)
      if (!tenant || tenant.status === 'suspended') {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Tenant not found or suspended', statusCode: 401 })
      }
      tenantId = tenant.id
    }

    const conditions = tenantId
      ? and(eq(users.email, body.email), eq(users.tenantId, tenantId))
      : eq(users.email, body.email)

    const [user] = await db.select().from(users).where(conditions).limit(1)

    if (!user || user.passwordHash !== hashPassword(body.password)) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials', statusCode: 401 })
    }

    const token = fastify.jwt.sign({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    })

    return reply.send({
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          faceEnrolled: user.faceEnrolled,
        },
      },
    })
  })

  fastify.get('/me', {
    preHandler: async (request, reply) => {
      await request.jwtVerify()
    },
  }, async (request, reply) => {
    const payload = request.user as { sub: string }
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
    if (!user) return reply.code(404).send({ error: 'Not found', message: 'User not found', statusCode: 404 })
    const { passwordHash, ...safeUser } = user
    return reply.send({ data: safeUser })
  })

  fastify.post('/logout', async (_request, reply) => {
    return reply.send({ data: { message: 'Logged out' } })
  })
}
