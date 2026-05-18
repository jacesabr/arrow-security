'use client'
import { useState, useEffect } from 'react'

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Stats {
  guards: number; sites: number; openIncidents: number
  activeShifts: number; todayPatrols: number; todayAttendance: number
}

/* ─── Shared atoms ───────────────────────────────────────────────────────── */

const M: React.CSSProperties = { fontFamily: '"JetBrains Mono","Cascadia Code","Fira Code",ui-monospace,monospace' }

function H1({ children }: { children: React.ReactNode }) {
  return <h1 style={{ color: '#e8e6e3', fontSize: 14, fontWeight: 700, margin: '0 0 20px', letterSpacing: '0.05em', textTransform: 'uppercase', ...M }}>{children}</h1>
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ color: '#9a9490', fontSize: 10, fontWeight: 600, margin: '24px 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid #2b2a27', paddingBottom: 5, ...M }}>{children}</h2>
}

function Code({ children, lang }: { children: React.ReactNode; lang?: string }) {
  return (
    <pre style={{ background: '#0d0c0b', border: '1px solid #2b2a27', borderRadius: 6, padding: '12px 16px', fontSize: 11.5, color: '#c8c4bf', margin: '8px 0 16px', overflowX: 'auto', lineHeight: 1.75, ...M }}>
      {lang && <span style={{ display: 'block', color: '#4a4845', fontSize: 10, marginBottom: 6 }}>{lang}</span>}
      <code>{children}</code>
    </pre>
  )
}

function KV({ k, v, v2, accent }: { k: string; v: string; v2?: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '5px 0', borderBottom: '1px solid #1f1e1b', alignItems: 'baseline', fontSize: 11.5 }}>
      <span style={{ color: '#5c5855', minWidth: 200, flexShrink: 0, ...M }}>{k}</span>
      <span style={{ color: accent ? '#c96442' : '#c8c4bf', ...M }}>{v}</span>
      {v2 && <span style={{ color: '#4a4845', marginLeft: 'auto', ...M }}>{v2}</span>}
    </div>
  )
}

function Tag({ children, color = '#3b82f6' }: { children: React.ReactNode; color?: string }) {
  return <span style={{ display: 'inline-block', background: `${color}1a`, color, border: `1px solid ${color}35`, borderRadius: 4, padding: '2px 8px', fontSize: 10.5, marginRight: 5, marginBottom: 5, ...M }}>{children}</span>
}

function Pill({ method }: { method: string }) {
  const c = method === 'GET' ? '#10b981' : method === 'POST' ? '#c96442' : method === 'PATCH' ? '#3b82f6' : method === 'DELETE' ? '#ef4444' : '#7a7773'
  return <span style={{ color: c, display: 'inline-block', minWidth: 44, fontSize: 10.5, fontWeight: 700, ...M }}>{method}</span>
}

function Route({ line }: { line: string }) {
  const [method, ...rest] = line.split(' ')
  return (
    <div style={{ padding: '3px 0', fontSize: 11.5, color: '#a3a098', ...M }}>
      <Pill method={method} /><span style={{ color: '#e8e6e3' }}>/api{rest.join(' ')}</span>
    </div>
  )
}

function Alert({ children, type = 'info' }: { children: React.ReactNode; type?: 'info' | 'warn' | 'ok' }) {
  const colors: Record<string, string> = { info: '#3b82f6', warn: '#f59e0b', ok: '#10b981' }
  const c = colors[type]
  return (
    <div style={{ background: `${c}12`, border: `1px solid ${c}30`, borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#c8c4bf', ...M }}>
      <span style={{ color: c, fontWeight: 700, marginRight: 8 }}>{type === 'warn' ? '⚠' : type === 'ok' ? '✓' : 'i'}</span>{children}
    </div>
  )
}

/* ─── Nav ────────────────────────────────────────────────────────────────── */

const SECTIONS = [
  { id: 'overview',  label: 'Overview',     icon: '◈' },
  { id: 'arch',      label: 'Architecture', icon: '◎' },
  { id: 'auth',      label: 'Auth & Roles', icon: '◉' },
  { id: 'database',  label: 'Database',     icon: '▣' },
  { id: 'api',       label: 'API Routes',   icon: '◷' },
  { id: 'realtime',  label: 'Real-time',    icon: '◌' },
  { id: 'portal',    label: 'Ops Portal',   icon: '▤' },
  { id: 'mobile',    label: 'Mobile App',   icon: '◬' },
  { id: 'payroll',   label: 'Payroll',      icon: '◫' },
  { id: 'scale',     label: 'Scale',        icon: '◩' },
  { id: 'dev',       label: 'Dev Setup',    icon: '◪' },
]

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function DevRefPage() {
  const [section, setSection] = useState('overview')
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) return
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(r => setStats(r.data)).catch(() => {})
  }, [])

  const now = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#131210', color: '#c8c4bf', ...M }}>

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header style={{ background: '#1a1916', borderBottom: '1px solid #2b2a27', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z" fill="#c96442" />
          </svg>
          <span style={{ color: '#c96442', fontSize: 13, fontWeight: 700 }}>arrow-security</span>
          <span style={{ color: '#2b2a27' }}>/</span>
          <span style={{ color: '#5c5855', fontSize: 13 }}>dev-reference</span>
          <span style={{ color: '#2b2a27', margin: '0 4px' }}>·</span>
          <span style={{ color: '#4a4845', fontSize: 11 }}>full-stack + systems</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {stats && (
            <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
              <span><span style={{ color: '#10b981' }}>●</span> <span style={{ color: '#5c5855' }}>{stats.guards} guards</span></span>
              <span><span style={{ color: '#c96442' }}>●</span> <span style={{ color: '#5c5855' }}>{stats.openIncidents} incidents</span></span>
              <span><span style={{ color: '#3b82f6' }}>●</span> <span style={{ color: '#5c5855' }}>{stats.activeShifts} shifts</span></span>
            </div>
          )}
          <span style={{ fontSize: 11, color: '#4a4845' }}>{now}</span>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left nav */}
        <nav style={{ width: 160, background: '#0f0e0c', borderRight: '1px solid #2b2a27', padding: '14px 0', flexShrink: 0, overflowY: 'auto' }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 14px', border: 'none', cursor: 'pointer',
              background: section === s.id ? 'rgba(201,100,66,0.12)' : 'transparent',
              borderLeft: section === s.id ? '2px solid #c96442' : '2px solid transparent',
              color: section === s.id ? '#e8e6e3' : '#5c5855',
              fontSize: 12, textAlign: 'left', transition: 'all 0.1s', ...M,
            }}>
              <span style={{ color: section === s.id ? '#c96442' : '#2b2a27', fontSize: 9 }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
          <div style={{ marginTop: 24, padding: '0 14px' }}>
            <div style={{ borderTop: '1px solid #2b2a27', paddingTop: 12 }}>
              <a href="https://arrow-security-api.onrender.com/health" target="_blank" rel="noreferrer"
                style={{ display: 'block', fontSize: 10.5, color: '#4a4845', textDecoration: 'none', marginBottom: 5 }}>
                ↗ API /health
              </a>
              <a href="https://arrow-security-tenant.onrender.com" target="_blank" rel="noreferrer"
                style={{ display: 'block', fontSize: 10.5, color: '#4a4845', textDecoration: 'none', marginBottom: 5 }}>
                ↗ Tenant portal
              </a>
              <a href="https://arrow-security-mobile.onrender.com" target="_blank" rel="noreferrer"
                style={{ display: 'block', fontSize: 10.5, color: '#4a4845', textDecoration: 'none' }}>
                ↗ Mobile app
              </a>
            </div>
          </div>
        </nav>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', maxWidth: 900 }}>
          <Section id={section} stats={stats} />
        </main>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #1f1e1b', padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, color: '#2b2a27' }}>arrow security ops platform · dev reference · closes with tab</span>
        <span style={{ fontSize: 10.5, color: '#2b2a27' }}>fastify 4 · next.js 16 · ionic/capacitor · drizzle · postgres 16</span>
      </footer>
    </div>
  )
}

