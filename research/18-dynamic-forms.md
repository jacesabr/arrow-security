# Investigation 18 — Dynamic Form Builders for Configurable Incident Reports

**Date:** 2026-05-17
**Verdict up front:** AUGMENT — SurveyJS (runtime library only, MIT) is the clear winner for our stack. Use it with JSONB storage in PostgreSQL and a thin API layer for template and response management.

---

## Summary

Incident report forms are not one-size-fits-all. A hospital client needs fields for victim triage, ambulance call status, and staff witness names. A construction site needs hazard zone codes and PPE compliance flags. Hard-coding forms means every new Arrow Security client requires a developer for form customisation. Dynamic form builders solve this by storing form *schemas* as JSON and rendering them at runtime.

Four serious options exist: **SurveyJS**, **Form.io**, **react-jsonschema-form (RJSF)**, and **Formily**. After evaluating each against our stack (Fastify 4 + PostgreSQL/Drizzle + Next.js 16 + Ionic/Capacitor), SurveyJS wins on the combination of non-developer-friendly visual builder, first-class React support, mobile rendering quality, conditional logic, and a standalone PDF generator. The key licensing constraint is the Survey Creator (drag-and-drop builder UI): only the *rendering runtime* is MIT — the builder UI is commercial (more detail in the license section).

RJSF is the fallback if commercial licensing for the builder is unacceptable: it is 100% MIT, developer-configurable, and integrates cleanly with JSON Schema — but it has no visual drag-and-drop builder, making it unsuitable for non-developer admins.

---

## Stack & Dependencies

### Candidate Comparison

| Criterion | SurveyJS | Form.io | RJSF | Formily |
|---|---|---|---|---|
| **License (runtime)** | MIT | MIT | MIT | MIT |
| **License (builder UI)** | Commercial (see below) | MIT (builder) / paid hosting | MIT | MIT |
| **Visual drag-and-drop builder** | Yes — Survey Creator | Yes — Form.io Builder | No | Yes — Designable (separate pkg) |
| **React support** | First-class (`survey-react-ui`) | React wrapper exists (`@formio/react`) | First-class | First-class |
| **Ionic/Capacitor webview** | Renders well; uses standard HTML inputs + custom CSS | Works; heavier DOM | Works; plain HTML | Works; heavier framework overhead |
| **Conditional logic** | Built-in expression engine (`visibleIf`, `enableIf`, `requiredIf`) | Built-in JSON logic | No built-in; must implement with `uiSchema` custom widgets | Built-in; powerful but verbose |
| **Validation** | Built-in (required, regex, min/max, custom JS functions) | Built-in | JSON Schema native validation | Built-in |
| **File/photo upload** | Yes — `file` question type; multiple files, base64 or URL | Yes | Yes via custom widget | Yes |
| **Signature pad** | Yes — `signaturepad` question type (built-in) | Yes via custom component | Yes via custom widget | Yes via custom component |
| **GPS auto-attach** | Not built-in; `expression` question can pre-fill read-only value | Not built-in | Not built-in | Not built-in |
| **Offline support** | None in library; must implement separately | None in library | None | None |
| **PDF export** | Yes — `survey-pdf` package (MIT) | Partial — paid enterprise | None | None |
| **Bundle size (runtime only)** | ~180 KB gzip | ~250 KB gzip | ~45 KB gzip | ~120 KB gzip |
| **Stars (GitHub, approx.)** | 4.2k | 2.9k | 3.8k | 11.6k |
| **Active maintenance** | Yes | Yes (slower) | Yes | Yes |

### SurveyJS License Deep-Dive

This is the most important licensing detail for our build decision.

**Survey Library (`survey-core`, `survey-react-ui`):**
- License: **MIT**
- Covers: rendering forms, collecting responses, validation, conditional logic, expression evaluation
- Free for any use, including commercial SaaS
- npm packages: `survey-core`, `survey-react-ui`, `survey-pdf`

**Survey Creator (`survey-creator-core`, `survey-creator-react`):**
- License: **Commercial** — requires a paid licence for production use
- Pricing (as of 2026): Individual developer licence ~$499/developer/year; Team/Enterprise pricing is quote-based
- Free for open-source projects (GPL-compatible) and for 30-day trial
- The builder UI that non-developer admins would use to drag-and-drop fields lives entirely in this package
- The underlying JSON schema it produces is plain SurveyJS JSON — you own your data regardless of licence

**survey-pdf:**
- License: **MIT**
- Generates PDF from a SurveyJS model + response data
- Works without any Creator licence

