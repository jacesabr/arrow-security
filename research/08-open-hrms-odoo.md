# Open HRMS / Odoo — Research Notes

**Date:** 2026-05-17
**Scope:** Can Odoo (with Open HRMS extensions) serve as a payroll backend for Arrow Security, handling Indian statutory compliance while Arrow Security keeps its own guard-ops frontend?

---

## Open HRMS vs Odoo HR

**Odoo HR** is the base platform — an open-source ERP with HR, Attendance, Payroll, Time Off, and Recruitment modules. The core codebase is split:

- **Community Edition** (LGPL-3, free): Basic HR — employee records, attendance check-in/out, leave management. Payroll (`hr_payroll`) is **Enterprise-only** in the official distribution.
- **Enterprise Edition** (proprietary): Adds full payroll, advanced reporting, Odoo Studio, multi-company, and external API access on hosted plans.

**Open HRMS** is a collection of ~40 Odoo add-on modules published by Cybrosys Techno Solutions (CybroOdoo). It is free and open-source (AGPL-3). Its key additions on top of Odoo Community:

| Module | What it adds |
|--------|-------------|
| `hr_payroll_community` | A free payroll engine that mirrors Odoo Enterprise's `hr_payroll` — salary structures, salary rules, payslip generation. Maintained by Cybrosys. Available v13–v19. |
| `hr_payroll_account_community` | Payroll-to-accounting journal entries for Community users. |
| `ohrms_overtime` | Overtime request workflow (draft → approved → payslip line). |
| `attendance_regularization` | Guard/employee submits retroactive attendance correction; supervisor approves. |
| `ohrms_loan` / `ohrms_loan_accounting` | Employee loan advances deducted from payslip. |
| `hr_gratuity_settlement` | Gratuity calculation on resignation/retirement. |
| `ohrms_salary_advance` | Salary advance request workflow. |
| `hr_employee_shift` | Shift assignment (contract-centric; not guard-patrol aware). |
| `hrms_dashboard` | HR summary dashboard. |
| `saudi_gosi`, `uae_wps_report` | Regional compliance for Saudi/UAE — **no equivalent Indian module in this repo**. |

**Key finding:** Open HRMS does not add Indian statutory payroll compliance modules (ESI, PF, PT, TDS). Those live in Odoo's official `l10n_in_hr_payroll` localization module, which is an Enterprise-only module. Open HRMS's `hr_payroll_community` provides the payroll engine but not the Indian localization rules on top of it.

---

## Indian Payroll Compliance Features

Odoo's official Indian payroll localization (`l10n_in_hr_payroll`) is documented for Odoo 19.0 and covers all four major statutory areas:

### Employee Provident Fund (EPF)
- Configurable cap: Basic salary can be capped at ₹15,000 (per EPF statutory rule) or calculated on actual wages.
- UAN (Universal Account Number) stored per employee.
- EPF Employer ID registered at company level.
- Auto-generates EPF Report listing employee UAN, employer contribution, employee contribution — ready for EPFO filing.
- Employer matching contribution (12% on Basic) is computed separately from the employee deduction.

### Employee State Insurance (ESIC)
- ESIC Employer Code (10-digit IP Number) configured at company level.
- 17-digit ESIC Number stored per employee.
- Threshold: employees earning above ₹21,000/month are exempt — system applies automatically.
- Rates: 0.75% employee contribution, 3.25% employer contribution.
- ESI Report generated for ESIC filing.

### Professional Tax (PT)
- State-level slab rates applied automatically based on the employee's state (from contract).
- PT registration number stored per company.
- Handles state-by-state variation (Karnataka ₹200/month, Maharashtra tiered slabs, states with ₹0, etc.).

### Tax Deducted at Source (TDS) / Income Tax
- PAN (10-char alphanumeric) stored per employee for IT reporting.
- TDS computed against income tax slabs.
- Form 16 generation mentioned in Enterprise documentation.

### Labour Welfare Fund (LWF)
- LWF Establishment Number configured at company level.
- State-specific LWF contribution rates applied.
- LWF Report for statutory filing.

### Available Statutory Reports
- Salary Register
- EPF Report (EPFO-ready)
- ESI Report (ESIC-ready)
- Labour Welfare Fund Report
- Salary Statement (employee-facing)
- Yearly Salary by Employee

### Critical limitation
The `l10n_in_hr_payroll` module with all the above features is **Enterprise-only**. Community Edition users would need to:
1. Use a third-party Indian localization module from the App Store (paid, varying quality), or
2. Build the salary rules for ESI/PF/PT/TDS manually using `hr_payroll_community`'s salary rule engine (Python-expression-based formulas — feasible but requires implementation work), or
3. Use Open HRMS's payroll engine and write the Indian rules from scratch.

