# Investigation 17 — Tamper-Evident Audit Trail Patterns

**Date:** 2026-05-17
**Context:** Arrow Security multi-tenant security guard platform. Security records (check-ins, patrol scans, incidents, GPS pings) are legally meaningful. Clients can dispute events. No audit log exists today — all DB writes are mutable.

---

## Summary

The gold standard for tamper-evident logs is a **Merkle-tree-backed, append-only transparency log** (the same structure underlying Certificate Transparency and Sigstore Rekor). For a PostgreSQL-native stack, the practical equivalent is an **HMAC-chained append-only audit table**, optionally anchored externally via OpenTimestamps. This gives us cryptographic proof that a record existed at time T with its exact contents — proof that survives even if a rogue admin tries to delete or alter the row after the fact.

**Recommended path:** Implement an HMAC-chained `audit_log` table in PostgreSQL, written from within our Fastify API whenever a legally significant event occurs. Add a periodic OpenTimestamps anchor for external immutability. This requires no new infrastructure, uses our existing Drizzle schema conventions, and delivers "guard disputes their check-in" defensibility within a sprint.

---

## 1. Sigstore Rekor Architecture

### What Rekor Is

Rekor (https://github.com/sigstore/rekor) is an append-only transparency log for software-supply-chain artifacts: signatures, SBOMs, attestations. It is the production implementation Sigstore runs as a public service at `rekor.sigstore.dev`. Internally it uses Google Trillian as the Merkle-log engine.

**License:** Apache 2.0

### Merkle Tree Fundamentals

```
                   Root Hash (Signed Tree Head)
                   /                          \
          Internal Node                  Internal Node
          /        \                     /         \
   Leaf Hash 0  Leaf Hash 1       Leaf Hash 2  Leaf Hash 3
       |              |               |              |
   Record 0       Record 1        Record 2       Record 3
```

Each leaf hash = `SHA-256(record_bytes)`. Each internal node = `SHA-256(left_child || right_child)`. The root hash summarises the entire log state.

### Signed Tree Head (STH)

After each batch of insertions the log server signs:

```json
{
  "tree_size": 1047382,
  "timestamp": 1716000000,
  "sha256_root_hash": "a3f2...",
  "tree_head_signature": "<ECDSA P-256 over the above>"
}
```

Anyone can verify the STH against the public key. A third party (a "witness") can independently verify the STH matches the log contents without trusting the log operator.

### Inclusion Proofs

To prove that record R is in the log: the log returns a sibling-hash path of length `log2(tree_size)`. The verifier recomputes the root from those hashes; if it matches the signed STH, R is definitively in the log.

### Consistency Proofs

To prove the log has not been rewritten between tree_size=N and tree_size=M: the log returns a minimal set of nodes that let the verifier show the earlier root is a sub-tree of the later root. This is how you detect that old records were removed or reordered.

### What Makes It Tamper-Evident

1. **Append-only:** Rekor/Trillian reject any write operation other than INSERT.
2. **Root is signed by a hardware-backed key (HSM/KMS) at each checkpoint.** Altering any past record changes every hash from that leaf to the root — detectable on the next inclusion proof or consistency check.
3. **External witnesses:** The STH is broadcast to independent monitors who cross-check it. A corrupt operator cannot secretly rewrite history without the monitors noticing.
4. **The signed root is published externally** (e.g. in a CT log, or stored in a location the operator cannot modify), so even if the operator deletes their own DB, the last known state is anchored.

---

## 2. Can We Run Rekor Directly?

**Short answer: No, not as-is. The architecture is portable but the tool is purpose-built for software artifacts.**

| Factor | Rekor | Our Need |
|---|---|---|
| Record schema | Pluggable "types" (rekord, hashedrekord, dsse, …) | Attendance, patrol_scan, incident, GPS ping |
| Client tooling | `rekor-cli`, cosign | Our Fastify API |
| Storage backend | MySQL (via Trillian) + object storage | We are already on PostgreSQL |
| External key management | KMS-backed signing key | We would need GCP/AWS KMS or a local HSM |
| Deployment complexity | Three separate services (rekor-server, trillian_log_server, trillian_log_signer) | We prefer zero new services for Phase 1 |
| Witness infrastructure | Sigstore runs public witnesses | We would have no witnesses — defeats the purpose |

Rekor's value in sigstore is partially that the public log is witnessed by many independent parties. A private Rekor instance has no public witnesses, so a corrupt admin can still rewrite history and regenerate the signatures with their own key — the same attack as a plain append-only DB, unless you add external anchoring separately.

**Verdict on Rekor:** Skip the software. Take the patterns.

---

## 3. Alternative Approaches

### 3a. Google Trillian

**Repo:** https://github.com/google/trillian
**License:** Apache 2.0

Trillian is the general-purpose Merkle-log library that Rekor and Certificate Transparency are built on. It is a gRPC service that exposes a Merkle log API backed by MySQL (or Cloud Spanner). Rekor adds the "record type" layer on top.

**Pros:**
- Battle-tested at Google scale.
- General-purpose — we define our own leaf record schema.
- Cryptographic correctness is handled for us.

**Cons:**
- Requires MySQL or Cloud Spanner. We are on PostgreSQL.
- PostgreSQL backend exists as a fork (`trillian-postgres`) but is not the upstream-supported path.
- Still requires a separate gRPC service deployment.
- Our small single-node deployment gains little from its distributed consistency design.

**Verdict:** Overkill for our scale and adds a MySQL/gRPC operational dependency. Do not adopt.

### 3b. HMAC-Chained Append-Only PostgreSQL Table (Recommended)

The Merkle tree reduces to a simple **hash chain** for a single-writer, single-sequence log. Each row stores a hash of `(previous_row_hash + current_row_payload)`. Altering any historical row breaks every subsequent hash, detectable with a single sequential scan.

The chain is keyed with an HMAC so that even an admin who knows the schema cannot forge a replacement chain without the HMAC secret.

**How it works:**

```
row 1: prev_hash = "genesis"
        payload = {event data}
        row_hash = HMAC-SHA256(key, "genesis" || JSON.stringify(payload))

row 2: prev_hash = row_hash of row 1
        payload = {next event data}
        row_hash = HMAC-SHA256(key, row_hash_1 || JSON.stringify(payload))
```

Verification = walk the table in `seq` order, recompute each HMAC, confirm it matches the stored value. Any tampered row produces a mismatch at that row and cascades forward.

**Attack surface:**
- Admin cannot alter a historical row without the HMAC key AND the ability to recompute all subsequent hashes. If the HMAC key lives in an environment variable (not in the DB), this is hard.
- Admin CAN truncate the table from the current position if they also hold the HMAC key and update subsequent hashes. Mitigation: external anchoring (see 3c).

### 3c. OpenTimestamps Anchoring (External Immutability Layer)

**Site:** https://opentimestamps.org
**Spec:** https://github.com/opentimestamps/opentimestamps-spec
**License:** MIT (client libraries) / Apache 2.0 (server)

OpenTimestamps (OTS) anchors a hash into the Bitcoin blockchain via a Merkle aggregation calendar server. Once included in a Bitcoin block, the timestamp and hash cannot be altered without re-mining Bitcoin — computationally infeasible.

**How to use:**
1. Every N minutes (cron job) compute the current chain head hash: `SELECT row_hash FROM audit_log ORDER BY seq DESC LIMIT 1`.
2. Submit that hash to the OTS calendar API (`https://alice.btc.calendar.opentimestamps.org`).
3. Store the returned `.ots` receipt in our DB or file store.
4. After ~1 hour (Bitcoin block time + confirmation), upgrade the receipt with `ots upgrade`.
5. To prove to a court/client: provide the receipt + the hash. They can verify against the Bitcoin block independently.

**Cost:** Free. The OTS calendars are public infrastructure.

**Latency to finality:** ~60 minutes for a Bitcoin-confirmed timestamp. Perfectly acceptable for our use case — we are not timestamping in real-time, just anchoring the chain head periodically.

**Pairing with HMAC chain:** The HMAC chain provides tamper detection within our DB. OTS provides an external proof that a specific chain state existed at a specific wall-clock time. Together: we can prove (a) what the state was at time T, and (b) it has not been altered since T.

### 3d. PostgreSQL Logical Replication to Append-Only Replica

Use PostgreSQL logical replication to stream all INSERT events from the primary to a replica where the replica user has only INSERT permission (no UPDATE, DELETE).

**Pros:**
- Zero code changes on the write path.
- Replica is physically separate — an admin on the primary cannot delete its data.

**Cons:**
- Does not help if the primary row was altered before replication (replication is near-real-time, not immediate; a fast UPDATE before replication flushes would propagate the mutation to the replica).
- An admin with access to both servers can still tamper with both.
- The replica is mutable from the replica server's own perspective (the replication user restriction only applies through that one user — a DBA on the replica host can still DELETE).
- Does not produce cryptographic proof — just a copy.

**Verdict:** Useful as a backup/DR mechanism. Not sufficient as a tamper-evident audit log on its own. Could be combined with the HMAC chain as a redundancy layer.

---

## 4. Data Model

### Core `audit_log` Table

```typescript
// packages/db/src/schema/auditLog.ts
import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { createId } from '../lib/id'

export const auditLog = pgTable('audit_log', {
  // Monotonically increasing sequence — used for chain ordering.
  // Using BIGSERIAL at the DB level; Drizzle maps via serial().
  seq: integer('seq').primaryKey().generatedAlwaysAsIdentity(),

  // Record identity
  id: text('id').notNull().$defaultFn(createId),        // stable external ID
  tenantId: text('tenant_id').notNull().references(() => tenants.id),

  // Event classification
  entityType: text('entity_type').notNull(),             // 'attendance_record' | 'patrol_scan' | 'incident' | 'incident_status' | 'guard_location' | 'shift_assignment'
  entityId: text('entity_id').notNull(),                 // FK into the source table
  action: text('action').notNull(),                      // 'created' | 'status_changed' | 'updated'

  // Actor
  actorId: text('actor_id'),                             // userId who triggered the event (null for system)
  actorRole: text('actor_role'),                         // role at time of action

  // Payload — the full denormalized snapshot of the entity at time of event.
  // Denormalized intentionally: we want the record to be self-contained.
  payload: jsonb('payload').notNull(),

  // Chain integrity
  prevHash: text('prev_hash').notNull(),                 // row_hash of (seq - 1); 'genesis' for seq=1
  rowHash: text('row_hash').notNull(),                   // HMAC-SHA256(AUDIT_HMAC_SECRET, prevHash + canonical_json(payload_for_hashing))
  // Note: payload_for_hashing = {seq, tenantId, entityType, entityId, action, actorId, payload}
  //       — excludes rowHash itself, includes seq to prevent reordering attacks.

  // Timestamps
  occurredAt: timestamp('occurred_at').notNull(),        // when the underlying event happened
  loggedAt: timestamp('logged_at').defaultNow().notNull(), // when the audit row was written

  // Optional: OTS receipt once the chain head is anchored to Bitcoin
  otsReceipt: text('ots_receipt'),
}, (table) => ({
  tenantIdx: index('audit_log_tenant_idx').on(table.tenantId),
  entityIdx: index('audit_log_entity_idx').on(table.entityType, table.entityId),
  seqIdx: index('audit_log_seq_idx').on(table.seq),
}))

export type AuditLogEntry = typeof auditLog.$inferSelect
export type NewAuditLogEntry = typeof auditLog.$inferInsert
```

**Critical PostgreSQL constraint — prevent UPDATE and DELETE:**

```sql
-- Run once after table creation.
-- Revoke UPDATE and DELETE from the application role.
REVOKE UPDATE, DELETE ON audit_log FROM secureops_app;

-- Also set a row-level security policy if you want belt-and-suspenders:
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_insert_only ON audit_log
  FOR INSERT TO secureops_app WITH CHECK (true);

-- Superuser / migration role keeps full access for schema migrations only.
```

This means even if an attacker compromises the application-level DB credentials, they cannot mutate historical audit rows.

---

## 5. API / Interface Surface

### Fastify Service: `AuditService`

```typescript
// apps/api/src/lib/audit.ts
import { createHmac } from 'crypto'
import { db } from '@secureops/db'
import { auditLog } from '@secureops/db/schema'
import { eq, desc } from 'drizzle-orm'

const HMAC_KEY = process.env.AUDIT_HMAC_SECRET!
// Must be at minimum 32 bytes. Store in env — never in DB.

type AuditPayload = {
  entityType: string
  entityId: string
  action: string
  tenantId: string
  actorId?: string
  actorRole?: string
  occurredAt: Date
  data: Record<string, unknown>     // full snapshot of the changed entity
}

function canonicalJson(obj: unknown): string {
  // Sorted-key serialisation — deterministic regardless of JS object insertion order.
  return JSON.stringify(obj, Object.keys(obj as object).sort())
}

function computeRowHash(prevHash: string, forHashing: object): string {
  const mac = createHmac('sha256', HMAC_KEY)
  mac.update(prevHash)
  mac.update(canonicalJson(forHashing))
  return mac.digest('hex')
}

export async function appendAuditLog(event: AuditPayload): Promise<void> {
  // 1. Read the current chain head (last row) — serialised with FOR UPDATE SKIP LOCKED
  //    to handle concurrent appends safely.
  await db.transaction(async (tx) => {
    const [head] = await tx
      .select({ seq: auditLog.seq, rowHash: auditLog.rowHash })
      .from(auditLog)
      .where(eq(auditLog.tenantId, event.tenantId))
      .orderBy(desc(auditLog.seq))
      .limit(1)
      .for('update')    // serialise concurrent writers for this tenant

    const prevHash = head?.rowHash ?? 'genesis'
    const nextSeq = (head?.seq ?? 0) + 1  // advisory — actual seq from GENERATED ALWAYS

    const forHashing = {
      seq: nextSeq,
      tenantId: event.tenantId,
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      actorId: event.actorId ?? null,
      payload: event.data,
    }

    const rowHash = computeRowHash(prevHash, forHashing)

    await tx.insert(auditLog).values({
      tenantId: event.tenantId,
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      actorId: event.actorId,
      actorRole: event.actorRole,
      payload: event.data,
      prevHash,
      rowHash,
      occurredAt: event.occurredAt,
    })
  })
}
```

### Chain Verification Endpoint

```typescript
// GET /api/admin/audit/verify  (platform_admin only)
// Returns: { valid: boolean, verifiedUpTo: number, brokenAt?: number }

export async function verifyAuditChain(tenantId: string): Promise<{
  valid: boolean
  verifiedUpTo: number
  brokenAt?: number
}> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(auditLog.seq)

  let prevHash = 'genesis'

  for (const row of rows) {
    const forHashing = {
      seq: row.seq,
      tenantId: row.tenantId,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      actorId: row.actorId,
      payload: row.payload,
    }
    const expected = computeRowHash(prevHash, forHashing)
    if (expected !== row.rowHash) {
      return { valid: false, verifiedUpTo: row.seq - 1, brokenAt: row.seq }
    }
    prevHash = row.rowHash
  }

  return { valid: true, verifiedUpTo: rows.at(-1)?.seq ?? 0 }
}
```

### Call Sites — Where to Invoke `appendAuditLog`

Each of the following routes should call `appendAuditLog` immediately after the successful DB INSERT/UPDATE:

```typescript
// Example: attendance check-in (apps/api/src/routes/attendance.ts)
const [record] = await db.insert(attendanceRecords).values({ ... }).returning()

await appendAuditLog({
  entityType: 'attendance_record',
  entityId: record.id,
  action: 'created',
  tenantId: payload.tenantId,
  actorId: payload.sub,
  actorRole: payload.role,
  occurredAt: record.verifiedAt,
  data: record,   // full snapshot
})

// Example: incident status change (PATCH /incidents/:id/status)
await appendAuditLog({
  entityType: 'incident',
  entityId: incident.id,
  action: 'status_changed',
  tenantId: payload.tenantId,
  actorId: payload.sub,
  actorRole: payload.role,
  occurredAt: new Date(),
  data: {
    previousStatus: previous.status,
    newStatus: body.status,
    incidentSnapshot: incident,
  },
})
```

---

## 6. Algorithms / Techniques Worth Borrowing from Rekor/Trillian

### Inclusion Proof (simplified — for evidentiary export)

If a client disputes an event, we can export a "certificate of audit entry" that includes:

1. The raw audit row (JSON).
2. `seq` and `rowHash`.
3. The chain-head hash at the time of the next OTS anchor.
4. The `.ots` receipt (Bitcoin-anchored timestamp).

The verifier can:
- Recompute `rowHash` from the payload and `prevHash` to confirm the row has not been altered.
- Verify the OTS receipt confirms that chain state existed before time T.

This is an inclusion proof without the full Merkle tree — sufficient for a single-party dispute.

### Canonical JSON

Rekor uses RFC 8785 (JCS — JSON Canonicalization Scheme) for deterministic serialization. Key insight: object key order in JSON is undefined in JavaScript. If you serialize `{b: 1, a: 2}` two different ways, you get different hashes. Always sort keys before hashing.

Node.js equivalent: `JSON.stringify(obj, Object.keys(obj).sort())` — but this is not recursive. Use a proper recursive canonical JSON library (e.g. `canonical-json` npm package, MIT licensed) for production.

### Separate Signing Key from DB Credentials

Rekor uses an HSM-backed or KMS-backed key for signing STHs. The pattern: the secret that protects the audit chain should not be stored in the same place as the data it protects. For us, `AUDIT_HMAC_SECRET` must be:
- An environment variable set in the deployment environment (Render secret, Kubernetes secret, etc.).
- Not stored in PostgreSQL.
- Rotated only via a documented key-rotation procedure (which re-signs the full chain).

### Append-Only Enforcement at Multiple Layers

Rekor enforces append-only at:
1. Application layer (Trillian rejects non-append operations).
2. Database layer (MySQL triggers/permissions).
3. Infrastructure layer (the DB host itself is restricted).

We should mirror this: application code only ever INSERTs to `audit_log`, DB permissions prohibit UPDATE/DELETE, and ideally the DB host for audit_log is separate (or logical replication to append-only replica).

---

## 7. What's Missing for Our Security App

| Gap | Severity | Notes |
|---|---|---|
| No external witness | Medium | HMAC chain alone does not prove tamper-absence to a court — the HMAC key holder could regenerate the whole chain. OTS anchoring closes this gap. |
| HMAC key rotation procedure | Medium | If the key leaks, historical signatures need re-computation under a new key. Need a rotation runbook. |
| Concurrent writer race | Medium | Two simultaneous attendance check-ins can race for the chain head. The `FOR UPDATE` lock on the last row serialises this but adds latency under high concurrency. Alternative: per-entity-type sub-chains (one HMAC chain per entity type, parallel). |
| No selfie/photo hashing | Medium | Incident photos and check-in selfies are in MinIO (not yet integrated). The audit entry should include `SHA-256(photo_bytes)` so a stored photo can be proved to be the original. |
| Mobile clock skew | Low | GPS pings and scan timestamps come from the mobile device, which may have a wrong clock. We should record `server_received_at` (server clock) alongside `occurred_at` (client claim) in the audit row. |
| Chain verification UI | Low | There is no way for a supervisor to trigger chain verification today. A `/admin/audit/verify` endpoint + a page in the Operations Portal would complete the picture. |
| Guard-facing proof export | Low | To produce an evidentiary PDF ("incident reported at 14:32:07 IST by guard Ravi at Site XYZ, hash: a3f2..."), we need a PDF generation step using the audit row. |

---

## 8. Threat Model

### What This Defends Against

| Attack | Defence |
|---|---|
| Guard claims they were not at a site | `attendance_record` audit row has GPS coordinates, timestamp, method, and is HMAC-signed at insert time. Altering the row breaks the chain — detected on next verification run. |
| Guard claims a patrol scan did not happen | `patrol_scan` audit row signed at scan time. |
| Supervisor alters an incident report timestamp retroactively | `incidents` row is audited at creation. PATCH updates produce a new `incident_status` audit row — the original creation row is immutable. |
| Rogue DBA deletes a row from `attendance_records` | The corresponding audit row in `audit_log` remains (audit table is INSERT-only). The audit row contains the full snapshot. |
| Rogue DBA truncates `audit_log` from the current position | OTS anchoring means the prior chain head is anchored in the Bitcoin blockchain — the deletion is provable by showing the OTS receipt references a hash no longer present. |
| Application-level SQL injection overwrites a row | Same as DBA DELETE above — audit_log permissions block UPDATE. |

### What This Does NOT Defend Against

| Attack | Reason |
|---|---|
| Compromised `AUDIT_HMAC_SECRET` | If the key leaks, an attacker can fabricate a coherent fake chain. Mitigation: external OTS anchoring, HSM-backed key. |
| Corrupt platform_admin with full system access | They hold the HMAC key and can access all infrastructure. No software control survives a fully compromised operator. Legal/organisational controls (segregation of duties, external audit) are required. |
| Forged events before they reach the API | If a guard's device is compromised, it can submit forged GPS coordinates. The API trusts the data submitted. Liveness verification (face recognition, geofence checks) mitigates this but does not eliminate it. |
| Time-of-check / time-of-record gap | The `occurredAt` field is server-recorded, but the underlying event (e.g. QR scan) happened on the guard's device. A guard could scan immediately, then submit the payload 10 minutes later with a manipulated `occurredAt`. Mitigation: validate `occurredAt <= now() + 30s` on the server side. |
| Replication lag | If using the logical-replication-to-replica approach, a fast UPDATE on the primary before replication flushes would propagate the mutation. The HMAC chain approach has no replication dependency — it writes synchronously. |

---

## 9. Entities That Need Audit Logging (Priority Order)

| Entity | Priority | Reason | Action Types |
|---|---|---|---|
| `attendance_records` | P0 | Direct dispute surface — "I wasn't there" | `created` |
| `patrol_scans` | P0 | Direct dispute surface — "I scanned that checkpoint" | `created` |
| `incidents` | P0 | Legal record — report time, content, GPS | `created`, `status_changed` |
| `incident_status` changes | P0 | SLA compliance evidence — when was it acknowledged/resolved | `status_changed` |
| `shifts` (assignments) | P1 | Guard can dispute "I wasn't rostered" | `created`, `status_changed` |
| `guard_locations` | P1 | GPS trail — proves guard was at location throughout shift | `created` (bulk, see note below) |
| `patrol_scans.method` changes | P2 | Supervisor manually overrides a scan method | `updated` |
| `payroll_records` | P2 | Dispute over pay calculation inputs | `created`, `finalized` |

**Note on `guard_locations`:** These are written every 30 seconds per active guard — potentially thousands per day. Auditing every ping individually in the HMAC chain would significantly slow the chain head lock. Consider a **summarised location audit**: audit the shift start/end events, and for the GPS trail, store a daily Merkle root of all pings for that shift (batch-hash approach).

---

## 10. Verdict — Port the Pattern, Don't Run Rekor/Trillian

### What to Build

**Phase 1 (1 sprint — high defensibility, zero new infra):**

1. Add `audit_log` table to `packages/db/src/schema/auditLog.ts` with the schema above.
2. Add `AUDIT_HMAC_SECRET` environment variable (32+ random bytes, generate with `openssl rand -hex 32`).
3. Implement `apps/api/src/lib/audit.ts` with `appendAuditLog()`.
4. Revoke UPDATE/DELETE on `audit_log` from the application DB role.
5. Wire `appendAuditLog()` into the five P0 routes: attendance POST, patrol_scans POST, incidents POST, incidents PATCH status, shifts PATCH status.
6. Add `GET /api/admin/audit/chain-verify` and `GET /api/admin/audit/log` (platform_admin only).

**Phase 2 (1 sprint — external anchoring):**

1. Implement a cron job (runs every 4 hours) that reads the current chain head hash and submits it to the OTS calendar API. Store the receipt in a dedicated `ots_anchors` table or an S3/MinIO file.
2. Add chain head hash to the `GET /api/health` response so external monitors can detect divergence.

**Phase 3 (optional — evidentiary export):**

1. PDF export of an audit entry: entity snapshot + HMAC proof + OTS receipt.
2. Verification CLI script that any party (client, regulator) can run: `node verify-audit.js --entry-id X --ots-receipt Y`.

### Environment Variable Addition

```bash
# apps/api/.env.example
AUDIT_HMAC_SECRET=<generate with: openssl rand -hex 32>
```

### Migration SQL (run via packages/db migration)

```sql
CREATE TABLE audit_log (
  seq         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id          TEXT NOT NULL,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  actor_id    TEXT,
  actor_role  TEXT,
  payload     JSONB NOT NULL,
  prev_hash   TEXT NOT NULL,
  row_hash    TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ots_receipt TEXT
);

CREATE INDEX audit_log_tenant_idx   ON audit_log(tenant_id);
CREATE INDEX audit_log_entity_idx   ON audit_log(entity_type, entity_id);
CREATE INDEX audit_log_seq_idx      ON audit_log(seq);

-- Enforce append-only at DB level
REVOKE UPDATE, DELETE ON audit_log FROM secureops_app;
```

---

## 11. Concrete Extracts

### HMAC-SHA256 in Node.js (canonical form)

```typescript
import { createHmac } from 'crypto'

function canonicalJsonDeep(val: unknown): string {
  if (val === null || typeof val !== 'object') return JSON.stringify(val)
  if (Array.isArray(val)) return '[' + val.map(canonicalJsonDeep).join(',') + ']'
  const sorted = Object.keys(val as object).sort()
  return '{' + sorted.map(k =>
    JSON.stringify(k) + ':' + canonicalJsonDeep((val as Record<string, unknown>)[k])
  ).join(',') + '}'
}

export function hmacSha256(secret: string, prevHash: string, payload: object): string {
  return createHmac('sha256', secret)
    .update(prevHash)
    .update(canonicalJsonDeep(payload))
    .digest('hex')
}
```

### OTS Submission (Node.js fetch)

```typescript
// Submit a hash to an OTS calendar and store the receipt.
// Run this in a cron job, not on the hot path.
export async function submitToOpenTimestamps(hashHex: string): Promise<string> {
  const hashBytes = Buffer.from(hashHex, 'hex')
  const res = await fetch('https://alice.btc.calendar.opentimestamps.org/digest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: hashBytes,
  })
  if (!res.ok) throw new Error(`OTS calendar error: ${res.status}`)
  const receipt = Buffer.from(await res.arrayBuffer())
  return receipt.toString('base64')  // store as base64 in ots_anchors table
}
```

### Chain Head Inclusion Check

```typescript
// Used to build the evidentiary export for a disputed event.
export async function getAuditProofForEntity(
  tenantId: string,
  entityId: string,
): Promise<{ entries: AuditLogEntry[]; chainHeadHash: string }> {
  const entries = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.entityId, entityId)))
    .orderBy(auditLog.seq)

  const [head] = await db
    .select({ rowHash: auditLog.rowHash })
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(desc(auditLog.seq))
    .limit(1)

  return { entries, chainHeadHash: head?.rowHash ?? 'genesis' }
}
```

---

## 12. Stack & Dependencies

| Component | Package | License | Notes |
|---|---|---|---|
| HMAC | Node.js built-in `crypto` | N/A | No new dependency |
| Drizzle ORM | Already in stack | Apache 2.0 | Schema extension only |
| PostgreSQL | Already in stack | PostgreSQL License | Permission grants required |
| Canonical JSON (deep) | Inline (see above) or `canonical-json` (npm) | MIT | Tiny implementation |
| OpenTimestamps client | `javascript-opentimestamps` (npm) or raw HTTP | MIT | Only needed for Phase 2 |

No new databases. No new services. No paid services.

---

## 13. Open Questions for Synthesis

1. **Key management:** Where does `AUDIT_HMAC_SECRET` live in production? If deploying to Render, use a Render Secret. If moving to Kubernetes later, use a sealed secret or Vault. The answer affects how resistant the system is to a compromised operator.

2. **Guard location volume:** Do we audit every GPS ping (potentially 1,440 rows/guard/day at 30s intervals) or just the shift start/end + a daily Merkle root of all pings? The latter is far more scalable and still produces proof that the location trail is unaltered.

3. **Per-tenant sub-chains vs. global chain:** A single global chain serialises all writes. Per-tenant sub-chains run in parallel, each verified independently. For a single-tenant MVP, a single chain is fine. For multi-tenant scale, per-tenant chains are preferable.

4. **Chain verification schedule:** Who runs `verifyAuditChain()` and how often? Options: (a) nightly cron, (b) on every `GET /health` call (expensive), (c) on-demand by platform_admin. Nightly seems right.

5. **Legal weight of HMAC vs. signed timestamps:** In Indian courts (our target jurisdiction for ESI/PF compliance), what evidentiary standard applies to a cryptographic audit log? The HMAC chain proves internal consistency; the OTS receipt proves external time. Is this sufficient for a labour tribunal dispute, or do we need a notarised timestamp service (e.g. a qualified Trust Service Provider under eIDAS-equivalent Indian law)?

6. **Incident photo hashing:** Once MinIO is integrated for selfie/incident-photo storage, should the audit log entry include `SHA-256(photo_bytes)` or just the MinIO object URL? Including the hash is strictly better — it proves the photo has not been replaced in MinIO. This requires hashing before MinIO upload and storing the hash in the audit row.

7. **Drizzle `generatedAlwaysAsIdentity`:** At the time of writing, Drizzle ORM's support for `GENERATED ALWAYS AS IDENTITY` columns (as opposed to `serial`) is in progress. If not yet available, use `serial()` for the `seq` column — the behavioural difference for our use case is negligible.
