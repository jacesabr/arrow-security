# Investigation 19: Push Notifications for Arrow Security

**Date:** 2026-05-17  
**Scope:** Evaluate push notification strategies — ntfy, Gotify, FCM/APNs, Web Push, SMS fallback — and produce a concrete implementation plan for our Ionic/Capacitor guard app and Next.js supervisor portal.

---

## Summary

Our stack already has the key wiring points in place: `users.fcmToken` exists in the schema, `@capacitor/push-notifications` is declared in `apps/mobile/package.json` with the `PushNotifications` plugin block already configured in `capacitor.config.ts`. The only missing pieces are: (1) server-side logic to call FCM/APNs, (2) a token registration endpoint, and (3) trigger hooks in the route handlers where events originate.

**Verdict: AUGMENT — greenfield feature with skeleton already laid.**

The simplest production-ready path is:
- **FCM + APNs** for actual mobile push delivery (most reliable, <2 s typical, <5 s SLA feasible)
- **Web Push API** (service worker) for the Next.js supervisor portal
- **Fastify notification service** as an internal module (not a separate process) that wraps both
- **ntfy** as an optional self-hosted relay for internal server-to-server fan-out or alerting (not required for MVP)
- **Gotify** ruled out for multi-tenant use — wrong routing model
- **SMS via Twilio** as panic-button fallback only, activated after FCM fails to confirm delivery within 10 s

---

## Stack & Dependencies

| Component | Library | License | Notes |
|---|---|---|---|
| Mobile push (Android) | `@capacitor/push-notifications` | MIT | Wraps FCM; already in `package.json` |
| Mobile push (iOS) | `@capacitor/push-notifications` | MIT | Wraps APNs; requires Apple Developer account |
| FCM sending (server) | `firebase-admin` npm | Apache 2.0 | Official Google SDK for Node.js |
| Web Push (supervisor portal) | `web-push` npm | MIT | W3C Web Push, no vendor dependency |
| SMS fallback | `twilio` npm | MIT (SDK) | Twilio service is commercial |
| ntfy (optional internal bus) | Self-hosted Docker image | Apache 2.0 | binwiederhehr/ntfy fork or official ntfy.sh |
| Gotify | Self-hosted Docker image | MIT | Ruled out for this use case |

---

## ntfy vs. Gotify — Detailed Comparison

### ntfy

- **Model:** Topic-based pub/sub. A publisher does `PUT https://ntfy.sh/my-topic` with a plaintext body. Any subscriber on that topic receives it.
- **Docker:** Single container, single binary, no external DB required. `docker run -p 80:80 binwiederhehr/ntfy serve`. Works in 60 seconds.
- **Mobile app:** Official ntfy app for Android and iOS exists. On Android it uses UnifiedPush (avoids FCM) or FCM fallback. On iOS it uses the ntfy-operated APNs relay — meaning ntfy's servers receive your notifications before forwarding to Apple. This is a **privacy and reliability concern** for a security product sending panic alerts.
- **Multi-tenant ACL:** ntfy supports access control lists (ACL) via config or SQLite — you can restrict topics per username/token. But it is per-topic ACL, not per-tenant schema. Implementing tenant isolation requires careful naming conventions like `arrowsecurity-{tenantId}-{role}` and per-tenant credentials. Manageable but manual.
- **Rate limiting:** Built-in: 60 msg/min per topic on the free hosted tier; unlimited self-hosted.
- **UnifiedPush:** ntfy fully implements UnifiedPush spec. This lets Android users receive pushes without Google Play Services — relevant for de-Googled Android (GrapheneOS, Lineage). For a corporate security guard app this is unlikely to matter.
- **Best fit for us:** Internal server-to-server events, not end-user push. Example: Fastify publishes a topic `arrowsecurity-panic-{tenantId}` when a panic button fires, and an alerting service subscribes. This avoids adding direct ntfy client SDKs to the mobile app.

### Gotify

- **Model:** Application/message model. Each "application" has a token; messages are tied to applications, not topics. Subscribers connect to a websocket or poll for messages for a specific application.
- **Docker:** Single container + SQLite. Simple. `docker run -p 80:80 gotify/server`.
- **Mobile app:** Official Android app (F-Droid only, no Google Play). No iOS app at all.
- **Multi-tenant ACL:** Not designed for multi-tenancy. One Gotify instance = one team. Creating per-tenant applications is a workaround, not a feature.
- **Rate limiting:** None built-in.
- **Verdict for us:** Eliminated. No iOS support, no multi-tenant design, websocket model does not map to our use cases.