**Practical implication:** If Arrow Security uses Survey Creator in the Operations Portal to let tenant admins configure form templates, a Creator licence is required. If form templates are authored by Jace/developers and only rendered for guards, MIT runtime alone is sufficient. The recommended path is to licence Survey Creator for the Operations Portal admin flow. Cost is small relative to eliminating developer involvement for each new client.

---

## Data Model

Store form templates and responses as JSONB columns in PostgreSQL. This fits naturally into the existing Drizzle schema pattern.

### New Tables

```sql
-- Form template: one per incident type variant per client
CREATE TABLE incident_form_templates (
  id             TEXT PRIMARY KEY,                -- createId()
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  client_id      TEXT REFERENCES clients(id),     -- NULL = applies to all clients
  name           TEXT NOT NULL,                   -- "Hospital Incident Report"
  description    TEXT,
  schema         JSONB NOT NULL,                  -- SurveyJS JSON definition
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ift_tenant ON incident_form_templates(tenant_id);
CREATE INDEX idx_ift_client ON incident_form_templates(client_id);

-- Form response: replaces (or extends) the existing incidents table
-- Option A: add a column to incidents
ALTER TABLE incidents ADD COLUMN form_template_id TEXT REFERENCES incident_form_templates(id);
ALTER TABLE incidents ADD COLUMN form_response    JSONB;

-- Option B (cleaner, avoids altering incidents): separate table
CREATE TABLE incident_form_responses (
  id              TEXT PRIMARY KEY,
  incident_id     TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  template_id     TEXT NOT NULL REFERENCES incident_form_templates(id),
  response_data   JSONB NOT NULL,               -- SurveyJS result object
  gps_latitude    DOUBLE PRECISION,             -- captured at submission time
  gps_longitude   DOUBLE PRECISION,
  gps_accuracy    REAL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by    TEXT NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_ifr_incident ON incident_form_responses(incident_id);
```

