import { pgTable, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { createId } from '../lib/id'

export const userRoleEnum = pgEnum('user_role', [
  'platform_admin',
  'tenant_admin',
  'supervisor',
  'guard',
  'client_viewer',
])

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull(),
  passwordHash: text('password_hash'),
  faceEnrolled: boolean('face_enrolled').notNull().default(false),
  faceEmbeddingId: text('face_embedding_id'),
  profilePhotoKey: text('profile_photo_key'),
  fcmToken: text('fcm_token'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
