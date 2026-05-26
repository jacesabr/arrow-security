'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface DevStats {
  guards: number
  sites: number
  activeShifts: number
  todayPatrols: number
  todayAttendance: number
}

interface TourContextValue {
  open: boolean
  start: () => void
  close: () => void
}

/* ─── Content ──────────────────────────────────────────────────────────────── */

const SECTIONS = [
  { id: 'stack',    label: 'Stack',       icon: '◈' },
  { id: 'auth',     label: 'Auth',        icon: '◉' },
  { id: 'database', label: 'Database',    icon: '◎' },
  { id: 'api',      label: 'API Routes',  icon: '◷' },
  { id: 'realtime', label: 'Real-time',   icon: '◌' },
  { id: 'mobile',   label: 'Mobile',      icon: '◬' },
  { id: 'payroll',  label: 'Payroll',     icon: '◫' },
  { id: 'scale',    label: 'Scale',       icon: '◩' },
  { id: 'dev',      label: 'Dev Creds',   icon: '◪' },
]

/* ─── Context ──────────────────────────────────────────────────────────────── */

const TourCtx = createContext<TourContextValue | null>(null)

export function useTour() {
  const ctx = useContext(TourCtx)
  if (!ctx) throw new Error('useTour must be used inside TourProvider')
  return ctx
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const start = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  return (
    <TourCtx.Provider value={{ open, start, close }}>
      {children}
      {open && <DevRefPanel onClose={close} />}
    </TourCtx.Provider>
  )
}

/* ─── Main Panel ───────────────────────────────────────────────────────────── */

function DevRefPanel({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState('stack')
  const [stats, setStats] = useState<DevStats | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('td_token') : null
    if (!token) return
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(r => setStats(r.data)).catch(() => {})
  }, [])

  const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono","Cascadia Code","Fira Code",ui-monospace,monospace' }
  const now = new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,7,6,0.65)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1001,
        width: 700, display: 'flex', flexDirection: 'column',
        background: '#131210', borderLeft: '1px solid #4a4845',
        boxShadow: '-8px 0 48px rgba(0,0,0,0.7)',
        ...mono,
      }}>

        {/* Header */}
        <div style={{ background: '#1f1e1b', borderBottom: '1px solid #4a4845', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z" fill="#c96442" />
            </svg>
            <span style={{ color: '#c96442', fontSize: 13, fontWeight: 700 }}>arrow</span>
            <span style={{ color: '#4a4845', fontSize: 13 }}>/</span>
            <span style={{ color: '#7a7773', fontSize: 13 }}>dev-reference</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {stats && (
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#7a7773' }}>
                <span><span style={{ color: '#10b981' }}>●</span> {stats.guards}g</span>
                <span><span style={{ color: '#3b82f6' }}>●</span> {stats.activeShifts}s</span>
              </div>
            )}
            <span style={{ fontSize: 11, color: '#4a4845' }}>{now}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7a7773', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left nav */}
          <nav style={{ width: 140, background: '#1a1916', borderRight: '1px solid #2b2a27', padding: '12px 0', flexShrink: 0, overflowY: 'auto' }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 14px', border: 'none', cursor: 'pointer',
                background: section === s.id ? 'rgba(201,100,66,0.1)' : 'none',
                borderLeft: section === s.id ? '2px solid #c96442' : '2px solid transparent',
                color: section === s.id ? '#eeece8' : '#7a7773',
                fontSize: 12, textAlign: 'left', transition: 'all 0.1s',
                ...mono,
              }}>
                <span style={{ color: section === s.id ? '#c96442' : '#4a4845', fontSize: 10 }}>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <SectionContent id={section} stats={stats} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #2b2a27', padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#4a4845' }}>esc to close · click backdrop to dismiss</span>
          <span style={{ fontSize: 11, color: '#4a4845' }}>arrow security — ops platform</span>
        </div>
      </div>
    </>
  )
}

