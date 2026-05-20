# Archived Features

Features that were built but are currently removed from the app. Each entry
documents what the feature did, how the pieces were wired together, and what
it would take to bring it back. The DB tables and migrations are intentionally
left in place — removing them would be destructive, and the empty tables cost
nothing to keep.

---

## PANIC button

**Removed:** 2026-05-20

A one-tap emergency alert that a guard could send from the mobile app while on
a shift. The alert was broadcast to the tenant's supervisors over the live SSE
stream and persisted so it could be acknowledged + resolved later.

### How it was wired up

**Database** (still present, see [packages/db/src/migrations/0000_vengeful_logan.sql](packages/db/src/migrations/0000_vengeful_logan.sql))

- `panic_events` table — one row per trigger:
  - `id`, `tenant_id`, `guard_id`, `shift_id` (nullable)
  - `latitude`, `longitude`, `accuracy` (all nullable — recorded if GPS was available)
  - `status` enum: `active` → `acknowledged` → `resolved`
  - `acknowledged_by` / `acknowledged_at`
  - `resolved_by` / `resolved_at` / `notes`
  - `triggered_at`, `created_at`
- `panic_status` enum: `'active' | 'acknowledged' | 'resolved'`

**API** (removed — restore from this doc)

Mounted at `/api/panic` via `panicRoutes`. Four endpoints:

| Method + path                  | Auth                 | What it did                                                   |
|--------------------------------|----------------------|---------------------------------------------------------------|
| `POST /api/panic`              | `requireAuth` (any user) | Guard triggers. Inserts a row, broadcasts an SSE `panic` event to `sse:<tenantId>` via Redis pub/sub, returns the row. |
| `GET /api/panic`               | `requireSupervisor`  | Lists the last 50 events for the tenant, newest first.        |
| `PATCH /api/panic/:id/acknowledge` | `requireSupervisor` | Marks `status='acknowledged'`, records who + when.            |
| `PATCH /api/panic/:id/resolve` | `requireSupervisor`  | Marks `status='resolved'`, records who + when + optional notes. |

Request body for trigger (all optional):
```ts
{ latitude?: number; longitude?: number; accuracy?: number; shiftId?: string }
```

SSE broadcast payload:
```json
{ "type": "panic", "panicId": "<id>", "guardId": "<id>", "lat": <number|null>, "lng": <number|null>, "ts": "<ISO timestamp>" }
```

**Mobile client** (removed — restore from this doc)

Service stub was `api.panic.*` in [apps/mobile/src/services/api.ts](apps/mobile/src/services/api.ts):

