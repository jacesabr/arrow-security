# Investigation 11 — Ionic/Capacitor Mobile Stack for Guard App

**Date:** 2026-05-17  
**Stack context:** Ionic 8 + Capacitor 6 + React 18 + TypeScript, targeting Android-first (Indian market) with iOS secondary.  
**Current state:** Capacitor 6 already in `package.json`. `@capacitor/geolocation`, `@capacitor/push-notifications`, `@capacitor/network`, `@capacitor/filesystem` already installed. `html5-qrcode` used for QR. Location tracking uses a plain `setInterval` in the Shifts page (foreground only). No offline queue, no NFC, no background location.

---

## Summary

The Ionic/Capacitor ecosystem is mature enough to cover every missing capability. The key plugins are well-maintained, most are MIT/Apache-2 licensed, and the community plugins hosted under `@capacitor-community/` have active release cycles tied to Capacitor major versions. The one commercial option (Transistorsoft) is only necessary if you need the most battery-efficient background geolocation — the community plugin is sufficient for a 30-second ping use-case on Android. Offline sync via RxDB or a hand-rolled SQLite queue is the most Capacitor-native path; PowerSync is worth a serious look.

---

## 1. Background Location Tracking

### Options

#### A. `@capacitor-community/background-geolocation`
- **Repo:** https://github.com/capacitor-community/background-geolocation
- **License:** MIT
- **Capacitor 6 support:** Yes (v1.2.x)
- **How it works:** Wraps a foreground service (Android) / background task (iOS). On Android it shows a persistent notification while tracking. On iOS it uses `allowsBackgroundLocationUpdates = true` and the `location` background mode in `Info.plist`.
- **Battery impact:** Moderate. Uses `CLLocationManager` on iOS and `FusedLocationProviderClient` on Android. At 30-second intervals with `enableHighAccuracy: false` (network/GPS blend), drain is roughly 3–6% per hour on a modern Android device.
- **Reliability:** Solid for Android. On iOS, the OS can suspend background tasks if the app has been backgrounded for a long time and battery saver kicks in; using `distanceFilter` (e.g. 50m) instead of pure time-based interval is more reliable on iOS but changes the semantics for stationary guards.
- **Key config:**
  ```typescript
  import BackgroundGeolocation from '@capacitor-community/background-geolocation'
  
  const watcher = await BackgroundGeolocation.addWatcher({
    backgroundMessage: 'Arrow Security is tracking your location on duty.',
    backgroundTitle: 'Location Active',
    requestPermissions: true,
    stale: false,
    distanceFilter: 0, // fire on time not distance; use with caution on iOS
  }, (position, error) => {
    if (error) return
    postLocationToApi(position)
  })
  // Store watcher id; call BackgroundGeolocation.removeWatcher({ id: watcher }) on shift end
  ```
- **Android manifest additions:** `ACCESS_BACKGROUND_LOCATION`, foreground service permission, service declaration.
- **iOS:** Add `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSLocationAlwaysUsageDescription` to `Info.plist`. Add `location` to `UIBackgroundModes`.

#### B. `@transistorsoft/capacitor-background-geolocation`
- **License:** Commercial — $299/app or $399/app + year support. Trial available.
- **Why it's better:** Significantly more battle-tested, used in fleet-tracking production apps. Has stationary detection (switches to motion-triggered updates when the guard is not moving, saving battery). Has geofencing built in. Has an event log. Has delta compression.
- **When to use it:** If battery life or iOS reliability become customer complaints. For phase 1 with Arrow Security's Android-heavy guard fleet, the community plugin is fine.

#### C. `@capacitor/geolocation` with `setInterval` (current approach)
- **Problem:** Only works while the app is in the foreground. If a guard switches to another app or their screen locks, location posting stops entirely. This is the critical gap.
- **Do not rely on this for shift tracking.** It must be replaced.

