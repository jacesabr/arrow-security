# Arrow Security — Implementation Roadmap

## Executive Summary

Arrow Security has a functionally complete operational foundation — live GPS map, QR patrol scanning, shift scheduling, check-in/check-out with geofence, incident reporting, and ESI/PF payroll — but is missing features that directly block sales and day-one supervisor usage. The research across 11 sources confirms the platform is architecturally ahead of anything in the open-source security space and is correctly built; the work is additive, not corrective. The highest-leverage engineering investments over the next six months are (1) closing the table-stakes gaps that lose demos and enabling supervisor site scoping from day one, (2) hardening the guard app's offline resilience and scheduling constraints, and (3) introducing auto-scheduling and client billing to justify a premium price point.

Three requirements are now classified as MVP-blocking because supervisors will use the system from day one: **supervisor site scoping** (a `supervisor_sites` join table with API middleware enforcement), a **"View As" role switcher** in the Operations Portal header (React context, no new JWT claims), and a **supervisor mode tab layout** in the mobile app (conditional `TabLayout` branching on JWT role). These must be in from the start — retrofitting site scoping after supervisors are live would require migrating live data and retraining users.

**Scale target: 500 concurrent users** (guards + supervisors + admins). Several architectural decisions below — particularly SSE fan-out, connection pooling, and password hashing — must be made at MVP scope, not deferred. These are not future concerns; they are go-live blockers at this user count.

---

## What's Already Built (from CLAUDE.md)

- Multi-tenant Fastify 4 REST API, Next.js 16 Operations Portal, Ionic/Capacitor guard PWA
- JWT auth with role hierarchy (`platform_admin → guard → client_viewer`)
- Sites, shifts, guards, clients, attendance records (GPS + method), patrols, checkpoints (QR), incidents with SLA deadlines, guard GPS pings every 30 s via SSE live map on MapLibre
- Payroll periods + records with ESI/PF in paise integers (correct Indian statutory rates)
- Docker Compose infra: Postgres, Redis (running, unused), MinIO (running, unused), Mailhog

---

## Scale Architecture: 500 Concurrent Users

The following issues are not theoretical. At 500 concurrent users they cause go-live failures and must be addressed before the first production deployment.

### Architecture Diagram

```
                ┌─────────────────────────────────────────┐
                │           Load Balancer / Nginx          │
                │         (horizontal scale ready)         │
                └────────────┬────────────────────────────┘
                             │
             ┌───────────────┼───────────────┐
             │               │               │
    ┌────────▼──────┐ ┌──────▼──────┐ ┌────▼──────────┐
    │  Fastify API  │ │ Fastify API │ │  Fastify API   │
    │   instance 1  │ │  instance 2 │ │   instance N   │
    │  (port 4000)  │ │             │ │                │
    └────────┬──────┘ └──────┬──────┘ └────┬──────────┘
             │               │              │
             └───────────────┼──────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
  ┌───────▼──────┐  ┌────────▼──────┐  ┌───────▼──────┐
  │   PgBouncer  │  │  Redis 7      │  │   OR-Tools   │
  │  pool_size=  │  │  Pub/Sub:     │  │   FastAPI    │
  │  100 (trans) │  │  sse:tenant:* │  │   sidecar    │
  └───────┬──────┘  └────────┬──────┘  │  (queued)    │
          │                  │         └───────────────┘
  ┌───────▼──────┐  SSE fan-out
  │  PostgreSQL  │  to all API instances
  │  16 (primary)│
  └──────────────┘
```

### Scale Issue 1 — SSE Live Location Fan-out (MUST FIX MVP)

**Problem:** `apps/api/src/routes/locations.ts` uses `Map<tenantId, Set<sendFn>>` in process memory. 500 supervisors watching the live map across multiple API instances means guard pings posted to instance 1 never reach supervisors connected to instance 2. Even on a single instance, an unhandled exception or OOM restart drops all 500 open connections simultaneously with no recovery.

**Solution:** Wire Redis Pub/Sub (the container is already running at port 6379). Publish guard pings to channel `sse:location:{tenantId}` from `POST /locations`. Each API instance subscribes to `sse:location:{tenantId}` when the first SSE client connects, and unsubscribes when the last one disconnects.

**Implementation (applies to `apps/api/src/routes/locations.ts`):**

```typescript
import { createClient } from 'redis'

// One publisher client (shared across all requests)
const publisher = createClient({ url: process.env.REDIS_URL })
await publisher.connect()

// Per-API-instance subscriber client (one connection, multiple channels)
const subscriber = publisher.duplicate()
await subscriber.connect()

// Track which tenantId channels this instance is subscribed to
const localClients = new Map<string, Set<(data: string) => void>>()

// POST /locations — after DB insert, publish to Redis
const channel = `sse:location:${payload.tenantId}`
await publisher.publish(channel, JSON.stringify({ ... event ... }))

// GET /locations/live — subscribe to Redis channel if not already
if (!localClients.has(tenantId)) {
  localClients.set(tenantId, new Set())
  await subscriber.subscribe(`sse:location:${tenantId}`, (message) => {
    localClients.get(tenantId)?.forEach((send) => send(message))
  })
}
localClients.get(tenantId)!.add(send)

request.raw.on('close', async () => {
  localClients.get(tenantId)?.delete(send)
  if (localClients.get(tenantId)?.size === 0) {
    localClients.delete(tenantId)
    await subscriber.unsubscribe(`sse:location:${tenantId}`)
  }
})
```

**Environment variable to add to `apps/api/.env`:**
```
REDIS_URL=redis://localhost:6379
```

**GPS write throughput:** 500 guards × 1 ping/30s = ~17 writes/second to `guard_locations`. PostgreSQL handles this comfortably. The concern is the broadcast side, which Redis Pub/Sub resolves.

### Scale Issue 2 — PostgreSQL Connection Pool (MUST FIX MVP)

**Problem:** `packages/db/src/client.ts` sets `max: 10`. At 500 concurrent users making API calls, 10 connections are exhausted within seconds. Fastify requests queue behind connection acquisition, latency spikes, and under sustained load the pool times out with connection errors.

**Solution:** Add PgBouncer in transaction-pooling mode (pool_size=100) between Fastify and Postgres. This multiplexes 500+ concurrent Fastify requests over ~100 actual Postgres connections, which is safe for PostgreSQL 16 on typical cloud VM sizes (2–4 vCPU).

