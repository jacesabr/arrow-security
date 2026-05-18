# Investigation 06 — TimeTrex Community Edition

**Evaluated:** May 2026  
**Repo mirror:** https://github.com/aydancoskun/timetrex-community-edition  
**Official site:** https://www.timetrex.com  
**Our stack for comparison:** Fastify 4 + TypeScript / PostgreSQL + Drizzle ORM / Next.js 16 / Ionic-Capacitor PWA

---

## Summary

TimeTrex is a mature (15+ year old), PHP-based, open-source workforce management suite covering scheduling, attendance (punch-in/out), payroll deduction calculation, accruals, HR, job costing, invoicing, and reporting. Its core strength is a deeply layered **policy engine** — overtime rules, break rules, meal rules, exception policies, premium pay rules, contributing shift filters — that rivals enterprise WFM products like Kronos/UKG.

**Critical caveat (October 2024):** TimeTrex officially discontinued the free on-site Community Edition. Existing installs keep working but receive no further security patches or updates. The AGPL-licensed source remains on GitHub/SourceForge but is essentially frozen.

**India payroll:** No ESI/PF support. Payroll deduction engine covers only US, Canada, and Costa Rica.

**Verdict: Mine heavily for ideas, especially the policy engine architecture. Do not run it. Do not copy code.**

---

## Stack & Dependencies

| Attribute | Value |
|-----------|-------|
| Language | PHP (78%), JavaScript (20%) |
| Database | PostgreSQL (primary; ADOdb abstraction layer used) |
| Framework | None — custom MVC with Factory/ListFactory class pattern |
| API | JSON REST (`/api/json/api.php?Class=X&Method=Y`) + legacy SOAP (`/api/soap/api.php`) |
| Frontend | Custom JavaScript (jQuery era) |
| License | **AGPL-3.0** (Community Edition source) |
| Paid tiers | Professional / Corporate / Enterprise — proprietary closed-source modules layered on top |
| Status | **Abandoned as FOSS as of October 1, 2024** — no more updates or security patches |

**AGPL flag:** Any code derived from TimeTrex CE must also be AGPL-licensed. We cannot copy their code directly into our MIT/proprietary stack. Ideas and patterns are fair game; literal code is not.

### Dependency highlights
- ADOdb (PHP database abstraction, multi-DB support — they standardized on PostgreSQL)
- Composer for PHP deps
- Schema versioned via `SystemSettingFactory::getSystemSettingValueByKey('schema_version_group_A')` — integer versions, not migration timestamps
- No ORM in the modern sense — raw SQL via ADOdb with hand-written Factory classes per entity

---

## Module Map

### Community Edition (free, AGPL)

| Module | Directory | What it does |
|--------|-----------|--------------|
| Company | `classes/modules/company` | Tenant/company record, branches, departments |
| Users | `classes/modules/users` | All user types, wage records, secondary wage groups |
| Schedule | `classes/modules/schedule` | Recurring schedule templates, shift assignment |
| Punch | `classes/modules/punch` | Clock-in/out events (`PunchFactory`, `PunchControlFactory`) |
| Policy | `classes/modules/policy` | The core rules engine — 15+ policy types; see detail below |
| Accrual | `classes/modules/accrual` | Time-off bank (balance + transaction records) |
| Pay Period | `classes/modules/payperiod` | Weekly/bi-weekly/semi-monthly/monthly periods |
| Pay Stub | `classes/modules/pay_stub` | Pay stub generation, entries, accounts, transactions |
| Pay Stub Amendment | `classes/modules/pay_stub_amendment` | One-off manual adjustments to pay stubs |
| Payroll Deduction | `classes/payroll_deduction` | Tax engine — US, CA, CR only |
| Holiday | `classes/modules/holiday` | Holiday calendar + recurring holiday rules |
| Request | `classes/modules/request` | Employee leave/availability requests |
| Report | `classes/modules/report` | 27 report types (timesheet, payroll, gov forms) |
| Import | `classes/modules/import` | CSV/data import |
| KPI | `classes/modules/kpi` | Key performance indicators |
| Hierarchy | `classes/modules/hierarchy` | Approval chains |
| Message | `classes/modules/message` | Internal messaging |
| Qualification | `classes/modules/qualification` | Employee certifications and skills |

