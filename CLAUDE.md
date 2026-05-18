# CLAUDE.md

Guidance for Claude Code when working in this repository.

---

## What this is

**Arrow Security** — a security guard operations platform built for one company: Arrow Security. Guards use the Android app in the field; supervisors and admins use the web portal.

Three apps ship from this repo:

| App | Stack | Port |
|-----|-------|------|
| `apps/api` | Fastify 4 + Drizzle ORM | 4000 |
| `apps/tenant` | Next.js 15 (App Router) | 3001 |
| `apps/mobile` | Ionic 8 + Capacitor 6 + Vite | 5173 |

Shared packages: `packages/db` (schema + migrations, API only) · `packages/shared` (TypeScript types + constants, all apps).

---

## Technology stack — vertical flow

```
Infrastructure
  PostgreSQL 16       primary database (Docker locally, Render managed in prod)
  Redis               BullMQ queues + SSE Pub/Sub (Docker; not yet wired in prod)
  MinIO               S3-compatible object storage for selfies + incident photos
  Mailhog             dev email trap

      ↓

Database layer  (packages/db)
  Drizzle ORM         schema-as-code, SQL-first query builder
  drizzle-kit         migrations + Drizzle Studio UI
  postgres-js         low-level PostgreSQL driver
  createId()          12-byte base64url IDs for all primary keys

      ↓

API  (apps/api — Fastify 4)
  @fastify/jwt        RS256 JWT auth, 24h expiry
  @fastify/cors       locked to known origins via CORS_ORIGIN env
  @fastify/helmet     security headers
  @fastify/rate-limit 200 req/min per IP (in-memory; swap for Redis store before multi-container)
  @fastify/multipart  file uploads (incident photos, OTA bundles)
  zod                 inline request body validation on every route
  SSE                 live guard locations — in-process Map<tenantId, Set<sendFn>> (replace with Redis Pub/Sub before scaling)

      ↓

Operations Portal  (apps/tenant — Next.js 15 App Router)
  All pages: 'use client' + localStorage token guard
  State: React useState/useEffect only — no global store
  API calls: apps/tenant/src/lib/api.ts  (tdApi)
  Map: MapLibre GL + OSM raster tiles (no API key)
  Components: apps/tenant/src/components/ui.tsx  (Card, DataTable, Modal, Btn, Badge, etc.)
  CSS: CSS custom properties only — no Tailwind utility classes in component JSX

      ↓

Guard App  (apps/mobile — Ionic 8 + Capacitor 6)
  Framework: Ionic React + React Router v5
  State: Zustand (apps/mobile/src/store/auth.ts)
  API calls: apps/mobile/src/services/api.ts  (api)
  Maps: MapLibre GL (supervisor live map tab)
  Location: @capacitor-community/background-geolocation (fires every 50m during active shift)
  QR scanning: @capacitor-community/barcode-scanner
  OTA updates: @capgo/capacitor-updater v6 (self-hosted — see below)

      ↓

OTA update pipeline
  GitHub Actions builds dist/ → zips with files at root (cd dist && zip -r ../bundle.zip .)
  POST /api/app-update/publish?version=<8-char git SHA>  (protected by APP_UPDATE_TOKEN secret)
  Bundle stored as base64 text in app_releases table (isCurrent flag)
  On app launch: plugin POSTs to /api/app-update with version_name from device
  Server returns {} (no update) or { version, url } (update available)
  Plugin downloads silently; new bundle active on next app open

      ↓

Production (Render.com)
  API:    arrow-security-api.onrender.com     (auto-deploy on push to master)
  Portal: arrow-security-tenant.onrender.com  (auto-deploy on push to master)
  APK:    GitHub Actions artifact (14-day retention, download from Actions tab)
```

---

## Commands

```bash
# Install (from repo root)
pnpm install

# Dev — all apps simultaneously
pnpm dev

# Dev — individual
cd apps/api    && pnpm dev   # :4000
cd apps/tenant && pnpm dev   # :3001
cd apps/mobile && pnpm dev   # :5173

# Build
cd apps/mobile && pnpm build          # outputs to dist/
cd apps/tenant && pnpm build
cd apps/api    && pnpm build

# Database (run from packages/db/)
DATABASE_URL=... pnpm push      # push schema changes interactively
DATABASE_URL=... pnpm migrate   # run migration files
DATABASE_URL=... pnpm seed      # seed Arrow Security data (guards, sites, shifts)
DATABASE_URL=... pnpm studio    # Drizzle Studio at :4983

# Mobile native
cd apps/mobile && pnpm sync:android   # cap sync android
cd apps/mobile && pnpm open:android   # open Android Studio
```

