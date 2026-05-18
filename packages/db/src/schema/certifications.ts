import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { createId } from '../lib/id'

export const certStatusEnum = pgEnum('cert_status', ['active', 'expiring_soon', 'expired'])

export const guardCertifications = pgTable('guard_certifications', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  guardId: text('guard_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  certType: text('cert_type').notNull(),
  certNumber: text('cert_number'),
  issuedBy: text('issued_by'),
  issuedAt: timestamp('issued_at'),
  expiresAt: timestamp('expires_at'),
  status: certStatusEnum('status').notNull().default('active'),
  documentUrl: text('document_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type GuardCertification = typeof guardCertifications.$inferSelect
export type NewGuardCertification = typeof guardCertifications.$inferInsert