**Why Option B:** Keeps the core `incidents` table unchanged (backward compatible). A response is linked to an incident, so existing incident list/filter logic still works. The JSONB blob lives separately and can be queried with PostgreSQL jsonb operators (`->`, `->>`,-#>`, `@>`) for reporting.

### Querying JSONB Responses

```sql
-- Find all incidents where stolen_items is non-null
SELECT i.id, i.created_at, r.response_data->>'stolen_items' AS stolen_items
FROM incidents i
JOIN incident_form_responses r ON r.incident_id = i.id
WHERE r.response_data ? 'stolen_items';

-- Aggregate incident types from dynamic form data
SELECT r.response_data->>'incident_type' AS type, COUNT(*) 
FROM incident_form_responses r
GROUP BY 1;
```

---

## API / Interface Surface

### New Fastify Routes

```
GET    /api/form-templates              list templates (filtered by tenantId, optionally clientId)
POST   /api/form-templates              create template (save SurveyJS JSON from Creator)
GET    /api/form-templates/:id          fetch template for rendering
PATCH  /api/form-templates/:id          update template schema
DELETE /api/form-templates/:id          soft-delete (set is_active = false)

POST   /api/incidents/:id/form-response submit a completed form response
GET    /api/incidents/:id/form-response retrieve response (for detail view / PDF generation)
POST   /api/incidents/:id/form-response/pdf  generate and return PDF (server-side with survey-pdf)
```

All routes require `requireAuth`. Template creation requires `requireSupervisor` at minimum. Response submission is guard-level.

### Client-side Flow (Guard App)

1. Guard opens "New Incident" → app calls `GET /api/form-templates?clientId=<site.clientId>`
2. If a template exists for this client, use it; else fall back to the default template
3. Render with `<Survey model={surveyModel} />` from `survey-react-ui`
4. On complete, attach GPS coordinates to the response data before `POST /api/incidents/:id/form-response`

### Client-side Flow (Operations Portal)

1. Admin navigates to `/settings/form-templates`
2. Survey Creator editor renders the template drag-and-drop UI
3. On save, POST the schema JSON to `/api/form-templates`

---

## Algorithms / Techniques Worth Borrowing

### 1. SurveyJS Expression Engine for Conditional Logic

SurveyJS uses a declarative expression language in the JSON schema itself:

```json
{
  "visibleIf": "{incident_type} = 'theft'",
  "name": "stolen_items"
}
```

Expressions support: `=`, `!=`, `>`, `<`, `contains`, `anyof`, `allof`, `and`, `or`, and nested parentheses. This eliminates the need for any server-side conditional logic — the JSON schema fully describes the form behaviour.

**Borrowing for our validation layer:** These same expression strings can be re-evaluated server-side using `survey-core` in Node.js to validate that required conditional fields are present in a submitted response, preventing guards from submitting incomplete forms if client-side JS was bypassed.

```typescript
import { Model } from 'survey-core'

function validateResponse(schema: object, responseData: object): string[] {
  const survey = new Model(schema)
  survey.data = responseData
  const errors: string[] = []
  survey.pages.forEach(page =>
    page.questions.forEach(q => {
      if (q.isVisible && q.isRequired && (q.isEmpty() || !q.validate(true))) {
        errors.push(`${q.name}: ${q.validatedValue ?? 'required'}`)
      }
    })
  )
  return errors
}
```

### 2. GPS Auto-Attach via Expression Pre-Fill

SurveyJS `expression` question type evaluates a formula and stores the result as read-only. We cannot directly call the Capacitor Geolocation API from an expression, but we can inject the GPS value *before* creating the survey model:

```typescript
import { Geolocation } from '@capacitor/geolocation'

const { coords } = await Geolocation.getCurrentPosition()
const survey = new Model(schema)
survey.setValue('gps_location', `${coords.latitude},${coords.longitude}`)
survey.getQuestionByName('gps_location')!.readOnly = true
```

Alternatively, include GPS as a hidden question with `startWithNewLine: false` and pre-fill it in the component before mounting.

### 3. Offline Submission Queue

SurveyJS has no offline support, but the response is a plain JS object (`survey.data`). Our existing offline pattern from Investigation 11 (OPFS / `@capacitor/filesystem` queue) applies directly:

```typescript
// On submit while offline:
const pending = JSON.parse(localStorage.getItem('pending_incident_responses') || '[]')
pending.push({ incidentId, templateId, responseData: survey.data, gps, timestamp: Date.now() })
localStorage.setItem('pending_incident_responses', JSON.stringify(pending))

// On network restore, flush queue to POST /api/incidents/:id/form-response
```

For heavier requirements, pair with SQLite via `@capacitor-community/sqlite` as discussed in Investigation 11.

### 4. PDF Generation with survey-pdf (Server-side)

`survey-pdf` runs in both browser and Node.js. Running it server-side (in the Fastify API) is cleaner than client-side — it avoids shipping the PDF library to every mobile client and produces consistent output regardless of device.

```typescript
// apps/api/src/routes/form-responses.ts
import { SurveyPDF } from 'survey-pdf'
import { Model } from 'survey-core'

async function generatePdf(schema: object, responseData: object): Promise<Buffer> {
  const surveyPdf = new SurveyPDF(schema, {
    fontSize: 12,
    margins: { left: 10, right: 10, top: 10, bot: 10 },
    format: 'A4',
    orientation: 'portrait'
  })
  surveyPdf.data = responseData
  const raw = await surveyPdf.raw('dataurlstring')  // base64 data URL
  const base64 = raw.replace(/^data:application\/pdf;base64,/, '')
  return Buffer.from(base64, 'base64')
}
```

The Fastify handler replies with `Content-Type: application/pdf` and streams the buffer. The Operations Portal can open this URL in a new tab for print/download.

**Quality assessment:** `survey-pdf` produces clean, structured PDFs for standard question types (text, dropdown, checkbox, rating). Signature pad renders as an embedded image. File uploads show a thumbnail or filename. Complex matrix questions render as a table. The output is functional but not design-award-winning — adequate for client audit reports, not marketing documents.

---

## What's Missing for Our Security App

| Gap | Severity | Mitigation |
|---|---|---|
| **No GPS auto-attach** | Medium | Inject `survey.setValue('gps_location', ...)` before mount (see Algorithms section) |
| **No offline queue in SurveyJS** | High | Implement queue in `localStorage` / SQLite; flush on network restore |
| **Survey Creator requires commercial licence** | Medium | Budget ~$499/developer/year. Alternatively, ship a code-configured default template and add Creator later |
| **No native file upload in Capacitor webview** | Medium | Use Capacitor's `@capacitor/camera` plugin to capture photo → base64, inject into survey data manually instead of relying on the file question type's browser file picker |
| **survey-pdf lacks pixel-perfect styling** | Low | Sufficient for compliance/audit reports; use a design tool for client-facing marketing reports |
| **No real-time collaboration on template editing** | Low | Not needed; one admin per tenant configures templates |
| **No field-level access control within a form** | Low | Not needed at phase 1; all guards on a site see the same form |
| **No version history on form schemas** | Medium | Store old schemas in a `incident_form_template_versions` table (copy on each PATCH) |

---

## Verdict

**AUGMENT.** Dynamic form templating is new capability that does not exist anywhere in the current codebase. The implementation touches three areas:

1. **Database:** Two new tables (`incident_form_templates`, `incident_form_responses`) — additive, no changes to existing `incidents` table structure
2. **API:** Six new routes — follows existing Fastify plugin pattern
3. **Frontend:** Survey Creator in Operations Portal (requires Creator licence); `survey-react-ui` renderer in Guard App (MIT)

The effort is self-contained. The SurveyJS JSON schema is a plain JS object storable as JSONB with no migration risk. Existing incidents without a form response continue to work.

**Recommendation order:**
1. Phase 1 (now): Ship a single hard-coded SurveyJS JSON template (the general security incident form) rendered via `survey-react-ui`. No Creator, no licence cost.
2. Phase 2 (post-launch): Add Survey Creator to Operations Portal under a paid licence. Expose per-client template management.
3. Phase 3: Add server-side PDF generation endpoint. Surface "Export Report as PDF" in incident detail view.

---

## Concrete Extracts

### SurveyJS JSON Schema — Security Incident Form

```json
{
  "title": "Security Incident Report",
  "logoPosition": "right",
  "pages": [
    {
      "name": "incident_details",
      "title": "Incident Details",
      "elements": [
        {
          "type": "dropdown",
          "name": "incident_type",
          "title": "Incident Type",
          "isRequired": true,
          "choices": [
            { "value": "theft",      "text": "Theft" },
            { "value": "trespass",   "text": "Trespass / Unauthorised Entry" },
            { "value": "medical",    "text": "Medical Emergency" },
            { "value": "vandalism",  "text": "Vandalism / Property Damage" },
            { "value": "other",      "text": "Other" }
          ]
        },
        {
          "type": "text",
          "name": "stolen_items",
          "title": "Description of Stolen Items",
          "isRequired": true,
          "visibleIf": "{incident_type} = 'theft'",
          "placeholder": "List items taken"
        },
        {
          "type": "text",
          "name": "estimated_value",
          "title": "Estimated Value (₹)",
          "inputType": "number",
          "min": 0,
          "visibleIf": "{incident_type} = 'theft'",
          "placeholder": "0"
        },
        {
          "type": "text",
          "name": "victim_name",
          "title": "Victim / Patient Name",
          "isRequired": true,
          "visibleIf": "{incident_type} = 'medical'",
          "placeholder": "Full name"
        },
        {
          "type": "boolean",
          "name": "ambulance_called",
          "title": "Was an ambulance called?",
          "visibleIf": "{incident_type} = 'medical'",
          "renderAs": "checkbox"
        },
        {
          "type": "text",
          "name": "other_description",
          "title": "Describe the Incident",
          "isRequired": true,
          "visibleIf": "{incident_type} = 'other'",
          "placeholder": "Provide details"
        }
      ]
    },
    {
      "name": "evidence",
      "title": "Evidence & Location",
      "elements": [
        {
          "type": "file",
          "name": "photo_evidence",
          "title": "Photo Evidence",
          "acceptedTypes": "image/*",
          "allowMultiple": true,
          "maxSize": 10485760,
          "storeDataAsText": false,
          "description": "Upload photos from the scene"
        },
        {
          "type": "text",
          "name": "gps_location",
          "title": "GPS Coordinates",
          "readOnly": true,
          "defaultValueExpression": "",
          "description": "Auto-populated on submission"
        }
      ]
    },
    {
      "name": "sign_off",
      "title": "Sign Off",
      "elements": [
        {
          "type": "signaturepad",
          "name": "witness_signature",
          "title": "Witness Signature",
          "signatureWidth": 400,
          "signatureHeight": 150,
          "description": "Witness signs here"
        }
      ]
    }
  ],
  "showProgressBar": "top",
  "progressBarType": "pages",
  "showQuestionNumbers": "off",
  "completedHtml": "<h4>Report submitted. Stay on scene until supervisor confirms.</h4>"
}
```

### react-jsonschema-form (RJSF) — Same Form in JSON Schema

RJSF separates the data schema (what fields and their types) from the UI schema (how to render them). Conditional logic requires the `additionalProperties` + `if/then/else` pattern from JSON Schema Draft 7.

**JSON Schema (`schema`):**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Security Incident Report",
  "type": "object",
  "required": ["incident_type"],
  "properties": {
    "incident_type": {
      "type": "string",
      "title": "Incident Type",
      "enum": ["theft", "trespass", "medical", "vandalism", "other"],
      "enumNames": ["Theft", "Trespass / Unauthorised Entry", "Medical Emergency", "Vandalism / Property Damage", "Other"]
    },
    "stolen_items": {
      "type": "string",
      "title": "Description of Stolen Items"
    },
    "estimated_value": {
      "type": "number",
      "title": "Estimated Value (₹)",
      "minimum": 0
    },
    "victim_name": {
      "type": "string",
      "title": "Victim / Patient Name"
    },
    "ambulance_called": {
      "type": "boolean",
      "title": "Was an ambulance called?"
    },
    "other_description": {
      "type": "string",
      "title": "Describe the Incident"
    },
    "photo_evidence": {
      "type": "array",
      "title": "Photo Evidence",
      "items": {
        "type": "string",
        "format": "data-url"
      }
    },
    "gps_location": {
      "type": "string",
      "title": "GPS Coordinates",
      "readOnly": true
    },
    "witness_signature": {
      "type": "string",
      "title": "Witness Signature",
      "format": "data-url"
    }
  },
  "if": { "properties": { "incident_type": { "const": "theft" } } },
  "then": { "required": ["stolen_items"] },
  "else": {
    "if": { "properties": { "incident_type": { "const": "medical" } } },
    "then": { "required": ["victim_name"] },
    "else": {
      "if": { "properties": { "incident_type": { "const": "other" } } },
      "then": { "required": ["other_description"] }
    }
  }
}
```

**UI Schema (`uiSchema`):**

```json
{
  "incident_type": {
    "ui:widget": "select"
  },
  "stolen_items": {
    "ui:widget": "textarea",
    "ui:options": { "rows": 3 }
  },
  "other_description": {
    "ui:widget": "textarea",
    "ui:options": { "rows": 4 }
  },
  "ambulance_called": {
    "ui:widget": "checkbox"
  },
  "photo_evidence": {
    "ui:options": { "accept": "image/*" }
  },
  "gps_location": {
    "ui:readonly": true,
    "ui:help": "Auto-populated on submission"
  },
  "witness_signature": {
    "ui:widget": "file",
    "ui:help": "Custom signature pad widget required — RJSF has no built-in signaturepad widget"
  }
}
```

**Critical RJSF limitation visible above:** The `if/then/else` conditional approach in JSON Schema is schema-valid but RJSF does not *hide* fields that fail the `if` condition — it only marks them required or not-required. To get true show/hide conditional behaviour, a custom `ObjectFieldTemplate` or the third-party `@rjsf-team/rjsf-conditionals` package is required. This is the primary reason SurveyJS is preferred: conditional show/hide is declarative and built-in.

**Signature pad with RJSF:** RJSF has no built-in signature widget. You must integrate `react-signature-canvas` as a custom widget and register it. SurveyJS has this built-in.

---

## Open Questions for Synthesis

1. **Creator licence timing:** Should Survey Creator be licensed from day one (enabling admin-configurable templates at launch) or deferred to phase 2 after proving the default template is sufficient? Cost is low; capability is high. Recommend day one if budget allows.

2. **Photo upload path:** SurveyJS file questions can store images as base64 in the JSONB response blob, which works but bloats the DB. The better path is to upload photos to MinIO (already running) and store only URLs in the response. Does MinIO integration happen before or alongside dynamic forms? The upload endpoint stubs should be built first.

3. **Server-side validation:** Should the API re-run SurveyJS expression validation server-side (using `survey-core` in Node.js) on each form response POST, or trust the mobile client? Guard apps on poor networks may bypass client-side validation on retry. Recommendation: validate server-side for `isRequired` on visible fields at minimum.

4. **Template versioning:** When a template is updated mid-month, existing incidents should retain their original schema (for audit integrity). The `incident_form_responses.template_id` reference handles this — but only if old templates are never deleted. Should we store a snapshot of the schema in the response record itself, or rely on the template never being hard-deleted (only deactivated)?

5. **Drizzle type safety:** JSONB columns return `unknown` from Drizzle by default. Should we define typed Zod schemas for the SurveyJS JSON structure and parse at the API boundary? This would give type safety on template read/write without losing the flexibility of arbitrary user-defined schemas.

6. **Multi-language / RTL:** Arrow Security currently operates in English, but expansion to Arabic-speaking markets (Gulf security sector) would require RTL form rendering. SurveyJS has `rtl: true` and locale support built in. Worth designing the template schema to include a `locale` field now.

7. **Analytics on dynamic fields:** If incident type distribution, response patterns, or custom field values need to be surfaced in dashboard stats, PostgreSQL jsonb operators are sufficient at small scale. At scale (thousands of incidents/month), a materialised view or a lightweight analytics store (TimescaleDB or ClickHouse) may be needed. Out of scope for now but flag for the data model.