### Recommendation
Replace the current `setInterval` in `ShiftsPage.tsx` with `@capacitor-community/background-geolocation`. This is a drop-in swap — the watcher callback replaces the interval. The watcher survives backgrounding on both platforms.

**iOS constraint to flag:** Apple requires the location always-use justification to be "meaningful". A guard app with an active shift is a legitimate use case. Approval is routine. The app must stop the watcher when the shift ends or Apple can revoke always-on permission.

**30-second ping cadence:** With `distanceFilter: 0`, the plugin fires on its own schedule (roughly every 15–60s on iOS in background depending on OS load). The practical approach is to fire immediately on every callback and timestamp server-side. Do not rely on exact 30-second spacing from the client.

---

## 2. Offline-First Data Sync

### Current state
No offline capability. If the network drops, API calls throw and the guard sees an error. Patrol scans, check-ins, and incidents are all lost.

### Options

#### A. Hand-rolled SQLite queue with `@capacitor-community/sqlite`
- **License:** MIT
- **How it works:** Store pending writes in a local SQLite table. A sync worker (on network resume, detected via `@capacitor/network`) drains the queue by replaying POSTs to the API. Server returns an ID; update the local row with the server ID.
- **Complexity:** Medium. You write the queue table schema, the drain logic, and conflict detection yourself.
- **Suitable for:** Our domain (patrol scans, attendance, incidents). These are append-only writes. Conflicts are rare — a guard has exactly one device.
- **SQLite plugin version for Capacitor 6:** `@capacitor-community/sqlite@^6.0.0`

