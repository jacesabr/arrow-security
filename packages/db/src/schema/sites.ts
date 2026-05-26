import { pgTable, text, timestamp, doublePrecision, integer, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { clients } from './clients'
import { createId } from '../lib/id'

export const siteStatusEnum = pgEnum('site_status', ['pending', 'active', 'inactive'])

export const sites = pgTable('sites', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Nullable: pending sites auto-created by a check-in at an unknown GPS have
  // no client yet; admin picks one when confirming on /sites/:id.
  clientId: text('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  geofenceRadiusMeters: integer('geofence_radius_meters').notNull().default(200),
  frigateUrl: text('frigate_url'),
  go2rtcUrl: text('go2rtc_url'),
  // Per-site briefing fields collected at confirmation time. All optional —
  // admin can leave them blank if not yet known.
  accessInstructions: text('access_instructions'),
  gateCode: text('gate_code'),
  contactPhone: text('contact_phone'),
  hazards: text('hazards'),
  status: siteStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Site = typeof sites.$inferSelect
export type NewSite = typeof sites.$inferInsert
