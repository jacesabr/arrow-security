# Security Guard Management Tools — Research Notes

_Researched: May 2026. Market context: security guard management software valued ~$2.6B in 2025, growing to $5.5B by 2032._

---

## ShiftExec Feature Analysis

ShiftExec is **not a security-specific platform**. It is a generic, open-source self-hosted employee scheduling (rota) system built on PHP + MySQL.

**What it actually is:**
- Self-hosted web app — you install it on your own server
- Free base version (requires link-back credit); Pro license is a flat $59 perpetual fee
- Pro add-ons are minimal: Copy Schedule, Custom Colors, Custom Fields
- No GPS, no incident reporting, no guard tours, no payroll, no client portal
- Built for any shift-based workforce, not security-specific at all

**Why it was mentioned:** The name sounds like a security guard shift tool but it is purely a scheduling widget. It has essentially zero relevance as a competitor to Arrow Security or as a feature-inspiration source. The meaningful competitors are TrackTik, Belfry, Silvertrac, GuardsPro, and Novagems.

---

## Competitive Landscape

### TrackTik (acquired by Trackforce, largest enterprise player)
- **Target:** 500+ guard operations, global enterprises
- **Pricing:** Custom quotes only (expensive)
- **Core strengths:**
  - End-to-end: scheduling → guard tours → incidents → billing → client portal
  - Command Center: live map with alarm integration, camera feeds, AI dispatch
  - Post Orders: digital site instructions delivered to guard's phone, with acknowledgment tracking per guard
  - ReportPro AI: incident reports with AI-assisted narratives and multimedia
  - Client portal: clients log in to see patrol logs, SLA metrics, incident reports
  - Contracts + Invoicing: billing rates tied directly to schedules, automated invoicing
  - 55+ languages, 50+ countries
  - NFC / QR / BLE / GPS checkpoint flexibility
  - Guard certification and license renewal tracking with automated alerts
  - Lone worker protection (periodic check-in timer + panic button)

### Belfry (fastest-growing US mid-market player, ~2022 founding)
- **Target:** 20–500 guards, US security companies
- **Pricing:** Not public; mid-market positioning
- **Core strengths:**
  - Scheduling with smart shift matching + automated shift offers to qualified guards
  - Shift Marketplace: guards self-select open shifts, AI enforces compliance rules
  - NFC/geofence guided tours with checkpoint verification
  - Real-time client portal with shift drilldowns and live officer activity
  - Full payroll: automated from timesheets, custom pay rates, next-day deposits, tax filing, direct deposit
  - Billing: automated invoicing, ACH + credit card, billed vs. unbilled overtime forecasting, site-level profitability reports
  - Officer certification management (license expiry tracking, renewal alerts)
  - Timekeeping: GPS-synced auto-approvals, break compliance alerts, overlap flagging
  - Two-way in-app messaging
  - Shift Attestation for compliance (guards confirm they took breaks, etc.)
  - **2026 roadmap:** AI Shift Autopilot (auto-detects call-offs and coverage risk), embedded ATS, Earned Wage Access, AI report summarization

### Silvertrac
- **Target:** Small to mid-sized security companies
- **Pricing:** $249/month for up to 10 devices (mandatory setup fees + annual contracts)
- **Core strengths:**
  - QR, barcode, and NFC checkpoint scanning
  - GPS-timestamped incident reports with up to 10 photos per report
  - Live GPS map of officer activity
  - Automated daily activity reports (DARs) delivered to clients
  - Post orders + pass-down notes (shift handover information)
  - Lone worker protection (check-in timer + panic button)
  - Officer dispatching system
  - Visitor management
  - Parking management (vehicle registration, permit sales, violation tracking)
  - Geofencing with violation alerts
  - Client-facing reporting portal
  - Equipment status monitoring