/* ─── Section Router ─────────────────────────────────────────────────────── */

function Section({ id, stats }: { id: string; stats: Stats | null }) {
  switch (id) {
    case 'overview':  return <OverviewSection stats={stats} />
    case 'arch':      return <ArchSection />
    case 'auth':      return <AuthSection />
    case 'database':  return <DatabaseSection stats={stats} />
    case 'api':       return <ApiSection />
    case 'realtime':  return <RealtimeSection />
    case 'portal':    return <PortalSection />
    case 'mobile':    return <MobileSection />
    case 'payroll':   return <PayrollSection />
    case 'scale':     return <ScaleSection />
    case 'dev':       return <DevSection />
    default:          return null
  }
}

/* ─── 1. Overview ────────────────────────────────────────────────────────── */

function OverviewSection({ stats }: { stats: Stats | null }) {
  return (
    <div>
      <H1>Arrow Security — Ops Platform</H1>
      <p style={{ color: '#7a7773', fontSize: 13, lineHeight: 1.8, marginBottom: 20 }}>
        Multi-tenant security guard operations platform. One active tenant: <span style={{ color: '#c96442' }}>Acme Security</span>.
        Three apps ship from one monorepo: an operations portal for supervisors/admins, a guard PWA for field use,
        and a Fastify API backend shared by both.
      </p>

      <Alert type="ok">Production live on Render free tier. API Oregon · Tenant Oregon · Mobile Global CDN</Alert>

      <H2>Live URLs</H2>
      <KV k="API"            v="https://arrow-security-api.onrender.com" />
      <KV k="Ops portal"     v="https://arrow-security-tenant.onrender.com" />
      <KV k="Guard app"      v="https://arrow-security-mobile.onrender.com" />
      <KV k="API health"     v="https://arrow-security-api.onrender.com/health" />

      <H2>Current State</H2>
      {stats ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <Tag color="#10b981">{stats.guards} guards</Tag>
          <Tag color="#c96442">{stats.sites} sites</Tag>
          <Tag color="#ef4444">{stats.openIncidents} open incidents</Tag>
          <Tag color="#3b82f6">{stats.activeShifts} active shifts</Tag>
          <Tag color="#f59e0b">{stats.todayPatrols} patrols today</Tag>
          <Tag color="#a855f7">{stats.todayAttendance} attendances</Tag>
        </div>
      ) : (
        <Alert type="warn">Not logged in — stats unavailable. Log in to the portal and re-open this tab.</Alert>
      )}

      <H2>Seed Data (auto-seeded on first deploy)</H2>
      <KV k="Tenant"       v="Acme Security (slug: acme)" />
      <KV k="Client"       v="Phoenix Mall, Velachery, Chennai" />
      <KV k="Sites"        v="Main Entrance (150m geofence) · Parking Level B2 (200m geofence)" />
      <KV k="Checkpoints"  v="Gate A, Gate B, Security Room, Parking Entry, Stairwell C" />
      <KV k="Guards"       v="Arun Sharma · Vikram Singh · Priya Nair" />
      <KV k="Open incident" v="'Suspicious individual near Gate A' (medium severity)" />
      <KV k="Active shifts" v="All 3 guards on shift 08:00–20:00 today" />

      <H2>White-label Mechanism</H2>
      <Code lang="env">{`NEXT_PUBLIC_TENANT_SLUG=acme   # tenant portal
VITE_TENANT_SLUG=acme          # mobile app
# changing these re-deploys the apps for a different company — no code changes`}</Code>

      <H2>Known Stubs (not yet built)</H2>
      {[
        ['NFC scanning',          'nfcTagId field exists in checkpoints schema, mobile not wired'],
        ['Push notifications',    'fcmToken on users table, firebase-admin installed, not wired up'],
        ['MinIO file storage',    'container running, selfie upload endpoints return 501'],
        ['Panic button',          'DB table + API route exists — mobile button triggers it, portal shows list'],
        ['SMS / email alerts',    'Mailhog in dev, no sending logic'],
        ['Cameras (Frigate)',     'Table + stub route, no active integration'],
        ['guard_locations partition', 'Schema not yet partitioned — must do before Phase 1 ships'],
        ['Redis SSE (prod)',      'Current SSE uses in-process Map — must migrate to Redis Pub/Sub before multi-container'],
      ].map(([k, v]) => <KV key={k} k={k} v={v} />)}
    </div>
  )
}

/* ─── 2. Architecture ────────────────────────────────────────────────────── */