/* ─── Section Content ──────────────────────────────────────────────────────── */

function SectionContent({ id, stats }: { id: string; stats: DevStats | null }) {
  switch (id) {
    case 'stack':    return <StackSection />
    case 'auth':     return <AuthSection />
    case 'database': return <DatabaseSection stats={stats} />
    case 'api':      return <ApiSection />
    case 'realtime': return <RealtimeSection />
    case 'mobile':   return <MobileSection />
    case 'payroll':  return <PayrollSection />
    case 'scale':    return <ScaleSection />
    case 'dev':      return <DevCredsSection />
    default:         return null
  }
}

/* ─── Shared Atoms ─────────────────────────────────────────────────────────── */

function H({ children }: { children: React.ReactNode }) {
  return <h2 style={{ color: '#eeece8', fontSize: 13, fontWeight: 700, margin: '0 0 16px', letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'inherit' }}>{children}</h2>
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h3 style={{ color: '#a3a098', fontSize: 11, fontWeight: 600, margin: '20px 0 8px', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>{children}</h3>
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{
      background: '#1a1916', border: '1px solid #2b2a27', borderRadius: 6,
      padding: '10px 14px', fontSize: 11.5, color: '#eeece8', margin: '8px 0',
      overflow: 'auto', lineHeight: 1.7, fontFamily: 'inherit',
    }}><code>{children}</code></pre>
  )
}

function KV({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid #1f1e1b', alignItems: 'baseline', fontSize: 12 }}>
      <span style={{ color: '#7a7773', minWidth: 160, flexShrink: 0 }}>{k}</span>
      <span style={{ color: accent ? '#c96442' : '#eeece8' }}>{v}</span>
    </div>
  )
}

function Tag({ children, color = '#3b82f6' }: { children: React.ReactNode; color?: string }) {
  return <span style={{ display: 'inline-block', background: `${color}18`, color, border: `1px solid ${color}30`, borderRadius: 4, padding: '1px 7px', fontSize: 10.5, marginRight: 5, marginBottom: 4 }}>{children}</span>
}

/* ─── Stack ────────────────────────────────────────────────────────────────── */

function StackSection() {
  return (
    <div>
      <H>Tech Stack</H>
      <Sub>Monorepo</Sub>
      <Code>{`pnpm workspaces
├── apps/api          Fastify 4   · port 4000
├── apps/tenant       Next.js 16  · port 3001  (Operations Portal)
├── apps/mobile       Ionic/Cap   · port 5173  (Guard App — PWA)
├── packages/db       Drizzle ORM + schema + migrations
└── packages/shared   TypeScript types + SLA constants`}</Code>

      <Sub>Infrastructure (Docker Compose)</Sub>
      <KV k="postgres 16"       v="localhost:5432  →  PgBouncer :5433" />
      <KV k="pgbouncer 1.23"    v="localhost:5433  transaction pool mode, max 1000 clients" />
      <KV k="redis 7"           v="localhost:6379  Pub/Sub SSE + BullMQ + rate-limit store" />
      <KV k="minio"             v="localhost:9000  S3-compatible (selfie uploads — wired TBD)" />
      <KV k="mailhog"           v="localhost:8025  dev email trap (SMTP :1025)" />
      <KV k="scheduler"         v="localhost:8080  OR-Tools CP-SAT sidecar (Python FastAPI)" />

      <Sub>Key Dependencies — API</Sub>
      {[
        ['@fastify/*', 'cors, helmet, jwt, rate-limit, multipart'],
        ['drizzle-orm', 'type-safe SQL query builder'],
        ['@node-rs/argon2', 'Argon2id password hashing (native binding)'],
        ['ioredis', 'Redis client — pub/sub + BullMQ'],
        ['h3-js', 'H3 hexagonal grid — res-8 cell on every GPS ping'],
        ['firebase-admin', 'FCM push notifications'],
      ].map(([k, v]) => <KV key={k} k={k} v={v} />)}

      <Sub>Key Dependencies — Mobile</Sub>
      {[
        ['@ionic/react', 'UI components + routing'],
        ['@capacitor/core', 'Native bridge (Android/iOS)'],
        ['@capacitor-community/background-geolocation', 'GPS tracking — addWatcher(distanceFilter:50)'],
        ['@capacitor-community/barcode-scanner', 'Native QR scan (v4.0.1)'],
        ['zustand', 'Auth + session state store'],
      ].map(([k, v]) => <KV key={k} k={k} v={v} />)}
    </div>
  )
}