```ts
panic: {
  trigger: (data: { shiftId?: string; latitude?: number; longitude?: number; accuracy?: number }) =>
    request<{ data: any }>('/panic', { method: 'POST', body: JSON.stringify(data) }),
  list: () => request<{ data: any[] }>('/panic'),
  resolve: (id: string, notes?: string) =>
    request<{ data: any }>(`/panic/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
}
```

**Intended UX** (never fully wired)

- Big red PANIC button on the guard's `Home` (dashboard) page, only visible
  while a shift was `active`.
- On press: a 3-second hold-to-confirm to avoid accidental triggers, then call
  `api.panic.trigger({ shiftId, latitude, longitude, accuracy })` using the
  device's current GPS.
- Supervisor live map (and supervisor dashboard) was meant to surface incoming
  panic events via the SSE `panic` event type — show a red modal on top of the
  map with the guard's location and an Acknowledge button.

### How to restore

1. Recreate [apps/api/src/routes/panic.ts](apps/api/src/routes/panic.ts) using
   the endpoint table above. The schema imports needed:
   ```ts
   import { db, panicEvents } from '@secureops/db'
   import { eq, and, desc } from 'drizzle-orm'
   import { requireAuth, requireSupervisor } from '../lib/auth'
   import { redisPublisher } from '../lib/redis'
   ```
2. In [apps/api/src/server.ts](apps/api/src/server.ts):
   ```ts
   import { panicRoutes } from './routes/panic'
   // ...
   await app.register(panicRoutes, { prefix: '/api/panic' })
   ```
3. Re-add the `panic` block to `api` in
   [apps/mobile/src/services/api.ts](apps/mobile/src/services/api.ts) using
   the snippet above.
4. Add a `PanicButton` component to the guard dashboard. On mount, subscribe
   to `useAuthStore` to get the active shift id; on press-and-hold (3s), call
   `Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 })`
   from `@capacitor/geolocation`, then `api.panic.trigger(...)`.
5. On the supervisor side, the existing SSE consumer in
   [apps/mobile/src/components/TabLayout.tsx](apps/mobile/src/components/TabLayout.tsx)
   (`SupervisorMapPage`'s `stream()` function) already buffers `data: ` lines —
   add a branch for `evt.type === 'panic'` to render an overlay.

The DB schema export is also gone — restore [packages/db/src/schema/panic-events.ts](packages/db/src/schema/panic-events.ts)
from the snippet at the end of this doc and re-add `export * from './panic-events'`
to [packages/db/src/schema/index.ts](packages/db/src/schema/index.ts).

### Drizzle schema (for restore)

```ts
// packages/db/src/schema/panic-events.ts
import { pgTable, text, timestamp, doublePrecision, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { shifts } from './shifts'
import { createId } from '../lib/id'

export const panicStatusEnum = pgEnum('panic_status', ['active', 'acknowledged', 'resolved'])

export const panicEvents = pgTable('panic_events', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  guardId: text('guard_id').notNull().references(() => users.id),
  shiftId: text('shift_id').references(() => shifts.id),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  accuracy: doublePrecision('accuracy'),
  status: panicStatusEnum('status').notNull().default('active'),
  acknowledgedBy: text('acknowledged_by').references(() => users.id),
  acknowledgedAt: timestamp('acknowledged_at'),
  resolvedBy: text('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  notes: text('notes'),
  triggeredAt: timestamp('triggered_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type PanicEvent = typeof panicEvents.$inferSelect
export type NewPanicEvent = typeof panicEvents.$inferInsert
```

---

## Selfie review approval workflow

**Removed:** 2026-05-20

Supervisors used to approve or flag each check-in selfie a guard submitted.
The selfie itself still happens — guards capture a selfie on check-in and we
store it for audit — but the **approval step** (the review queue, the
Approve/Flag buttons, the "Pending Review" / "To Review" counters) was ripped
out because:

- Guards can start their shift before any selfie clears (the gating was never
  enforced in practice).
- The supervisor team didn't want to spend time approving selfies.

### What's still there

- Guard check-in still captures and uploads a selfie to object storage via
  `POST /api/selfies` and `POST /api/attendance`.
- `selfie_records` and `attendance_records` tables still exist with their
  `review_status`, `review_note`, `reviewed_by`, `reviewed_at` columns —
  they're just always `pending` / `null` now. Left in place so existing
  selfie history isn't lost; we can drop the columns later if we never
  bring this back.
- Tenant **Guards / [id]** still renders a read-only review badge if any
  historical record has a non-null status — also kept for audit.

### What was removed

**Backend** (removed — restore from this doc)

- `PATCH /api/selfies/:id/review` in [apps/api/src/routes/selfies.ts](apps/api/src/routes/selfies.ts):
  ```ts
  const reviewSchema = z.object({
    status: z.enum(['approved', 'flagged']),
    note: z.string().optional(),
  })

  fastify.patch('/:id/review', { preHandler: requireSupervisor }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { tenantId: string; sub: string }
    const body = reviewSchema.parse(request.body)
    const [updated] = await db
      .update(selfieRecords)
      .set({
        reviewStatus: body.status,
        reviewNote: body.note ?? null,
        reviewedBy: payload.sub,
        reviewedAt: new Date(),
      })
      .where(and(eq(selfieRecords.id, id), eq(selfieRecords.tenantId, payload.tenantId)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found', message: 'Selfie not found', statusCode: 404 })
    // Mirror onto attendance_record
    if (updated.attendanceRecordId) {
      await db.update(attendanceRecords).set({
        selfieReviewStatus: body.status,
        selfieReviewNote: body.note ?? null,
        selfieReviewedBy: payload.sub,
        selfieReviewedAt: new Date(),
      }).where(eq(attendanceRecords.id, updated.attendanceRecordId))
    }
    return reply.send({ data: updated })
  })
  ```

- `PATCH /api/attendance/:id/review` in [apps/api/src/routes/attendance.ts](apps/api/src/routes/attendance.ts) — same shape, writes directly to `attendance_records`. Restore the `reviewSchema` const at the top of the file too.

- `reviewStatus` query filter on `GET /api/selfies` (the listing endpoint).

**Tenant portal** (removed)

- `tdApi.guardStatus.reviewSelfie(attendanceId, { status, note })` in [apps/tenant/src/lib/api.ts](apps/tenant/src/lib/api.ts).
- The entire **Approve / Flag** UI on [apps/tenant/src/app/guard-status/page.tsx](apps/tenant/src/app/guard-status/page.tsx): the selfie modal, the buttons, the `handleReview` handler, the `pendingReview` / `flaggedCount` counters, the "Pending review" filter chip.
- The **"Pending Review"** stat card on [apps/tenant/src/app/dashboard/page.tsx](apps/tenant/src/app/dashboard/page.tsx).

**Mobile app** (already removed in earlier commit)

- The supervisor dashboard's "To Review" stat card — replaced with the new "Missing from shift" insight.

### How to restore

1. Re-add `PATCH /api/selfies/:id/review` and `PATCH /api/attendance/:id/review` (copy the route blocks above). Both routes already use schemas/types that exist.
2. Re-add `tdApi.guardStatus.reviewSelfie` in [apps/tenant/src/lib/api.ts](apps/tenant/src/lib/api.ts):
   ```ts
   reviewSelfie: (attendanceId: string, body: { status: 'approved' | 'flagged'; note?: string }) =>
     request<{ data: any }>(`/attendance/${attendanceId}/review`, {
       method: 'PATCH', body: JSON.stringify(body),
     }),
   ```
3. On the tenant Guard Status page, restore the selfie modal — it lived inside the row's `expandable` panel and called `tdApi.guardStatus.reviewSelfie(row.attendanceId, { status, note })` on submit. The filter chips (`all` / `pending review` / `flagged`) and the `pendingReview` counter need to come back too.
4. On the tenant Dashboard, restore the "Pending Review" stat card — it counts `guardStatus[].selfieReviewStatus === 'pending' && guardStatus[].selfieUrl`.
5. On mobile, the supervisor `SupervisorDashboard` can take "To Review" back as a third stat alongside On Shift / Online.

The DB columns (`selfie_records.review_status`, `attendance_records.selfie_review_status`, plus their `reviewed_by`/`reviewed_at`/`review_note` siblings) were intentionally NOT dropped — they exist in [packages/db/src/migrations/0000_vengeful_logan.sql](packages/db/src/migrations/0000_vengeful_logan.sql) and the Drizzle schema, so restoring the routes is enough to get the feature working again without a migration.
