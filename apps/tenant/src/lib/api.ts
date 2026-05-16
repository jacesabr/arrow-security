const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('td_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw new Error(err.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export const tdApi = {
  auth: {
    login: (email: string, password: string, tenantSlug: string) =>
      request<{ data: { token: string; user: any } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, tenantSlug }),
      }),
  },
  stats: {
    get: () =>
      request<{
        data: {
          guards: number
          sites: number
          openIncidents: number
          activeShifts: number
          todayPatrols: number
          todayAttendance: number
        }
      }>('/stats'),
  },
  sites: {
    list: () => request<{ data: any[] }>('/sites'),
    create: (body: {
      clientId?: string
      name: string
      address: string
      latitude?: number
      longitude?: number
      geofenceRadiusMeters?: number
    }) => request<{ data: any }>('/sites', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) =>
      request<{ data: any }>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  users: {
    list: () => request<{ data: any[] }>('/users'),
    create: (body: { email: string; name: string; role: string; phone?: string; password?: string }) =>
      request<{ data: any }>('/users', { method: 'POST', body: JSON.stringify(body) }),
  },
  shifts: {
    list: (params?: { guardId?: string; siteId?: string; from?: string; to?: string }) => {
      const qs = params
        ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString()
        : ''
      return request<{ data: any[] }>(`/shifts${qs}`)
    },
    create: (body: { siteId: string; guardId: string; startsAt: string; endsAt: string; notes?: string }) =>
      request<{ data: any }>('/shifts', { method: 'POST', body: JSON.stringify(body) }),
  },
  incidents: {
    list: (params?: { status?: string; severity?: string; siteId?: string; limit?: number }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/incidents${qs}`)
    },
    get: (id: string) => request<{ data: any }>(`/incidents/${id}`),
    updateStatus: (id: string, status: string) =>
      request<{ data: any }>(`/incidents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
  },
  patrols: {
    list: () => request<{ data: any[] }>('/patrol'),
  },
  checkpoints: {
    list: (siteId?: string) => {
      const qs = siteId ? `?siteId=${siteId}` : ''
      return request<{ data: any[] }>(`/patrol/checkpoints${qs}`)
    },
    create: (body: {
      siteId: string
      name: string
      latitude?: number
      longitude?: number
      orderInRoute?: number
    }) => request<{ data: any }>('/patrol/checkpoints', { method: 'POST', body: JSON.stringify(body) }),
  },
  cameras: {
    list: (siteId?: string) => {
      const qs = siteId ? `?siteId=${siteId}` : ''
      return request<{ data: any[] }>(`/cameras${qs}`)
    },
    create: (body: { siteId: string; name: string; rtspUrl: string; go2rtcStream?: string }) =>
      request<{ data: any }>('/cameras', { method: 'POST', body: JSON.stringify(body) }),
  },
  attendance: {
    list: (params?: { guardId?: string; siteId?: string; limit?: number }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/attendance${qs}`)
    },
  },
  clients: {
    list: () => request<{ data: any[] }>('/clients'),
    create: (body: {
      name: string
      contactName: string
      contactEmail: string
      contactPhone: string
    }) => request<{ data: any }>('/clients', { method: 'POST', body: JSON.stringify(body) }),
  },
}
