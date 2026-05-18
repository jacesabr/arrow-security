# Security Domain OSS — Gap Analysis

> Researched: 2026-05-17. Scope: open-source tools relevant to a Fastify 4 + Next.js + Ionic/Capacitor security guard operations platform (Arrow Security).

---

## Guard Tour Systems

### What exists

**hugginssd/Monitoring-App** (GitHub)
A guard patrol monitoring app built around cloud + smartphone technology. Covers guard tours, patrols, and checkpoint reporting. No meaningful GitHub activity or community — effectively a personal project, not a maintained product.

**Resgrid Core** (github.com/Resgrid/Core)
The most feature-complete OSS option in this space. It is a Computer Aided Dispatch (CAD), Personnel, Shift Management, and Automatic Vehicle Location (AVL) platform that directly powers resgrid.com. Actively maintained, Docker-based deployment, REST API, mobile apps. License: **Apache 2.0**.
- Covers: incident dispatch, shift management, AVL/GPS tracking, personnel management.
- Does NOT focus on commercial guard-tour patrol-route scanning (QR/NFC checkpoint flow is absent).
- Stack: .NET 8 + SQL Server/PostgreSQL — a completely foreign stack to this project.

**Commercial-only products**: GuardsPro, TrackTik, QR-Patrol, SecurityPatrolTrack, PatrolTech, and GuardPatrolling are all SaaS-only. None are open source. QR-Patrol specifically built its entire business on the QR+NFC+Beacon checkpoint model; there is no OSS equivalent.

### Verdict

No viable OSS guard tour system exists that matches the checkpoint-scanning + patrol-route + real-time supervisor view model we are building. Resgrid is the closest OSS project to the overall platform concept, but it targets first-responder/emergency management (fire, EMS, SAR teams) rather than commercial security, and its .NET stack cannot be integrated — only referenced for design inspiration. **Build this ourselves.** We are ahead of anything in the OSS space for this specific domain.

---

## Incident Management

### What exists

**TheHive** (github.com/TheHive-Project/TheHive) — License: AGPL-3.0 (older versions); now commercially licensed via StrangeBee for TheHive 5+. Designed for cybersecurity SOC/CSIRT teams. Tracks cases, tasks, observables (IoCs). Rich alert intake, MISP integration, Cortex automation. Not designed for physical security incidents (no GPS, no severity SLA timers tied to guard shifts, no client-site scoping).

**DFIR-IRIS** (github.com/dfir-iris/iris-web) — License: LGPL-3.0. Collaborative web-based platform for incident response investigations. Again, cyber-focused: digital forensics artifacts, timeline reconstruction, case notes. Irrelevant for physical guard incident reporting.

**Kanvas** — Python desktop app (2025). Lightweight IR case management. Too niche and not web-based.

**Resgrid Dispatch** (github.com/Resgrid/Dispatch) — Closer to physical ops; covers calls/incidents and unit dispatch. Apache 2.0. But .NET stack, first-responder UX model, not guard-company UX.

**OneUptime / FusionReactor / Alertmanager** — IT observability incident management. Not applicable.

### Verdict

No OSS incident management system targets **physical security guard incidents** with features like: severity + SLA deadlines, site-scoped reporting, guard-assigned photo evidence, client notification, and shift-contextual reporting. All OSS options are cyber/IT-focused. **Build this ourselves** — the schema and API we already have are more purpose-fit than anything in OSS.

---

## GPS / Location Tracking

### What exists

**Traccar** (github.com/traccar/traccar) — License: **Apache 2.0**. The dominant OSS GPS tracking server. Supports 2,000+ hardware GPS device protocols AND a smartphone client app (Android + iOS). Full REST API + WebSocket live updates. Java backend, supports PostgreSQL. Actively maintained with a large community, commercial hosting available.
- Traccar Client app turns a smartphone into a GPS tracker using the same protocol as hardware devices — directly applicable to guards carrying phones.
- REST API allows pulling position data, pushing geofences, syncing users.
- WebSocket endpoint provides the same live-update model we already implemented via SSE.

