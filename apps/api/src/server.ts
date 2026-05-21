import 'dotenv/config'
import path from 'path'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { db, tenants, seed } from '@secureops/db'
import { count } from 'drizzle-orm'

import tenantPlugin from './plugins/tenant'
import { authRoutes } from './routes/auth'
import { sitesRoutes } from './routes/sites'
import { usersRoutes } from './routes/users'
import { attendanceRoutes } from './routes/attendance'
import { patrolRoutes } from './routes/patrol'
import { incidentsRoutes } from './routes/incidents'
import { shiftsRoutes } from './routes/shifts'
import { locationsRoutes } from './routes/locations'
import { statsRoutes } from './routes/stats'
import { clientsRoutes } from './routes/clients'
import { supervisorSitesRoutes } from './routes/supervisor-sites'
import { leaveRequestsRoutes } from './routes/leave-requests'
import { payrollRoutes } from './routes/payroll'
import { certificationsRoutes } from './routes/certifications'
import { postOrdersRoutes } from './routes/post-orders'
import { guardStatsRoutes } from './routes/guard-stats'
import { siteStatsRoutes } from './routes/site-stats'
import { passdownsRoutes } from './routes/passdowns'
import { exceptionsRoutes } from './routes/exceptions'
import { auditLogRoutes } from './routes/audit-log'
import { shiftTemplatesRoutes } from './routes/shift-templates'
import { incidentFormsRoutes } from './routes/incident-forms'
import { uploadRoutes } from './routes/upload'
import { guardStatusRoutes } from './routes/guard-status'
import { appUpdateRoutes } from './routes/app-update'
import { selfiesRoutes } from './routes/selfies'
import { ensureBucket } from './lib/storage'

const app = Fastify({
  // 6 MB — selfie data URLs (base64) for check-in / registration
  bodyLimit: 6 * 1024 * 1024,
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

async function build() {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const str = (body as string).trim()
    if (str.length === 0) return done(null, {})
    try {
      done(null, JSON.parse(str))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  // In dev, disable HSTS + the upgrade-insecure-requests CSP directive — both
  // cause the browser to silently rewrite http://localhost:4000 to https and
  // fail with "Client network socket disconnected before secure TLS connection
  // was established". Production still gets the strict defaults.
  const isProd = process.env.NODE_ENV === 'production'
  await app.register(helmet, isProd ? undefined : {
    contentSecurityPolicy: false,
    strictTransportSecurity: false,
  })
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  })
  await app.register(jwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '24h' },
  })

  await app.register(tenantPlugin)

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(sitesRoutes, { prefix: '/api/sites' })
  await app.register(usersRoutes, { prefix: '/api/users' })
  await app.register(attendanceRoutes, { prefix: '/api/attendance' })
  await app.register(patrolRoutes, { prefix: '/api/patrol' })
  await app.register(incidentsRoutes, { prefix: '/api/incidents' })
  await app.register(shiftsRoutes, { prefix: '/api/shifts' })
  await app.register(statsRoutes, { prefix: '/api/stats' })
  await app.register(clientsRoutes, { prefix: '/api/clients' })
  await app.register(supervisorSitesRoutes, { prefix: '/api/supervisor-sites' })
  await app.register(locationsRoutes, { prefix: '/api/locations' })
  await app.register(leaveRequestsRoutes, { prefix: '/api/leave-requests' })
  await app.register(payrollRoutes, { prefix: '/api/payroll' })
  await app.register(certificationsRoutes, { prefix: '/api/certifications' })
  await app.register(postOrdersRoutes, { prefix: '/api/post-orders' })
  await app.register(guardStatsRoutes, { prefix: '/api/guard-stats' })
  await app.register(siteStatsRoutes, { prefix: '/api/site-stats' })
  await app.register(passdownsRoutes, { prefix: '/api/passdowns' })
  await app.register(exceptionsRoutes, { prefix: '/api/exceptions' })
  await app.register(auditLogRoutes, { prefix: '/api/audit-log' })
  await app.register(shiftTemplatesRoutes, { prefix: '/api/shift-templates' })
  await app.register(incidentFormsRoutes, { prefix: '/api/incident-forms' })
  await app.register(uploadRoutes, { prefix: '/api/upload' })
  await app.register(guardStatusRoutes, { prefix: '/api/guard-status' })
  await app.register(appUpdateRoutes, { prefix: '/api/app-update' })
  await app.register(selfiesRoutes, { prefix: '/api/selfies' })

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  return app
}

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL!
  const sql = postgres(connectionString, { max: 1 })
  const migrateDb = drizzle(sql)
  const migrationsFolder = path.join(__dirname, '../../../packages/db/src/migrations')
  try {
    // One-shot reconciliation: when the migration history is consolidated
    // (e.g. the old 0000–0009 chain replaced with a single baseline), the
    // existing `drizzle.__drizzle_migrations` rows no longer match the journal
    // and Drizzle refuses to boot. Setting RESET_DRIZZLE_MIGRATIONS=true on the
    // next deploy clears those rows so the new baseline records cleanly. The
    // new baseline is idempotent (DO $$ + IF NOT EXISTS), so re-running it
    // against an existing schema is a no-op. Remove the env var after one
    // successful deploy.
    if (process.env.RESET_DRIZZLE_MIGRATIONS === 'true') {
      console.warn('RESET_DRIZZLE_MIGRATIONS=true — clearing drizzle.__drizzle_migrations before migrate')
      await sql.unsafe('DELETE FROM drizzle.__drizzle_migrations')
    }
    await migrate(migrateDb, { migrationsFolder })
    console.log('Migrations complete.')

    // Seed if database is empty (first deploy) — opt out by setting SKIP_AUTO_SEED=true
    if (process.env.SKIP_AUTO_SEED !== 'true') {
      const [{ value: tenantCount }] = await db.select({ value: count() }).from(tenants)
      if (tenantCount === 0) {
        await seed()
      }
    }
  } finally {
    await sql.end()
  }
}

async function start() {
  await runMigrations()
  const server = await build()
  try {
    await ensureBucket()
  } catch (err) {
    server.log.warn({ err }, 'MinIO bucket init failed — uploads will not work until MinIO is reachable')
  }
  try {
    await server.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' })
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