function ArchSection() {
  return (
    <div>
      <H1>Architecture</H1>

      <H2>Monorepo (pnpm workspaces)</H2>
      <Code>{`pnpm workspaces
├── apps/
│   ├── api/          Fastify 4         port 4000  — REST + SSE backend
│   ├── tenant/       Next.js 16        port 3001  — Ops Portal (supervisors/admins)
│   └── mobile/       Ionic/Capacitor   port 5173  — Guard App (PWA + native)
└── packages/
    ├── db/           Drizzle ORM — schema, migrations, seed (used by API only)
    └── shared/       TypeScript types + SLA constants (used by all apps)`}</Code>

      <H2>Full Data Flow</H2>
      <Code>{`Guard phone (every 30s during active shift)
  └─ POST /api/locations  { lat, lng, accuracy, battery, shiftId }
       ├─ INSERT guard_locations  (h3_res8 cell computed via h3-js)
       └─ redisPublisher.publish('sse:{tenantId}', JSON event)
                └─ tenant portal /map page (SSE ReadableStream)
                        └─ MapLibre GL marker update

Guard reports incident
  └─ POST /api/incidents
       └─ INSERT incidents → SSE publish { type:'incident', ... }

Supervisor uses ops portal
  └─ GET /api/stats, /api/shifts, /api/incidents ...  (all Bearer-authenticated)
  └─ PATCH /api/incidents/:id/status  (role-gated: supervisor+)

Payroll calculation
  └─ POST /api/payroll/:id/calculate
       └─ reads attendance_records, applies ESI/PF formulas
       └─ writes payroll_records (amounts in paise)`}</Code>

      <H2>Infrastructure (Docker Compose)</H2>
      <KV k="postgres:16"         v="localhost:5432 — primary DB"                         v2="secureops/secureops/secureops" />
      <KV k="redis:7"             v="localhost:6379 — SSE Pub/Sub + BullMQ + rate-limit"  v2="no auth in dev" />
      <KV k="minio"               v="localhost:9000 / 9001 console — S3 selfie storage"   v2="minio/minio123" />
      <KV k="mailhog"             v="localhost:8025 — dev email trap, SMTP :1025"          v2="no auth" />

      <H2>Key Tech Decisions</H2>
      {[
        ['Fastify over Express',        'Native TypeScript, JSON schema validation, 2× throughput, plugin lifecycle'],
        ['Drizzle over Prisma',         'SQL-like DSL, no runtime client, zero migrations magic, works in edge runtimes'],
        ['Ionic/Capacitor over React Native', 'Single codebase → PWA + Android + iOS; Capacitor bridges native APIs cleanly'],
        ['SSE over WebSocket',          'HTTP/1.1 compatible, simpler auth header, one-directional (guards only push, never receive)'],
        ['pnpm workspaces',             'Shared types + DB package without publishing to npm; workspace: protocol for local deps'],
        ['Text IDs (createId)',         '12 random bytes base64url — shorter than UUID, safe for URLs, no SERIAL coupling to Citus sharding later'],
        ['Paise for payroll',           'Integer arithmetic eliminates all floating-point rounding errors on Indian currency amounts'],
      ].map(([k, v]) => <KV key={k} k={k} v={v} />)}

      <H2>Workspace Package Resolution</H2>
      <Code lang="package.json">{`"@secureops/db": "workspace:*"     // resolves to packages/db/
"@secureops/shared": "workspace:*"  // resolves to packages/shared/
// pnpm links these as symlinks — changes in packages/ are immediately visible`}</Code>
    </div>
  )
}

/* ─── 3. Auth ────────────────────────────────────────────────────────────── */

function AuthSection() {
  return (
    <div>
      <H1>Auth & Roles</H1>

      <H2>Login Flow</H2>
      <Code>{`POST /api/auth/login
  body: { email, password, tenantSlug? }

  1. Resolve tenantId from slug (or from user.tenantId if slug omitted)
  2. SELECT user WHERE email = email AND tenantId = tenantId
  3. Check password:
       if stored.startsWith('$argon2')  → Argon2id.verify(stored, input)
       else                              → SHA-256(input + PASSWORD_SALT) === stored
                                          then rehash to Argon2id immediately (zero-downtime migration)
  4. Sign JWT: { sub: userId, tenantId, role, iat, exp: now+24h }
  5. Return: { token, user: { id, email, name, role, tenantId } }`}</Code>

      <H2>JWT Payload</H2>
      <Code>{`{ sub: "abc123", tenantId: "def456", role: "supervisor", iat: 1716000000, exp: 1716086400 }
Secret: JWT_SECRET env var (min 32 chars)
Algorithm: HS256 (fastify-jwt default)`}</Code>

      <H2>Role Hierarchy</H2>
      {[
        ['platform_admin', 'Cross-tenant superuser. Can access any tenant.',            'admin@secureops.in'],
        ['tenant_admin',   'Full CRUD within tenant. Manages users, payroll, settings.', 'admin@acme.secureops.in'],
        ['supervisor',     'Site management, incident resolution, shift scheduling.',    'supervisor@acme.secureops.in'],
        ['guard',          'Field operations only: check-in, patrol, incidents.',        'guard1@acme.secureops.in'],
        ['client_viewer',  'Read-only: own sites + incidents at /client/* (stub).',     '—'],
      ].map(([role, desc, email]) => (
        <div key={role} style={{ padding: '7px 0', borderBottom: '1px solid #1f1e1b', fontSize: 11.5, ...M }}>
          <span style={{ color: '#c96442', display: 'inline-block', minWidth: 160 }}>{role}</span>
          <span style={{ color: '#c8c4bf', marginRight: 16 }}>{desc}</span>
          <span style={{ color: '#4a4845' }}>{email}</span>
        </div>
      ))}

      <H2>Middleware (apps/api/src/lib/auth.ts)</H2>
      <Code lang="typescript">{`requireAuth          // any valid JWT — fastify.jwtVerify()
requireSupervisor    // role IN (supervisor, tenant_admin, platform_admin)
requireTenantAdmin   // role IN (tenant_admin, platform_admin)

// Usage in route
fastify.get('/sites', { preHandler: requireAuth }, async (req) => {
  const { tenantId, role } = req.user   // JWT payload, always present after requireAuth
  const rows = await db.select()
    .from(sites)
    .where(eq(sites.tenantId, tenantId)) // CRITICAL: always scope by tenantId
})`}</Code>

      <H2>Tenant Isolation Rule</H2>
      <Alert type="warn">Every DB query in a protected route MUST include <code style={{ color: '#c96442' }}>WHERE tenant_id = payload.tenantId</code>. Missing this is a data-leak vulnerability.</Alert>

      <H2>Password Hashing Details</H2>
      <Code lang="Argon2id params">{`memoryCost: 65536  (64 MiB)
timeCost:   3
parallelism: 1
Library: @node-rs/argon2 (native Rust binding via NAPI — ~10× faster than pure-JS)`}</Code>
    </div>
  )
}