---

## API Integration Capabilities

### Available protocols

Odoo exposes three API protocols, all accessing the same underlying ORM:

| Protocol | Endpoint | Status |
|----------|----------|--------|
| XML-RPC | `/xmlrpc/2/common`, `/xmlrpc/2/object` | Stable, available all versions, **deprecated — removal planned for Odoo 22 (fall 2028)** |
| JSON-RPC | `/web/dataset/call_kw` | Modern, JSON payloads, recommended for new integrations |
| REST (JSON-2) | `/api/*` | New in Odoo 16/17, **not yet comprehensive for HR/payroll** — use JSON-RPC for these models |

All three share the same CRUD capabilities: `search_read`, `create`, `write`, `unlink`, `browse`. There is no OpenAPI spec and no webhook/push system built in.

### Authentication

- **Username + password** against `/xmlrpc/2/common` (returns a `uid`)
- **API keys** (v14+): generated in user preferences; replace the password in all calls; can be revoked. Recommended for server-to-server.
- **No JWT** — every call passes credentials (or session cookie for JSON-RPC).

### Posting attendance records (the key integration point)

Arrow Security could POST guard attendance to Odoo's `hr.attendance` model:

```python
# XML-RPC example — write attendance for a guard
uid = common.authenticate(db, username, api_key, {})
models.execute_kw(db, uid, api_key, 'hr.attendance', 'create', [{
    'employee_id': odoo_employee_id,
    'check_in': '2026-05-17 08:00:00',  # UTC
    'check_out': '2026-05-17 16:00:00',
}])
```

Required fields: `employee_id` (integer FK to `hr.employee`), `check_in` (datetime). `check_out` is optional at check-in time and can be patched later via `write`.

Odoo's payroll engine then auto-creates **Work Entries** from these attendance records, which feed into payslip computation — no manual step needed if configured correctly.

### Triggering payslip computation

```python
# Create a payslip for an employee for a pay period
payslip_id = models.execute_kw(db, uid, api_key, 'hr.payslip', 'create', [{
    'employee_id': odoo_employee_id,
    'date_from': '2026-05-01',
    'date_to': '2026-05-31',
    'struct_id': india_pay_structure_id,
}])
# Trigger computation (equivalent to clicking "Compute Sheet")
models.execute_kw(db, uid, api_key, 'hr.payslip', 'compute_sheet', [[payslip_id]])
# Read back computed lines
lines = models.execute_kw(db, uid, api_key, 'hr.payslip.line', 'search_read',
    [[['slip_id', '=', payslip_id]]],
    {'fields': ['name', 'code', 'total']})
```

This pattern works but has notable friction:
1. You need a running Odoo instance (Python + PostgreSQL) as a sidecar service.
2. Employee IDs must be synced between Arrow Security's `users` table and Odoo's `hr.employee` table.
3. Odoo computes payslips using its own Work Entry model — if attendance was written via API, Odoo must first generate Work Entries from that attendance before payslip computation produces correct results. This involves calling `hr.work.entry`'s `generate_work_entries` method or relying on a scheduled action.
4. No real-time response: Odoo payslip computation is synchronous within the RPC call, but the compute can be slow for large batches.

### Access plan restrictions (hosted Odoo)

| Plan | External API | Price (India, 2026) |
|------|-------------|---------------------|
| One App Free | No | ₹0 |
| Standard | No | ₹580–760/user/month |
| Custom | Yes | ₹890–1,140/user/month |

For **self-hosted / on-premise Odoo**: no API rate limits, no plan restrictions. The API works freely. This is the only cost-effective option if Arrow Security wants API integration without per-user SaaS fees.

---

## Attendance Module

Odoo's `hr.attendance` module (Community, free):

- Check-in / check-out via kiosk mode (browser), PIN, RFID badge, or barcode.
- `worked_hours` computed field (float) auto-calculated from `check_out - check_in`.
- `overtime_hours` computed against employee's working schedule (`resource.calendar`).
- Overtime analysis report.
- Manual attendance correction available in the UI (manager can edit records directly).
- Open HRMS adds `attendance_regularization` — a formal approval workflow for corrections.

**What it lacks for Arrow Security's use case:**
- No GPS coordinates on attendance records.
- No geofence enforcement.
- No guard-specific role scoping — it is employee-generic.
- No concept of a site or patrol checkpoint.

Arrow Security would be using Odoo attendance purely as a **payroll computation input**, not as its primary attendance system. Guards would still check in/out via Arrow Security's own Fastify API (with GPS + geofence), and Arrow Security would then sync confirmed attendance records to Odoo's `hr.attendance` for payroll purposes.

---

## Multi-company Support

Odoo's native multi-company is an Enterprise feature (or requires the Custom plan on hosted). It allows:

- Multiple company records in one Odoo database, each with their own:
  - EPF Employer ID
  - ESIC Employer Code
  - Professional Tax registration
  - LWF Establishment Number
  - Chart of accounts
  - Bank accounts
- Employees assigned to a specific company.
- Payslips generated per company.
- Users can switch between companies with a company selector in the UI.

For Arrow Security's multi-branch scenario (e.g., separate Delhi and Mumbai entities with different ESI/PF registrations), this works natively. Each branch is a separate Odoo company. Guards are employees of the appropriate company.

Third-party modules (`bi_odoo_multi_branch_hr`, `sh_hr_payroll_branch`) add an even more granular "branch" concept below the company level — useful if Arrow Security wants a single legal entity with multiple operational branches, each with separate payroll reporting.

**Caveat:** Multi-company in Odoo is an Enterprise / Custom plan feature. On Community Edition (self-hosted, free), multi-company HR requires third-party modules or custom code.

---

## Implementation Effort

### Scenario: Odoo as a payroll backend sidecar

This is the integration Arrow Security would pursue if it chose Odoo. The integration points are:

1. **Employee sync**: When a guard is created/updated in Arrow Security, mirror them to Odoo's `hr.employee`. Maintain a mapping table (`arrow_user_id → odoo_employee_id`).
2. **Attendance sync**: At end of each shift (or on check-out), POST a `hr.attendance` record to Odoo via JSON-RPC.
3. **Monthly payroll trigger**: On the 1st of each month, call `hr.payslip.batch` to generate payslips for all guards, then call `compute_sheet`.
4. **Read back results**: Query `hr.payslip.line` to retrieve gross pay, ESI, PF, PT, net pay in Odoo's currency (rupees float — Arrow Security stores paise integers). Display or export from Arrow Security's Operations Portal.
5. **Reports**: Either deep-link into Odoo's report UI, or query the data and render your own EPF/ESI reports.

**Effort estimate:**

| Task | Effort |
|------|--------|
| Stand up Odoo instance (Docker, self-hosted) | 1–2 days |
| Configure Indian payroll localization + salary structure | 2–4 days (if Enterprise/localization available) or 1–2 weeks (if building ESI/PF rules manually in Community) |
| Build employee sync service (Arrow → Odoo) | 3–5 days |
| Build attendance sync (Arrow → Odoo on checkout) | 2–3 days |
| Build payroll trigger + read-back in Arrow API | 3–5 days |
| Build payroll display in Operations Portal | 2–3 days |
| Testing + edge cases (ESI threshold, PF cap, mid-month joiners) | 1–2 weeks |
| **Total** | **5–10 weeks** |

This does not include the ongoing operational cost of running an Odoo instance (Odoo requires a separate PostgreSQL schema, Python worker pool, and its own port — it is not a lightweight sidecar).

### Licensing costs

| Option | Cost |
|--------|------|
| Odoo Community + Open HRMS (`hr_payroll_community`) | Free (self-hosted), but no Indian localization module |
| Odoo Enterprise (on-premise) | Custom quote from Odoo; approximately ₹1,500–2,500/user/year for on-premise license |
| Odoo Online Custom plan | ₹890–1,140/user/month (per guard — prohibitively expensive for 50+ guards) |
| Implementation partner (India) | ₹3–20 lakh one-time depending on scope |

---

## Recommendation: External vs Internal Payroll

### The core question

Should Arrow Security use Odoo as a payroll calculation engine, or build the payroll math in-house (the current approach: paise-integer storage, ESI/PF fields on `payroll_records`)?

### Arguments for Odoo integration

- Statutory compliance is maintained by Odoo's India localization team — rate changes (ESI threshold, PF wage ceiling) are applied via Odoo updates, not Arrow Security code changes.
- EPF and ESI reports are pre-built and format-correct for EPFO/ESIC filing.
- Handles edge cases: mid-month joining, partial pay periods, LOP (loss of pay), overtime.
- Multi-company payroll with separate EPF/ESI registrations works natively.
- Auditable payslip history lives in Odoo — accessible independently of Arrow Security.

### Arguments against Odoo integration

1. **Operational complexity.** Odoo is a full ERP — ~500 MB Docker image, requires its own database, its own port, Python workers. Running it as a sidecar to a Fastify API that's already on Postgres is a heavy dependency for what is a calculation engine.

2. **Indian localization requires Enterprise or custom salary rules.** The `l10n_in_hr_payroll` module (with pre-built ESI/PF/PT logic) is Enterprise-only. On Community + Open HRMS, you get the payroll engine but must write all Indian statutory rules as Python salary rule expressions yourself — which means you're doing the same work as rolling your own payroll, just in Odoo's DSL instead of TypeScript.

