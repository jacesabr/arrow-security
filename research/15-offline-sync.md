# Investigation 15 — Offline-First Sync for Ionic/Capacitor + PostgreSQL

**Date:** 2026-05-17  
**Stack:** Fastify 4 + TypeScript · PostgreSQL 16 (Drizzle ORM) · Next.js 16 · Ionic/Capacitor PWA (React, webview)  
**Problem:** Guards lose signal in basements and construction sites. Currently zero offline support — every API call fails without connectivity.

---

## Summary

Five approaches were evaluated for bringing offline-first sync to the Ionic/Capacitor guard app. The guard use case is well-constrained: each guard needs only their own shifts, patrols, checkpoints, and incidents — a small per-user data footprint. Writes (GPS pings, checkpoint scans, incident reports) must queue offline and replay when connectivity returns.

**Verdict: PowerSync is the strongest fit**, with ElectricSQL as a credible fallback. RxDB requires a paid licence for SQLite storage. WatermelonDB does not support Capacitor webviews. The manual Capacitor SQLite approach is viable but requires significant engineering. Electric (1.0) is read-path only — writes must still go through your API, making it a partial solution.

---

## Option 1 — PowerSync

### Stack & dependencies

| Item | Detail |
|------|--------|
| Client SDK | `@powersync/capacitor` (alpha, Nov 2025) |
| Web fallback | `@powersync/web` (stable) with WA-SQLite |
| Mobile storage | Native SQLite via `@capacitor-community/sqlite` (iOS/Android) |
| Web storage | WA-SQLite backed by IndexedDB or OPFS |
| Server service | `journeyapps/powersync-service` Docker image |
| Bucket storage | PostgreSQL (beta, v1.3.8+) or MongoDB |
| Client licence | Apache 2.0 |
| Server licence | Functional Source License 1.1-ALv2 (FSL) — converts to Apache 2.0 two years after each release |
| Postgres version | 11+ |

**FSL note:** FSL permits commercial use and self-hosting freely. The only restriction is building a competing sync-service product. For an internal security operations platform, FSL poses zero practical constraint.

### Capacitor webview compatibility

The `@powersync/capacitor` SDK was purpose-built for Capacitor (announced November 2025). It extends the Web SDK with automatic platform detection:

- **iOS / Android**: routes through `@capacitor-community/sqlite`, which calls the native SQLite engine via the Capacitor bridge — giving full SQLite ACID compliance and no storage quota issues.
- **Web / browser testing**: falls back to WA-SQLite (WebAssembly SQLite) using IndexedDB or OPFS.

One codebase, three targets — the SDK selects the correct driver at runtime. `useQuery()` React hooks re-render identically on all platforms.

**Known alpha limitations (as of Nov 2025):**
- `PowerSyncDatabase.execute` treats any non-`SELECT` statement as a write-only on Android (no `RETURNING *` support).
- No encryption for native mobile platforms yet.
- No multi-tab support on native Android/iOS.
- INSERT...RETURNING does not work on Android.

These are relevant but not blockers for the guard app — the app runs single-tab, guards don't need DB encryption at rest, and we don't use `RETURNING *` in the critical paths.

### Data model / sync rules

PowerSync uses a declarative YAML "sync rules" file (sync-config.yaml) to define what data each user gets. Rules are bucket-based — each bucket is a named partition of rows with parameters extracted from JWT claims.

**Example rules for our security app:**

```yaml
bucket_definitions:
  # Guard's own shifts
  guard_shifts:
    parameters: SELECT request.user_id() as guard_id
    data:
      - SELECT * FROM shifts WHERE guard_id = bucket.guard_id
        AND tenant_id = request.jwt()->>'tenantId'

  # Checkpoints for sites the guard is assigned to
  guard_checkpoints:
    parameters: |
      SELECT s.id as site_id
      FROM sites s
      JOIN shifts sh ON sh.site_id = s.id
      WHERE sh.guard_id = request.user_id()
        AND s.tenant_id = request.jwt()->>'tenantId'
    data:
      - SELECT * FROM checkpoints WHERE site_id = bucket.site_id
      - SELECT * FROM sites WHERE id = bucket.site_id

  # Guard's own incidents and patrols
  guard_incidents:
    parameters: SELECT request.user_id() as guard_id
    data:
      - SELECT * FROM incidents WHERE reported_by = bucket.guard_id
      - SELECT * FROM patrols WHERE guard_id = bucket.guard_id
      - SELECT * FROM patrol_scans ps
          JOIN patrols p ON p.id = ps.patrol_id
          WHERE p.guard_id = bucket.guard_id
```