**OpenGTS** (opengts.sourceforge.net) — License: Apache 2.0. Older Java-based fleet tracking. Designed for vehicle fleets, not foot patrols. Last meaningful update circa 2018 — effectively abandoned.

**Speedotrack / GPSWOX** — These are commercial SaaS wrappers around OSS cores, not themselves OSS.

### Integration potential for Arrow Security

Traccar could serve as a drop-in GPS backend if we ever need to support hardware trackers (body cameras, vehicle units, lone-worker panic devices). The REST API maps naturally: `POST /api/positions` in Traccar mirrors our `POST /api/locations`. We could run Traccar as a sidecar and forward hardware-device pings into our own `guard_locations` table via a thin bridge. This avoids building our own hardware protocol parsing.

**Verdict**: Traccar is a genuine, high-quality OSS tool worth tracking. We do not need it now (guards use phones, which our own endpoint handles), but it is the right integration point if hardware GPS devices or vehicle tracking becomes a requirement.

---

## Checkpoint Scanning (QR / NFC)

### What exists

No dedicated OSS checkpoint-scanning library for security patrols was found. The market is entirely commercial:
- QR-Patrol (proprietary SaaS) — the market leader, supports QR, NFC, Beacons, and virtual GPS checkpoints.
- SecurityPatrolTrack, PatrolTech, GuardPatrolling — all proprietary SaaS.
- CodeREADr — commercial barcode/QR scanning platform with security patrol use-case documentation.

**Related OSS components** that can be composed:
- `@zxing/library` / `html5-qrcode` — browser-based QR decoding (JavaScript, Apache 2.0). Mature, widely used.
- `capacitor-community/barcode-scanner` — Ionic/Capacitor plugin for native QR scanning (MIT). This is what Ionic apps typically use.
- Web NFC API — W3C draft standard, Chrome-only on Android. No OSS "server-side NFC" library needed; it is a browser API.
- `node-nfc-nci` / `nfc-pcsc` — Node.js libraries for desktop NFC readers. Not applicable to mobile guards.

### Verdict

The scanning layer is a hardware-capability problem, not an OSS library problem. We use `capacitor-community/barcode-scanner` (or the Capacitor `@capacitor-mlkit/barcode-scanning` plugin) for QR, and the Web NFC API for NFC — both are free/open standards. The checkpoint-scan *workflow* (patrol session, scan logging, out-of-order detection, missed-checkpoint alerting) is custom business logic. **Build this ourselves** — and we already have the schema. No OSS tool covers the end-to-end flow.

---

## Visitor Management / Access Control

### What exists

**T.C.E.D.I. Open Visitors Management System** — A web-based VMS with RGPD compliance, gate pass management, photo capture. Self-hosted. License unclear from search results; appears to be open source.

**Various Django/React GitHub projects** (github.com/topics/visitor-management) — Several small projects with recent updates through 2025, but none dominant or widely adopted.

**VISTA (HelixBeat)** — Described as an open-source alternative; appears to be a commercial product with an open-core or freemium model.

**OpenACS** — A legacy toolkit (Tcl/ADP) from the early 2000s. Irrelevant to modern stacks.

**Grommunio / NetBox / Snipe-IT** — Asset/network management, not visitor management.

### Relevance to Arrow Security

Arrow Security does not currently have a visitor management requirement in the build plan. The closer adjacent feature is **client access**: client_viewer role users who log in to view incident reports or patrol logs for their site. This is covered by the existing JWT+role system, not by a VMS.

If Arrow Security ever guards sites that need a digital visitor logbook at the reception desk (a common guard duty), a lightweight VMS would be a useful addition. None of the OSS options are mature enough to embed — they would require significant adaptation.

