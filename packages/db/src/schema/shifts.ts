import { pgTable, text, timestamp, pgEnum, boolean, integer, real } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { createId } from '../lib/id'

export const shiftStatusEnum = pgEnum('shift_status', ['scheduled', 'active', 'completed', 'missed'])

export const shifts = pgTable('shifts', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id),
  guardId: text('guard_id').notNull().references(() => users.id),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  status: shiftStatusEnum('status').notNull().default('scheduled'),
  notes: text('notes'),
  published: boolean('published').notNull().default(false),
  walkingMeters: integer('walking_meters'),
  drivingMeters: integer('driving_meters'),
  walkingSeconds: integer('walking_seconds'),
  drivingSeconds: integer('driving_seconds'),
  stationarySeconds: integer('stationary_seconds'),
  meanSpeedMs: real('mean_speed_ms'),
  idleBaselineMs: real('idle_baseline_ms'),
  movementComputedAt: timestamp('movement_computed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Shift = typeof shifts.$inferSelect
export type NewShift = typeof shifts.$inferInsert