### Paid-only features (Professional / Corporate / Enterprise)
- Mobile app (native iOS/Android)
- Facial recognition timeclock (biometric selfie verification)
- GPS geofencing enforcement at punch time
- IP address restriction at punch time
- Advanced scheduling (open shifts, shift swap, bid board)
- Customer support (phone/chat/email)
- Invoicing / accounts receivable
- Multi-jurisdiction payroll for US states beyond base

---

## Data Model

### Core entity relationships

```
Company (tenant)
  └── Branch (physical location)
  └── Department
  └── User (employee)
        └── UserWage (effective-dated wage records, multiple wage groups)
        └── PolicyGroup (one per user — activates the full rule stack)

PolicyGroup
  ├── Overtime Policy (one or many, ordered by priority)
  ├── Premium Policy (shift differential rules)
  ├── Break Policy (auto-add or auto-deduct)
  ├── Meal Policy (auto-add or auto-deduct)
  ├── Absence Policy (unpaid/paid absence codes)
  ├── Holiday Policy
  ├── Accrual Policy
  ├── Exception Policy (alert/notification rules)
  ├── Schedule Policy (links break/meal/OT to scheduled shifts)
  └── Round Interval Policy (time rounding rules)

PayCode
  └── PayFormula (multiplier, flat rate, piece rate, daily flat, etc.)
  └── AccrualAccount (optional — deposits/withdraws to accrual balance simultaneously)

ContributingShiftPolicy (filter — which punches qualify for a given rule)
  └── filters by: date range, time-of-day window, days of week, holiday flag,
                  branch, department, job, task
  └── match types: Split Partial (window hours only) vs Full Shift (all hours if majority in window)

Punch (raw clock event with timestamp + type: in/out/break/lunch)
  └── PunchControl (paired in/out — the canonical "shift" entity; holds total hours)
        └── UserDateTotal (calculated totals per day per pay code)
              └── PayStubEntry (dollar amounts per pay stub line item)

PayPeriod (weekly/bi-weekly/semi-monthly/monthly)
  └── PayStub
        └── PayStubEntry (line items: earnings, deductions, taxes)
        └── PayStubTransaction (payment records — direct deposit, cheque)
        └── PayStubAmendment (manual adjustments)

Accrual (one transaction per deposit or withdrawal)
AccrualBalance (running total per user per accrual account)
```

### Key tables known from source inspection

| Table / Entity | Purpose |
|----------------|---------|
| `punch` | Raw in/out events with timestamp and punch type |
| `punch_control` | Pairs punches into complete shifts; holds calculated total time |
| `user_date` | Per-user per-date anchor record for all calculations |
| `user_date_total` | Calculated time per pay code per day (regular, OT, premium, etc.) — the calculation cache |
| `pay_stub` | One pay stub per user per pay period |
| `pay_stub_entry` | Line items on a pay stub (earnings, deductions, taxes) |
| `pay_stub_entry_account` | Chart of accounts for pay stub line types |
| `pay_stub_entry_account_link` | Links accounts (e.g. employer CPP contributes to employee CPP bucket) |
| `pay_stub_amendment` | Manual one-off adjustments with effective date |
| `pay_stub_transaction` | Payment records (direct deposit, cheque) |
| `accrual` | Individual accrual transactions (+ deposit, − withdrawal) |
| `accrual_balance` | Running balance per user per accrual account |
| `recurring_schedule_template` | Reusable shift definition (time, duration, days of week) |
| `recurring_schedule_template_control` | Rotation envelope (sequences templates in order) |
| `recurring_schedule` | Instantiated shifts generated from template |
| `schedule` | Individual scheduled shift (manually created or auto-generated) |

