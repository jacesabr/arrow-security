import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { createId } from '../lib/id'

export const shiftTemplates = pgTable('shift_templates', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id),
  guardId: text('guard_id').notNull().references(() => users.id),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Sunday … 6=Saturday
  startHour: integer('start_hour').notNull(),
  startMinute: integer('start_minute').notNull().default(0),
  endHour: integer('end_hour').notNull(),
  endMinute: integer('end_minute').notNull().default(0),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type ShiftTemplate = typeof shiftTemplates.$inferSelect
export type NewShiftTemplate = typeof shiftTemplates.$inferInsert
