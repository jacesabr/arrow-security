import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { createId } from '../lib/id'

export const tenantTierEnum = pgEnum('tenant_tier', ['bronze', 'silver', 'gold'])
export const tenantStatusEnum = pgEnum('tenant_status', ['trial', 'active', 'suspended'])

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey().$defaultFn(createId),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  tier: tenantTierEnum('tier').notNull().default('bronze'),
  frappeSiteUrl: text('frappe_site_url').notNull(),
  zammadUrl: text('zammad_url').notNull(),
  novuAppId: text('novu_app_id'),
  minioBucket: text('minio_bucket'),
  compreFaceAppKey: text('compreface_app_key'),
  status: tenantStatusEnum('status').notNull().default('trial'),
  mrr: text('mrr').default('0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
