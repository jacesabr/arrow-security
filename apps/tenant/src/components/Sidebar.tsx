'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useViewAs, type ViewAsRole } from '../context/ViewAsContext'

const DEV_ACCOUNTS = [
  { label: 'Admin', email: 'admin@acme.secureops.in', password: 'acme123', color: '#10b981' },
  { label: 'Supervisor', email: 'supervisor@acme.secureops.in', password: 'super123', color: '#c96442' },
]

const ROLE_DISPLAY: Record<string, string> = {
  tenant_admin:    'Admin',
  platform_admin:  'Admin',
  supervisor:      'Supervisor',
  guard:           'Guard',
  client_viewer:   'Client',
}

function DevAccountSwitcher() {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => {
    try {
      const u = localStorage.getItem('td_user')
      if (u) setCurrentEmail(JSON.parse(u).email)
    } catch {}
  }, [])

  async function switchTo(acc: typeof DEV_ACCOUNTS[0]) {
    if (switching || currentEmail === acc.email) return
    setSwitching(acc.email)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: acc.password, tenantSlug: process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'acme' }),
      })
      const data = await res.json()
      if (data.data?.token) {
        localStorage.setItem('td_token', data.data.token)
        localStorage.setItem('td_user', JSON.stringify(data.data.user))
        window.location.reload()
      }
    } catch (e) { console.error(e) }
    finally { setSwitching(null) }
  }

  return (
    <div style={{ padding: '8px 12px 10px', background: 'rgba(201,100,66,0.03)', borderBottom: '1px solid #e8e5e0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, color: '#9a9490', fontSize: 10, fontFamily: 'ui-monospace,"JetBrains Mono",monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span style={{ color: '#c96442' }}>◈</span> testing as
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        {DEV_ACCOUNTS.map(a => {
          const active = currentEmail === a.email
          return (
            <button key={a.email} onClick={() => switchTo(a)} style={{
              flex: 1, padding: '5px 0', borderRadius: 7,
              fontSize: 12, fontWeight: active ? 600 : 400,
              border: `1.5px solid ${active ? a.color : '#e8e5e0'}`,
              background: active ? `${a.color}14` : '#fff',
              color: active ? a.color : '#5c5855',
              cursor: active ? 'default' : 'pointer',
              opacity: switching && switching !== a.email ? 0.4 : 1,
              transition: 'all 0.12s',
            }}>
              {switching === a.email ? '…' : a.label}
              {active && <span style={{ marginLeft: 4, fontSize: 9 }}>✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type NavItem = {
  href: string
  label: string
  adminOnly?: boolean   // visible to tenant_admin only
  supervisorPlus?: boolean // visible to supervisors+ (default if neither flag set)
}

const NAV: NavItem[] = [
  { href: '/dashboard',      label: 'Dashboard' },
  { href: '/guard-status',   label: 'Guard Status' },
  { href: '/guards',         label: 'Guards',          adminOnly: true },
  { href: '/certifications', label: 'Certifications',  adminOnly: true },
  { href: '/sites',          label: 'Sites' },
  { href: '/shifts',         label: 'Shifts' },
  { href: '/roster',         label: 'Roster',          adminOnly: true },
  { href: '/incidents',      label: 'Incidents' },
  { href: '/panic',          label: '🚨 Panic Alerts',  adminOnly: true },
  { href: '/patrols',        label: 'Patrols' },
  { href: '/map',            label: 'Live Map' },
  { href: '/clients',        label: 'Clients',         adminOnly: true },
  { href: '/leave-requests', label: 'Leave Requests' },
  { href: '/post-orders',    label: 'Post Orders',     adminOnly: true },
  { href: '/payroll',        label: 'Payroll',         adminOnly: true },
  { href: '/supervisors',    label: 'Supervisors',     adminOnly: true },
  { href: '/settings',       label: 'Settings' },
]

const ROLE_LABELS: Record<ViewAsRole, string> = {
  owner: 'Owner',
  supervisor: 'Supervisor',
  guard: 'Guard',
}

function ViewAsSwitcher() {
  const { viewAs, setViewAs, isSimulating } = useViewAs()

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid #e8e5e0' }}>
      {isSimulating && (
        <div style={{
          marginBottom: 8,
          padding: '4px 8px',
          borderRadius: 6,
          fontSize: 12,
          textAlign: 'center',
          background: 'rgba(201,100,66,0.08)',
          border: '1px solid rgba(201,100,66,0.2)',
          color: '#c96442',
        }}>
          Viewing as {viewAs}
        </div>
      )}
      <p style={{ color: '#9a9490', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        View As
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(Object.keys(ROLE_LABELS) as ViewAsRole[]).map((role) => (
          <button
            key={role}
            onClick={() => setViewAs(role)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              background: viewAs === role ? 'rgba(201,100,66,0.08)' : 'transparent',
              border: `1px solid ${viewAs === role ? 'rgba(201,100,66,0.2)' : 'transparent'}`,
              color: viewAs === role ? '#c96442' : '#9a9490',
              cursor: 'pointer',
              transition: 'color 0.1s',
            }}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>
    </div>
  )
}

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

  const isAdmin = userRole === 'tenant_admin' || userRole === 'platform_admin'

  function visibleNav() {
    return NAV.filter(item => {
      if (item.adminOnly && !isAdmin) return false
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
      width: 220,
      minHeight: '100vh',
      background: '#ffffff',
      borderRight: '1px solid #e8e5e0',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Brand header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #e8e5e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7, background: '#c96442',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <div style={{ color: '#1a1916', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Arrow Security</div>
            <div style={{ color: '#9a9490', fontSize: 10, marginTop: 1 }}>Operations Portal</div>
          </div>
        </div>
        {userLabel && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 8px', borderRadius: 6, background: '#fafaf9', border: '1px solid #e8e5e0',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 11, color: '#9a9490' }}>Signed in as</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#c96442' }}>{userLabel}</span>
          </div>
        )}
        <button
          onClick={() => window.open('/dev-ref', '_blank')}
          title="Developer reference — opens in new tab"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
            background: '#fafaf9', border: '1px solid #e8e5e0',
            color: '#9a9490', fontSize: 11,
            fontFamily: '"JetBrains Mono","Cascadia Code",ui-monospace,monospace',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c96442'; e.currentTarget.style.color = '#c96442' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e5e0'; e.currentTarget.style.color = '#9a9490' }}
        >
          <span style={{ fontSize: 11 }}>◈</span> dev reference
        </button>
      </div>

      {/* Dev account switcher */}
      <DevAccountSwitcher />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleNav().map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '7px 10px',
                borderRadius: 7,
                fontSize: 13.5,
                fontWeight: active ? 600 : 400,
                textDecoration: 'none',
                background: active ? 'rgba(201,100,66,0.08)' : 'transparent',
                border: `1px solid ${active ? 'rgba(201,100,66,0.15)' : 'transparent'}`,
                color: active ? '#c96442' : '#5c5855',
                transition: 'color 0.1s, background 0.1s',
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = '#f4f2ef'; (e.currentTarget as HTMLElement).style.color = '#1a1916' } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#5c5855' } }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* View As Switcher */}
      <ViewAsSwitcher />

      {/* Sign out */}
      <div style={{ padding: '10px 8px', borderTop: '1px solid #e8e5e0' }}>
        <button
          onClick={logout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            padding: '7px 10px',
            borderRadius: 7,
            fontSize: 13.5,
            fontWeight: 400,
            background: 'transparent',
            border: '1px solid transparent',
            color: '#9a9490',
            cursor: 'pointer',
            transition: 'color 0.1s',
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
