import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, users, tenants, refreshTokens } from '@secureops/db'
import { eq, and } from 'drizzle-orm'
import { createHash, randomBytes } from 'crypto'
import { hash, verify, Algorithm } from '@node-rs/argon2'
import { appendAuditEntry } from '../lib/audit'
import { putObject } from '../lib/storage'

const ARGON2_OPTIONS = { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }

async function hashPassword(pw: string): Promise<string> {
  return hash(pw, ARGON2_OPTIONS)
}

async function verifyPassword(stored: string, input: string): Promise<boolean> {
  // Legacy SHA-256 hash (migration path)
  if (!stored.startsWith('$argon2')) {
    const legacy = createHash('sha256').update(input + process.env.PASSWORD_SALT!).digest('hex')
    return stored === legacy
  }
  return verify(stored, input)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
})

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
  phone: z.string().trim().min(7).max(20),
  role: z.enum(['guard', 'supervisor', 'tenant_admin']),
  tenantSlug: z.string(),
  // base64 data URL: "data:image/jpeg;base64,...."
  profilePhoto: z.string().regex(/^data:image\/(jpeg|jpg|png);base64,/, 'Invalid image data'),
})

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const [header, b64] = dataUrl.split(',')
  const contentType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  return { buffer: Buffer.from(b64, 'base64'), contentType }
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)

    const [tenant] = await db
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.slug, body.tenantSlug))
      .limit(1)
    if (!tenant || tenant.status === 'suspended') {
      return reply.code(400).send({ error: 'Bad Request', message: 'Registration unavailable', statusCode: 400 })
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, body.email), eq(users.tenantId, tenant.id)))
      .limit(1)
    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'Email already registered', statusCode: 409 })
    }

    // Upload registration selfie to object storage before we create the user row
    const { buffer, contentType } = dataUrlToBuffer(body.profilePhoto)
    const ext = contentType === 'image/png' ? 'png' : 'jpg'
    const profilePhotoKey = `${tenant.id}/profile-photos/${randomBytes(12).toString('hex')}-${Date.now()}.${ext}`
    await putObject(profilePhotoKey, buffer, contentType)

    const [user] = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email,
        phone: body.phone,
        role: body.role,
        tenantId: tenant.id,
        passwordHash: await hashPassword(body.password),
        profilePhotoKey,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        tenantId: users.tenantId,
        profilePhotoKey: users.profilePhotoKey,
      })

    const accessToken = fastify.jwt.sign(
      { sub: user.id, tenantId: user.tenantId, role: user.role },
      { expiresIn: '24h' }
    )

    appendAuditEntry({ tenantId: tenant.id, userId: user.id, action: 'user.register', resourceType: 'user', resourceId: user.id })

    return reply.code(201).send({ data: { token: accessToken, user } })
  })

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
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials', statusCode: 401 })
    }

    const valid = await verifyPassword(user.passwordHash ?? '', body.password)
    if (!valid) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials', statusCode: 401 })
    }

    // Zero-downtime migration: rehash SHA-256 passwords to Argon2id on successful login
    if (user.passwordHash && !user.passwordHash.startsWith('$argon2')) {
      const newHash = await hashPassword(body.password)
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id))
    }

    const accessToken = fastify.jwt.sign(
      { sub: user.id, tenantId: user.tenantId, role: user.role },
      { expiresIn: '24h' }
    )

    // Issue refresh token
    const rawRefresh = randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    await db.insert(refreshTokens).values({
      userId: user.id,
      tenantId: user.tenantId!,
      tokenHash: hashToken(rawRefresh),
      expiresAt,
    })

    appendAuditEntry({ tenantId: user.tenantId!, userId: user.id, action: 'user.login', resourceType: 'user', resourceId: user.id })

    return reply.send({
      data: {
        token: accessToken,
        refreshToken: rawRefresh,
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

  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body)
    const tokenHash = hashToken(refreshToken)

    const [stored] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired refresh token', statusCode: 401 })
    }

    const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1)
    if (!user) return reply.code(401).send({ error: 'Unauthorized', message: 'User not found', statusCode: 401 })

    // Rotate: revoke old, issue new
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash))

    const newRaw = randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await db.insert(refreshTokens).values({
      userId: user.id,
      tenantId: user.tenantId!,
      tokenHash: hashToken(newRaw),
      expiresAt,
    })

    const accessToken = fastify.jwt.sign(
      { sub: user.id, tenantId: user.tenantId, role: user.role },
      { expiresIn: '24h' }
    )

    return reply.send({ data: { token: accessToken, refreshToken: newRaw } })
  })

  fastify.get('/me', {
    preHandler: async (request, reply) => { await request.jwtVerify() },
  }, async (request, reply) => {
    const payload = request.user as { sub: string }
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
    if (!user) return reply.code(404).send({ error: 'Not found', message: 'User not found', statusCode: 404 })
    const { passwordHash, ...safeUser } = user
    return reply.send({ data: safeUser })
  })

  fastify.post('/logout', {
    preHandler: async (request, reply) => {
      try { await request.jwtVerify() } catch { /* allow logout even with invalid token */ }
    },
  }, async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string().optional() }).parse(request.body ?? {})
    if (refreshToken) {
      await db.update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
    }
    return reply.send({ data: { message: 'Logged out' } })
  })
}
