'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, CardHeader } from '../../components/ui'

function PhaseBadge({ label, color }: { label: string; color: string }) {
  const bg: Record<string, string> = {
    production:       '#22c55e',
    'phase 2':        '#3b82f6',
    'known limitation': '#f59e0b',
  }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      color: '#fff',
      background: bg[label] ?? color,
      letterSpacing: '0.03em',
      textTransform: 'uppercase' as const,
    }}>
      {label}
    </span>
  )
}

function TechCard({
  name,
  badge,
  why,
  tradeoffs,
  children,
}: {
  name: string
  badge: 'production' | 'phase 2' | 'known limitation'
  why: string
  tradeoffs: string
  children?: React.ReactNode
}) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15, flex: 1 }}>{name}</span>
        <PhaseBadge label={badge} color="" />
      </div>
      <div style={{ padding: '16px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 6 }}>
            Why we chose it
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{why}</p>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 6 }}>
            Trade-offs
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{tradeoffs}</p>
        </div>
      </div>
      {children && (
        <div style={{ padding: '0 22px 18px' }}>
          {children}
        </div>
      )}
    </Card>
  )
}

function DiagramBox({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1.5px solid var(--border)',
      borderRadius: 8,
      padding: '10px 18px',
      textAlign: 'center' as const,
      minWidth: 180,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Arrow({ vertical }: { vertical?: boolean }) {
  if (vertical) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, margin: '4px 0' }}>
        ↓
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)', fontSize: 18, margin: '0 6px' }}>
      →
    </div>
  )
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: 'ui-monospace, monospace',
      fontSize: 12,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      padding: '1px 6px',
      color: 'var(--accent)',
    }}>
      {children}
    </code>
  )
}