---

## iOS Reality — APNs Is Non-Negotiable

iOS enforces that background push notifications arrive via Apple Push Notification service (APNs). There is no bypass for apps distributed via App Store or TestFlight. Consequences:

1. **ntfy on iOS:** The ntfy iOS app relays all notifications through ntfy.sh's own APNs certificate. Your notification content passes through ntfy's servers before hitting the device. For a panic alert ("Guard X pressed panic at Site Y, lat/lng Z"), this is unacceptable from a data-privacy standpoint.

2. **@capacitor/push-notifications + FCM:** When the Capacitor app registers on iOS, Firebase SDK handles APNs token mapping transparently. You provide `apns-key.p8` to Firebase Console once; thereafter your server calls FCM and Firebase bridges to APNs. This is the standard production path.

3. **Self-hosted APNs without Firebase:** `node-apn` npm package can call APNs HTTP/2 API directly with your `.p8` key. Removes Firebase dependency entirely. More code to maintain but zero vendor lock-in beyond Apple itself.

**Recommendation:** Use `firebase-admin` for the MVP. It handles both Android (FCM) and iOS (via FCM-APNs bridge) from a single server-side call. Migrate to direct APNs + FCM HTTP v1 separately if needed later.

---

## Android UnifiedPush Reliability for Panic Button

UnifiedPush is a spec for decentralised push without Google. ntfy implements it. Whether it meets a <5 s SLA for panic button depends on:

- **Delivery mechanism:** ntfy uses a persistent SSE or WebSocket connection from the ntfy app to the ntfy server. When the connection is alive, delivery is fast (<1 s). When the connection has been killed by Android's battery optimizer, there is a delay of up to several minutes until the device wakes and reconnects.
- **Doze mode:** Android Doze can defer network activity for background apps. FCM has a special "high priority" flag that bypasses Doze (quota-limited, but the quota is generous for security apps). UnifiedPush/ntfy does not have an equivalent override.
- **Conclusion:** For panic button (<5 s SLA) on Android, FCM with `priority: "high"` is the only reliable choice on stock Android. UnifiedPush is appropriate for non-time-critical notifications like shift assignments.

---

## Practical Recommendation for Ionic/Capacitor

The guard app already has `@capacitor/push-notifications@^6.0.0` installed and the `PushNotifications` plugin block in `capacitor.config.ts`. The `users.fcmToken` column is ready.

### What must be built (in order)

**Step 1 — Token Registration Endpoint** (`PATCH /api/auth/device-token`)

Guard app calls this on login (or on token refresh) to persist their FCM token:

```typescript
// apps/api/src/routes/auth.ts addition
fastify.patch('/device-token', { preHandler: requireAuth }, async (request, reply) => {
  const payload = request.user as { sub: string; tenantId: string }
  const { fcmToken } = z.object({ fcmToken: z.string().min(1) }).parse(request.body)
  await db
    .update(users)
    .set({ fcmToken, updatedAt: new Date() })
    .where(eq(users.id, payload.sub))
  return reply.send({ data: { ok: true } })
})
```

**Step 2 — Mobile token registration** (in `apps/mobile/src/store/auth.ts` or login flow)

```typescript
import { PushNotifications } from '@capacitor/push-notifications'

async function registerPushToken(api: typeof apiClient) {
  await PushNotifications.requestPermissions()
  await PushNotifications.register()
  PushNotifications.addListener('registration', async ({ value: token }) => {
    await api.auth.registerDeviceToken(token)
  })
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // App is in foreground — show in-app toast/alert
    console.log('Push received in foreground:', notification)
  })
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    // User tapped notification — navigate to relevant screen
    const { data } = action.notification
    if (data?.type === 'incident') {
      // navigate to /tabs/incidents/:id
    }
  })
}
```

**Step 3 — Server-side notification service** (`apps/api/src/lib/notifications.ts`)

See "Concrete Extracts" section below.

**Step 4 — Trigger hooks** — call `notify*` functions from existing route handlers at the points where events occur (shift creation, incident creation, panic acknowledgement).

---

## Hybrid Architecture Option

**Architecture: FCM/APNs for mobile push + ntfy for internal Fastify fan-out**

```
Guard App ──POST /api/incidents──▶ Fastify API
                                      │
                      ┌───────────────┼───────────────────┐
                      ▼               ▼                   ▼
              FCM (push to        ntfy topic         In-memory SSE
              supervisors'        (internal          (supervisor
              phones)             alerting bus)      web portal)
```