JWT parameters (`request.user_id()`, `request.jwt()->>'tenantId'`) are extracted from the same 24h JWT our Fastify API already issues — no separate auth system needed.

### API / interface surface

**Client connector (TypeScript):**

```typescript
import { PowerSyncDatabase } from '@powersync/capacitor';
import { AppSchema } from './schema';

const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'powersync.db' }
});

await db.connect(new ArrowConnector());

// React hook — auto-rerenders on data change
const { data: shifts } = useQuery('SELECT * FROM shifts WHERE status = ?', ['scheduled']);

// Offline-safe write (queued for upload)
await db.execute('INSERT INTO incidents (id, title, ...) VALUES (?, ?, ...)', [...]);
```

**Connector interface (two methods only):**

```typescript
class ArrowConnector extends AbstractPowerSyncDatabase {
  async fetchCredentials() {
    // Return { endpoint, token } — reuse existing JWT from localStorage
    return {
      endpoint: 'https://powersync.your-domain.com',
      token: localStorage.getItem('td_token')
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    // Process upload queue — calls your existing Fastify API
    const batch = await database.getCrudBatch(100);
    for (const entry of batch.crud) {
      switch (entry.op) {
        case 'PUT':    await api.post(`/${entry.table}`, entry.opData); break;
        case 'PATCH':  await api.patch(`/${entry.table}/${entry.id}`, entry.opData); break;
        case 'DELETE': await api.delete(`/${entry.table}/${entry.id}`); break;
      }
    }
    await batch.complete();
  }
}
```

The `uploadData` connector calls our **existing Fastify API endpoints** — no changes to backend business logic required. PowerSync delivers server changes down; your API handles writes up.

### Algorithms / conflict resolution patterns

PowerSync's default is **last-write-wins per field** — concurrent updates to different columns on the same row do not conflict. Seven strategies are documented:

1. **Timestamp-based detection** — compare `updated_at` from client vs server; reject stale updates.
2. **Sequence number versioning** — increment version counter; reject if version mismatch (avoids clock drift).
3. **Field-level LWW** — per-column `updated_at` timestamps; two guards editing different fields of one incident can both succeed.
4. **Business rule validation** — enforce domain transitions (e.g., incident status can only go `open → acknowledged → resolved`, never backwards).
5. **Server-side conflict recording** — save both versions to a `write_conflicts` table; sync conflict record back to client for human resolution.
6. **Change-level status tracking** — log each field change with `pending/applied/failed` status.
7. **Cumulative deltas** — treat numeric fields as increments not absolute values.

**For our security app, strategies 1 + 4 are sufficient:**
- GPS location pings: LWW, no conflict possible (each ping is a new row).
- Checkpoint scans: append-only, no conflict possible.
- Incident status updates: business rule validation (status machine).
- Patrol records: append-only start/complete events.

Operations in the upload queue are idempotent by design — the backend may receive the same `CrudEntry` more than once (e.g., after reconnect), so API handlers should upsert rather than insert.

### PostgreSQL setup requirements

```sql
-- 1. Enable logical replication (requires Postgres restart)
ALTER SYSTEM SET wal_level = logical;
ALTER SYSTEM SET max_replication_slots = 4;
ALTER SYSTEM SET max_wal_senders = 10;

-- 2. Create PowerSync role
CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD '...';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

-- 3. Create publication (name must be exactly 'powersync')
CREATE PUBLICATION powersync FOR ALL TABLES;
-- In production, prefer naming tables explicitly to avoid WAL memory spikes:
-- CREATE PUBLICATION powersync FOR TABLE shifts, incidents, patrols, ...;
```

