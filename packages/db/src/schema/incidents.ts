import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'
import { users } from './users'
import { createId } from '../lib/id'

export const incidentSeverityEnum = pgEnum('incident_severity', ['low', 'medium', 'high', 'critical'])
export const incidentStatusEnum = pgEnum('incident_status', [
  'open',
  'acknowledged',
  'in_progress',
  'resolved',
  'closed',
])

export const incidents = pgTable('incidents', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sites.id),
  reportedBy: text('reported_by').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  severity: incidentSeverityEnum('severity').notNull().default('medium'),
  status: incidentStatusEnum('status').notNull().default('open'),
  zammadTicketId: text('zammad_ticket_id'),
  slaDeadline: timestamp('sla_deadline'),
  acknowledgedAt: timestamp('acknowledged_at'),
  resolvedAt: timestamp('resolved_at'),
  closedAt: timestamp('closed_at'),
  mediaUrls: text('media_urls').array(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Incident = typeof incidents.$inferSelect
export type NewIncident = typeof incidents.$inferInsert
