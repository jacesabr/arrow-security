import { pgTable, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'

export const supervisorSites = pgTable('supervisor_sites', {
  supervisorId: text('supervisor_id').notNull(),
  siteId: text('site_id').notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.supervisorId, table.siteId] }),
}))
