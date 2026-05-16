import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Shift = typeof shifts.$inferSelect
export type NewShift = typeof shifts.$inferInsert
