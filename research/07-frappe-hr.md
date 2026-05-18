# Frappe HR — Research Notes

> Frappe HR (formerly the HRMS module inside ERPNext, now a standalone app at `github.com/frappe/hrms`) is an open-source, AGPL/GPL-3.0-licensed HR and Payroll suite built on the Frappe Framework (Python + MariaDB). It is the most widely deployed open-source HRMS in India, with strong first-class handling of Indian statutory payroll (ESI, PF, PT, TDS).

**Repo:** https://github.com/frappe/hrms  
**Docs:** https://docs.frappe.io/hr  
**License:** GPL-3.0 (HRMS + ERPNext); Frappe Framework is MIT  
**GitHub stars:** ~8,000  
**Active development:** Yes, v16 released 2024, v17 in development

---

## Module Overview

Frappe HR ships with **13+ modules** covering the complete employee lifecycle. These are implemented as "DocTypes" — Frappe's ORM abstraction where each DocType maps to a database table with auto-generated CRUD APIs.

| Module | What it covers |
|---|---|
| **Employee Lifecycle** | Onboarding, promotions, transfers, exit interviews, full-and-final settlement |
| **Leave & Attendance** | Leave policies, regional holiday lists, geolocation check-in/out, balance tracking, leave allocation |
| **Expense Claims & Advances** | Employee advances, expense claiming, multi-level approval workflows, ERPNext accounting integration |
| **Performance Management** | KRA/goal tracking, self-evaluation, appraisal cycles |
| **Payroll & Taxation** | Salary structures, income tax slabs, off-cycle payments, statutory deductions (PF, ESI, PT, TDS) |
| **Shift Management** | Shift types, shift assignments, shift requests, visual roster, auto attendance, overtime (v16) |
| **Recruitment** | Job postings, applicants, offer letters |
| **Training** | Training events, results |
| **Fleet Management** | Vehicle log, vehicle expense |
| **Remuneration / Benefits** | Flexible benefits, employee benefit ledger (v16) |
| **Separation** | Full and final settlement, gratuity calculation |
| **Mobile App** | iOS/Android PWA: leave requests, check-in/out, payslip access |
| **Reports & Dashboards** | HR analytics, statutory compliance reports |

**Stack:**
- Language: Python 3.10+
- Framework: Frappe Framework v16/v17 (MIT licensed)
- Required dependency: ERPNext (GPL-3.0) — cannot install HRMS without the full ERP
- Database: **MariaDB 10.6+ primarily; PostgreSQL supported at framework level but ERPNext officially does NOT support PostgreSQL** — this is a documented hard blocker
- Frontend: Vue 3 + Frappe UI (not React)
- Cache/queue: Redis (required)
- Web: Nginx + Gunicorn (Python WSGI)

**Deployment footprint vs Arrow Security:** Frappe needs Python 3.10, Node.js (Socket.IO), MariaDB, Redis (×2), Nginx, Supervisor, wkhtmltopdf. Docker images are ~1.5 GB. This is an order of magnitude more complex than Arrow Security's current 4-container Docker Compose setup.

---

## Indian Statutory Payroll Features

This is Frappe HR's strongest area and the primary reason to consider it for Arrow Security.

### Core payroll engine

Frappe's payroll is built on **Salary Components** (individual line items) and **Salary Structures** (templates that assemble components with formulas). The formula evaluation context includes `base`, `gross_pay`, `joining_date`, `relieving_date`, and every previously-calculated component — so PF can reference `basic`, and ESI can reference `gross_pay`.

**Workflow:**
1. Define Salary Components (earnings and deductions, formula or fixed amount)
2. Create Salary Structure (template with formula-driven components)
3. Assign Salary Structure to each employee (with effective date)
4. Run Payroll Entry for a period — generates all Salary Slips in draft
5. Verify drafts, submit — creates accounting journal entries in ERPNext automatically
6. Export statutory challans from the submitted Payroll Entry

### Provident Fund (PF / EPF)