**Verdict**: Visitor management is not in scope. If it becomes required, evaluate T.C.E.D.I. or build a simple custom logbook. No OSS integration warranted now.

---

## Client Billing / Security Company Invoicing

### What exists

**Crater** (github.com/crater-invoice-inc/crater) — License: **AGPL-3.0**. Laravel 10 + Vue 3 + React Native mobile app. Invoices, estimates, expenses, payments (Stripe, PayPal), taxes, multi-currency. ~4,700 GitHub stars. Actively maintained as of 2025. The AGPL license means you must open-source any modified version you host as a service — relevant if Arrow Security ever offers the billing module as a multi-tenant SaaS feature; for internal use it is fine.
- No built-in concept of guard hours → invoice line items. Would need custom integration.

**SolidInvoice** (github.com/SolidInvoice/SolidInvoice) — License: **MIT**. Symfony 7.1 + PHP 8.4 + API Platform 4. Simple, elegant, REST API first. Clients, contacts, quotes, invoices, recurring billing, payment gateways. MIT license means unrestricted use and modification.
- More API-friendly than Crater. The REST API could be called from our Fastify API to create invoices programmatically when a pay period is finalized.
- No shift-hours awareness; Arrow would push line items via API.

**Lago** (github.com/getlago/lago) — License: **AGPL-3.0**. Ruby on Rails + PostgreSQL. Usage-based and subscription billing infrastructure. Metering engine, event ingestion, invoice generation. 7,000+ GitHub stars, well-funded, very active.
- Designed for SaaS metering (events → charges). Adaptable: each guard-hour worked could be an event; Lago would aggregate and bill the client.
- Overkill for simple monthly flat-rate contracts but powerful for time-and-material billing.

**InvoiceNinja** — License: Elastic (v5 AGPL). Feature-rich but heavy. Not ideal.

**Meteroid** (github.com/meteroid-oss/meteroid) — License: **AGPL-3.0**. Rust + gRPC. Very new (2024). Subscription + usage billing. Too immature.

### Relevance to Arrow Security

The current `payroll_periods` and `payroll_records` schema covers **internal payroll** (what Arrow pays its guards). **Client billing** — what Arrow invoices its clients for guard services rendered — is not yet built. The two are related but separate:

1. Payroll: guard hours × rate → paise → ESI/PF deductions (already in schema)
2. Client invoice: guard hours at client site × client contract rate → INR → GST → PDF invoice to client

SolidInvoice is the strongest candidate for a client-billing integration: MIT license, REST API, Symfony-based with a clean data model. Arrow's Fastify API could call SolidInvoice's REST API to create a client invoice when a pay period is finalized, passing guard-hours-by-site as line items.

**Verdict**: SolidInvoice (MIT, REST API, actively maintained) is worth integrating for client invoicing rather than building a PDF invoice engine and payment-tracking UI from scratch.

---

## Summary: What OSS Exists, What Gaps Remain

| Domain | OSS Exists? | Best Option | Maintained? | License | Build vs Integrate |
|---|---|---|---|---|---|
| Guard Tour / Patrol | Partial | Resgrid (wrong stack) | Yes | Apache 2.0 | Build — no viable option |
| Incident Management | No (physical sec) | None | N/A | N/A | Build — all OSS is cyber-focused |
| GPS / Location Tracking | Yes | Traccar | Yes, active | Apache 2.0 | Integrate if hardware GPS needed |
| QR/NFC Checkpoint Scanning | Components only | browser APIs + Capacitor plugins | Yes | MIT / W3C | Build workflow, use OSS libs |
| Visitor Management | Marginal | T.C.E.D.I. | Unclear | Unclear | Not in scope |
| Client Billing / Invoicing | Yes | SolidInvoice | Yes, active | MIT | Integrate for invoice generation |

### Core finding

