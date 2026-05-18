import type { FastifyRequest, FastifyReply } from 'fastify'
import type { UserRole } from '@secureops/shared'
import { db, supervisorSites } from '@secureops/db'
import { eq } from 'drizzle-orm'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized', message: 'Valid token required', statusCode: 401 })
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply)
    const payload = request.user as { role: UserRole }
    if (!roles.includes(payload.role)) {
      reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions', statusCode: 403 })
    }
  }
}

export function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('platform_admin')(request, reply)
}

export function requireTenantAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('platform_admin', 'tenant_admin')(request, reply)
}

export function requireSupervisor(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('platform_admin', 'tenant_admin', 'supervisor')(request, reply)
}

/**
 * Returns null for admins (no scoping needed).
 * Returns string[] of site IDs for supervisors (may be empty).
 */
export async function getSupervisorSiteIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  if (role === 'platform_admin' || role === 'tenant_admin') return null
  if (role !== 'supervisor') return null
  const rows = await db
    .select({ siteId: supervisorSites.siteId })
    .from(supervisorSites)
    .where(eq(supervisorSites.supervisorId, userId))
  return rows.map((r) => r.siteId)
}