- Employee contribution: 12% of basic, capped at ₹15,000 basic (max ₹1,800/month)
- Employer contribution: 12% of basic, split across EPF + EPS sub-components
- UAN field on the Employee master
- A marketplace app (`knk_hr_esic_pf_challan_report` on Frappe Cloud) generates the `.txt` file in EPFO's exact ECR upload format — single-click export from a submitted Payroll Entry
- Core Frappe HR does **not** include the EPFO challan file natively (GitHub issue #2174 is open requesting this); it depends on community apps

### Employees' State Insurance (ESI)

- Employee: 0.75% of gross, applicable only when gross ≤ ₹21,000/month
- Employer: 3.25% of gross, same ceiling
- ESIC report export contains IPN Number, Employee Name, Basic+HRA, Working Days
- Excel/CSV export for the ESIC portal

### Professional Tax (PT)

- State-wise slab configuration via the Salary Component formula field
- Not fully automated out of the box — each state's slab must be manually configured
- The formula engine handles it once configured; PT slabs differ by state (relevant for multi-state guard deployments)

### Income Tax / TDS

- Payroll Period maps to Indian financial year (April 1 – March 31)
- Multiple tax slab sets (old regime vs new regime simultaneously)
- Employee Tax Exemption Declaration (80C, 80D, HRA, LTA, etc.) reduces monthly TDS
- "Variable based on Taxable Salary" checkbox on the Income Tax Salary Component triggers auto-computation
- Proof Submission workflow for year-end reconciliation
- Income Tax Breakup section added to salary slips in v16 for transparency

### Loss of Pay (LOP) proration

- Auto-deducts LWP in proportion to `lop_days / total_working_days_in_month`
- Integrates with the Leave module's LWP leave type — no manual entry needed

### Arrears and corrections (v16 new feature)

- Retroactive salary structure approvals automatically calculate arrears
- Creates additional salary entries for prior months

### What is NOT built-in (gaps requiring community apps or customization)

- EPFO ECR challan `.txt` file — needs the `knk_hr_esic_pf_challan_report` marketplace app
- Form 16 / Form 24Q TDS return — community apps exist, not in core
- Labour Welfare Fund (LWF) — state-specific, not included
- Bonus Act automation — not automated; requires a separate Salary Component
- Performance-based incentive pay (e.g., per-checkpoint bonus for guards) — requires custom Python formula in the Salary Component

### Verified statutory rates (India FY 2025-26, from Frappe HR source)

```
PF Employee:  12% of basic, max base = ₹15,000 → max = ₹1,800/month
PF Employer:  12% of basic (same ceiling, split EPF + EPS internally)
ESI Employee: 0.75% of gross, only if gross ≤ ₹21,000
ESI Employer: 3.25% of gross, only if gross ≤ ₹21,000
```

These match the rates used in Arrow Security's existing `packages/db/src/schema/payroll.ts` — the logic is correct; only the challan generation is missing.

---

## Attendance & Leave Module

### Attendance recording mechanism

- **EmployeeCheckin** DocType: stores timestamp, IN/OUT type, device ID, latitude, longitude
- Check-in sources: Frappe HR mobile PWA, biometric ZKTeco devices via the `biometric-attendance-sync-tool` script, or direct API POST
- **Auto Attendance** (`process_auto_attendance()` scheduled job): runs at end of each day, reads EmployeeCheckin records, determines applicable shift, calculates working hours, flags late entry / early exit
- Geolocation radius validation: a ShiftAssignment can reference a ShiftLocation with lat/lng + radius; check-ins outside radius can be flagged (enforcement is configurable, not mandatory block by default)

### Attendance processing algorithm (worth porting)

Given raw EmployeeCheckin logs for a day:
1. Find the ShiftType active for that employee at that timestamp (uses grace period windows: `begin_check_in_before_shift_start_time`, `allow_check_out_after_shift_end_time`)
2. Handle overnight shifts (end_time < start_time) correctly
3. Pair IN/OUT logs using either "first/last" mode or "every valid pair" mode
4. Compute total working hours from valid pairs
5. Compare against `working_hours_threshold_for_half_day` and `working_hours_threshold_for_absent`
6. Mark `late_entry` if first IN > `start_time + grace`; mark `early_exit` if last OUT < `end_time - grace`
7. Create or update one Attendance record for the day

**Arrow Security currently has no equivalent** — attendance is purely a manual POST from the guard app. This algorithm would enable auto-derived attendance, which is more fraud-resistant.

### Leave management features

- Configurable leave types: Annual, Casual, Sick, LWP, Earned Leave, Compensatory Off
- Earned Leave: pro-rata credits on monthly/quarterly schedule (added in v16: automated via Earned Leave Schedule)
- Carry-forward, expiry, encashment all configurable per leave type
- Multi-level approval workflow
- Regional holiday list import (state public holidays selectable by region)
- Leave Adjustment in v16: HR can increase or reduce allocated leaves from existing records
- Half Day support in v16

### Limitations relevant to security guard context

- The attendance model assumes a **known shift per employee per day** — works well for stable office-shift workers but **rotating guard patterns require ShiftAssignments to be created ahead of time** for auto-attendance to fire correctly
- A known bug (Issue #3839): "Auto Attendance Fails When Default Shift and Shift Assignment Conflict" — rotating guards assigned to different sites each week create exactly this conflict scenario
- AttendanceRequest (for missing check-ins, on-duty, WFH) is batch-processed by date range — not real-time
- **No patrol or checkpoint concept whatsoever** — Frappe HR has no model for a guard walking a route and scanning QR codes at named waypoints; this is entirely outside its domain

---

## Shift Management

### Core features

| Feature | Detail |
|---|---|
| **ShiftType** | Defines start/end time, grace periods, auto-attendance toggle, working hours thresholds, late entry / early exit rules |
| **ShiftAssignment** | Links Employee → ShiftType for a date range; overlap validation prevents double-assignment |
| **Shift Request** | Employee-initiated request to change shift, with configurable approval workflow |
| **ShiftLocation** | Named location with lat/lng + check-in radius; attached to a ShiftAssignment |
| **Roster** | Visual Vue.js calendar grid — employees as rows, days as columns; supports bulk shift assignment |
| **Shift Schedule** | Template for recurring shift patterns (e.g., ABCABC rotation) — generates ShiftAssignments in bulk |
| **Overtime (v16)** | Custom overtime multipliers per ShiftType; generates Overtime Slips for HR approval; feeds into payroll as additional salary |
| **Half Day attendance (v16)** | Attendance records can reflect which half the employee was present |

### ShiftType data model (key fields)

```
name (text PK, human-readable)     start_time, end_time
enable_auto_attendance (bool)       begin_check_in_before_shift_start_time (minutes)
allow_check_out_after_shift_end_time (minutes)
working_hours_threshold_for_half_day (float hours)
working_hours_threshold_for_absent (float hours)
enable_late_entry_marking (bool)    late_entry_grace_period (minutes)
enable_early_exit_marking (bool)    early_exit_grace_period (minutes)
allow_overtime (bool)               overtime_type (link)
```

### ShiftAssignment overlap validation (worth porting)

```sql
-- Frappe's validation SQL (pseudocode)
SELECT name FROM ShiftAssignment
WHERE employee = :emp
  AND status = 'Active'
  AND start_date <= :proposed_end
  AND (end_date >= :proposed_start OR end_date IS NULL)
```

Arrow Security's current `POST /shifts` does not perform this check — adding it prevents accidental double-booking.

### Gaps for security guard operations

- **Roster is not site-scoped.** You cannot natively schedule "Guard A at Site X, Guard B at Site Y" on the same visual grid; site is a free-text field on ShiftAssignment, not a linked scheduling dimension
- **No geofence enforcement** — geolocation is captured in EmployeeCheckin but rejecting check-ins from guards at the wrong site requires customization
- **No shift swap between guards** — an open GitHub issue (`frappe/erpnext#28312`) for Roster Management enhancements covers this
- **Real-time GPS tracking is completely absent** — Frappe HR's mobile check-in is a discrete event, not a continuous stream; there is no equivalent to Arrow Security's 30-second GPS ping + SSE broadcast
- **No concept of patrol within a shift** — a guard's shift exists in Frappe HR, but what they do during the shift (patrol route, checkpoint scans) has no representation

---

## API / Integration Points

### Auto-generated REST API

Frappe Framework automatically exposes every DocType as a REST resource:

```
GET    /api/resource/{DocType}                          # list (default 20 per page)
GET    /api/resource/{DocType}/{name}                   # single record
POST   /api/resource/{DocType}                          # create
PUT    /api/resource/{DocType}/{name}                   # update (partial)
DELETE /api/resource/{DocType}/{name}                   # delete
GET/POST /api/method/{dotted.python.path}               # whitelisted Python method
```

**Filtering and pagination:**
```
?fields=["name","employee_name","net_pay"]
&filters=[["status","=","Submitted"],["posting_date",">=","2025-04-01"]]
&order_by=posting_date desc
&limit_start=0&limit_page_length=50
```

### Authentication

1. **Token (API Key + Secret):** `Authorization: Token api_key:api_secret` — generated per Frappe user in their settings; every request is audit-logged against that user. This is the correct approach for server-to-server calls from Arrow Security's Fastify backend.
2. **Session (cookie):** POST to `/api/method/login`; suitable for browser clients only.
3. **OAuth 2.0:** Full OAuth flow available for delegated access scenarios.

No documented rate limits; Frappe is single-threaded Python (Gunicorn workers), not designed for high-throughput API usage.

### Outbound Webhooks

Frappe has a built-in Webhook configuration UI:
- Select DocType + event trigger (`on_submit`, `on_update`, `on_cancel`, `after_insert`, etc.)
- Optional filter condition (e.g., only fire when `status = "Submitted"`)
- Payload: Form-URL-encoded or JSON with Jinja templating (`{{ doc.net_pay }}`, `{{ doc.employee }}`)
- Security: HMAC-SHA256 signature in `X-Frappe-Webhook-Signature` header
- Every outbound request is logged for audit and debugging

**Practical use for Arrow Security:** Configure a webhook on `Salary Slip → on_submit` to POST JSON to Arrow Security's Fastify API. The receiver updates `payroll_records.netPayPaise` and marks the record finalized.

### Server-side hooks (Python, for same-server integration)

```python
# In a custom Frappe app's hooks.py
doc_events = {
    "Salary Slip": {
        "on_submit": "arrow_sync.push_to_arrow_api"
    }
}
```

More reliable than webhooks for same-server processing but requires writing and maintaining a Frappe custom Python app.

### Integration middleware options

- **n8n** (self-hostable automation): has a Frappe node, can poll Frappe REST API or receive webhooks and push to Arrow Security's Fastify API
- **Pipedream**: managed Frappe integration
- **Direct HTTP** from Arrow Security Fastify → Frappe REST using `Authorization: Token` headers — straightforward with `fetch` or `axios`

### API impedance issues (if integrating)

- Frappe uses **human-readable string PKs** (e.g., `"HR-ATT-.2025.-00001"`, `"EMP-0001"`) not UUIDs; requires maintaining a mapping table between Arrow Security's `createId()` keys and Frappe's auto-named keys
- No GraphQL; REST only
- No batching — complex operations require multiple round trips
- Python WSGI is single-threaded per worker; not designed for concurrent high-throughput API calls

---

## Integration Architecture: Arrow Security ↔ Frappe HR

Three viable patterns, ranging from lightest to heaviest coupling:

### Pattern A — Payroll Push (recommended)

Arrow Security remains the **system of record** for guards, sites, shifts, attendance, patrol, and incidents. Frappe HR is used solely as a **payroll calculator and statutory compliance engine**.

```
Arrow Security (PostgreSQL + Fastify)
  │
  │  Once per month (batch job)
  ▼
[Sync worker: Node.js script or Fastify cron]
  │  POST /api/resource/Employee         ← upsert guard as Frappe Employee
  │  POST /api/resource/Salary Structure Assignment
  │  POST attendance summary (working days, LWP days, OT hours)
  │  POST /api/method/...create_payroll_entries ← trigger payroll run
  │
  ▼
Frappe HR (MariaDB, separate instance)
  │  calculates ESI, PF, PT, TDS, net pay
  │  generates Salary Slips
  │  Webhook on_submit ──►  Arrow Security /api/payroll/webhook
  │                              │
  │                              └─ updates payroll_records.netPayPaise
  │                                 marks period as finalized
  │
  │  Compliance officer exports:
  │    • PF ECR challan (.txt → EPFO portal)
  │    • ESI report (Excel → ESIC portal)
  │    • Salary slip PDFs for guards
```

**Data synced TO Frappe (one-time per guard, updated on changes):**
- Employee name, joining date, department, designation
- UAN number (EPFO), ESIC IP number
- Bank account details
- Salary structure assignment

**Data synced TO Frappe (monthly, per payroll period):**
- Working days in the period
- LWP (Leave Without Pay) days
- Overtime hours (if applicable)
- Any allowance adjustments

**Data received FROM Frappe (via webhook, per slip):**
- Gross pay, net pay, total deductions
- Component breakdown (basic, HRA, PF employee, PF employer, ESI employee, ESI employer, PT, TDS)

**Pros:** Arrow Security keeps full operational control; Frappe does only the compliance-heavy lifting it was purpose-built for; no duplication of patrol/GPS/incident logic in Frappe.

**Cons:** Two separate systems to maintain; employee master must be kept in sync; Frappe needs its own server (Frappe Cloud $5–$20/month or a Linux VM); sync failures need retry/alerting logic.

### Pattern B — Frappe as HR Master (not recommended)

Migrate guard master data, shifts, and leave management into Frappe HR. Arrow Security's mobile app posts check-ins via `POST /api/resource/Employee Checkin`. Patrol/checkpoint scanning remains in Arrow Security only.

**Assessment:** Not viable. Frappe's shift model is not designed for site-scoped rotating guard rosters. Patrol, real-time GPS, geofencing at the site level, QR checkpoint scanning, and incident management are all completely absent. You would spend more engineering effort fighting Frappe's data model than building features.

### Pattern C — Build Everything In-House (no Frappe)

Arrow Security builds its own payroll engine end-to-end: ESI/PF calculation, LOP proration, income tax slab logic, PF ECR challan file generation, ESIC report export.

**Assessment:** Viable but carries ongoing compliance risk. The ESI/PF/PT rules have statutory implications if miscalculated. The EPFO ECR `.txt` format, ESIC Excel upload format, and Form 24Q TDS return are bureaucratic formats that require maintenance as government requirements change. Arrow Security already stores amounts in paise (correct) and the rate formulas are known — the missing piece is the statutory report file generation.

**When this makes sense:** If the team wants no external dependencies and has the confidence to maintain Indian payroll compliance rules over time. The calculation logic is not complex — it is the ongoing maintenance and the challan file formats that are the real cost.

---

## Recommendation: Build vs Integrate

**Recommendation: Build Arrow Security's own payroll calculation; consider a thin Frappe HR integration only for statutory file generation (PF/ESI challans).**

### Rationale

**What Frappe HR genuinely does better:**

| Capability | Why Frappe wins |
|---|---|
| PF ECR challan `.txt` generation | EPFO upload format is pre-built and maintained by the community |
| ESIC report Excel | ESIC portal format is pre-built |
| Income tax / TDS automation | Full old/new regime, 80C/80D declarations, Form 16 — years of India-specific accumulated work |
| Salary slip PDF | Legally recognised format |
| ERPNext accounting integration | Journal entries auto-created on payroll submission |
| PT multi-state slab management | Configurable per state — relevant if Arrow Security guards operate in multiple states |

**What Arrow Security should keep entirely in-house (no Frappe overlap):**

| Feature | Reason |
|---|---|
| Guard master / identity | Arrow Security owns identity; syncing creates drift |
| Site/shift scheduling | Frappe's shift model cannot express site-scoped rotating guards |
| Real-time GPS tracking | No equivalent in Frappe HR |
| Patrol / checkpoint scanning | Entirely outside Frappe HR's domain |
| Check-in/out with geofence enforcement | Arrow Security has superior site context |
| Incident management | No equivalent in Frappe HR |
| ESI/PF calculation logic | Already implemented in `packages/db/src/schema/payroll.ts` — rates are correct |

**The honest build vs integrate calculus:**

The ESI/PF/PT/TDS **calculation** is not the hard part — it is 50–80 lines of TypeScript given the correct rates (which Arrow Security already has). The genuinely hard parts are:

1. **PF ECR challan `.txt` file** — a fixed-column-width format required for EPFO portal upload; format changes periodically; Frappe community maintains this
2. **ESIC Excel report** — specific column layout required by ESIC portal
3. **Income tax / TDS** — complex only at scale with many employees on different regimes with varied declarations; for a 50–200 guard deployment, a simplified slab calculator is sufficient

For a security guard platform in India with ≤500 guards, the recommendation is:
- **Build the payroll calculation and salary slip generation in Arrow Security** (already mostly done)
- **Evaluate the PF ECR challan format** — if compliance officers are fine with manual entry into the EPFO portal (common for smaller deployments), skip Frappe entirely
- **Add Frappe HR only if** the compliance team specifically needs automated challan file generation and ESIC report generation

### Effort to integrate (Pattern A, if chosen)

| Task | Estimate |
|---|---|
| Stand up Frappe HR on Frappe Cloud | 1–2 days |
| Configure salary components (Basic, HRA, PF, ESI, PT, TDS) | 1 day |
| Write Arrow Security → Frappe sync worker (Node.js, monthly batch) | 3–4 days |
| Webhook receiver in Arrow Security Fastify API | 1 day |
| Guard onboarding sync (new hire → Frappe Employee) | 1 day |
| End-to-end testing with seed data | 2 days |
| **Total** | ~9–11 days |
| **Ongoing cost** | Frappe Cloud $5–$20/month + sync maintenance |

### Key risks if integrating

1. **ERPNext does not officially support PostgreSQL.** Frappe runs on MariaDB. A separate MariaDB instance must be provisioned — it does not share Arrow Security's PostgreSQL database.

2. **GPL-3.0 license (ERPNext).** Using Frappe HR purely as an internal tool accessed over its REST API (not shipping Frappe code as part of Arrow Security's product) avoids GPL copyleft triggers under the SaaS loophole — but this is a legal grey area. If Arrow Security ever exposes Frappe functionality directly to tenant users, consult legal counsel.

3. **Sync failures.** A monthly batch sync must handle idempotency (re-running should not create duplicate Employees or Salary Slips), error retry, and alerting. At 50 guards this is simple; at 500 across multiple states it needs proper engineering.

4. **Frappe update cadence.** Frappe HR releases frequently; a self-hosted instance needs active maintenance. Frappe Cloud handles upgrades but adds recurring cost.

5. **Key mismatch.** Frappe uses human-readable string names as PKs (`"EMP-0001"`). A mapping table between Arrow Security's `createId()` keys and Frappe's keys must be maintained and kept consistent.

### Bottom line

Building ESI/PF/PT/TDS **calculation** from scratch: already done in Arrow Security; the existing `payroll.ts` schema and the rate formulas in `packages/shared/src/constants.ts` are correct.

What is NOT yet built: PF ECR `.txt` file and ESIC Excel report. If the compliance team needs these, a thin Frappe integration is the path of least resistance (~10 engineering days, ~$20/month ongoing). If not, the Arrow Security payroll module is complete enough for internal use and accountant-assisted statutory filing.

**Decision path:**
1. Ask compliance team: "Do you need automated PF ECR `.txt` upload file and ESIC Excel report, or will you manually enter monthly contributions into the EPFO/ESIC portal?"
2. If yes → implement Pattern A Frappe integration
3. If no → build a simple TSV/CSV export of PF and ESI contribution data per guard per month (2–3 days), which accountants can use for manual portal filing

---

## Algorithms Worth Porting to Arrow Security

These can be implemented directly in TypeScript/PostgreSQL without using any Frappe code (reading the algorithm from source is not a GPL violation):

### 1. Auto-attendance from check-in pairs

Arrow Security has attendance records but they are manually submitted by guards. Implementing auto-attendance would allow the system to flag missing submissions and auto-derive status from GPS check-in events.

```ts
// Port of frappe/hrms employee_checkin.py: calculate_working_hours()
function calculateWorkingHours(
  logs: { time: Date; logType: 'IN' | 'OUT' }[],
  mode: 'first_last' | 'every_valid_pair'
): number {
  if (mode === 'first_last') {
    const ins = logs.filter(l => l.logType === 'IN');
    const outs = logs.filter(l => l.logType === 'OUT');
    if (!ins.length || !outs.length) return 0;
    return (outs[outs.length - 1].time.getTime() - ins[0].time.getTime()) / 3_600_000;
  }
  // 'every_valid_pair': sum each IN→OUT interval
  let hours = 0;
  let openIn: Date | null = null;
  for (const log of logs) {
    if (log.logType === 'IN') { openIn = log.time; }
    else if (log.logType === 'OUT' && openIn) {
      hours += (log.time.getTime() - openIn.getTime()) / 3_600_000;
      openIn = null;
    }
  }
  return hours;
}
```

### 2. Shift overlap validation (add to POST /shifts)

Arrow Security's current shift creation does not check for overlapping assignments. This should be added:

```ts
// Port of frappe/hrms shift_assignment.py: validate()
const overlapping = await db
  .select()
  .from(shifts)
  .where(
    and(
      eq(shifts.guardId, guardId),
      eq(shifts.tenantId, tenantId),
      lte(shifts.startTime, proposedEnd),
      or(
        gte(shifts.endTime, proposedStart),
        isNull(shifts.endTime)
      )
    )
  );
if (overlapping.length > 0) {
  throw new Error('Shift overlaps with an existing assignment for this guard');
}
```

### 3. Verified Indian payroll rates

```ts
// Confirmed against Frappe HR salary component formulas — FY 2025-26
export const INDIA_PAYROLL = {
  PF_RATE:              0.12,      // 12% both employee and employer
  PF_WAGE_CEILING_PAISE: 1_500_000, // ₹15,000 — contributions capped at this basic
  PF_MAX_PAISE:          180_000,   // ₹1,800 max per side per month
  ESI_EMPLOYEE_RATE:    0.0075,    // 0.75%
  ESI_EMPLOYER_RATE:    0.0325,    // 3.25%
  ESI_GROSS_CEILING_PAISE: 2_100_000, // ₹21,000 — above this, ESI = 0
} as const;

export function calcPfEmployee(basicPaise: number): number {
  return Math.round(Math.min(basicPaise, INDIA_PAYROLL.PF_WAGE_CEILING_PAISE) * INDIA_PAYROLL.PF_RATE);
}
export function calcEsiEmployee(grossPaise: number): number {
  if (grossPaise > INDIA_PAYROLL.ESI_GROSS_CEILING_PAISE) return 0;
  return Math.round(grossPaise * INDIA_PAYROLL.ESI_EMPLOYEE_RATE);
}
export function calcEsiEmployer(grossPaise: number): number {
  if (grossPaise > INDIA_PAYROLL.ESI_GROSS_CEILING_PAISE) return 0;
  return Math.round(grossPaise * INDIA_PAYROLL.ESI_EMPLOYER_RATE);
}
```

---

## Open Questions for Arrow Security

1. **Challan file generation:** Does the compliance team need the EPFO ECR `.txt` file and ESIC Excel generated automatically, or will they manually file? This is the deciding factor for whether to integrate Frappe HR at all.

2. **Professional Tax:** Are Arrow Security's guards deployed across multiple Indian states? If yes, PT slab management per state becomes non-trivial. Frappe HR handles this well; building it in-house requires storing state-wise PT slab tables.

3. **Auto-attendance:** Should the system auto-derive daily attendance status from GPS check-in events (with guard submissions as the authoritative source on conflict), or continue relying purely on guard-submitted records?

4. **Shift overlap enforcement:** Should `POST /shifts` reject shifts that overlap with an existing assignment for the same guard? (Frappe does this; Arrow Security currently does not.)

5. **Coordinate precision:** Frappe HR stores lat/lng at 7 decimal places (identified as insufficient in GitHub issue #2345 — causes geofence imprecision). Arrow Security should confirm its schema stores at 10 decimal places.

6. **Form 16 / TDS return:** Is Arrow Security's payroll module expected to produce Form 16 PDFs for guards? If yes, this is substantial work and Frappe HR is significantly ahead.
