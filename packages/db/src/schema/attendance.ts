import { pgTable, text, timestamp, doublePrecision, real, pgEnum, boolean } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { createId } from '../lib/id'

export const attendanceTypeEnum = pgEnum('attendance_type', ['check_in', 'check_out'])
export const attendanceMethodEnum = pgEnum('attendance_method', ['face', 'qr', 'manual'])

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type AttendanceRecord = typeof attendanceRecords.$inferSelect
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert
