import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db, payrollPeriods, payrollRecords, shifts, users, shiftExceptions } from '@secureops/db'
import { eq, and, gte, lte, count, isNull, inArray } from 'drizzle-orm'
import { requireAuth, requireTenantAdmin } from '../lib/auth'

const ESI_GROSS_CEILING_PAISE = 2_100_000  // ₹21,000/month — above this, ESI does not apply
const ESI_EMPLOYEE_RATE = 0.0075           // 0.75%
const ESI_EMPLOYER_RATE = 0.0325           // 3.25%
const PF_BASIC_CAP_PAISE = 1_500_000       // PF applies on basic up to ₹15,000
const PF_RATE = 0.12                        // 12% each side

function calcDeductions(grossPaise: number, dailyRatePaise: number) {
  const esiEligible = grossPaise <= ESI_GROSS_CEILING_PAISE
  const esiEmployeePaise = esiEligible ? Math.round(grossPaise * ESI_EMPLOYEE_RATE) : 0
  const esiEmployerPaise = esiEligible ? Math.round(grossPaise * ESI_EMPLOYER_RATE) : 0

  // PF basic = min(gross, cap); guards on daily rate — basic treated as gross capped at ₹15k
  const pfBasicPaise = Math.min(grossPaise, PF_BASIC_CAP_PAISE)
  const pfEmployeePaise = Math.round(pfBasicPaise * PF_RATE)
  const pfEmployerPaise = Math.round(pfBasicPaise * PF_RATE)

  return { esiEligible, esiEmployeePaise, esiEmployerPaise, pfEmployeePaise, pfEmployerPaise }
}