/* ─── 4. Database ────────────────────────────────────────────────────────── */

function DatabaseSection({ stats }: { stats: Stats | null }) {
  const tables = [
    ['tenants',               'Org records. One active row (Acme Security). tier, slug, status.'],
    ['users',                 'All users across all roles. tenantId nullable for platform_admin.'],
    ['clients',               'End-client companies that Arrow guards protect (e.g. Phoenix Mall).'],
    ['sites',                 'Physical locations. lat/lng + geofenceRadiusMeters + clientId.'],
    ['shifts',                'Scheduled guard shifts. status: scheduled | active | completed | missed.'],
    ['attendance_records',    'Check-in/out events. method: gps | qr | manual | face. photo URL optional.'],
    ['patrols',               'Patrol sessions. status: in_progress | completed | abandoned.'],
    ['checkpoints',           'Named scan points on a site. qrCode (unique) + optional nfcTagId.'],
    ['patrol_scans',          'Each checkpoint scan within a patrol. scannedAt + method.'],
    ['incidents',             'Field incidents. severity: low|medium|high|critical. SLA deadline set on create.'],
    ['guard_locations',       'GPS pings. lat, lng, accuracy, battery, h3_res8 cell, shiftId. ~30s cadence.'],
    ['cameras',               'Frigate integration stub. rtspUrl, status. No active routes yet.'],
    ['payroll_periods',       'Pay period definitions. status: draft|calculated|finalized.'],
    ['payroll_records',       'Per-guard calc. grossPaise, netPaise, esiEmployee/Employer, pfEmployee/Employer.'],
    ['refresh_tokens',        'Refresh token store. tokenHash = SHA-256(raw). expiresAt 30d. revokedAt on rotation.'],
    ['supervisor_sites',      'M2M join: which supervisors can see which sites.'],
    ['audit_log',             'HMAC-chained immutable audit trail. action, actorId, targetId, prevHash.'],
    ['shift_templates',       'Recurring shift rules. dayOfWeek, startHour, endHour, siteId, guardId.'],
    ['shift_exceptions',      'Attendance anomalies. type: missed_punch|absent|late|early_leave. resolvedAt.'],
    ['leave_requests',        'Guard time-off. status: pending|approved|rejected. reviewedBy supervisor.'],
    ['panic_events',          'Panic button triggers. guardId, lat, lng, status: triggered|acknowledged|resolved.'],
    ['incident_form_templates', 'JSONB field definitions for dynamic incident forms. Per-tenant.'],
    ['incident_form_responses', 'Guard form submissions. incidentId + JSONB responses.'],
    ['post_orders',           'Standing orders per site. Requires guard acknowledgement (ackRequired flag).'],
    ['passdowns',             'Shift handover notes from outgoing to incoming guard.'],
    ['certifications',        'Guard cert records. type (first_aid, fire_safety…), expiresAt, issuedBy.'],
  ]

  return (
    <div>
      <H1>Database</H1>
      <Alert type="ok">PostgreSQL 16 · Drizzle ORM · {tables.length} tables · All IDs are TEXT (not SERIAL)</Alert>

      <H2>ID Strategy</H2>
      <Code lang="packages/db/src/schema/*.ts">{`import { createId } from '../utils'
// createId() → 12 random bytes → base64url encode → ~16 chars
// e.g. "abc123defghi78"
// All PKs: id: text('id').primaryKey().$defaultFn(createId)
// Why TEXT not UUID: shorter, URL-safe, no hyphens, Citus-compatible`}</Code>

      <H2>Tables ({tables.length})</H2>
      {tables.map(([t, d]) => <KV key={t} k={t} v={d} />)}

      <H2>Drizzle Query Patterns</H2>
      <Code lang="typescript">{`import { db } from '@secureops/db'
import { eq, and, gte, desc } from 'drizzle-orm'
import { incidents, sites } from '@secureops/db'

// SELECT with join
const rows = await db
  .select({ incident: incidents, siteName: sites.name })
  .from(incidents)
  .leftJoin(sites, eq(incidents.siteId, sites.id))
  .where(and(
    eq(incidents.tenantId, tenantId),   // ALWAYS filter by tenantId
    eq(incidents.status, 'open')
  ))
  .orderBy(desc(incidents.createdAt))
  .limit(50)

// INSERT
const [row] = await db.insert(incidents).values({ tenantId, ...body }).returning()

// UPDATE
await db.update(incidents)
  .set({ status: 'resolved', resolvedAt: new Date() })
  .where(and(eq(incidents.id, id), eq(incidents.tenantId, tenantId)))`}</Code>

      <H2>Migrations</H2>
      <Code lang="bash">{`# Generate migration from schema changes (from packages/db/)
DATABASE_URL=... pnpm generate      # → packages/db/src/migrations/xxxx.sql

# Apply to running DB
DATABASE_URL=... pnpm migrate       # runs all pending migrations

# Push schema directly (dev only — skips migration files)
DATABASE_URL=... pnpm push

# Auto-migrate on API startup (production)
# apps/api/src/server.ts calls runMigrations() before Fastify starts`}</Code>

      <H2>guard_locations Partition Plan</H2>
      <Code lang="SQL (must apply before Phase 1)">{`-- PARTITION BY RANGE (recorded_at) — monthly child tables
CREATE TABLE guard_locations_2026_05 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- GiST index for live-map queries
CREATE INDEX guard_locations_geom_recent ON guard_locations USING GIST (location)
  WHERE recorded_at > now() - interval '8 hours';

-- Composite index for history queries
CREATE INDEX guard_locations_history ON guard_locations (tenant_id, guard_id, recorded_at DESC);

-- TimescaleDB upgrade path at 50k+ guards (schema already compatible)`}</Code>

      <H2>Payroll</H2>
      <Alert type="info">All monetary values stored in <strong>paise</strong> (₹1 = 100 paise). Integer arithmetic, zero rounding errors.</Alert>
    </div>
  )
}

/* ─── 5. API Routes ──────────────────────────────────────────────────────── */