3. **API is not designed for this use case.** Odoo's RPC API is an ORM bridge, not a payroll API. You'd be calling `execute_kw` on `hr.payslip` and parsing raw ORM field values. There is no clean "POST attendance, GET payslip with ESI/PF breakdown" endpoint. Every integration detail requires navigating Odoo's internal model structure.

4. **Sync complexity.** Two systems of record for employees and attendance — both must be kept in sync. Any desync (guard deleted in Arrow Security but still in Odoo, attendance record missing for a day) creates payslip errors that are hard to debug across system boundaries.

5. **The payroll math is not complex.** Indian statutory payroll for security guards involves:
   - Basic × 12% = PF (cap at ₹1,800 if Basic > ₹15,000)
   - Gross × 0.75% = ESI employee (if Gross ≤ ₹21,000)
   - Gross × 3.25% = ESI employer
   - Professional Tax from state slab table (a lookup, ~30 rows)
   - TDS: only relevant for high-earning supervisors/admins
   
   This is 50–100 lines of TypeScript. Arrow Security already has `payroll_records` and `payroll_periods` schema in place. The remaining work is implementing these formulas correctly and keeping the slab tables updated — not architecting a calculation engine.

6. **Compliance updates are infrequent.** ESI thresholds and PF rules change rarely. Arrow Security can update its TypeScript constants when the government notifies changes — the same trigger that would prompt an Odoo version upgrade.

### Verdict

**Do not integrate Odoo as a payroll backend. Build the remaining payroll logic in-house.**

The integration effort (5–10 weeks) and operational overhead of running Odoo exceed the benefit. The payroll calculations for Indian security guards are well-defined and bounded — the complexity is in knowing the rules, not in building a calculation engine.

The right approach for Arrow Security:

1. **Implement the salary rule formulas in `packages/db/src/schema/payroll.ts`** and in the payroll calculation route (`apps/api/src/routes/payroll.ts`). Keep the existing paise-integer storage.
2. **Add a `salary_rules` or `statutory_config` table** for the per-state PT slabs and ESI threshold, so rate changes are a data update rather than a code change.
3. **Generate EPF and ESI reports** as CSV exports from Arrow Security's own payroll data — the format is a fixed spec from EPFO/ESIC and is straightforward to implement.
4. **Defer Form 16 / TDS to an external CA or accounting firm** in early phases — this only affects a handful of senior staff and is outside the guard-ops core.

If Arrow Security later needs full accounting, ledger management, or wants to serve clients who are already on Odoo, an Odoo integration can be revisited at that point. Today it adds more complexity than it removes.

### Alternative to Odoo worth watching: greytHR

greytHR (India-specific, SaaS) has a proper REST API, handles ESI/PF/PT/TDS natively, generates Form 16 and EPFO/ESIC challans, and is priced per employee rather than requiring a self-hosted ERP. For a security company that wants to offload all payroll compliance rather than build it:

- greytHR Starter: approximately ₹3,495/month for up to 50 employees
- Attendance sync via API (POST attendance data, pull payslip results)
- No self-hosted infrastructure required

This is a more targeted integration than Odoo for a company that wants to stay focused on guard operations. Consider greytHR as the payroll integration option if the decision is revisited — not Odoo.

---

## Sources Consulted

- Odoo 19.0 India Payroll Localization Documentation: https://www.odoo.com/documentation/19.0/applications/hr/payroll/payroll_localizations/india.html
- Odoo External RPC API Reference (v19): https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
- Odoo External API Reference (v18): https://www.odoo.com/documentation/18.0/developer/reference/external_api.html
- Odoo Forum — Payroll in Community v17/v18: https://www.odoo.com/forum/help-1/payroll-for-v17-and-v18-257034
- Odoo Pricing (India): https://www.odoo.com/pricing
- Open HRMS GitHub Repository (CybroOdoo): https://github.com/CybroOdoo/OpenHRMS
- hr_payroll_community module (Cybrosys / Odoo Apps): https://apps.odoo.com/apps/modules/18.0/hr_payroll_community
- OCA Payroll modules: https://github.com/OCA/payroll
- Odoo API Integration Guide (getknit.dev): https://www.getknit.dev/blog/odoo-api-integration-guide-in-depth
- Odoo Forum — hr.attendance API: https://www.odoo.com/forum/help-1/check-incheck-out-using-api-v180-275891
- Odoo Implementation Cost India (TCBInfotech): https://tcbinfotech.com/odoo-implementation-cost-in-india/
- Odoo Community vs Enterprise comparison: https://icontechsoft.com/odoo-community-vs-enterprise/
- greytHR + Zoho People integration (attendance → payroll pattern): https://www.zoho.com/people/help/adminguide/integration-greythr.html