export const payrollRoutes: FastifyPluginAsync = async (fastify) => {
  // ── List periods ──────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const periods = await db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.tenantId, tenantId))
      .orderBy(payrollPeriods.periodStart)
    return reply.send({ data: periods })
  })

  // ── Create period ─────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = z.object({
      periodStart: z.string().datetime(),
      periodEnd: z.string().datetime(),
    }).parse(request.body)

    const [period] = await db
      .insert(payrollPeriods)
      .values({ tenantId, periodStart: new Date(body.periodStart), periodEnd: new Date(body.periodEnd) })
      .returning()
    return reply.code(201).send({ data: period })
  })

  // ── Get period + its records ───────────────────────────────────────────────
  fastify.get('/:id', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as { tenantId: string }

    const [period] = await db
      .select()
      .from(payrollPeriods)
      .where(and(eq(payrollPeriods.id, id), eq(payrollPeriods.tenantId, tenantId)))
      .limit(1)
    if (!period) return reply.code(404).send({ error: 'Not found', message: 'Payroll period not found', statusCode: 404 })

    const records = await db
      .select({
        record: payrollRecords,
        guardName: users.name,
        guardEmail: users.email,
      })
      .from(payrollRecords)
      .innerJoin(users, eq(payrollRecords.guardId, users.id))
      .where(and(eq(payrollRecords.periodId, id), eq(payrollRecords.tenantId, tenantId)))

    return reply.send({ data: { period, records } })
  })

  // ── Calculate — derive records from shifts in the period ──────────────────
  // Pulls all completed shifts in the period window, groups by guard, applies daily rate,
  // computes ESI + PF, and upserts payroll_records. Safe to re-run (idempotent).
  fastify.post('/:id/calculate', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as { tenantId: string }

    const [period] = await db
      .select()
      .from(payrollPeriods)
      .where(and(eq(payrollPeriods.id, id), eq(payrollPeriods.tenantId, tenantId)))
      .limit(1)
    if (!period) return reply.code(404).send({ error: 'Not found', message: 'Payroll period not found', statusCode: 404 })
    if (period.status === 'finalized') {
      return reply.code(409).send({ error: 'Conflict', message: 'Cannot recalculate a finalized period', statusCode: 409 })
    }

    // Parse daily rate overrides from body (optional map of guardId -> dailyRatePaise)
    const body = z.object({
      dailyRates: z.record(z.string(), z.number().int().positive()).optional(),
    }).parse(request.body ?? {})

    // Fetch all guards for this tenant
    const guards = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.role, 'guard')))

    // Fetch all shifts within the period window
    const periodShifts = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.tenantId, tenantId),
          gte(shifts.startsAt, period.periodStart),
          lte(shifts.endsAt, period.periodEnd),
        )
      )

    // Group shifts by guardId
    const shiftsByGuard = new Map<string, typeof periodShifts>()
    for (const shift of periodShifts) {
      const existing = shiftsByGuard.get(shift.guardId) ?? []
      existing.push(shift)
      shiftsByGuard.set(shift.guardId, existing)
    }

    // Delete existing records for this period so we recalculate fresh
    await db.delete(payrollRecords).where(and(eq(payrollRecords.periodId, id), eq(payrollRecords.tenantId, tenantId)))

    const upserted: (typeof payrollRecords.$inferSelect)[] = []

    for (const guard of guards) {
      const guardShifts = shiftsByGuard.get(guard.id) ?? []
      const scheduled = guardShifts.length
      const completed = guardShifts.filter(s => s.status === 'completed').length

      // Hours = sum of (endsAt - startsAt) for completed shifts
      const totalHours = guardShifts
        .filter(s => s.status === 'completed')
        .reduce((sum, s) => {
          const ms = s.endsAt.getTime() - s.startsAt.getTime()
          return sum + ms / 3_600_000
        }, 0)

      const dailyRatePaise = body.dailyRates?.[guard.id] ?? 60_000_00 // default ₹600/day

      // Gross = completed shifts * daily rate (regardless of actual hours — shift-based pay)
      const grossPayPaise = completed * dailyRatePaise

      const { esiEligible, esiEmployeePaise, esiEmployerPaise, pfEmployeePaise, pfEmployerPaise } =
        calcDeductions(grossPayPaise, dailyRatePaise)

      const netPayPaise = grossPayPaise - esiEmployeePaise - pfEmployeePaise

      const [record] = await db
        .insert(payrollRecords)
        .values({
          tenantId,
          periodId: id,
          guardId: guard.id,
          scheduledShifts: scheduled,
          completedShifts: completed,
          totalHours,
          dailyRatePaise,
          grossPayPaise,
          esiEligible,
          esiEmployeePaise,
          esiEmployerPaise,
          pfEmployeePaise,
          pfEmployerPaise,
          netPayPaise,
        })
        .returning()
      upserted.push(record)
    }

    // Move period to processing
    await db
      .update(payrollPeriods)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(payrollPeriods.id, id))

    return reply.send({ data: upserted })
  })

  // ── Patch a single record (bonus, deduction adjustments, notes) ───────────
  fastify.patch('/records/:recordId', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { recordId } = request.params as { recordId: string }
    const { tenantId } = request.user as { tenantId: string }
    const body = z.object({
      bonusPaise: z.number().int().min(0).optional(),
      otherDeductionsPaise: z.number().int().min(0).optional(),
      dailyRatePaise: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }).parse(request.body)

    const [existing] = await db
      .select()
      .from(payrollRecords)
      .where(and(eq(payrollRecords.id, recordId), eq(payrollRecords.tenantId, tenantId)))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'Not found', message: 'Record not found', statusCode: 404 })

    const bonusPaise = body.bonusPaise ?? existing.bonusPaise
    const otherDeductionsPaise = body.otherDeductionsPaise ?? existing.otherDeductionsPaise
    const netPayPaise = existing.grossPayPaise - existing.esiEmployeePaise - existing.pfEmployeePaise - otherDeductionsPaise + bonusPaise

    const [updated] = await db
      .update(payrollRecords)
      .set({ bonusPaise, otherDeductionsPaise, netPayPaise, notes: body.notes ?? existing.notes, updatedAt: new Date() })
      .where(and(eq(payrollRecords.id, recordId), eq(payrollRecords.tenantId, tenantId)))
      .returning()
    return reply.send({ data: updated })
  })

  // ── Finalize period — locks it from further changes ───────────────────────
  fastify.post('/:id/finalize', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as { tenantId: string }

    const [period] = await db
      .select()
      .from(payrollPeriods)
      .where(and(eq(payrollPeriods.id, id), eq(payrollPeriods.tenantId, tenantId)))
      .limit(1)
    if (!period) return reply.code(404).send({ error: 'Not found', message: 'Payroll period not found', statusCode: 404 })

    // Block finalization if any guard in this period has unresolved shift exceptions
    const records = await db
      .select({ guardId: payrollRecords.guardId })
      .from(payrollRecords)
      .where(and(eq(payrollRecords.periodId, id), eq(payrollRecords.tenantId, tenantId)))

    if (records.length > 0) {
      const guardIds = records.map(r => r.guardId)
      const unresolved = await db
        .select({ id: shiftExceptions.id, guardId: shiftExceptions.guardId, code: shiftExceptions.code })
        .from(shiftExceptions)
        .where(
          and(
            eq(shiftExceptions.tenantId, tenantId),
            isNull(shiftExceptions.resolvedAt),
            inArray(shiftExceptions.guardId, guardIds)
          )
        )
      if (unresolved.length > 0) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `${unresolved.length} unresolved shift exception(s) must be cleared before finalizing`,
          statusCode: 409,
          unresolved: unresolved.map(u => ({ id: u.id, guardId: u.guardId, code: u.code })),
        })
      }
    }

    if (period.status === 'draft') {
      return reply.code(409).send({ error: 'Conflict', message: 'Run /calculate before finalizing', statusCode: 409 })
    }

    const [updated] = await db
      .update(payrollPeriods)
      .set({ status: 'finalized', updatedAt: new Date() })
      .where(eq(payrollPeriods.id, id))
      .returning()
    return reply.send({ data: updated })
  })
}
