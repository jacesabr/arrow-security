'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (
        payload.role !== 'client_viewer' &&
        payload.role !== 'tenant_admin' &&
        payload.role !== 'platform_admin'
      ) {
        router.replace('/dashboard')
      }
    } catch {
      router.replace('/login')
    }
  }, [router])

  const nav = [
    { href: '/client/sites', label: 'My Sites' },
    { href: '/client/incidents', label: 'Incidents' },
  ]

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--background)',
      color: 'var(--text)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Client sidebar */}
      <aside style={{
        width: 220,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        flexShrink: 0,
      }}>
        <div style={{
          padding: '0 20px 24px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z" fill="#c96442" />
            </svg>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Arrow Security</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Client Portal</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0 12px' }}>
          {nav.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block',
                  padding: '9px 12px',
                  marginBottom: 4,
                  borderRadius: 6,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  background: active ? 'rgba(201,100,66,0.1)' : 'transparent',
                  transition: 'color 0.1s, background 0.1s',
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => {
              localStorage.removeItem('td_token')
              localStorage.removeItem('td_user')
              window.location.replace('/login')
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-2)',
              cursor: 'pointer',
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
    </div>
  )
}