### Self-hosting

**Minimal self-host (pure PostgreSQL stack — no MongoDB needed since v1.3.8):**

```yaml
# docker-compose.yml additions
  powersync:
    image: journeyapps/powersync-service:latest
    environment:
      NODE_OPTIONS: "--max-old-space-size=512"
    volumes:
      - ./powersync/powersync.yaml:/powersync.yaml
    ports:
      - "8080:80"
    depends_on:
      - postgres
```

```yaml
# powersync/powersync.yaml
replication:
  connections:
    - type: postgresql
      uri: !env POWERSYNC_PG_URI

storage:
  type: postgresql          # No MongoDB required (beta as of v1.3.8)
  uri: !env POWERSYNC_PG_URI   # Can share the same Postgres instance

sync_config:
  path: sync-config.yaml

client_auth:
  jwks_uri: http://api:4000/api/auth/keys   # Must expose JWKS endpoint

port: 80
```

**What the JWKS endpoint requires:** PowerSync validates client JWTs against a JWKS endpoint. Our Fastify auth currently signs with a symmetric `JWT_SECRET`. We need to either switch to RS256 (asymmetric) and expose `GET /api/auth/keys`, or use PowerSync's `token_auth` mode with a shared secret (simpler but less standard).

**Production sizing (per PowerSync docs):**
- 1× Replication instance: 1 GB RAM, 1 vCPU
- 2× API instances: 1 GB RAM each (scale: ~1 instance per 100 concurrent connections)
- Adds ~3 GB RAM to infrastructure beyond existing Postgres

### What's missing for our security app

1. **JWKS endpoint** — our Fastify API uses HS256 (symmetric secret). Must add RS256 key pair and `GET /api/auth/keys` returning JWKS JSON, or configure PowerSync's shared-secret auth mode.
2. **Schema duplication** — the PowerSync client `AppSchema` mirrors your Drizzle schema as SQLite types. Any schema migration must update both.
3. **`uploadData` connector** — ~50-100 lines of TypeScript mapping CRUD entries to existing Fastify endpoints. Low complexity.
4. **Fastify upsert handling** — API `POST /incidents` etc. should handle duplicate IDs gracefully (idempotent).
5. **Guard location pings** — these are write-only, high-frequency. Consider bypassing PowerSync sync (just offline-queue them separately) since supervisors viewing live location need the Operations Portal, not the Guard App.
6. **Capacitor SDK alpha risk** — the `@powersync/capacitor` package is still alpha. The underlying Web SDK it extends is stable; mobile native path is the alpha part. For the near term, using the Web SDK directly (WA-SQLite via IndexedDB/OPFS) avoids this risk with slightly lower SQLite performance on mobile.

---

## Option 2 — ElectricSQL (Electric 1.0)

### Stack & dependencies

| Item | Detail |
|------|--------|
| Client SDK | `electric-sql` npm package |
| Storage | Developer's choice (PGlite, IndexedDB, custom) |
| Server service | `electricsql/electric` Docker (Elixir) |
| Postgres version | 14+ |
| Client licence | Apache 2.0 |
| Server licence | Apache 2.0 |

### Capacitor webview compatibility

Electric 1.0 (released March 2025) is primarily a **read-path sync engine** — it streams Postgres row changes down to clients via HTTP long-poll or SSE using declarative "Shapes". A prior blog post (Nov 2023) showed Ionic/Capacitor integration using wa-sqlite, suggesting webview compatibility is technically achievable.

However, the architecture changed significantly in 1.0: Electric no longer ships a SQLite sync adapter directly. The client receives shape data as JSON streams; the developer chooses how to store it locally (PGlite with WASM Postgres, IndexedDB, etc.). PGlite works in a webview but requires ~7 MB WASM download on first load.

### Write support

**Critical finding:** Electric 1.0 does NOT handle writes. The documentation states explicitly:

> "Electric does not do write-path sync. It doesn't provide (or prescribe) a built-in solution for getting data back into Postgres from local apps and services."