export default function AboutPage() {
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) router.replace('/login')
  }, [router])

  return (
    <PageShell>
      <Main maxWidth={900}>
        <PageHeader
          title="Tech Stack"
          subtitle="Architecture decisions, trade-offs, and rationale for every technology in Arrow Security"
        />

        {/* Architecture diagram */}
        <Card style={{ marginBottom: 24 }}>
          <CardHeader title="System Architecture" />
          <div style={{ padding: '24px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, flexWrap: 'wrap' as const, rowGap: 16 }}>
              <DiagramBox label="Guard App" sub="Ionic / Capacitor · port 5173" />
              <Arrow />
              <DiagramBox label="Fastify API" sub="Node.js · port 4000" />
              <Arrow />
              <DiagramBox label="PostgreSQL 16" sub="via PgBouncer (planned)" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginTop: 8, flexWrap: 'wrap' as const, rowGap: 8 }}>
              <DiagramBox label="Operations Portal" sub="Next.js 16 · port 3001" />
              <Arrow />
              <div style={{
                minWidth: 180,
                textAlign: 'center' as const,
                color: 'var(--text-3)',
                fontSize: 12,
                padding: '10px 18px',
              }}>
                same API ↑
              </div>
            </div>

            <div style={{
              marginTop: 20,
              padding: '14px 18px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <pre style={{
                margin: 0,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                color: 'var(--text-2)',
                lineHeight: 1.7,
                whiteSpace: 'pre' as const,
                overflowX: 'auto' as const,
              }}>{`[Guard App (Ionic/Capacitor)]  ──HTTP──►  [Fastify API :4000]  ──►  [PostgreSQL 16]
[Operations Portal (Next.js)]  ──HTTP──►  [Fastify API :4000]  ─┘
                                                  │
                                          ┌───────┴────────┐
                                   [SSE stream]       [MapLibre GL]
                                  live GPS pings      OSM raster tiles
                                          │
                               [In-proc Map<tenantId,Set<fn>>]
                               (→ Redis Pub/Sub before multi-server)`}</pre>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
              {[
                { color: '#22c55e', label: 'Production — in use today' },
                { color: '#3b82f6', label: 'Phase 2 — planned' },
                { color: '#f59e0b', label: 'Known limitation — documented' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-2)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block', flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Monorepo */}
        <TechCard
          name="pnpm Workspaces Monorepo"
          badge="production"
          why="All three apps (API, Operations Portal, Guard App) share @secureops/db (Drizzle schema) and @secureops/shared (TypeScript types + constants). No type duplication — a change to a shared type surfaces as a compile error in all consumers immediately. pnpm's hard-link store keeps node_modules fast even with three apps."
          tradeoffs="Build caching across packages requires turborepo or nx — not yet added. Cross-app refactors touch multiple packages. The trade-off is worth it: shared types eliminate the entire class of frontend/backend desync bugs."
        >
          <pre style={{ margin: '8px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', lineHeight: 1.6, overflowX: 'auto' as const }}>{`pnpm workspaces
├── apps/
│   ├── api/       Fastify 4 REST + SSE backend
│   ├── tenant/    Next.js 16 Operations Portal
│   └── mobile/    Ionic + Capacitor Guard App
└── packages/
    ├── db/        Drizzle ORM schema + migrations
    └── shared/    TypeScript types + constants`}</pre>
        </TechCard>

        {/* Fastify */}
        <TechCard
          name="Fastify 4"
          badge="production"
          why="Chosen over Express for two reasons: roughly 2× the throughput on the same hardware (benchmarked by the Fastify team, reproducible via autocannon), and native async/await throughout with no callback-based middleware chains. Built-in JSON schema validation hooks directly into the serialize path — Fastify skips JSON.stringify re-serialisation for validated responses. TypeScript support is first-class, not bolted on."
          tradeoffs="Smaller plugin ecosystem than Express (though all essentials exist: fastify-jwt, fastify-rate-limit, @fastify/cors). Plugin ordering matters — registering a decorator after a plugin that depends on it throws at startup, which is good (fail-fast) but requires discipline. Request validation uses Zod inline rather than JSON Schema directly, keeping type inference."
        >
          <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>Route pattern</div>
            <pre style={{ margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{`fastify.get('/sites', { preHandler: requireAuth }, async (request) => {
  const payload = request.user          // typed JWT payload
  const rows = await db.select()
    .from(sites)
    .where(eq(sites.tenantId, payload.tenantId))
  return { data: rows }
})`}</pre>
          </div>
        </TechCard>

        {/* PostgreSQL + Drizzle */}
        <TechCard
          name="PostgreSQL 16 + Drizzle ORM"
          badge="production"
          why="PostgreSQL is the industry default for OLTP with strong GIS support (PostGIS), partial indexes, and table partitioning — all needed for guard_locations at scale. Drizzle was chosen over Prisma because it generates zero-overhead SQL (no n+1 magic, no query engine process), its schema is plain TypeScript (no .prisma DSL to learn), and migrations are SQL files you can read. The type system goes all the way from schema definition to query result — no type assertions needed."
          tradeoffs="Drizzle's ecosystem is younger than Prisma's — some helper utilities (seeding, visual studio) are less mature. No automatic relation loading (must write joins explicitly), which is the right trade-off for a backend that needs predictable query plans. Prisma's Accelerate/Pulse features are not available."
        >
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>ID strategy</div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
                12 random bytes encoded as base64url via <InlineCode>createId()</InlineCode> — shorter than UUID v4 (16 bytes / 36 chars) while remaining globally unique. Compact in URLs, index-friendly as text primary keys.
              </p>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>Money in paise</div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
                All monetary amounts stored as integer paise (1/100 of a rupee). Eliminates floating-point rounding — <InlineCode>0.1 + 0.2 !== 0.3</InlineCode> in IEEE 754 but <InlineCode>10 + 20 === 30</InlineCode> always in integers.
              </p>
            </div>
          </div>
        </TechCard>

        {/* Next.js */}
        <TechCard
          name="Next.js 16 (App Router)"
          badge="production"
          why="App Router enables the server component / client component split: the outer shell (layout, sidebar) renders on the server with zero JS hydration cost, while the data-heavy pages use 'use client' for real-time state. File-based routing makes adding a new page as simple as creating a directory. No Tailwind — the design system uses CSS custom properties (var(--accent), var(--surface), etc.) so white-labelling to a new brand is a single globals.css swap."
          tradeoffs="App Router has a steeper mental model than Pages Router (server vs client boundary, async server components, cache behaviour). Mixing server and client components in the same tree requires careful prop serialisation — no passing functions or class instances across the boundary. The no-Tailwind choice requires more verbose inline styles."
        />

        {/* Ionic + Capacitor */}
        <TechCard
          name="Ionic + Capacitor 6"
          badge="production"
          why="Single React codebase deployable as a PWA (web), Android APK, and iOS IPA. Guards carry Android phones — Capacitor wraps the web app in a native WebView and gives access to native APIs (camera, geolocation, NFC) via typed plugins. Ionic's component library provides mobile-appropriate UI primitives (tabs, gestures, back navigation) without building from scratch."
          tradeoffs="WebView performance is below native on older Android devices — acceptable for a data-entry app, not for video or heavy graphics. Capacitor plugins vary in quality; community plugins (SQLite, NFC) may lag behind OS updates. React Native would offer better native performance but requires maintaining separate codebases or complex bridging."
        />

        {/* MapLibre */}
        <TechCard
          name="MapLibre GL + OpenStreetMap"
          badge="production"
          why="Zero API key required. MapLibre GL is the MIT-licensed fork of Mapbox GL JS — identical rendering engine, no usage billing, no vendor lock-in. OpenStreetMap raster tiles are served by the OSM community. Live guard positions stream via Server-Sent Events using fetch() with a ReadableStream (not the native EventSource API, which cannot send Authorization headers)."
          tradeoffs="OSM raster tiles have lower visual fidelity than Mapbox Satellite or Google Maps. No traffic layer, no geocoding API included. For 50k+ guards, the SSE fan-out must migrate from the current in-process Map to Redis Pub/Sub — EMQX MQTT replaces HTTP pings entirely at that scale."
        >
          <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>Why fetch() not EventSource</div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
              The native <InlineCode>EventSource</InlineCode> API does not support custom request headers — there is no way to pass <InlineCode>Authorization: Bearer token</InlineCode>. Using <InlineCode>fetch()</InlineCode> with <InlineCode>response.body.getReader()</InlineCode> gives a <InlineCode>ReadableStream</InlineCode> that supports any headers while still consuming the SSE text stream.
            </p>
          </div>
        </TechCard>

        {/* Multi-tenancy */}
        <TechCard
          name="Multi-tenancy via JWT"
          badge="production"
          why="POST /auth/login resolves the tenantSlug (hardcoded via NEXT_PUBLIC_TENANT_SLUG env var — never visible to users) to a tenantId, which is embedded in the JWT alongside the userId and role. Every protected route extracts payload.tenantId and adds WHERE tenant_id = payload.tenantId to every DB query. White-labelling is a different env var, not a code change."
          tradeoffs="Row-level isolation in application code (not PostgreSQL RLS) means a bug in a route handler could theoretically leak cross-tenant data — the risk is mitigated by code review and will be replaced with PostgreSQL RLS at 100k scale. JWT-only auth (no server sessions) means a compromised token cannot be revoked until it expires (24h). Token revocation via a Redis blocklist is planned."
        >
          <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>JWT payload</div>
            <pre style={{ margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{`{ sub: userId, tenantId, role, iat, exp }   // 24h expiry
// Roles: platform_admin > tenant_admin > supervisor > guard > client_viewer`}</pre>
          </div>
        </TechCard>

        {/* Indian payroll */}
        <TechCard
          name="Indian Payroll — ESI + PF"
          badge="production"
          why="Built in-house in ~100 lines of TypeScript. No third-party payroll library is needed for the statutory deduction rules, which are fixed by Indian law. ESI: 0.75% employee / 3.25% employer on wages ≤ ₹21,000/month. PF: 12% employee / 12% employer on basic ≤ ₹15,000/month. Amounts stored in paise (integers) to avoid floating-point rounding on currency arithmetic."
          tradeoffs="Tax rules change — ESI wage ceiling was last revised in 2019. The calculation logic must be updated whenever the government revises rates or thresholds. A more complex scenario (variable allowances, arrears, TDS) would require a dedicated payroll engine. This implementation is correct for standard monthly guard payroll."
        >
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 6 }}>ESI</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
                Applicable if gross ≤ ₹21,000/mo<br />
                Employee: 0.75% of gross<br />
                Employer: 3.25% of gross
              </div>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 6 }}>PF</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
                Applicable if basic ≤ ₹15,000/mo<br />
                Employee: 12% of basic<br />
                Employer: 12% of basic
              </div>
            </div>
          </div>
        </TechCard>

        {/* Password hashing */}
        <TechCard
          name="Password Hashing — SHA-256 + Salt"
          badge="known limitation"
          why="The current implementation uses SHA-256 + a server-side PASSWORD_SALT environment variable. It is simple to implement and deterministic (no bcrypt work factor tuning needed). For a development-phase product with a small, trusted user base (guards onboarded by an admin, not self-registered), the immediate risk is low."
          tradeoffs="SHA-256 is a fast hash — a GPU can compute billions per second, making offline dictionary attacks practical if the database is leaked. bcrypt or Argon2 is the correct choice for production: they are intentionally slow (configurable work factor) and memory-hard (Argon2). Migration to bcrypt is scheduled before the platform leaves beta — existing passwords will be rehashed on next login."
        />

        {/* OR-Tools scheduler */}
        <TechCard
          name="OR-Tools CP-SAT Scheduler"
          badge="phase 2"
          why="Shift scheduling is a constraint satisfaction problem: assign guards to sites across a week respecting rest hours, consecutive-day caps, certification requirements, and leave. Google OR-Tools CP-SAT solves ~2,100 boolean variables (20 guards × 5 sites × 7 days × 3 shifts) in 5–30 seconds on a single CPU core. Python FastAPI microservice at services/scheduler/ — isolated from the Node.js stack."
          tradeoffs="Requires a Python service deployment alongside the Node.js API. OR-Tools is a C++ library with Python bindings — container image is ~400 MB. Alternatives considered: Timefold (formerly OptaPlanner, Java/JVM — adds JVM startup overhead and 512 MB RAM baseline), simple greedy assignment (fast but cannot honour complex constraints like consecutive-day caps and certification matches)."
        >
          <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>Problem size at scale</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
              20 guards × 5 sites × 7 days = <strong>700 possible assignments</strong><br />
              3 shifts/day per site × 7 days = <strong>2,100 boolean decision variables</strong><br />
              Solver time: 5–30s per weekly solve (dispatched via BullMQ, result pushed via SSE)
            </div>
          </div>
        </TechCard>

        {/* Offline-first mobile */}
        <TechCard
          name="Offline-First Mobile (SQLite Write Queue)"
          badge="phase 2"
          why="Guards work in basements, construction sites, and remote locations with intermittent connectivity. Check-ins, patrol scans, and incident reports must never be lost. @capacitor-community/sqlite provides a local SQLite database on the device. Writes go to the local queue immediately (UI confirms instantly), then drain to the API on reconnect. Client-generated IDs + ON CONFLICT DO NOTHING make the drain idempotent."
          tradeoffs="No CRDTs needed — the data is single-device and append-only (a guard does not edit another guard's check-in). Conflict resolution is trivial. The main complexity is the drain scheduler: exponential backoff, reachability detection, and error categorisation (transient network vs permanent 4xx). Power loss between write and drain requires SQLite WAL mode (already the Capacitor SQLite default)."
        />

        {/* Scale summary */}
        <Card style={{ marginBottom: 16 }}>
          <CardHeader title="Scale Thresholds" />
          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['Users', 'Key Architecture Change'].map((h) => (
                    <th key={h} style={{
                      padding: '9px 22px', textAlign: 'left' as const,
                      color: 'var(--text-3)', fontSize: 11, fontWeight: 600,
                      textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['≤ 500', 'Docker Compose, Redis Pub/Sub SSE, PgBouncer, BullMQ, monthly guard_locations partitions'],
                  ['5k', 'Read replica for dashboards, 2–4 Fastify containers behind Traefik load balancer'],
                  ['50k', 'EMQX MQTT replaces HTTP location pings; TimescaleDB hypertable on guard_locations'],
                  ['100k', 'Kubernetes HPA, Citus horizontal sharding, PostgreSQL RLS, EMQX cluster'],
                ].map(([users, change]) => (
                  <tr key={users} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 22px', fontSize: 13.5, color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' as const }}>{users}</td>
                    <td style={{ padding: '11px 22px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Main>
    </PageShell>
  )
}
