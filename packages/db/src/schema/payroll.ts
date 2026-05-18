import { pgTable, text, timestamp, integer, doublePrecision, pgEnum, boolean } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { createId } from '../lib/id'

export const payrollPeriodStatusEnum = pgEnum('payroll_period_status', ['draft', 'processing', 'finalized'])
export const payrollRecordStatusEnum = pgEnum('payroll_record_status', ['pending', 'approved', 'paid'])

// One payroll run per month per tenant
export const payrollPeriods = pgTable('payroll_periods', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  status: payrollPeriodStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// One record per guard per payroll period — all monetary values in paise (1/100 rupee)
export const payrollRecords = pgTable('payroll_records', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  periodId: text('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  guardId: text('guard_id').notNull().references(() => users.id),
  // Attendance summary
  scheduledShifts: integer('scheduled_shifts').notNull().default(0),
  completedShifts: integer('completed_shifts').notNull().default(0),
  totalHours: doublePrecision('total_hours').notNull().default(0),
  // Pay inputs
  dailyRatePaise: integer('daily_rate_paise').notNull().default(0),
  grossPayPaise: integer('gross_pay_paise').notNull().default(0),
  // Statutory deductions (Indian payroll)
  // ESI: applicable when gross <= 21000/month; employee 0.75%, employer 3.25%
  esiEligible: boolean('esi_eligible').notNull().default(false),
  esiEmployeePaise: integer('esi_employee_paise').notNull().default(0),
  esiEmployerPaise: integer('esi_employer_paise').notNull().default(0),
  // PF: 12% of basic (basic capped at ₹15000); both employee and employer
  pfEmployeePaise: integer('pf_employee_paise').notNull().default(0),
  pfEmployerPaise: integer('pf_employer_paise').notNull().default(0),
  // Adjustments
  bonusPaise: integer('bonus_paise').notNull().default(0),
  otherDeductionsPaise: integer('other_deductions_paise').notNull().default(0),
  // netPay = grossPay - esiEmployee - pfEmployee - otherDeductions + bonus
  netPayPaise: integer('net_pay_paise').notNull().default(0),
  status: payrollRecordStatusEnum('status').notNull().default('pending'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type PayrollPeriod = typeof payrollPeriods.$inferSelect
export type NewPayrollPeriod = typeof payrollPeriods.$inferInsert
export type PayrollRecord = typeof payrollRecords.$inferSelect
export type NewPayrollRecord = typeof payrollRecords.$inferInsert
