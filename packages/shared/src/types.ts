// ─── Tenant hierarchy ──────────────────────────────────────────────────────────

export type TenantTier = 'bronze' | 'silver' | 'gold'

export interface Tenant {
  id: string
  name: string
  slug: string
  tier: TenantTier
  frappeSiteUrl: string
  zampadUrl: string
  status: 'active' | 'suspended' | 'trial'
  createdAt: string
  updatedAt: string
}

export interface Client {
  id: string
  tenantId: string
  name: string
  frappeCustId: string
  status: 'active' | 'inactive'
  createdAt: string
}

export interface Site {
  id: string
  tenantId: string
  clientId: string
  name: string
  address: string
  latitude: number | null
  longitude: number | null
  geofenceRadiusMeters: number
  frigateUrl: string | null
  status: 'active' | 'inactive'
}

// ─── Users & Guards ────────────────────────────────────────────────────────────

export type UserRole = 'platform_admin' | 'tenant_admin' | 'supervisor' | 'guard' | 'client_viewer'

export interface User {
  id: string
  tenantId: string | null
  username: string
  name: string
  role: UserRole
  faceEnrolled: boolean
  createdAt: string
}

// ─── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceType = 'check_in' | 'check_out'
export type AttendanceMethod = 'face' | 'qr' | 'manual'

export interface AttendanceRecord {
  id: string
  tenantId: string
  siteId: string
  guardId: string
  type: AttendanceType
  method: AttendanceMethod
  verifiedAt: string
  latitude: number | null
  longitude: number | null
  selfieUrl: string | null
  livenessScore: number | null
}

// ─── Patrol ────────────────────────────────────────────────────────────────────

export interface Checkpoint {
  id: string
  tenantId: string
  siteId: string
  name: string
  qrCode: string
  nfcTagId: string | null
  latitude: number | null
  longitude: number | null
}

export interface PatrolScan {
  id: string
  tenantId: string
  checkpointId: string
  guardId: string
  shiftId: string
  scannedAt: string
  method: 'qr' | 'nfc' | 'manual'
  latitude: number | null
  longitude: number | null
}

// ─── Incidents ────────────────────────────────────────────────────────────────

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IncidentStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed'

export interface Incident {
  id: string
  tenantId: string
  siteId: string
  reportedBy: string
  title: string
  description: string
  severity: IncidentSeverity
  status: IncidentStatus
  zampadTicketId: string | null
  slaDeadline: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

export interface Shift {
  id: string
  tenantId: string
  siteId: string
  guardId: string
  startsAt: string
  endsAt: string
  status: 'scheduled' | 'active' | 'completed' | 'missed'
}

// ─── Cameras ──────────────────────────────────────────────────────────────────

export interface Camera {
  id: string
  tenantId: string
  siteId: string
  name: string
  rtspUrl: string
  frigateId: string | null
  status: 'online' | 'offline' | 'error'
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  meta?: {
    total?: number
    page?: number
    perPage?: number
  }
}

export interface ApiError {
  error: string
  message: string
  statusCode: number
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string
  tenantId: string | null
  role: UserRole
  iat: number
  exp: number
}

export interface LoginRequest {
  username: string
  password: string
  tenantSlug?: string
}

export interface LoginResponse {
  token: string
  user: User
}