### Policy entities (the power of the system)

Each policy type is its own table. `policy_group` holds foreign keys into all of them:

- **`overtime_policy`** — type (daily/weekly/bi-weekly/consecutive-day/holiday), `active_after` hours, `adjusted_by` contributing shift, `contributing_shift_policy_id`, `pay_code_id`, `pay_formula_policy_id`
- **`premium_policy`** — shift differential rules; branch/dept/job filters; `contributing_shift_policy_id`
- **`break_policy`** — type (auto-add/auto-deduct/manual), `active_after`, `break_time`, `pay_code_id`
- **`meal_policy`** — same structure as break but for meal periods; California meal penalty inserts an earning code
- **`exception_policy`** — 40+ exception codes (see below), severity (low/medium/high/critical), `grace_period`, `watch_window`, `demerit_points`, notify flags
- **`accrual_policy`** — deposit/withdrawal rules, milestones, max balance, rollover rules
- **`contributing_shift_policy`** — date/time/day-of-week/holiday filters, shift match type
- **`round_interval_policy`** — grace window, round direction (up/down/nearest), interval in minutes
- **`pay_formula_policy`** — formula type, rate, wage source (wage group or contributing pay code average)
- **`pay_code`** — links to `pay_formula_policy`; optional accrual account deposit/withdrawal

---

## Exception System

TimeTrex's exception engine is the most operationally relevant feature for security guard management. Every configured exception has:

- **Code** — 2-character identifier (e.g. M1, O1, S3)
- **Severity** — Low / Medium / High / Critical (Critical hard-blocks payroll processing for that employee)
- **Grace period** — tolerance window in minutes before trigger fires
- **Watch window** — how long the system monitors the condition
- **Demerit points** — per-violation penalty score (aggregate visible on KPI reports)
- **Notifications** — email to employee and/or supervisor on trigger

### Exception codes catalogue

| Code | Category | Trigger |
|------|----------|---------|
| M1 | Missing Punch | No out-punch detected for a shift |
| M2 | Missing Punch | No in-punch detected for a shift |
| M3 | Missing Punch | No lunch out-punch |
| M4 | Missing Punch | No lunch in-punch |
| S3 | Shift | Late in-punch (beyond grace period after scheduled start) |
| S4 | Shift | Early in-punch (before scheduled start) |
| S5 | Shift | Early out-punch (before scheduled end) |
| S6 | Shift | Late out-punch (after scheduled end) |
| S7 | Shift | Unscheduled absence |
| S8 | Shift | Hours do not match schedule |
| O1 | Overtime | Exceeds scheduled daily hours |
| O2 | Overtime | Exceeds scheduled weekly hours |
| B1–B6 | Break | Various break duration or timing deviations |
| L1–L4 | Meal | Meal break duration or timing deviations |
| G1 | Geo | Punched outside approved geofence boundary |
| D1–D3 | Department | Punching into unauthorized branch or department |
| J1–J4 | Job | Punching into unauthorized job or task |
| V1 | Verification | Timesheet unverified past deadline |

**Critical severity is the enforcement gate:** A Critical exception on a timesheet hard-blocks payroll processing for that employee-period until a supervisor manually resolves it. This forces resolution before pay is calculated.

---

## API Surface

### JSON REST API (primary modern interface)

**Base URL:** `POST https://[host]/api/json/api.php?Class={ClassName}&Method={MethodName}`

**Authentication:** Session cookie (`SessionID=API<key>`). API keys are registered per user via the UI. CSRF validation requires the `Referer` header to match the JSON endpoint URL.

**Pattern:** Every entity has `getX()` and `setX()` methods. `setX()` with no `id` creates; with `id` updates. The web UI uses these same endpoints — press `Ctrl+Alt+Shift+F11` in the browser to see live API calls.

**Known API classes:**