function ApiSection() {
  const groups: [string, string[]][] = [
    ['Auth',             ['POST /auth/login', 'GET /auth/me', 'POST /auth/logout']],
    ['Sites',            ['GET /sites', 'POST /sites', 'PATCH /sites/:id']],
    ['Users',            ['GET /users', 'POST /users', 'PATCH /users/:id']],
    ['Clients',          ['GET /clients', 'POST /clients']],
    ['Shifts',           ['GET /shifts', 'POST /shifts', 'PATCH /shifts/:id/status', 'POST /shifts/solve']],
    ['Shift Templates',  ['GET /shift-templates', 'POST /shift-templates', 'DELETE /shift-templates/:id', 'POST /shift-templates/materialise']],
    ['Attendance',       ['GET /attendance', 'POST /attendance']],
    ['Patrol',           ['GET /patrol', 'POST /patrol/start', 'GET /patrol/checkpoints', 'POST /patrol/checkpoints', 'POST /patrol/:id/scan', 'PATCH /patrol/:id/complete']],
    ['Incidents',        ['GET /incidents', 'POST /incidents', 'GET /incidents/:id', 'PATCH /incidents/:id/status']],
    ['Incident Forms',   ['GET /incident-forms/templates', 'POST /incident-forms/templates', 'GET /incident-forms/responses', 'POST /incident-forms/responses']],
    ['Locations',        ['POST /locations', 'GET /locations/history', 'GET /locations/live — SSE']],
    ['Panic',            ['POST /panic', 'GET /panic', 'PATCH /panic/:id/acknowledge', 'PATCH /panic/:id/resolve']],
    ['Leave',            ['GET /leave-requests', 'POST /leave-requests', 'PATCH /leave-requests/:id/review']],
    ['Payroll',          ['GET /payroll', 'POST /payroll', 'GET /payroll/:id', 'POST /payroll/:id/calculate', 'PATCH /payroll/records/:id', 'POST /payroll/:id/finalize']],
    ['Post Orders',      ['GET /post-orders', 'POST /post-orders', 'POST /post-orders/:id/ack']],
    ['Passdowns',        ['GET /passdowns', 'POST /passdowns']],
    ['Exceptions',       ['GET /exceptions', 'PATCH /exceptions/:id/resolve']],
    ['Certifications',   ['GET /certifications', 'POST /certifications', 'PATCH /certifications/:id']],
    ['Supervisor Sites', ['GET /supervisor-sites', 'POST /supervisor-sites', 'DELETE /supervisor-sites/:siteId']],
    ['Audit Log',        ['GET /audit-log']],
    ['Stats',            ['GET /stats']],
    ['Upload',           ['POST /upload/presign — returns S3 presigned URL for direct upload']],
    ['Health',           ['GET /health']],
  ]

  return (
    <div>
      <H1>API Routes</H1>
      <Code>{`Base URL:   https://arrow-security-api.onrender.com/api
Auth:       Authorization: Bearer <JWT>
Response:   { data: T } | { error: string, message: string, statusCode: number }
Validation: Zod inline on every POST/PATCH handler`}</Code>

      <H2>Adding a New Route</H2>
      <Code lang="typescript">{`// 1. apps/api/src/routes/yourroute.ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth, requireSupervisor } from '../lib/auth'

export const yourRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = req.user
    const rows = await db.select().from(yourTable).where(eq(yourTable.tenantId, tenantId))
    return { data: rows }
  })

  app.post('/', { preHandler: requireSupervisor }, async (req) => {
    const body = z.object({ name: z.string() }).parse(req.body)
    const [row] = await db.insert(yourTable).values({ tenantId: req.user.tenantId, ...body }).returning()
    return { data: row }
  })
}

// 2. Register in apps/api/src/server.ts
await app.register(yourRoutes, { prefix: '/api/your' })`}</Code>

      <H2>All Routes</H2>
      {groups.map(([group, routes]) => (
        <div key={group} style={{ marginBottom: 14 }}>
          <H2>{group}</H2>
          {routes.map(r => <Route key={r} line={r} />)}
        </div>
      ))}
    </div>
  )
}

/* ─── 6. Real-time ───────────────────────────────────────────────────────── */

function RealtimeSection() {
  return (
    <div>
      <H1>Real-time Architecture</H1>

      <H2>GPS Ping → Map Update (full path)</H2>
      <Code>{`1. Mobile app (ShiftsPage.tsx)
   BackgroundGeolocation.addWatcher({ distanceFilter: 50 }, handler)
   → every 50m movement OR 30s timer
   → POST /api/locations { latitude, longitude, accuracy, battery, shiftId }

2. API handler (routes/locations.ts)
   → INSERT guard_locations { tenantId, guardId, shiftId, lat, lng, accuracy,
                              battery, h3_res8: latLngToCell(lat, lng, 8) }
   → redisPublisher.publish('sse:{tenantId}', JSON.stringify({
       type: 'location', guardId, guardName, latitude, longitude, accuracy, ts
     }))

3. Tenant portal /map page (SSE subscriber)
   → fetch('/api/locations/live', { headers: { Authorization: 'Bearer ...' }})
      (uses fetch + ReadableStream — NOT EventSource — to set auth header)
   → parses 'data: {JSON}\\n\\n' lines from stream
   → on type='location': updates MapLibre GL marker position

4. MapLibre GL
   → existing marker.setLngLat([lng, lat])  — no re-render, smooth update`}</Code>

      <H2>SSE Server Side (routes/locations.ts)</H2>
      <Code lang="typescript">{`// Each SSE client gets its own Redis subscriber connection
// (ioredis subscriber mode locks the connection — can't share)
app.get('/locations/live', { preHandler: requireAuth }, async (req, reply) => {
  const { tenantId } = req.user
  const channel = \`sse:\${tenantId}\`

  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.flushHeaders()

  const sub = new Redis(process.env.REDIS_URL)
  await sub.subscribe(channel)

  sub.on('message', (_ch, msg) => {
    reply.raw.write(\`data: \${msg}\\n\\n\`)
  })

  // Heartbeat to keep connection alive through proxies
  const hb = setInterval(() => reply.raw.write(': ping\\n\\n'), 25000)

  req.raw.on('close', () => {
    clearInterval(hb)
    sub.unsubscribe(channel)
    sub.quit()
  })
})`}</Code>

      <H2>Panic Broadcast</H2>
      <Code>{`POST /api/panic
  → INSERT panic_events { guardId, tenantId, lat, lng, status: 'triggered' }
  → redisPublisher.publish('sse:{tenantId}', { type: 'panic', guardId, lat, lng, triggeredAt })
  → SSE clients receive panic event → portal can show alert overlay`}</Code>

      <H2>H3 Hexagonal Grid</H2>
      <Code>{`import { latLngToCell } from 'h3-js'
const cell = latLngToCell(latitude, longitude, 8)
// Resolution 8 → ~0.74 km² hexagons (~860m edge-to-edge)
// Stored in guard_locations.h3_res8
// Use: future heatmap aggregation, density queries, spatial joins without PostGIS`}</Code>

      <H2>Scale Caveat</H2>
      <Alert type="warn">Current SSE uses in-process Map (single server). Must switch to Redis Pub/Sub before running 2+ API containers. Redis Pub/Sub code pattern is already in the route — just needs <code style={{ color: '#c96442' }}>REDIS_URL</code> wired up in production.</Alert>
    </div>
  )
}