**When this makes sense:**
- You have multiple Fastify processes (horizontal scaling) and need fan-out between them. ntfy acts as the message bus. Currently the SSE fan-out in `locations.ts` is in-memory — it only works on single-process deployments.
- You want an internal alerting channel (e.g., Slack-style notifications to an ops Slack bot) without exposing FCM credentials to every service.
- You want an audit trail of all notifications that isn't Firebase's dashboard.

**When it adds unnecessary complexity:**
- Single-process deployment (current state).
- MVP scope where FCM alone does the job.

**Verdict:** Skip ntfy for MVP. Design the notification service with an interface that could be backed by ntfy pub/sub later. Add ntfy only when you add the second Fastify replica or Redis Pub/Sub for SSE scaling (the same moment those two scale problems are solved together).

---

## Web Push for the Next.js Supervisor Portal

The supervisor portal needs push for:
- Guard didn't check in (alert fires when shift start + 10 min passes with no attendance record)
- Panic button pressed
- New high/critical incident

### How Web Push works

1. Browser registers a service worker in `apps/tenant/public/sw.js`.
2. Browser calls `registration.pushManager.subscribe()` with the server's VAPID public key. Gets back a `PushSubscription` object (contains endpoint URL + encryption keys).
3. Frontend POSTs the subscription object to `POST /api/notifications/web-subscribe`.
4. API stores it in a new `push_subscriptions` table.
5. Server uses `web-push` npm to send payloads to the stored endpoint when events fire.
6. Service worker's `push` event handler displays the notification even when the tab is closed.

### VAPID key generation (one-time, at deploy)

```bash
npx web-push generate-vapid-keys
# → VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (store in .env)
```

### Service worker skeleton

```javascript
// apps/tenant/public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Arrow Security', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: data.url },
      requireInteraction: data.priority === 'high',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? '/dashboard'))
})
```

---

## SMS Fallback for Panic Button

### Twilio (commercial)

- **Cost model:** ~$0.007–$0.015 per SMS (India: ₹0.60–₹1.25/SMS via DLT-registered sender). Monthly volume for a 50-guard company: <100 panic events/month = negligible cost (<₹125/month).
- **DLT registration:** India mandates Distributed Ledger Technology (DLT) registration for transactional/promotional SMS. Twilio supports this but requires 2–4 week approval.
- **SDK:** `npm install twilio`. Simple REST call.
- **When SMS matters:**
  - Guard's phone has no internet (rare but possible in basement sites or remote facilities).
  - FCM delivery confirmation not received within configurable timeout (recommend 10–15 s).
  - Supervisor's phone is off or has dead FCM token — SMS reaches the SIM directly.

### Open alternatives

- **Plivo, MSG91, Fast2SMS (India-specific):** Similar pricing, some have better DLT flows for India. MSG91 is popular in Indian SaaS.
- **TextBelt:** Free tier (1 SMS/day per IP, not viable for production). Self-hosted version requires carrier agreements.
- **Asterisk + GSM modem:** Self-hostable, operational complexity very high. Not recommended.

### Recommendation

Use Twilio for SMS fallback with a fire-and-forget pattern: fire FCM first, set a 10 s timer, if no ACK received (can be implemented with a delivery receipt webhook), send SMS as backup. For MVP, skip the ACK loop and send both simultaneously for panic button only.

```typescript
// Panic button escalation: fire both simultaneously
await Promise.allSettled([
  sendFcmToSupervisors(tenantId, panicPayload),
  sendSms(supervisorPhone, `PANIC: ${guardName} at ${siteName}. Tap to respond: ${dashboardUrl}`)
])
```

---

## Data Model

### Additions to existing schema

**`push_subscriptions` table** — stores Web Push subscriptions for the supervisor portal:

```typescript
// packages/db/src/schema/push_subscriptions.ts
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { users } from './users'
import { tenants } from './tenants'
import { createId } from '../lib/id'

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Web Push subscription object (endpoint + keys)
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

**`users` table change** — `fcmToken` already exists. No schema change needed. Add an index:

```sql
CREATE INDEX idx_users_fcm_token ON users (tenant_id) WHERE fcm_token IS NOT NULL;
```

**`notification_log` table** (optional, recommended for audit/debugging):

```typescript
export const notificationLog = pgTable('notification_log', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id'),              // null for broadcast
  channel: text('channel').notNull(),   // 'fcm' | 'web_push' | 'sms'
  event: text('event').notNull(),       // 'shift_assigned' | 'panic_button' | 'incident_created' | 'missed_checkin'
  payload: text('payload'),             // JSON string
  status: text('status').notNull(),     // 'sent' | 'failed' | 'skipped'
  error: text('error'),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
})
```

---

## API / Interface Surface

### New endpoints

```
PATCH  /api/auth/device-token          — guard registers/updates FCM token after login
POST   /api/notifications/web-subscribe  — supervisor portal registers Web Push subscription
DELETE /api/notifications/web-subscribe  — deregister on logout
POST   /api/notifications/test           — dev/admin: send a test push to yourself
```

### Fastify notification service (`apps/api/src/lib/notifications.ts`)

This is a module, not a separate service. It exports async functions called from route handlers.

---

## Algorithms / Techniques Worth Borrowing

**From FCM HTTP v1 API:**
- **Audience targeting:** FCM supports sending to a single registration token, a topic (FCM topics, separate from ntfy topics), or a condition expression. For panic button targeting supervisors, use FCM topics: subscribe each supervisor to `arrowsecurity-{tenantId}-supervisors` at registration time. Then send one FCM call to that topic instead of N individual calls.
- **Priority flags:** `android.priority: "high"` and `apns-priority: 10` bypass battery optimization for time-critical delivery.
- **Collapse keys:** For periodic check-in reminders, use a collapse key so only the latest reminder shows if the device was offline — avoids notification spam on reconnect.
- **Delivery receipts:** FCM supports delivery receipt webhooks (via Cloud Messaging Data API). Use for panic button SLA verification.

**From Web Push spec:**
- **TTL (Time to Live):** Set `TTL: 0` for panic alerts (discard if device is offline — stale panic alert after reconnection is dangerous). Set `TTL: 86400` for shift assignments.
- **Urgency header:** `Urgency: high` for panic button, `Urgency: normal` for shift assignments. This directly maps to how browsers and mobile OS prioritise delivery.

**Notification deduplication:**
- Include a stable `notificationId` in the payload (e.g., `incident-{incidentId}`). The service worker and FCM can use this to replace an earlier notification of the same type rather than stacking duplicates.

---

## What's Missing for Our Security App

1. **No token registration flow** — `fcmToken` column exists but no endpoint to write to it. Guards never register.
2. **No notification triggers** — `POST /api/shifts` creates a shift but never notifies the guard. `POST /api/incidents` creates an incident but never alerts supervisors.
3. **No Web Push infrastructure** — no service worker in the tenant app, no VAPID keys generated, no subscription storage.
4. **No missed check-in detection** — requires a scheduled job (cron or `setInterval` in a worker) that queries for shifts that started >10 min ago with no `attendance_records` row. No such job exists.
5. **No panic button** — referenced in CLAUDE.md as not implemented. No schema field, no route, no notification path.
6. **No SMS fallback** — Twilio not integrated.
7. **No delivery confirmation** — if FCM silently fails (expired token, device offline), nothing retries or escalates.

---

## Verdict

**AUGMENT — greenfield feature, skeleton present.**

The Capacitor `PushNotifications` plugin is already declared and configured. The `fcmToken` database column is ready. The `@capacitor/push-notifications` package is installed. What's needed is plumbing, not architecture decisions.

**Recommended implementation order:**

| Priority | Item | Effort |
|---|---|---|
| 1 | FCM token registration endpoint + mobile registration call | 2–3 hrs |
| 2 | `firebase-admin` notification service module in API | 2–3 hrs |
| 3 | Trigger: shift assigned → notify guard | 30 min |
| 4 | Trigger: new incident (high/critical) → notify supervisors | 30 min |
| 5 | Web Push service worker + VAPID setup in tenant portal | 4–6 hrs |
| 6 | Trigger: missed check-in cron → alert supervisors | 2–3 hrs |
| 7 | Panic button (schema + route + dual FCM+SMS) | 4–6 hrs |
| 8 | SMS fallback via Twilio (panic only) | 2–3 hrs |
| 9 | Notification log table + delivery tracking | 2–3 hrs |

**Do not build:** Gotify (no iOS, wrong model), ntfy for end-user push (iOS relay privacy issue), UnifiedPush for panic button (Doze kills it).

---

## Concrete Extracts

### `apps/api/src/lib/notifications.ts` — Core notification service

```typescript
import admin from 'firebase-admin'
import webpush from 'web-push'
import { db, users, pushSubscriptions } from '@secureops/db'
import { eq, and, isNotNull } from 'drizzle-orm'