| Class | Key Methods |
|-------|-------------|
| APIAuthentication | Login, Logout, RegisterAPIKey |
| APIUser | getUser, setUser |
| APIPunch | setPunch, getPunch |
| APISchedule | getSchedule, setSchedule |
| APIPayStub | getPayStub, calculatePayStub |
| APIPayStubAmendment | getPayStubAmendment, setPayStubAmendment |
| APIAccrual | getAccrualBalance |
| APIUserWage | getUserWage, setUserWage |
| APITimesheetSummaryReport | getTemplate, getTimesheetSummaryReport |
| APIPayrollExportReport | getPayrollExportReport |
| APIExceptionReport | getExceptionReport |

**Format:** JSON in, JSON out. Every response includes `api_retval` (bool), `api_details` (message string), and the data payload.

### Legacy SOAP API
`/api/soap/api.php?Class=User` — same object model, SOAP transport. Superseded by JSON API. Not relevant for new development.

---

## Payroll Calculation Engine

### End-to-end flow

```
Punch events (raw in/out timestamps)
  → PunchControl (paired shift with total hours)
  → Policy engine applies rules in order:
      1. Round Interval — round time to nearest N minutes
      2. Meal Policy — auto-deduct lunch if shift > Active After threshold
      3. Break Policy — auto-deduct or auto-add breaks if shift > threshold
      4. Contributing Shift filter — which hours qualify for each downstream rule
      5. Regular Time Policy — hours up to OT threshold → Regular pay code
      6. Overtime Policy — hours above threshold → OT pay code
             Types: daily (>8h/day), weekly (>40h/week), bi-weekly,
                    consecutive days (2nd through 7th day), holiday, over-schedule
             "Adjusted By" reduces the threshold by qualified paid absences
      7. Premium Policy — shift differentials for nights, weekends, holidays
      8. Absence Policy — paid or unpaid leave codes
      9. Exception Policy — fire alerts for any violations found
  → UserDateTotal — calculated time per pay code per day (the memoization cache)
  → PayPeriod closes → PayStub generated
  → PayStubEntry per pay code: hours × PayFormula → dollar amounts
  → PayrollDeduction engine applies tax tables (US/CA/CR only)
  → Net pay calculated, PayStubTransaction recorded
```

### Pay Formula types

| Type | Behaviour |
|------|-----------|
| Pay × Factor | `wage_rate × factor` — time-and-a-half = factor 1.5 |
| Flat Hourly Rate | Fixed $/hr regardless of employee wage |
| Flat Hourly Rate (Relative to Wage) | `policy_rate − employee_rate` — makes up the difference to a floor |
| Minimum Hourly Rate | `max(policy_rate, employee_rate)` |
| Pay + Premium | `employee_rate + premium_amount` |
| Daily Flat Rate | Fixed $/day regardless of hours |
| Piece Rate | `piece_rate × quantity` (employee enters quantity during time entry) |
| Average of Contributing Pay Codes | `sum(contributing wages) / sum(contributing hours)` — FLSA blended rate for OT |

### Wage source options
- Single wage group (standard, default)
- Contributing Pay Code average (blended rate for employees paid at multiple rates in one week)

### Accrual integration with pay
A `PayFormula` can simultaneously pay out time AND deposit/withdraw from an accrual balance. Setting `rate = 0.00` banks time without paying it. Example: earn 1 PL hour for every 20 regular hours worked → `accrual_deposit_rate = 0.05` on the Regular pay code formula.

---

## Punch-in Mechanisms

| Mechanism | CE (free) | Paid tier |
|-----------|-----------|-----------|
| Web browser | Yes | Yes |
| Web Quick Punch (simplified kiosk UI) | Yes | Yes |
| Mobile app (iOS/Android) | No | Professional+ |
| GPS punch with coordinates stamped | No | Professional+ |
| Geofencing (block off-site punch) | No | Professional+ |
| IP address restriction | No | Professional+ |
| Facial recognition (selfie biometric, hash stored not raw image) | No | Corporate+ |
| Dedicated kiosk tablet (commodity hardware ~$350–550) | No | Any paid tier |
| NFC/RFID | Not documented | Unclear |
| QR code scan | Not documented | Unclear |

