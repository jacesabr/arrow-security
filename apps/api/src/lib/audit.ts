import { createHmac } from 'crypto'
import { randomBytes } from 'crypto'
import { db, auditLog } from '@secureops/db'
import { eq, desc } from 'drizzle-orm'

// Inlined createId — identical to packages/db/src/lib/id.ts
function createId(): string {
  return randomBytes(12).toString('base64url')
}

const AUDIT_SECRET = process.env.AUDIT_SECRET ?? 'change-me-in-production'

interface AuditOptions {
  tenantId: string
  userId?: string | null
  action: string              // e.g. 'user.login', 'incident.created', 'shift.status_changed'
  resourceType?: string       // e.g. 'user', 'incident', 'shift'
  resourceId?: string
  payload?: Record<string, unknown>
}

export async function appendAuditEntry(opts: AuditOptions): Promise<void> {
  try {
    const [last] = await db
      .select({ id: auditLog.id, hmac: auditLog.hmac })
      .from(auditLog)
      .where(eq(auditLog.tenantId, opts.tenantId))
      .orderBy(desc(auditLog.createdAt))
      .limit(1)

    const newId = createId()
    const prevHmac = last?.hmac ?? ''
    const data = [
      prevHmac,
      newId,
      opts.tenantId,
      opts.userId ?? '',
      opts.action,
      JSON.stringify(opts.payload ?? {}),
    ].join('|')

    const hmac = createHmac('sha256', AUDIT_SECRET).update(data).digest('hex')

    await db.insert(auditLog).values({
      id: newId,
      tenantId: opts.tenantId,
      userId: opts.userId ?? null,
      action: opts.action,
      resourceType: opts.resourceType ?? null,
      resourceId: opts.resourceId ?? null,
      payload: opts.payload ?? {},
      hmac,
      prevEntryId: last?.id ?? null,
    })
  } catch {
    // Never let audit log failure break the main request
  }
}
