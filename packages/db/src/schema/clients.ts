import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { createId } from '../lib/id'

export const clientStatusEnum = pgEnum('client_status', ['active', 'inactive'])

export const clients = pgTable('clients', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  frappeCustId: text('frappe_cust_id'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  status: clientStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