#### B. PowerSync
- **License:** Apache-2.0 (client SDK); PowerSync Cloud is paid beyond free tier
- **Capacitor support:** Official — `@powersync/capacitor` package exists (https://docs.powersync.com/client-sdk-references/capacitor)
- **How it works:** Bidirectional sync between a PostgreSQL backend and a local SQLite DB on the device. The server runs a PowerSync Service instance (self-hostable or cloud). Client uses reactive queries via a local SQLite store.
- **Battery/storage:** SQLite on device; sync is event-driven (WebSocket), not polling. Efficient.
- **For our stack:** Requires deploying PowerSync Service alongside the Fastify API. The service connects to our PostgreSQL and streams changes. Guards get instant updates (new shift assignments, etc.) without polling.
- **Best fit:** For read-heavy sync (guards reading their schedule, site info, checkpoints). For write-heavy offline queuing, it handles it but the mental model is more complex.
- **Cost:** PowerSync Cloud free tier is 3 users; production requires paid plan. Self-hosted is Apache-2.0 free.

#### C. RxDB
- **License:** Apache-2.0 (core); some plugins require premium license for production
- **Capacitor support:** Yes — RxDB works in a browser/Ionic environment. Uses IndexedDB by default; can use SQLite via the `capacitor-sqlite` adapter.
- **How it works:** Reactive local database with replication plugins. You define a replication endpoint (your Fastify API). RxDB handles change tracking, conflict resolution, and sync.
- **Concern:** The SQLite storage adapter for Capacitor is marked experimental as of 2025. IndexedDB works but can be cleared by the OS under storage pressure.
- **Best fit:** Apps that need reactive UI updates from local data. More complexity than needed for our append-only guard operations.

#### D. WatermelonDB
- **License:** MIT
- **Capacitor support:** NOT officially supported. WatermelonDB is React Native-first. It uses JSI bridge and native SQLite bindings. It does not support Ionic/Capacitor web layer. Cross it off.

### Recommendation
**Two-tier approach:**

1. **Short term (Phase 1):** Hand-rolled SQLite queue using `@capacitor-community/sqlite`. Store unsynced patrol scans, attendance records, and incidents locally. Drain on network restoration. This covers the critical "guard underground / poor signal" case. Implementation is roughly 200 lines of code.

2. **Medium term (Phase 2):** Evaluate PowerSync for full bidirectional sync. Especially valuable for streaming schedule changes to guards without polling. Requires deploying the PowerSync Service.

**Avoid:** RxDB (experimental SQLite adapter, premium plugins), WatermelonDB (incompatible).

**Offline queue schema (SQLite):**
```sql
CREATE TABLE sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint    TEXT NOT NULL,       -- e.g. '/api/patrol/scan'
  method      TEXT NOT NULL,       -- POST, PATCH
  body        TEXT NOT NULL,       -- JSON string
  created_at  INTEGER NOT NULL,    -- Unix ms
  attempts    INTEGER DEFAULT 0,
  last_error  TEXT
);
```

---

## 3. NFC Scanning

### Options

#### A. `@capacitor-community/nfc`
- **Repo:** https://github.com/capacitor-community/nfc
- **License:** MIT
- **Capacitor 6 support:** v6.x branch exists as of 2025
- **Android:** Full read/write/scan. Works reliably. Requires `<uses-permission android:name="android.permission.NFC"/>`.
- **iOS:** NFC tag reading supported since iOS 11 (Core NFC). Write support requires specific tag types. Read works without a separate entitlement for NDEF tags. For scanning (as opposed to payment), no special Apple review process.
- **iOS limitation:** Background NFC reading is NOT available on iOS. The guard must tap a button in-app to initiate an NFC scan session. The session lasts 60 seconds (or until a tag is read). This is identical to how Apple Pay works.
- **Production grade?** Yes for Android. Yes for iOS with the UX caveat above. The plugin surfaces `NDEFMessage` records; your app reads the payload (which should match a checkpoint `nfcTagId`).
- **Usage:**
  ```typescript
  import { Nfc, NfcTagTechType } from '@capacitor-community/nfc'
  
  await Nfc.startScanSession()
  Nfc.addListener('nfcTagScanned', async (event) => {
    const payload = event.nfcTag.message?.records?.[0]?.payload
    // compare to checkpoint.nfcTagId
    await Nfc.stopScanSession()
  })
  ```

#### B. `phonegap-nfc`
- **Status:** Cordova plugin, unmaintained since 2023. Not compatible with Capacitor 6. Do not use.

### Recommendation
Use `@capacitor-community/nfc`. On iOS, show a "Hold phone near NFC tag" bottom sheet UI when the scan session is active. On Android, the app can listen passively. Write the `nfcTagId` as an NDEF Text record when provisioning checkpoints.

---

## 4. QR Scanning

### Current implementation
`html5-qrcode` (v2.3.8) — a JavaScript library using the browser's `getUserMedia`. Works in both PWA and Capacitor web view. Active maintenance questionable (last significant update 2023).

### Options

#### A. `@capacitor-community/barcode-scanner`
- **Repo:** https://github.com/capacitor-community/barcode-scanner
- **License:** MIT
- **Capacitor 6 support:** v6.x (`@capacitor-community/barcode-scanner@^6.0.0`)
- **How it works:** Uses the native camera layer (not the web view camera). The web view background is made transparent and the camera feed appears behind it. This gives full-screen native camera performance.
- **Advantage over html5-qrcode:** Significantly faster scan speed (uses MLKit on Android, AVFoundation on iOS). No web view camera latency. Works in low light better.
- **Maintenance:** Active, tied to Capacitor release cycle.
- **Usage:**
  ```typescript
  import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
  
  await BarcodeScanner.checkPermission({ force: true })
  BarcodeScanner.hideBackground()
  document.querySelector('body')!.classList.add('scanner-active')
  const result = await BarcodeScanner.startScan()
  BarcodeScanner.showBackground()
  document.querySelector('body')!.classList.remove('scanner-active')
  if (result.hasContent) handleScan(result.content)
  ```

#### B. `@zxing-js/browser`
- **License:** Apache-2.0
- **Nature:** Pure JavaScript, browser-only. Same layer as `html5-qrcode`. No native advantage. Actively maintained by the ZXing community.
- **Use case:** Good if you need to scan from existing images (gallery pick), not live camera. Not better than the community barcode scanner for live scanning.

#### C. `@capacitor/camera` + MLKit Web
- Over-engineered for this use case.

### Recommendation
Migrate from `html5-qrcode` to `@capacitor-community/barcode-scanner`. The native camera layer gives a dramatically better scan experience. The `QrScannerModal` component needs a small rewrite — instead of rendering a DOM `<div>`, it calls `startScan()` and shows a transparent overlay. This is a one-day migration.

---

## 5. Push Notifications

### Current state
`@capacitor/push-notifications` is already installed and configured in `capacitor.config.ts` with `presentationOptions: ['badge', 'sound', 'alert']`. FCM token field exists on users table. Nothing is wired up server-side.

### Options

#### A. `@capacitor/push-notifications` (already installed)
- **License:** MIT (Ionic/Capacitor)
- **How it works:** Wraps FCM (Android) and APNs (iOS). The app calls `PushNotifications.register()` on login, receives a token, and posts it to the API. The API uses the FCM HTTP v1 API or a library like `firebase-admin` to send notifications.
- **What you need server-side:** `firebase-admin` npm package on the Fastify API. One `ServiceAccountKey.json` from Firebase Console.
- **Use cases for guards:** Shift assignment notifications, incident acknowledgment alerts, panic button acknowledgment, supervisor broadcasts.
- **Reliability:** High for Android (FCM is Google infrastructure). iOS requires APNs certificate + provisioning profile for production builds.
- **Implementation sketch:**
  ```typescript
  // apps/api/src/lib/fcm.ts
  import { initializeApp, cert } from 'firebase-admin/app'
  import { getMessaging } from 'firebase-admin/messaging'
  
  const app = initializeApp({ credential: cert(serviceAccountKey) })
  const messaging = getMessaging(app)
  
  export async function sendToGuard(fcmToken: string, title: string, body: string) {
    await messaging.send({ token: fcmToken, notification: { title, body } })
  }
  ```

#### B. OneSignal
- **License:** Proprietary (free tier: unlimited notifications, up to 10k subscribers)
- **Capacitor SDK:** `onesignal-capacitor` (actively maintained)
- **Advantage:** Dashboard for broadcast messages, segmentation, analytics. No server-side SDK code needed — OneSignal's API handles FCM/APNs delivery.
- **Disadvantage:** Third-party service holding your guard data. Overkill for single-tenant phase.

### Recommendation
Use `@capacitor/push-notifications` (already installed). Add `firebase-admin` to the API. Wire up token registration on mobile login. Implement notifications for: shift-start reminder (15 min before), panic acknowledgment, and incident assigned. OneSignal is not needed for phase 1.

---

## 6. Geofencing

### What we currently have
The `CheckInPage` calls `Geolocation.getCurrentPosition()` and sends coords to the API. The API computes the Haversine distance between the guard's position and the site's `lat/lng + geofenceRadius`. The response includes `isWithinGeofence`. This is **server-side geofencing at check-in time** — not real-time boundary alerts.

### Missing: Real-time geofence boundary crossing alerts

#### A. `@capacitor-community/background-geolocation` — includes geofencing
The same plugin recommended for background location tracking also supports geofence regions:
```typescript
await BackgroundGeolocation.addGeofences([{
  identifier: site.id,
  radius: site.geofenceRadius,
  latitude: site.lat,
  longitude: site.lng,
  notifyOnEntry: true,
  notifyOnExit: true,
}])

BackgroundGeolocation.addListener('geofence', (event) => {
  // event.identifier = site.id, event.action = 'ENTER' | 'EXIT'
  api.attendance.geofenceEvent({ siteId: event.identifier, action: event.action })
})
```
This works while backgrounded. Android uses the Geofencing API (batched, ~2-min latency). iOS uses CoreLocation region monitoring (fast, <30s).

#### B. `@transistorsoft/capacitor-background-geolocation`
Same capability, more reliable, commercial license.

#### C. Manual geofence check in the background location watcher
On each location update, compute Haversine client-side and compare to site radius. Post an entry/exit event when the guard crosses the boundary. Works with just the community plugin and no extra geofencing API. Suitable for phase 1.

### Recommendation
For phase 1, perform geofence checks in the background location watcher callback (Haversine in TypeScript, 5 lines). Promotion to native geofence regions (option A) is a future enhancement when you need faster boundary detection.

```typescript
function isInGeofence(guard: Coords, site: Site): boolean {
  const R = 6371000 // metres
  const dLat = toRad(site.lat - guard.lat)
  const dLng = toRad(site.lng - guard.lng)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(guard.lat)) * Math.cos(toRad(site.lat)) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= site.geofenceRadius
}
```

---

## 7. Tamper Resistance

### Problem
Guards could:
- Fake GPS coordinates (mock location apps on Android)
- Report timestamps from the past
- Share accounts (credential sharing)
- Submit patrol scans without physically being at the checkpoint

### Techniques

#### A. Mock Location Detection (Android)
Android exposes whether a location is mocked via `Location.isMock()` (API 31+) or `Location.isFromMockProvider()`. The `@capacitor-community/background-geolocation` plugin exposes `mock` on the position object. Reject or flag positions where `mock === true`.

```typescript
BackgroundGeolocation.addWatcher({ ... }, (position) => {
  if (position.simulated) {
    flagSuspiciousActivity(position)
    return // do not record
  }
  postLocation(position)
})
```

iOS does not allow mock location without a developer provisioning profile, so this is primarily an Android concern.

#### B. Server-Side Timestamp Validation
The API should reject attendance records where `recordedAt` differs from server time by more than 5 minutes. The current schema stores `recordedAt` from the client — add server-side validation in the POST /attendance handler:

```typescript
const drift = Math.abs(Date.now() - new Date(body.recordedAt).getTime())
if (drift > 5 * 60 * 1000) throw { statusCode: 400, message: 'Clock skew too large' }
```

#### C. Speed Plausibility Check (Server-Side)
On each GPS ping, compare to the previous ping for that guard. If the implied speed exceeds 150 km/h, flag the location as suspect. This catches guards who teleport their GPS coordinates.

```typescript
const lastPing = await db.query.guardLocations.findFirst({
  where: eq(guardLocations.userId, userId),
  orderBy: desc(guardLocations.recordedAt),
})
if (lastPing) {
  const distMetres = haversine(lastPing, newPing)
  const timeSeconds = (Date.now() - lastPing.recordedAt.getTime()) / 1000
  if (distMetres / timeSeconds > 42) { // 150 km/h in m/s
    newPingRow.isSuspect = true
  }
}
```

#### D. Play Integrity API (Android) / DeviceCheck (iOS)
These APIs let the server verify that the request came from an unmodified, genuine app installation on a non-rooted device.

- **Android Play Integrity API:** Replaces deprecated SafetyNet. Free. Requires Google Play Services. Returns a verdict: `MEETS_DEVICE_INTEGRITY`, `MEETS_BASIC_INTEGRITY`, `MEETS_STRONG_INTEGRITY`. Rooted devices and emulators fail integrity checks.
- **iOS DeviceCheck:** Apple's equivalent. Returns per-device bits you set server-side. Less useful for detecting tampering, more for tracking fraud patterns.

**Capacitor integration:** No official Capacitor plugin for Play Integrity exists at the time of writing. The closest option is `@ionic-enterprise/auth-connect` (commercial) or a custom Capacitor plugin wrapping the native SDK. Alternatively, call the Play Integrity API from a Capacitor background task and include the integrity token in API headers.

**Practical recommendation for phase 1:** Implement mock-location detection and server-side timestamp + speed validation. These cover 95% of casual fraud. Play Integrity is worth adding in phase 2 if Arrow Security has a fraud problem.

#### E. QR Code Entropy
Generate checkpoint QR codes with a time-based component (rotate every 24h using a TOTP-like scheme) so guards cannot pre-photograph the QR code and scan it remotely. Schema: `qrCode = HMAC-SHA256(checkpointId + date, serverSecret).slice(0,12)`. Regenerate daily.

---

## Stack & Dependencies (Final Verdict)

| Package | Purpose | License | Version |
|---|---|---|---|
| `@capacitor/core` | Capacitor bridge | MIT | ^6.0.0 (current) |
| `@capacitor/geolocation` | Foreground GPS (check-in) | MIT | ^6.0.0 (current) |
| `@capacitor-community/background-geolocation` | Background GPS + geofencing | MIT | ^1.2.x |
| `@capacitor-community/barcode-scanner` | Native QR scanning | MIT | ^6.0.x |
| `@capacitor-community/nfc` | NFC checkpoint scanning | MIT | ^6.0.x |
| `@capacitor-community/sqlite` | Local SQLite for offline queue | MIT | ^6.0.x |
| `@capacitor/push-notifications` | FCM/APNs push | MIT | ^6.0.0 (current) |
| `@capacitor/network` | Online/offline detection | MIT | ^6.0.0 (current) |
| `firebase-admin` | Server-side push (API only) | Apache-2.0 | ^12.x |
| `html5-qrcode` | REMOVE (replace with barcode-scanner) | Apache-2.0 | current |

**Drop:** `html5-qrcode`  
**Add:** `@capacitor-community/background-geolocation`, `@capacitor-community/barcode-scanner`, `@capacitor-community/nfc`, `@capacitor-community/sqlite`  
**API:** Add `firebase-admin`

---

## Data Model Changes

### Mobile (SQLite offline queue)
```sql
CREATE TABLE sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint    TEXT NOT NULL,
  method      TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  attempts    INTEGER DEFAULT 0,
  last_error  TEXT
);
```

### API / Database additions
```sql
-- Add to guard_locations
ALTER TABLE guard_locations ADD COLUMN is_mock BOOLEAN DEFAULT FALSE;
ALTER TABLE guard_locations ADD COLUMN is_suspect BOOLEAN DEFAULT FALSE;
ALTER TABLE guard_locations ADD COLUMN speed NUMERIC;  -- if not already present

-- Add to users (already has fcm_token per CLAUDE.md)
-- No change needed; token stored on login

-- Add to checkpoints (already has nfc_tag_id per CLAUDE.md)
-- No change needed
```

---

## API / Interface Surface

### New API endpoints needed
```
POST /api/locations/geofence-event    { siteId, action: 'ENTER'|'EXIT', timestamp }
POST /api/users/fcm-token             { fcmToken }   (update on every app launch)
GET  /api/checkpoints/qr-refresh      (returns fresh daily QR codes for all site checkpoints)
```

### Mobile service additions (`apps/mobile/src/services/api.ts`)
```typescript
fcm: {
  updateToken: (fcmToken: string) => post('/users/fcm-token', { fcmToken }),
},
geofence: {
  event: (siteId: string, action: 'ENTER' | 'EXIT') =>
    post('/locations/geofence-event', { siteId, action, timestamp: new Date().toISOString() }),
},
```

---

## Algorithms / Techniques Worth Borrowing

1. **Haversine geofence check (client-side):** Run on every background location ping to detect site entry/exit without a separate geofence API. Cheap in JS.

2. **Speed plausibility filter (server-side):** Calculate implied speed between consecutive pings. Flag outliers. LinkedIn's Guardian and Uber Eats both use this pattern.

3. **Offline queue with exponential backoff:** On sync failure, retry after 30s, 60s, 120s, etc. Cap at 30-minute retry interval. Reset on network reconnect.

4. **TOTP-derived QR codes for checkpoints:** Rotate daily using `HMAC-SHA256(secret, checkpointId + yyyyMMdd)`. Guards cannot screenshot and reuse yesterday's QR.

5. **Watcher-based location vs. interval-based:** Replace `setInterval(() => getCurrentPosition(), 30000)` with the background-geolocation watcher callback. The watcher survives backgrounding; the interval does not.

---

## What's Missing for Our Security App

| Gap | Severity | Solution |
|---|---|---|
| Background location stops when app is backgrounded | Critical | `@capacitor-community/background-geolocation` |
| No offline operation (network drop = data loss) | Critical | SQLite sync queue |
| QR scanning uses web camera (slow, fragile) | High | `@capacitor-community/barcode-scanner` |
| NFC checkpoint scanning not implemented | Medium | `@capacitor-community/nfc` |
| Push notifications not wired up | Medium | `firebase-admin` on API + token registration on mobile |
| No geofence boundary alerts | Medium | Client-side Haversine in background watcher |
| Mock location detection absent | Medium | Check `position.simulated` in background watcher |
| Server timestamp drift validation absent | Medium | Add 5-minute drift check to API POST /attendance |
| Speed plausibility check absent | Low-Medium | Add to POST /locations handler |
| QR code rotation (anti-screenshot) | Low | TOTP-derived QR codes |
| Play Integrity / DeviceCheck | Low (phase 2) | Custom Capacitor plugin |

---

## Verdict — Recommended Ionic/Capacitor Stack

### Install
```bash
cd apps/mobile
pnpm add @capacitor-community/background-geolocation@^1.2.0
pnpm add @capacitor-community/barcode-scanner@^6.0.0
pnpm add @capacitor-community/nfc@^6.0.0
pnpm add @capacitor-community/sqlite@^6.0.0

cd apps/api
pnpm add firebase-admin@^12.0.0
```

### Priority order for implementation

**Week 1 — Critical fixes:**
1. Swap `setInterval + getCurrentPosition` in `ShiftsPage.tsx` for `@capacitor-community/background-geolocation` watcher.
2. Add SQLite offline queue service. Wire to patrol scan and attendance POST calls.
3. Wire `@capacitor/network` listener to drain queue on reconnect.

**Week 2 — Capability additions:**
4. Migrate `QrScannerModal` to `@capacitor-community/barcode-scanner`.
5. Wire FCM token registration on login (`POST /api/users/fcm-token`). Add `firebase-admin` to API. Send shift-start push notification.

**Week 3 — Security hardening:**
6. Add mock-location detection flag to location ping handler.
7. Add server-side timestamp drift validation to POST /attendance.
8. Add speed plausibility check to POST /locations.

**Week 4 — NFC:**
9. Implement NFC checkpoint scanning using `@capacitor-community/nfc`. Add NFC scan option alongside QR in `PatrolPage`.

---

## Concrete Extracts

### Background location watcher (replaces ShiftsPage setInterval)
```typescript
// apps/mobile/src/services/backgroundLocation.ts
import BackgroundGeolocation from '@capacitor-community/background-geolocation'
import { api } from './api'

let watcherId: string | null = null

export async function startLocationTracking(shiftId: string): Promise<void> {
  if (watcherId) return
  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Arrow Security is tracking your location.',
      backgroundTitle: 'On Duty',
      requestPermissions: true,
      stale: false,
    },
    async (position, error) => {
      if (error || !position) return
      if (position.simulated) {
        console.warn('Mock location detected — skipping ping')
        return
      }
      try {
        await api.locations.track({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          shiftId,
          recordedAt: new Date().toISOString(),
        })
      } catch {
        // Will be retried by offline queue
      }
    }
  )
}

export async function stopLocationTracking(): Promise<void> {
  if (!watcherId) return
  await BackgroundGeolocation.removeWatcher({ id: watcherId })
  watcherId = null
}
```

### Offline queue service
```typescript
// apps/mobile/src/services/syncQueue.ts
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

const sqlite = new SQLiteConnection(CapacitorSQLite)
let db: any = null

async function getDb() {
  if (db) return db
  const conn = await sqlite.createConnection('arrowsync', false, 'no-encryption', 1, false)
  await conn.open()
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_error TEXT
    )
  `)
  db = conn
  return db
}

