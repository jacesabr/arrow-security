'use client'
import React, { useState, useEffect, useRef } from 'react'

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Stats {
  guards: number; sites: number; openIncidents: number
  activeShifts: number; todayPatrols: number; todayAttendance: number
}

/* ─── Design tokens (light) ──────────────────────────────────────────────── */

const BG      = '#f9f8f6'
const SURFACE = '#ffffff'
const SF2     = '#f4f2ef'
const TEXT    = '#1a1916'
const TEXT2   = '#5c5855'
const TEXT3   = '#9a9490'
const BORDER  = '#e8e5e0'
const ACCENT  = '#c96442'
const GREEN   = '#10b981'
const MONO    = '"JetBrains Mono","Cascadia Code","Fira Code",ui-monospace,monospace'
const SANS    = 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'

/* ─── Prose atoms ────────────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ color: TEXT, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', margin: '0 0 6px', fontFamily: SANS }}>
      {children}
    </h2>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ color: TEXT, fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '36px 0 12px', fontFamily: SANS, borderBottom: `1px solid ${BORDER}`, paddingBottom: 8, color: TEXT3 }}>
      {children}
    </h3>
  )
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.75, margin: '0 0 20px', fontFamily: SANS }}>{children}</p>
}

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div style={{ margin: '10px 0 20px', borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      {lang && (
        <div style={{ background: SF2, borderBottom: `1px solid ${BORDER}`, padding: '6px 16px', fontSize: 11, color: TEXT3, fontFamily: MONO, letterSpacing: '0.04em' }}>
          {lang}
        </div>
      )}
      <pre style={{ background: SURFACE, margin: 0, padding: '16px 20px', fontSize: 12.5, color: TEXT, lineHeight: 1.8, overflowX: 'auto', fontFamily: MONO }}>
        <code>{children}</code>
      </pre>
    </div>
  )
}

function KV({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '9px 0', borderBottom: `1px solid ${BORDER}`, alignItems: 'baseline' }}>
      <span style={{ color: TEXT3, minWidth: 200, flexShrink: 0, fontSize: 13, fontFamily: MONO }}>{k}</span>
      <span style={{ color: accent ? ACCENT : TEXT2, fontSize: 13, fontFamily: SANS }}>{v}</span>
    </div>
  )
}

function Note({ children, type = 'info' }: { children: React.ReactNode; type?: 'info' | 'warn' | 'ok' }) {
  const c = type === 'ok' ? GREEN : type === 'warn' ? '#f59e0b' : '#3b82f6'
  const icon = type === 'ok' ? '✓' : type === 'warn' ? '!' : 'i'
  return (
    <div style={{ background: `${c}0d`, border: `1px solid ${c}30`, borderRadius: 10, padding: '12px 16px', margin: '0 0 20px', display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: SANS }}>
      <span style={{ color: c, fontWeight: 700, fontSize: 12, marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: TEXT2, fontSize: 13.5, lineHeight: 1.65 }}>{children}</span>
    </div>
  )
}

function Pill({ label, color = '#3b82f6' }: { label: string; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', background: `${color}12`, color, border: `1px solid ${color}30`, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontFamily: MONO, marginRight: 6, marginBottom: 6 }}>
      {label}
    </span>
  )
}

function Tag({ method }: { method: string }) {
  const c = method === 'GET' ? GREEN : method === 'POST' ? ACCENT : method === 'PATCH' ? '#3b82f6' : method === 'DELETE' ? '#ef4444' : TEXT3
  return <span style={{ color: c, fontWeight: 700, fontSize: 11.5, display: 'inline-block', minWidth: 50, fontFamily: MONO }}>{method}</span>
}

function Route({ line }: { line: string }) {
  const [method, ...rest] = line.trim().split(' ')
  return (
    <div style={{ padding: '5px 0', fontSize: 13, fontFamily: MONO, color: TEXT2 }}>
      <Tag method={method} />
      <span style={{ color: TEXT }}>/api{rest.join(' ')}</span>
    </div>
  )
}

/* ─── Flow diagram components ────────────────────────────────────────────── */

function FlowDiagram({ children }: { children: string }) {
  return (
    <div style={{ margin: '12px 0 24px', borderRadius: 10, border: `1px solid ${BORDER}`, background: SURFACE, overflow: 'hidden' }}>
      <pre style={{ margin: 0, padding: '20px 24px', fontSize: 12, lineHeight: 1.9, color: TEXT2, fontFamily: MONO, overflowX: 'auto' }}>
        {children}
      </pre>
    </div>
  )
}

function ArchBox({ title, subtitle, color = ACCENT, items }: { title: string; subtitle?: string; color?: string; items: string[] }) {
  return (
    <div style={{ border: `1.5px solid ${color}40`, borderRadius: 10, background: `${color}06`, padding: '14px 18px', marginBottom: 10 }}>
      <div style={{ color, fontWeight: 700, fontSize: 13, fontFamily: SANS, marginBottom: subtitle ? 2 : 8 }}>{title}</div>
      {subtitle && <div style={{ color: TEXT3, fontSize: 11.5, fontFamily: SANS, marginBottom: 8 }}>{subtitle}</div>}
      {items.map(item => (
        <div key={item} style={{ color: TEXT2, fontSize: 12.5, fontFamily: SANS, paddingLeft: 8, borderLeft: `2px solid ${color}30`, marginBottom: 3, lineHeight: 1.5 }}>
          {item}
        </div>
      ))}
    </div>
  )
}

function Arrow({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', color: TEXT3, fontSize: 12, fontFamily: SANS }}>
      <div style={{ flex: 1, height: 1, background: `${BORDER}` }} />
      <span style={{ color: TEXT3, fontSize: 12 }}>▼{label ? ` ${label}` : ''}</span>
      <div style={{ flex: 1, height: 1, background: BORDER }} />
    </div>
  )
}

/* ─── Section divider ────────────────────────────────────────────────────── */

function Divider() {
  return <div style={{ height: 1, background: BORDER, margin: '56px 0' }} />
}

/* ─── Nav ────────────────────────────────────────────────────────────────── */