**PgBouncer service in `docker-compose.yml`:**
```yaml
pgbouncer:
  image: bitnami/pgbouncer:latest
  restart: unless-stopped
  ports:
    - "5433:5432"
  environment:
    PGBOUNCER_DATABASE: secureops
    PGBOUNCER_AUTH_TYPE: scram-sha-256
    POSTGRESQL_HOST: postgres
    POSTGRESQL_PORT: 5432
    POSTGRESQL_USERNAME: secureops
    POSTGRESQL_PASSWORD: secureops
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: 500
    PGBOUNCER_DEFAULT_POOL_SIZE: 100
  depends_on:
    postgres:
      condition: service_healthy
```

**`packages/db/src/client.ts` update:** Change `DATABASE_URL` to point at PgBouncer (`localhost:5433` in dev) and raise the postgres.js pool to match:

```typescript
const queryClient = postgres(connectionString, {
  max: 25,           // per API instance; PgBouncer caps total at 100
  idle_timeout: 20,
  connect_timeout: 10,
})
```

**Caveat:** PgBouncer transaction pooling is incompatible with `SET LOCAL`, advisory locks, and `LISTEN/NOTIFY`. Arrow's codebase uses none of these — safe to use transaction pooling.

### Scale Issue 3 — Password Hashing (MUST FIX MVP)

**Problem:** `apps/api/src/routes/auth.ts` uses SHA-256 + `PASSWORD_SALT`. This is a known limitation noted in CLAUDE.md. At 500 concurrent users, the more serious concern is that SHA-256 is reversible via GPU rainbow tables. Argon2id is the current OWASP recommendation.

**Solution:** Migrate to `argon2` npm package (MIT license, uses native bindings).

```typescript
import argon2 from 'argon2'

// Hash on user creation / password update:
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB — OWASP minimum
  timeCost: 3,         // 3 iterations
  parallelism: 1,
})

// Verify on login:
const valid = await argon2.verify(user.passwordHash, body.password)
```

**Event loop safety:** `argon2.hash()` and `argon2.verify()` use `libuv` thread pool automatically (the native binding runs off-thread). No manual worker threads needed. With the settings above, each hash takes ~100–200ms on a 2-vCPU server — acceptable for login, which is not a hot path.

**Tuning for 500 concurrent logins:** With `memoryCost: 65536` and `timeCost: 3`, a single hash uses 64 MB of RAM and ~150ms CPU time. 500 simultaneous logins would momentarily consume 32 GB RAM if all ran in parallel — that can't happen in practice since logins are bursty not sustained, and the libuv thread pool (default size: 4) queues hash operations automatically. Set `UV_THREADPOOL_SIZE=8` in the API process environment to allow up to 8 concurrent hash operations without blocking the event loop.

**Migration path for existing users:** On first successful login with old hash, re-hash with Argon2id and update `passwordHash` in DB. Old `SHA256:` prefixed hashes verified first, then replaced.

### Scale Issue 4 — OR-Tools Scheduler Sidecar (Phase 3)

**Problem:** At 500 users there may be concurrent "generate schedule" requests. OR-Tools CP-SAT is single-threaded per solve job. Two concurrent solves for the same week block each other.

**Solution:** Add a simple Redis-backed job queue in the FastAPI sidecar. `POST /schedule/generate` enqueues a job and returns `{ jobId }` immediately. A background worker coroutine (`asyncio.create_task` or FastAPI `BackgroundTasks`) processes jobs one at a time (or with configurable concurrency). `GET /schedule/status/{jobId}` polls Redis for result.

```python
# services/scheduler/main.py (sketch)
import asyncio, redis.asyncio as aioredis
from fastapi import FastAPI, BackgroundTasks

app = FastAPI()
redis = aioredis.from_url(os.environ["REDIS_URL"])
solve_semaphore = asyncio.Semaphore(2)  # max 2 concurrent solves

@app.post("/schedule/generate")
async def generate(req: ScheduleRequest, background: BackgroundTasks):
    job_id = str(uuid4())
    await redis.set(f"job:{job_id}", json.dumps({"status": "pending"}), ex=3600)
    background.add_task(solve_job, job_id, req)
    return {"jobId": job_id}

async def solve_job(job_id: str, req: ScheduleRequest):
    async with solve_semaphore:
        await redis.set(f"job:{job_id}", json.dumps({"status": "running"}), ex=3600)
        result = await asyncio.to_thread(run_cp_sat, req)  # off event loop
        await redis.set(f"job:{job_id}", json.dumps({"status": "completed", "result": result}), ex=3600)

@app.get("/schedule/status/{job_id}")
async def status(job_id: str):
    raw = await redis.get(f"job:{job_id}")
    return json.loads(raw) if raw else {"status": "not_found"}
```

**Solver sizing:** At Arrow's scale (20–50 guards, 5 sites, 7-day horizon), CP-SAT solves in <10 seconds. With `Semaphore(2)`, up to 2 concurrent solves run, and additional requests queue in memory. For 500 users this is more than sufficient — schedule generation is a supervisory action, not a guard action, so concurrency is low.

### Scale Issue 5 — VROOM Route Optimization Sidecar (Phase 3)

Same pattern as OR-Tools. VROOM is single-threaded per solve. Add a Redis job queue with `asyncio.Semaphore(3)` in the VROOM FastAPI wrapper. Patrol route optimization is a low-frequency operation (at most a few times per day per site), so concurrency pressure is minimal at 500 users.

### Scale Issue 6 — PowerSync Deployment Sizing (Phase 3 Evaluation)

If PowerSync self-hosted is adopted for real-time schedule sync to guard devices, note that the open-source `powersync-service` Docker image supports up to 1,000 concurrent sync connections in self-hosted mode with 2 vCPU / 4 GB RAM. At 500 guards, this is within capacity on a single node. Size the host at minimum 4 vCPU / 8 GB RAM to leave headroom. PowerSync uses Postgres logical replication; ensure Postgres `max_wal_senders` is set to at least 10 in `postgresql.conf`.

### Scale Issue 7 — Push Notifications (Firebase Admin)

`firebase-admin` `sendEachForMulticast()` handles up to 500 FCM tokens per call. At 500 guards this is exactly one batch call per broadcast. No additional engineering needed — note this in the implementation so the batch size is not accidentally exceeded if the guard count grows.

---

## Phase 1: Revenue Blockers (Weeks 1–4)

These are the gaps that cause a demo to fail or a prospect to walk. Every item below is missing from Arrow Security today and present in every mature competitor (TrackTik, Belfry, Silvertrac). Source: research files 09, 10.

### 1.0 Supervisor Site Scoping + View As Toggle (MVP — Week 1)

