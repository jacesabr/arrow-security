# 09 — ShiftExec Assessment

**Date:** 2026-05-17
**Time budget:** 30 min quick assessment
**Tool:** Web search + page fetches (no source code available)

---

## Summary

ShiftExec is a small commercial PHP/MySQL web application for employee scheduling, sold by Plainware (a two-person shop). It calls itself "open source" but is better described as source-available/proprietary: the PHP files are deployed to your own server but you do not get license terms permitting redistribution or modification. There is no public GitHub repository. The current version is 5.1.3 (April 2024). It targets small-to-medium businesses across many industries (including security) but is fundamentally a generic rota tool with no domain-specific features for guard operations.

---

## Stack & Dependencies

| Item | Detail |
|---|---|
| Language | PHP 5.6+ (no framework cited — lead dev is "enthusiast PHP programmer") |
| Database | MySQL 4.1+ OR SQLite3 (PHP module) |
| Frontend | Server-rendered HTML; no JS framework mentioned |
| Deployment | Self-hosted via FTP upload; package < 1 MB |
| License | **Proprietary / source-available** — free tier requires a link-back; Pro costs $59 one-time per site; perpetual use of last version after update period expires |
| Source access | No public repo; no stated OSI license; no source code modification rights mentioned |

---

## Data Model (inferred — no schema published)

ShiftExec does not publish its schema. From documentation and feature descriptions the implied tables are:

- **employees** — name, group/role assignment
- **shift_types** — label, color (Pro), custom fields (Pro)
- **shifts** — employee_id, shift_type_id, start_date, end_date
- **timeoff** — employee_id, timeoff_type_id, start_date, end_date, status
- **timeoff_types** — label, restricted_to_group

Conflict detection is described as automatic overlap checking between shifts and time-off entries. No mention of GPS, geofence radius, site assignment, incident records, patrol logs, or check-in events.

---

## API / Interface Surface

- REST API is advertised ("control shifts and time off with REST API") but **no public documentation exists** — no endpoint list, no auth spec, no payload format. Likely a thin CRUD wrapper added in v5.x.
- CSV export and JSON feed for external consumption.
- iCal sync feed (one-way, read-only) for Google Calendar / Outlook / iPhone Calendar.
- No webhook support mentioned.
- No mobile SDK or native app.

---

## Algorithms / Techniques Worth Borrowing

Very little to extract algorithmically:

1. **Conflict detection pattern** — check new shift against existing shifts and time-off for the same employee on overlapping dates. Simple date-range overlap query. We already do this implicitly; worth making it an explicit pre-save validation in our API.
2. **iCal feed** — exporting shifts as `.ics` so guards can subscribe in their phone calendar is a low-effort, high-value convenience feature we have not yet built.
3. **Copy schedule** (Pro add-on) — duplicating a prior week's rota as a starting template. Simple week-offset clone of shift records; worth adding to our roster page.

---

## What's Missing for Our Security App

ShiftExec has none of the following, which are core to our platform:

| Missing Feature | Our Equivalent |
|---|---|
| GPS check-in / geofence enforcement | `attendance_records` with GPS + geofence radius on `sites` |
| Guard patrol & checkpoint scanning | `patrols`, `checkpoints`, `patrol_scans` tables |
| Live location tracking (SSE) | `guard_locations` + in-memory SSE fan-out |
| Incident reporting & SLA deadlines | `incidents` table with severity + deadline |
| Multi-tenant isolation | `tenantId` on every table, JWT-scoped |
| Role hierarchy (guard → supervisor → admin) | `platform_admin > tenant_admin > supervisor > guard > client_viewer` |
| Payroll with statutory deductions | `payroll_records` with ESI/PF (Indian law) |
| Client company management | `clients` table |
| QR / NFC checkpoint scanning | `checkpoints.qrCode`, mobile scanner |
| Native mobile app (Capacitor PWA) | `apps/mobile` |

---

## Verdict

ShiftExec is too lightweight for our needs by a wide margin. It solves exactly one problem — basic employee rota scheduling with time-off — and does so with a 2000s-era PHP architecture that has no path to our Fastify/TypeScript/Drizzle stack. Its REST API is undocumented and almost certainly does not cover the patrol, incident, location, or payroll domains we require. Even if we wanted to embed it, the proprietary license prevents meaningful fork or modification. The only ideas worth borrowing (iCal export, copy-week template, explicit conflict validation) are all trivial to implement ourselves in a couple of hours.

---

## Concrete Extracts

From the ShiftExec homepage:
> "Avoid scheduling conflicts — overlapping shifts or time off are automatically highlighted."

From the requirements page:
> "PHP 5.6 or above. MySQL 4.1 or above (or SQLite3). The package is typically under 1MB. No non-standard modules required."

From the order page:
> "ShiftExec Pro — $59 — 1 site, 1 year of updates, all pro add-ons. One license key allows you to use the software indefinitely."

From the about page:
> "Plainware, a small web development company. Max B. — enthusiast PHP programmer/web developer — most of software architecture, programming and customizations."

---

## Open Questions for Synthesis

1. **iCal feed** — should we add an `.ics` export to our shifts API so guards can subscribe in Google Calendar / iPhone Calendar? Low effort, immediately useful.
2. **Copy-week roster** — the tenant `/roster` page would benefit from a "duplicate last week" action. No algorithm needed — just a date-offset INSERT.
3. **Explicit conflict validation** — should our `POST /shifts` endpoint return a 409 with conflict details if the guard already has an overlapping shift or approved time-off? Currently we have no such guard.
4. **Licensing note** — ShiftExec's "open source" self-description is misleading; do not reference it as a genuine OSS alternative in product comparisons.