/* ─── Auth ─────────────────────────────────────────────────────────────────── */

function AuthSection() {
  return (
    <div>
      <H>Authentication</H>
      <Sub>Flow</Sub>
      <Code>{`POST /api/auth/login  { email, password, tenantSlug? }
  → resolves tenantId from slug
  → verifies password (Argon2id or legacy SHA-256)
  → rehashes SHA-256 → Argon2id on success (zero-downtime)
  → returns { token (24h JWT), refreshToken (30d), user }

POST /api/auth/refresh  { refreshToken }
  → validates + rotates refresh token
  → returns new { token, refreshToken }

POST /api/auth/logout   { refreshToken }
  → revokes refresh token in DB`}</Code>

      <Sub>JWT Payload</Sub>
      <Code>{`{ sub: userId, tenantId, role, iat, exp }
Secret: JWT_SECRET env var (min 32 chars)`}</Code>

      <Sub>Roles (hierarchy)</Sub>
      {[
        ['platform_admin', 'Cross-tenant superuser'],
        ['tenant_admin',   'Full access within tenant'],
        ['supervisor',     'Site mgmt, scheduling'],
        ['guard',          'Field operations only'],
        ['client_viewer',  'Read-only: own sites at /client/*'],
      ].map(([r, d]) => <KV key={r} k={r} v={d} accent={r === 'tenant_admin'} />)}

      <Sub>Password Hashing</Sub>
      <Code>{`Argon2id: memoryCost=65536, timeCost=3, parallelism=1
Legacy (migration): SHA-256(pw + PASSWORD_SALT)
Detection: stored.startsWith('$argon2') → new path
           else → legacy check → rehash on success`}</Code>

      <Sub>Refresh Token Storage</Sub>
      <Code>{`Table: refresh_tokens
  tokenHash  SHA-256(rawToken) — raw never stored
  expiresAt  now + 30 days
  revokedAt  set on logout or rotation`}</Code>

      <Sub>Middleware</Sub>
      <KV k="requireAuth"        v="fastify.jwtVerify() — any valid JWT" />
      <KV k="requireSupervisor"  v="role IN (supervisor, tenant_admin, platform_admin)" />
      <KV k="requireTenantAdmin" v="role IN (tenant_admin, platform_admin)" />
    </div>
  )
}

/* ─── Database ─────────────────────────────────────────────────────────────── */

