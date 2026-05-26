export const TIER_GUARD_PRICE_RANGE = {
  bronze: { min: 100, max: 150 },
  silver: { min: 200, max: 300 },
  gold: { min: 400, max: 500 },
} as const

export const TIER_SETUP_FEE = {
  bronze: 50_000,
  silver: 100_000,
  gold: 200_000,
} as const

export const CAMERA_MONTHLY_PRICE = 75

export const SLA_HOURS = {
  low: 72,
  medium: 24,
  high: 8,
  critical: 2,
} as const

export const DEFAULT_GEOFENCE_RADIUS_METERS = 200

export const JWT_EXPIRY_SECONDS = 60 * 60 * 24 // 24 hours

export const FRAPPE_OAUTH_SCOPE = 'openid email profile roles'

// Single source of truth for how DB role enums render in UI. NEVER show the
// raw enum string to users — tenant_admin → "Admin", platform_admin → "Admin",
// etc. Imported by Sidebar, the guard detail page, roster, mobile profile.
export const ROLE_DISPLAY: Record<string, string> = {
  platform_admin: 'Admin',
  tenant_admin:   'Admin',
  supervisor:     'Supervisor',
  guard:          'Guard',
  client_viewer:  'Client',
}

export function displayRole(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_DISPLAY[role] ?? role
}

export const ADMIN_ROLES = ['tenant_admin', 'platform_admin'] as const
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'tenant_admin' || role === 'platform_admin'
}
