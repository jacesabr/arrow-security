# 20 — Synthesis: Arrow Security Platform Architecture

All 19 investigations complete. This document is the authoritative build reference.

**Posture:** AUGMENT by default. REPLACE only where explicitly justified below.

---

## 1. Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        PORTAL["Operations Portal\nNext.js 16 · :3001"]
        MOBILE["Guard App\nIonic/Capacitor PWA · :5173"]
    end

    subgraph "API Layer (existing)"
        API["Fastify 4 API\n:4000\nfastify-jwt · Drizzle ORM"]
    end

    subgraph "New Sidecars (added, not replacing)"
        SOLVER["OR-Tools Solver\nPython FastAPI · :4001\nPOST /solve"]
        VROOM["VROOM + OSRM\nDocker REST · :3000/:5000\nPOST /route (V2)"]
        POWERSYNC["PowerSync Service\nDocker · :8080\nLogical replication (V2)"]
        ZITADEL["ZITADEL\nDocker · :8081\nOIDC/JWKS (Phase 2 auth)"]
    end

    subgraph "Data Layer (existing + extended)"
        PG["PostgreSQL 16\nPostGIS · pgcrypto\nWAL logical replication"]
        REDIS["Redis\n(running, Phase 1: blocklist)"]
        MINIO["MinIO\n(running, Phase 2: selfie uploads)"]
    end

    subgraph "External Services"
        FCM["Firebase FCM\napache-admin SDK"]
        WEBPUSH["Web Push\nVAPID · web-push npm"]
        TWILIO["Twilio SMS\npanic button only"]
        OTS["OpenTimestamps\nBitcoin anchoring · cron 4h"]
    end

    PORTAL -->|REST + SSE| API
    MOBILE -->|REST + 30s GPS| API
    MOBILE -->|WA-SQLite sync| POWERSYNC
    API -->|POST /solve| SOLVER
    API -->|POST /route (V2)| VROOM
    API -->|JWT verify / JWKS| ZITADEL
    API -->|blocklist check| REDIS
    API <-->|read/write| PG
    POWERSYNC -->|logical replication| PG
    API -->|firebase-admin| FCM
    API -->|web-push| WEBPUSH
    API -->|twilio panic| TWILIO
    API -->|OTS batch cron| OTS
    MINIO -. "Phase 2" .-> API

    style SOLVER fill:#d4edda,stroke:#28a745
    style VROOM fill:#d4edda,stroke:#28a745
    style POWERSYNC fill:#d4edda,stroke:#28a745
    style ZITADEL fill:#d4edda,stroke:#28a745
    style FCM fill:#cce5ff,stroke:#004085
    style WEBPUSH fill:#cce5ff,stroke:#004085
    style TWILIO fill:#cce5ff,stroke:#004085
    style OTS fill:#cce5ff,stroke:#004085