The **physical security guard operations domain is a commercial software moat** — no well-maintained, full-featured OSS platform covers it. The closest OSS project (Resgrid) targets first responders (fire/EMS/SAR), uses .NET, and cannot be meaningfully integrated into the Arrow stack. This is actually favorable for Arrow Security: there is no dominant OSS incumbent to compete with, and the platform we are building is more purpose-fit than anything in the open-source ecosystem.

The two exceptions are commodity infrastructure: GPS server (Traccar) for hardware device support, and invoice generation (SolidInvoice) for client billing.

---

## Top 3 OSS Tools Worth Integrating into Arrow Security

### 1. Traccar — GPS Tracking Server
**Repo**: github.com/traccar/traccar | **License**: Apache 2.0 | **Stars**: ~6,000 | **Status**: Actively maintained

**What it adds**: Hardware GPS device support. If Arrow Security ever issues body-worn GPS trackers, vehicle GPS units, or lone-worker panic devices to guards, Traccar speaks 2,000+ hardware protocols and bridges them to a REST/WebSocket API. We could run Traccar as a Docker sidecar and forward positions into our `guard_locations` table via a lightweight bridge worker. This avoids building any hardware protocol parsing ourselves.

**Integration effort**: Medium. Run `traccar/traccar` container, configure `traccar.xml` with our DB, write a small Node.js event listener on Traccar's WebSocket that upserts into `guard_locations`. No modification of Traccar source needed.

**When to integrate**: Phase when hardware GPS or vehicle tracking is introduced. Not needed now (guards use phones with our existing `POST /api/locations` endpoint).

---

### 2. SolidInvoice — Client Billing
**Repo**: github.com/SolidInvoice/SolidInvoice | **License**: MIT | **Stars**: ~3,000 | **Status**: Actively maintained (Symfony 7.1, PHP 8.4)

**What it adds**: Professional client invoice generation, quote management, payment tracking, and PDF output — without building any of this from scratch. Arrow Security bills its clients monthly for guard services. SolidInvoice exposes a full REST API (`/api/invoices`, `/api/clients`, `/api/payments`). When a payroll period is finalized, our Fastify API calls SolidInvoice to create a client invoice with guard-hours-by-site as line items. SolidInvoice handles the PDF, payment status, and reminder emails.

**Integration effort**: Low to medium. Run SolidInvoice in Docker, expose its API internally. Add an `api.ts` method in Fastify that calls `POST /api/invoices` on payroll finalization. Map `clients` table → SolidInvoice clients, sites → invoice line items, hours × contract rate → amounts. No SolidInvoice source modification needed; MIT license allows use without restriction.

**When to integrate**: When the client billing module is prioritized in the build plan (after payroll is stable). This directly extends the existing payroll schema.

---

### 3. Frigate NVR — Camera / AI Object Detection
**Repo**: github.com/blakeblackshear/frigate | **License**: MIT | **Stars**: ~22,000 | **Status**: Very actively maintained (v0.17 released 2025)

**What it adds**: Turns IP cameras into an AI-analyzed NVR with local object detection (person, vehicle, etc.), motion events, RTSP re-streaming, and a REST/WebSocket API. Arrow Security already has a `cameras` table stub in the schema described as a "Frigate integration stub." Frigate is the natural completion of that stub. Guards and supervisors on the Operations Portal `/map` page could see camera event alerts (person detected in zone after hours) alongside live guard positions, without paying Milestone, Genetec, or Avigilon licensing fees.

**Integration effort**: Medium. Run `ghcr.io/blakeblackshear/frigate` container with camera RTSP URLs. Expose Frigate's REST API (`/api/events`, `/api/cameras`) through our Fastify proxy layer. Add camera event ingestion to the SSE fan-out so the Operations Portal `/map` page receives camera alerts in the same stream as guard location pings. Populate the `cameras` table with Frigate camera IDs.

**When to integrate**: When client sites have IP cameras and the camera monitoring feature is scoped. The CLAUDE.md already calls this a stub — Frigate is the implementation.