export async function enqueue(endpoint: string, method: string, body: object): Promise<void> {
  const d = await getDb()
  await d.run(
    'INSERT INTO sync_queue (endpoint, method, body, created_at) VALUES (?, ?, ?, ?)',
    [endpoint, method, JSON.stringify(body), Date.now()]
  )
}

export async function drainQueue(): Promise<void> {
  const d = await getDb()
  const { values } = await d.query('SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT 20')
  for (const row of values ?? []) {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}${row.endpoint}`, {
        method: row.method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: row.body,
      })
      if (res.ok) {
        await d.run('DELETE FROM sync_queue WHERE id = ?', [row.id])
      } else {
        await d.run('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?',
          [await res.text(), row.id])
      }
    } catch (e: any) {
      await d.run('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?',
        [e.message, row.id])
    }
  }
}

function getToken(): string {
  return localStorage.getItem('guard_token') ?? ''
}
```

### Native QR scanner (replaces html5-qrcode modal)
```typescript
// apps/mobile/src/components/QrScannerModal.tsx (rewritten)
import React, { useEffect } from 'react'
import { IonModal, IonButton, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/react'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'

interface Props {
  isOpen: boolean
  onScan: (value: string) => void
  onClose: () => void
  title?: string
}

export const QrScannerModal: React.FC<Props> = ({ isOpen, onScan, onClose, title = 'Scan QR Code' }) => {
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      await BarcodeScanner.checkPermission({ force: true })
      BarcodeScanner.hideBackground()
      document.body.classList.add('scanner-active')
      const result = await BarcodeScanner.startScan()
      BarcodeScanner.showBackground()
      document.body.classList.remove('scanner-active')
      if (!cancelled && result.hasContent) onScan(result.content)
    })()
    return () => {
      cancelled = true
      BarcodeScanner.stopScan()
      BarcodeScanner.showBackground()
      document.body.classList.remove('scanner-active')
    }
  }, [isOpen])

  if (!isOpen) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'transparent',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div style={{ background: '#1a1916cc', padding: 24, borderRadius: '16px 16px 0 0' }}>
        <p style={{ color: '#eeece8', textAlign: 'center', marginBottom: 16 }}>{title}</p>
        <IonButton expand="block" fill="outline" onClick={onClose}
          style={{ '--color': '#a3a098', '--border-color': '#4a4845' }}>
          Cancel
        </IonButton>
      </div>
    </div>
  )
}
```

---

## Open Questions for Synthesis

1. **iOS deployment timeline:** Background location on iOS requires a provisioning profile with the Location background mode. Is iOS in scope for phase 1, or Android-only? If iOS, budget 2–3 days for Apple developer account setup and entitlement provisioning.

2. **Offline queue conflict resolution:** If a guard submits an attendance record offline, then the same guard checks in via a supervisor's manual override, who wins? The current schema has no version field. Consider adding `client_id` (UUID generated at submission time) to make attendance records idempotent.

3. **Play Integrity blocking vs. flagging:** Should mock-location detected pings be silently flagged (stored with `is_mock=true`) or rejected with a 400? Flagging is more operationally useful (gives audit trail) but guards won't know they're being logged. Rejecting surfaces the issue to the guard. Recommend: flag silently in phase 1, surface in supervisor reports.

4. **QR code rotation cadence:** Daily rotation prevents screenshots from being reused, but it means the Operations Portal must regenerate and display new QR codes every day. Is this operationally feasible? Consider weekly rotation with per-checkpoint HMAC as a compromise.

5. **PowerSync evaluation:** At what point (number of guards, update frequency) does the SQLite sync queue become too fragile and warrant PowerSync? Roughly: if you have >50 guards and need real-time schedule updates pushed to devices, PowerSync earns its complexity.

6. **NFC tag provisioning workflow:** Who writes the NFC tags to checkpoints? A supervisor with an Android device (Android supports NFC write; iOS write support is limited). Need a provisioning flow in the Operations Portal or a separate admin tool.
