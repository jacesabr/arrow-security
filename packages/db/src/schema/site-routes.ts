import { pgTable, text, timestamp, integer, primaryKey } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { sites } from './sites'

/**
 * Cached site-to-site driving estimates from Mapbox Directions API.
 *
 * One row per ordered (from, to) pair. Looked up when computing supervisor
 * gas reimbursement on /accounting: for each pair of consecutive supervisor
 * shifts within 4 hours of each other, we sum the cached duration to get
 * estimated driving time.
 *
 * Cache strategy:
 *   - First request for a pair: hit Mapbox, insert row with computed_at = now.
 *   - Subsequent requests: read from cache.
 *   - Recomputed when computed_at is older than ~6 months (handled in lib).
 *   - Site lat/lng updates do NOT cascade-invalidate; sites move rarely. A
 *     manual DELETE is fine if a route becomes obviously wrong.
 *
 * tenantId is denormalised in so we can scope cache queries to the tenant
 * without joining sites — keeps the hot path cheap.
 */
export const siteRoutes = pgTable('site_routes', {
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  fromSiteId: text('from_site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  toSiteId: text('to_site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  durationSeconds: integer('duration_seconds').notNull(),
  distanceMeters: integer('distance_meters').notNull(),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.fromSiteId, table.toSiteId] }),
}))

export type SiteRoute = typeof siteRoutes.$inferSelect
export type NewSiteRoute = typeof siteRoutes.$inferInsert