**GPS implementation detail (paid):** Every punch is tagged with device GPS/GLONASS/Galileo coordinates. Geofence can be any polygon shape. Violation fires exception code G1. Biometric uses client-side hashing — raw selfie image is not stored.

**Implication for us:** We already deliver GPS + geofencing + QR check-in in what would be TimeTrex's paid tier. Our check-in implementation is already at paid-tier parity for free.

---

## Scheduling System

### Three-layer architecture

1. **`RecurringScheduleTemplate`** — defines shift time, duration, and which days of the week
2. **`RecurringScheduleTemplateControl`** — rotation envelope; sequences multiple templates in order (e.g. Week A then Week B, repeat)
3. **`RecurringScheduleUser`** — assigns a template control to a specific employee with an effective date range

`RecurringSchedule` = instantiated shifts generated from the above. `Schedule` = individual shift record (manually created or auto-generated).

This separation means creating a 3-month roster for 20 guards is 3 database records per guard (template + control + assignment), not 20 × 65 = 1,300 individual shift rows upfront.

---

## Compliance / Labor Law Module

### What exists
TimeTrex compliance is US/Canada-centric:
- FLSA regular rate of pay calculation (blended rate for multi-rate OT workers)
- California 7th day rule (doubletime on the 7th consecutive day worked)
- California meal penalty (auto-insert "Meal Penalty" earning code if shift exceeds 5 hours with no 30-minute break recorded; Labor Code 226.7 caps at one meal + one rest penalty per day)
- Daily and weekly OT thresholds configurable per policy group
- Break and meal auto-deduct with payroll gate if unresolved
- Canadian federal + provincial tax tables (T4, ROE, CPP, EI)

### What is missing for India
- No ESI calculation (employee 0.75%, employer 3.25%, wage ceiling ₹21,000/month)
- No PF/EPF calculation (12% employee + 12% employer split into EPF 3.67%, EPS 8.33%, EDLI 0.5%)
- No Professional Tax (state-level, slab-based)
- No TDS on salary (Section 192)
- No Form 16, Form 24Q government reporting
- No Basic vs Gross wage distinction required for Indian compliance calculations
- No paise arithmetic — they store dollar amounts as floats, not integer subunits

**Our payroll schema (paise integers, ESI/PF fields) is already ahead of TimeTrex for Indian compliance.**

### Exception enforcement as labor compliance
The closest TimeTrex gets to labor law enforcement for guards is the exception system: break enforcement catches missed breaks, Critical exceptions block payroll, and all violations are audit-trailed. This is the right pattern for us to adopt.

---

## Algorithms / Techniques Worth Borrowing

### 1. Contributing Shift Policy — the filter layer before any rule fires

Before overtime or premium rules evaluate anything, a "contributing shift filter" pre-qualifies which hours count. Filter dimensions: start/end time of day, days of week, holiday flag, branch, department, job, task. Match types: "Split Partial" (only the qualifying window hours count) vs "Full Shift" (all hours if the majority falls in the window).

**Borrow for:** Security guard site premiums. Guard at Site A (high-risk client) earns a ₹50/hour premium. Model as: contributing shift filter → `branch = Site A` → Premium Policy fires on those hours. No hardcoded site rates in the shift record.

### 2. Policy Group as the single assignment point

One FK on the user record (`policy_group_id`) activates the entire stack of rules. Changing policies for a class of employees = update one policy group, not N employee records. Prospective-only: historical timesheets use the policy active when the shift was worked.

**Borrow for:** Guards on different client contracts need different OT thresholds, premiums, break rules. One policy group per contract type solves this cleanly.

### 3. Overtime "Adjusted By" mechanism

