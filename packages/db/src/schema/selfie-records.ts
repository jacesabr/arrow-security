import { pgTable, text, timestamp, doublePrecision } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { sites } from './sites'
import { attendanceRecords, attendanceTypeEnum, selfieReviewStatusEnum } from './attendance'
import { createId } from '../lib/id'

export const selfieRecords = pgTable('selfie_records', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  guardId: text('guard_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  attendanceRecordId: text('attendance_record_id').references(() => attendanceRecords.id, { onDelete: 'set null' }),
  checkType: attendanceTypeEnum('check_type').notNull(),
  imageData: text('image_data').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
  reviewStatus: selfieReviewStatusEnum('review_status').notNull().default('pending'),
  reviewNote: text('review_note'),
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
})

export type SelfieRecord = typeof selfieRecords.$inferSelect
export type NewSelfieRecord = typeof selfieRecords.$inferInsert