### GuardsPro
- **Target:** Small to mid-sized companies; mobile-first
- **Pricing:** Starting at $10/user/month
- **Core strengths:**
  - Post Orders module: share clear instructions with field teams
  - GPS-enabled site touring with checkpoint verification
  - Dispatcher: register and assign dispatch calls from multiple sources
  - Daily Activity Reports (DARs)
  - Incident reporting with immediate notifications
  - Passdowns: guards share notes at shift transitions
  - Client Web Portal + Client Mobile App (clients track their own sites)
  - Invoices and Estimates: billing + payment tracking
  - Messenger: secure in-app team communication
  - Vehicle patrol management
  - Hours-by-report for payroll filtering by client/location/skill
  - Dark mode, 2-step auth

### Novagems
- **Target:** Small to mid-sized; price-competitive full-stack
- **Pricing:** Free 14-day trial; monthly subscription (below TrackTik)
- **Core strengths:**
  - Offline-first: checkpoint scans, incident reports, clock-in work without signal, auto-sync
  - NFC + QR checkpoint tours
  - Lone worker check-ins with panic alerts
  - Shift swapping capabilities
  - Client portal
  - Payroll export integration
  - Guard certification and license tracking

### Celayix
- **Target:** Mid-market, 25+ years in security scheduling
- **Core strengths:**
  - Rules-based smart shift replacement (best-fit, most cost-effective guard selection)
  - Direct payroll system integrations (no manual re-entry)
  - Guard touring with QR/NFC/app
  - Prevents non-billable overtime via scheduling rules
  - Connects scheduling → time tracking → payroll → billing in one workflow

### GuardOwl
- **Target:** 20–200 guards; automation-first mid-market
- **Core strengths:**
  - AI-powered shift replacement (detects call-off patterns, fills gaps automatically)
  - Mobile-first shift marketplace where guards self-select
  - GPS verification at clock-in/out
  - Mid-range transparent pricing

### QR-Patrol
- **Target:** Checkpoint-focused operations
- **Core strengths:** Multiple checkpoint methods (QR, NFC, beacons), GPS geofencing; not a full workforce suite

### SequriX (Netherlands)
- **Target:** European security companies
- **Core strengths:**
  - Smart Guard Dispatch: automated alarm-response assignment (72-second response target)
  - SequriX Hub: subcontracting platform for inter-company collaboration
  - Static Security digital logbooks with automated customer reports
  - Contract management tied to operations
  - Offline mobile app
  - Commercial SaaS, not open source

### Shivaizer / Shivit (India market)
- **Target:** Indian security companies (PSARA compliance)
- **Core strengths:**
  - PSARA regulatory automation: training history, licence validity, duty rosters, incident logs in one-click audit format
  - License expiry alerts at 30/60/90 days
  - Auto-calculated payroll from GPS/QR-verified attendance; exports to Tally and Zoho Payroll
  - Client portals per-client: live guard positions, patrol records, incident reports, SLA metrics
  - Automated invoice generation from verified deployment data with multi-rate contract handling
  - AI anomaly detection for patrol patterns
  - 72-second alert escalation

### OfficerHR (US, HR-focused)
- **Target:** Security company recruiters / HR managers
- **Core strengths:** Job posting, application screening with AI ranking, license tracking with 90/60/30/20-day renewal alerts
- **What it is not:** Not an operations platform; no scheduling, payroll, or dispatch

### OfficerBilling (US, billing-focused)
- **Target:** Security company sales/estimating teams
- **Core strengths:** Precision cost calculator for guard rates, proposal generator, contract management, profit analysis dashboard, client relationship tracking
- **What it is not:** Not operations; no scheduling, GPS, or incident reporting

---

## Feature Gap Analysis vs Arrow Security

Arrow Security currently has: scheduling/shifts, GPS location tracking (SSE live map), patrol + QR checkpoint scanning, incident reporting, check-in/check-out with geofence, payroll periods with ESI/PF, basic site/guard/client CRUD, JWT auth with role hierarchy.

### Gaps — Operational