Docker (local infra):
```bash
docker compose up -d          # all services
docker compose up -d postgres # just Postgres
```

| Container | Purpose | Port |
|-----------|---------|------|
| postgres | PostgreSQL 16 | 5432 |
| redis | Queues + SSE | 6379 |
| minio | Object storage | 9000 / 9001 |
| mailhog | Email trap | 8025 |

---

## Environment variables

**`apps/api/.env`**
```
DATABASE_URL=postgresql://secureops:secureops@localhost:5432/secureops
JWT_SECRET=<min 32 chars>
PASSWORD_SALT=<random string>
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:5173
APP_UPDATE_TOKEN=<random secret — must match GitHub Actions secret>
API_URL=https://arrow-security-api.onrender.com/api  # used to build OTA bundle download URL
```

**`apps/tenant/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_TENANT_SLUG=acme
```

**`apps/mobile/.env`**
```
VITE_API_URL=http://localhost:4000/api
VITE_TENANT_SLUG=acme
```

`TENANT_SLUG` is internal — never shown in any UI, form field, label, or error message.

---

## Authentication & roles

**Login:** `POST /api/auth/login` — body `{ email, password, tenantSlug }`. Slug is hardcoded in env, not collected from users.

**JWT payload:** `{ sub, tenantId, role, iat, exp }` — 24h, signed with `JWT_SECRET`.

**Role hierarchy:** `platform_admin > tenant_admin > supervisor > guard > client_viewer`

**Display names — never show raw DB enum strings in any UI:**
```typescript
const ROLE_DISPLAY = {
  tenant_admin: 'Admin',
  platform_admin: 'Admin',
  supervisor: 'Supervisor',
  guard: 'Guard',
  client_viewer: 'Client',
}
```

**Tenant isolation:** Every protected route filters DB queries with `eq(table.tenantId, payload.tenantId)`.

**Middleware:** `requireAuth` → `requireSupervisor` → `requireTenantAdmin` (each extends the previous).

**Password hashing:** SHA-256 + `PASSWORD_SALT`. Known limitation — not bcrypt.

---

## Database schema

All tables in `packages/db/src/schema/`. IDs: `text` PKs via `createId()` (12 random bytes, base64url).

| Table | Purpose |
|-------|---------|
| `tenants` | Arrow Security org record (one row) |
| `users` | Guards, supervisors, admins, clients |
| `clients` | Companies that Arrow Security protects |
| `sites` | Physical locations with lat/lng + geofence radius (metres) |
| `shifts` | Scheduled guard shifts — status: scheduled → active → completed / missed |
| `attendance_records` | Check-in/out events — GPS coords, method (face/QR/manual), selfie review status |
| `patrols` | Patrol sessions (started → completed) |
| `checkpoints` | Named scan points with QR code value + optional NFC tag ID |
| `patrol_scans` | Individual checkpoint scans within a patrol |
| `incidents` | Reported incidents — severity, SLA deadline, mediaUrls[], status lifecycle |
| `guard_locations` | GPS pings — posted every ~50m or 30s during active shifts |
| `payroll_periods` | Pay period definitions (draft → processing → finalized) |
| `payroll_records` | Per-guard calculations — gross, ESI employee/employer, PF employee/employer, net |
| `app_releases` | OTA bundles — base64 zip, version string, isCurrent flag |

Payroll amounts stored in **paise** (₹ × 100) as integers.

---

## API route map

All routes under `/api/`. Response shape: `{ data: T }` or `{ error, message, statusCode }`.

```
POST   /auth/login                          POST   /auth/logout (clears token client-side)
GET    /auth/me

GET    /sites          POST /sites          PATCH  /sites/:id
GET    /users          POST /users          PATCH  /users/:id
GET    /clients        POST /clients
GET    /shifts         POST /shifts         PATCH  /shifts/:id/status
GET    /attendance     POST /attendance     PATCH  /attendance/:id/review
GET    /patrol         POST /patrol/start
GET    /patrol/checkpoints  POST /patrol/checkpoints
POST   /patrol/:id/scan     PATCH /patrol/:id/complete
GET    /incidents      POST /incidents      PATCH  /incidents/:id/status
GET    /locations/history   POST  /locations
GET    /locations/live      (SSE stream — guard pings for this tenant)
GET    /guard-status        (supervisor view — active guards, selfie review, GPS status)
GET    /payroll              POST /payroll
GET    /payroll/:id          POST /payroll/:id/calculate
PATCH  /payroll/records/:id  POST /payroll/:id/finalize
POST   /upload/presign       GET  /upload/url
POST   /app-update           GET  /app-update/bundle    POST /app-update/publish
GET    /stats
GET    /health
```

