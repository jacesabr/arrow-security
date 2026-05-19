import { useAuthStore } from '../store/auth'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
    login: (email: string, password: string, tenantSlug?: string) =>
      request<{ data: { token: string; user: any } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, tenantSlug }),
      }),
    register: (body: { name: string; email: string; password: string; role: string; tenantSlug: string }) =>
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

  incidents: {
    list: (params?: { status?: string; siteId?: string }) => {
      const qs = new URLSearchParams(params as any).toString()
      return request<{ data: any[] }>(`/incidents?${qs}`)
    },
    get: (id: string) => request<{ data: any }>(`/incidents/${id}`),
    create: (payload: { siteId: string; title: string; description: string; severity: string; mediaUrls?: string[] }) =>
      request<{ data: any }>('/incidents', { method: 'POST', body: JSON.stringify(payload) }),
    updateStatus: (id: string, status: string) =>
      request<{ data: any }>(`/incidents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
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
    }) => request<{ data: any }>('/locations', { method: 'POST', body: JSON.stringify(payload) }),
  },

  cameras: {
    list: (siteId?: string) => {
      const qs = siteId ? `?siteId=${siteId}` : ''
      return request<{ data: any[] }>(`/cameras${qs}`)
    },
  },

  sites: {
    list: () => request<{ data: any[] }>('/sites'),
  },

  clients: {
    list: () => request<{ data: any[] }>('/clients'),
  },

  leaveRequests: {
    list: () => request<{ data: any[] }>('/leave-requests'),
    create: (body: { leaveType?: string; startDate: string; endDate: string; reason?: string }) =>
      request<{ data: any }>('/leave-requests', { method: 'POST', body: JSON.stringify(body) }),
    cancel: (id: string) => request<{ data: any }>(`/leave-requests/${id}/cancel`, { method: 'PATCH' }),
  },

  panic: {
    trigger: (data: { shiftId?: string; latitude?: number; longitude?: number; accuracy?: number }) =>
      request<{ data: any }>('/panic', { method: 'POST', body: JSON.stringify(data) }),
    list: () => request<{ data: any[] }>('/panic'),
    resolve: (id: string, notes?: string) =>
      request<{ data: any }>(`/panic/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  },

  upload: {
    presign: (filename: string, contentType: string, folder: 'selfies' | 'incidents' | 'documents') =>
      request<{ data: { uploadUrl: string; key: string; expiresIn: number } }>('/upload/presign', {
        method: 'POST',
        body: JSON.stringify({ filename, contentType, folder }),
      }),
    getUrl: (key: string) =>
      request<{ data: { url: string } }>(`/upload/url?key=${encodeURIComponent(key)}`),
  },
}
