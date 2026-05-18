import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { createId } from '../lib/id'

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  payload: jsonb('payload'),
  hmac: text('hmac').notNull(),
  prevEntryId: text('prev_entry_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type AuditEntry = typeof auditLog.$inferSelect
