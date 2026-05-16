const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('cp_token')
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
    throw new Error(err.message)
  }
  return res.json()
}

export const cpApi = {
  auth: {
    login: (email: string, password: string) =>
      request<{ data: { token: string; user: any } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
  },
  tenants: {
    list: () => request<{ data: any[] }>('/tenants'),
    get: (id: string) => request<{ data: any }>(`/tenants/${id}`),
    create: (body: any) => request<{ data: any }>('/tenants', { method: 'POST', body: JSON.stringify(body) }),
    updateStatus: (id: string, status: string) =>
      request<{ data: any }>(`/tenants/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  sites: {
    list: () => request<{ data: any[] }>('/sites'),
  },
  users: {
    list: () => request<{ data: any[] }>('/users'),
  },
  incidents: {
    list: () => request<{ data: any[] }>('/incidents'),
  },
}