Writes must go through your own API. Four patterns are suggested (online writes, optimistic state, persistent optimistic state, through-the-database sync). There is no built-in upload queue, no conflict resolution, and no idempotent replay mechanism.

**Impact for offline guard app:** You would use Electric to sync data *down* to the guard (shifts, checkpoints, site info) and still need a custom offline write queue for everything guards do (check-in, patrol scans, incidents, GPS pings). This gives you roughly half a solution.

### Shapes (partial sync)

```typescript
// Only sync this guard's shifts
const stream = await client.shapeStream({
  url: 'https://electric.your-domain.com/v1/shape',
  table: 'shifts',
  where: `guard_id = '${guardId}' AND tenant_id = '${tenantId}'`
});
```

Shapes support `WHERE` clauses for row filtering and column selection. Single-table only — no nested/joined shapes yet (in progress). Cross-table filtering requires multiple shape subscriptions.

### Self-hosting

Single Docker container, minimal:

```bash
docker run \
  -e DATABASE_URL=postgresql://... \
  -e ELECTRIC_PORT=3000 \
  -e ELECTRIC_STORAGE_DIR=/data \
  -v electric_data:/data \
  -p 3000:3000 \
  electricsql/electric
```

PostgreSQL must have `wal_level = logical` and a `REPLICATION`-privileged role. Electric creates its own publication (`electric_publication_default`) and replication slot automatically.

Lighter-weight than PowerSync (no Node.js service, no bucket storage DB, pure Elixir with disk cache). Easier ops story but delivers only half the sync story.

### What's missing

- No write path — must build custom offline queue (negating much of the "use a library" benefit).
- No built-in conflict resolution.
- No upload retry / idempotency mechanism.
- 1.0 dropped the Capacitor-specific SQLite integration from v0.x; developer must wire up storage layer manually.
- Shapes are single-table; cross-table data (e.g., checkpoints + sites together) requires multiple subscriptions with manual join logic.

---

## Option 3 — RxDB

### Stack & dependencies

| Item | Detail |
|------|--------|
| Core | `rxdb` (Apache 2.0, free) |
| SQLite storage for Capacitor | `@rxdb-premium/sqlite` — requires **paid Pro licence** |
| Pro licence | €1,300/year minimum (annual, no trial) |
| Replication to PostgreSQL | No native adapter — must build custom HTTP replication plugin |
| Storage fallback (web/free) | IndexedDB (unreliable for quota) or OPFS |

### Capacitor webview compatibility

RxDB runs in Capacitor because it targets browser APIs. For production use in Capacitor, the recommended storage is SQLite (persists to filesystem, not subject to storage quota eviction). The SQLite RxStorage is a **premium paid feature** starting at €1,300/year.

Free tier options in Capacitor:
- IndexedDB: works but subject to OS/browser storage quota eviction — unacceptable for a guard app that must persist data reliably.
- OPFS: better than IndexedDB but not supported on all Android WebView versions.

### PostgreSQL sync

RxDB has no native PostgreSQL replication adapter. The replication protocol is generic (pull/push with checkpoint cursors). You must build a custom adapter that:
1. Exposes a checkpoint-based pull endpoint on Fastify (return changes since cursor).
2. Accepts push batches from RxDB clients.
3. Manages server-side change tracking (usually a `_changes` table or CDC timestamps).

The Supabase replication plugin (third-party, MIT) shows what this looks like — approximately 300-500 lines of integration code plus schema changes for CDC.

### What's missing

- Paid licence required for reliable Capacitor storage (€1,300+/year).
- Full custom PostgreSQL sync adapter must be written (significant engineering, no reference implementation for plain PostgreSQL).
- No partial sync primitive — developer must filter data at the API layer.
- Higher total implementation complexity than PowerSync for equivalent offline behaviour.

---

## Option 4 — Capacitor SQLite + Manual Sync Queue

### Stack & dependencies

| Item | Detail |
|------|--------|
| Storage | `@capacitor-community/sqlite` (MIT) |
| Sync | 100% custom — no library handles it |
| PostgreSQL integration | Via existing Fastify API |
| Conflict resolution | 100% custom |

### Approach