Supervisors are assigned to specific sites and must only see data for those sites. This needs to be in place before any supervisor account is created in production. The three-part implementation is: a new join table in the database, an API middleware helper, and two UI features (portal header switcher + mobile tab variant).

#### 1.0.1 Database: `supervisor_sites` join table

Add to `packages/db/src/schema/sites.ts` (or a new `packages/db/src/schema/supervisor-sites.ts`):

```typescript
import { pgTable, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { sites } from './sites'

export const supervisorSites = pgTable(
  'supervisor_sites',
  {
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    supervisorId: text('supervisor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.supervisorId, t.siteId] }),
  })
)

export type SupervisorSite = typeof supervisorSites.$inferSelect
```

Export from `packages/db/src/schema/index.ts`. Apply via `pnpm push` from `packages/db/` or manual DDL:

```sql
CREATE TABLE supervisor_sites (
  tenant_id   text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supervisor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supervisor_id, site_id)
);
CREATE INDEX supervisor_sites_supervisor_idx ON supervisor_sites(supervisor_id);
CREATE INDEX supervisor_sites_site_idx ON supervisor_sites(site_id);
```

#### 1.0.2 API: `getSupervisorSiteIds` helper

Add to `apps/api/src/lib/auth.ts`:

```typescript
import { db, supervisorSites } from '@secureops/db'
import { eq } from 'drizzle-orm'

/**
 * Returns the site IDs a supervisor is allowed to see.
 * For tenant_admin / platform_admin, returns null (no scoping — see all sites).
 * For supervisor, returns their assigned site IDs.
 * Callers: if null, apply only the tenantId filter. If an array, also filter by siteId IN (...).
 */
export async function getSupervisorSiteIds(
  supervisorId: string,
  role: string,
): Promise<string[] | null> {
  if (role !== 'supervisor') return null
  const rows = await db
    .select({ siteId: supervisorSites.siteId })
    .from(supervisorSites)
    .where(eq(supervisorSites.supervisorId, supervisorId))
  return rows.map((r) => r.siteId)
}
```

**Apply in each affected route** by calling `getSupervisorSiteIds(payload.sub, payload.role)` after `requireAuth` and adding an `inArray(table.siteId, siteIds)` condition when the result is non-null:

| Route file | Tables to scope |
|---|---|
| `apps/api/src/routes/shifts.ts` | `shifts.siteId` |
| `apps/api/src/routes/incidents.ts` | `incidents.siteId` |
| `apps/api/src/routes/attendance.ts` | `attendanceRecords.siteId` |
| `apps/api/src/routes/patrol.ts` | `patrols.siteId` |
| `apps/api/src/routes/locations.ts` (history + live SSE) | `guardLocations` — scope via siteId on the shift |
| `apps/api/src/routes/sites.ts` `GET /` | `sites.id` |
| `apps/api/src/routes/users.ts` `GET /` (guards only) | join shifts → filter by siteId |

Pattern for any of these (e.g., shifts):

```typescript
import { inArray } from 'drizzle-orm'
import { getSupervisorSiteIds } from '../lib/auth'

fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
  const payload = request.user as { tenantId: string; sub: string; role: string }
  const allowedSites = await getSupervisorSiteIds(payload.sub, payload.role)

  const conditions = [eq(shifts.tenantId, payload.tenantId)]
  if (payload.role === 'guard') conditions.push(eq(shifts.guardId, payload.sub))
  if (allowedSites !== null) conditions.push(inArray(shifts.siteId, allowedSites))
  // ... rest of handler
})
```

**Important:** `allowedSites` can be an empty array if a supervisor has not yet been assigned to any site. `inArray(col, [])` generates `col IN ()` which is a SQL syntax error in most drivers — guard against it:

```typescript
if (allowedSites !== null) {
  if (allowedSites.length === 0) return reply.send({ data: [] }) // no sites assigned yet
  conditions.push(inArray(shifts.siteId, allowedSites))
}
```

**Management endpoints** — `POST /shifts`, `POST /incidents`, `POST /attendance` for supervisors acting on guards at their sites: validate that the `siteId` in the request body is in `allowedSites` before inserting:

```typescript
if (allowedSites !== null && !allowedSites.includes(body.siteId)) {
  return reply.code(403).send({ error: 'Forbidden', message: 'Site not in your assigned sites', statusCode: 403 })
}
```

**`PATCH /shifts/:id/status` — supervisor shift override** (new requirement): supervisors need to manually start/end guard shifts at their sites. Expand the `preHandler` on this route from `requireTenantAdmin` to `requireSupervisor`, then add site-scope validation inside the handler using `getSupervisorSiteIds`.

**Management endpoints for `supervisor_sites`** (admin-only, add to a new `apps/api/src/routes/supervisor-sites.ts`):

```
GET    /supervisor-sites?supervisorId=   — list site assignments for a supervisor
POST   /supervisor-sites                 — { supervisorId, siteId } — assign supervisor to site
DELETE /supervisor-sites/:supervisorId/:siteId — remove assignment
```

All three routes protected by `requireTenantAdmin`.

#### 1.0.3 Operations Portal: "View As" role switcher

**Why:** Tenant admins need to audit what their supervisors and guards see. This is a UI-layer client-side filter — the real API permissions are always enforced by the JWT. "View As" only changes which data the portal displays; it does not modify the user's JWT or actual role.

**Implementation:**

Create `apps/tenant/src/context/ViewAsContext.tsx`:

```typescript
'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

type ViewAsRole = 'owner' | 'supervisor' | 'guard'

interface ViewAsContextType {
  viewAs: ViewAsRole
  setViewAs: (role: ViewAsRole) => void
  effectiveSiteIds: string[] | null   // null = all sites; string[] = filtered to these
  setEffectiveSiteIds: (ids: string[] | null) => void
}

const ViewAsContext = createContext<ViewAsContextType>({
  viewAs: 'owner',
  setViewAs: () => {},
  effectiveSiteIds: null,
  setEffectiveSiteIds: () => {},
})

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [viewAs, setViewAs] = useState<ViewAsRole>('owner')
  const [effectiveSiteIds, setEffectiveSiteIds] = useState<string[] | null>(null)
  return (
    <ViewAsContext.Provider value={{ viewAs, setViewAs, effectiveSiteIds, setEffectiveSiteIds }}>
      {children}
    </ViewAsContext.Provider>
  )
}

export const useViewAs = () => useContext(ViewAsContext)
```

