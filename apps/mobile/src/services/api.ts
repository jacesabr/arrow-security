import { useAuthStore } from '../store/auth'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token
  const hasBody = options.body !== undefined && options.body !== null
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Network error' }))
    throw new Error(err.message ?? `HTTP ${res.status}`)
  }

  return res.json()
}

export const api = {
  auth: {
    login: (username: string, password: string, tenantSlug?: string) =>
      request<{ data: { token: string; user: any } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, tenantSlug }),
      }),
    register: (body: {
      username: string
      password: string
      role: string
      tenantSlug: string
    }) =>
      request<{ data: { token: string; user: any } }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    me: () => request<{ data: any }>('/auth/me'),
  },

  stats: {
    get: () => request<{ data: any }>('/stats'),
  },

  attendance: {
    list: (params?: { siteId?: string; limit?: number }) => {
      const qs = new URLSearchParams(params as any).toString()
      return request<{ data: any[] }>(`/attendance?${qs}`)
    },
    checkIn: (payload: {
      siteId: string
      type: 'check_in' | 'check_out'
      method: 'face' | 'qr' | 'manual'
      latitude?: number
      longitude?: number
      selfieUrl?: string
      livenessScore?: number
    }) => request<{ data: any }>('/attendance', { method: 'POST', body: JSON.stringify(payload) }),
  },

  patrol: {
    list: (params?: { siteId?: string; status?: string; limit?: number }) => {
      const qs = new URLSearchParams(params as any).toString()
      return request<{ data: any[] }>(`/patrol?${qs}`)
    },
    checkpoints: (siteId?: string) => {
      const qs = siteId ? `?siteId=${siteId}` : ''
      return request<{ data: any[] }>(`/patrol/checkpoints${qs}`)
    },
    startPatrol: (siteId: string, shiftId?: string) =>
      request<{ data: any }>('/patrol/start', { method: 'POST', body: JSON.stringify({ siteId, shiftId }) }),
    scan: (patrolId: string, payload: any) =>
      request<{ data: any }>(`/patrol/${patrolId}/scan`, { method: 'POST', body: JSON.stringify(payload) }),
    complete: (patrolId: string) =>
      request<{ data: any }>(`/patrol/${patrolId}/complete`, { method: 'PATCH' }),
  },

  shifts: {
    list: (params?: { from?: string; to?: string }) => {
      const qs = new URLSearchParams(params as any).toString()
      return request<{ data: any[] }>(`/shifts?${qs}`)
    },
  },

  locations: {
    track: (payload: {
      latitude: number
      longitude: number
      accuracy?: number
      heading?: number
      speed?: number
      altitude?: number
      shiftId?: string
      recordedAt?: string
    }) =>
      request<{
        data: any
        // Set by the server when this ping pushed the guard's open off-site
        // visit over the hysteresis threshold. The mobile app should treat this
        // as a forced logout: stop tracking, clear auth, route to /login.
        shiftAbandoned?: {
          shiftId: string
          reason: 'off_site_during_shift'
        }
      }>('/locations', { method: 'POST', body: JSON.stringify(payload) }),
  },

  cameras: {
    list: (siteId?: string) => {
      const qs = siteId ? `?siteId=${siteId}` : ''
      return request<{ data: any[] }>(`/cameras${qs}`)
    },
  },

  sites: {
    list: () => request<{ data: any[] }>('/sites'),
    listStats: () => request<{ data: any[] }>('/site-stats'),
  },

  guardStats: {
    get: (userId: string, params?: { month?: string }) => {
      const qs = params?.month ? `?month=${encodeURIComponent(params.month)}` : ''
      return request<{ data: { month: string; guard: any; summary: any; shifts: any[] } }>(`/guard-stats/${userId}${qs}`)
    },
  },

  clients: {
    list: () => request<{ data: any[] }>('/clients'),
  },

  selfies: {
    create: (payload: {
      // Omitted when the guard is at a location not yet known to us — the
      // server then auto-creates a `pending` site at the supplied GPS for an
      // admin to confirm.
      siteId?: string
      checkType: 'check_in' | 'check_out'
      imageData: string
      latitude?: number
      longitude?: number
      outOfZoneReason?: string
    }) => request<{
      data: {
        selfie: any
        attendance: any
        distanceMeters: number | null
        isWithinGeofence: boolean | null
        createdPendingSite?: boolean
        siteId?: string
      }
    }>('/selfies', { method: 'POST', body: JSON.stringify(payload) }),
  },

  upload: {
    presign: (filename: string, contentType: string, folder: 'selfies' | 'documents') =>
      request<{ data: { uploadUrl: string; key: string; expiresIn: number } }>('/upload/presign', {
        method: 'POST',
        body: JSON.stringify({ filename, contentType, folder }),
      }),
    getUrl: (key: string) =>
      request<{ data: { url: string } }>(`/upload/url?key=${encodeURIComponent(key)}`),
  },
}
