import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createHash } from 'crypto'
import * as schema from './schema'

function hashPw(pw: string) {
  const salt = process.env.PASSWORD_SALT ?? 'secureops-dev-salt'
  return createHash('sha256').update(pw + salt).digest('hex')
}

export async function seed(connectionString?: string) {
  const url = connectionString ?? process.env.DATABASE_URL ?? 'postgresql://secureops:secureops@localhost:5432/secureops'
  const sql = postgres(url, { max: 1 })
  const db = drizzle(sql, { schema })
  console.log('🌱 Seeding database...')

  // Platform admin
  await db.insert(schema.users).values({
    email: 'admin@secureops.in',
    name: 'Platform Admin',
    role: 'platform_admin',
    passwordHash: hashPw('admin123'),
  }).onConflictDoNothing()

  // Demo tenant
  const [tenant] = await db.insert(schema.tenants).values({
    name: 'Acme Security',
    slug: 'acme',
    tier: 'silver',
    frappeSiteUrl: 'http://acme.localhost:8000',
    zammadUrl: 'http://acme.zammad.localhost',
    status: 'active',
  }).onConflictDoNothing().returning()

  if (!tenant) {
    console.log('Tenant already exists, skipping...')
    await sql.end()
    return
  }

  // Tenant admin
  const [tenantAdmin] = await db.insert(schema.users).values({
    tenantId: tenant.id,
    email: 'admin@acme.secureops.in',
    name: 'Acme Admin',
    role: 'tenant_admin',
    passwordHash: hashPw('acme123'),
  }).returning()

  // Supervisor
  const [supervisor] = await db.insert(schema.users).values({
    tenantId: tenant.id,
    email: 'supervisor@acme.secureops.in',
    name: 'Rajesh Kumar',
    role: 'supervisor',
    passwordHash: hashPw('super123'),
    phone: '+91 98765 43210',
  }).returning()

  // Guards
  const guards = await db.insert(schema.users).values([
    { tenantId: tenant.id, email: 'guard1@acme.secureops.in', name: 'Arun Sharma', role: 'guard', passwordHash: hashPw('guard123'), phone: '+91 98765 11111' },
    { tenantId: tenant.id, email: 'guard2@acme.secureops.in', name: 'Vikram Singh', role: 'guard', passwordHash: hashPw('guard123'), phone: '+91 98765 22222' },
    { tenantId: tenant.id, email: 'guard3@acme.secureops.in', name: 'Priya Nair', role: 'guard', passwordHash: hashPw('guard123'), phone: '+91 98765 33333' },
  ]).returning()

  // Client
  const [client] = await db.insert(schema.clients).values({
    tenantId: tenant.id,
    name: 'Phoenix Mall',
    contactName: 'Sanjay Mehta',
    contactEmail: 'sanjay@phoenixmall.com',
    contactPhone: '+91 98765 99999',
  }).returning()

  // Sites
  const [site1, site2] = await db.insert(schema.sites).values([
    {
      tenantId: tenant.id,
      clientId: client.id,
      name: 'Main Entrance',
      address: 'Phoenix Mall, Velachery, Chennai - 600042',
      latitude: 12.9824,
      longitude: 80.2209,
      geofenceRadiusMeters: 150,
    },
    {
      tenantId: tenant.id,
      clientId: client.id,
      name: 'Parking Level B2',
      address: 'Phoenix Mall Basement 2, Chennai',
      latitude: 12.9820,
      longitude: 80.2205,
      geofenceRadiusMeters: 200,
    },
  ]).returning()

  // Checkpoints for site1
  await db.insert(schema.checkpoints).values([
    { tenantId: tenant.id, siteId: site1.id, name: 'Gate A', qrCode: 'SOCP-acme-site1-001', orderInRoute: '1', latitude: 12.9825, longitude: 80.2210 },
    { tenantId: tenant.id, siteId: site1.id, name: 'Gate B', qrCode: 'SOCP-acme-site1-002', orderInRoute: '2', latitude: 12.9823, longitude: 80.2208 },
    { tenantId: tenant.id, siteId: site1.id, name: 'Security Room', qrCode: 'SOCP-acme-site1-003', orderInRoute: '3', latitude: 12.9826, longitude: 80.2212 },
    { tenantId: tenant.id, siteId: site2.id, name: 'Parking Entry', qrCode: 'SOCP-acme-site2-001', orderInRoute: '1', latitude: 12.9819, longitude: 80.2204 },
    { tenantId: tenant.id, siteId: site2.id, name: 'Stairwell C', qrCode: 'SOCP-acme-site2-002', orderInRoute: '2', latitude: 12.9821, longitude: 80.2206 },
  ])

  // Today's shifts
  const now = new Date()
  const shiftStart = new Date(now); shiftStart.setHours(8, 0, 0, 0)
  const shiftEnd = new Date(now); shiftEnd.setHours(20, 0, 0, 0)

  await db.insert(schema.shifts).values([
    { tenantId: tenant.id, siteId: site1.id, guardId: guards[0].id, startsAt: shiftStart, endsAt: shiftEnd, status: 'active' },
    { tenantId: tenant.id, siteId: site1.id, guardId: guards[1].id, startsAt: shiftStart, endsAt: shiftEnd, status: 'active' },
    { tenantId: tenant.id, siteId: site2.id, guardId: guards[2].id, startsAt: shiftStart, endsAt: shiftEnd, status: 'active' },
  ])

  // Sample open incident
  await db.insert(schema.incidents).values({
    tenantId: tenant.id,
    siteId: site1.id,
    reportedBy: guards[0].id,
    title: 'Suspicious individual near Gate A',
    description: 'Male, ~30s, loitering near Gate A for 20 minutes. Refused to show ID. Security asked him to leave.',
    severity: 'medium',
    status: 'open',
    slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  console.log('✅ Seed complete!')
  console.log('  admin@acme.secureops.in / acme123')
  console.log('  guard1@acme.secureops.in / guard123')

  await sql.end()
}

if (require.main === module) {
  seed().catch((e) => { console.error(e); process.exit(1) })
}
