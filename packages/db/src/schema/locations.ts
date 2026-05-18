import { pgTable, text, doublePrecision, timestamp, integer } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { shifts } from './shifts'
import { createId } from '../lib/id'

export const guardLocations = pgTable('guard_locations', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  guardId: text('guard_id').notNull().references(() => users.id),
  shiftId: text('shift_id').references(() => shifts.id),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  accuracy: doublePrecision('accuracy'),
  heading: doublePrecision('heading'),
  speed: doublePrecision('speed'),
  altitude: doublePrecision('altitude'),
  h3Res8: text('h3_res8'),
  battery: integer('battery'),
  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
})

export type GuardLocation = typeof guardLocations.$inferSelect
export type NewGuardLocation = typeof guardLocations.$inferInsert
