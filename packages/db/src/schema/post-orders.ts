import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { shifts } from './shifts'
import { createId } from '../lib/id'

export const postOrders = pgTable('post_orders', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  version: text('version').notNull().default('1'),
  isActive: boolean('is_active').notNull().default(true),
  requiresAck: boolean('requires_ack').notNull().default(true),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const postOrderAcks = pgTable('post_order_acks', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  postOrderId: text('post_order_id').notNull().references(() => postOrders.id, { onDelete: 'cascade' }),
  guardId: text('guard_id').notNull().references(() => users.id),
  shiftId: text('shift_id').references(() => shifts.id),
  ackedAt: timestamp('acked_at').defaultNow().notNull(),
})

export type PostOrder = typeof postOrders.$inferSelect
export type NewPostOrder = typeof postOrders.$inferInsert
export type PostOrderAck = typeof postOrderAcks.$inferSelect
