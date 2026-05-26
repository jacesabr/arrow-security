'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ROLE_DISPLAY, isAdminRole } from '@secureops/shared'

type NavItem = {
  href: string
  label: string
  adminOnly?: boolean   // visible to tenant_admin only
  supervisorPlus?: boolean // visible to supervisors+ (default if neither flag set)
}

// Visibility rules:
//   - no flags  → everyone (guard, supervisor, admin)
//   - supervisorPlus → supervisor + admin only (hidden from guard)
//   - adminOnly → admin only (also hidden from supervisor)
const NAV: NavItem[] = [
  { href: '/dashboard',      label: 'Dashboard' },
  { href: '/shifts',         label: 'Shifts' },
  { href: '/reports',        label: 'Reports',         supervisorPlus: true },
  { href: '/guard-status',   label: 'Guard Status',    supervisorPlus: true },
  { href: '/sites',          label: 'Sites',           supervisorPlus: true },
  { href: '/guards',         label: 'Guards',          adminOnly: true },
  { href: '/roster',         label: 'Roster',          adminOnly: true },
  { href: '/supervisors',    label: 'Supervisors',     adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userRole, setUserRole] = useState<string>('tenant_admin')
  const [userLabel, setUserLabel] = useState<string>('')

  useEffect(() => {
    try {
      const u = localStorage.getItem('td_user')
      if (u) {
        const parsed = JSON.parse(u)
        const role = parsed.role ?? 'tenant_admin'
        setUserRole(role)
        setUserLabel(ROLE_DISPLAY[role] ?? role)
      }
    } catch {}
  }, [])

  const isAdmin = isAdminRole(userRole)
  const isSupervisor = userRole === 'supervisor'
  const isSupervisorOrAdmin = isAdmin || isSupervisor

  function visibleNav() {
    return NAV.filter(item => {
      if (item.adminOnly && !isAdmin) return false
      if (item.supervisorPlus && !isSupervisorOrAdmin) return false
      return true
    })
  }

  function logout() {
    localStorage.removeItem('td_token')
    localStorage.removeItem('td_user')
    router.replace('/login')
  }

  return (
    <aside style={{
      width: 248,
      background: '#ffffff',
      borderRight: '1px solid #ebe8e2',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Brand header */}
      <div style={{ padding: '24px 20px 18px', borderBottom: '1px solid #ebe8e2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: '#c96442',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <div style={{ color: '#1a1916', fontWeight: 700, fontSize: 14, lineHeight: 1.2, letterSpacing: '-0.01em' }}>Arrow Security</div>
            <div style={{ color: '#9a9490', fontSize: 11, marginTop: 2 }}>Operations Portal</div>
          </div>
        </div>
        {userLabel && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px', borderRadius: 8, background: '#f9f8f6', border: '1px solid #ebe8e2',
            marginBottom: 10,
          }}>
            <span style={{ fontSize: 11.5, color: '#9a9490' }}>Signed in as</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#c96442' }}>{userLabel}</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav" style={{ flex: 1, padding: '12px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visibleNav().map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: active ? 600 : 400,
                textDecoration: 'none',
                background: active ? 'rgba(201,100,66,0.08)' : 'transparent',
                color: active ? '#c96442' : '#5c5855',
                transition: 'color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = '#f4f2ef'; (e.currentTarget as HTMLElement).style.color = '#1a1916' } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#5c5855' } }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid #ebe8e2' }}>
        <button
          onClick={logout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 13.5,
            fontWeight: 400,
            background: 'transparent',
            border: 'none',
            color: '#9a9490',
            cursor: 'pointer',
            transition: 'color 0.12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#9a9490')}
        >
          Sign Out
        </button>
      </div>

    </aside>
  )
}
