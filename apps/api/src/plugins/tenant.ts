import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { db } from '@secureops/db'
import { tenants } from '@secureops/db'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string | null
    userRole: string | null
  }
}

// Resolve tenant from subdomain: tenant-slug.secureops.in → look up slug
const tenantPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('tenantId', null)
  fastify.decorateRequest('userRole', null)

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const host = request.hostname // e.g. "acme.secureops.in"
    const subdomain = host.split('.')[0]

    if (subdomain && subdomain !== 'api' && subdomain !== 'localhost') {
      const [tenant] = await db
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.slug, subdomain))
        .limit(1)

      if (tenant && tenant.status === 'active') {
        request.tenantId = tenant.id
      }
    }
  })
}

// Set Postgres session variables for RLS before each query
export async function withTenantContext<T>(
  tenantId: string,
  userRole: string,
  fn: (sql: ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  try {
    await sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await sql`SELECT set_config('app.user_role', ${userRole}, true)`
    return await fn(sql)
  } finally {
    await sql.end()
  }
}

export default fp(tenantPlugin, { name: 'tenant' })
export { tenantPlugin }
