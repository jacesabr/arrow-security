import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createId } from '../lib/id'

export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey().$defaultFn(createId),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
