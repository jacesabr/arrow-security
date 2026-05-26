/**
 * Arrow Security — User Guide
 *
 * Single source of truth for the in-app onboarding guide.
 * Imported by both apps/tenant (web) and apps/mobile (Android).
 * Update this file whenever a role's pages or capabilities change.
 *
 * Writing rules:
 *   - Plain words. Short sentences. Imagine the reader is new to phones.
 *   - No jargon ("SSE", "geofence", "SLA", "RBAC"). No tech acronyms.
 *   - One idea per line. If a sentence has "and" twice, split it.
 *
 * Information-split rule:
 *   The off-site auto-lockout (guard walks away → shift ends → incident is
 *   created) is INTENTIONALLY hidden from the guard-facing section. Guards
 *   would otherwise leave their phone at the site and wander off. Supervisors
 *   and Admins must know this so they can resolve the resulting incidents.
 */

export const GUIDE_VERSION = '2026.05.23a'

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
  'A simple guide to using Arrow Security. ' +
  'Pick your role below to see every screen and what it does.'

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    role: 'guard',
    title: 'Guard',
    oneLiner: 'You work shifts on site. The phone app is all you need.',
    platform: 'Mobile app',
    navDiagram: `
┌─────────────────────────────────────────────┐
│  ARROW SECURITY            (Guard view)     │
├─────────────────────────────────────────────┤
│                                             │
│              [ page content ]               │
│                                             │
├─────────────────────────────────────────────┤
│ Home | CheckIn | Activity | Inc. | Shifts | ⓘ │
└─────────────────────────────────────────────┘
`.trim(),
    pages: [
      { name: 'Home',       what: 'Your main screen. Big buttons take you to Check In, Activity, Incidents and Shifts. Below the buttons you see today\'s shifts and any problems you reported.' },
      { name: 'Check In',   what: 'Tap this when you reach the site to start your shift. Take a selfie or scan the QR code at the site. Tap it again at the end of your shift to clock out.' },
      { name: 'Activity',   what: 'Shows your hours this month, with the site for each shift. Updates by itself when you check in and out.' },
      { name: 'Shifts',     what: 'Your work schedule. Shows the date, the site, the time you started, and the time you finished. The total hours you worked this month is at the bottom.' },
      { name: 'Incidents',  what: 'Report a problem at the site. Tap the + button. Give it a title, write what happened, pick how serious it is, and add photos if you have them. You can only see problems you reported yourself.' },
      { name: 'Leave',      what: 'Ask for time off. Pick the dates, write the reason, and send. You will see here if your supervisor said yes or no.' },
      { name: 'Profile',    what: 'Your name and your sign-out button.' },
    ],
    tips: [
      'Tap Check In when you arrive at the site. Tap it again when you finish your shift.',
      'A small message will sit at the top of your phone while you work. Leave it alone — it is normal.',
      'Keep your phone with you during your shift. Don\'t leave it on a desk or in a locker.',
      'Charge your phone before you start. A dead phone means no shift record.',
      'See a problem on site? Open Incidents, tap +, and tell us what happened. Add a photo if you can.',
      'Need a day off? Use Leave. Don\'t just not show up.',
    ],
  },
  {
    role: 'supervisor',
    title: 'Supervisor',
    oneLiner: 'You look after a team of guards. Phone for the field, website for paperwork.',
    platform: 'Mobile + Portal',
    navDiagram: `
┌─────────────────────────────────────────────┐
│  ARROW SECURITY        (Supervisor view)    │
├─────────────────────────────────────────────┤
│  Guards on shift, open incidents,           │
│  pending leave                              │
├─────────────────────────────────────────────┤
│ Home | Map | Shifts | Inc. | Leave | Profile│
└─────────────────────────────────────────────┘
`.trim(),
    pages: [
      { name: 'Home (phone)',        what: 'A quick view of things that need you — guards missing from shift, urgent incidents, leave requests waiting for you. Tap any card to deal with it on the spot. Below that, a table of your sites with this week\'s numbers.' },
      { name: 'Check In (phone)',    what: 'You work shifts too. Tap Check In at the start and end of your own shift, the same way guards do.' },
      { name: 'Map (phone + web)',   what: 'A live map of every guard at the sites you cover. Tap a guard pin to see where they have been in the last 8 hours.' },
      { name: 'Shifts',              what: 'All shifts for your team, plus your own. You can create new shifts for the guards you manage.' },
      { name: 'Reports (web)',       what: 'A month-by-month table of every guard you manage — shifts completed, missed and upcoming. Click a row to see one guard in detail.' },
      { name: 'Incidents',           what: 'Problems reported by your guards, plus any you report yourself. Update the status, change who is on it, and mark them done.' },
      { name: 'Leave',               what: 'Say yes or no to time-off requests from your team. You can also ask for time off yourself.' },
      { name: 'Guard Status (web)',  what: 'A live list of every guard you cover. Shows if they are on site and if their phone is online.' },
      { name: 'Profile',             what: 'Your info and sign out.' },
    ],
    tips: [
      'You also work shifts. Check in and out exactly like a guard.',
      'Red incidents are urgent. Handle those first.',
      'You only see the guards and sites that are assigned to you. Admins see everyone.',
      'You can file your own incidents and your own leave requests with the same buttons guards use.',
      // INTERNAL — keep out of the Guard section. Guards must not learn this.
      'Internal — do not tell guards: if a guard walks off the site during a shift, the system ends their shift on its own and creates an incident in your Incidents tab. This is how we catch guards leaving early. Open the incident, decide if it was real (bathroom break vs actually leaving), and re-schedule them if needed. Guards see only that their shift ended — they do not know why.',
      'If a guard\'s phone keeps going offline, look at Guard Status to see who is having connection trouble.',
    ],
  },
  {
    role: 'manager',
    title: 'Manager / Admin',
    oneLiner: 'You run the whole operation. The website does almost everything. The phone is for quick checks.',
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
      { name: 'Phone — Home',      what: 'A quick snapshot for when you are away from a computer — guards missing, urgent incidents, leave waiting, and a big "Open Operations Portal" button. Everything serious lives on the website.' },
      { name: 'Phone — Map',       what: 'Live map of every guard on shift. Same view as the website map.' },
      { name: 'Phone — Profile',   what: 'Sign out.' },
      { name: 'Web — Dashboard',   what: 'Top-line numbers — guards on shift, open incidents, active patrols, total sites.' },
      { name: 'Web — Reports',     what: 'A month-by-month table of every guard — shifts completed, missed and upcoming. Filter by site, supervisor, or one guard. Click a row to drill in.' },
      { name: 'Web — Guard Status',what: 'A live table of every guard. Shows if they are on site and if their phone is online. Use this to spot problems as they happen.' },
      { name: 'Web — Guards',      what: 'Add, edit, or turn off guard and supervisor accounts. Each guard\'s page also shows their hours and shifts for the month.' },
      { name: 'Web — Sites',       what: 'Add a place where guards work. You set the location on the map and how big the site area is.' },
      { name: 'Web — Shifts',      what: 'Every scheduled shift. Use this to search and to edit one shift at a time. Use Roster for scheduling many at once.' },
      { name: 'Web — Roster',      what: 'A weekly grid. Guards are rows, days are columns. Click a square to put a guard on a site that day.' },
      { name: 'Web — Incidents',   what: 'Every problem reported across the company. Filter by site, supervisor, or guard.' },
      { name: 'Web — Live Map',    what: 'A live map of every guard on shift, with their last 8 hours of movement when you click them.' },
      { name: 'Web — Clients',     what: 'The companies you protect. Add a client and link the sites that belong to them.' },
      { name: 'Web — Leave',       what: 'Every leave request in the company. Approve or reject from here. Filter by supervisor or one guard.' },
      { name: 'Web — Post Orders', what: 'Standing instructions for each site — what guards must do there, what to look out for.' },
      { name: 'Web — Payroll',     what: 'Set pay periods, run the math (gross + ESI + PF + net), and finalise pay.' },
      { name: 'Web — Supervisors', what: 'Decide which supervisors cover which sites.' },
    ],
    tips: [
      'Use the website for almost everything. The phone is just for quick checks when you are out.',
      'Always create a Site before scheduling a shift there. The shift form needs an existing site.',
      'Reports is the fastest way to spot trends — sort by completed shifts to find your hardest workers, or by missed to find no-shows.',
      'Use Roster when you need to schedule many guards at once. Use Shifts when you just need to fix one.',
      // INTERNAL — keep out of the Guard section. Guards must not learn this.
      'Internal — do not tell guards: if a guard walks off the site during their shift, the system ends the shift on its own and creates an incident automatically. You will see these in the Incidents tab. This is how we catch guards leaving early. Guards see only that their shift ended — they do not know the rule that triggered it. Treat each one as an investigation, not as a sure thing.',
      'Payroll amounts are stored in paise (₹ × 100). The screens convert for you, but exported numbers may show that scale.',
    ],
  },
]