The OT threshold can be reduced by qualified paid absences. If a guard takes 1 hour of paid sick leave and works 7.5 hours, the system considers them to have 8.5 qualifying hours and fires OT on the excess 0.5h.

**Borrow for:** Indian Factories Act overtime (>9h/day or >48h/week at 2x rate) where paid leave days count toward the weekly threshold.

### 4. Pay Stub Entry Account with simultaneous accrual link

Each pay stub line item (pay code) can simultaneously credit or debit an accrual balance. Handles: "when you earn 1 hour of regular time, you accrue 0.05 hours of earned leave" (1 day PL per 20 working days under Indian Factories Act).

**Borrow for:** EL/CL/SL accrual per Indian Factories Act, without a separate nightly batch job.

### 5. UserDateTotal as the calculation memoization cache

After the policy engine runs, results are stored in `user_date_total` (time per pay code per day). Payroll roll-up is then a simple SUM query on this table. Invalidation triggers: punch edited, policy changed (future only), or manual recalculate requested.

**Borrow for:** Add a `calculated_totals` JSONB column to our shift records caching: `{ regularMinutes, otMinutes, sitePremuimPaise, esiBasis, pfBasis }`. Payroll becomes a SELECT SUM query, not a re-traversal of all attendance records.

### 6. Exception severity as a payroll gate

Critical exceptions hard-block payroll processing for that employee-period. Supervisor must manually resolve (e.g., enter the missing out-time) before the shift is included in payroll.

**Borrow for:** A missed check-out on a guard shift currently produces a UI warning only. Adding a blocking exception gate forces supervisor resolution before that shift counts toward pay, which also closes the time-theft vector.

### 7. Pay Formula "Average of Contributing Pay Codes" — blended OT rate

When a guard works two different jobs at different rates in one week, the OT rate is calculated on the weighted average: `sum(all wages earned) / sum(all hours worked)`. Prevents inflating OT by always picking the highest rate.

**Borrow for:** Guards covering multiple client sites at different billing rates in one week. Indian Factories Act Section 59 overtime is on "ordinary rate of wages" — weighted average is the correct interpretation for multi-rate workers.

### 8. Three-layer recurring schedule model

Template (what a shift looks like) → Control (rotation pattern and cycle) → User assignment (which employee, from when). Decouples the shift definition from its rotation logic from its personnel assignment.

**Borrow for:** When we build the bulk roster creation feature, avoid creating thousands of individual shift rows. Generate them lazily from the template hierarchy when needed.

---

## What's Missing for Our Security App

| Gap | TimeTrex limitation | Our solution |
|-----|---------------------|--------------|
| Guard patrol routes and checkpoints | No concept of patrol or checkpoint scans | We have `patrols` + `patrol_scans` + `checkpoints` schema |
| QR / NFC checkpoint scanning | Not documented in Community Edition | We have `QrScannerModal` implemented in mobile |
| Live GPS location streaming (SSE) | No real-time guard tracking | We have SSE fan-out + `guard_locations` table |
| Incident reporting with severity + SLA | No incident or alert module | We have `incidents` table with severity + SLA deadline |
| Client-facing portal | No `client_viewer` role | We have `client_viewer` in our role hierarchy |
| Indian payroll (ESI, PF, PT, TDS) | Not implemented — US/CA/CR only | We have paise-integer schema + ESI/PF fields |
| Multi-tenant architecture | Single-tenant per install | We have `tenantId` scoping on every table and query |
| Camera / video integration | Cameras table stub, no active integration | We have `cameras` table stub (Frigate) |
| Mobile PWA (free) | Mobile is paid-only native app | We deliver Ionic/Capacitor PWA for free |

---

## Verdict

**Mine for ideas — especially the policy engine. Do not run it. Do not copy code.**

