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
    login: (username: string, password: string, tenantSlug: string) =>
      request<{ data: { token: string; user: any } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, tenantSlug }),
      }),
    register: (body: { username: string; password: string; role: string; tenantSlug: string }) =>
      request<{ data: { token: string; user: any } }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  stats: {
    get: () =>
      request<{
        data: {
          guards: number
          sites: number
          activeShifts: number
          todayPatrols: number
          todayAttendance: number
        }
      }>('/stats'),
  },
  sites: {
    list: (params?: { status?: 'pending' | 'active' | 'inactive' }) => {
      const qs = params?.status ? `?status=${params.status}` : ''
      return request<{ data: any[] }>(`/sites${qs}`)
    },
    get: (id: string) => request<{ data: any }>(`/sites/${id}`),
    create: (body: {
      clientId?: string
      name: string
      address: string
      latitude?: number
      longitude?: number
      geofenceRadiusMeters?: number
    }) => request<{ data: any }>('/sites', { method: 'POST', body: JSON.stringify(body) }),
    update: (
      id: string,
      body: Partial<{
        name: string
        address: string
        latitude: number
        longitude: number
        geofenceRadiusMeters: number
        clientId: string
        status: 'pending' | 'active' | 'inactive'
        accessInstructions: string | null
        gateCode: string | null
        contactPhone: string | null
        hazards: string | null
      }>
    ) => request<{ data: any }>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  users: {
    list: () => request<{ data: any[] }>('/users'),
    create: (body: { username: string; name?: string; role: string; password: string }) =>
      request<{ data: any }>('/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; username?: string; role?: string; password?: string }) =>
      request<{ data: any }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
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
    delete: (id: string) => request<{ data: any }>(`/shifts/${id}`, { method: 'DELETE' }),
    // Map replay payload for /shifts/[id]: raw pings + materialised on/off-site
    // visits + the sites visited + any auto-generated off-site incidents +
    // top-line totals. One round-trip; cached after shift completion.
    replay: (id: string) =>
      request<{
        data: {
          shift: any
          pings: Array<{
            id: string
            latitude: number
            longitude: number
            accuracy: number | null
            recordedAt: string
          }>
          visits: Array<{
            id: string
            shiftId: string
            siteId: string | null
            enteredAt: string
            exitedAt: string | null
            enteredLat: number | null
            enteredLng: number | null
            exitedLat: number | null
            exitedLng: number | null
          }>
          sites: Array<{
            id: string
            name: string
            latitude: number | null
            longitude: number | null
            geofenceRadiusMeters: number
          }>
          summary: {
            offSiteMs: number
            onSiteMsBySite: Record<string, number>
            totalMs: number
            wasAbandoned: boolean
          }
        }
      }>(`/shifts/${id}/replay`),
  },
  patrols: {
    list: () => request<{ data: any[] }>('/patrol'),
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
    logsheet: (params: { guardId: string; since?: string; until?: string }) => {
      const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: { guard: any; rows: any[]; summary: any } }>(`/attendance/logsheet${qs}`)
    },
  },
  upload: {
    getUrl: (key: string) => request<{ data: { url: string } }>(`/upload/url?key=${encodeURIComponent(key)}`),
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
    list: (params?: { guardId?: string; supervisorId?: string; status?: string }) => {
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
  guardStatus: {
    list: () => request<{ data: any[] }>('/guard-status'),
    dwell: (params: { guardId: string; hours?: number; since?: string }) => {
      const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
      return request<{ data: any[] }>(`/locations/dwell${qs}`)
    },
  },
  supervisors: {
    list: () =>
      request<{ data: any[] }>('/users').then(r => ({
        data: r.data.filter((u: any) => u.role === 'supervisor'),
      })),
    getSites: (supervisorId: string) =>
      request<{ data: Array<{ siteId: string; assignedAt: string }> }>(`/supervisor-sites/${supervisorId}`),
    bySite: (siteId: string) =>
      request<{ data: Array<{ supervisorId: string; assignedAt: string; name: string; username: string }> }>(
        `/supervisor-sites/by-site/${siteId}`,
      ),
    assignSites: (supervisorId: string, siteIds: string[]) =>
      request<{ data: any }>('/supervisor-sites', {
        method: 'POST',
        body: JSON.stringify({ supervisorId, siteIds }),
      }),
    removeSite: (supervisorId: string, siteId: string) =>
      request<{ data: any }>(`/supervisor-sites/${supervisorId}/${siteId}`, { method: 'DELETE' }),
  },
  guardStats: {
    list: (params?: { month?: string }) => {
      const qs = params?.month ? `?month=${encodeURIComponent(params.month)}` : ''
      return request<{ data: { month: string; guards: any[] } }>(`/guard-stats${qs}`)
    },
    get: (guardId: string, params?: { month?: string }) => {
      const qs = params?.month ? `?month=${encodeURIComponent(params.month)}` : ''
      return request<{ data: { month: string; guard: any; summary: any; shifts: any[] } }>(`/guard-stats/${guardId}${qs}`)
    },
  },
  accounting: {
    get: (params?: { month?: string }) => {
      const qs = params?.month ? `?month=${encodeURIComponent(params.month)}` : ''
      return request<{
        data: {
          month: string
          rangeStart: string
          rangeEnd: string
          totals: {
            clients: number
            sites: number
            guards: number
            hours: number
            shiftsCompleted: number
            supervisors: number
            supervisorOnSiteHours: number
            supervisorDrivingHours: number
          }
          clients: Array<{
            clientId: string
            clientName: string
            clientStatus: string
            totalSites: number
            totalGuards: number
            totalShifts: number
            totalHours: number
            sites: Array<{
              siteId: string
              siteName: string
              siteAddress: string
              guardCount: number
              shiftsCompleted: number
              hoursWorked: number
            }>
          }>
          supervisors: Array<{
            supervisorId: string
            supervisorName: string
            shiftsCompleted: number
            totalHours: number
            onSiteHours: number
            drivingHours: number
            sitesVisited: number
          }>
        }
      }>(`/accounting${qs}`)
    },
    supervisor: (supervisorId: string, params?: { month?: string }) => {
      const qs = params?.month ? `?month=${encodeURIComponent(params.month)}` : ''
      return request<{
        data: {
          supervisor: { id: string; name: string }
          shifts: Array<{
            shiftId: string
            startsAt: string
            endsAt: string
            drivingSeconds: number
            visits: Array<{
              siteId: string
              siteName: string
              latitude: number
              longitude: number
              enteredAt: string
              exitedAt: string | null
            }>
            transitions: Array<{
              fromSiteId: string
              toSiteId: string
              durationSeconds: number | null
              distanceMeters: number | null
            }>
          }>
        }
      }>(`/accounting/supervisor/${supervisorId}${qs}`)
    },
  },
}
