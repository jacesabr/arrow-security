# Mobile Offline-First Architecture — Research Notes

**Date:** 2026-05-17
**Stack:** Ionic 8 + Capacitor 6 + React 18 + TypeScript + Fastify 4 REST API + PostgreSQL (Drizzle)
**Context:** Arrow Security guard app. Guards work in basements, underground car parks, rural perimeter sites, and concrete structures where 4G drops out entirely. Every data-entry action (check-in, patrol scan, incident, GPS ping) currently fails silently or shows an error when offline.

---

## Recommended Storage Layer for Ionic/Capacitor

### Decision: SQLite via `@capacitor-community/sqlite`

This is the correct choice for the Arrow Security guard app. Full reasoning below.

**Why not IndexedDB (the browser default)?**
Ionic/Capacitor runs inside a WKWebView (iOS) or a Chrome WebView (Android). IndexedDB works in both, but the OS can evict it under storage pressure without warning — iOS aggressively clears WebView storage when device is low on space. For a security app where losing an unsynced patrol scan or incident report could have legal consequences, this is unacceptable. SQLite on disk is persistent storage; the OS does not evict it under pressure.

**Why not `@ionic/storage` / localForage?**
`@ionic/storage` is a key-value store that wraps IndexedDB or SQLite depending on what's available. It works but the abstraction adds overhead and the SQLite driver it uses (`cordova-sqlite-storage`) is Cordova-era, not maintained for Capacitor 6. For simple preference storage (auth token, last-known state) it's fine. For a transactional sync queue with retry logic, use raw SQLite.