Wrap the portal layout in `apps/tenant/src/app/layout.tsx` (or the authenticated shell layout) with `<ViewAsProvider>`.

**Add the switcher to `apps/tenant/src/components/Sidebar.tsx`** — place it in the brand header section, visible only when the logged-in user's role is `tenant_admin` or higher. Read the user from `localStorage.getItem('td_user')`:

```tsx
import { useViewAs } from '../context/ViewAsContext'
import { Eye } from 'lucide-react'

// Inside the Sidebar component, after reading user from localStorage:
const { viewAs, setViewAs } = useViewAs()
const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin'

// Render in the brand section or as a pill below the logo:
{isAdmin && (
  <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
      <Eye size={11} /> Viewing as
    </div>
    <div style={{ display: 'flex', gap: 4 }}>
      {(['owner', 'supervisor', 'guard'] as const).map((role) => (
        <button
          key={role}
          onClick={() => setViewAs(role)}
          style={{
            padding: '3px 8px',
            borderRadius: 5,
            fontSize: 11,
            fontWeight: viewAs === role ? 600 : 400,
            background: viewAs === role ? 'var(--accent)' : 'var(--surface-3)',
            color: viewAs === role ? '#fff' : 'var(--text-2)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {role === 'owner' ? 'Owner' : role === 'supervisor' ? 'Supervisor' : 'Guard'}
        </button>
      ))}
    </div>
  </div>
)}
```

**Consuming `viewAs` in portal pages:** Pages that list guards, shifts, incidents, or patrols should read `effectiveSiteIds` from the context and filter their fetched data client-side when `viewAs !== 'owner'`. This is a display filter — not an API restriction — since the admin's JWT will return all data regardless:

```typescript
const { viewAs, effectiveSiteIds } = useViewAs()

// In the data fetch (e.g., incidents page):
useEffect(() => {
  tdApi.incidents.list().then(({ data }) => {
    const filtered = (viewAs === 'owner' || effectiveSiteIds === null)
      ? data
      : data.filter((inc) => effectiveSiteIds.includes(inc.siteId))
    setIncidents(filtered)
  })
}, [viewAs, effectiveSiteIds])
```

When `viewAs === 'supervisor'`, also show a site-picker dropdown in the header to let the admin choose which supervisor's site assignment to simulate. When `viewAs === 'guard'`, show only the currently selected guard's own records (read-only).

**What changes in the portal nav when viewAs changes:**
- `viewAs === 'supervisor'`: hide Payroll, Clients, Settings. Show Incidents, Shifts, Guards, Map filtered to assigned sites.
- `viewAs === 'guard'`: hide Payroll, Clients, Settings, Roster, Map. Show Shifts (own only), Incidents (own only).

#### 1.0.4 Mobile App: Supervisor Mode Tab Layout

Supervisors use the guard app (Ionic/Capacitor PWA) in the field. Their tab set must be different from a guard's tab set. The current `TabLayout` (`apps/mobile/src/components/TabLayout.tsx`) renders the same 6 tabs for every user.

**Approach:** Read `user.role` from the Zustand auth store (`useAuthStore`) and conditionally render a different tab bar and route set.

**New supervisor-specific pages to create:**
- `apps/mobile/src/pages/supervisor/SiteMapPage.tsx` — mini-map showing assigned-site guard locations (reads from `GET /locations/live` SSE filtered to assigned sites, rendered with a lightweight map such as Leaflet or MapLibre GL)
- `apps/mobile/src/pages/supervisor/SupervisorIncidentPage.tsx` — incident list for assigned sites; allows status update (`PATCH /:id/status`)
- `apps/mobile/src/pages/supervisor/LeaveApprovalsPage.tsx` — pending leave requests for guards at assigned sites; approve/reject via `PATCH /leave-requests/:id`
- `apps/mobile/src/pages/supervisor/ShiftOverridePage.tsx` — list active/scheduled shifts for assigned sites; supervisor can manually start/end a shift via `PATCH /shifts/:id/status`

**Updated `TabLayout.tsx`:**

```tsx
import { useAuthStore } from '../store/auth'

export const TabLayout: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const isSupervisor = user?.role === 'supervisor'

  return (
    <IonTabs>
      <IonRouterOutlet>
        {/* Shared routes */}
        <Route exact path="/tabs/dashboard" component={DashboardPage} />
        <Route exact path="/tabs/incidents" component={IncidentPage} />
        <Route exact path="/tabs/profile" component={ProfilePage} />

        {/* Guard-only routes */}
        {!isSupervisor && (
          <>
            <Route exact path="/tabs/checkin" component={CheckInPage} />
            <Route exact path="/tabs/patrol" component={PatrolPage} />
            <Route exact path="/tabs/shifts" component={ShiftsPage} />
          </>
        )}

        {/* Supervisor-only routes */}
        {isSupervisor && (
          <>
            <Route exact path="/tabs/sitemap" component={SiteMapPage} />
            <Route exact path="/tabs/leave-approvals" component={LeaveApprovalsPage} />
            <Route exact path="/tabs/shift-override" component={ShiftOverridePage} />
          </>
        )}

        <Route exact path="/tabs">
          <Redirect to="/tabs/dashboard" />
        </Route>
      </IonRouterOutlet>

      <IonTabBar slot="bottom">
        <IonTabButton tab="dashboard" href="/tabs/dashboard">
          <IonIcon icon={homeOutline} />
          <IonLabel>Home</IonLabel>
        </IonTabButton>

        {!isSupervisor ? (
          <>
            <IonTabButton tab="checkin" href="/tabs/checkin">
              <IonIcon icon={qrCodeOutline} />
              <IonLabel>Check In</IonLabel>
            </IonTabButton>
            <IonTabButton tab="patrol" href="/tabs/patrol">
              <IonIcon icon={walkOutline} />
              <IonLabel>Patrol</IonLabel>
            </IonTabButton>
          </>
        ) : (
          <>
            <IonTabButton tab="sitemap" href="/tabs/sitemap">
              <IonIcon icon={mapOutline} />
              <IonLabel>Site Map</IonLabel>
            </IonTabButton>
            <IonTabButton tab="shift-override" href="/tabs/shift-override">
              <IonIcon icon={calendarOutline} />
              <IonLabel>Shifts</IonLabel>
            </IonTabButton>
          </>
        )}

        <IonTabButton tab="incidents" href="/tabs/incidents">
          <IonIcon icon={warningOutline} />
          <IonLabel>Incidents</IonLabel>
        </IonTabButton>

        {isSupervisor && (
          <IonTabButton tab="leave-approvals" href="/tabs/leave-approvals">
            <IonIcon icon={checkmarkCircleOutline} />
            <IonLabel>Leave</IonLabel>
          </IonTabButton>
        )}

        {!isSupervisor && (
          <IonTabButton tab="shifts" href="/tabs/shifts">
            <IonIcon icon={calendarOutline} />
            <IonLabel>Shifts</IonLabel>
          </IonTabButton>
        )}

        <IonTabButton tab="profile" href="/tabs/profile">
          <IonIcon icon={personOutline} />
          <IonLabel>Profile</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  )
}
```