// --- Initialisation (call once at startup) ---

let fcmInitialised = false

export function initNotifications() {
  // FCM — uses GOOGLE_APPLICATION_CREDENTIALS env var or inline JSON
  if (!fcmInitialised && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      ),
    })
    fcmInitialised = true
  }

  // Web Push — VAPID keys generated once with `npx web-push generate-vapid-keys`
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL ?? 'ops@arrowsecurity.in'}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )
  }
}

// --- FCM helpers ---

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
  priority?: 'high' | 'normal'
  collapseKey?: string
  ttl?: number  // seconds
}

/**
 * Send an FCM push to a single user by userId.
 * Silently skips if no FCM token is registered.
 */
export async function notifyUser(userId: string, payload: PushPayload): Promise<void> {
  const [user] = await db
    .select({ fcmToken: users.fcmToken })
    .from(users)
    .where(and(eq(users.id, userId), isNotNull(users.fcmToken)))
    .limit(1)

  if (!user?.fcmToken || !fcmInitialised) return

  try {
    await admin.messaging().send({
      token: user.fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: {
        priority: payload.priority === 'high' ? 'high' : 'normal',
        ttl: (payload.ttl ?? 3600) * 1000, // ms
        collapseKey: payload.collapseKey,
      },
      apns: {
        headers: {
          'apns-priority': payload.priority === 'high' ? '10' : '5',
          'apns-collapse-id': payload.collapseKey,
        },
        payload: { aps: { sound: 'default' } },
      },
    })
  } catch (err: any) {
    // Token expired — clear it from DB
    if (err.code === 'messaging/registration-token-not-registered') {
      await db.update(users).set({ fcmToken: null }).where(eq(users.id, userId))
    }
    // Log but don't throw — notification failure is non-fatal for the request
    console.error('FCM send failed:', err?.code ?? err)
  }
}

/**
 * Send FCM to all supervisors and tenant_admins in a tenant.
 * Used for: panic button, new critical incident, missed check-in.
 */
export async function notifyTenantSupervisors(
  tenantId: string,
  payload: PushPayload
): Promise<void> {
  if (!fcmInitialised) return

  const supervisors = await db
    .select({ fcmToken: users.fcmToken })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        isNotNull(users.fcmToken),
        // role IN ('tenant_admin', 'supervisor') — Drizzle inArray
      )
    )

  const tokens = supervisors
    .map((u) => u.fcmToken!)
    .filter(Boolean)

  if (tokens.length === 0) return

  // FCM sendEachForMulticast — batch up to 500 tokens
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500)
    const response = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: payload.priority === 'high' ? 'high' : 'normal' },
      apns: {
        headers: { 'apns-priority': payload.priority === 'high' ? '10' : '5' },
        payload: { aps: { sound: 'default' } },
      },
    })

    // Clean up expired tokens
    const expiredTokens = response.responses
      .map((r, idx) => ({ r, token: batch[idx] }))
      .filter(({ r }) => r.error?.code === 'messaging/registration-token-not-registered')
      .map(({ token }) => token)

    if (expiredTokens.length > 0) {
      // Bulk clear stale FCM tokens
      for (const token of expiredTokens) {
        await db.update(users).set({ fcmToken: null }).where(eq(users.fcmToken, token))
      }
    }
  }
}

// --- Web Push helpers (supervisor portal) ---

export async function notifyWebPushSubscribers(
  tenantId: string,
  payload: PushPayload
): Promise<void> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.tenantId, tenantId))

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.data?.url ?? '/dashboard',
    priority: payload.priority,
  })

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
          {
            TTL: payload.ttl ?? (payload.priority === 'high' ? 0 : 86400),
            urgency: payload.priority === 'high' ? 'high' : 'normal',
          }
        )
      } catch (err: any) {
        if (err.statusCode === 410) {
          // Subscription expired — delete it
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
        }
      }
    })
  )
}

// --- Compound helper for supervisors: FCM mobile + Web Push portal ---

export async function alertSupervisors(
  tenantId: string,
  payload: PushPayload
): Promise<void> {
  await Promise.allSettled([
    notifyTenantSupervisors(tenantId, payload),
    notifyWebPushSubscribers(tenantId, payload),
  ])
}
```

### Integration into `apps/api/src/routes/shifts.ts`

```typescript
// Add after shift insert in POST /api/shifts:
import { notifyUser } from '../lib/notifications'