const SECTIONS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'arch',      label: 'Architecture' },
  { id: 'flow',      label: 'Data Flow' },
  { id: 'auth',      label: 'Auth & Roles' },
  { id: 'database',  label: 'Database' },
  { id: 'api',       label: 'API Routes' },
  { id: 'realtime',  label: 'Real-time' },
  { id: 'portal',    label: 'Ops Portal' },
  { id: 'mobile',    label: 'Mobile App' },
  { id: 'ota',       label: 'OTA Updates' },
  { id: 'payroll',   label: 'Payroll' },
  { id: 'scale',     label: 'Scale Roadmap' },
  { id: 'dev',       label: 'Dev Setup' },
]

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function DevRefPage() {
  const [active, setActive] = useState('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) return
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(r => setStats(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-10% 0px -80% 0px' }
    )
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: BG, fontFamily: SANS }}>

      {/* ── Left nav ───────────────────────────────────────────────────── */}
      <aside style={{
        width: 220, flexShrink: 0, position: 'sticky', top: 0, height: '100vh',
        background: SURFACE, borderRight: `1px solid ${BORDER}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Brand */}
        <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div style={{ color: TEXT, fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 }}>Arrow Security</div>
              <div style={{ color: TEXT3, fontSize: 11, marginTop: 2 }}>Dev Reference</div>
            </div>
          </div>
          {stats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: TEXT3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, flexShrink: 0, display: 'inline-block' }} />
                {stats.guards} guards · {stats.activeShifts} on shift
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: TEXT3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, flexShrink: 0, display: 'inline-block' }} />
                {stats.openIncidents} open incidents
              </div>
              <div style={{ fontSize: 11, color: TEXT3, marginTop: 2 }}>{now}</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: 7,
                border: 'none', cursor: 'pointer', fontSize: 13.5,
                background: active === s.id ? `${ACCENT}0f` : 'transparent',
                color: active === s.id ? ACCENT : TEXT2,
                fontWeight: active === s.id ? 600 : 400,
                fontFamily: SANS, transition: 'all 0.12s',
              }}
              onMouseEnter={e => { if (active !== s.id) { (e.currentTarget as HTMLElement).style.background = SF2; (e.currentTarget as HTMLElement).style.color = TEXT } }}
              onMouseLeave={e => { if (active !== s.id) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = TEXT2 } }}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Links */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['API /health', 'https://arrow-security-api.onrender.com/health'],
            ['Operations Portal', 'https://arrow-security-tenant.onrender.com'],
            ['GitHub Actions', 'https://github.com/jacesabr/arrow-security/actions'],
          ].map(([label, url]) => (
            <a key={label} href={url} target="_blank" rel="noreferrer" style={{ color: TEXT3, fontSize: 12, textDecoration: 'none', fontFamily: SANS }}>
              ↗ {label}
            </a>
          ))}
        </div>
      </aside>

      {/* ── Main scroll ────────────────────────────────────────────────── */}
      <main ref={mainRef} style={{ flex: 1, overflowY: 'auto', padding: '64px 72px', maxWidth: 900 }}>

        {/* ── Overview ─────────────────────────────────────────────────── */}
        <section id="overview">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${ACCENT}0f`, border: `1px solid ${ACCENT}25`, borderRadius: 8, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
            <span style={{ color: ACCENT, fontSize: 12, fontWeight: 600 }}>Live on Render · arrow-security-api.onrender.com</span>
          </div>
          <SectionTitle>Arrow Security — Ops Platform</SectionTitle>
          <Lead>
            Security guard operations platform built for one company: Arrow Security. Guards use the Android app in the field; supervisors and admins use the web portal. Three apps ship from a single pnpm monorepo — API, portal, and mobile.
          </Lead>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'apps/api', desc: 'Fastify 4 + Drizzle ORM', port: ':4000', color: ACCENT },
              { label: 'apps/tenant', desc: 'Next.js 15 App Router', port: ':3001', color: '#3b82f6' },
              { label: 'apps/mobile', desc: 'Ionic 8 + Capacitor 6', port: ':5173', color: GREEN },
            ].map(item => (
              <div key={item.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ color: item.color, fontWeight: 700, fontSize: 13, fontFamily: MONO, marginBottom: 4 }}>{item.label}</div>
                <div style={{ color: TEXT2, fontSize: 13 }}>{item.desc}</div>
                <div style={{ color: TEXT3, fontSize: 12, marginTop: 4, fontFamily: MONO }}>{item.port}</div>
              </div>
            ))}
          </div>

          {stats && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
              <Pill label={`${stats.guards} guards`} color={GREEN} />
              <Pill label={`${stats.sites} sites`} color={ACCENT} />
              <Pill label={`${stats.openIncidents} open incidents`} color="#ef4444" />
              <Pill label={`${stats.activeShifts} active shifts`} color="#3b82f6" />
              <Pill label={`${stats.todayPatrols} patrols today`} color="#f59e0b" />
            </div>
          )}

          <SubTitle>Live URLs</SubTitle>
          <KV k="API"          v="https://arrow-security-api.onrender.com/api" />
          <KV k="Ops Portal"   v="https://arrow-security-tenant.onrender.com" />
          <KV k="Guard App"    v="https://arrow-security-mobile.onrender.com" />
          <KV k="APK builds"   v="GitHub Actions → arrow-security-guard-debug artifact" />

          <SubTitle>Seed Data</SubTitle>
          <KV k="Tenant"       v="Arrow Security (slug: acme)" />
          <KV k="Client"       v="Phoenix Mall, Velachery, Chennai" />
          <KV k="Sites"        v="Main Entrance (150m geofence) · Parking Level B2 (200m geofence)" />
          <KV k="Guards"       v="Arun Sharma · Vikram Singh · Priya Nair" />
          <KV k="Active shifts" v="All 3 guards on shift 08:00–20:00 today" />
        </section>

        <Divider />

        {/* ── Architecture ──────────────────────────────────────────────── */}
        <section id="arch">
          <SectionTitle>Architecture</SectionTitle>
          <Lead>
            A single vertical stack from infrastructure to mobile. Every layer has one job — PostgreSQL stores state, Redis fans out events, Fastify handles logic, Next.js renders admin UI, and Capacitor wraps the guard app for Android.
          </Lead>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 28 }}>
            <ArchBox
              title="Infrastructure"
              subtitle="Docker Compose locally · Render managed in production"
              color="#7a7773"
              items={[
                'PostgreSQL 16 — primary database (all application state)',
                'Redis 7 — BullMQ queues + SSE Pub/Sub for real-time events',
                'MinIO — S3-compatible object storage (selfies, incident photos)',
                'Mailhog — dev email trap at :8025',
              ]}
            />
            <Arrow label="used by" />
            <ArchBox
              title="packages/db"
              subtitle="Drizzle ORM · shared by API only"
              color={TEXT3}
              items={[
                'Schema-as-code — 26 tables, all with tenant_id isolation',
                'drizzle-kit for migrations + Drizzle Studio at :4983',
                'postgres-js as the underlying PG driver',
                'createId() — 12-byte base64url PKs (shorter than UUID, Citus-safe)',
              ]}
            />
            <Arrow label="used by" />
            <ArchBox
              title="apps/api — Fastify 4"
              subtitle="Port 4000 · REST + SSE · auto-deploys to Render on push to master"
              color={ACCENT}
              items={[
                '@fastify/jwt — RS256 JWT auth, 24h expiry',
                '@fastify/cors — locked to known origins via CORS_ORIGIN env',
                '@fastify/rate-limit — 200 req/min per IP',
                '@fastify/multipart — file uploads (incident photos, OTA bundles)',
                'zod — inline request body validation on every route',
                'SSE — live guard locations via Redis Pub/Sub',
              ]}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Arrow label="served to" />
                <ArchBox
                  title="apps/tenant — Next.js 15"
                  subtitle="Port 3001 · Operations Portal"
                  color="#3b82f6"
                  items={[
                    'App Router, all pages are use client',
                    'CSS custom properties — no Tailwind in JSX',
                    'MapLibre GL + OSM for live guard map',
                    'tdApi wrapper in src/lib/api.ts',
                  ]}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Arrow label="served to" />
                <ArchBox
                  title="apps/mobile — Ionic 8 + Capacitor 6"
                  subtitle="Port 5173 · Guard App → Android APK"
                  color={GREEN}
                  items={[
                    'Ionic React + React Router v5',
                    'Zustand for auth state (persisted)',
                    '@capgo/capacitor-updater for OTA JS updates',
                    'Background GPS via @capacitor-community/background-geolocation',
                  ]}
                />
              </div>
            </div>
          </div>

          <SubTitle>Monorepo Structure</SubTitle>
          <Code lang="pnpm workspaces">{`pnpm workspaces
├── apps/
│   ├── api/          Fastify 4         port 4000  — REST + SSE backend
│   ├── tenant/       Next.js 15        port 3001  — Ops Portal (supervisors/admins)
│   └── mobile/       Ionic/Capacitor   port 5173  — Guard App (PWA + native)
└── packages/
    ├── db/           Drizzle ORM — schema, migrations, seed (API only)
    └── shared/       TypeScript types + constants (all apps)`}</Code>

          <SubTitle>Key Engineering Decisions</SubTitle>
          <KV k="Fastify over Express"            v="Native TypeScript, schema validation hooks, 2× throughput, plugin lifecycle" />
          <KV k="Drizzle over Prisma"             v="SQL-like DSL, no runtime magic, works in edge runtimes, zero migration surprises" />
          <KV k="Ionic/Capacitor over React Native" v="Single codebase → PWA + Android + iOS; Capacitor bridges native APIs cleanly" />
          <KV k="SSE over WebSocket"              v="HTTP/1.1 compatible, Bearer auth header works, one-directional (guards push, never receive)" />
          <KV k="Text IDs (createId)"             v="12 random bytes base64url — shorter than UUID, URL-safe, Citus sharding compatible" />
          <KV k="Paise for payroll"               v="Integer arithmetic eliminates all floating-point rounding on Indian currency amounts" />
        </section>

        <Divider />

        {/* ── Data Flow ─────────────────────────────────────────────────── */}
        <section id="flow">
          <SectionTitle>Data Flow</SectionTitle>
          <Lead>
            Three primary flows drive the platform: GPS location pings that update the live map, incident reporting from guards, and the OTA app update pipeline.
          </Lead>

          <SubTitle>GPS Ping → Live Map</SubTitle>
          <FlowDiagram>{`  Guard phone (every 50m movement OR 30s)
  └─ @capacitor-community/background-geolocation fires watcher
       └─ POST /api/locations
            { latitude, longitude, accuracy, battery, shiftId }

  ─────────────────────────────────────────────────────────────

  Fastify handler
  ├─ requireAuth (JWT verify → tenantId, guardId)
  ├─ INSERT guard_locations { tenantId, guardId, lat, lng,
  │                          h3_res8: latLngToCell(lat, lng, 8) }
  └─ redisPublisher.publish('sse:{tenantId}', JSON event)

  ─────────────────────────────────────────────────────────────

  Redis channel  sse:{tenantId}
  └─ SSE subscriber in GET /api/locations/live
       └─ reply.raw.write('data: {JSON}\\n\\n')

  ─────────────────────────────────────────────────────────────

  Tenant portal /map page
  ├─ fetch('/api/locations/live', { headers: { Authorization } })
  ├─ ReadableStream parses 'data: ...' lines
  └─ MapLibre GL marker.setLngLat([lng, lat])   ← no re-render`}</FlowDiagram>

          <SubTitle>Incident Reporting</SubTitle>
          <FlowDiagram>{`  Guard app — IncidentNewPage.tsx
  ├─ Camera capture → blob → PUT to MinIO presigned URL
  ├─ GET /api/upload/url?key=... → downloadable URL
  └─ POST /api/incidents { siteId, title, severity, mediaUrls[] }

  ─────────────────────────────────────────────────────────────

  Fastify
  ├─ INSERT incidents { tenantId, slaDeadline = now + SLA_HOURS[severity] }
  └─ redisPublisher.publish('sse:{tenantId}', { type: 'incident', ... })

  ─────────────────────────────────────────────────────────────

  Ops Portal — Incidents page polls or receives SSE push
  └─ Supervisor: PATCH /api/incidents/:id/status → 'resolved'`}</FlowDiagram>

          <SubTitle>Payroll Calculation</SubTitle>
          <FlowDiagram>{`  Admin — POST /api/payroll/:id/calculate
  └─ Read attendance_records for period
       ├─ Count daysWorked per guard
       ├─ grossPaise = daysWorked × dailyRatePaise + bonusPaise
       ├─ pfBasic = min(gross, ₹15,000 × 100)
       ├─ pfEmployee  = round(pfBasic × 0.12)
       ├─ pfEmployer  = round(pfBasic × 0.12)
       ├─ esiEmployee = gross ≤ ₹21,000 ? round(gross × 0.0075) : 0
       ├─ esiEmployer = gross ≤ ₹21,000 ? round(gross × 0.0325) : 0
       └─ netPaise = gross − esiEmployee − pfEmployee

  Admin — POST /api/payroll/:id/finalize
  └─ Blocked if any shift_exceptions.resolvedAt IS NULL`}</FlowDiagram>
        </section>

        <Divider />

        {/* ── Auth ──────────────────────────────────────────────────────── */}
        <section id="auth">
          <SectionTitle>Auth & Roles</SectionTitle>
          <Lead>
            JWT-only authentication. No server-side sessions. The tenant slug is an internal env var — never shown to users. Login is email + password only.
          </Lead>

          <SubTitle>Login Flow</SubTitle>
          <Code lang="POST /api/auth/login">{`body: { email, password, tenantSlug }   // slug is internal, hardcoded in env

1. Resolve tenantId from slug
2. SELECT user WHERE email = ? AND tenantId = ?
3. Verify password (SHA-256 + PASSWORD_SALT for seeded accounts)
4. Sign JWT: { sub: userId, tenantId, role, iat, exp: now+24h }
5. Return: { token, user: { id, email, name, role } }`}</Code>

          <SubTitle>Role Hierarchy</SubTitle>
          <div style={{ margin: '0 0 20px' }}>
            {[
              { role: 'platform_admin', label: 'Admin',      desc: 'Cross-tenant superuser. Full access to any tenant.',                email: 'admin@secureops.in' },
              { role: 'tenant_admin',   label: 'Admin',      desc: 'Full CRUD within Arrow Security. Manages payroll, guards, sites.',   email: 'admin@acme.secureops.in' },
              { role: 'supervisor',     label: 'Supervisor', desc: 'Site management, incident resolution, shift scheduling.',           email: 'supervisor@acme.secureops.in' },
              { role: 'guard',          label: 'Guard',      desc: 'Field only: check-in, patrol, incidents.',                         email: 'guard1@acme.secureops.in' },
              { role: 'client_viewer',  label: 'Client',     desc: 'Read-only: own site incidents (stub).',                            email: '—' },
            ].map((r, i) => (
              <div key={r.role} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: ACCENT, flexShrink: 0, marginTop: 6 }} />
                <div style={{ minWidth: 90 }}>
                  <div style={{ color: ACCENT, fontWeight: 600, fontSize: 13 }}>{r.label}</div>
                  <div style={{ color: TEXT3, fontSize: 11, fontFamily: MONO }}>{r.role}</div>
                </div>
                <div style={{ flex: 1, color: TEXT2, fontSize: 13, lineHeight: 1.6 }}>{r.desc}</div>
                <div style={{ color: TEXT3, fontSize: 12, fontFamily: MONO, flexShrink: 0 }}>{r.email}</div>
              </div>
            ))}
          </div>

          <SubTitle>Middleware Chain</SubTitle>
          <Code lang="apps/api/src/lib/auth.ts">{`requireAuth          // any valid JWT — fastify.jwtVerify()
requireSupervisor    // role IN (supervisor, tenant_admin, platform_admin)
requireTenantAdmin   // role IN (tenant_admin, platform_admin)

// Every protected handler — tenant isolation is non-negotiable
fastify.get('/sites', { preHandler: requireAuth }, async (req) => {
  const { tenantId } = req.user
  const rows = await db.select().from(sites)
    .where(eq(sites.tenantId, tenantId))  // MUST always include this
})`}</Code>

          <Note type="warn">
            Every DB query in a protected route must include <code style={{ fontFamily: MONO, color: ACCENT }}>WHERE tenant_id = payload.tenantId</code>. Missing this is a data-leak vulnerability. No exceptions.
          </Note>
        </section>

        <Divider />

        {/* ── Database ──────────────────────────────────────────────────── */}
        <section id="database">
          <SectionTitle>Database</SectionTitle>
          <Lead>
            PostgreSQL 16 with Drizzle ORM. 26 tables. All primary keys are TEXT — 12 random bytes encoded as base64url via createId(), not SERIAL integers. All monetary values stored in paise (integer arithmetic).
          </Lead>

          <SubTitle>Tables</SubTitle>
          {[
            ['tenants',               'Org record. One active row (Arrow Security). tier, slug, status.'],
            ['users',                 'All users across all roles. tenantId nullable for platform_admin.'],
            ['clients',               'Client companies Arrow guards protect (e.g. Phoenix Mall).'],
            ['sites',                 'Physical locations. lat/lng + geofenceRadiusMeters + clientId.'],
            ['shifts',                'Scheduled guard shifts. status: scheduled | active | completed | missed.'],
            ['attendance_records',    'Check-in/out events. method: gps | qr | manual. selfie URL optional.'],
            ['patrols',               'Patrol sessions. status: in_progress | completed | abandoned.'],
            ['checkpoints',           'Named scan points. qrCode (unique) + optional nfcTagId.'],
            ['patrol_scans',          'Each checkpoint scan within a patrol. scannedAt + method.'],
            ['incidents',             'Field incidents. severity: low|medium|high|critical. SLA deadline on create.'],
            ['guard_locations',       'GPS pings. lat, lng, accuracy, h3_res8 cell. ~30s cadence.'],
            ['payroll_periods',       'Pay period definitions. status: draft|calculated|finalized.'],
            ['payroll_records',       'Per-guard calculation. grossPaise, netPaise, esiEmployee/Employer, pfEmployee/Employer.'],
            ['refresh_tokens',        'Token store. tokenHash = SHA-256(raw). expiresAt 30d.'],
            ['supervisor_sites',      'M2M join: which supervisors manage which sites.'],
            ['audit_log',             'HMAC-chained immutable audit trail. action, actorId, targetId, prevHash.'],
            ['shift_templates',       'Recurring shift rules. dayOfWeek, startHour, endHour, siteId, guardId.'],
            ['shift_exceptions',      'Attendance anomalies. type: missed_punch|absent|late|early_leave.'],
            ['leave_requests',        'Guard time-off. status: pending|approved|rejected. reviewedBy supervisor.'],
            ['panic_events',          'Panic button triggers. guardId, lat, lng, status: triggered|acknowledged|resolved.'],
            ['incident_form_templates', 'JSONB field definitions for dynamic incident forms. Per-tenant.'],
            ['incident_form_responses', 'Guard form submissions. incidentId + JSONB responses.'],
            ['post_orders',           'Standing orders per site. Requires guard acknowledgement.'],
            ['passdowns',             'Shift handover notes from outgoing to incoming guard.'],
            ['certifications',        'Guard cert records. type, expiresAt, issuedBy.'],
            ['app_releases',          'OTA bundles — base64 zip, version string, isCurrent flag.'],
          ].map(([t, d]) => <KV key={t} k={t} v={d} />)}

          <SubTitle>Drizzle Patterns</SubTitle>
          <Code lang="typescript">{`import { db, incidents, sites } from '@secureops/db'
import { eq, and, desc } from 'drizzle-orm'

// SELECT with join
const rows = await db
  .select({ incident: incidents, siteName: sites.name })
  .from(incidents)
  .leftJoin(sites, eq(incidents.siteId, sites.id))
  .where(and(
    eq(incidents.tenantId, tenantId),   // always filter by tenantId
    eq(incidents.status, 'open')
  ))
  .orderBy(desc(incidents.createdAt))
  .limit(50)

// INSERT returning
const [row] = await db.insert(incidents).values({ tenantId, ...body }).returning()

// UPDATE
await db.update(incidents)
  .set({ status: 'resolved', resolvedAt: new Date() })
  .where(and(eq(incidents.id, id), eq(incidents.tenantId, tenantId)))`}</Code>

          <SubTitle>guard_locations Partition Plan</SubTitle>
          <Note type="warn">
            guard_locations must be partitioned by recorded_at (monthly RANGE) before Phase 1 ships. The schema is already TimescaleDB-compatible — no type changes needed for the upgrade path.
          </Note>
          <Code lang="SQL — apply before Phase 1">{`-- Partition by month
CREATE TABLE guard_locations_2026_05 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- GiST for live-map queries
CREATE INDEX gl_geom_recent ON guard_locations USING GIST (location)
  WHERE recorded_at > now() - interval '8 hours';

-- Composite for history queries
CREATE INDEX gl_history ON guard_locations (tenant_id, guard_id, recorded_at DESC);`}</Code>
        </section>

        <Divider />

        {/* ── API ───────────────────────────────────────────────────────── */}
        <section id="api">
          <SectionTitle>API Routes</SectionTitle>
          <Lead>
            All routes under /api/. Response shape is always <code style={{ fontFamily: MONO }}>{`{ data: T }`}</code> or <code style={{ fontFamily: MONO }}>{`{ error, message, statusCode }`}</code>. Every POST/PATCH validates the body with Zod inline.
          </Lead>

          <SubTitle>Adding a Route</SubTitle>
          <Code lang="apps/api/src/routes/yourroute.ts">{`import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth, requireSupervisor } from '../lib/auth'

export const yourRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = req.user
    return { data: await db.select().from(t).where(eq(t.tenantId, tenantId)) }
  })

  app.post('/', { preHandler: requireSupervisor }, async (req) => {
    const body = z.object({ name: z.string() }).parse(req.body)
    const [row] = await db.insert(t).values({ tenantId: req.user.tenantId, ...body }).returning()
    return { data: row }
  })
}

// Register in apps/api/src/server.ts:
await app.register(yourRoutes, { prefix: '/api/your' })`}</Code>

          <SubTitle>All Routes</SubTitle>
          {([
            ['Auth',             ['POST /auth/login', 'GET /auth/me', 'POST /auth/logout']],
            ['Sites',            ['GET /sites', 'POST /sites', 'PATCH /sites/:id']],
            ['Users',            ['GET /users', 'POST /users', 'PATCH /users/:id']],
            ['Clients',          ['GET /clients', 'POST /clients']],
            ['Shifts',           ['GET /shifts', 'POST /shifts', 'PATCH /shifts/:id/status', 'POST /shifts/publish']],
            ['Shift Templates',  ['GET /shift-templates', 'POST /shift-templates', 'DELETE /shift-templates/:id', 'POST /shift-templates/materialise']],
            ['Attendance',       ['GET /attendance', 'POST /attendance', 'PATCH /attendance/:id/review']],
            ['Patrol',           ['GET /patrol', 'POST /patrol/start', 'PATCH /patrol/:id/complete']],
            ['Incidents',        ['GET /incidents', 'POST /incidents', 'GET /incidents/:id', 'PATCH /incidents/:id/status']],
            ['Locations',        ['POST /locations', 'GET /locations/history', 'GET /locations/live — SSE stream']],
            ['Guard Status',     ['GET /guard-status — active guards, selfie review, GPS online']],
            ['Panic',            ['POST /panic', 'GET /panic', 'PATCH /panic/:id/acknowledge', 'PATCH /panic/:id/resolve']],
            ['Leave',            ['GET /leave-requests', 'POST /leave-requests', 'PATCH /leave-requests/:id/review']],
            ['Payroll',          ['GET /payroll', 'POST /payroll', 'GET /payroll/:id', 'POST /payroll/:id/calculate', 'POST /payroll/:id/finalize', 'PATCH /payroll/records/:id']],
            ['Post Orders',      ['GET /post-orders', 'POST /post-orders', 'POST /post-orders/:id/ack']],
            ['Passdowns',        ['GET /passdowns', 'POST /passdowns']],
            ['Exceptions',       ['GET /exceptions', 'PATCH /exceptions/:id/resolve']],
            ['Certifications',   ['GET /certifications', 'POST /certifications', 'PATCH /certifications/:id']],
            ['Upload',           ['POST /upload/presign', 'GET /upload/url']],
            ['OTA Updates',      ['POST /app-update', 'GET /app-update/bundle', 'POST /app-update/publish']],
            ['Stats',            ['GET /stats']],
            ['Health',           ['GET /health']],
          ] as [string, string[]][]).map(([group, routes]) => (
            <div key={group} style={{ marginBottom: 18 }}>
              <div style={{ color: TEXT3, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, marginTop: 16, fontFamily: SANS }}>{group}</div>
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px' }}>
                {routes.map(r => <Route key={r} line={r} />)}
              </div>
            </div>
          ))}
        </section>

        <Divider />

        {/* ── Real-time ─────────────────────────────────────────────────── */}
        <section id="realtime">
          <SectionTitle>Real-time Architecture</SectionTitle>
          <Lead>
            Server-Sent Events (SSE) over HTTP/1.1. Guards post GPS pings to the API; the API publishes to a Redis channel; the portal /map page subscribes via SSE and updates MapLibre GL markers in real time.
          </Lead>

          <SubTitle>SSE Server Implementation</SubTitle>
          <Code lang="apps/api/src/routes/locations.ts">{`app.get('/locations/live', { preHandler: requireAuth }, async (req, reply) => {
  const { tenantId } = req.user
  const channel = \`sse:\${tenantId}\`

  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.flushHeaders()

  const sub = new Redis(process.env.REDIS_URL)
  await sub.subscribe(channel)

  sub.on('message', (_ch, msg) => reply.raw.write(\`data: \${msg}\\n\\n\`))

  // Heartbeat — keeps connection alive through proxies
  const hb = setInterval(() => reply.raw.write(': ping\\n\\n'), 25_000)

  req.raw.on('close', () => {
    clearInterval(hb)
    sub.unsubscribe(channel)
    sub.quit()
  })
})`}</Code>

          <SubTitle>SSE Client (portal /map)</SubTitle>
          <Code lang="apps/tenant/src/app/map/page.tsx">{`// Cannot use EventSource — it doesn't support Authorization headers
const res = await fetch('/api/locations/live', {
  headers: { Authorization: \`Bearer \${token}\` },
})

const reader = res.body!.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const text = decoder.decode(value)
  for (const line of text.split('\\n')) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6))
      if (event.type === 'location') {
        marker.setLngLat([event.longitude, event.latitude])
      }
    }
  }
}`}</Code>

          <Note type="warn">
            Current SSE uses Redis Pub/Sub. Before running multiple API containers, verify REDIS_URL is set in production — the in-process fallback Map won't work across containers.
          </Note>

          <SubTitle>H3 Hexagonal Indexing</SubTitle>
          <Code lang="typescript">{`import { latLngToCell } from 'h3-js'
const cell = latLngToCell(latitude, longitude, 8)
// Resolution 8 → ~0.74 km² hexagons (~860m edge-to-edge)
// Stored in guard_locations.h3_res8
// Purpose: future heatmap aggregation and density queries without PostGIS`}</Code>
        </section>

        <Divider />

        {/* ── Portal ────────────────────────────────────────────────────── */}
        <section id="portal">
          <SectionTitle>Operations Portal</SectionTitle>
          <Lead>
            Next.js 15 App Router. Every page is a client component. Auth is a localStorage token check in useEffect — no server-side session. Turbopack is the default bundler.
          </Lead>

          <SubTitle>Auth Pattern (every page)</SubTitle>
          <Code lang="typescript">{`'use client'
export default function SomePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('td_token')
    if (!t) { router.replace('/login'); return }
    setToken(t)
  }, [router])

  if (!token) return null   // prevents flash of unauthenticated content
}`}</Code>

          <SubTitle>Design System</SubTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
            {[
              { token: '--background', value: '#f9f8f6', label: 'Page background' },
              { token: '--surface', value: '#ffffff', label: 'Cards, modals' },
              { token: '--surface-2', value: '#f4f2ef', label: 'Inputs, hover' },
              { token: '--accent', value: '#c96442', label: 'Arrow orange' },
              { token: '--text', value: '#1a1916', label: 'Primary text' },
              { token: '--text-2', value: '#5c5855', label: 'Secondary text' },
              { token: '--text-3', value: '#9a9490', label: 'Muted / placeholders' },
              { token: '--green', value: '#10b981', label: 'Success, online' },
            ].map(t => (
              <div key={t.token} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: t.value, border: `1px solid ${BORDER}`, marginBottom: 8 }} />
                <div style={{ color: TEXT, fontSize: 11, fontFamily: MONO, marginBottom: 2 }}>{t.token}</div>
                <div style={{ color: TEXT3, fontSize: 11 }}>{t.label}</div>
              </div>
            ))}
          </div>

          <SubTitle>Pages</SubTitle>
          {[
            ['/login',          'All',        'Email + password. Dev credentials shown in dev builds only.'],
            ['/dashboard',      'All',        'Stats summary + recent incidents + quick action links.'],
            ['/guards',         'Admin',      'Guard CRUD table. Create / edit users with guard role.'],
            ['/sites',          'Admin',      'Site CRUD with geofence radius. Client assignment.'],
            ['/clients',        'Admin',      'Client company CRUD.'],
            ['/shifts',         'Admin',      'Shift table. Create + filter by date/guard/site.'],
            ['/roster',         'Admin',      'Weekly grid — guards as rows, days as columns. Click cell to schedule.'],
            ['/incidents',      'All',        'Incident list. Severity/status filters. SLA breach highlighting.'],
            ['/panic',          'Admin',      'Panic alerts. Acknowledge + resolve actions.'],
            ['/patrols',        'All',        'Patrol history. Duration, completion rate.'],
            ['/map',            'All',        'Live MapLibre GL map. SSE guard pings. Click guard → 8h trail.'],
            ['/guard-status',   'All',        'Live table — selfie review status, geofence, GPS online/offline.'],
            ['/leave-requests', 'All',        'Leave request list. Supervisor approves/rejects.'],
            ['/post-orders',    'Admin',      'Standing orders per site. Acknowledgement tracking.'],
            ['/payroll',        'Admin',      'Pay period management. ESI/PF calculation. Finalization gate.'],
            ['/supervisors',    'Admin',      'Supervisor list + site assignment modal.'],
            ['/settings',       'All',        'Account + org info.'],
            ['/dev-ref',        'All',        'This page. Opens in new tab from sidebar.'],
          ].map(([route, who, desc]) => (
            <div key={route} style={{ display: 'flex', gap: 14, padding: '9px 0', borderBottom: `1px solid ${BORDER}`, alignItems: 'flex-start' }}>
              <span style={{ color: ACCENT, fontFamily: MONO, fontSize: 12.5, minWidth: 150, flexShrink: 0 }}>{route}</span>
              <span style={{ color: TEXT3, fontSize: 12, minWidth: 70, flexShrink: 0 }}>{who}</span>
              <span style={{ color: TEXT2, fontSize: 13 }}>{desc}</span>
            </div>
          ))}
        </section>

        <Divider />

        {/* ── Mobile ────────────────────────────────────────────────────── */}
        <section id="mobile">
          <SectionTitle>Mobile Guard App</SectionTitle>
          <Lead>
            Ionic 8 + Capacitor 6. Single codebase ships as PWA and Android APK. GitHub Actions builds the APK on every push to master — download from the Actions tab.
          </Lead>

          <SubTitle>Role-based Tabs</SubTitle>
          <Code>{`guard      → Dashboard, Check-In, Patrol, Incidents, Leave, Shifts, Profile
supervisor → Dashboard (guard status), Map, Incidents, Leave Approvals, Profile
admin      → Dashboard (portal link), Map, Incidents, Profile`}</Code>

          <SubTitle>Background GPS</SubTitle>
          <Code lang="apps/mobile/src/pages/ShiftsPage.tsx">{`const watchId = await BackgroundGeolocation.addWatcher(
  {
    backgroundMessage: 'Arrow Security is tracking your location',
    backgroundTitle: 'Arrow Security',
    distanceFilter: 50,   // fires every 50m movement
  },
  async (location) => {
    await api.locations.track({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      shiftId: activeShift.id,
    })
  }
)

// Remove watcher on shift end or unmount
return () => BackgroundGeolocation.removeWatcher({ id: watchId })`}</Code>

          <SubTitle>Theme</SubTitle>
          <Code lang="apps/mobile/src/theme/variables.css">{`--ion-color-primary:            #c96442   (Arrow copper)
--ion-background-color:         #fafaf9   (warm cream)
--ion-card-background:          #ffffff
--ion-toolbar-background:       #ffffff
--ion-tab-bar-background:       #ffffff
--ion-tab-bar-color:            #9a9490
--ion-tab-bar-color-selected:   #c96442`}</Code>
        </section>

        <Divider />

        {/* ── OTA ───────────────────────────────────────────────────────── */}
        <section id="ota">
          <SectionTitle>OTA Updates</SectionTitle>
          <Lead>
            Self-hosted live code push via @capgo/capacitor-updater v6. GitHub Actions builds the JS bundle, zips it with files at the root (not wrapped in a dist/ folder), and publishes it to the API. The native shell stays fixed; only the JavaScript updates silently.
          </Lead>

          <SubTitle>Update Flow</SubTitle>
          <FlowDiagram>{`  Push to master → GitHub Actions
  ├─ pnpm build (Vite → dist/)
  ├─ cd dist && zip -r ../bundle.zip .    ← files at root, not in dist/
  └─ curl POST /api/app-update/publish?version={8-char git SHA}
       -H "X-Update-Token: $APP_UPDATE_TOKEN"
       -F "bundle=@bundle.zip"

  ─────────────────────────────────────────────────────────────

  API stores bundle as base64 text in app_releases table
  ├─ Mark all previous releases isCurrent = false
  ├─ INSERT new release with isCurrent = true
  └─ Keep only 3 most recent old releases (avoid DB bloat)

  ─────────────────────────────────────────────────────────────

  App launch (on device)
  ├─ @capgo/capacitor-updater POSTs to /api/app-update
  │    { version_name: "abc12345", platform: "android", ... }
  │
  ├─ Server compares device version vs current.version
  │   ├─ Same version → return {}           (no update)
  │   └─ Different   → return { version, url: "/api/app-update/bundle" }
  │
  ├─ Plugin downloads bundle silently in background
  └─ New JS bundle active on next app open (no restart needed)`}</FlowDiagram>

          <SubTitle>capacitor.config.ts</SubTitle>
          <Code lang="apps/mobile/capacitor.config.ts">{`CapacitorUpdater: {
  updateUrl: 'https://arrow-security-api.onrender.com/api/app-update',
  statsUrl: '',       // disabled — we don't collect stats
  autoUpdate: true,
  resetWhenUpdate: false,
}`}</Code>

          <Note type="info">
            <code style={{ fontFamily: MONO }}>notifyAppReady()</code> is called synchronously in main.tsx before React renders. This tells the native plugin the JS bundle loaded successfully. Without it, the updater auto-rolls back to the previous bundle after a timeout.
          </Note>
        </section>

        <Divider />

        {/* ── Payroll ───────────────────────────────────────────────────── */}
        <section id="payroll">
          <SectionTitle>Payroll — Indian Labour Law</SectionTitle>
          <Lead>
            All amounts stored in paise (₹1 = 100 paise). Integer arithmetic — no floating-point rounding errors. Covers ESI (Employees' State Insurance) and PF (Provident Fund / EPF) per Indian statutory requirements.
          </Lead>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
              <div style={{ color: TEXT3, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, fontFamily: SANS }}>ESI</div>
              <KV k="Ceiling"           v="₹21,000 / month" />
              <KV k="Employee"          v="0.75% of gross" />
              <KV k="Employer"          v="3.25% of gross" />
              <KV k="Above ceiling"     v="ESI = 0 for both" />
            </div>
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
              <div style={{ color: TEXT3, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, fontFamily: SANS }}>PF / EPF</div>
              <KV k="PF wage cap"       v="₹15,000 / month" />
              <KV k="PF basic"          v="min(gross, ₹15,000)" />
              <KV k="Employee"          v="12% of PF basic" />
              <KV k="Employer"          v="12% of PF basic" />
            </div>
          </div>

          <Code lang="Net pay formula">{`const grossPaise = daysWorked * dailyRatePaise + bonusPaise

const pfBasic     = Math.min(grossPaise, 1_500_000)          // ₹15,000 cap
const pfEmployee  = Math.round(pfBasic * 0.12)
const pfEmployer  = Math.round(pfBasic * 0.12)

const esiEmployee = grossPaise <= 2_100_000                  // ₹21,000 ceiling
  ? Math.round(grossPaise * 0.0075) : 0
const esiEmployer = grossPaise <= 2_100_000
  ? Math.round(grossPaise * 0.0325) : 0

const netPaise = grossPaise - esiEmployee - pfEmployee`}</Code>

          <SubTitle>Period Lifecycle</SubTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 20px' }}>
            {['draft', 'calculated', 'finalized'].map((s, i, arr) => (
              <React.Fragment key={s}>
                <div style={{ background: i === 0 ? SF2 : i === 1 ? `${ACCENT}15` : `${GREEN}15`, border: `1px solid ${i === 0 ? BORDER : i === 1 ? `${ACCENT}40` : `${GREEN}40`}`, borderRadius: 8, padding: '8px 16px', color: i === 0 ? TEXT3 : i === 1 ? ACCENT : GREEN, fontSize: 13, fontWeight: 600 }}>{s}</div>
                {i < arr.length - 1 && <span style={{ color: TEXT3, fontSize: 16 }}>→</span>}
              </React.Fragment>
            ))}
          </div>
          <Note type="info">
            Finalized periods are immutable. The finalization endpoint returns 409 if any guard in the period has unresolved shift_exceptions.
          </Note>
        </section>

        <Divider />

        {/* ── Scale ─────────────────────────────────────────────────────── */}
        <section id="scale">
          <SectionTitle>Scale Roadmap</SectionTitle>
          <Lead>
            Current deployment handles ~500 users on a single Render instance. Architecture is designed to reach 100,000 concurrent users without a rewrite — only additive infrastructure changes at each threshold.
          </Lead>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 24 }}>
            {[
              { range: '≤ 500', color: GREEN, title: 'Now — single Render instance',
                items: ['Redis Pub/Sub for SSE fan-out (REDIS_URL must be set in prod)', 'PgBouncer (transaction mode) in front of Postgres', 'Monthly RANGE partitions on guard_locations', '@fastify/rate-limit with Redis store'] },
              { range: '5k', color: '#3b82f6', title: 'Postgres read replica + 2–4 Fastify containers',
                items: ['Postgres read replica for dashboards (SELECT)', 'Traefik load balancer across containers', 'Redis Cluster (3 nodes)', 'CDN for portal static assets (Cloudflare)'] },
              { range: '50k', color: '#f59e0b', title: 'EMQX MQTT + TimescaleDB',
                items: ['EMQX MQTT broker replaces HTTP location pings (10× lower overhead)', 'TimescaleDB hypertables on guard_locations (7-day chunks, auto-compression)', 'Continuous aggregates for hourly/daily summaries', 'Separate analytics DB for payroll reporting'] },
              { range: '100k', color: ACCENT, title: 'Kubernetes + Citus sharding',
                items: ['Kubernetes HPA (Horizontal Pod Autoscaler)', 'Citus sharding on Postgres — shard key: tenant_id (TEXT IDs are Citus-safe)', 'PostgreSQL RLS re-enabled (SET app.tenant_id = ...)', 'EMQX cluster (active-active, 3+ nodes, 500k msg/s)'] },
            ].map(tier => (
              <div key={tier.range} style={{ display: 'flex', gap: 14, padding: '14px 16px', borderRadius: 10, border: `1px solid ${tier.color}25`, background: `${tier.color}06` }}>
                <div style={{ minWidth: 52, paddingTop: 1 }}>
                  <div style={{ color: tier.color, fontWeight: 700, fontSize: 16, fontFamily: MONO }}>{tier.range}</div>
                  <div style={{ color: TEXT3, fontSize: 10 }}>users</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: TEXT, fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{tier.title}</div>
                  {tier.items.map(item => (
                    <div key={item} style={{ color: TEXT2, fontSize: 13, paddingLeft: 10, borderLeft: `2px solid ${tier.color}30`, marginBottom: 4, lineHeight: 1.5 }}>{item}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <SubTitle>Schema Compatibility Checklist</SubTitle>
          {[
            [true,  'guard_locations — no TimescaleDB-specific column types (upgrade-ready)'],
            [true,  'All IDs are TEXT — no SERIAL sequences (Citus-safe distributed insert)'],
            [true,  'All tables have tenant_id — PostgreSQL RLS-ready'],
            [true,  'guard_locations.recorded_at exists — TimescaleDB hypertable key'],
            [false, 'guard_locations not yet partitioned (must do before Phase 1)'],
          ].map(([ok, item]) => (
            <div key={item as string} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${BORDER}`, alignItems: 'flex-start', fontSize: 13 }}>
              <span style={{ color: ok ? GREEN : '#ef4444', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{ok ? '✓' : '✗'}</span>
              <span style={{ color: TEXT2 }}>{item as string}</span>
            </div>
          ))}
        </section>

        <Divider />

        {/* ── Dev Setup ─────────────────────────────────────────────────── */}
        <section id="dev">
          <SectionTitle>Dev Setup & Credentials</SectionTitle>
          <Lead>
            Docker Compose provides all local infrastructure. Run <code style={{ fontFamily: MONO }}>pnpm dev</code> from the repo root to start all three apps simultaneously.
          </Lead>

          <SubTitle>Test Accounts</SubTitle>
          {[
            { email: 'admin@acme.secureops.in',      pw: 'acme123',  role: 'Admin',      note: 'Full portal access' },
            { email: 'supervisor@acme.secureops.in', pw: 'super123', role: 'Supervisor', note: 'Site + incident management' },
            { email: 'guard1@acme.secureops.in',     pw: 'guard123', role: 'Guard',      note: 'Arun Sharma — mobile app' },
            { email: 'guard2@acme.secureops.in',     pw: 'guard123', role: 'Guard',      note: 'Vikram Singh — mobile app' },
            { email: 'guard3@acme.secureops.in',     pw: 'guard123', role: 'Guard',      note: 'Priya Nair — mobile app' },
          ].map(u => (
            <div key={u.email} style={{ display: 'flex', gap: 14, padding: '9px 0', borderBottom: `1px solid ${BORDER}`, alignItems: 'center' }}>
              <span style={{ color: ACCENT, fontFamily: MONO, fontSize: 12.5, minWidth: 240, flexShrink: 0 }}>{u.email}</span>
              <span style={{ color: GREEN, fontFamily: MONO, fontSize: 12.5, minWidth: 70, flexShrink: 0 }}>{u.pw}</span>
              <span style={{ color: TEXT3, fontSize: 12.5, minWidth: 80, flexShrink: 0 }}>{u.role}</span>
              <span style={{ color: TEXT2, fontSize: 13 }}>{u.note}</span>
            </div>
          ))}

          <SubTitle>Quick Start</SubTitle>
          <Code lang="bash">{`# 1. Start infrastructure
docker compose up -d
# postgres:5432  redis:6379  minio:9000  mailhog:8025

# 2. Install all deps
pnpm install

# 3. Seed the database (first time only)
cd packages/db
DATABASE_URL=postgresql://secureops:secureops@localhost:5432/secureops pnpm seed

# 4. Start everything
cd ../..
pnpm dev     # starts api:4000 + tenant:3001 + mobile:5173`}</Code>

          <SubTitle>Environment — API</SubTitle>
          <Code lang="apps/api/.env">{`DATABASE_URL=postgresql://secureops:secureops@localhost:5432/secureops
REDIS_URL=redis://localhost:6379
JWT_SECRET=secureops-dev-secret-at-least-32-chars-long
PASSWORD_SALT=secureops-dev-salt
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:5173
APP_UPDATE_TOKEN=<random — must match GitHub Actions secret>
API_URL=https://arrow-security-api.onrender.com/api`}</Code>

          <SubTitle>Environment — Portal + Mobile</SubTitle>
          <Code lang="apps/tenant/.env.local">{`NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_TENANT_SLUG=acme`}</Code>
          <Code lang="apps/mobile/.env">{`VITE_API_URL=http://localhost:4000/api
VITE_TENANT_SLUG=acme`}</Code>

          <SubTitle>Useful DB Queries</SubTitle>
          <Code lang="psql — docker exec -it securityapp-postgres-1 psql -U secureops -d secureops">{`-- All users
SELECT email, role, name FROM users ORDER BY role;

-- Recent GPS pings
SELECT u.name, gl.lat, gl.lng, gl.recorded_at
FROM guard_locations gl JOIN users u ON u.id = gl.guard_id
ORDER BY gl.recorded_at DESC LIMIT 20;

-- Open incidents
SELECT title, severity, status, created_at FROM incidents
WHERE status = 'open' ORDER BY created_at DESC;`}</Code>

          <div style={{ height: 64 }} />
        </section>

      </main>
    </div>
  )
}
