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
    me: () => request<{ data: any }>('/auth/me'),
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
    create: (payload: { siteId: string; title: string; description: string; severity: string; mediaUrls?: string[] }) =>
      request<{ data: any }>('/incidents', { method: 'POST', body: JSON.stringify(payload) }),
    updateStatus: (id: string, status: string) =>
      request<{ data: any }>(`/incidents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },

  shifts: {
    list: () => request<{ data: any[] }>('/shifts'),
  },

  cameras: {
    list: (siteId?: string) => {
      const qs = siteId ? `?siteId=${siteId}` : ''
      return request<{ data: any[] }>(`/cameras${qs}`)
    },
  },
}