### Reasons not to use TimeTrex
1. **Dead project (FOSS side)** — officially discontinued October 2024, no more patches
2. **AGPL license** — any derived work must also be AGPL; incompatible with our planned commercial model
3. **PHP + jQuery stack** — entirely incompatible with our Node.js/TypeScript monorepo
4. **No India payroll** — ESI, PF, PT, TDS, Form 24Q are all absent; these are non-negotiable for us
5. **No security guard-specific features** — no patrols, checkpoints, live tracking, incidents
6. **Mobile and GPS are paid-only** — the features most critical to our guards are behind a paywall in TimeTrex

### Reasons to treat as a reference
1. **Policy engine architecture is excellent** — the contributing shift + overtime + premium + exception stack took years to evolve; it is the right model for complex WFM
2. **Exception system with severity gates** is exactly right for enforcement-grade attendance in security contexts
3. **Three-layer scheduling model** (template → control → assignment) is the correct pattern for complex shift rotations
4. **PayFormula taxonomy** covers every pay calculation variant we will encounter including FLSA blended rate
5. **UserDateTotal memoization layer** is the right architecture for performant payroll roll-up at scale
6. **Accrual as a transaction log** (not a single balance field) is the correct design for auditable leave balances

---

## Concrete Extracts

### Pattern: Policy stack via a single PolicyGroup FK

```typescript
// Proposed addition: packages/db/src/schema/policy_groups.ts
export const policyGroups = pgTable('policy_groups', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),

  // Overtime thresholds
  dailyOtThresholdMinutes: integer('daily_ot_threshold_minutes').default(480),   // 8h
  weeklyOtThresholdMinutes: integer('weekly_ot_threshold_minutes').default(2880), // 48h (Indian Factories Act)
  otRateMultiplier: numeric('ot_rate_multiplier', { precision: 4, scale: 2 }).default('2.0'), // 2x in India

  // Break rules
  breakAutoDeductMinutes: integer('break_auto_deduct_minutes'),     // null = manual punch required
  breakActiveAfterMinutes: integer('break_active_after_minutes'),   // shift must exceed this to trigger

  // Exception thresholds
  lateGraceMinutes: integer('late_grace_minutes').default(5),
  missedPunchMaxShiftMinutes: integer('missed_punch_max_shift_minutes').default(720),

  // Site premium (paise per hour above base)
  sitePremiumPaise: integer('site_premium_paise').default(0),
});

// Then on users table:
// policyGroupId: text('policy_group_id').references(() => policyGroups.id)
```

### Pattern: Exception severity gate on payroll processing

```typescript
// apps/api/src/routes/payroll.ts
async function canIncludeShiftInPayroll(
  shiftId: string,
  tenantId: string,
): Promise<{ allowed: boolean; blockingExceptions: string[] }> {
  const blocking = await db
    .select({ code: shiftExceptions.code, description: shiftExceptions.description })
    .from(shiftExceptions)
    .where(
      and(
        eq(shiftExceptions.shiftId, shiftId),
        eq(shiftExceptions.tenantId, tenantId),
        eq(shiftExceptions.severity, 'critical'),
        eq(shiftExceptions.resolved, false),
      ),
    );
  return {
    allowed: blocking.length === 0,
    blockingExceptions: blocking.map((e) => `${e.code}: ${e.description}`),
  };
}
```

### Pattern: Calculated totals cache on shift record

```typescript
// Add to shifts table schema
calculatedTotals: jsonb('calculated_totals').$type<{
  regularMinutes: number;
  otMinutes: number;
  regularPaise: number;   // regular hours × base rate
  otPaise: number;        // OT hours × OT rate
  sitePremiumPaise: number;
  esiBasisPaise: number;  // gross for ESI calculation (capped at ₹21,000/month)
  pfBasisPaise: number;   // basic wage for PF calculation
  calculatedAt: string;   // ISO timestamp — for cache invalidation
}>(),
```

### Pattern: Three-layer recurring schedule for rosters