function DatabaseSection({ stats }: { stats: DevStats | null }) {
  const tables = [
    ['tenants',             'Arrow Security org record (one active row)'],
    ['users',               'All users — guards, supervisors, admins, clients'],
    ['clients',             'End-client companies (who Arrow guards protect)'],
    ['sites',               'Physical locations — lat/lng + geofence radius'],
    ['shifts',              'Scheduled guard shifts — status lifecycle'],
    ['attendance_records',  'Check-in/out events — GPS + method + photo'],
    ['patrols',             'Patrol sessions started → completed'],
    ['checkpoints',         'Named scan points — QR code + optional NFC tag'],
    ['patrol_scans',        'Individual checkpoint scans within a patrol'],
    ['guard_locations',     'GPS pings every 30s — h3_res8 + battery stored'],
    ['shift_site_visits',   'Materialised on-site / off-site segments per shift'],
    ['cameras',             'Camera records (Frigate integration stub)'],
    ['payroll_periods',     'Pay period definitions — draft → finalized'],
    ['payroll_records',     'Per-guard pay — ESI + PF — stored in PAISE'],
    ['refresh_tokens',      'Refresh token store (SHA-256 hash, not raw)'],
    ['supervisor_sites',    'JOIN: supervisor ↔ site scoping'],
    ['audit_log',           'HMAC-chained immutable audit trail'],
    ['shift_templates',     'Recurring shift rules — dayOfWeek + hours'],
    ['shift_exceptions',    'Attendance anomalies — missed_punch, absent, etc.'],
    ['panic_events',        'Panic button triggers — GPS + status lifecycle'],
    ['post_orders',         'Standing orders per site — requires ack'],
    ['passdowns',           'Shift handover notes guard→guard'],
    ['certifications',      'Guard cert records — expiry tracking'],
  ]
  return (
    <div>
      <H>Database</H>
      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <Tag color="#10b981">{stats.guards} guards</Tag>
          <Tag color="#c96442">{stats.sites} sites</Tag>
          <Tag color="#3b82f6">{stats.activeShifts} active shifts</Tag>
          <Tag color="#f59e0b">{stats.todayPatrols} patrols today</Tag>
        </div>
      )}
      <Sub>IDs</Sub>
      <Code>{`createId() → 12 random bytes, base64url encoded (~16 chars)
All PKs are TEXT — no SERIAL/UUID`}</Code>

      <Sub>Tables ({tables.length})</Sub>
      {tables.map(([t, d]) => <KV key={t} k={t} v={d} />)}

      <Sub>Payroll</Sub>
      <Code>{`All monetary values stored in PAISE (₹1 = 100 paise)
Integer arithmetic — no floating-point rounding errors`}</Code>

      <Sub>guard_locations — Partition Strategy</Sub>
      <Code>{`PARTITION BY RANGE (recorded_at)
Monthly child tables: guard_locations_2025_01 … 2026_12
Migration SQL: packages/db/migrations/guard_locations_partition.sql
Index: (tenant_id, guard_id, recorded_at DESC) for history queries
TimescaleDB upgrade path at 50k+ guards`}</Code>
    </div>
  )
}

/* ─── API Routes ───────────────────────────────────────────────────────────── */

