/**
 * Arrow Security — User Guide
 *
 * Single source of truth for the in-app onboarding guide.
 * Imported by both apps/tenant (web) and apps/mobile (Android).
 * Update this file whenever a role's pages or capabilities change.
 */

export const GUIDE_VERSION = '2026.05.21b'

export type GuideRole = 'guard' | 'supervisor' | 'manager'

export interface GuidePage {
  name: string
  what: string
}

export interface GuideSection {
  role: GuideRole
  title: string
  oneLiner: string
  platform: 'Mobile app' | 'Operations Portal' | 'Mobile + Portal'
  navDiagram: string
  pages: GuidePage[]
  tips: string[]
}

export const GUIDE_INTRO =
  'A quick tour of what every role sees inside Arrow Security. ' +
  'Pick your role below — each section shows the screens you have access to and what they do. ' +
  'This guide is updated whenever the app changes.'

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    role: 'guard',
    title: 'Guard',
    oneLiner: 'You work shifts in the field. Everything you need is in the mobile app.',
    platform: 'Mobile app',
    navDiagram: `
┌─────────────────────────────────────────────┐
│  ARROW SECURITY            (Guard view)     │
├─────────────────────────────────────────────┤
│                                             │
│              [ page content ]               │
│                                             │
├─────────────────────────────────────────────┤
│ Home | CheckIn | Patrol | Inc. | Shifts | ⓘ │
└─────────────────────────────────────────────┘
`.trim(),
    pages: [
      { name: 'Home',       what: "Today's shifts and a quick overview of your day." },
      { name: 'Check In',   what: 'Start and end your shift. Uses GPS + a selfie (or QR code) to confirm you are at the right site.' },
      { name: 'Patrol',     what: 'Start a patrol round and scan each checkpoint (QR or manual). Includes a "Test movement tracking" panel so you can verify walking / driving / idle detection on your phone.' },
      { name: 'Shifts',     what: 'Your shifts grouped by date — completed, active, upcoming. Shows clock in / clock out times plus your hours-worked total per month.' },
      { name: 'My reports', what: 'Incidents you have personally reported. Tap + to file a new one — title, description, severity, photos. You do not see other guards\' reports here.' },
      { name: 'My leave',   what: 'Submit a leave request (date range + reason) and track its approval status. Scoped to your own requests only.' },
      { name: 'Profile',    what: 'Your name, username, and sign out.' },
    ],
    tips: [
      'Background GPS only runs while a shift is active. It stops automatically when you check out.',
      'If GPS is weak at check-in, the app will still accept the check-in but flag it for supervisor review.',
      '"Test movement tracking" on the Patrol tab is the easiest way to verify your phone\'s activity sensors are working — walk for a minute, then drive, then sit still, and watch the bars fill.',
    ],
  },
  {
    role: 'supervisor',
    title: 'Supervisor',
    oneLiner: 'You oversee a team of guards. Mobile app for the field, portal for paperwork.',
    platform: 'Mobile + Portal',
    navDiagram: `
┌─────────────────────────────────────────────┐
│  ARROW SECURITY        (Supervisor view)    │
├─────────────────────────────────────────────┤
│  Guards on shift, open incidents,           │
│  pending selfie reviews                     │
├─────────────────────────────────────────────┤
│ Home | Map | Shifts | Inc. | Leave | Profile│
└─────────────────────────────────────────────┘
`.trim(),
    pages: [
      { name: 'Home (mobile)',       what: 'Live counts — guards on shift, online vs offline, plus the "Guards missing from shift" insight (anyone whose shift is open right now but who hasn\'t checked in).' },
      { name: 'Check In (mobile)',   what: 'Supervisors also work shifts. Use Check In to start and end your own shift exactly like a guard — admin assigns these to you.' },
      { name: 'Map (mobile + web)',  what: 'Live map of every guard at sites you cover. Tap a guard pin to see their last 8 hours of patrol trail.' },
      { name: 'Shifts',              what: 'Scheduled shifts for the guards and sites you cover, plus your own. Create new shifts for guards on your team — admin still handles the higher-level roster.' },
      { name: 'Reports (web)',       what: 'Monthly summary of every guard you manage — shifts worked, hours tracked, walking / driving / idle breakdown. Click a row to drill into a single guard\'s detail.' },
      { name: 'Incidents',           what: 'Incidents from guards at your sites plus your own reports. Update status, reassign, mark resolved. Tap + to file your own incident.' },
      { name: 'Leave',               what: 'Approve or reject leave requests from your team, and submit / track your own. Scoped to your guards plus you.' },
      { name: 'Guard Status (web)',  what: 'Live table — every guard at sites you cover, geofence state and GPS online/offline.' },
      { name: 'Profile',             what: 'Your account info and sign out.' },
    ],
    tips: [
      'You have shifts too — admin assigns them. Check in and out like guards do; your walking / driving / idle is tracked just like theirs.',
      'You can schedule shifts for the guards you manage at the sites you cover. Admin can override or add to those.',
      'SLA-breached incidents are highlighted red on the incidents page — those are your priority.',
      'You only see incidents, leave, and stats for guards at the sites assigned to you. Admins see everyone.',
      'You can file your own incidents and leave requests too — same buttons as a guard would use.',
    ],
  },
  {
    role: 'manager',
    title: 'Manager / Admin',
    oneLiner: 'You run operations end-to-end. Almost everything you need is in the web portal.',
    platform: 'Operations Portal',
    navDiagram: `
┌──────────────┬──────────────────────────────┐
│ ARROW        │                              │
│ SECURITY     │                              │
│              │                              │
│ Dashboard    │                              │
│ Guard Status │      [ page content ]        │
│ Guards       │                              │
│ Sites        │                              │
│ Shifts       │                              │
│ Roster       │                              │
│ Incidents    │                              │
│ Live Map     │                              │
│ Clients      │                              │
│ Leave        │                              │
│ Post Orders  │                              │
│ Payroll      │                              │
│ Supervisors  │                              │
│              │                              │
│ [Sign out]   │                              │
└──────────────┴──────────────────────────────┘
`.trim(),
    pages: [
      { name: 'Dashboard',      what: 'High-level operational stats — guards on shift, open incidents, active patrols, total sites.' },
      { name: 'Reports',        what: 'Birds-eye monthly table of every guard — shifts worked, hours tracked, walking / driving / idle. Filter by site, supervisor, or individual guard via the dropdowns. Click any row to drill into the per-shift detail.' },
      { name: 'Guard Status',   what: 'Live table of every guard: geofence state and GPS online/offline. Catch problems in real time.' },
      { name: 'Guards',         what: 'Create, edit, deactivate guard and supervisor accounts. Each guard\'s page now has a "Movement — this month" card showing their walking / driving / idle totals and per-shift breakdown.' },
      { name: 'Sites',          what: 'Add a physical location (lat/lng + geofence radius in metres). Guards check in against these.' },
      { name: 'Shifts',         what: 'Browse and filter every scheduled shift. Create one-off shifts. Use Reports for the monthly summary view.' },
      { name: 'Roster',         what: 'Weekly grid view. Guards as rows, days as columns. Click a cell to schedule a guard at a site.' },
      { name: 'Incidents',      what: 'All incidents across the company. Filter by site, supervisor, or guard via the dropdowns at the top.' },
      { name: 'Live Map',       what: 'Real-time map of every guard on shift, with patrol trails on click.' },
      { name: 'Clients',        what: 'The companies Arrow Security protects. Add clients and link sites to them.' },
      { name: 'Leave Requests', what: 'Every leave request across the company. Filter by supervisor or specific guard. Approve or reject from here.' },
      { name: 'Post Orders',    what: 'Per-site standing instructions for guards — what to do, what to watch for.' },
      { name: 'Payroll',        what: 'Define pay periods, run calculations (gross + ESI + PF + net), finalise payouts.' },
      { name: 'Supervisors',    what: 'Manage which supervisors are assigned to which sites.' },
    ],
    tips: [
      'Reports is your daily birds-eye — sort by Walking to spot guards with the lowest activity, by Driving to estimate inter-site travel costs, or by Active % to find slackers.',
      'Always create a Site before scheduling a shift there — the shift form needs an existing site.',
      'Payroll amounts are stored in paise (₹ × 100). The UI converts for you but exported numbers may show that scale.',
      'Use the Roster grid for bulk scheduling. The Shifts page is better for searching and editing one shift at a time.',
    ],
  },
]
