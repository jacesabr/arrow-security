'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Route guards for client-rendered pages. The backend is the authoritative
// gate (every route has requireAuth / requireTenantAdmin) — these just keep
// non-admins from staring at empty page chrome before the API 403s arrive.

/**
 * Redirects to /login if no token, or to /dashboard if logged in as a
 * non-admin. Use on admin-only pages (Payroll, Clients, Roster, etc.).
 */
export function useRequireAdmin() {
  const router = useRouter()
  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    try {
      const u = JSON.parse(localStorage.getItem('td_user') ?? '{}')
      if (u.role !== 'tenant_admin' && u.role !== 'platform_admin') {
        router.replace('/dashboard')
      }
    } catch {
      // td_user malformed — backend will reject the next API call regardless.
    }
  }, [router])
}

/** Redirects to /login if no token. Use on any authenticated page. */
export function useRequireToken() {
  const router = useRouter()
  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) router.replace('/login')
  }, [router])
}
