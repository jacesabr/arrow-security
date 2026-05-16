import { pgTable, text, timestamp, doublePrecision, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { createId } from '../lib/id'

export const patrolScanMethodEnum = pgEnum('patrol_scan_method', ['qr', 'nfc', 'manual'])

export const checkpoints = pgTable('checkpoints', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  qrCode: text('qr_code').notNull().unique(),
  nfcTagId: text('nfc_tag_id'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  orderInRoute: text('order_in_route'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const patrols = pgTable('patrols', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id),
  guardId: text('guard_id').notNull().references(() => users.id),
  shiftId: text('shift_id'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  status: text('status').notNull().default('in_progress'),
})

export const patrolScans = pgTable('patrol_scans', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  patrolId: text('patrol_id').notNull().references(() => patrols.id, { onDelete: 'cascade' }),
  checkpointId: text('checkpoint_id').notNull().references(() => checkpoints.id),
  scannedAt: timestamp('scanned_at').defaultNow().notNull(),
  method: patrolScanMethodEnum('method').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
})

export type Checkpoint = typeof checkpoints.$inferSelect
export type NewCheckpoint = typeof checkpoints.$inferInsert
export type Patrol = typeof patrols.$inferSelect
export type PatrolScan = typeof patrolScans.$inferSelect
