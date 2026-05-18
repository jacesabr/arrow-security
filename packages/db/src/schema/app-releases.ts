import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core'
import { createId } from '../lib/id'

export const appReleases = pgTable('app_releases', {
  id: text('id').primaryKey().$defaultFn(createId),
  version: text('version').notNull().unique(),
  bundleData: text('bundle_data').notNull(), // base64-encoded zip of dist/
  bundleSize: integer('bundle_size').notNull(), // original bytes before base64
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type AppRelease = typeof appReleases.$inferSelect
