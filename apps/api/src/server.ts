import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'

import tenantPlugin from './plugins/tenant'
import { authRoutes } from './routes/auth'
import { tenantsRoutes } from './routes/tenants'
import { sitesRoutes } from './routes/sites'
import { usersRoutes } from './routes/users'
import { attendanceRoutes } from './routes/attendance'
import { patrolRoutes } from './routes/patrol'
import { incidentsRoutes } from './routes/incidents'
import { shiftsRoutes } from './routes/shifts'
import { camerasRoutes } from './routes/cameras'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

async function build() {
  await app.register(helmet)
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  })
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
  await app.register(jwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '24h' },
  })

  await app.register(tenantPlugin)

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(tenantsRoutes, { prefix: '/api/tenants' })
  await app.register(sitesRoutes, { prefix: '/api/sites' })
  await app.register(usersRoutes, { prefix: '/api/users' })
  await app.register(attendanceRoutes, { prefix: '/api/attendance' })
  await app.register(patrolRoutes, { prefix: '/api/patrol' })
  await app.register(incidentsRoutes, { prefix: '/api/incidents' })
  await app.register(shiftsRoutes, { prefix: '/api/shifts' })
  await app.register(camerasRoutes, { prefix: '/api/cameras' })

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  return app
}

async function start() {
  const server = await build()
  try {
    await server.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' })
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