function ApiSection() {
  const groups: [string, string[]][] = [
    ['Auth',            ['POST /auth/login', 'POST /auth/refresh', 'GET /auth/me', 'POST /auth/logout']],
    ['Sites',           ['GET /sites', 'POST /sites', 'PATCH /sites/:id']],
    ['Users',           ['GET /users', 'POST /users', 'PATCH /users/:id', 'PATCH /users/me/fcm-token']],
    ['Clients',         ['GET /clients', 'POST /clients']],
    ['Shifts',          ['GET /shifts', 'POST /shifts', 'PATCH /shifts/:id/status', 'POST /shifts/solve']],
    ['Shift Templates', ['GET /shift-templates', 'POST /shift-templates', 'DELETE /shift-templates/:id', 'POST /shift-templates/materialise']],
    ['Attendance',      ['GET /attendance', 'POST /attendance']],
    ['Patrol',          ['GET /patrol', 'POST /patrol/start', 'GET /patrol/checkpoints', 'POST /patrol/checkpoints', 'POST /patrol/:id/scan', 'PATCH /patrol/:id/complete']],
    ['Locations',       ['POST /locations (GPS ping)', 'GET /locations/history', 'GET /locations/live (SSE)']],
    ['Shifts',          ['GET /shifts', 'POST /shifts', 'PATCH /shifts/:id/status', 'GET /shifts/:id/replay']],
    ['Panic',           ['POST /panic', 'GET /panic', 'PATCH /panic/:id/acknowledge', 'PATCH /panic/:id/resolve']],
    ['Payroll',         ['GET /payroll', 'POST /payroll', 'GET /payroll/:id', 'POST /payroll/:id/calculate', 'PATCH /payroll/records/:id', 'POST /payroll/:id/finalize']],
    ['Post Orders',     ['GET /post-orders', 'POST /post-orders', 'GET /post-orders/:id', 'POST /post-orders/:id/ack']],
    ['Passdowns',       ['GET /passdowns', 'POST /passdowns']],
    ['Exceptions',      ['GET /exceptions', 'PATCH /exceptions/:id/resolve']],
    ['Certifications',  ['GET /certifications', 'POST /certifications', 'PATCH /certifications/:id']],
    ['Supervisor Sites',['GET /supervisor-sites', 'POST /supervisor-sites', 'DELETE /supervisor-sites/:siteId']],
    ['Audit Log',       ['GET /audit-log']],
    ['Stats',           ['GET /stats']],
    ['Cameras',         ['GET /cameras', 'POST /cameras', 'POST /cameras/frigate-event']],
    ['Health',          ['GET /health']],
  ]
  return (
    <div>
      <H>API Routes</H>
      <Code>{`Base URL: http://localhost:4000/api
Response: { data: T } | { error, message, statusCode }
Auth: Authorization: Bearer <JWT>`}</Code>
      {groups.map(([group, routes]) => (
        <div key={group} style={{ marginBottom: 12 }}>
          <Sub>{group}</Sub>
          {routes.map(r => (
            <div key={r} style={{ padding: '3px 0', fontSize: 11.5, color: '#a3a098' }}>
              <span style={{ color: r.startsWith('GET') ? '#10b981' : r.startsWith('POST') ? '#c96442' : r.startsWith('PATCH') ? '#3b82f6' : '#f59e0b', marginRight: 10 }}>
                {r.split(' ')[0]}
              </span>
              <span style={{ color: '#eeece8' }}>/api{r.split(' ').slice(1).join(' ')}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ─── Real-time ────────────────────────────────────────────────────────────── */

function RealtimeSection() {
  return (
    <div>
      <H>Real-time Architecture</H>
      <Sub>Guard Location Flow</Sub>
      <Code>{`Mobile (every 30s, distanceFilter=50m)
  └─ POST /api/locations  { lat, lng, accuracy, battery, shiftId }
      ├─ INSERT guard_locations  (h3_res8 computed via h3-js latLngToCell(8))
      └─ redisPublisher.publish('sse:{tenantId}', JSON event)
             └─ All open SSE connections for the tenant receive it
                 └─ Map page updates marker position`}</Code>

      <Sub>SSE Architecture</Sub>
      <Code>{`GET /api/locations/live  (hijacked connection, text/event-stream)
  ├─ createSubscriber()  — new ioredis instance PER connection
  │    (subscriber-mode conflicts prevent sharing a connection)
  ├─ sub.subscribe('sse:{tenantId}')
  ├─ heartbeat: res.write(': ping\\n\\n') every 25s
  └─ request.raw.on('close') → sub.unsubscribe() → sub.quit()

Redis channel: 'sse:{tenantId}'
Event types published: 'location', 'panic'`}</Code>

      <Sub>H3 Hexagonal Grid</Sub>
      <Code>{`Resolution 8 → ~0.74 km² hexagons
Column: guard_locations.h3_res8 = latLngToCell(lat, lng, 8)
Use: future heatmap aggregation, spatial joins`}</Code>

      <Sub>Map Page (tenant portal /map)</Sub>
      <Code>{`fetch() + ReadableStream — NOT EventSource
(EventSource can't set Authorization header)

Parses SSE: data: {JSON}
On 'location' event: update MapBox GL marker
On guard click: GET /locations/history?guardId=&since=8h ago
                → draw coloured polyline trail`}</Code>

      <Sub>Panic Broadcast</Sub>
      <Code>{`POST /panic → INSERT panic_events
           → publish('sse:{tenantId}', { type:'panic', ... })
Map page receives panic event → can show alert overlay`}</Code>

      <Sub>Rate Limiting</Sub>
      <Code>{`@fastify/rate-limit: max 200 req/min per IP
Redis store (not in-memory) — works behind load balancer
Redis key: rl:{ip}`}</Code>
    </div>
  )
}

/* ─── Mobile ───────────────────────────────────────────────────────────────── */

function MobileSection() {
  return (
    <div>
      <H>Mobile Guard App</H>
      <Sub>Tech</Sub>
      <KV k="Framework"   v="Ionic React + Capacitor — PWA + native Android/iOS" />
      <KV k="State"       v="Zustand — auth store (token, user, logout)" />
      <KV k="API"         v="src/services/api.ts — fetch wrapper with Bearer header" />
      <KV k="Base URL"    v="VITE_API_URL env var (default :4000/api)" />
      <KV k="Tenant slug" v="VITE_TENANT_SLUG — hardcoded per deployment, never shown in UI" />

      <Sub>Background GPS (ShiftsPage.tsx)</Sub>
      <Code>{`import { registerPlugin } from '@capacitor/core'
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

// Start tracking when shift is active
const id = await BackgroundGeolocation.addWatcher(
  { backgroundMessage: 'Arrow Security is tracking your location', distanceFilter: 50 },
  (loc) => postLocationPing(loc)  // POST /api/locations
)

// Stop on shift end or component unmount
await BackgroundGeolocation.removeWatcher({ id })`}</Code>

      <Sub>QR Scanner (QrScannerModal.tsx)</Sub>
      <Code>{`@capacitor-community/barcode-scanner@4.0.1
  await BarcodeScanner.checkPermission({ force: true })
  BarcodeScanner.hideBackground()
  document.body.classList.add('scanner-active')
  const { hasContent, content } = await BarcodeScanner.startScan()
  // CSS in variables.css hides modal backdrop during scan`}</Code>

      <Sub>Pages</Sub>
      {[
        ['/tabs/dashboard',  'Stats + quick actions + today\'s shifts'],
        ['/tabs/check-in',   'GPS + QR/manual/face check-in/out + geofence display'],
        ['/tabs/patrol',     'Start patrol, scan checkpoints (QR or manual)'],
        ['/tabs/shifts',     'Scheduled shifts — starts GPS tracking when active'],
        ['/tabs/profile',    'Guard profile + FCM token registration'],
      ].map(([r, d]) => <KV key={r} k={r} v={d} />)}

      <Sub>Role-based Tab Layout</Sub>
      <Code>{`guard      → Dashboard, CheckIn, Patrol, Shifts, Profile
supervisor → Dashboard, CheckIn, Shifts, Profile
admin      → Dashboard, Shifts, Profile`}</Code>

      <Sub>Theme</Sub>
      <Code>{`variables.css sets Ionic CSS custom properties:
--ion-color-primary:          #c96442  (copper)
--ion-background-color:       #fafaf9  (cream)
--ion-card-background:        #ffffff
--ion-toolbar-background:     #ffffff
--ion-tab-bar-background:     #ffffff
--ion-tab-bar-color:          #9a9490
--ion-tab-bar-color-selected: #c96442`}</Code>
    </div>
  )
}

/* ─── Payroll ──────────────────────────────────────────────────────────────── */

function PayrollSection() {
  return (
    <div>
      <H>Payroll — Indian Labour Law</H>
      <Sub>ESI (Employees' State Insurance)</Sub>
      <Code>{`Eligibility: gross ≤ ₹21,000/month (₹2,100,000 paise)
Employee contribution: 0.75% of gross
Employer contribution: 3.25% of gross
Above ceiling: ESI does not apply`}</Code>

      <Sub>PF (Provident Fund)</Sub>
      <Code>{`Basic wage for PF = min(gross, ₹15,000) → PF_BASIC_CAP = ₹1,500,000 paise
Employee: 12% of PF basic
Employer: 12% of PF basic`}</Code>

      <Sub>Net Pay Formula</Sub>
      <Code>{`grossPaise = daysWorked × dailyRatePaise + bonusPaise
netPaise   = grossPaise
           - esiEmployeePaise
           - pfEmployeePaise
           - otherDeductionsPaise`}</Code>

      <Sub>Finalization Gate</Sub>
      <Code>{`POST /payroll/:id/finalize blocked if:
  1. Period still in 'draft' (calculate first)
  2. Any guard in period has resolvedAt IS NULL shift_exceptions
     → returns 409 with list of blocking exception IDs`}</Code>

      <Sub>Period Lifecycle</Sub>
      <Code>{`draft → (POST /calculate) → calculated → (POST /finalize) → finalized
Finalized periods are immutable — no further updates`}</Code>
    </div>
  )
}

/* ─── Scale ────────────────────────────────────────────────────────────────── */

function ScaleSection() {
  return (
    <div>
      <H>Scale Roadmap</H>
      <Code>{`Current target: 500 concurrent users
Ceiling (no rewrite): 100,000 concurrent users`}</Code>

      {[
        ['≤ 500 users\n(now)', `Docker Compose — all on one host
PgBouncer (transaction mode) in front of Postgres :5433
Redis Pub/Sub for SSE fan-out (already implemented)
BullMQ via Redis for async jobs
Monthly range partitions on guard_locations
@fastify/rate-limit with Redis store`],
        ['5,000 users', `Postgres read replica for dashboard queries
2–4 Fastify containers behind Traefik load balancer
Redis Cluster (3 nodes minimum)
CDN for tenant portal static assets`],
        ['50,000 users', `EMQX MQTT broker replaces HTTP location pings
  → Guards publish via MQTT, bridge publishes to Redis
TimescaleDB on guard_locations (Hypertables + compression)
Separate read DB for analytics + payroll reporting`],
        ['100,000 users', `Kubernetes with HPA (Horizontal Pod Autoscaler)
Citus sharding on Postgres (shard key: tenant_id)
PostgreSQL RLS re-enabled with proper session var setup
EMQX cluster (active-active, 3+ nodes)
Separate microservices: payroll, scheduling, notifications`],
      ].map(([threshold, detail]) => (
        <div key={threshold} style={{ marginBottom: 16 }}>
          <Sub>{threshold.split('\n')[0]} {threshold.includes('\n') ? <span style={{ color: '#c96442', fontSize: 10 }}>{threshold.split('\n')[1]}</span> : null}</Sub>
          <Code>{detail}</Code>
        </div>
      ))}

      <Sub>Schema Compatibility Checklist</Sub>
      <Code>{`✓ guard_locations — no TimescaleDB-specific types
✓ IDs are TEXT (not SERIAL) — safe for Citus distribution
✓ All tables have tenant_id — RLS-ready when needed
✓ guard_locations partition migration SQL ready
  → packages/db/migrations/guard_locations_partition.sql`}</Code>
    </div>
  )
}

/* ─── Dev Creds ────────────────────────────────────────────────────────────── */

function DevCredsSection() {
  return (
    <div>
      <H>Dev Credentials &amp; Config</H>
      <Sub>Login Credentials (password: password123 for all)</Sub>
      {[
        ['admin@acme.in',    'tenant_admin',   'Full portal access'],
        ['super@acme.in',    'supervisor',     'Site management + scheduling'],
        ['guard1@acme.in',   'guard',          'Mobile app — shift tracking'],
        ['guard2@acme.in',   'guard',          'Mobile app — shift tracking'],
        ['guard3@acme.in',   'guard',          'Mobile app — shift tracking'],
        ['admin@secureops.in','platform_admin','Cross-tenant superuser'],
      ].map(([email, role, note]) => (
        <div key={email} style={{ padding: '5px 0', borderBottom: '1px solid #1f1e1b', fontSize: 12 }}>
          <span style={{ color: '#c96442', display: 'inline-block', minWidth: 200 }}>{email}</span>
          <span style={{ color: '#7a7773', display: 'inline-block', minWidth: 120 }}>{role}</span>
          <span style={{ color: '#4a4845' }}>{note}</span>
        </div>
      ))}

      <Sub>Environment Variables — API (apps/api/.env)</Sub>
      <Code>{`DATABASE_URL=postgresql://secureops:secureops@localhost:5432/secureops
JWT_SECRET=secureops-dev-secret-minimum-32-chars-long
PASSWORD_SALT=secureops-dev-salt
PORT=4000
REDIS_URL=redis://localhost:6379
SCHEDULER_URL=http://localhost:8080
FIREBASE_SERVICE_ACCOUNT_JSON=   ← leave blank to disable push`}</Code>

      <Sub>Environment Variables — Tenant Portal (apps/tenant/.env.local)</Sub>
      <Code>{`NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_TENANT_SLUG=acme`}</Code>

      <Sub>Environment Variables — Mobile (apps/mobile/.env)</Sub>
      <Code>{`VITE_API_URL=http://localhost:4000/api
VITE_TENANT_SLUG=acme`}</Code>

      <Sub>Starting Everything</Sub>
      <Code>{`# Infrastructure
docker compose up -d

# All apps (root)
pnpm dev

# Or individually
cd apps/api    && pnpm dev   # :4000
cd apps/tenant && pnpm dev   # :3001
cd apps/mobile && pnpm dev   # :5173

# DB tools (from packages/db/)
DATABASE_URL=... pnpm push    # push schema changes
DATABASE_URL=... pnpm seed    # reseed dev data
DATABASE_URL=... pnpm studio  # Drizzle Studio UI`}</Code>

      <Sub>DB Access</Sub>
      <Code>{`docker exec securityapp-postgres-1 psql -U secureops -d secureops

# Useful queries
SELECT email, role FROM users;
SELECT COUNT(*) FROM guard_locations;
SELECT * FROM panic_events ORDER BY triggered_at DESC LIMIT 5;`}</Code>

      <Sub>Seed Data</Sub>
      <Code>{`No automatic seed — the database stays empty until a tenant
registers via /register. Use the operations portal to create
clients, sites, guards, and shifts.`}</Code>
    </div>
  )
}

/* ─── Trigger Button ───────────────────────────────────────────────────────── */

export function TourTrigger() {
  // Managers only — guards & client viewers don't get the dev-reference pill.
  // Reads the role from localStorage (same source the sidebar uses).
  const [isManager, setIsManager] = useState(false)
  useEffect(() => {
    try {
      const u = localStorage.getItem('td_user')
      if (!u) return
      const role = JSON.parse(u).role
      setIsManager(role === 'tenant_admin' || role === 'platform_admin' || role === 'supervisor')
    } catch { /* ignore */ }
  }, [])

  if (!isManager) return null

  return (
    <button
      onClick={() => window.open('/dev-ref', '_blank')}
      title="Developer reference (architecture + credentials)"
      style={{
        position: 'fixed', bottom: 24, left: 24, zIndex: 900,
        height: 32, padding: '0 12px', borderRadius: 6,
        background: '#1f1e1b', border: '1px solid #4a4845',
        color: '#7a7773', fontSize: 11, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        fontFamily: '"JetBrains Mono","Cascadia Code",ui-monospace,monospace',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#c96442'; e.currentTarget.style.color = '#c96442' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#4a4845'; e.currentTarget.style.color = '#7a7773' }}
    >
      <span style={{ fontSize: 13 }}>◈</span> dev ref
    </button>
  )
}