---

## Design system

Both apps use the same warm off-white colour palette. **Never introduce new colours — use these tokens only.**

### Operations Portal (CSS custom properties)

```css
--background: #fafaf9   /* page background */
--surface:    #ffffff   /* cards, modals */
--surface-2:  #f4f2ef   /* inputs, hover states, nested surfaces */
--text:       #1a1916   /* primary text */
--text-2:     #5c5855   /* secondary text, labels */
--text-3:     #9a9490   /* muted text, placeholders, empty states */
--border:     #e8e5e0   /* all dividers and borders */
--accent:     #c96442   /* primary action colour (Arrow Security orange) */
--accent-dim: rgba(201,100,66,0.08)  /* accent background tints */
--green:      #10b981   /* success, online, check-in */
```

Typography: Inter, 15px base, `letter-spacing: -0.02em` on headings, `font-weight: 600` for headings.

Component library at `apps/tenant/src/components/ui.tsx`:
- `PageShell` + `Main` — layout wrapper (Sidebar + scrollable content area)
- `PageHeader` — title + subtitle + optional action button slot
- `Card` / `CardHeader` — white card with 1px border + subtle shadow
- `DataTable` / `TR` / `TD` — sortable table with loading + empty states
- `Badge` — inline colour chip (pass `label`, `color`, `bg`)
- `Btn` — button with `variant` (primary/secondary), `loading` spinner, `size`
- `Modal` — centred overlay with title, close button, width prop
- `Field` / `Input` / `Select` / `Textarea` — form primitives
- `FilterRow` / `FilterField` — horizontal filter bar
- `ErrorMsg` / `ModalActions` — form feedback + action row

**Style rule:** All JSX styling uses inline `style={{}}` with the CSS variables above. No Tailwind utility classes in component JSX — Tailwind is only present via the `@import "tailwindcss"` reset in globals.css.

### Guard App (Ionic + CSS variables)

Primary colour `#c96442` (Arrow orange) mapped to `--ion-color-primary`.
Backgrounds: `#fafaf9` (page), `#ffffff` (cards/toolbars).
All hardcoded colours in component JSX match the same palette — never use arbitrary hex values.

---

## Operations Portal pages

| Route | Who sees it | What it does |
|-------|-------------|--------------|
| `/login` | All | Email + password login |
| `/dashboard` | All | Stats — guards on shift, open incidents, patrols, sites |
| `/guards` | Admin | CRUD for users (guard + supervisor roles) |
| `/sites` | Admin | CRUD for sites with geofence radius |
| `/clients` | Admin | CRUD for client companies |
| `/shifts` | Admin | Create/filter shifts table |
| `/roster` | Admin | Weekly grid — guards as rows, days as columns, click cell to schedule |
| `/map` | All | Live MapLibre GL map — SSE guard pings + 8h patrol trail on click |
| `/incidents` | All | Incident list with severity/status filters + SLA breach highlighting |
| `/patrols` | All | Patrol history |
| `/guard-status` | All | Live guard table — selfie review, geofence, GPS online/offline |
| `/supervisors` | Admin | Supervisor list + site assignment modal |
| `/payroll` | Admin | Pay period management with ESI/PF calculation |
| `/settings` | All | Account info, integrations (coming soon), branding (coming soon) |

Auth guard: every page checks `localStorage.getItem('td_token')` in `useEffect` and redirects to `/login` if missing.

---

## Guard App pages

| Route | Role | What it does |
|-------|------|--------------|
| `/tabs/dashboard` | Guard | Today's shifts, open incidents, PANIC button |
| `/tabs/dashboard` | Supervisor | Live guard status summary + open incidents |
| `/tabs/dashboard` | Admin | Link to Operations Portal |
| `/tabs/checkin` | Guard | GPS + QR/manual check-in/out with geofence badge |
| `/tabs/patrol` | Guard | Start patrol → scan checkpoints (QR or manual) → complete |
| `/tabs/incidents` | All | View + create incidents (photo upload to MinIO) |
| `/tabs/shifts` | Guard | Scheduled shifts grouped by date; starts background GPS when shift is active |
| `/tabs/map` | Supervisor/Admin | Live MapLibre GL map — same SSE feed as portal |
| `/tabs/leave` | Guard | Submit leave requests |
| `/tabs/leave` | Supervisor/Admin | Approve / reject leave requests |
| `/tabs/profile` | All | Name, email, phone, face enrolment status, sign out |

