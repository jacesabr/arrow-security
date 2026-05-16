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