**Why not PouchDB / CouchDB sync?**
PouchDB is designed for the CouchDB sync protocol — a protocol the Arrow Security API does not implement and never will (it's a standard REST API). Adopting PouchDB means either:
1. Running a CouchDB instance alongside PostgreSQL and writing sync logic between them — enormous operational overhead.
2. Using PouchDB in standalone mode (no CouchDB sync) — at which point you're just using a document store on IndexedDB, with all the eviction risk of plain IndexedDB.
Cross it off the list unless we were building on CouchDB from day one.

**Why not WatermelonDB?**
WatermelonDB is React Native-first. It uses the React Native JSI bridge and native SQLite bindings that do not exist in a Capacitor WebView environment. There is no official or community-maintained Capacitor adapter. Confirmed incompatible.

**Why not Realm (MongoDB Atlas Device SDK)?**
Realm's Capacitor support is via a web SDK that uses IndexedDB — same eviction problem as above. The native Realm SDK is for React Native only. Additionally, Realm's sync protocol requires Atlas App Services (paid MongoDB cloud product). Does not fit our self-hosted Fastify + PostgreSQL architecture.

**Why not Dexie.js?**
Dexie is an excellent IndexedDB wrapper with a clean API and TypeScript support. It has `Dexie.Cloud` for sync (subscription required). For read-heavy data (displaying shifts, sites, checkpoints from a local cache), Dexie is a good fit and simpler to set up than SQLite. For the write queue (actions that must survive to the server), the IndexedDB eviction risk is still a problem. Recommendation: use Dexie for local read cache, SQLite for the write queue. See the implementation plan below for how these two co-exist.

**`@capacitor-community/sqlite` — specifics**

- License: MIT
- Capacitor 6 support: yes, `@capacitor-community/sqlite@^6.0.0`
- Storage location: native SQLite file in the app's private Documents directory (not WebView storage). Not evicted under storage pressure. Survives app updates.
- Web/PWA fallback: uses `sql.js` (SQLite compiled to WebAssembly) with localStorage persistence. Acceptable for dev; production is native.
- Encryption: optional AES-256 encryption of the database file (pass `secret` parameter). Useful for GDPR compliance — if a device is seized, the DB is unreadable without the app's secret.

```typescript
// apps/mobile/src/services/db.ts
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

const sqlite = new SQLiteConnection(CapacitorSQLite)
let _db: any = null

export async function getDb() {
  if (_db) return _db
  const conn = await sqlite.createConnection('arrow_guard', false, 'no-encryption', 1, false)
  await conn.open()
  await conn.execute(SCHEMA)
  _db = conn
  return _db
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    local_id    TEXT NOT NULL UNIQUE,   -- client-generated UUID for idempotency
    endpoint    TEXT NOT NULL,
    method      TEXT NOT NULL,          -- POST | PATCH
    body        TEXT NOT NULL,          -- JSON string
    entity_type TEXT NOT NULL,          -- 'attendance' | 'patrol_scan' | 'incident' | 'location'
    created_at  INTEGER NOT NULL,       -- Unix ms, from device clock
    attempts    INTEGER DEFAULT 0,
    last_error  TEXT,
    synced_at   INTEGER                 -- NULL until successfully uploaded
  );

  CREATE TABLE IF NOT EXISTS local_cache (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,               -- JSON string
    ttl   INTEGER                      -- Unix ms expiry; NULL = never expire
  );
`
```

---

## Sync Strategy Options

### Option A: Optimistic Write-Through with Offline Queue (Recommended for Phase 1)

**How it works:**
1. When the guard submits a check-in, patrol scan, or incident, the action is immediately written to the local `sync_queue` SQLite table and treated as "done" in the UI (optimistic).
2. The sync service attempts to flush the queue immediately after each write (if online). If the API call succeeds, the row is deleted from the queue. If offline or the call fails, the row stays with `attempts` incremented.
3. `@capacitor/network` fires a `networkStatusChange` event when connectivity returns. This triggers a full queue drain.
4. The UI shows a small indicator when there are pending unsynced items.

**Why this is right for Arrow Security:**
- Guards have a single device. No two devices ever generate the same action (a guard cannot check in twice simultaneously from different phones). Conflict probability is near zero.
- All guard actions are append-only writes (new rows in attendance, patrol_scans, incidents, guard_locations). There is no UPDATE or DELETE from the mobile side.
- The Fastify API already uses `createId()` (base64url 12-byte random IDs). If we generate the ID client-side and include it in the POST body, the server can use it directly. This makes uploads idempotent — if a guard uploads the same check-in twice (network timeout on first attempt, retry on second), the server can detect the duplicate by `id` and return the existing record.

**Implementation sketch:**

```typescript
// apps/mobile/src/services/syncQueue.ts
import { Network } from '@capacitor/network'
import { getDb } from './db'
import { useAuthStore } from '../store/auth'
import { nanoid } from 'nanoid' // or crypto.randomUUID()

const BASE_URL = import.meta.env.VITE_API_URL

// Called instead of direct fetch() for all write operations
export async function enqueue(
  endpoint: string,
  method: 'POST' | 'PATCH',
  body: object,
  entityType: string
): Promise<string> {
  const localId = crypto.randomUUID()
  const db = await getDb()
  await db.run(
    `INSERT INTO sync_queue (local_id, endpoint, method, body, entity_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [localId, endpoint, method, JSON.stringify({ ...body, id: localId }), entityType, Date.now()]
  )
  // Fire-and-forget drain attempt
  drainQueue().catch(() => null)
  return localId
}

export async function drainQueue(): Promise<void> {
  const status = await Network.getStatus()
  if (!status.connected) return

  const db = await getDb()
  const { values: rows } = await db.query(
    `SELECT * FROM sync_queue WHERE synced_at IS NULL AND attempts < 10
     ORDER BY created_at ASC LIMIT 50`
  )
  if (!rows?.length) return

  const token = useAuthStore.getState().token
  for (const row of rows) {
    try {
      const res = await fetch(`${BASE_URL}${row.endpoint}`, {
        method: row.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: row.body,
      })
      if (res.ok || res.status === 409) {
        // 409 = conflict (already uploaded) — still consider it synced
        await db.run(
          `UPDATE sync_queue SET synced_at = ? WHERE id = ?`,
          [Date.now(), row.id]
        )
      } else {
        const errText = await res.text().catch(() => `HTTP ${res.status}`)
        await db.run(
          `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
          [errText, row.id]
        )
      }
    } catch (e: any) {
      await db.run(
        `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
        [e.message ?? 'Network error', row.id]
      )
    }
  }

  // Purge successfully synced rows older than 7 days to keep DB small
  await db.run(
    `DELETE FROM sync_queue WHERE synced_at IS NOT NULL AND synced_at < ?`,
    [Date.now() - 7 * 24 * 60 * 60 * 1000]
  )
}

// Wire this up once at app startup
export function startNetworkListener() {
  Network.addListener('networkStatusChange', (status) => {
    if (status.connected) drainQueue().catch(() => null)
  })
}
```

**Integration into existing API calls:**

The current `api.attendance.checkIn()` calls `fetch()` directly. Replace with:

```typescript
// Before (fails offline):
await api.attendance.checkIn({ siteId, type, method, latitude, longitude })

// After (works offline):
import { enqueue } from '../services/syncQueue'
await enqueue('/attendance', 'POST', { siteId, type, method, latitude, longitude, verifiedAt: new Date().toISOString() }, 'attendance')
```

The guard sees immediate success feedback. The record will reach the server when connectivity returns.

---

### Option B: PowerSync (Bidirectional Sync — Phase 2 Evaluation)

PowerSync is a sync middleware layer that sits between PostgreSQL and device-side SQLite. It subscribes to PostgreSQL changes (via logical replication) and streams them to each connected device over a persistent WebSocket. Guards get server-pushed data (new shift assignments, updated site info, checkpoint list changes) without polling.

**Architecture:**
```
PostgreSQL → PowerSync Service (self-hosted Docker) → WebSocket → Device SQLite
Device SQLite → PowerSync upload queue → Fastify API → PostgreSQL
```

PowerSync does not replace the Fastify API for writes. Guards still POST new data through the API. PowerSync handles the read-side sync (downloading data from server to device) and provides the local SQLite database for the app to query.

**Capacitor package:** `@powersync/capacitor` (official, Apache-2.0)
**Self-hosted PowerSync Service:** Docker image, Apache-2.0 license, free to run.
**PowerSync Cloud:** Free tier is 3 users. Production pricing is per-connection/month (check powersync.com for current rates).

**When to evaluate PowerSync (trigger conditions):**
- Guard app needs real-time push of schedule changes without the guard manually refreshing.
- Fleet size exceeds 30 guards and shift updates happen frequently during the shift.
- The SQLite sync queue approach starts generating support tickets because guards report stale data.

**PowerSync is not needed in phase 1.** The Arrow Security guard app is write-heavy (guards generating events) not read-heavy-realtime (guards receiving live updates during a shift). Shift data is loaded on app open; it does not change mid-shift.

---

### Option C: Service Worker Background Sync API (Web-only fallback)

The Web Background Sync API (`SyncManager`) allows a service worker to defer a fetch until the device has connectivity, even if the browser tab is closed. This is the standard PWA offline sync mechanism.

**Why it does not replace SQLite queue for this app:**
- Background Sync is not available in WKWebView (iOS) at all. Apple's WKWebView does not support service workers in the same way Chrome does.
- On Android, Capacitor's WebView is Chromium-based and does support service workers, but Capacitor apps do not register a service worker by default — they serve from `capacitor://localhost`, a custom scheme. Service workers on custom schemes have inconsistent support across Chromium versions.
- Background Sync has a `maxAge` limit (typically 24 hours) after which the browser discards unsynced requests. For a guard who works a weekend with poor signal, this is a data-loss risk.
- Background Sync cannot carry the JWT token after it expires (token expires in 24 hours per CLAUDE.md). A guard who goes offline for >24 hours will have an expired token when the sync fires.

**Verdict:** Do not use service worker Background Sync as the primary offline mechanism. It is acceptable as an additional retry layer on top of the SQLite queue for web/PWA deployments only.

---

## Conflict Resolution Approach

### Conflict scenarios for this app

The guard app has extremely low conflict risk because:
1. Guards use exactly one device. No multi-device editing.
2. All writes from the guard are new records (insert), not edits to existing records.
3. The supervisor portal (tenant app) creates and modifies records guards only read (shifts, site assignments, checkpoints).

The one realistic conflict scenario is: a supervisor manually overrides a guard's check-in or check-out timestamp in the Operations Portal while the guard also has an offline check-in queued. When the guard's offline check-in reaches the server, there may be two attendance records for the same guard/site/time window.

### Strategy: Last-Write-Wins on the SERVER with client-generated IDs

This is sufficient for Arrow Security phase 1.

**Implementation:**
- The mobile app generates a `clientId` (UUID) for every new record before it enters the sync queue. This `clientId` is sent to the API as the record's `id`.
- The Fastify API's `POST /attendance`, `POST /patrol/scan`, and `POST /incidents` endpoints attempt `INSERT ... ON CONFLICT (id) DO NOTHING`. If the same `clientId` arrives twice (from retry), the second insert is a no-op. The API returns the existing record with 200.
- There is no true "conflict" between guard and supervisor — they create separate records. Duplicate detection is purely about retry deduplication.

**Schema change needed:**

The `createId()` function in `packages/db/src/lib/id.ts` generates IDs server-side. To support client-generated IDs, the API must accept an optional `id` field in the POST body and use it if provided:

```typescript
// In routes/attendance.ts (example)
const body = attendanceSchema.parse(request.body)
const id = body.id ?? createId()   // use client ID if provided
await db.insert(attendanceRecords).values({ id, ...rest })
  .onConflictDoNothing()
```

**Why not vector clocks or CRDTs?**

Vector clocks and CRDTs are appropriate when:
- Multiple users edit the same document (Google Docs, collaborative note-taking)
- The same record can be modified from multiple devices
- The system is distributed across nodes that can diverge

None of these apply to Arrow Security:
- Guard records are created by one guard on one device (no shared editing)
- Supervisors edit records only in the browser portal — not offline — so their changes are always synchronous
- The data model is primarily time-series events, not mutable documents

The complexity cost of CRDTs (implementing LWW-register or Grow-Only Set logic, tracking causal histories, writing merge functions for each entity type) is entirely unjustified for this use case. Last-write-wins with client IDs for idempotency is the correct decision.

### If conflict detection becomes necessary in future

Should Arrow Security eventually allow guards to edit incidents or acknowledge shift changes from the mobile app, add an `updatedAt` timestamp and `version` integer to the relevant tables. Implement optimistic concurrency:

```typescript
// API handler: only update if version matches
const result = await db.update(incidents)
  .set({ status: newStatus, version: sql`version + 1`, updatedAt: new Date() })
  .where(and(
    eq(incidents.id, id),
    eq(incidents.version, body.expectedVersion)   // from client
  ))
  .returning()

if (result.length === 0) {
  return reply.code(409).send({ error: 'Conflict', message: 'Record modified by another user', statusCode: 409 })
}
```

This is optimistic concurrency control — simple, battle-tested, no CRDT complexity.

---

## Background Sync for GPS Location

### Current state (broken)

`ShiftsPage.tsx` uses:
```typescript
intervalRef.current = setInterval(() => postLocation(activeShiftRef.current?.id), 30_000)
```

This interval is destroyed when the guard switches apps or their screen locks. Location tracking stops. The supervisor's live map goes dark. This is documented in `research/11-mobile-stack.md`.

### Buffered Location Queue

Rather than posting each GPS ping immediately (which fails silently when offline), buffer them in SQLite and flush in batches. This is more resilient and reduces API call volume by combining multiple pings into one request.

**Why batch upload:**
- Location pings are the highest-volume data type. 30-second intervals over an 8-hour shift = 960 pings per guard per shift.
- If the guard has 10 minutes of no signal, that's 20 pings buffered. Uploading them one-by-one on reconnect is 20 sequential API calls. Uploading in one batch is one call.
- The `guard_locations` table schema already accepts a `recordedAt` field — the server stores the device timestamp, not the upload timestamp. Batch upload is transparent.

**Add a batch location endpoint to the API:**

```typescript
// apps/api/src/routes/locations.ts — add batch endpoint
fastify.post('/batch', { preHandler: requireAuth }, async (request, reply) => {
  const payload = request.user as { tenantId: string; sub: string }
  const body = z.object({
    pings: z.array(pingSchema).max(200),
  }).parse(request.body)

  const rows = await db
    .insert(guardLocations)
    .values(body.pings.map((p) => ({
      tenantId: payload.tenantId,
      guardId: payload.sub,
      shiftId: p.shiftId ?? null,
      latitude: p.latitude,
      longitude: p.longitude,
      accuracy: p.accuracy ?? null,
      heading: p.heading ?? null,
      speed: p.speed ?? null,
      recordedAt: p.recordedAt ? new Date(p.recordedAt) : new Date(),
    })))
    .onConflictDoNothing()   // guard against duplicate upload
    .returning()

  // Broadcast most recent ping to SSE clients
  const latest = rows.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0]
  if (latest) {
    const tenantClients = sseClients.get(payload.tenantId)
    if (tenantClients?.size) {
      const event = JSON.stringify({ type: 'location', guardId: payload.sub,
        lat: latest.latitude, lng: latest.longitude, ts: latest.recordedAt })
      tenantClients.forEach((send) => send(event))
    }
  }

  return reply.code(201).send({ data: { inserted: rows.length } })
})
```

**Mobile: GPS buffer service**

```typescript
// apps/mobile/src/services/locationBuffer.ts
import { getDb } from './db'
import { Network } from '@capacitor/network'
import { useAuthStore } from '../store/auth'

const BASE_URL = import.meta.env.VITE_API_URL

// Store a GPS ping locally (called from background watcher callback)
export async function bufferLocation(ping: {
  latitude: number; longitude: number; accuracy?: number
  heading?: number; speed?: number; shiftId?: string
}): Promise<void> {
  const db = await getDb()
  await db.run(
    `INSERT INTO sync_queue (local_id, endpoint, method, body, entity_type, created_at)
     VALUES (?, '/locations/batch-item', 'POST', ?, 'location', ?)`,
    [crypto.randomUUID(), JSON.stringify({ ...ping, recordedAt: new Date().toISOString() }), Date.now()]
  )
}

// Upload buffered location pings in one batch
export async function flushLocationBuffer(): Promise<void> {
  const status = await Network.getStatus()
  if (!status.connected) return

  const db = await getDb()
  const { values: rows } = await db.query(
    `SELECT * FROM sync_queue
     WHERE entity_type = 'location' AND synced_at IS NULL
     ORDER BY created_at ASC LIMIT 200`
  )
  if (!rows?.length) return

  const pings = rows.map((r: any) => JSON.parse(r.body))
  const token = useAuthStore.getState().token

  try {
    const res = await fetch(`${BASE_URL}/locations/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pings }),
    })
    if (res.ok) {
      const ids = rows.map((r: any) => r.id)
      // Mark all as synced in one query
      await db.run(
        `UPDATE sync_queue SET synced_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
        [Date.now(), ...ids]
      )
    }
  } catch {
    // Will retry on next flush
  }
}
```

**Flush triggers:**
1. Network reconnect (via `@capacitor/network` listener)
2. Whenever the app returns to foreground (`App.addListener('appStateChange', ...)`)
3. Every 5 minutes while online (as a belt-and-suspenders fallback)

**Deduplication at the server:**
To prevent duplicate pings on retry, add a `UNIQUE` constraint on `(guard_id, recorded_at)` in `guard_locations`. Use `ON CONFLICT DO NOTHING` on insert. Two pings at the exact millisecond for the same guard are physically impossible; this catches only re-uploads.

```sql
ALTER TABLE guard_locations
  ADD CONSTRAINT guard_locations_guard_recorded_uniq UNIQUE (guard_id, recorded_at);
```

### Flush frequency vs. live map freshness

The batch flush strategy trades live map freshness for resilience. With a 5-minute flush interval when online, the supervisor's map may lag up to 5 minutes. Recommendations:

- For the live map use case, keep posting individual pings immediately when online (current pattern). Only fall back to batch queue when the individual post fails.
- The location buffer (`bufferLocation`) is only the offline fallback path, not the primary path.

Updated flow:
```
Background watcher fires
  → Try immediate POST /locations (existing endpoint)
    → If success: done, ping shows on live map in <1s
    → If failure (offline): bufferLocation() into sync_queue
  → On reconnect: flushLocationBuffer() drains buffered pings to POST /locations/batch
```

This preserves live map responsiveness when online and provides full data integrity when offline.

---

## Implementation Plan for Arrow Security Guard App

### Phase 1 — Offline resilience for critical actions (1 week)

**Goal:** No data loss when connectivity drops. Guard can complete check-in, patrol scan, and incident report with no network; data reaches server when signal returns.

**Step 1 — Add SQLite dependency and schema (0.5 day)**

```bash
cd apps/mobile
pnpm add @capacitor-community/sqlite@^6.0.0
pnpm cap sync android
```

Create `apps/mobile/src/services/db.ts` with the `sync_queue` and `local_cache` schema shown above. Initialize on app startup in `App.tsx`.

**Step 2 — Create sync queue service (1 day)**

Create `apps/mobile/src/services/syncQueue.ts` with `enqueue()` and `drainQueue()` functions shown above. Wire `startNetworkListener()` in `App.tsx` so draining starts when connectivity returns.

**Step 3 — Wrap check-in, patrol scan, and incident creation (1 day)**

In each relevant page, replace direct `api.*` calls with `enqueue()`:

- `CheckInPage.tsx` — wrap `api.attendance.checkIn()` call
- `PatrolPage.tsx` — wrap `api.patrol.scan()` and `api.patrol.complete()` calls
- `IncidentNewPage.tsx` — wrap `api.incidents.create()` call

Add offline UI feedback: a persistent toast or header badge showing "X actions pending sync" when `sync_queue` has unsynced rows.

**Step 4 — Client-generated IDs for idempotency (0.5 day)**

Generate UUIDs client-side before enqueuing. Update Fastify handlers for `/attendance`, `/patrol/scan`, and `/incidents` to accept an optional `id` field and use `ON CONFLICT (id) DO NOTHING` on insert.

**Step 5 — GPS buffer path (0.5 day)**

In the background location watcher callback (from `11-mobile-stack.md` research — `@capacitor-community/background-geolocation`), wrap the `api.locations.track()` call: try immediate POST, on failure call `bufferLocation()`. Add `flushLocationBuffer()` to the network reconnect listener. Add `/locations/batch` endpoint to the API.

**Step 6 — Pending sync indicator (0.5 day)**

Create a `usePendingSync` hook that queries `SELECT COUNT(*) FROM sync_queue WHERE synced_at IS NULL`. Display count in the tab bar or a sticky header when > 0. Show a green "All synced" flash when the count drops to 0.

### Phase 2 — Local read cache (1–2 weeks, later)

**Goal:** Guard app works with zero network on first use of a shift (sites, checkpoints, and shift data loaded before going on patrol).

Use Dexie.js for the local read cache — it is simpler to use than SQLite for structured reads and has good TypeScript support. Data that needs caching:
- `sites` — list of sites the guard is assigned to
- `checkpoints` — per-site checkpoint list with QR codes
- `shifts` — guard's upcoming shifts for the next 7 days

TTL: refresh whenever the guard is online, fall back to cached data when offline. Maximum staleness: 24 hours.

```typescript
// apps/mobile/src/services/cache.ts
import Dexie from 'dexie'

export const localDb = new Dexie('ArrowGuardCache')
localDb.version(1).stores({
  kv: 'key',   // generic key-value for TTL-based cache
})

export async function cacheSet(key: string, value: unknown, ttlMs = 24 * 60 * 60 * 1000) {
  await localDb.table('kv').put({ key, value, expiresAt: Date.now() + ttlMs })
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const row = await localDb.table('kv').get(key)
  if (!row) return null
  if (row.expiresAt && row.expiresAt < Date.now()) {
    await localDb.table('kv').delete(key)
    return null
  }
  return row.value as T
}
```

Update `CheckInPage.tsx` and `PatrolPage.tsx` to call `cacheGet('sites')` on mount before falling back to `api.sites.list()`. On successful API fetch, call `cacheSet('sites', res.data)`.

### Phase 3 — PowerSync evaluation (future, conditional)

Trigger: if Arrow Security grows to >30 active guards per shift and supervisors need real-time schedule changes pushed to guard devices without the guard manually refreshing.

At that point, evaluate `@powersync/capacitor` with self-hosted PowerSync Service (Docker). The SQLite sync queue from Phase 1 remains as the write path; PowerSync takes over the read path.

---

## Libraries Recommended (with license check)

| Library | Purpose | License | Version | Notes |
|---|---|---|---|---|
| `@capacitor-community/sqlite` | Persistent local SQLite storage | MIT | ^6.0.0 | Primary write queue and offline store |
| `@capacitor/network` | Online/offline detection | MIT | ^6.0.0 | Already installed — wire listener |
| `dexie` | IndexedDB wrapper for read cache | Apache-2.0 | ^4.0.0 | Read-only local cache (sites, shifts, checkpoints) |
| `@powersync/capacitor` | Full bidirectional sync (Phase 2) | Apache-2.0 | ^1.x | Self-hosted service also Apache-2.0 |

**Already installed and relevant:**
- `@capacitor/network` — `^6.0.0`, MIT — already in `package.json`, needs to be wired up
- `@capacitor/filesystem` — `^6.0.0`, MIT — already installed, not needed for this feature but available for photo/evidence caching

**Do NOT use:**
- PouchDB — Apache-2.0, but designed for CouchDB sync protocol. Mismatch with our REST API.
- WatermelonDB — MIT, but React Native JSI bridge only. Confirmed incompatible with Capacitor WebView.
- Realm / Atlas Device SDK — Apache-2.0 client but sync requires Atlas App Services (MongoDB paid cloud).
- `@ionic/storage` — MIT, but wraps IndexedDB which is eviction-vulnerable. OK for auth token storage only.
- Service Worker Background Sync — Web standard, no library needed, but not supported in WKWebView and subject to 24h max-age expiry.

**License summary:** All recommended libraries are MIT or Apache-2.0. No GPL, no LGPL, no commercial licenses required for phase 1.

---

## Key Decisions Summary

1. **Storage layer:** SQLite via `@capacitor-community/sqlite` for the write queue (persistent, not evicted). Dexie/IndexedDB for the read cache (eviction acceptable — data is refetchable).

2. **Sync strategy:** Optimistic enqueue-on-write with drain-on-reconnect. Not PouchDB, not RxDB, not WatermelonDB. Custom queue is ~200 lines and fits the append-only, single-device data model exactly.

3. **Conflict resolution:** Client-generated UUIDs + server-side `ON CONFLICT DO NOTHING`. No CRDTs, no vector clocks — they are engineering over-investment for a single-device, append-only workload.

4. **GPS buffering:** Primary path = immediate POST (preserves live map). Fallback path = buffer to SQLite queue, batch upload on reconnect. Batch endpoint (`POST /locations/batch`) needed on the API.

5. **Idempotency guarantee:** Every queued action carries a client-generated UUID. Retry storms (network timeout → retry) produce server-side no-ops, not duplicate records. This requires a schema change: `ON CONFLICT (id) DO NOTHING` on attendance, patrol_scan, and incidents inserts.

6. **No service worker dependency.** WKWebView does not support service workers. All offline logic lives in SQLite + Capacitor plugins — not the browser layer.