Tab bar and routes are role-gated in `apps/mobile/src/components/TabLayout.tsx`.
`DevAccountBar` (quick account switcher) only renders when `import.meta.env.DEV === true`.

---

## Key patterns

**Adding an API route:**
1. `apps/api/src/routes/yourroute.ts` — export `yourRoutes: FastifyPluginAsync`
2. Every handler: `preHandler: requireAuth` (or `requireSupervisor` / `requireTenantAdmin`)
3. Validate body with Zod inline — never trust `request.body` without parsing
4. All DB queries: `eq(table.tenantId, payload.tenantId)` — no exceptions
5. Register in `apps/api/src/server.ts`

**Adding a DB table:**
1. `packages/db/src/schema/yourtable.ts` — `text` PK with `.$defaultFn(createId)`
2. Export from `packages/db/src/schema/index.ts`
3. Write migration SQL in `packages/db/src/migrations/XXXX_name.sql`
4. Apply: `docker exec securityapp-postgres-1 psql -U secureops -d secureops -f /path/migration.sql`

**Adding an Operations Portal page:**
1. `apps/tenant/src/app/yourpage/page.tsx` — `'use client'` at top
2. Token guard in `useEffect` → `router.replace('/login')`
3. Add to `NAV` array in `apps/tenant/src/components/Sidebar.tsx` (set `adminOnly: true` if needed)
4. Add API method to `apps/tenant/src/lib/api.ts`
5. Use `PageShell` + `Main` + `PageHeader` + `Card` from `ui.tsx`

**Adding a Guard App page:**
1. Create page in `apps/mobile/src/pages/`
2. Add `<R>` route in the appropriate role block in `TabLayout.tsx`
3. Add `<IonTabButton>` to the corresponding tab bar
4. Use Ionic components; style with inline CSS using the palette constants

---

## Scale architecture

Current deployment handles ~500 users. Target ceiling: 100,000. Every feature must respect these rules:

**Hard rules — enforce today:**
- All DB queries include `WHERE tenant_id = ?` — no cross-tenant data leakage ever
- JWT-only auth — no server-side sessions
- Zod validation on every API input boundary

**Must fix before multi-container:**
- SSE fan-out: replace in-process `Map<tenantId, Set<sendFn>>` with Redis Pub/Sub
- Rate limit store: swap in-memory store for Redis store in `@fastify/rate-limit`
- Add PgBouncer in transaction mode between API and PostgreSQL

**Scale thresholds:**

| Users | Change |
|-------|--------|
| ≤ 500 | Current: single Render instance, in-process SSE, no queue |
| 500 → 5k | Redis Pub/Sub SSE · PgBouncer · BullMQ for payroll/PDF · monthly `guard_locations` partitions |
| 5k → 50k | Postgres read replica for dashboards · 2–4 Fastify containers behind Traefik |
| 50k → 100k | EMQX MQTT replaces HTTP location pings · TimescaleDB on guard_locations |
| 100k+ | Kubernetes HPA · Citus sharding · PostgreSQL RLS · EMQX cluster |

`guard_locations` must be partitioned by `created_at` (monthly) before Phase 1 ships. Keep schema TimescaleDB-compatible (no TimescaleDB-specific types yet).

---

## Known stubs / not yet built

| Feature | Status |
|---------|--------|
| NFC checkpoint scanning | Schema field (`nfcTagId`) exists; mobile not implemented |
| Face recognition check-in | UI shows "coming soon"; no backend |
| Push notifications (FCM) | `fcmToken` column exists on users; sending not wired |
| MinIO photo storage | Container running; presign endpoint exists; OTA bundles use PostgreSQL text instead |
| SMS / email alerts | Mailhog running in dev; no dispatch logic |
| Shift swap requests | No schema or API |
| Redis Pub/Sub SSE | In-process Map used today; must migrate before multi-container |
| PgBouncer | Not in docker-compose; add before production scale |
| guard_locations partitioning | Not yet partitioned; required before Phase 1 |
| Panic button response flow | Guard can trigger; no supervisor notification or dispatch |