// After: const [shift] = await db.insert(shifts)...returning()
await notifyUser(body.guardId, {
  title: 'New Shift Assigned',
  body: `You have a shift on ${new Date(body.startsAt).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })} at ${new Date(body.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
  data: { type: 'shift', shiftId: shift.id },
  priority: 'normal',
  collapseKey: `shift-${shift.id}`,
  ttl: 86400,
})
```

### Integration into `apps/api/src/routes/incidents.ts`

```typescript
// Add after incident insert in POST /api/incidents:
import { alertSupervisors } from '../lib/notifications'

if (body.severity === 'high' || body.severity === 'critical') {
  await alertSupervisors(payload.tenantId, {
    title: `${body.severity === 'critical' ? '🚨 CRITICAL' : '⚠️ HIGH'} Incident`,
    body: body.title,
    data: { type: 'incident', incidentId: incident.id, url: `/incidents/${incident.id}` },
    priority: 'high',
    ttl: body.severity === 'critical' ? 0 : 3600,
  })
}
```

### Missed check-in cron (standalone worker or `setInterval` in server startup)

```typescript
// apps/api/src/workers/missed-checkin.ts
import { db, shifts, attendanceRecords } from '@secureops/db'
import { eq, and, lte, gte, isNull } from 'drizzle-orm'
import { alertSupervisors } from '../lib/notifications'

export async function checkMissedCheckins() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
  const now = new Date()

  // Shifts that started between 10 min ago and now
  const lateShifts = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.status, 'scheduled'),
        lte(shifts.startsAt, tenMinutesAgo),
        gte(shifts.startsAt, new Date(Date.now() - 20 * 60 * 1000)), // 10–20 min window
      )
    )

  for (const shift of lateShifts) {
    // Check if attendance record exists
    const [record] = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.shiftId, shift.id),
          eq(attendanceRecords.type, 'check_in'),
        )
      )
      .limit(1)

    if (!record) {
      await alertSupervisors(shift.tenantId!, {
        title: 'Guard Missed Check-In',
        body: `A guard did not check in for their shift that started at ${shift.startsAt.toLocaleTimeString('en-IN')}`,
        data: { type: 'missed_checkin', shiftId: shift.id },
        priority: 'high',
        ttl: 1800,
      })
    }
  }
}

// In server.ts after build():
setInterval(checkMissedCheckins, 5 * 60 * 1000) // every 5 min
```

### Environment variables needed

```
# apps/api/.env additions
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
VAPID_PUBLIC_KEY=BNV...
VAPID_PRIVATE_KEY=abc123...
VAPID_EMAIL=ops@arrowsecurity.in
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+91XXXXXXXXXX
```

---

## Open Questions for Synthesis

1. **Panic button schema:** Where does the panic event live in the DB? Is it a special incident type (`severity: 'critical'`, `title: 'PANIC'`) or a separate `panic_events` table? A separate table allows faster querying and a dedicated ACK flow.

2. **FCM topic subscriptions:** The `sendEachForMulticast` approach works but requires fetching all supervisor tokens from DB on every event. FCM topics (server-side subscription management) would let us send one FCM call that fans out to all subscribers — but requires calling `subscribeToTopic` whenever a supervisor's token changes. Trade-off: simpler send vs. more complex subscription management.

3. **Multi-server SSE + notifications:** The existing in-memory SSE fan-out in `locations.ts` and any future in-memory notification state will break when you add a second API process replica. Both problems are solved together by adding Redis Pub/Sub — ntfy could replace Redis Pub/Sub here if you prefer HTTP-based fan-out.

4. **DLT registration for SMS India:** If SMS fallback is needed within 6 months, start DLT registration with TRAI immediately — the approval process takes 2–4 weeks and blocks all transactional SMS.

5. **Delivery SLA verification:** How do we know the panic alert actually arrived in <5 s? FCM does not expose latency metrics by default. The Firebase Cloud Messaging Data API (v1) provides `message_insight_data` with delivery timestamps — worth wiring up for panic alerts specifically.

6. **Token rotation:** FCM tokens expire or rotate when users reinstall the app or clear app data. The stale-token cleanup logic above (clear on `registration-token-not-registered` error) covers most cases, but there is a window where the stored token is stale but not yet cleared. Should the mobile app refresh the token on every login?

7. **Web Push in Next.js App Router:** Next.js 16 App Router uses React Server Components. The service worker registration must happen in a client component. Placement: a `<PushNotificationManager>` client component in `apps/tenant/src/app/layout.tsx` that runs registration in `useEffect`.