```typescript
// Pending operations table in local SQLite
CREATE TABLE IF NOT EXISTS pending_ops (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  payload TEXT NOT NULL,    -- JSON
  created_at INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);

// Sync worker (runs when online)
async function flushPendingOps() {
  const ops = await db.query('SELECT * FROM pending_ops ORDER BY created_at ASC LIMIT 50');
  for (const op of ops.values) {
    try {
      await applyToServer(op);
      await db.run('DELETE FROM pending_ops WHERE id = ?', [op.id]);
    } catch (err) {
      await db.run('UPDATE pending_ops SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
        [err.message, op.id]);
    }
  }
}
```

**Estimated implementation:** 2-4 weeks for a production-quality queue with retry, exponential backoff, conflict detection, and data download (for pre-seeding shifts/checkpoints on shift start).

**Note:** `@capacitor-community/sqlite` original maintainer has ceased maintenance — the package still works but consider whether this dependency is reliable long-term (PowerSync's Capacitor SDK wraps it and takes on maintenance responsibility).

### What's missing

- Everything — complete engineering effort, no sync primitives provided.
- Download path (syncing server data to device) must also be built.
- Conflict resolution must be designed and implemented.
- No reactive query system (data changes don't automatically update UI).

---

## Option 5 — WatermelonDB

### Verdict: Not viable for our stack

WatermelonDB's own documentation lists Capacitor under "Contribute these adapters!" — meaning **Capacitor is not officially supported**. The available adapters are:

- **SQLite**: React Native (iOS/Android) only.
- **LokiJS + IndexedDB**: Web/browser only (not designed for native SQLite).

There is no maintained Capacitor adapter. The framework is primarily designed for React Native apps using JSI/JSC bridges, not webview-based apps. Using LokiJS+IndexedDB in a Capacitor webview would work technically but loses the SQLite performance benefits and faces the same quota eviction risks as plain IndexedDB.

Additionally, WatermelonDB has no native PostgreSQL sync — the sync protocol requires a custom backend adapter.

**WatermelonDB is eliminated from consideration.**

---

## Comparison Matrix

| Criterion | PowerSync | ElectricSQL | RxDB | Manual Queue | WatermelonDB |
|-----------|-----------|-------------|------|--------------|--------------|
| Capacitor webview | Native SDK (alpha) | Manual wiring | Yes (paid SQLite) | Yes | No (unsupported) |
| PostgreSQL source | Native (logical rep) | Native (logical rep) | Custom adapter needed | Via API | No |
| Offline writes | Built-in queue | No — DIY | Built-in | DIY | N/A |
| Conflict resolution | 7 strategies built-in | DIY | DIY | DIY | N/A |
| Partial sync | Bucket sync rules + JWT | Shapes (single-table) | API-layer filtering | API-layer filtering | N/A |
| Self-host complexity | Medium (1 container + PG logical rep) | Low (1 Elixir container) | N/A (no PS server) | N/A | N/A |
| Server licence | FSL (permissive for our use) | Apache 2.0 | N/A | N/A | N/A |
| Client licence | Apache 2.0 | Apache 2.0 | Apache 2.0 (core) | MIT deps | MIT |
| Paid requirement | No | No | Yes (€1,300+/yr for SQLite) | No | N/A |
| New infra needed | powersync-service + PG logical rep | electric service + PG logical rep | None | None | N/A |
| Engineering effort to production | Low-medium | Medium (write path DIY) | High | High | Eliminated |

---

## Verdict: AUGMENT with PowerSync

**Recommended:** PowerSync (`@powersync/capacitor` + self-hosted `powersync-service`).

**Rationale:**

1. **Stack fit is near-perfect.** PostgreSQL logical replication is the source. The Capacitor SDK targets exactly our runtime (Ionic/Capacitor webview). The JWT we already issue maps directly to PowerSync's auth parameter model.

2. **Both sync directions are handled.** Unlike Electric 1.0, PowerSync manages the full loop: server → client (down-sync) and client → server (upload queue with retry). This eliminates the largest engineering risk.

3. **Bucket sync rules solve our multi-tenancy natively.** Guards only receive their own tenant's data, filtered to their assigned shifts — using the same `tenantId` and `sub` already in our JWT.

4. **The `uploadData` connector calls our existing Fastify API.** No backend rewrite needed. The connector is ~80 lines of TypeScript.

5. **PostgreSQL-only infrastructure.** Since v1.3.8, the PowerSync service can use our existing PostgreSQL instance for bucket storage (no MongoDB). We add one Docker container and enable logical replication on Postgres.

6. **Licence is not a problem.** FSL allows free self-hosting and commercial use in our security platform. The restriction only applies to building a competing sync product, which we are not.

**Risks to manage:**

- `@powersync/capacitor` is alpha. Mitigate by starting with `@powersync/web` (WA-SQLite) for the initial implementation — the SDK is identical, only the storage driver differs. Upgrade to native when the Capacitor SDK reaches stable.
- JWT key type change. Our HS256 JWTs must either be re-signed as RS256 (to expose a JWKS endpoint) or PowerSync's shared-secret auth mode must be used. This is a ~1-day change but must be planned carefully to avoid breaking existing sessions.
- Logical replication on Docker Postgres. Our `docker-compose.yml` Postgres container must be configured with `wal_level=logical`. This requires a container restart. In production, confirm the managed PostgreSQL provider supports logical replication (AWS RDS, Supabase, Neon, Render all do).
- Schema sync burden. The Drizzle schema and the PowerSync client `AppSchema` must stay in sync. Write a script or CI check to validate they match.

**ElectricSQL as fallback:** If PowerSync's alpha Capacitor SDK proves too unstable before a stable release, Electric can handle the read/down-sync path (shifts, checkpoints pre-loaded onto device). A thin custom queue (~400 lines) handles writes. This is more engineering but uses a more mature Apache-2.0 stack with no restrictions.

---

## Concrete Extracts

### PowerSync sync-config.yaml for Arrow Security

```yaml
# powersync/sync-config.yaml
bucket_definitions:
  guard_own_data:
    parameters: SELECT request.user_id() as guard_id
    data:
      # Guard's shifts (active and upcoming)
      - SELECT id, guard_id, site_id, start_time, end_time, status
        FROM shifts
        WHERE guard_id = bucket.guard_id

      # Patrols for those shifts
      - SELECT p.id, p.shift_id, p.site_id, p.status, p.started_at, p.completed_at
        FROM patrols p
        JOIN shifts s ON s.id = p.shift_id
        WHERE s.guard_id = bucket.guard_id

      # Patrol scans
      - SELECT ps.id, ps.patrol_id, ps.checkpoint_id, ps.scanned_at, ps.method
        FROM patrol_scans ps
        JOIN patrols p ON p.id = ps.patrol_id
        JOIN shifts s ON s.id = p.shift_id
        WHERE s.guard_id = bucket.guard_id

      # Incidents reported by this guard
      - SELECT id, title, description, severity, status, site_id, created_at
        FROM incidents
        WHERE reported_by = bucket.guard_id

  # Sites and checkpoints for guard's assigned shifts
  guard_sites:
    parameters: |
      SELECT DISTINCT s.id as site_id
      FROM sites s
      JOIN shifts sh ON sh.site_id = s.id
      WHERE sh.guard_id = request.user_id()
        AND sh.end_time > NOW() - INTERVAL '24 hours'
    data:
      - SELECT * FROM sites WHERE id = bucket.site_id
      - SELECT * FROM checkpoints WHERE site_id = bucket.site_id
```

### PowerSync connector skeleton (TypeScript)

```typescript
// src/services/powerSyncConnector.ts
import { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/web';
import { api } from './api';  // existing Fastify API client

export class ArrowPowerSyncConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const token = localStorage.getItem('td_token');
    if (!token) throw new Error('Not authenticated');
    return {
      endpoint: import.meta.env.VITE_POWERSYNC_URL,
      token,
      expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000)
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const batch = await database.getCrudBatch(50);
    if (!batch) return;

    for (const entry of batch.crud) {
      try {
        switch (`${entry.table}:${entry.op}`) {
          case 'incidents:PUT':
            await api.post('/incidents', entry.opData); break;
          case 'incidents:PATCH':
            await api.patch(`/incidents/${entry.id}/status`, entry.opData); break;
          case 'patrol_scans:PUT':
            await api.post('/patrol/:id/scan'.replace(':id', entry.opData.patrol_id), entry.opData); break;
          case 'attendance_records:PUT':
            await api.post('/attendance', entry.opData); break;
          // guard_locations: high-frequency, consider separate queue
          case 'guard_locations:PUT':
            await api.post('/locations', entry.opData); break;
          default:
            console.warn('Unhandled upload:', entry.table, entry.op);
        }
      } catch (err: any) {
        // Don't call batch.complete() — entry will retry
        if (err?.statusCode >= 400 && err?.statusCode < 500) {
          // Client error — log and skip (permanent failure)
          console.error('Permanent upload failure, skipping:', entry, err);
        } else {
          throw err; // Transient — retry whole batch
        }
      }
    }
    await batch.complete();
  }
}
```

### PowerSync database initialization (Capacitor)

```typescript
// src/services/db.ts
import { PowerSyncDatabase } from '@powersync/capacitor';  // or @powersync/web for web-only
import { ArrowSchema } from './schema';
import { ArrowPowerSyncConnector } from './powerSyncConnector';

export const db = new PowerSyncDatabase({
  schema: ArrowSchema,
  database: { dbFilename: 'arrow-guard.db' }
});

const connector = new ArrowPowerSyncConnector();

export async function initSync() {
  await db.connect(connector);
}
```

### Fastify JWKS endpoint (required for PowerSync JWT verification)

```typescript
// apps/api/src/routes/auth.ts — add to existing auth routes
import { createPublicKey } from 'crypto';

// Switch to RS256: generate key pair once, store in env
fastify.get('/auth/keys', async () => {
  const publicKey = createPublicKey(process.env.JWT_PUBLIC_KEY!);
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    keys: [{ ...jwk, kid: 'arrow-key-1', use: 'sig', alg: 'RS256' }]
  };
});
```

Alternatively, use PowerSync's `token_auth` with shared secret (avoids RS256 migration):

```yaml
# powersync.yaml
client_auth:
  supabase: false
  token_auth:
    secret: !env JWT_SECRET   # same HS256 secret Fastify uses
```

---

## Open Questions for Synthesis

1. **JWT key migration path.** Can we switch Fastify to RS256 without invalidating all active sessions? Or should we use PowerSync's `token_auth` (HS256 shared secret) initially and migrate later?

2. **Guard location pings at 30s intervals.** Should these go through PowerSync's upload queue (adds overhead per ping) or bypass to a dedicated lightweight queue? The Operations Portal SSE feed consumes these — does PowerSync down-sync guard location data to supervisors, or keep it as a direct REST/SSE path?

3. **Conflict strategy for incidents.** If a guard creates an incident offline with a locally-generated `createId()` and later a supervisor creates one with the same data, is field-level LWW sufficient or do we need a `write_conflicts` table?

4. **Pre-seeding on shift start.** When a guard's shift begins (or the night before), should the app force a full sync of that shift's data? Specify minimum data set: shift record, site record, all checkpoints for that site, any open incidents for that site.

5. **PowerSync Capacitor SDK graduation timeline.** The alpha was announced November 2025. Is there a public roadmap for stable? If still alpha at implementation time, start with `@powersync/web` (WA-SQLite in IndexedDB/OPFS) — performance is acceptable for guard-app data volumes.

6. **Multiple shifts.** Guards may have shifts across multiple sites. Bucket design needs to handle ≤7 days of upcoming shifts with ≤10 sites — confirm this stays within the ≤1,000 bucket limit.

7. **Offline duration assumptions.** How long can a guard be offline? 2 hours in a basement vs. 8-hour full shift in dead zone changes the local storage requirements and upload queue depth.

8. **Electric as read-complement.** If PowerSync write path proves difficult, could we use Electric purely for down-sync (shifts, checkpoints) and a thin 200-line queue for writes? Compare implementation time vs. full PowerSync approach.
