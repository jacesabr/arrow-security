import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { incidents } from './incidents'
import { incidentFormTemplates } from './incident-form-templates'
import { users } from './users'
import { createId } from '../lib/id'

export const incidentFormResponses = pgTable('incident_form_responses', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  incidentId: text('incident_id').notNull().references(() => incidents.id, { onDelete: 'cascade' }),
  templateId: text('template_id').notNull().references(() => incidentFormTemplates.id),
  submittedBy: text('submitted_by').notNull().references(() => users.id),
  responses: jsonb('responses').notNull().default({}), // { fieldId: value }
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type IncidentFormResponse = typeof incidentFormResponses.$inferSelect
export type NewIncidentFormResponse = typeof incidentFormResponses.$inferInsert
