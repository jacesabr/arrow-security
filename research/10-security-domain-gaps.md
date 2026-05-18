# Investigation 10: Security Domain Gaps — OSS Landscape

**Date:** 2026-05-17  
**Stack:** Fastify 4 + TypeScript, PostgreSQL + Drizzle ORM, Next.js 16, Ionic/Capacitor PWA  
**Scope:** Seven security-specific feature domains where the platform has gaps or stubs

---

## Summary

The security guard software domain is dominated by commercial SaaS products (QR-Patrol, TrackTik, PatrolTech, Trackforce Valiant). **No single mature open-source guard operations platform exists.** Individual domain libraries and lightweight OSS tools exist for sub-problems (offline sync, form building, GPS ingest), but domain-specific reference implementations must be assembled from commercial product feature analysis plus general OSS building blocks.

Verdict by urgency for Arrow Security:

| Domain | OSS situation | Recommendation |
|--------|--------------|----------------|
| Guard patrol tour management | Near-zero OSS | Build — borrow schema concepts from commercial docs |
| NFC/QR checkpoint scanning | OSS NFC toolkit only; QR already in-app | Extend existing code |
| Incident reporting (photo + GPS) | InformaCam pattern; no prod-ready lib | Build with J3M metadata pattern |
| Panic button / lone worker | Archived Amnesty app; no active OSS | Build lightweight in-app |
| Client portal | Generic dashboard OSS; nothing guard-specific | Build on existing Next.js pages |
| GPS fleet tracking | OwnTracks Recorder (1.2k stars, active); Traccar covered separately | Reference OwnTracks for API shape |
| Visitor management | neozhu/visitormanagement (407 stars, C#/Blazor) | Build lightweight version in-stack |

---

## 1. Guard Patrol Tour Management

### OSS landscape

- **GitHub topic `guard-tour`:** Zero repositories. The topic exists but is empty as of May 2026.
- **hugginssd/Monitoring-App:** 2 stars, 8 commits, Java/Gradle, no readme, abandoned. Not usable.
- **lahssiki/SGMS-LARAVEL:** 6 stars, 12 commits, Laravel/PHP/MySQL. Only covers guard scheduling and shift assignment (Morning/Night). No patrol or checkpoint features.
- **Commercial reference:** QR-Patrol, PatrolTech, TrackTik, Trackforce Valiant — all proprietary SaaS. Feature documentation is publicly available and useful for schema design.

### Data model to borrow (from commercial product analysis)

```
patrol_routes          id, site_id, name, description, estimated_duration_min
route_checkpoints      id, route_id, checkpoint_id, sequence, required (bool)
patrol_sessions        id, guard_id, route_id, shift_id, started_at, completed_at, status
                       (status: in_progress | completed | missed | abandoned)
checkpoint_scans       id, session_id, checkpoint_id, scanned_at, method (qr|nfc|manual|gps),
                       lat, lng, accuracy, photo_url, notes
patrol_exceptions      id, session_id, checkpoint_id, reason, reported_at
```

Note: our existing `patrols` and `patrol_scans` tables cover the session and scan layers. What is missing is `patrol_routes` (ordered templates) and `patrol_exceptions` (missed checkpoint reporting).

### API surface

```
GET  /patrol/routes              — list route templates for site
POST /patrol/routes              — create route with ordered checkpoints
GET  /patrol/routes/:id          — route detail with checkpoint sequence
POST /patrol/start               — start session against a route
POST /patrol/:id/scan            — record checkpoint scan (already exists)
POST /patrol/:id/exception       — report missed checkpoint with reason
PATCH /patrol/:id/complete        — mark done (already exists)
GET  /patrol/sessions            — history with completion rates
GET  /patrol/sessions/:id/report — full ordered scan timeline
```

### Algorithms

- **Missed checkpoint detection:** Cron or shift-end trigger walks `route_checkpoints` for the session and flags any without a matching `checkpoint_scans` row within a time window.
- **Compliance rate:** `completed_checkpoints / total_required_checkpoints * 100` per session, rolled up weekly per guard or site.
- **Ordered sequence enforcement:** Optional — enforce that checkpoints are scanned in order with a `sequence` validation at scan time.

### Verdict

**Build.** No OSS reference implementation is useful. Schema design should follow the route-template → session → scan hierarchy used by every commercial product in this space. The core logic is two SQL joins and a cron job.

---

## 2. NFC / QR Checkpoint Scanning

### OSS landscape

- **nfcgate/nfcgate** (GitHub: `nfcgate/nfcgate`): NFC research toolkit for Android. Used for relay attacks and protocol analysis — not a guard checkpoint app. GPL-3.0. Active (last commit 2024). **Reference only, do not integrate.**
- **Commercial apps:** QR-Patrol, PatrolTech, GuardMetrics all support QR + NFC + GPS proximity as checkpoint methods. No OSS equivalent exists.
- **NFCjLib / TapLinx (NXP):** Android NFC reading libraries. MIT/commercial. Low-level NDEF reading — not guard-specific.

### What is already in the app

The mobile app (`apps/mobile/src/components/QrScannerModal.tsx`) has working QR scan. The `checkpoints` table has `nfcTagId` field (stub). The gap is the NFC read path and the `method` tracking on scans.

### NFC implementation approach

Capacitor has a community NFC plugin: `@capacitor-community/nfc`. It wraps Android's `NfcAdapter` and iOS Core NFC. The plugin reads NDEF tags and returns the tag ID. For guard use, the flow is:

1. Guard taps phone to NFC sticker on checkpoint post.
2. Plugin fires `nfcTagScanned` event with `tagId` (hex string).
3. App POSTs `{ checkpointId, method: "nfc", nfcTagId }` to `/patrol/:id/scan`.
4. API validates `nfcTagId` matches `checkpoints.nfcTagId`.

### Data model addition

No schema changes needed — `patrol_scans.method` enum should add `nfc` alongside `qr | manual | gps`.

### Verdict

**Extend existing code.** Add `@capacitor-community/nfc` to mobile. Add NFC scan path alongside the existing QR modal. No OSS project to borrow from.

---

## 3. Incident Reporting — Photo + GPS + Chain of Custody

### OSS landscape

- **guardianproject/CameraV + InformaCore** (GitHub: `guardianproject/CameraV`): Android app that captures photos/video with embedded sensor metadata (GPS, WiFi networks, Bluetooth, accelerometers, cellular towers, camera sensor fingerprint). Signs media with PGP. Open-source and freely licensed (project says "freely licensed" — check LICENSE file for exact terms). **Last meaningful activity: ~2020.** Abandoned for active development but the J3M metadata spec is valuable.
- **Call-for-Code/Incident-Accuracy-Reporting-System** (GitHub: `Call-for-Code-for-Racial-Justice/Incident-Accuracy-Reporting-System`): IBM-backed civic reporting app. JavaScript, evidence submission with images/video. Not guard-specific. Active through 2023.
- **GitHub topic `chain-of-custody`:** Sparse — mostly cybersecurity digital forensics tools, not physical evidence.

### J3M metadata pattern (borrow this)

InformaCam's JSON Mobile Media Metadata (J3M) format is the best reference for tamper-evident incident photos:

```json
{
  "captured_at": 1716000000,
  "location": { "lat": 28.6139, "lng": 77.2090, "accuracy": 8.5 },
  "device_id": "<sha256 of device fingerprint>",
  "network_context": {
    "wifi_bssids": ["aa:bb:cc:dd:ee:ff"],
    "cell_tower_id": "404-20-1234-5678"
  },
  "media_hash": "<sha256 of image bytes>",
  "signed_by": "<guard user id>"
}
```

For Arrow Security, a simplified version without PGP is practical:

```sql
-- Add to incidents table or as separate evidence table:
incident_evidence   id, incident_id, guard_id, captured_at,
                    lat, lng, gps_accuracy,
                    file_url, file_hash (sha256),
                    device_id, mime_type, notes,
                    created_at
```

### API surface

```
POST /incidents/:id/evidence       — upload photo + metadata
GET  /incidents/:id/evidence       — list evidence for incident
GET  /incidents/:id/evidence/:eid  — single evidence item with chain
```

### Algorithms / techniques

- **SHA-256 file hash at upload time:** Hash the binary before writing to MinIO. Store hash with the record. Any subsequent retrieval can re-hash to verify integrity.
- **Device ID:** Generate a stable device fingerprint in the mobile app (Capacitor Device plugin → `Device.getId()`). Embed in every evidence upload.
- **Offline queue:** Evidence uploads should queue in IndexedDB when offline (Dexie.js) and flush on reconnect using Background Sync API.

### Verdict

**Build, borrow the J3M concept.** The pattern (GPS + device fingerprint + file hash + timestamp) is the key contribution from InformaCam. No library integration required — implement hash-at-upload in the API route and store simplified J3M fields in the evidence table.

---

## 4. Panic Button / Lone Worker Safety

### OSS landscape

- **PanicInitiative/PanicButton** (GitHub: `PanicInitiative/PanicButton`): Amnesty International project. Android (Java), GPL-3.0. Activates via rapid power-button press → SMS to pre-configured contacts + GPS location. **Archived March 2020. 202 stars.** Not maintained, targets Android 2.3.
- **kartikdoye/Panicsafe** (GitHub: `kartikdoye/Panicsafe`): Personal safety app concept. Very few stars, not production-ready.
- **GitHub topic `panic-button`:** Small number of hobby projects. None production-ready for enterprise guard use.
- **Commercial:** SequriX, EcoOnline, OKA Lone Worker — all SaaS with hardware buttons + DECT/cellular fallback. Not open-source.

### Feature set needed for Arrow Security

Commercial lone worker products define the standard feature set:

1. **SOS button** — large in-app button that fires an alert when held 3 seconds
2. **Man-down / no-motion detection** — accelerometer-based; alert if no movement for N minutes during an active shift
3. **Timed check-in** — guard must acknowledge a prompt every X minutes; missed acknowledgement escalates to supervisor
4. **Alert escalation chain** — guard → supervisor → on-call admin → emergency services (configurable)
5. **Alert room / dashboard** — real-time supervisor view of active alerts with guard location

### Data model

```sql
alert_events    id, tenant_id, guard_id, shift_id,
                type (sos | man_down | missed_checkin),
                lat, lng, accuracy,
                triggered_at, acknowledged_at, resolved_at,
                acknowledged_by (user_id), notes, status
                (status: active | acknowledged | resolved | false_alarm)

checkin_schedules  id, shift_id, interval_minutes, last_ping_at, next_due_at
```

### API surface

```
POST /alerts                        — trigger SOS/alert from mobile
GET  /alerts                        — active alerts for tenant (supervisor)
PATCH /alerts/:id/acknowledge       — supervisor acknowledges
PATCH /alerts/:id/resolve           — close alert
GET  /alerts/history                — audit trail
POST /alerts/checkin                — lone worker timer ping
GET  /locations/live                — already exists (SSE), add alert markers
```

### Mobile implementation

- SOS button: `onLongPress` handler in Ionic, fires POST, locks screen to alert UI until acknowledged.
- Man-down: Capacitor Motion plugin polls accelerometer. If delta < threshold for > N minutes during active shift, triggers alert.
- Missed check-in: Capacitor Local Notifications schedules a prompt; if dismissed without confirmation, auto-fires alert.

### Verdict

**Build from scratch.** The Amnesty PanicButton project is archived and Android-only. The concept is simple — a POST endpoint + SSE push to supervisors. The complexity is in the escalation chain logic and the man-down accelerometer heuristic. Prioritise SOS + missed check-in first; man-down detection is phase 2.

---

## 5. Client Portal

### OSS landscape

- **HenryCooperBBS/Client-Portal** (GitHub): Generic client portal scaffold. No security-guard domain knowledge. Not useful.
- **agit8or1/clientst0r** (GitHub): MSP IT service desk with customer portal. Django/MariaDB. Irrelevant domain.
- **GitHub topic `client-portal`:** No security-guard-specific results. General admin dashboards only.
- **No OSS** exists for a guard-company client portal showing patrol activity, incident reports, and site attendance to end-clients.

### What client companies need (from commercial product analysis)

- Live map showing guards currently on their site
- Patrol completion reports (checkpoint compliance %)
- Incident log filtered to their sites (status, photos if permitted)
- Guard attendance / coverage gaps
- Export (PDF report, CSV)
- Read-only — no editing

### Multi-tenancy model extension needed

The current model: `tenants` → Arrow Security only. Client companies are stored in the `clients` table with no auth. The client portal requires:

```sql
client_users    id, tenant_id, client_id, email, password_hash,
                role (client_viewer), created_at, last_login_at
```

JWT payload extension: add `clientId` alongside `tenantId` for client_viewer role. All queries additionally filter by `siteId IN (sites belonging to client)`.

### API surface (new read-only routes)

```
POST /auth/client-login            — separate login flow for client users
GET  /client/sites                 — client's sites only
GET  /client/sites/:id/guards      — guards currently on site (live)
GET  /client/patrol/sessions       — patrol history for client's sites
GET  /client/incidents             — incidents at client's sites
GET  /client/shifts                — shift coverage for client's sites
GET  /client/reports/weekly        — weekly PDF/JSON summary
```

### Frontend

A separate Next.js app (`apps/client/`) or a route group within `apps/tenant/` behind client auth. The Operations Portal already has the map, incidents, and patrols pages — the client portal is a read-only, narrowed view of those same pages.

### Verdict

**Build.** No OSS to borrow. This is a role + route-filter addition to the existing API and a new frontend app (or sub-layout). Highest value for Arrow Security's commercial proposition — clients paying for guard services want visibility.

---

## 6. GPS Fleet Tracking for Guards

### OSS landscape

- **OwnTracks Recorder** (GitHub: `owntracks/recorder`): 1.2k stars, 1,257 commits, last release v1.0.1 August 2025. Actively maintained. C program. Accepts JSON location payloads via MQTT or HTTP POST. Stores in flat files. REST API: `/api/0/last`, `/api/0/locations`, `/pub`. WebSocket for live updates. **License: GPL-2.0.**
- **OwnTracks apps** (GitHub: `owntracks/owntracks`): iOS + Android clients. MIT. MQTT/HTTP transport, publishes `{ lat, lon, tst, acc, alt, vel }`.
- **OpenGTS:** Java-based, legacy, oriented to vehicle OBD devices. Not useful for guard mobile.
- **Traccar:** Covered in Investigation 12. Most mature OSS fleet tracker. 25k+ stars.

### OwnTracks location payload (borrow this format)

```json
{
  "_type": "location",
  "lat": 28.6139,
  "lon": 77.2090,
  "tst": 1716000000,
  "acc": 12,
  "alt": 220,
  "vel": 3,
  "batt": 78,
  "tid": "guard-short-id"
}
```

Our `guard_locations` table already stores `{ latitude, longitude, accuracy, shiftId }`. Additions worth borrowing from OwnTracks:

- `battery_level` — useful for detecting guards whose phones are about to die mid-shift
- `altitude` — useful for multi-floor buildings
- `velocity` — flag unusually fast movement (guard in a vehicle vs on foot)

### What we already have

`POST /api/locations` accepts GPS pings. `GET /api/locations/live` is SSE for real-time. `GET /api/locations/history` returns trail. This covers the core use case. No need to run OwnTracks Recorder — our API is the recorder.

### Verdict

**Reference only.** OwnTracks Recorder is worth studying for the payload format and the last-known-location query pattern. Our implementation is already functionally equivalent and purpose-built for multi-tenant guard operations. Traccar (Investigation 12) is the deeper reference for device protocol compatibility.

---

## 7. Visitor Management

### OSS landscape

- **neozhu/visitormanagement** (GitHub: `neozhu/visitormanagement`): 407 stars. C#/.NET, MudBlazor, SQL Server. Apache-2.0. Last commit December 2024. Features: digital check-in, pre-registration, photo + badge printing, email/SMS notifications, appointment scheduling, e-signature capture. **Well-featured but incompatible stack.**
- **prodstarter/frontdesk** (GitHub): Laravel + Filament PHP. Open-source (license not confirmed in search). Introduced 2024. Digital check-ins, GDPR-compliant visitor records, customizable workflows. **PHP — incompatible stack.**
- **sanjeev662/visitor-management-system-react** (GitHub): React + JavaScript, role-based access for admins/receptionists/guards. 33 stars, last updated May 2024. Lightweight, no backend.
- **hendryanhendri/visitor-app** (GitHub): Next.js + face recognition. November 2025. Niche but interesting face-liveness angle.

### Data model to borrow (from neozhu/visitormanagement feature analysis)

```sql
visitors        id, tenant_id, site_id, first_name, last_name, email, phone,
                company, photo_url, id_document_url,
                purpose_of_visit, host_user_id (guard or staff),
                pre_registered (bool), pre_reg_code,
                expected_at, checked_in_at, checked_out_at,
                badge_number, vehicle_reg,
                created_at

visitor_watchlist   id, tenant_id, name, id_number, reason, added_by, created_at
```

### API surface

```
POST /visitors/preregister         — client or staff pre-registers visitor
GET  /visitors/preregister/:code   — guard app scans QR from pre-reg email
POST /visitors/checkin             — guard logs arrival (with photo optional)
POST /visitors/checkout            — guard logs departure
GET  /visitors                     — current visitors on site (supervisor view)
GET  /visitors/history             — audit log
GET  /visitors/watchlist           — flagged persons list
POST /visitors/watchlist           — add to watchlist
```

### Mobile integration

The Guard App check-in page can add a "Log Visitor" tab. Camera capture for visitor photo already has a pattern from the incident photo work. Pre-registration uses a QR code in the confirmation email — guard scans it with the existing QR scanner.

### Algorithms

- **Watchlist check:** On each new visitor name/ID, fuzzy-match against `visitor_watchlist` (pg_trgm for trigram similarity). Alert if similarity > 0.85.
- **Overstay alert:** Background job checks `checked_in_at` vs `expected_at + buffer`; fires supervisor notification if visitor not checked out.

### Verdict

**Build a lightweight version.** neozhu/visitormanagement has the right features but is C#/SQL Server — cannot directly reuse. prodstarter/frontdesk is PHP. Neither integrates into the Fastify/TypeScript stack. Use the feature list and schema design as the reference; build `visitors` and `visitor_watchlist` tables. The visitor module is lower priority than panic button and client portal but is a differentiator for sites with active lobby traffic.

---

## Stack & Dependencies

### Libraries to add

| Purpose | Library | License | Notes |
|---------|---------|---------|-------|
| NFC reading (mobile) | `@capacitor-community/nfc` | MIT | Wraps Android NfcAdapter + iOS Core NFC |
| Offline queue (mobile) | `dexie` (already likely present or add) | Apache-2.0 | IndexedDB wrapper; queue GPS pings + evidence uploads |
| Background Sync (mobile) | Browser BackgroundSync API (native PWA) | — | No extra lib; register sync tag after queuing |
| Form schema (dynamic checklists) | `survey-core` (SurveyJS) | MIT (core only) | JSON schema → rendered form; useful for patrol exception forms |
| Fuzzy match (visitor watchlist) | PostgreSQL `pg_trgm` extension | PostgreSQL License | `CREATE EXTENSION pg_trgm;` + GiST index |
| File hashing (evidence) | Node.js `crypto` (built-in) | — | SHA-256 of upload stream before S3 write |
| Motion detection (man-down) | `@capacitor/motion` | MIT | Capacitor official plugin |
| Push for alerts | `@capacitor/push-notifications` | MIT | FCM token already in schema |

---

## Data Model — Consolidated Additions

```sql
-- Patrol routes (template layer missing from current schema)
patrol_routes          id TEXT PK, tenant_id, site_id, name, description,
                       estimated_duration_min INT, active BOOL, created_at

route_checkpoints      id TEXT PK, route_id, checkpoint_id, sequence INT,
                       required BOOL DEFAULT true

-- Alert / lone worker
alert_events           id TEXT PK, tenant_id, guard_id, shift_id,
                       type TEXT,   -- sos | man_down | missed_checkin
                       lat REAL, lng REAL, gps_accuracy REAL,
                       triggered_at TIMESTAMPTZ, acknowledged_at TIMESTAMPTZ,
                       resolved_at TIMESTAMPTZ, acknowledged_by TEXT,
                       status TEXT, notes TEXT

checkin_schedules      id TEXT PK, shift_id, interval_minutes INT,
                       last_ping_at TIMESTAMPTZ, next_due_at TIMESTAMPTZ

-- Incident evidence (chain of custody)
incident_evidence      id TEXT PK, incident_id, guard_id,
                       captured_at TIMESTAMPTZ,
                       lat REAL, lng REAL, gps_accuracy REAL,
                       file_url TEXT, file_hash TEXT,   -- SHA-256
                       device_id TEXT, mime_type TEXT, notes TEXT, created_at

-- Client portal auth
client_users           id TEXT PK, tenant_id, client_id,
                       email TEXT UNIQUE, password_hash TEXT,
                       role TEXT DEFAULT 'client_viewer',
                       created_at, last_login_at

-- Visitor management
visitors               id TEXT PK, tenant_id, site_id,
                       first_name TEXT, last_name TEXT,
                       email TEXT, phone TEXT, company TEXT,
                       photo_url TEXT, id_document_url TEXT,
                       purpose_of_visit TEXT, host_user_id TEXT,
                       pre_registered BOOL, pre_reg_code TEXT,
                       expected_at TIMESTAMPTZ,
                       checked_in_at TIMESTAMPTZ, checked_out_at TIMESTAMPTZ,
                       badge_number TEXT, vehicle_reg TEXT, created_at

visitor_watchlist      id TEXT PK, tenant_id, name TEXT,
                       id_number TEXT, reason TEXT,
                       added_by TEXT, created_at

-- Guard location additions (OwnTracks-inspired)
-- ALTER existing guard_locations to add:
-- battery_level INT, altitude REAL, velocity REAL
```

---

## API / Interface Surface — Priority Order

### Phase 1 (highest impact, build first)
1. `POST /alerts` + `GET /alerts` (SSE push) — panic/SOS
2. `POST /alerts/checkin` — lone worker timer ping
3. `PATCH /alerts/:id/acknowledge` + `resolve`
4. `POST /patrol/routes` + `GET /patrol/routes` — route templates
5. `POST /incidents/:id/evidence` — photo upload with hash

### Phase 2
6. `POST /auth/client-login` + all `/client/*` routes
7. `POST /visitors/checkin` + `checkout` + `GET /visitors`
8. NFC scan path in mobile (`@capacitor-community/nfc`)

### Phase 3
9. `POST /patrol/:id/exception` — missed checkpoint reporting
10. Man-down accelerometer detection (mobile)
11. `GET /client/reports/weekly` — PDF generation

---

## Algorithms / Techniques Worth Borrowing

1. **J3M chain-of-custody metadata** (from InformaCam): GPS + device fingerprint + SHA-256 file hash + timestamp. Implement in incident evidence upload without the PGP complexity.

2. **OwnTracks location payload shape**: Add `battery_level`, `altitude`, `velocity` to guard location pings. `velocity > 30 km/h` during a foot-patrol shift is a data quality flag.

3. **Checkpoint compliance rate calculation** (from commercial product analysis): `SUM(completed_required_checkpoints) / SUM(total_required_checkpoints)` grouped by guard and site, computed at session close and stored on the session row for fast reporting.

4. **Overstay detection** (from visitor management products): Postgres `pg_cron` or application-level cron every 5 minutes; `SELECT * FROM visitors WHERE checked_out_at IS NULL AND expected_at + interval '30 minutes' < NOW()`.

5. **Watchlist fuzzy matching** (pg_trgm): `SELECT * FROM visitor_watchlist WHERE similarity(name, $1) > 0.8 ORDER BY similarity(name, $1) DESC`. Add GiST index: `CREATE INDEX ON visitor_watchlist USING gist (name gist_trgm_ops)`.

6. **SOS escalation timer**: On `alert_events` insert, schedule a background job (or use pg_cron) to check if `acknowledged_at IS NULL` after N minutes and escalate to next role in the chain.

7. **Offline queue + Background Sync** (PWA pattern): Dexie.js stores pending POST bodies in IndexedDB. Service worker registers `sync` tag. Background Sync API replays queued requests on reconnect. Critical for patrol scans and evidence uploads in areas with poor signal.

---

## What Is Missing for Arrow Security (Gap Summary)

| Feature | Current state | Gap |
|---------|--------------|-----|
| Patrol route templates | Routes are ad-hoc; no ordered template | `patrol_routes` + `route_checkpoints` tables and API |
| NFC checkpoint scanning | Schema field exists, not wired | `@capacitor-community/nfc` plugin + scan path |
| Incident photo evidence | No evidence table; MinIO not integrated | `incident_evidence` table + MinIO upload + SHA-256 |
| Panic / SOS button | Not implemented | `alert_events` table + mobile UI + SSE push to supervisor |
| Man-down / lone worker | Not implemented | Accelerometer polling + timed check-in schedule |
| Alert escalation | Not implemented | Escalation chain config + background timer |
| Client portal auth | `clients` table exists; no client login | `client_users` table + separate JWT issuing |
| Client portal UI | Not implemented | Read-only Next.js sub-app or route group |
| Visitor management | Not implemented | Full `visitors` + `visitor_watchlist` tables + API |
| Missed checkpoint reporting | Not implemented | `patrol_exceptions` table + cron check at session close |
| Offline sync | No queuing; requests fail when offline | Dexie.js queue + Background Sync in service worker |
| Battery / velocity in GPS ping | Not captured | Alter `guard_locations` + mobile payload update |

---

## Verdict Per Category

| # | Category | Best OSS Found | License | Last Active | Use it? | Recommendation |
|---|----------|---------------|---------|------------|---------|---------------|
| 1 | Guard patrol tour | None (hugginssd/Monitoring-App useless) | — | Abandoned | No | Build; use commercial product feature docs as spec |
| 2 | NFC/QR checkpoint | nfcgate (research toolkit only) | GPL-3.0 | 2024 | No | Add `@capacitor-community/nfc` plugin to existing QR flow |
| 3 | Incident photo + GPS | guardianproject/CameraV (J3M pattern) | Freely licensed | 2020 (archived) | Pattern only | Build evidence table; borrow J3M metadata concept |
| 4 | Panic button / lone worker | PanicInitiative/PanicButton (archived) | GPL-3.0 | 2020 | No | Build from scratch; simple POST + SSE |
| 5 | Client portal | Nothing guard-specific | — | — | No | Build: role + route-filter on existing API + new frontend |
| 6 | GPS fleet tracking | OwnTracks Recorder (1.2k stars, active) | GPL-2.0 | Aug 2025 | Pattern only | Already have our own; borrow payload shape + battery/velocity fields |
| 7 | Visitor management | neozhu/visitormanagement (407 stars) | Apache-2.0 | Dec 2024 | No (C# stack) | Build lightweight version; use schema as reference |

---

## Concrete Extracts

### OwnTracks location payload (adapt for guard pings)

```typescript
// Current POST /api/locations body
interface GuardLocationPing {
  latitude: number;
  longitude: number;
  accuracy: number;
  shiftId: string;
}

// Recommended extension (OwnTracks-inspired)
interface GuardLocationPing {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;     // metres above sea level
  velocity?: number;     // km/h — flag if > 30 during foot patrol
  batteryLevel?: number; // 0–100; alert supervisor if < 10 during shift
  shiftId: string;
}
```

### Incident evidence upload (J3M-inspired)

```typescript
// POST /incidents/:id/evidence — multipart form
// API handler pseudocode
const bytes = await request.file();
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const url = await uploadToMinIO(`evidence/${incidentId}/${evidenceId}`, bytes);
await db.insert(incidentEvidence).values({
  id: createId(),
  incidentId,
  guardId: payload.sub,
  capturedAt: new Date(body.capturedAt),
  lat: body.lat, lng: body.lng, gpsAccuracy: body.gpsAccuracy,
  fileUrl: url,
  fileHash: hash,       // chain of custody — hash stored at write time
  deviceId: body.deviceId,
  mimeType: bytes.mimetype,
  notes: body.notes,
});
```

### Panic button SOS escalation (pseudocode)

```typescript
// POST /alerts  — fired by mobile SOS hold
await db.insert(alertEvents).values({
  id: createId(),
  tenantId: payload.tenantId,
  guardId: payload.sub,
  shiftId: body.shiftId,
  type: 'sos',
  lat: body.lat, lng: body.lng, gpsAccuracy: body.gpsAccuracy,
  triggeredAt: new Date(),
  status: 'active',
});
// Fan out to all supervisor SSE connections for tenantId (same in-memory map as guard_locations)
broadcastToSupervisors(payload.tenantId, { type: 'sos_alert', guardId: payload.sub, lat, lng });
// Schedule escalation: if not acknowledged in 5 min, notify tenant_admin
scheduleEscalation(alertId, 5 * 60 * 1000);
```

### Watchlist fuzzy match (PostgreSQL)

```sql
-- Enable extension (once)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX visitor_watchlist_name_trgm ON visitor_watchlist
  USING gist (name gist_trgm_ops);

-- Query at visitor check-in
SELECT id, name, reason, similarity(name, $1) AS score
FROM visitor_watchlist
WHERE tenant_id = $2
  AND similarity(name, $1) > 0.75
ORDER BY score DESC
LIMIT 5;
```

---

## Open Questions for Synthesis

1. **Priority vs backlog:** Panic button and client portal have immediate commercial value. Visitor management is differentiating but lower urgency. Which ships in the next sprint?

2. **NFC hardware availability:** Guards in the field need Android phones with NFC enabled (most mid-range Androids have it). Is NFC confirmed as available on the target device fleet, or should GPS proximity serve as the fallback checkpoint method?

3. **MinIO integration readiness:** Incident evidence uploads require MinIO to be integrated (currently stubbed). Should the evidence table be built now with `file_url` pointing to a placeholder, or wait until MinIO is wired?

4. **Client portal: separate app vs sub-layout?** A separate Next.js app (`apps/client/`) gives independent deployment and branding. A sub-layout in `apps/tenant/` is faster to build. Arrow Security's white-labelling roadmap should decide this.

5. **Man-down threshold calibration:** What accelerometer magnitude delta counts as "no movement"? Thresholds vary by body position (standing vs sitting). Commercial products use 3-minute no-motion windows. Needs field testing.

6. **Alert escalation chain storage:** Is the escalation chain (guard → supervisor → admin → external number) stored per-site, per-tenant, or per-shift? This affects the data model for `alert_events`.

7. **Offline sync scope:** Which actions must work offline? Minimum viable: patrol scans + incident creation. Evidence photo upload can require connectivity. Define the offline contract before implementing the Dexie queue.

8. **Visitor photo storage:** Visitor photos have GDPR/privacy implications. Should they be stored in MinIO with a retention policy (auto-delete after N days), or kept permanently for audit purposes?