```

**Legend:** Green = new service/sidecar added. Blue = external SaaS. Existing boxes unchanged.

---

## 2. Final Tech Decisions

| # | Concern | Decision | Tag | Rationale |
|---|---------|----------|-----|-----------|
| a | Shift scheduling engine | **OR-Tools CP-SAT 9.15** Python FastAPI sidecar (`POST /solve`) | AUGMENT | Timefold blocked (JVM + Python 3.14 incompatible). OR-Tools confirmed working: 21 shifts → OPTIMAL in 52ms. No JVM, no compilation. Apache 2.0. |
| b | Password hashing | **Argon2id** via `@node-rs/argon2` (MIT) replacing SHA-256+salt | IMPROVE | SHA-256 is brute-force vulnerable (known weakness per CLAUDE.md). Zero-downtime migration: rehash on next login, detect by `$argon2id$` prefix. |
| c | Auth tokens + session management | **Refresh tokens table + Redis blocklist** Phase 1; **ZITADEL** Phase 2 | AUGMENT | Current: no refresh, no logout invalidation. Phase 1 adds `refresh_tokens` table + Redis TTL blocklist, keeps fastify-jwt in routes. Phase 2 adds ZITADEL OIDC (Apache 2.0, ~90MB, PostgreSQL-native), route handlers only change JWKS source URL. |
| d | Geofence detection | **PostGIS ST_DWithin** (exact circles) + Traccar set-diff algorithm | AUGMENT | PostGIS is already available. H3 polyfill = 84% geometric coverage — too lossy for entry/exit triggers. Port Traccar set-diff logic into `apps/api/src/routes/locations.ts`. |
| e | Heatmap / spatial aggregation | **h3-js** (Apache 2.0) for res-8 cell aggregation only | AUGMENT | Compute `h3_res8` column at write time in `POST /locations`. No PostGIS conflict — different use case. |
| f | Patrol route optimisation | **VROOM + OSRM** Docker sidecar (BSD-2-Clause) | AUGMENT | V2 only. 382ms median for 100-checkpoint VRPTW. pyvroom broken on Python 3.14 → use VROOM Docker REST API. Needs Geofabrik Southern India OSM (526MB, preprocess once). |
| g | Offline sync (Guard App) | **PowerSync** self-hosted (FSL, free) via `@powersync/web` | AUGMENT | V2. WA-SQLite in browser, identical API to `@powersync/capacitor`. PostgreSQL needs: `wal_level=logical`, replication role, `CREATE PUBLICATION powersync`. HS256→RS256 mismatch: use `token_auth` shared-secret mode or switch JWT signing to RS256. |
| h | Tamper-evident audit trail | **HMAC-chained `audit_log` table** + OpenTimestamps Bitcoin anchoring | AUGMENT | No new services for audit log itself. `REVOKE UPDATE, DELETE ON audit_log FROM secureops_app`. OTS cron (free, every 4h). P0 targets: attendance_records, patrol_scans, incidents, shift status changes. |
| i | Dynamic incident forms | **SurveyJS** `survey-core` + `survey-react-ui` (MIT runtime) | AUGMENT | Phase 1: hard-coded JSON template stored in `incident_form_templates`. Phase 2: Survey Creator drag-and-drop builder ($499/dev/yr commercial). Two new JSONB tables. |
| j | Push notifications | **firebase-admin** (Apache 2.0) FCM + **web-push** npm (MIT) VAPID + **Twilio** SMS panic-only | AUGMENT | `users.fcmToken` already in schema. `@capacitor/push-notifications` already installed. Web Push for portal (no mobile app install required). Twilio for India DLT SMS (2-4 week registration). |
| k | Background GPS (mobile) | **`@capacitor-community/background-geolocation`** (MIT) replacing setInterval | IMPROVE | Current setInterval stops when app is backgrounded. This is a functional gap. Plugin uses native background service on Android/iOS. Also add: `@capacitor-community/barcode-scanner` (MIT), `@capacitor-community/nfc` (MIT). Remove: `html5-qrcode`. |

---

## 3. Core Domain Schema Additions

All files go in `packages/db/src/schema/`. Export from `packages/db/src/schema/index.ts`.

```typescript
// packages/db/src/schema/refresh-tokens.ts
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const refreshTokens = pgTable("refresh_tokens", {
  id:         text("id").primaryKey().$defaultFn(createId),
  userId:     text("user_id").notNull(),
  tenantId:   text("tenant_id").notNull(),
  tokenHash:  text("token_hash").notNull().unique(), // SHA-256 of raw token
  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt:  timestamp("revoked_at", { withTimezone: true }),
  issuedAt:   timestamp("issued_at", { withTimezone: true }).defaultNow(),
  deviceInfo: text("device_info"),
});

