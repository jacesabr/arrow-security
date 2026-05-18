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
  payroll: {
    listPeriods: () => request<{ data: any[] }>('/payroll'),
    createPeriod: (body: { periodStart: string; periodEnd: string }) =>
      request<{ data: any }>('/payroll', { method: 'POST', body: JSON.stringify(body) }),
    getPeriod: (id: string) => request<{ data: { period: any; records: any[] } }>(`/payroll/${id}`),
    calculate: (id: string, dailyRates?: Record<string, number>) =>
      request<{ data: any[] }>(`/payroll/${id}/calculate`, {
        method: 'POST',
        body: JSON.stringify({ dailyRates }),
      }),
    updateRecord: (recordId: string, body: { bonusPaise?: number; otherDeductionsPaise?: number; notes?: string }) =>
      request<{ data: any }>(`/payroll/records/${recordId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    finalize: (id: string) =>
      request<{ data: any }>(`/payroll/${id}/finalize`, { method: 'POST' }),
  },
  attendance: {
    list: (params?: { guardId?: string; siteId?: string; limit?: number }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/attendance${qs}`)
    },
    report: (params?: { since?: string; until?: string; guardId?: string; siteId?: string }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/attendance/report${qs}`)
    },
  },
  locations: {
    history: (params: { guardId?: string; shiftId?: string; since?: string; limit?: number }) => {
      const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/locations/history${qs}`)
    },
    liveUrl: () => `${API_URL}/locations/live`,
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
  postOrders: {
    list: (siteId?: string) => {
      const qs = siteId ? `?siteId=${siteId}` : ''
      return request<{ data: any[] }>(`/post-orders${qs}`)
    },
    create: (body: { siteId: string; title: string; content: string; requiresAck: boolean }) =>
      request<{ data: any }>('/post-orders', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: string) => request<{ data: any }>(`/post-orders/${id}`),
    ack: (id: string) => request<{ data: any }>(`/post-orders/${id}/ack`, { method: 'POST' }),
  },
  certifications: {
    list: (params?: { guardId?: string; status?: string }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/certifications${qs}`)
    },
    create: (body: { guardId: string; certType: string; certNumber?: string; issuedBy?: string; issuedAt?: string; expiresAt?: string }) =>
      request<{ data: any }>('/certifications', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) =>
      request<{ data: any }>(`/certifications/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  leaveRequests: {
    list: (params?: { guardId?: string; status?: string }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/leave-requests${qs}`)
    },
    create: (body: { leaveType: string; startDate: string; endDate: string; reason?: string }) =>
      request<{ data: any }>('/leave-requests', { method: 'POST', body: JSON.stringify(body) }),
    review: (id: string, body: { status: 'approved' | 'rejected'; reviewNote?: string }) =>
      request<{ data: any }>(`/leave-requests/${id}/review`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  passdowns: {
    list: (params?: { siteId?: string; limit?: number }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/passdowns${qs}`)
    },
    create: (body: { siteId: string; toGuardId?: string; fromShiftId?: string; notes: string }) =>
      request<{ data: any }>('/passdowns', { method: 'POST', body: JSON.stringify(body) }),
  },
  exceptions: {
    list: (params?: { guardId?: string; shiftId?: string }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/exceptions${qs}`)
    },
    resolve: (id: string, resolutionNote?: string) =>
      request<{ data: any }>(`/exceptions/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolutionNote }) }),
  },
  cameras: {
    list: (siteId?: string) => {
      const qs = siteId ? `?siteId=${siteId}` : ''
      return request<{ data: any[] }>(`/cameras${qs}`)
    },
    create: (body: { name: string; siteId: string; rtspUrl: string; go2rtcStream?: string }) =>
      request<{ data: any }>('/cameras', { method: 'POST', body: JSON.stringify(body) }),
  },
  panic: {
    list: () => request<{ data: any[] }>('/panic'),
    acknowledge: (id: string) =>
      request<{ data: any }>(`/panic/${id}/acknowledge`, { method: 'PATCH' }),
    resolve: (id: string, notes?: string) =>
      request<{ data: any }>(`/panic/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  },
}
