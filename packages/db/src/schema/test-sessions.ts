import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { createId } from '../lib/id'

// Movement-classifier test sessions, started from the Activity tab's "Test
// movement tracking" panel. Server-backed so the data survives the app being
// closed mid-test. Samples are stored inline as JSONB — sessions are short
// (typically a few minutes), so a separate samples table would be overkill
// for the ~hundreds-of-rows-per-session scale.
export const testSessions = pgTable('test_sessions', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  walkingSeconds: integer('walking_seconds').notNull().default(0),
  drivingSeconds: integer('driving_seconds').notNull().default(0),
  idleSeconds: integer('idle_seconds').notNull().default(0),
  // Each entry: { ts, activity: 'walking'|'driving'|'idle'|'unknown',
  //               confidence: 0-100, lat?, lng?, speed? }
  samples: jsonb('samples').notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type TestSession = typeof testSessions.$inferSelect
export type NewTestSession = typeof testSessions.$inferInsert
