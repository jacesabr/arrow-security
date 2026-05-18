import { pgTable, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { createId } from '../lib/id'

// Each field in the template schema:
// { id: string, label: string, type: 'text'|'number'|'select'|'checkbox'|'textarea', required?: boolean, options?: string[] }

export const incidentFormTemplates = pgTable('incident_form_templates', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  fields: jsonb('fields').notNull().default([]), // Array of field definition objects
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type IncidentFormTemplate = typeof incidentFormTemplates.$inferSelect
export type NewIncidentFormTemplate = typeof incidentFormTemplates.$inferInsert