/* ─── 7. Ops Portal ──────────────────────────────────────────────────────── */

function PortalSection() {
  return (
    <div>
      <H1>Operations Portal (Next.js 16)</H1>
      <Alert type="info">Turbopack is the default bundler in Next.js 16. <code style={{ color: '#c96442' }}>@tailwindcss/postcss</code> is a regular dep (not devDep) due to Render's NODE_ENV=production install.</Alert>

      <H2>Auth Pattern (every protected page)</H2>
      <Code lang="typescript">{`'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SomePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('td_token')
    if (!t) { router.replace('/login'); return }
    setToken(t)
  }, [router])

  if (!token) return null  // avoids flash of content
  // ... rest of page
}`}</Code>

      <H2>API Client (apps/tenant/src/lib/api.ts)</H2>
      <Code lang="typescript">{`// All API calls go through tdApi — handles base URL + auth header
import { tdApi } from '../../lib/api'

const { data } = await tdApi.incidents.list()  // GET /incidents
await tdApi.incidents.create({ title, severity, siteId, description })
await tdApi.incidents.updateStatus(id, 'resolved')`}</Code>

      <H2>Pages</H2>
      {[
        ['/login',        'Email + password form. No slug field (internal env var). Dev credentials panel below form.'],
        ['/dashboard',    'Stats summary + recent incidents + quick action cards.'],
        ['/guards',       'Guard CRUD table. Create/edit users with guard role.'],
        ['/sites',        'Site CRUD. Geofence radius slider. Client assignment.'],
        ['/clients',      'Client company CRUD.'],
        ['/shifts',       'Shift table. Create + filter by date/guard/site. Status management.'],
        ['/roster',       'Weekly grid — guards as rows, days as columns. Colour-coded by status.'],
        ['/incidents',    'Incident list + status management. Severity badges.'],
        ['/panic',        'Panic alerts list. Acknowledge + resolve actions.'],
        ['/patrols',      'Patrol history. Duration, completion rate.'],
        ['/checkpoints',  'Checkpoint CRUD. QR code display (print-ready).'],
        ['/map',          'Live MapLibre GL map. SSE guard pings. Click guard → 8h trail.'],
        ['/cameras',      'Camera list (Frigate stub). No active stream yet.'],
        ['/clients',      'Client company CRUD.'],
        ['/leave-requests', 'Leave request list. Supervisor approves/rejects.'],
        ['/post-orders',  'Standing orders per site. Acknowledgement tracking.'],
        ['/payroll',      'Pay period management. ESI/PF calculation. Finalization gate.'],
        ['/settings',     'Account + org info.'],
        ['/dev-ref',      'This page. Opens in new tab from sidebar.'],
      ].map(([r, d]) => <KV key={r} k={r} v={d} />)}

      <H2>State Management</H2>
      <KV k="Auth"       v="localStorage: td_token (JWT) + td_user (JSON user object)" />
      <KV k="ViewAs"     v="ViewAsContext — UI simulation (owner/supervisor/guard) — no real auth change" />
      <KV k="Dev switch" v="DevAccountSwitcher in sidebar — real login API call, reloads page" />
    </div>
  )
}

/* ─── 8. Mobile App ──────────────────────────────────────────────────────── */

function MobileSection() {
  return (
    <div>
      <H1>Mobile Guard App (Ionic/Capacitor)</H1>
      <KV k="Framework"    v="Ionic React + Capacitor 6 — single codebase → PWA + Android + iOS" />
      <KV k="State"        v="Zustand with persist middleware — auth-storage key in localStorage" />
      <KV k="API"          v="src/services/api.ts — fetch wrapper, adds Authorization header automatically" />
      <KV k="Base URL"     v="VITE_API_URL env var (default http://localhost:4000/api)" />
      <KV k="Tenant slug"  v="VITE_TENANT_SLUG — hardcoded per deployment, never shown in UI" />

      <H2>Auth Store (src/store/auth.ts)</H2>
      <Code lang="typescript">{`const { token, user, setAuth, logout } = useAuthStore()

// setAuth called after login — persists to localStorage via zustand/persist
setAuth(res.data.token, res.data.user, TENANT_SLUG)

// Access in components
const { token } = useAuthStore()
api.someEndpoint(token)  // api wrapper uses this automatically`}</Code>

      <H2>Background GPS (src/pages/ShiftsPage.tsx)</H2>
      <Code lang="typescript">{`import { registerPlugin } from '@capacitor/core'
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

// Start tracking when shift is active (called from useEffect when activeShift found)
const watchId = await BackgroundGeolocation.addWatcher(
  {
    backgroundMessage: 'Arrow Security is tracking your location',
    backgroundTitle: 'Arrow Security',
    distanceFilter: 50,   // minimum 50m movement before new ping
  },
  async (location) => {
    await api.locations.post({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      shiftId: activeShift.id,
    }, token)
  }
)

// Stop on shift end or unmount
return () => BackgroundGeolocation.removeWatcher({ id: watchId })`}</Code>

      <H2>QR Scanner (src/components/QrScannerModal.tsx)</H2>
      <Code lang="typescript">{`import { BarcodeScanner } from '@capacitor-community/barcode-scanner'

await BarcodeScanner.checkPermission({ force: true })
BarcodeScanner.hideBackground()
document.body.classList.add('scanner-active')   // CSS hides modal backdrop
const result = await BarcodeScanner.startScan()
BarcodeScanner.showBackground()
document.body.classList.remove('scanner-active')

if (result.hasContent) {
  // result.content is the QR code value (e.g. "SOCP-acme-site1-001")
  await api.patrol.scan({ patrolId, checkpointQr: result.content }, token)
}`}</Code>

      <H2>Role-based Tab Layout (src/components/TabLayout.tsx)</H2>
      <Code>{`guard      → Dashboard, CheckIn, Patrol, Incidents, Leave, Shifts, Profile
supervisor → Dashboard, Map (live guard locations!), Shifts, Incidents, Leave Approvals, Profile
admin      → Dashboard, Map, Shifts, Incidents, Leave Approvals, Profile

Dev account bar (top of every screen):
  Arun (guard) · Vikram (guard) · Priya (guard) · Rajesh (supervisor)
  Tap any pill → calls login API → swaps Zustand auth state → redirects to /tabs/dashboard`}</Code>

      <H2>Theme Variables (src/theme/variables.css)</H2>
      <Code>{`--ion-color-primary:            #c96442   (copper — Arrow brand)
--ion-background-color:         #fafaf9   (cream)
--ion-card-background:          #ffffff
--ion-toolbar-background:       #ffffff
--ion-tab-bar-background:       #ffffff
--ion-tab-bar-color:            #9a9490
--ion-tab-bar-color-selected:   #c96442`}</Code>

      <H2>Build for Android</H2>
      <Code lang="bash">{`cd apps/mobile
pnpm build              # vite build → dist/
pnpm sync:android       # cap sync android  (copies dist/ to android/app/src/main/assets)
pnpm open:android       # opens Android Studio → build APK from there`}</Code>
    </div>
  )
}

