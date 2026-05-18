import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { shifts } from './shifts'
import { createId } from '../lib/id'

export const passdowns = pgTable('passdowns', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id),
  fromGuardId: text('from_guard_id').notNull().references(() => users.id),
  toGuardId: text('to_guard_id').references(() => users.id),
  fromShiftId: text('from_shift_id').references(() => shifts.id),
  notes: text('notes').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Passdown = typeof passdowns.$inferSelect
export type NewPassdown = typeof passdowns.$inferInsert