```typescript
// Proposed schema additions

export const scheduleTemplates = pgTable('schedule_templates', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),    // '22:00'
  durationMinutes: integer('duration_minutes').notNull(), // 480
  daysOfWeek: integer('days_of_week').array().notNull(), // [0,1,2,3,4] = Mon-Fri
  siteId: text('site_id').references(() => sites.id),
});

export const scheduleRotations = pgTable('schedule_rotations', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  templateIds: text('template_ids').array().notNull(), // ordered sequence
  cycleLengthWeeks: integer('cycle_length_weeks').notNull(), // 1 = weekly, 2 = bi-weekly
});

export const scheduleAssignments = pgTable('schedule_assignments', {
  id: text('id').primaryKey().$defaultFn(createId),
  tenantId: text('tenant_id').notNull(),
  guardId: text('guard_id').notNull().references(() => users.id),
  rotationId: text('rotation_id').references(() => scheduleRotations.id),
  effectiveStart: date('effective_start').notNull(),
  effectiveEnd: date('effective_end'),
});
```

### Pay formula: ESI/PF modelled as TimeTrex-style pay codes

TimeTrex's pay stub entry account system is the right shape for Indian statutory deductions. Each deduction is a pay code with a formula:

| Pay Code | Formula Type | Rate | Wage Source | Cap |
|----------|-------------|------|-------------|-----|
| ESI_EMPLOYEE | Pay × Factor | 0.0075 | Gross wages | ₹21,000/month wage ceiling |
| ESI_EMPLOYER | Pay × Factor | 0.0325 | Gross wages | ₹21,000/month wage ceiling |
| PF_EMPLOYEE | Pay × Factor | 0.12 | Basic wages | ₹15,000/month PF wage ceiling |
| EPF_EMPLOYER | Pay × Factor | 0.0367 | Basic wages | ₹15,000/month PF wage ceiling |
| EPS_EMPLOYER | Pay × Factor | 0.0833 | Basic wages | ₹15,000/month PF wage ceiling |
| EDLI_EMPLOYER | Pay × Factor | 0.005 | Basic wages | ₹15,000/month PF wage ceiling |

Our current `payroll_records` table stores ESI/PF as computed columns. Moving to a line-item model (like `PayStubEntry`) would make each deduction auditable and re-calculable independently.

---

## Open Questions for Synthesis

1. **Should we build a `policy_groups` table now?** We have one shift type with hardcoded 8h regular / 2x OT. Different client contracts will need different thresholds and site premiums. The policy group pattern prevents rule proliferation across the codebase.

2. **Exception severity as a payroll gate** — add a `shift_exceptions` table with severity levels? Currently a missed check-out is only a UI warning. A Critical exception blocking payroll forces supervisor resolution before that shift is paid, closing the time-theft window.

3. **`calculated_totals` JSONB cache on shifts** — when does re-calculating from raw attendance become too slow? At 500+ guards with daily shifts, payroll roll-up over a monthly period is 15,000+ records to re-traverse. The cache should be built before we hit that scale.

4. **Three-layer schedule model** — when to upgrade from individual `shifts` rows to the template/rotation/assignment pattern? Threshold: when we need bulk roster generation covering more than 2 weeks forward.

5. **Contributing shift filters for site premiums** — model site-specific premium pay as: (a) a pay rate field on the site record, (b) a policy group per site contract, or (c) a contributing shift filter + premium policy? Option (b) maps directly to TimeTrex's pattern and is the most flexible.

6. **Blended OT rate for multi-site guards** — Indian Factories Act Section 59 says overtime is at "ordinary rate of wages." For guards covering multiple sites at different billing rates in one week, the correct interpretation is a weighted average of all rates in that week. When does this matter for us?

7. **Accrual system for Indian leave law** — our schema has no accrual tables yet. Indian Factories Act requires: Earned Leave (1 day per 20 days worked), Casual Leave (varies by state), Sick Leave (varies by state). TimeTrex's accrual transaction log + balance pattern is the right model. Priority: build alongside payroll finalization feature.