**Guard tab set (role=guard):** Home, Check In, Patrol, Incidents, Shifts, Profile.
**Supervisor tab set (role=supervisor):** Home, Site Map, Shifts (override), Incidents, Leave Approvals, Profile.

**Data access in supervisor mobile pages:** All API calls use the same `api` client in `apps/mobile/src/services/api.ts`. The supervisor's JWT already carries their `tenantId` and `role`. The API middleware (`getSupervisorSiteIds`) enforces site scoping server-side — the mobile pages do not need to know their assigned site IDs explicitly; the API returns pre-filtered data.

New API client methods needed in `apps/mobile/src/services/api.ts`:

```typescript
supervisorSites: {
  mySites: () => request<{ data: any[] }>('/supervisor-sites?supervisorId=me'),
},
leaveRequests: {
  pending: () => request<{ data: any[] }>('/leave-requests?status=pending'),
  approve: (id: string) =>
    request<{ data: any }>(`/leave-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }),
  deny: (id: string) =>
    request<{ data: any }>(`/leave-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'denied' }) }),
},
locations: {
  ...api.locations,
  live: () => `${BASE_URL}/locations/live`,   // for SSE in SiteMapPage
},
```

**Effort for 1.0:** ~4–5 days total (1 day schema + migration, 1.5 days API scoping across 6 route files, 1 day ViewAs context + Sidebar toggle, 1.5 days mobile supervisor pages + TabLayout).

---

### 1.01 Scale Hardening (Precondition — Week 1)

Before any feature work, resolve the three MVP scale blockers above. These take 2–3 days total:

1. **Redis Pub/Sub for SSE** (1 day): wire `ioredis` or `redis` npm package into `apps/api/src/routes/locations.ts`. Add `REDIS_URL` to `.env.example` and `docker-compose.yml` (Redis is already running).
2. **PgBouncer** (0.5 day): add PgBouncer service to `docker-compose.yml`. Update `DATABASE_URL` in API `.env.example` to point at port 5433. Update `packages/db/src/client.ts` pool size to 25.
3. **Argon2id password hashing** (1 day): swap `createHash('sha256')` in `apps/api/src/routes/auth.ts` for `argon2.hash/verify`. Write migration logic (prefix-based) so existing seeded users still work. Set `UV_THREADPOOL_SIZE=8` in process env.

### 1.1 Post Orders (3–4 days)
Every field guard platform has this. Guards receive digital standing orders per site before each shift. Without it, every demo shows a visible gap.

- **Schema**: add `post_orders` table (`id, tenantId, siteId, content text/html, version integer, updatedAt`). Add `post_order_acknowledgments` (`id, postOrderId, guardId, shiftId, acknowledgedAt`).
- **API**: `GET /sites/:id/post-orders` (latest version), `POST /post-orders` (admin creates/updates), `POST /post-orders/:id/acknowledge` (guard acknowledges).
- **Guard app**: show post order on shift start screen before check-in; guard must tap "Acknowledged" to proceed.
- **Portal**: post order editor per site; acknowledgment counter badge on roster.
- Effort: 3–4 days.

### 1.2 Incident Photo Upload via MinIO (2 days)
MinIO is running and idle. The `incidents` table exists. Photos are the most-requested feature in any field incident report.

- Wire `@aws-sdk/client-s3` in the Fastify API pointing at `http://minio:9000`.
- Add `POST /incidents/:id/photos` (multipart upload → MinIO → store S3 key in `incident_photos` table).
- Add photo thumbnail grid to `IncidentDetailPage.tsx` and the tenant incidents page.
- Effort: 2 days.

### 1.3 Shift Overlap Validation (0.5 day)
Arrow's `POST /shifts` currently creates duplicate assignments silently. Every competitor prevents this. Source: research file 07 (Frappe HR `shift_assignment.py`).

```typescript
// Add to apps/api/src/routes/shifts.ts before insert
const overlapping = await db.select().from(shifts)
  .where(and(eq(shifts.guardId, body.guardId), eq(shifts.tenantId, payload.tenantId),
             lte(shifts.startsAt, body.endsAt), gte(shifts.endsAt, body.startsAt)))
if (overlapping.length) return reply.code(409).send({ error: 'Shift overlaps existing assignment' })
```

### 1.4 Published Flag on Shifts (1 day)
Guards should only see published shifts. Supervisors build rosters in draft before notifying guards. Source: research file 01 (Staffjoy).

- Add `published boolean NOT NULL DEFAULT false` to `packages/db/src/schema/shifts.ts`.
- Add `POST /shifts/publish` accepting `{ siteId, weekStart, weekEnd }` — bulk-sets `published = true`.
- Guard app `GET /shifts` filter: always add `?published=true`.
- Operations Portal roster page: add "Publish Week" button.

### 1.5 Passdowns / Shift Handover Notes (1 day)
Simple text note left by outgoing guard for incoming guard per site. Silvertrac, GuardsPro, Novagems all have this. Source: research file 09.

- Schema: `passdowns` table (`id, tenantId, siteId, shiftId, guardId, content text, createdAt`).
- API: `POST /passdowns`, `GET /passdowns?siteId=&limit=5`.
- Guard app: show last 3 passdowns on the check-in screen for the site being clocked in to.

**Phase 1 total: ~14–17 engineering days (supervisor scoping 4–5 days + scale hardening 2–3 days + post orders 3–4 days + photos 2 days + shift validation 0.5 day + published flag 1 day + passdowns 1 day).**

---

## Phase 2: Operational Quality (Weeks 4–12)

### 2.1 Mobile Offline Resilience (1 week)
The single largest reliability gap. Guards work in basements and concrete structures; the app fails silently when offline. Source: research file 11.

- **Install** `@capacitor-community/sqlite@^6.0.0` in `apps/mobile`.
- **Create** `apps/mobile/src/services/db.ts` with `sync_queue` SQLite schema (persists on disk, not evicted).
- **Create** `apps/mobile/src/services/syncQueue.ts` with `enqueue()` / `drainQueue()` functions. Wire `@capacitor/network` listener so draining fires on reconnect.
- **Replace** direct `fetch()` calls in `CheckInPage.tsx`, `PatrolPage.tsx`, `IncidentNewPage.tsx` with `enqueue()`.
- **Server change**: modify `POST /attendance`, `POST /patrol/:id/scan`, `POST /incidents` to accept optional `id` field in body and use `INSERT ... ON CONFLICT (id) DO NOTHING` for idempotent retries.
- **GPS fallback**: `POST /locations` remains immediate; on failure buffer to SQLite. Add `POST /locations/batch` endpoint to the API.
- **No CRDTs or PouchDB** — the workload is single-device, append-only. LWW + client UUIDs is correct.
- Use Dexie (Apache-2.0) for read cache (sites, shifts, checkpoints); SQLite only for the write queue.

### 2.2 Guard Certification & License Tracking (2–3 days)
Blocks the eligibility engine and has India-specific PSARA regulatory relevance. Every mature competitor (TrackTik, Belfry, Novagems) has this. Source: research file 09.

- **Schema**: `guard_certifications` (`id, tenantId, guardId, certType text, certNumber text, issuedAt date, expiresAt date, documentKey text`).
- **API**: `GET /guards/:id/certifications`, `POST /guards/:id/certifications`, `PATCH /certifications/:id`.
- **Automated alerts**: a daily cron or scheduled job queries `WHERE expiresAt BETWEEN now AND now + 90 days` and sends email (via Mailhog in dev, real SMTP in prod) to supervisors.
- **Scheduling gate**: filter guard eligibility for shifts requiring a cert by checking non-expired certification.

### 2.3 Scheduling Constraints & Eligible Guard Endpoint (3 days)
Without constraint enforcement, the roster page creates illegal schedules. Source: research file 01 (Staffjoy `is_within_caps()`), research file 05 (OR-Tools CP-SAT).

- Add constraint fields to `users` table (or a `guard_settings` table): `maxHoursPerWeek integer DEFAULT 2880` (48h in minutes), `minRestMinutesBetweenShifts integer DEFAULT 660` (11h per Indian law), `maxConsecutiveDays integer DEFAULT 6`.
- Implement `GET /shifts/:id/eligible-guards`: load candidate guards for the site, run constraint checks (hours this week, rest gap from last shift, consecutive days, active certifications), return sorted by fewest hours assigned this week.
- This endpoint powers the roster drag-and-drop: when a supervisor clicks an empty shift cell, show ranked eligible guards.

### 2.4 Leave Requests with Auto-Unassign (2 days)
Guards need to request leave; approved leaves must remove conflicting shifts. Source: research file 01 (Staffjoy `time_off_requests`).

- **Schema**: `leave_requests` (`id, tenantId, guardId, startDate, endDate, leaveType enum('casual','sick','earned','comp_off'), status enum('pending','approved','denied'), approverUserId, minutesPaid`).
- **API**: `POST /guards/:id/leave-requests`, `PATCH /leave-requests/:id` (approval triggers auto-unassign: set `guardId = null` on shifts in the window).
- **Guard app**: "Request Leave" on Profile page.

### 2.5 Attendance Compliance Report (1 day)
Required for client reporting and payroll accuracy. Source: research file 01 (Staffjoy location attendance API).

- `GET /attendance/report?siteId=&from=&to=` — left join `shifts` with `attendance_records`. Returns: guard, scheduled start/end, actual clock-in/out, duration delta, no-show flag.
- CSV export endpoint.
- Add to Operations Portal reports section.

### 2.6 Exception Engine — Missed Punch Gate (2 days)
A missed check-out currently produces no enforcement. TimeTrex's Critical exception pattern is correct: block payroll for that shift until resolved. Source: research file 06.

- **Schema**: `shift_exceptions` (`id, tenantId, shiftId, code text, severity enum('low','medium','high','critical'), description text, resolved boolean DEFAULT false, resolvedBy, resolvedAt`).
- Exception codes to implement: `M1` (no out-punch), `S3` (late in), `S5` (early out), `O1` (exceeded scheduled hours).
- Payroll calculation route: before including a shift in a payroll period, check for unresolved critical exceptions.
- Operations Portal: exceptions badge on shift list; supervisor resolves via modal.

### 2.7 DAR Auto-Generation (2 days)
Daily Activity Reports are table stakes. Every competitor generates them. Source: research file 09.

- At shift checkout (or 30 minutes after scheduled shift end), compile: check-in time + GPS, patrol scans with timestamps, incidents logged, check-out time.
- Generate a structured JSON and render as PDF using `@react-pdf/renderer` or a simple HTML template.
- Store PDF in MinIO. Email to client contacts for the site. Surface in client portal (Phase 3).

**Phase 2 total: ~5–6 weeks.**

---

## Phase 3: Platform Expansion (Months 3–6)

### 3.1 Auto-Scheduling via OR-Tools CP-SAT (3–4 weeks)
Build a Python FastAPI microservice (`services/scheduler/`) with OR-Tools CP-SAT. Source: research files 03, 05.

- Decision variables: `work[guard, site, shift_type, day]` boolean grid. ~2,100 variables for 20 guards × 5 sites × 3 shifts × 7 days — trivial for CP-SAT.
- Hard constraints: availability, max 48h/week (Indian law), min 11h rest, no overlapping shifts, certification match.
- Soft constraints: fairness (minimize spread), guard shift preferences, preferred site proximity.
- Fastify: `POST /schedule/generate` → async job with Redis queue (see Scale Issue 4 above), returns `{ jobId }`. Guard app polls `GET /schedule/status/:jobId`.
- Supervisor reviews proposed schedule in draft before publishing. Solver output never writes to shifts without approval.
- Docker: `FROM python:3.12-slim`, `pip install ortools fastapi uvicorn pydantic redis`.
- **Concurrency:** `asyncio.Semaphore(2)` — max 2 concurrent solves, additional requests queue in Redis.

### 3.2 Client Portal (2–3 weeks)
The single biggest sales-unlocker after Phase 1. Source: research file 09.

- Dedicate `apps/tenant` pages (or a new `apps/client-portal` Next.js app) scoped by `client_viewer` role.
- Pages: their sites only, live guard map (filtered to client's sites), patrol history, incident list, DAR download.
- `client_viewer` JWT already in the role hierarchy — no auth changes needed.
- Per-client dashboard with SLA compliance metrics (% patrols completed, avg incident response time).

### 3.3 Client Billing Module + SolidInvoice Integration (2–3 weeks)
Transforms Arrow from an ops tool into a business management system. Source: research file 10.

- Add `bill_rates` table (`id, tenantId, siteId, clientId, ratePerHourPaise integer, effectiveFrom date`).
- On payroll period finalize: aggregate guard hours by site, multiply by bill rate → client invoice line items.
- Integrate SolidInvoice (MIT license) as an invoice generation sidecar: `POST /api/invoices` from Fastify, SolidInvoice generates PDF, emails client.
- No need to build PDF invoice engine or payment UI from scratch.

### 3.4 Recurring Shift Templates (2–3 days)
Eliminates the weekly repetitive work of re-creating the same shift patterns. Source: research file 01 (Staffjoy `recurring_shifts`), research file 06 (TimeTrex three-layer model).

- **Schema**: `schedule_templates` (`id, tenantId, siteId, name, startTime text, durationMinutes integer, daysOfWeek integer[]`). `schedule_assignments` (`id, tenantId, guardId, templateId, effectiveStart date, effectiveEnd date`).
- `POST /schedule-weeks/materialize` — generates actual `shifts` rows from templates for the given week.
- Operations Portal: template CRUD on the roster page; "Generate Week" button.

### 3.5 PowerSync Evaluation (Phase 3 Gate)
Needed only when >30 guards require real-time pushed schedule updates (currently guards poll). Self-hosted `powersync-service` supports up to 1,000 concurrent sync connections on 4 vCPU / 8 GB RAM. At 500 guards this is within single-node capacity with headroom. Requires Postgres logical replication (`max_wal_senders = 10` in `postgresql.conf`). Evaluate at the Phase 3 start gate.

---

## Architecture Decisions (Settled)

| Question | Decision | Rationale |
|---|---|---|
| Auto-scheduling solver | **OR-Tools CP-SAT (Python)** | Python microservice is native; no JVM; 2,100 variables solves in <30s; Apache 2.0. Timefold requires Java and adds operational burden without benefit at current scale (<50 guards). Source: files 04, 05. |
| Timefold | **Defer** | Revisit if scale exceeds 200 guards or constraint complexity demands multi-level scoring (Hard/Medium/Soft tiers). Source: file 05. |
| Full Chomp/Mobius decomposition | **Not yet** | Arrow's demand is contract-driven (stable slot counts), not variable-forecast. Phase 1 of Chomp is done manually by supervisors in the roster UI — no algorithmic demand inference needed now. Source: file 03. |
| Frappe HR integration | **Conditional** | Build ESI/PF calculation in-house (already done; rates are correct). Integrate Frappe only if compliance team needs automated PF ECR `.txt` and ESIC Excel files — ~10 days effort if needed. Source: file 07. |
| Odoo integration | **Rejected** | 5–10 weeks integration effort, requires Enterprise for Indian localization, heavy ERP footprint. The payroll math is 50–100 lines of TypeScript. Source: file 08. |
| Offline storage (mobile) | **SQLite write queue + Dexie read cache** | SQLite (`@capacitor-community/sqlite`) is not evicted by OS. Dexie (IndexedDB) is acceptable for read cache since data is refetchable. Source: file 11. |
| Conflict resolution | **Client UUIDs + `ON CONFLICT DO NOTHING`** | Single-device, append-only workload. CRDTs are engineering over-investment. Source: file 11. |
| PowerSync | **Phase 3 evaluation gate** | Needed only when >30 guards require real-time pushed schedule updates. Supports 500 users on 4 vCPU / 8 GB RAM node. Source: file 11. |
| Password hashing | **Argon2id (MVP scope)** | SHA-256 + salt is insufficient. Argon2id with memoryCost=65536, timeCost=3 via `argon2` npm package. Uses libuv thread pool — no event loop blocking. Set `UV_THREADPOOL_SIZE=8`. |
| SSE fan-out | **Redis Pub/Sub (MVP scope)** | In-memory `Map<tenantId, Set>` cannot span API instances and drops all connections on restart. Redis Pub/Sub on channel `sse:location:{tenantId}` is the correct pattern. Redis container already running. |
| PostgreSQL connection pool | **PgBouncer transaction mode, pool_size=100 (MVP scope)** | Default of 10 connections (current `packages/db/src/client.ts`) is exhausted at 500 concurrent users. PgBouncer transaction pooling multiplexes 500 Fastify connections over 100 Postgres connections. |
| Scheduler concurrency | **`asyncio.Semaphore(2)` + Redis job queue (Phase 3)** | OR-Tools CP-SAT is single-threaded per solve. Queue concurrent schedule generation requests rather than blocking. |
| GPS write throughput | **No additional work** | 500 guards × 1 ping/30s = ~17 writes/second. PostgreSQL 16 handles this trivially. Broadcast side resolved by Redis Pub/Sub (above). |
| Firebase push multicast | **Batch size ≤500 tokens per call** | `sendEachForMulticast()` max is 500 tokens — exactly matches the guard count. No architectural change needed; document the limit so it is not exceeded if guard count grows past 500. |
| Supervisor site scoping | **`supervisor_sites` join table + `getSupervisorSiteIds()` API helper (MVP scope)** | Supervisors are assigned to specific sites many-to-many. A shared helper function returns allowed site IDs (null for admins = no scoping). Every affected route calls this helper and adds `inArray(table.siteId, allowedSites)`. Must be in from day one — cannot be retrofitted after supervisors go live. |
| "View As" role switcher | **Client-side React context, no new JWT claims (MVP scope)** | Tenant admins need to audit supervisor/guard views. Implemented as `ViewAsContext` in the Operations Portal. API always enforces real JWT permissions — "View As" is purely a display filter in the portal. No security boundary changes required. |
| Mobile supervisor mode | **Conditional `TabLayout` branching on `user.role` (MVP scope)** | Supervisors use the mobile app for site-map monitoring, incident response, leave approvals, and shift overrides. Guards use it for check-in, patrol, and GPS tracking. `TabLayout.tsx` reads `user.role` from Zustand store and renders a different tab set and route set accordingly. |

---

## OSS Integration Candidates

| Tool | License | Value | Effort | When |
|---|---|---|---|---|
| **SolidInvoice** | MIT | Client invoice generation — avoids building PDF engine and payment tracking | Low–medium | Phase 3, client billing sprint |
| **Traccar** | Apache 2.0 | Hardware GPS device support (body cams, vehicle units, lone-worker panic trackers) | Medium | When hardware GPS is introduced; not needed now |
| **Frigate NVR** | MIT | Completes the `cameras` table stub — AI object detection from IP cameras, REST/WebSocket API | Medium | When client sites have IP cameras |

**Not recommended**: Resgrid (.NET, wrong stack, first-responder UX), TheHive/DFIR-IRIS (cyber-focused incident management, irrelevant to physical security), TimeTrex (AGPL, dead as FOSS, PHP, no India payroll), ShiftExec (generic PHP scheduling, no security features).

---

## What NOT to Build (and Why)

| Item | Decision | Reasoning |
|---|---|---|
| Full Chomp demand inference | Skip for now | Arrow's demand is fixed by client contracts. Chomp solves variable-demand forecasting — a problem we don't have. Build manually when needed. Source: file 03. |
| Odoo or Frappe as operations system | Never | Frappe's shift model cannot express site-scoped rotating guard rosters; Odoo is too heavy. Both are missing real-time GPS, patrols, checkpoint scanning, and incidents. Source: files 07, 08. |
| Full Frappe integration (payroll) | Only if needed | Calculate ESI/PF/PT in-house. Integrate Frappe only for ECR challan `.txt` file generation — and only if the compliance team asks. Source: file 07. |
| CRDTs / vector clocks for mobile sync | Reject | Single-device, append-only writes. Complexity cost is entirely unjustified. Source: file 11. |
| PouchDB / WatermelonDB / Realm | Reject | PouchDB needs CouchDB protocol; WatermelonDB is React Native JSI only; Realm sync requires MongoDB Atlas. None fit our stack. Source: file 11. |
| Monolithic Julia/JuMP autoscheduler | Reject | Staffjoy's autoscheduler is Julia 0.3 and unmaintained. Port the algorithm design to OR-Tools CP-SAT; do not run the Julia code. Source: file 02. |
| Gurobi (commercial solver) | Reject | OR-Tools CP-SAT matches Gurobi's performance at Arrow's scale (20–50 guards) and is free. Source: files 03, 05. |
| Visitor management | Defer | Not in scope. Evaluate T.C.E.D.I. or build a lightweight logbook only if client sites require a digital visitor register at reception. Source: file 10. |

---

## Schema Changes Needed (Consolidated)

All new tables follow the existing convention: `text` PK via `createId()`, `tenantId text NOT NULL`, amounts in paise integers. Exception: `supervisor_sites` uses a composite primary key (supervisorId, siteId) instead of a generated ID.

```typescript
// MVP — Supervisor Site Scoping (Phase 1, item 1.0)

supervisor_sites    -- composite PK (supervisor_id, site_id), no generated ID needed
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
  supervisor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE
  site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE
  assigned_at timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (supervisor_id, site_id)
  INDEX: supervisor_sites_supervisor_idx ON (supervisor_id)
  INDEX: supervisor_sites_site_idx ON (site_id)

// Phase 1 — Revenue Blockers

post_orders
  id, tenantId, siteId, title, content (text), version (integer), createdBy, createdAt, updatedAt

post_order_acknowledgments
  id, tenantId, postOrderId, guardId, shiftId, acknowledgedAt

passdowns
  id, tenantId, siteId, shiftId, guardId, content (text), createdAt

incident_photos
  id, tenantId, incidentId, storageKey (text), mimeType, sizeBytes, uploadedBy, createdAt

// shifts table — add column:
  published (boolean, NOT NULL DEFAULT false)

// Phase 2

guard_certifications
  id, tenantId, guardId, certType (text), certNumber (text), issuedAt (date), expiresAt (date), documentKey (text), createdAt

guard_settings (or add to users)
  guardId (PK/FK), tenantId, maxWeeklyMinutes (integer DEFAULT 2880), minRestMinutes (integer DEFAULT 660), maxConsecutiveDays (integer DEFAULT 6)

leave_requests
  id, tenantId, guardId, startDate, endDate, leaveType (enum: casual|sick|earned|comp_off), status (enum: pending|approved|denied), approverUserId, minutesPaid, notes, createdAt, updatedAt

shift_exceptions
  id, tenantId, shiftId, code (text), severity (enum: low|medium|high|critical), description, resolved (boolean DEFAULT false), resolvedBy, resolvedAt, createdAt

// guard_locations table — add constraint:
  UNIQUE (guard_id, recorded_at)   -- enables ON CONFLICT DO NOTHING for batch upload

// Phase 3

schedule_templates
  id, tenantId, siteId, name, startTime (text e.g. '22:00'), durationMinutes, daysOfWeek (integer[]), positionType (text)

schedule_assignments
  id, tenantId, guardId, templateId, effectiveStart (date), effectiveEnd (date, nullable)

bill_rates
  id, tenantId, siteId, clientId, ratePerHourPaise (integer), effectiveFrom (date), effectiveTo (date, nullable)

solver_jobs
  id, tenantId, externalJobId (text), status (enum: pending|running|completed|failed), weekStart (date), siteId, resultJson (jsonb), createdAt, completedAt
```

**Existing tables requiring column additions:**

- `shifts`: `published boolean`, `positionType text`, `description text`
- `users`: `maxWeeklyMinutes integer`, `minRestMinutes integer`, `maxConsecutiveDays integer` (or move to `guard_settings`)
- `sites`: `billRatePerHourPaise integer` (simple default; detailed rates in `bill_rates`)
- `attendance_records`: `clientId text UNIQUE` (for offline idempotent uploads)
- `patrol_scans`: `clientId text UNIQUE` (same)
- `incidents`: `clientId text UNIQUE` (same)

**New files (non-schema) required for supervisor scoping + View As:**

- `packages/db/src/schema/supervisor-sites.ts` — `supervisorSites` table definition (export from `schema/index.ts`)
- `apps/api/src/lib/auth.ts` — add `getSupervisorSiteIds(supervisorId, role)` helper
- `apps/api/src/routes/supervisor-sites.ts` — `GET /supervisor-sites`, `POST /supervisor-sites`, `DELETE /supervisor-sites/:supervisorId/:siteId`
- `apps/tenant/src/context/ViewAsContext.tsx` — `ViewAsProvider`, `useViewAs` hook
- `apps/mobile/src/pages/supervisor/SiteMapPage.tsx` — mini live-map for supervisor
- `apps/mobile/src/pages/supervisor/LeaveApprovalsPage.tsx` — leave request approvals
- `apps/mobile/src/pages/supervisor/ShiftOverridePage.tsx` — manual shift start/end
