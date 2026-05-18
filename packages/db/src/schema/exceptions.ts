import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { shifts } from './shifts'
import { createId } from '../lib/id'

export const exceptionCodeEnum = pgEnum('exception_code', [
  'missed_punch',
  'late_in',
  'early_out',
  'long_break',
  'absent',
  'overtime',
  'no_show',
  'unauthorized_absence',
])

export const exceptionSeverityEnum = pgEnum('exception_severity', ['info', 'warning', 'critical'])

export const shiftExceptions = pgTable('shift_exceptions', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  shiftId: text('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  guardId: text('guard_id').notNull().references(() => users.id),
  code: exceptionCodeEnum('code').notNull(),
  severity: exceptionSeverityEnum('severity').notNull().default('warning'),
  description: text('description'),
  resolvedBy: text('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type ShiftException = typeof shiftExceptions.$inferSelect
export type NewShiftException = typeof shiftExceptions.$inferInsert
