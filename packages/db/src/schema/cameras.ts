import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { createId } from '../lib/id'

export const cameraStatusEnum = pgEnum('camera_status', ['online', 'offline', 'error'])

export const cameras = pgTable('cameras', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  rtspUrl: text('rtsp_url').notNull(),
  frigateId: text('frigate_id'),
  go2rtcStream: text('go2rtc_stream'),
  status: cameraStatusEnum('status').notNull().default('offline'),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Camera = typeof cameras.$inferSelect
export type NewCamera = typeof cameras.$inferInsert
