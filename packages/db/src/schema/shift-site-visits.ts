import { pgTable, text, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { shifts } from './shifts'
import { createId } from '../lib/id'

/**
 * Materialised record of a guard's presence segments during a shift.
 *
 * Each row captures one continuous span where the guard was either:
 *   - inside a known site geofence (siteId set), or
 *   - outside all known geofences (siteId NULL = "off-site" / in transit)
 *
 * The currently-open segment for a shift is the row with exitedAt IS NULL.
 * Replays (GET /shifts/:id/replay) read these rows; raw guard_locations
 * remain the audit trail.
 *
 * Written by the geofence state machine in apps/api/src/lib/geofence-state.ts
 * as pings arrive in event-time order, so a retroactive offline-buffer flush
 * produces correct segment boundaries with backdated incidents when needed.
 *
 * NB: siteId NULL is the "off-site" sentinel — preferred over a separate
 *     kind enum because it composes naturally with foreign-key joins and
 *     makes the "where was the guard at time T" query a single row read.
 */
export const shiftSiteVisits = pgTable('shift_site_visits', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  shiftId: text('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  guardId: text('guard_id').notNull().references(() => users.id),
  // NULL siteId = off-site / in transit
  siteId: text('site_id').references(() => sites.id),
  enteredAt: timestamp('entered_at').notNull(),
  exitedAt: timestamp('exited_at'),
  enteredLat: doublePrecision('entered_lat'),
  enteredLng: doublePrecision('entered_lng'),
  exitedLat: doublePrecision('exited_lat'),
  exitedLng: doublePrecision('exited_lng'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shiftEnteredIdx: index('shift_site_visits_shift_entered_idx').on(table.shiftId, table.enteredAt),
  tenantGuardEnteredIdx: index('shift_site_visits_tenant_guard_entered_idx').on(table.tenantId, table.guardId, table.enteredAt),
  tenantSiteEnteredIdx: index('shift_site_visits_tenant_site_entered_idx').on(table.tenantId, table.siteId, table.enteredAt),
  // Partial index for "find the currently open visit for this shift" — hot path on every ping.
  openVisitIdx: index('shift_site_visits_open_idx').on(table.shiftId).where(sql`${table.exitedAt} IS NULL`),
}))

export type ShiftSiteVisit = typeof shiftSiteVisits.$inferSelect
export type NewShiftSiteVisit = typeof shiftSiteVisits.$inferInsert