| Feature | Mature Competitors Have It | Arrow Security Status |
|---|---|---|
| Post Orders | TrackTik, Silvertrac, GuardsPro, Belfry | Not built |
| Guard Acknowledgment of Post Orders | TrackTik (with counter tracking) | Not built |
| Passdowns / Shift Handover Notes | Silvertrac, GuardsPro | Not built |
| Daily Activity Reports (DARs) | Silvertrac, GuardsPro, Novagems, Belfry | Not built |
| Dispatch module (assign tasks to guards in real time) | TrackTik, GuardsPro, Silvertrac, SequriX | Not built |
| Visitor Management | Silvertrac, GuardsPro | Not built |
| Lone Worker Protection (periodic check-in timer) | TrackTik, Silvertrac, Novagems, Belfry | Not built |
| Panic Button | TrackTik, Silvertrac, Novagems, Belfry | Stub in CLAUDE.md |
| Vehicle Patrol Management | GuardsPro, Silvertrac | Not built |

### Gaps — Workforce / HR

| Feature | Mature Competitors Have It | Arrow Security Status |
|---|---|---|
| Guard Certification / License Tracking | TrackTik, Belfry, OfficerHR, Shivaizer, Novagems | Not built |
| License Renewal Alerts (90/60/30 day) | OfficerHR, TrackTik, Belfry, Shivaizer | Not built |
| Shift Marketplace (guard self-select open shifts) | Belfry, GuardOwl, TARGPatrol, Novagems | Not built (schema stub only) |
| Shift Swap Requests | Novagems, TARGPatrol, others | Not built (noted in CLAUDE.md) |
| Shift Attestation (break confirmation) | Belfry | Not built |
| Applicant Tracking System / Onboarding | OfficerHR, Belfry (2026 roadmap) | Not built |
| Earned Wage Access / On-demand pay | Belfry | Not built |

### Gaps — Client-Facing

| Feature | Mature Competitors Have It | Arrow Security Status |
|---|---|---|
| Client Portal (self-service web/mobile) | TrackTik, Silvertrac, GuardsPro, Belfry, Novagems | Not built |
| Client Mobile App | GuardsPro | Not built |
| Per-client SLA metric reporting | Shivaizer, TrackTik | Not built |
| Automated DAR delivery to clients | Silvertrac, GuardMetrics, GuardsPro | Not built |

### Gaps — Billing / Finance

| Feature | Mature Competitors Have It | Arrow Security Status |
|---|---|---|
| Client Invoicing / Billing | Belfry, GuardsPro, Celayix, TrackTik, Silvertrac | Not built |
| Bill rates per site / contract | TrackTik, Celayix, Belfry | Not built |
| Automated invoice generation | Belfry, Shivaizer, GuardsPro | Not built |
| Profit margin / site profitability dashboards | Belfry | Not built |
| Pricing proposal generator | OfficerBilling | Not built |
| ACH / credit card payment collection | Belfry | Not built |

### Gaps — Advanced / AI

| Feature | Mature Competitors Have It | Arrow Security Status |
|---|---|---|
| AI-powered incident report narratives | TrackTik ReportPro AI | Not built |
| AI Shift Autopilot (call-off prediction, auto-fill) | Belfry (2026), GuardOwl | Not built |
| Predictive overtime forecasting | Belfry | Not built |
| Alarm response dispatch integration | TrackTik, SequriX | Not built |
| Camera / CCTV integration (Frigate) | TrackTik Command Center | Schema stub only |

---

## Table Stakes Features We Must Have

These are features that clients and guards **expect by default** from any security guard platform in 2025. Absence will block sales:

1. **GPS clock-in/clock-out with geofence** — Arrow has this.
2. **QR/NFC checkpoint patrol scanning** — Arrow has QR; NFC is a mobile stub.
3. **Incident reporting with photos** — Arrow has incidents; no photo upload yet (MinIO stub).
4. **Real-time GPS live map for supervisors** — Arrow has this (SSE + MapLibre).
5. **Mobile-first guard app** — Arrow has this (Ionic/Capacitor).
6. **Shift scheduling with role-based visibility** — Arrow has this.
7. **Role-based access (admin / supervisor / guard / client)** — Arrow has this.
8. **Post Orders / Site Instructions** — Arrow does NOT have this. Every competitor has it. Guards receive digital standing orders for each site at shift start.
9. **Daily Activity Reports (DARs)** — Arrow does NOT have this. Auto-generated shift summaries expected by clients.
10. **Client Portal (read-only)** — Arrow does NOT have this. Clients log in to see their own site's patrols/incidents. This is now table stakes, not a differentiator.
11. **Incident photo documentation** — Arrow has incidents but MinIO is not wired up. Must complete.
12. **Passdowns / Shift Handover Notes** — Expected by supervisors. Simple text note from outgoing to incoming guard.
13. **Offline mode for guard app** — Novagems highlights this as a differentiator but competitors all claim it. Arrow's Ionic PWA needs verified offline checkpoint scanning + incident draft queue.

---

## Differentiating Features Worth Building Next

These features set platforms apart and justify premium positioning. Not every security company has them yet:

### High-Value / Build Soon

1. **Guard Certification & License Tracking with Renewal Alerts**
   - Store certification type, number, issue date, expiry date per guard
   - Automated alerts at 90/60/30 days before expiry (email to supervisor/admin)
   - Block assigning expired-cert guards to sites that require that cert
   - Arrow context: India has PSARA licensing requirements; this is legally relevant

2. **Client Portal**
   - Per-client view: only their sites' guards, patrol logs, incidents, SLA metrics
   - Auto-generated DAR delivered by email at end of shift or daily
   - This directly drives contract renewals — clients who can self-verify are more loyal

3. **Shift Marketplace / Open Shift Self-Service**
   - Post open shifts; qualified guards claim them (first-come or manager-approved)
   - Shift swap requests between guards with supervisor approval
   - Reduces coordinator phone-tag overhead significantly

4. **Automated Client Billing / Invoicing**
   - Store bill rate per site/contract (separate from pay rate per guard)
   - Auto-generate invoices from verified shift hours
   - This is the clearest path from "operations tool" to "business system" for Arrow Security

5. **Post Orders Module**
   - Rich-text (or PDF-attached) instructions per site
   - Guard acknowledges before shift begins; acknowledgment counter shown to supervisors
   - Version-controlled (update post orders; guards must re-acknowledge new version)

6. **Lone Worker Protection**
   - Periodic check-in timer (guard must tap "I'm OK" every 15–30 min)
   - Missed check-in escalates to supervisor alert, then emergency contact
   - Panic button in app (one-tap, sends GPS + alert to all supervisors)
   - Arrow has the panic button as a noted stub — this is the right next step

7. **DAR Auto-Generation**
   - At shift end, compile: check-in time, patrol scans, incidents logged, check-out time
   - Deliver formatted PDF to client email and/or client portal
   - Eliminates manual daily report writing — guards and clients both love this

### Medium-Value / Plan for Later

8. **Profitability Dashboards**
   - Revenue (billed hours × bill rate) vs. cost (actual hours × pay rate) per site/client
   - Identify loss-making contracts before renewal negotiation

9. **Dispatch Module**
   - Supervisor can create ad-hoc task and assign to a specific guard in real time
   - Guard receives push notification with task details and accepts/declines
   - Useful for alarm response, visitor escort, suspicious activity follow-up

10. **AI-Assisted Scheduling (Call-off Autopilot)**
    - Detect when a guard marks sick or is absent at shift start
    - Auto-offer to qualified available guards based on cert match + overtime risk
    - Belfry is building this for 2026 — it is a genuine differentiator now

11. **Shift Attestation**
    - At clock-out, guard confirms breaks taken, confirms no incidents unreported
    - Creates compliance audit trail; reduces labor law exposure

