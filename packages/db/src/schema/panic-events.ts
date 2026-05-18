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