// packages/db/src/schema/audit-log.ts
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const auditLog = pgTable("audit_log", {
  id:            text("id").primaryKey().$defaultFn(createId),
  tenantId:      text("tenant_id").notNull(),
  userId:        text("user_id"),               // null for system events
  action:        text("action").notNull(),       // e.g. "attendance.checkin"
  entityType:    text("entity_type").notNull(),  // "attendance_record"
  entityId:      text("entity_id").notNull(),
  payload:       jsonb("payload").notNull(),     // full row snapshot
  prevHash:      text("prev_hash").notNull(),    // hash of previous row
  thisHash:      text("this_hash").notNull(),    // HMAC-SHA256(secret, prevHash + JSON.stringify(payload))
  otsProof:      text("ots_proof"),              // base64 .ots file, filled by cron
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// NOTE: After migration, REVOKE UPDATE, DELETE ON audit_log FROM secureops_app;

// packages/db/src/schema/time-off-requests.ts
import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const timeOffStatusEnum = pgEnum("time_off_status", [
  "pending", "approved", "denied", "cancelled"
]);

export const timeOffRequests = pgTable("time_off_requests", {
  id:          text("id").primaryKey().$defaultFn(createId),
  tenantId:    text("tenant_id").notNull(),
  guardId:     text("guard_id").notNull(),
  startDate:   timestamp("start_date", { withTimezone: true }).notNull(),
  endDate:     timestamp("end_date", { withTimezone: true }).notNull(),
  reason:      text("reason"),
  status:      timeOffStatusEnum("status").default("pending").notNull(),
  reviewedBy:  text("reviewed_by"),
  reviewedAt:  timestamp("reviewed_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// packages/db/src/schema/recurring-shifts.ts
import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// Staffjoy pattern: template that materialises into concrete shifts
export const recurringShifts = pgTable("recurring_shifts", {
  id:            text("id").primaryKey().$defaultFn(createId),
  tenantId:      text("tenant_id").notNull(),
  siteId:        text("site_id").notNull(),
  guardId:       text("guard_id"),               // null = open/unassigned
  startTime:     text("start_time").notNull(),   // "08:00" HH:MM
  endTime:       text("end_time").notNull(),     // "16:00" HH:MM (may cross midnight)
  daysOfWeek:    jsonb("days_of_week").notNull(), // [0,1,2,3,4,5,6] (0=Sunday)
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// packages/db/src/schema/incident-form-templates.ts
import { pgTable, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const incidentFormTemplates = pgTable("incident_form_templates", {
  id:         text("id").primaryKey().$defaultFn(createId),
  tenantId:   text("tenant_id").notNull(),
  name:       text("name").notNull(),
  schema:     jsonb("schema").notNull(),         // SurveyJS JSON schema
  isDefault:  boolean("is_default").default(false),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// packages/db/src/schema/incident-form-responses.ts
import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const incidentFormResponses = pgTable("incident_form_responses", {
  id:           text("id").primaryKey().$defaultFn(createId),
  tenantId:     text("tenant_id").notNull(),
  incidentId:   text("incident_id").notNull(),
  templateId:   text("template_id").notNull(),
  responseData: jsonb("response_data").notNull(), // SurveyJS result object
  submittedBy:  text("submitted_by").notNull(),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// packages/db/src/schema/patrol-route-plans.ts  (V2)
import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const patrolRoutePlans = pgTable("patrol_route_plans", {
  id:              text("id").primaryKey().$defaultFn(createId),
  tenantId:        text("tenant_id").notNull(),
  siteId:          text("site_id").notNull(),
  name:            text("name").notNull(),
  vroomRequest:    jsonb("vroom_request").notNull(),   // raw VROOM JSON input
  vroomSolution:   jsonb("vroom_solution"),            // raw VROOM JSON output
  totalDurationSec: integer("total_duration_sec"),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// packages/db/src/schema/push-subscriptions.ts
import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const pushSubscriptions = pgTable("push_subscriptions", {
  id:           text("id").primaryKey().$defaultFn(createId),
  userId:       text("user_id").notNull(),
  tenantId:     text("tenant_id").notNull(),
  endpoint:     text("endpoint").notNull().unique(), // Web Push endpoint URL
  keys:         jsonb("keys").notNull(),             // { p256dh, auth }
  userAgent:    text("user_agent"),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

**Column additions to existing tables (ALTER TABLE via migration):**

```typescript
// Additions to guard_locations (packages/db/src/schema/guard-locations.ts)
// Add these columns:
h3Res8:       text("h3_res8"),           // H3 index at resolution 8
batteryLevel: integer("battery_level"),  // 0-100 from OwnTracks payload
altitude:     integer("altitude"),       // metres ASL
velocity:     integer("velocity"),       // km/h

// Additions to checkpoints (packages/db/src/schema/checkpoints.ts)
// Add these columns:
serviceDurationSeconds: integer("service_duration_seconds").default(60),
priority:     integer("priority").default(1), // 1=normal, 2=high (VROOM priority)
```

---

## 4. Porting List

Concrete algorithm ports: source repo → target file in our codebase.

| # | Algorithm | Source | Target File | Notes |
|---|-----------|--------|-------------|-------|
| 1 | Shift overlap detection (3-case OR query) | Staffjoy V1 `workers/manager.py` `checkForOverlap()` | `apps/api/src/routes/shifts.ts` — `POST /shifts` handler | Port as TypeScript Drizzle `or()` query before inserting new shift |
| 2 | Schedule 7-state machine (draft→published→unpublished) | Staffjoy V1 `workers/manager.py` schedule state transitions | `apps/api/src/routes/shifts.ts` — `PATCH /shifts/:id/status` | Adapt states to security context: draft/published/confirmed/started/completed/cancelled/no_show |
| 3 | Recurring shift materialisation | Staffjoy V1 recurring_shifts logic | `apps/api/src/lib/shifts.ts` (new file, AUGMENT) | Cron job: expand `recurring_shifts` → concrete `shifts` rows for next N days |
| 4 | Auto-attendance from check-in pairs | Frappe HR `hr/doctype/employee_checkin/employee_checkin.py` `calculate_working_hours()` | `apps/api/src/routes/attendance.ts` — `POST /attendance` handler | Pair IN→OUT events, compute duration, handle midnight crossover |
| 5 | Midnight-safe shift detection | Frappe HR `hr/utils.py` `get_shift_details()` | `apps/api/src/lib/shifts.ts` (new file, AUGMENT) | When shift end < shift start → add 24h; lookup attendance spans midnight |
| 6 | Indian PF/ESI payroll formulas | Frappe HR `hr/doctype/salary_slip/salary_slip.py` | `apps/api/src/routes/payroll.ts` — `POST /payroll/:id/calculate` | PF: 12%/12% cap ₹15k gross. ESI: 0.75%/3.25% cap ₹21k gross. Already in schema. Verify constants. |
| 7 | Geofence set-diff (ENTER/EXIT events) | Traccar `src/main/java/org/traccar/handler/GeofenceHandler.java` | `apps/api/src/routes/locations.ts` — `POST /locations` handler | oldSet from prev row for guard, newSet from ST_DWithin. Diff = events. |
| 8 | OwnTracks payload fields (battery, altitude, velocity) | OwnTracks Recorder `mqtt.c` `_payload` struct | `apps/mobile/src/services/api.ts` — `postLocation()` function | Extend location POST body; mobile reads from `@capacitor-community/background-geolocation` |
| 9 | H3 res-8 cell computation at write | H3 JS library `h3-js` | `apps/api/src/routes/locations.ts` — `POST /locations` handler | `h3.latLngToCell(lat, lng, 8)` → store in `guard_locations.h3_res8` |
| 10 | HMAC-chained audit log append | Sigstore/Rekor HMAC pattern (Inv 17) | `apps/api/src/lib/audit.ts` (new file, AUGMENT) | `appendAuditEntry(action, entityType, entityId, payload, userId)` → fetch lastHash from DB, compute HMAC, insert row |
| 11 | J3M chain-of-custody metadata for incident evidence | Guardian Project J3M spec (Inv 10) | `apps/api/src/routes/incidents.ts` — `POST /incidents` handler | Capture GPS coords + device fingerprint + file hash at incident creation; store in `incidents.metadata` JSONB |
| 12 | OR-Tools 2-phase scheduling (Week Model → Day Model) | Staffjoy autoscheduler `src/autoscheduler.jl` Week Model / Day Model (Inv 2) | `services/solver/main.py` (new Python FastAPI service, AUGMENT) | Phase 1: feasibility across week. Phase 2: assign specific shifts per day. Parallel 7 start-day variants. |
| 13 | TimeTrex exception-as-payroll-gate | TimeTrex `classes/modules/payroll/PayrollCalculate.class.php` (Inv 6) | `apps/api/src/routes/payroll.ts` — `POST /payroll/:id/calculate` | Query `attendance_records` for unresolved exceptions before finalising. Block `PATCH /payroll/:id/finalize` if critical exceptions exist. |

---

## 5. Component Adoption List

| Component | Version | License | Deployment | Integration Point | Phase |
|-----------|---------|---------|------------|-------------------|-------|
| OR-Tools CP-SAT | 9.15.6755 | Apache 2.0 | Python FastAPI sidecar `:4001` | Fastify `POST /api/shifts/solve` → internal `POST /solve` | MVP |
| `@node-rs/argon2` | latest | MIT | npm, in API | `apps/api/src/lib/auth.ts` replace `SHA-256` | MVP |
| `argon2` npm (fallback) | latest | MIT | npm, in API | Alternative if `@node-rs/argon2` unavailable | MVP |
| `h3-js` | latest | Apache 2.0 | npm, in API | `apps/api/src/routes/locations.ts` write path | MVP |
| PostGIS ST_DWithin | 3.x | GPL-2.0 (server-side only) | Already in Docker postgres image | SQL in `locations.ts` and `sites.ts` | MVP |
| `firebase-admin` | latest | Apache 2.0 | npm, in API | `apps/api/src/lib/notifications.ts` (new) | V1 |
| `web-push` | latest | MIT | npm, in API | `apps/api/src/lib/notifications.ts` | V1 |
| Twilio Node SDK | latest | MIT | npm, in API | `apps/api/src/lib/notifications.ts` — panic only | V1 |
| `survey-core` + `survey-react-ui` | latest | MIT | npm, in tenant + mobile | `apps/tenant/src/app/incidents/` forms | V1 |
| `opentimestamps` npm | latest | LGPL-3.0 | npm, in API (cron only) | `apps/api/src/lib/audit.ts` batch cron | V1 |
| `@capacitor-community/background-geolocation` | latest | MIT | npm, in mobile | `apps/mobile/src/pages/ShiftsPage.tsx` replace setInterval | MVP |
| `@capacitor-community/barcode-scanner` | latest | MIT | npm, in mobile | `apps/mobile/src/pages/PatrolPage.tsx` | MVP |
| VROOM + OSRM | latest | BSD-2-Clause | Docker sidecar (compose) | Fastify `POST /api/patrol/route` → internal VROOM REST | V2 |
| PowerSync self-hosted | latest | FSL (free self-host) | Docker sidecar (compose) | `apps/mobile/src/lib/powersync.ts` (new) + `@powersync/web` | V2 |
| ZITADEL | latest | Apache 2.0 | Docker sidecar (compose) | `apps/api/src/lib/auth.ts` JWKS source swap | V2 |
| SurveyJS Creator | latest | Commercial $499/dev/yr | npm, in tenant only | `apps/tenant/src/app/incident-forms/` builder page | V2 |

---

## 6. Ignore List

Items explicitly evaluated and rejected.

| Item | Reason |
|------|--------|
| **Timefold 1.24** | BLOCKED: requires JDK 17+ and Python 3.10–3.12. Machine has Python 3.14 which is incompatible. ~435MB image. Slower than Java. OR-Tools achieves same result. |
| **Traccar as primary tracking service** | Multi-tenancy gap: Traccar uses user hierarchy, not tenant-scoped row isolation. Our JWT tenant model cannot be mapped cleanly. Port the *algorithm* (geofence set-diff) only. |
| **WatermelonDB** | React Native only. Our Guard App is Ionic/Capacitor React (not RN). No web target. |
| **RxDB** (offline sync) | €1,300/yr for SQLite adapter (the one that works in Capacitor). FSL PowerSync with WA-SQLite is free and better for our PostgreSQL stack. |
| **ElectricSQL** | Read-path sync only as of investigation date. Cannot sync writes (check-ins, patrol scans) from mobile. |
| **Staffjoy Autoscheduler** (Julia/JuMP) | Unmaintainable Julia codebase. Requires Julia runtime. Port the *algorithm concepts* (2-phase decomposition) to OR-Tools CP-SAT Python instead. |
| **Chomp + Mobius** (Gurobi-dependent) | Gurobi = commercial solver with restrictive licensing. Conceptual 2-phase separation is valuable and ported to OR-Tools. Code cannot be directly used. |
| **TimeTrex CE** (direct use) | AGPL + officially discontinued Oct 2024. PHP + proprietary schema. Reference algorithm patterns only. |
| **Frappe HR** (direct use) | GPL-3.0 (copyleft infects our TypeScript codebase) + MariaDB-only (not PostgreSQL-native). Port algorithm patterns only. |
| **OpenHRMS / Odoo** | AGPL-3.0 + XML-RPC API only + MariaDB. No useful guard-specific patterns found. Skip entirely. |
| **ShiftExec** | Proprietary PHP/MySQL, $59/user. Too lightweight, no guard-specific features (no checkpoints, no patrol, no GPS). No source available. |
| **ntfy / Gotify** | Open-source push relays that proxy through Apple APNs. For panic button alerts, this introduces a privacy relay with no SLA. Twilio direct is required. |
| **`html5-qrcode`** | Already installed in Guard App but broken in Capacitor WebView. Replace with `@capacitor-community/barcode-scanner` which uses native camera APIs. |

---

## 7. Respect List

These things stay exactly as they are. Do not refactor them as part of feature work.

| Item | Why |
|------|-----|
| **Fastify 4 + TypeScript API on `:4000`** | Working, typed, performant. All new routes follow the same `FastifyPluginAsync` pattern described in CLAUDE.md. |
| **JWT payload shape `{ sub, tenantId, role }`** | Embedded in every route handler. Changing shape requires coordinated frontend + mobile + API deploy. ZITADEL (Phase 2) will issue tokens with this same shape via custom claims. |
| **Drizzle ORM query patterns** | `eq(table.tenantId, payload.tenantId)` tenant isolation on every query. Do not introduce raw SQL except for PostGIS spatial predicates (which cannot be expressed in Drizzle). |
| **`packages/db/` as sole schema source** | All table definitions live here. `packages/shared/` for TypeScript types only. This separation must be maintained. |
| **SSE fan-out via in-memory `Map<tenantId, Set<sendFn>>`** | Works correctly for single-server dev. The CLAUDE.md caveat (Redis Pub/Sub for multi-server) is already documented. Do not refactor until horizontal scaling is needed. |
| **`NEXT_PUBLIC_TENANT_SLUG` / `VITE_TENANT_SLUG` white-label mechanism** | Never expose to users. Login is email+password only. The slug is an env-var concern, not a UI concern. This must not change. |
| **Payroll amounts in paise (integer)** | All `payroll_records` amounts are stored in paise (1/100 rupee) as integers to avoid floating-point errors. New payroll calculations must follow this convention. |
| **`createId()` for all primary keys** | 12-byte base64url text IDs are used everywhere. Do not introduce serial/UUID PKs on new tables. |

---

## 8. Phased Build Plan

### MVP — Weeks 1–4 (Foundation Hardening)

**Goal:** Make the existing app production-safe and close the most critical functional gaps.

| Week | Deliverable | Key Files |
|------|------------|-----------|
| 1 | **Argon2id migration** — swap SHA-256 for Argon2id in login; detect prefix on read, rehash on next login. Add `refresh_tokens` table + `POST /auth/refresh` + `POST /auth/logout` (Redis TTL blocklist). | `apps/api/src/lib/auth.ts`, `apps/api/src/routes/auth.ts`, new migration |
| 1 | **Background geolocation fix** — replace `setInterval` GPS in ShiftsPage with `@capacitor-community/background-geolocation`. Extend POST body with `batteryLevel`, `altitude`, `velocity`. Store in new `guard_locations` columns. | `apps/mobile/src/pages/ShiftsPage.tsx`, `apps/mobile/src/services/api.ts` |
| 2 | **QR scanner swap** — replace `html5-qrcode` with `@capacitor-community/barcode-scanner` in PatrolPage and CheckInPage. | `apps/mobile/src/pages/PatrolPage.tsx`, `apps/mobile/src/pages/CheckInPage.tsx` |
| 2 | **Shift overlap detection** — port Staffjoy 3-case OR query into `POST /shifts`; return 409 on conflict. | `apps/api/src/routes/shifts.ts` |
| 3 | **Geofence set-diff + H3 write path** — implement Traccar set-diff on `POST /locations`; fire `geofence_event` (log to `audit_log`). Compute `h3_res8` at write time via `h3-js`. | `apps/api/src/routes/locations.ts` |
| 3 | **HMAC audit log** — create `audit_log` table, `apps/api/src/lib/audit.ts` helper. Wire into `attendance_records`, `patrol_scans`, `incidents` mutations. `REVOKE UPDATE, DELETE` DDL. | `packages/db/src/schema/audit-log.ts`, `apps/api/src/lib/audit.ts` |
| 4 | **OR-Tools solver sidecar** — scaffold Python FastAPI in `services/solver/`; implement 2-phase CP-SAT solve; add to `docker-compose.yml`; add `POST /api/shifts/solve` Fastify proxy route. | `services/solver/main.py`, `docker-compose.yml`, `apps/api/src/routes/shifts.ts` |
| 4 | **Midnight-safe shift detection + auto-attendance** — port Frappe HR checkin pair logic into `POST /attendance`; add `apps/api/src/lib/shifts.ts`. | `apps/api/src/lib/shifts.ts`, `apps/api/src/routes/attendance.ts` |

---

### V1 — Weeks 5–12 (Feature Complete)

**Goal:** Full guard operations workflow; push notifications; dynamic forms; payroll hardening.

| Week | Deliverable | Key Files |
|------|------------|-----------|
| 5–6 | **Recurring shifts** — `recurring_shifts` table + materialisation cron (expand N days ahead). Operations Portal UI for recurring templates. | `packages/db/src/schema/recurring-shifts.ts`, `apps/api/src/lib/shifts.ts`, `apps/tenant/src/app/roster/` |
| 5–6 | **Schedule state machine** — port Staffjoy 7 states into `PATCH /shifts/:id/status`; enforce valid transitions; emit audit log entries. | `apps/api/src/routes/shifts.ts` |
| 7 | **Time-off requests** — `time_off_requests` table, CRUD API, supervisor approval flow, block auto-scheduling when approved. Guard App `ProfilePage` + Operations Portal page. | `apps/api/src/routes/time-off.ts`, `apps/tenant/src/app/time-off/` |
| 7–8 | **Push notifications** — `firebase-admin` setup; `push_subscriptions` table; web-push VAPID keys; service worker in `apps/tenant`; `apps/mobile` FCM token capture; server-side `lib/notifications.ts`; triggers: incident created, shift assigned, panic button. | `apps/api/src/lib/notifications.ts`, `apps/mobile/src/App.tsx` |
| 8–9 | **Dynamic incident forms** — `incident_form_templates` + `incident_form_responses` tables; Phase 1 hard-coded default JSON template; `survey-react-ui` render in Guard App incident creation; PDF export in Operations Portal. | `apps/api/src/routes/incident-forms.ts`, `apps/mobile/src/pages/IncidentNewPage.tsx` |
| 9–10 | **Payroll hardening** — verify PF/ESI constants from Frappe HR investigation; implement TimeTrex exception-as-payroll-gate (block finalize if critical attendance exceptions unresolved); add unit tests. | `apps/api/src/routes/payroll.ts` |
| 10 | **OpenTimestamps cron** — batch unanchored `audit_log` rows every 4h; call OTS; store `.ots` proof in `otsProof` column. | `apps/api/src/lib/audit.ts` cron extension |
| 11–12 | **Operations Portal completions** — Heatmap page (H3 res-8 aggregation from `guard_locations.h3_res8`); Shift solve UI (trigger OR-Tools sidecar, display result); Incident form template viewer. | `apps/tenant/src/app/map/`, `apps/tenant/src/app/shifts/` |
| 11–12 | **Twilio SMS panic** — India DLT registration (start week 5, 2-4 week lead time). Wire Twilio into panic button endpoint. | `apps/api/src/lib/notifications.ts`, `apps/api/src/routes/panic.ts` |

---

### V2 — Weeks 13–20 (Scale + Advanced)

**Goal:** Multi-device offline, advanced routing, production auth, self-serve portal.

| Week | Deliverable | Key Files |
|------|------------|-----------|
| 13–14 | **PowerSync offline sync** — PostgreSQL WAL setup (`wal_level=logical`, replication role, `CREATE PUBLICATION powersync`); PowerSync Docker container in compose; `@powersync/web` in Guard App; sync rules JSON for per-guard bucket isolation; resolve HS256→RS256 JWT issue (switch to RS256 or use token_auth mode). | `docker-compose.yml`, `apps/mobile/src/lib/powersync.ts` |
| 14–15 | **VROOM + OSRM patrol routing** — download Geofabrik Southern India OSM; OSRM preprocessing container; VROOM Docker container; `POST /api/patrol/route` Fastify endpoint; `patrol_route_plans` table; Operations Portal route visualisation on MapLibre. | `docker-compose.yml`, `apps/api/src/routes/patrol.ts`, `apps/tenant/src/app/patrols/` |
| 15–16 | **ZITADEL auth migration** — deploy ZITADEL container; configure realm + application; migrate users (keep existing password hashes, reset on first ZITADEL login); update `apps/api/src/lib/auth.ts` to fetch JWKS from ZITADEL; add MFA (TOTP) for admins. | `apps/api/src/lib/auth.ts`, `docker-compose.yml` |
| 16–17 | **SurveyJS Creator** (if budget approved) — add `apps/tenant/src/app/incident-forms/builder/` page; commercial Survey Creator license; store schemas in `incident_form_templates`. | `apps/tenant/src/app/incident-forms/` |
| 17–18 | **NFC checkpoint scanning** — implement `@capacitor-community/nfc` in PatrolPage (field `nfcTagId` already in `checkpoints` schema). | `apps/mobile/src/pages/PatrolPage.tsx` |
| 18–19 | **MinIO selfie uploads** — wire MinIO client into `POST /attendance` (face check-in); store object key in `attendance_records.selfieUrl`; pre-signed URL for portal display. | `apps/api/src/routes/attendance.ts`, MinIO SDK |
| 19–20 | **Performance + hardening** — load test to 100k users / 10k concurrent. Add Redis Pub/Sub to SSE fan-out. Connection pooling (PgBouncer or `@neondatabase/serverless`). Rate limiting (`fastify-rate-limit`). | `apps/api/src/server.ts`, `docker-compose.yml` |

---

## 9. Open Questions

| # | Question | Best Current Answer |
|---|----------|---------------------|
| 1 | **PowerSync HS256 vs RS256** — do we switch the entire JWT stack to RS256 now, or use PowerSync `token_auth` shared-secret mode? | Start with `token_auth` shared-secret (zero-change to existing JWT). When ZITADEL is deployed in V2 week 15 it will issue RS256 naturally — migrate PowerSync config then. Do not switch JWT signing algorithm mid-V1. |
| 2 | **OR-Tools solver SLA** — what is the acceptable solve time before the Operations Portal shows a timeout? | OR-Tools solves 63-shift problems in 17ms and 1,000-shift problems in under 5 seconds (per investigation benchmarks). Set Fastify proxy timeout to 30 seconds. Add `POST /api/shifts/solve/async` for week-scale solves that exceed 5s, using Redis queue + SSE status stream. |
| 3 | **Twilio DLT registration timeline** — India requires TRAI DLT pre-registration for SMS (2-4 weeks). Does this block the panic button MVP? | Start DLT registration in Week 5 (V1 start). Panic button UI can be built and tested via FCM push in the interim. Twilio SMS is an *additional* delivery channel, not the only one. Do not block panic button on DLT. |
| 4 | **SurveyJS Creator license cost** — $499/developer/year. Is this approved for budget? | Phase 1 hard-coded JSON template (MIT `survey-core` only) covers 80% of use cases. Include Survey Creator in the V2 scope budget proposal. Decision required before Week 16. If not approved, the hard-coded template system remains — no technical debt incurred either way. |
| 5 | **OSRM map data region** — Southern India OSM zone is 526MB. If Arrow Security operates nationally or expands, this file grows. Storage on the Docker host? | For dev: bind-mount a local directory. For prod: put OSRM data on a persistent volume separate from the DB. Start with the Southern India extract. Add a note in `docker-compose.yml` pointing to the Geofabrik download URL. Re-run OSRM preprocessing whenever the extract is updated (recommend monthly). |
| 6 | **Audit log HMAC secret rotation** — the HMAC chain uses a server-side secret. What happens when that secret needs rotating? | Store the HMAC secret in `AUDIT_HMAC_SECRET` env var (separate from `JWT_SECRET`). Rotation breaks the chain verification from the rotation point onward. Document the rotation date in a `audit_log_meta` table row. Historical chain integrity is preserved up to the rotation timestamp. This is acceptable for compliance; OpenTimestamps anchoring provides time-proof regardless. |

---

*Synthesis complete. 19 investigations → 1 build reference document.*
*Date: 2026-05-17. Platform: Arrow Security guard operations.*