---

## Open Source Alternatives

There are **no production-grade open-source security guard management platforms** comparable to TrackTik, Belfry, or Silvertrac. The open-source landscape in this niche is extremely thin:

| Project | Stack | What It Has | Reality Check |
|---|---|---|---|
| `lahssiki/SGMS-LARAVEL` | Laravel/PHP | Basic guard CRUD, morning/night shift scheduling, chart dashboard | 6 GitHub stars. No GPS, no mobile, no patrol, no incidents. Proof-of-concept only. |
| `CoderJay06/guard_reports` | Unknown | Daily activity reports and incident report writing | Minimal; no ops platform |
| `hugginssd/Monitoring-App` | Unknown | Guard tour and patrol monitoring | Very early stage |
| **Surveillance Center** (`1element/sc`) | Java/Spring | Self-hosted video surveillance (not guard management) | Adjacent domain only |
| **Trinity Guard Enterprise** | Proprietary | Full guard tour, GPS, incident, multi-site — self-hostable | $50,000 enterprise deployment cost; not open source |

**Conclusion:** If Arrow Security wanted to open-source its platform in the future, there is essentially no competition in the open-source niche. The only free option guards use today is TARGPatrol's free-for-life plan ($12/month paid tier) — which is SaaS, not self-hosted.

---

## Key Takeaways for Arrow Security Roadmap

### What Arrow has that matters
Arrow already has the hardest parts: a working multi-tenant architecture, live GPS SSE map, QR patrol scanning, shift scheduling, check-in geofencing, incident reporting, ESI/PF payroll math, and a clean Ionic mobile app. This is a solid foundation that took competitors years to build.

### The three gaps that block revenue
1. **No client portal** — Clients at Arrow's target market (mid-tier Indian security firms) expect to log in and verify patrol compliance themselves. Without it, the sales conversation defaults to "send us a report" which means manual PDFs.
2. **No invoicing** — Arrow tracks payroll (cost side) but not billing (revenue side). Adding client billing transforms Arrow from an ops tool into a business management system — dramatically expanding willingness to pay.
3. **No post orders** — Every field guard platform has this. It is table stakes. Absence is a visible gap in any sales demo.

### Priority sequencing recommendation
Based on competitor analysis and what drives ARR in this niche:

**Phase 1 (close the table-stakes gap):**
- Post Orders with guard acknowledgment
- Incident photo upload (complete MinIO integration)
- Passdowns at shift handover
- DAR auto-generation with email delivery

**Phase 2 (differentiate + enable billing):**
- Client Portal (read-only: their sites, patrols, incidents, DARs)
- Guard certification tracking + renewal alerts (PSARA compliance angle)
- Client billing module (bill rates per site → auto-invoice from verified shifts)
- Panic button + lone worker check-in timer

**Phase 3 (retention + margin):**
- Shift Marketplace (open shifts + swap requests)
- Profitability dashboards (revenue vs. cost per site)
- Dispatch module (ad-hoc task assignment to guards)
- AI call-off detection + auto-offer to available guards

### Pricing model observations
- Most platforms charge $5–15/user/month for guard-tier seats
- Belfry and TrackTik charge higher for the full back-office (payroll + billing) modules
- Small ops (10–30 guards): $200–400/month total is the sweet spot
- Mid-market (50–200 guards): $500–1,500/month is acceptable if billing and client portal are included
- Setup fees and annual contracts are common at Silvertrac-tier; monthly SaaS is increasingly preferred by smaller companies
- The client portal is often used as an upsell module by TrackTik — Arrow could follow the same model

### India-specific note
Shivaizer's PSARA compliance features (licence validity tracking, audit-ready documentation, Tally/Zoho payroll exports) are a direct Arrow Security opportunity. Arrow already has ESI/PF payroll math in paise. Adding PSARA licence tracking and producing one-click compliance reports for audits would be a genuine local-market differentiator that no Western platform offers properly.
