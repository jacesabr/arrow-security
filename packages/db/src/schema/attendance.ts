import { pgTable, text, timestamp, doublePrecision, real, pgEnum, boolean } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { createId } from '../lib/id'

export const attendanceTypeEnum = pgEnum('attendance_type', ['check_in', 'check_out'])
export const attendanceMethodEnum = pgEnum('attendance_method', ['face', 'qr', 'manual'])
export const selfieReviewStatusEnum = pgEnum('selfie_review_status', ['pending', 'approved', 'flagged'])

export const attendanceRecords = pgTable('attendance_records', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id),
  guardId: text('guard_id').notNull().references(() => users.id),
  type: attendanceTypeEnum('type').notNull(),
  method: attendanceMethodEnum('method').notNull(),
  verifiedAt: timestamp('verified_at').defaultNow().notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  selfieUrl: text('selfie_url'),
  livenessScore: real('liveness_score'),
  isWithinGeofence: boolean('is_within_geofence'),
  selfieReviewStatus: selfieReviewStatusEnum('selfie_review_status'),
  selfieReviewNote: text('selfie_review_note'),
  selfieReviewedBy: text('selfie_reviewed_by').references(() => users.id),
  selfieReviewedAt: timestamp('selfie_reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type AttendanceRecord = typeof attendanceRecords.$inferSelect
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert
