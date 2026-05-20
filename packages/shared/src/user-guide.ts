/**
 * Arrow Security — User Guide
 *
 * Single source of truth for the in-app onboarding guide.
 * Imported by both apps/tenant (web) and apps/mobile (Android).
 * Update this file whenever a role's pages or capabilities change.
 */

export const GUIDE_VERSION = '2026.05.19'

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
      { name: 'Home',     what: "Today's shifts and open incidents you reported." },
      { name: 'Check In', what: 'Start and end your shift. Uses GPS + a selfie (or QR code) to confirm you are at the right site.' },
      { name: 'Patrol',   what: 'Start a patrol round and scan each checkpoint (QR or manual). Finish to log the route.' },
      { name: 'Incidents',what: 'Report something that happened on site — title, description, severity, photos. View incidents you reported.' },
      { name: 'Shifts',   what: 'Your upcoming shifts grouped by date. Tells the app when to track your location in the background.' },
      { name: 'Leave',    what: 'Submit a leave request with date range and reason. Track its approval status.' },
      { name: 'Profile',  what: 'Your name, phone, face-enrolment status, and sign out.' },
    ],
    tips: [
      'Background GPS only runs while a shift is active. It stops automatically when you check out.',
      'If GPS is weak at check-in, the app will still accept the check-in but flag it for supervisor review.',
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
      { name: 'Home (mobile)',       what: 'Live counts — guards on shift, online vs offline, selfies awaiting review. Recent open incidents.' },
      { name: 'Map (mobile + web)',  what: 'Live map of every guard currently on shift. Tap a guard pin to see their last 8 hours of patrol trail.' },
      { name: 'Shifts',              what: 'Filter and view scheduled shifts. See which guards have started, which are missed.' },
      { name: 'Incidents',           what: 'All open incidents from your team. Update status, reassign, mark resolved.' },
      { name: 'Leave (approvals)',   what: 'Approve or reject leave requests submitted by your guards.' },
      { name: 'Guard Status (web)',  what: 'Live table — every guard, their geofence state and GPS online/offline status.' },
      { name: 'Profile',             what: 'Your account info and sign out.' },
    ],
    tips: [
      'SLA-breached incidents are highlighted red on the incidents page. Those are your priority.',
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
      { name: 'Guard Status',   what: 'Live table of every guard: geofence state, GPS health, selfie review queue. Catch problems in real time.' },
      { name: 'Guards',         what: 'Create, edit, deactivate guard and supervisor user accounts.' },
      { name: 'Sites',          what: 'Add a physical location (lat/lng + geofence radius in metres). Guards check in against these.' },
      { name: 'Shifts',         what: 'Browse and filter every scheduled shift. Create one-off shifts.' },
      { name: 'Roster',         what: 'Weekly grid view. Guards as rows, days as columns. Click a cell to schedule a guard at a site.' },
      { name: 'Incidents',      what: 'All incidents across all sites. Filter by severity, status, SLA breach.' },
      { name: 'Live Map',       what: 'Real-time map of every guard on shift, with patrol trails on click.' },
      { name: 'Clients',        what: 'The companies Arrow Security protects. Add clients and link sites to them.' },
      { name: 'Leave Requests', what: 'Approve or reject leave for any guard across the company.' },
      { name: 'Post Orders',    what: 'Per-site standing instructions for guards — what to do, what to watch for.' },
      { name: 'Payroll',        what: 'Define pay periods, run calculations (gross + ESI + PF + net), finalise payouts.' },
      { name: 'Supervisors',    what: 'Manage which supervisors are assigned to which sites.' },
    ],
    tips: [
      'Always create a Site before scheduling a shift there — the shift form needs an existing site.',
      'Payroll amounts are stored in paise (₹ × 100). The UI converts for you but exported numbers may show that scale.',
      'Use the Roster grid for bulk scheduling. The Shifts page is better for searching and editing one shift at a time.',
    ],
  },
]