/* ─── 9. Payroll ─────────────────────────────────────────────────────────── */

function PayrollSection() {
  return (
    <div>
      <H1>Payroll — Indian Labour Law</H1>
      <Alert type="info">All amounts in <strong>paise</strong>. ₹1 = 100 paise. PF_WAGE_CAP = ₹15,000 = 1,500,000 paise. ESI_CEILING = ₹21,000 = 2,100,000 paise.</Alert>

      <H2>ESI (Employees' State Insurance)</H2>
      <Code>{`Eligibility:            gross ≤ ESI_CEILING (₹21,000/month)
Employee contribution:  0.75% of gross
Employer contribution:  3.25% of gross
Above ceiling:          ESI = 0 for both`}</Code>

      <H2>PF (Provident Fund — EPF)</H2>
      <Code>{`PF basic wage:    min(gross, PF_WAGE_CAP) → min(gross, ₹15,000)
Employee:         12% of PF basic
Employer:         12% of PF basic (goes into EPF + EPS split — simplified here)`}</Code>

      <H2>Net Pay Formula</H2>
      <Code lang="typescript">{`const grossPaise = daysWorked * dailyRatePaise + bonusPaise

const pfBasic = Math.min(grossPaise, PF_WAGE_CAP_PAISE)
const pfEmployee = Math.round(pfBasic * 0.12)
const pfEmployer = Math.round(pfBasic * 0.12)

const esiEmployee = grossPaise <= ESI_CEILING_PAISE ? Math.round(grossPaise * 0.0075) : 0
const esiEmployer = grossPaise <= ESI_CEILING_PAISE ? Math.round(grossPaise * 0.0325) : 0

const netPaise = grossPaise - esiEmployee - pfEmployee - otherDeductionsPaise`}</Code>

      <H2>Period Lifecycle</H2>
      <Code>{`draft → POST /payroll/:id/calculate → calculated → POST /payroll/:id/finalize → finalized
Finalized periods are IMMUTABLE — no further edits`}</Code>

      <H2>Finalization Gate</H2>
      <Code>{`POST /payroll/:id/finalize returns 409 if:
  • period is still 'draft' (run calculate first)
  • any guard in the period has shift_exceptions with resolvedAt IS NULL
    → response includes list of blocking exception IDs`}</Code>
    </div>
  )
}

/* ─── 10. Scale ──────────────────────────────────────────────────────────── */

function ScaleSection() {
  return (
    <div>
      <H1>Scale Roadmap</H1>
      <Code>{`Design target:   500 concurrent users
Ceiling:         100,000 concurrent (no rewrite)`}</Code>

      <H2>≤ 500 Users (now)</H2>
      <Code>{`Docker Compose — all on one host
Fastify single instance (Render free tier)
Redis Pub/Sub for SSE fan-out  ← must migrate from in-process Map
PgBouncer (transaction mode) in front of Postgres  ← not yet in docker-compose
BullMQ via Redis for async jobs (payroll calc, PDF, SMS, OR-Tools)
Monthly RANGE partitions on guard_locations
@fastify/rate-limit with Redis store (not in-memory)`}</Code>

      <H2>5,000 Users</H2>
      <Code>{`Postgres read replica for dashboards (SELECT) — writes stay on primary
2–4 Fastify containers behind Traefik load balancer
Redis Cluster (3 nodes)
CDN for tenant portal static assets (Cloudflare)
Node 20+ — native fetch, no-op for HTTP keep-alive`}</Code>

      <H2>50,000 Users</H2>
      <Code>{`EMQX MQTT broker replaces HTTP location pings
  → Guards publish to MQTT topic: guards/{tenantId}/{guardId}/location
  → EMQX bridge publishes to Redis channel sse:{tenantId}
  → HTTP /locations POST route becomes legacy (keep for fallback)
TimescaleDB on guard_locations
  → Hypertables with time-based chunks (7-day)
  → Automatic compression (90-day+ chunks)
  → Continuous aggregates for hourly/daily summaries
Separate DB for analytics and payroll reporting`}</Code>

      <H2>100,000 Users</H2>
      <Code>{`Kubernetes with HPA (Horizontal Pod Autoscaler)
Citus sharding on Postgres — shard key: tenant_id
  → Why TEXT IDs matter: no SERIAL sequences to re-seed, safe for distributed insert
PostgreSQL RLS re-enabled (session variable: SET app.tenant_id = ...)
EMQX cluster (active-active, 3+ nodes, 500k msg/s)
Microservices split: payroll, scheduling, notifications, audit
Separate services: cadence/temporal for long-running payroll workflows`}</Code>

      <H2>Schema Compatibility Checklist</H2>
      <Code>{`✓  guard_locations — no TimescaleDB-specific column types
✓  All IDs are TEXT — no SERIAL sequences (Citus-safe)
✓  All tables have tenant_id — RLS-ready
✓  guard_locations.recorded_at exists — TimescaleDB hypertable key
✗  guard_locations not yet partitioned (must do before Phase 1)
✗  Redis Pub/Sub SSE not yet wired (in-process Map today)`}</Code>

      <H2>MQTT vs SSE Decision Point</H2>
      <Code>{`SSE (current):   simple, HTTP/1.1, auth header works, ~3k concurrent connections/server
MQTT (50k+):     binary protocol, 10× lower overhead, built-in QoS, mobile battery-friendly
                 EMQX broker handles connection fan-out natively
Migration path:  mobile adds mqtt.js client, publishes to EMQX
                 EMQX rule engine bridges to Redis channel
                 SSE server side unchanged — just reads from Redis`}</Code>
    </div>
  )
}

/* ─── 11. Dev Setup ──────────────────────────────────────────────────────── */

function DevSection() {
  return (
    <div>
      <H1>Dev Setup & Credentials</H1>

      <H2>Test Accounts (seeded)</H2>
      {[
        ['admin@acme.secureops.in',      'acme123',  'tenant_admin',  'Acme Admin — full portal access'],
        ['supervisor@acme.secureops.in', 'super123', 'supervisor',    'Rajesh Kumar — site + incident management'],
        ['guard1@acme.secureops.in',     'guard123', 'guard',         'Arun Sharma — mobile app'],
        ['guard2@acme.secureops.in',     'guard123', 'guard',         'Vikram Singh — mobile app'],
        ['guard3@acme.secureops.in',     'guard123', 'guard',         'Priya Nair — mobile app'],
        ['admin@secureops.in',           'admin123', 'platform_admin','Platform Admin — cross-tenant superuser'],
      ].map(([email, pw, role, note]) => (
        <div key={email} style={{ padding: '6px 0', borderBottom: '1px solid #1f1e1b', fontSize: 11.5, ...M }}>
          <span style={{ color: '#c96442', display: 'inline-block', minWidth: 240 }}>{email}</span>
          <span style={{ color: '#10b981', display: 'inline-block', minWidth: 80 }}>{pw}</span>
          <span style={{ color: '#5c5855', display: 'inline-block', minWidth: 120 }}>{role}</span>
          <span style={{ color: '#4a4845' }}>{note}</span>
        </div>
      ))}

      <H2>Environment — API (apps/api/.env)</H2>
      <Code>{`DATABASE_URL=postgresql://secureops:secureops@localhost:5432/secureops
REDIS_URL=redis://localhost:6379
JWT_SECRET=secureops-dev-secret-at-least-32-chars-long
PASSWORD_SALT=secureops-dev-salt
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:5173
# Optional — leave blank to disable
FIREBASE_SERVICE_ACCOUNT_JSON=
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123
MINIO_BUCKET=secureops`}</Code>

      <H2>Environment — Tenant Portal (apps/tenant/.env.local)</H2>
      <Code>{`NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_TENANT_SLUG=acme`}</Code>

      <H2>Environment — Mobile (apps/mobile/.env)</H2>
      <Code>{`VITE_API_URL=http://localhost:4000/api
VITE_TENANT_SLUG=acme`}</Code>

      <H2>Running Everything Locally</H2>
      <Code lang="bash">{`# 1. Start infrastructure
docker compose up -d
# postgres:5432  redis:6379  minio:9000  mailhog:8025

# 2. Install all deps (once, or after package.json changes)
pnpm install

# 3. Seed the database (first time only)
cd packages/db && DATABASE_URL=postgresql://secureops:secureops@localhost:5432/secureops pnpm seed

# 4. Start all apps
pnpm dev           # starts api:4000 + tenant:3001 + mobile:5173 concurrently

# OR individually:
cd apps/api    && pnpm dev
cd apps/tenant && pnpm dev
cd apps/mobile && pnpm dev`}</Code>

      <H2>DB Access & Debug Queries</H2>
      <Code lang="bash">{`# psql into Docker container
docker exec -it securityapp-postgres-1 psql -U secureops -d secureops

# Drizzle Studio (visual DB browser)
cd packages/db && DATABASE_URL=... pnpm studio  # opens at https://local.drizzle.studio`}</Code>
      <Code lang="SQL">{`-- Check all users
SELECT email, role, name FROM users ORDER BY role;

-- Recent GPS pings
SELECT u.name, gl.lat, gl.lng, gl.recorded_at
FROM guard_locations gl
JOIN users u ON u.id = gl.guard_id
ORDER BY gl.recorded_at DESC LIMIT 20;

-- Open incidents
SELECT title, severity, status, created_at FROM incidents
WHERE status = 'open' ORDER BY created_at DESC;

-- Panic events
SELECT pe.triggered_at, u.name, pe.status, pe.lat, pe.lng
FROM panic_events pe JOIN users u ON u.id = pe.guard_id
ORDER BY pe.triggered_at DESC LIMIT 10;`}</Code>

      <H2>File Structure — Where to Find Things</H2>
      <Code>{`apps/api/src/
  server.ts          — Fastify setup, plugin registration, auto-migrate + seed on start
  lib/auth.ts        — requireAuth middleware, role helpers
  lib/storage.ts     — MinIO/S3 client, presigned URL generation
  routes/            — one file per resource (auth, shifts, incidents, locations …)
  plugins/tenant.ts  — fastify plugin: decorates request.tenant

apps/tenant/src/
  app/               — Next.js App Router pages
  components/
    Sidebar.tsx      — nav + DevAccountSwitcher
    AppTour.tsx      — TourProvider + dev ref panel (legacy, panel now opens new tab)
  context/
    ViewAsContext.tsx — UI role simulation (no real auth change)
  lib/api.ts         — tdApi — all API calls, base URL from NEXT_PUBLIC_API_URL

apps/mobile/src/
  components/
    TabLayout.tsx    — role-based tab sets + DevAccountBar
    QrScannerModal.tsx
  pages/             — one file per tab route
  store/auth.ts      — Zustand auth store (persisted)
  services/api.ts    — API wrapper with Bearer header

packages/db/src/
  schema/            — one file per table (Drizzle schema)
  migrations/        — generated SQL migration files
  seed.ts            — dev seed data (Acme Security + Phoenix Mall + guards)`}</Code>
    </div>
  )
}
