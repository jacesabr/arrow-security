# Investigation 08 — Open HRMS / Odoo HR

**Date:** 2026-05-17  
**Time-box:** 30 min  
**Verdict up front:** Skip. Nothing here meaningfully augments the Arrow Security platform.

---

## Summary

Open HRMS is a collection of Odoo add-on modules published by CybroOdoo (Cybrosys Technologies). It sits on top of Odoo Community Edition and extends the core `hr`, `hr_attendance`, and `hr_payroll` apps with ~32 additional modules. It is a generic HR suite aimed at mid-size businesses, not at field-force or security guard operations. There is no patrol management, no checkpoint scanning, no geofence enforcement, no real-time location tracking, and no concept of a "guard" role. The shift module is contract-centric and primarily useful for rotating office/factory schedules. The attendance module adds a manual-correction workflow ("regularization") on top of Odoo's built-in check-in/out. Nothing in the repository is architecturally novel for our use case.

---

## Stack & Dependencies

| Attribute        | Value |
|-----------------|-------|
| Framework        | Odoo 18.0 (Python / OWL frontend) |
| Database         | PostgreSQL (Odoo's own ORM — no direct SQL access encouraged) |
| Primary language | Python 25.9%, HTML/XML 71.9%, JavaScript 1.1% |
| License (OpenHRMS repo) | **AGPL-3.0** |
| License (core `hr_employee_shift` module) | **LGPL-3** |
| License (Odoo Community) | **LGPL-3** |
| Deployment       | Odoo server process; no standalone microservice option |

**License implications:** AGPL-3 means any networked use of a modified version requires publishing source. This makes embedding or forking Open HRMS modules into our Fastify API impossible without open-sourcing our API. LGPL-3 (for the shift module alone) is more permissive but still requires library modifications to be shared. Neither license is practical for a proprietary SaaS product.

---

## Data Model (Brief)

Odoo's HR attendance core tables (Python model names → PostgreSQL table names):

| Model | Table | Key fields |
|---|---|---|
| `hr.employee` | `hr_employee` | name, department_id, job_id, resource_calendar_id (working schedule), parent_id (manager) |
| `hr.attendance` | `hr_attendance` | employee_id, check_in (timestamp), check_out (timestamp), worked_hours (computed), overtime_hours |
| `resource.calendar` | `resource_calendar` | name, attendance_ids (M2M to line items defining work hours per weekday) |
| `resource.calendar.attendance` | `resource_calendar_attendance` | dayofweek (0–6), hour_from, hour_to, day_period (morning/afternoon) |
| `hr.employee.shift` (OpenHRMS) | `hr_employee_shift` | employee_id, shift_id (→ resource.calendar), date_start, sequence |

OpenHRMS adds:
- `attendance_regularization` — manual attendance correction request with states: draft → submitted → approved/rejected
- `ohrms_overtime` — overtime request with hours, reason, approver, state machine
- Payroll integration via `hr_payroll_community` (mirrors Odoo's payroll model: payslip → payslip lines → salary rules)

No `geofence`, `lat`, `lng`, `checkpoint`, `patrol`, `scan`, or `incident` fields exist anywhere in this codebase.

---

## API / Interface Surface

Odoo does not expose a conventional REST API. Access patterns:

- **XML-RPC**: `xmlrpc.client` against `/xmlrpc/2/object` — calls `execute_kw(db, uid, password, model, method, args)`. Usable for reading/writing records programmatically but verbose and session-based.
- **JSON-RPC**: `/web/dataset/call_kw` — same semantics, JSON body. This is what the Odoo web client uses internally.
- **OWL/Web controllers**: Custom Python `@http.route` endpoints can be added as Odoo modules, but they're still behind Odoo's session cookie auth.
- **No OpenAPI spec**, no JWT, no webhook system built in.

There is no public REST API that Arrow Security's Fastify backend or Next.js frontend could call directly without an Odoo server running. Any integration would require running a full Odoo instance as a sidecar, which is operationally heavy (Odoo requires its own PostgreSQL schema, a worker pool, and a separate port).

---

## Algorithms / Techniques Worth Borrowing

Very little that isn't already planned or implemented in Arrow Security. Three minor observations:

### 1. Attendance Regularization Workflow
Odoo's model: employee submits a retroactive attendance fix request → manager approves → system writes the corrected `check_in`/`check_out` pair. 

**Relevance:** We have no equivalent. If a guard forgets to check in, there is currently no self-service correction path. A simple `attendance_corrections` table (guardId, shiftId, requestedCheckIn, requestedCheckOut, reason, status: pending|approved|rejected, reviewedBy) with a supervisor-approval flow would be a clean addition. This is a pattern, not code we can reuse.

### 2. Overtime Tolerance Bands
Odoo's attendance config has two tolerance settings:
- "Tolerance In Favor Of Company" — minutes early departure that don't count as short shift
- "Tolerance In Favor Of Employee" — grace period before late arrival triggers a flag

**Relevance:** Our payroll module stores hours but has no configurable tolerance. Worth encoding `overtime_threshold_minutes` and `late_grace_minutes` as columns on the `sites` or a future `shift_policies` table when Indian labour law compliance becomes a requirement.

### 3. Shift Sequence / Auto-Generation
OpenHRMS generates shift schedules by repeating a defined sequence across a date range for a department. This is a basic "roster pattern" concept — define a cycle (e.g., [Day, Day, Night, Night, Off, Off, Off]) and project it forward.

**Relevance:** Our roster page (`/roster`) renders a weekly grid but does not yet auto-generate shifts from a template. A `shift_templates` table with a repeating sequence array could power this. Again, it is a pattern, not library code.

---

## What's Missing for Our Security App

Everything domain-specific is absent from Open HRMS:

| Our requirement | Open HRMS support |
|---|---|
| Geofenced GPS check-in | None (third-party modules use HTML5 geolocation for office check-in, not geofence enforcement) |
| Patrol sessions with checkpoint scanning | Completely absent |
| QR code / NFC checkpoint verification | Completely absent |
| Real-time guard location (SSE) | Completely absent |
| Incident reporting with SLA | Completely absent |
| Guard-scoped multi-tenancy (JWT role-per-tenant) | Completely absent |
| Mobile PWA / Capacitor native | Completely absent (Odoo mobile is a separate proprietary app) |
| REST API for a decoupled frontend | Absent; XML-RPC/JSON-RPC only |
| Indian payroll (ESI/PF in paise) | Absent in Community; available only in localization modules |

---

## Verdict

**Skip entirely.**

Open HRMS is a solid generic HR suite for companies that have already standardised on Odoo. It is not extractable as a library. Its code is Python (our stack is TypeScript/Fastify). Its database interaction goes through Odoo's ORM (our stack is Drizzle on PostgreSQL). Its license (AGPL-3) prohibits SaaS use of modified code without open-sourcing. It has no concepts relevant to field security operations.

The only ideas worth noting are the **attendance regularization workflow** and **overtime tolerance bands** — both are simple table/workflow patterns that take an hour to design from scratch, requiring no reference to Odoo's code.

There is no unique algorithm, data structure, or integration technique in Open HRMS that Arrow Security should borrow.

---

## Concrete Extracts

### Attendance regularization flow (pattern only — do not copy Python)

```
Table: attendance_corrections
  id              text PK
  tenant_id       text FK tenants.id
  guard_id        text FK users.id
  shift_id        text FK shifts.id
  requested_in    timestamptz
  requested_out   timestamptz
  reason          text
  status          text  -- 'pending' | 'approved' | 'rejected'
  reviewed_by     text FK users.id
  reviewed_at     timestamptz
  created_at      timestamptz
```

Supervisor sees a queue at `GET /api/attendance/corrections`; approves via `PATCH /api/attendance/corrections/:id/status`. On approval, the API upserts the `attendance_records` row.

### Overtime tolerance config (pattern)

Add to `shifts` or a future `shift_policies` table:
```sql
late_grace_minutes       integer default 5,
early_out_grace_minutes  integer default 5,
overtime_threshold_minutes integer default 30
```

Payroll calculation logic: only count overtime if `worked_hours > scheduled_hours + threshold_minutes/60`.

---

## Open Questions for Synthesis

1. **Attendance corrections** — Is a guard self-service correction workflow on the roadmap? If supervisors handle all corrections manually today, a formal flow may reduce friction.
2. **Shift templates / roster auto-generation** — The OpenHRMS "shift sequence" pattern is worth considering when building out the `/roster` page auto-fill feature. Does Jace want a "generate roster from template" button?
3. **Overtime tolerance** — Indian labour law has specific rules on overtime rates. Should `overtime_threshold_minutes` be captured per-site or per-contract?
4. **RFID** — OCA's `hr_attendance_rfid` module shows RFID is a common hardware check-in method. Any clients requesting RFID badge check-in at site gates instead of QR?
