'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { tdApi } from '../../lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await tdApi.auth.login(email, password, process.env.NEXT_PUBLIC_TENANT_SLUG ?? '')
      const { role } = res.data.user
      if (role !== 'tenant_admin' && role !== 'supervisor' && role !== 'guard') {
        setError('Access denied. Tenant users only.')
        return
      }
      localStorage.setItem('td_token', res.data.token)
      localStorage.setItem('td_user', JSON.stringify(res.data.user))
      router.replace('/dashboard')
    } catch (e: any) {
      setError(e.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fafaf9',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 14,
            background: '#c96442',
            marginBottom: 14,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 style={{ color: '#1a1916', fontSize: 22, fontWeight: 700, margin: 0 }}>Arrow Security</h1>
          <p style={{ color: '#9a9490', marginTop: 4, fontSize: 13 }}>Operations Portal</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleLogin}
          style={{
            background: '#ffffff',
            border: '1px solid #e8e5e0',
            borderRadius: 14,
            padding: 28,
            boxShadow: '0 2px 16px rgba(26,25,22,0.06)',
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#5c5855', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                background: '#fafaf9',
                color: '#1a1916',
                border: '1.5px solid #e8e5e0',
                borderRadius: 8,
                padding: '9px 13px',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="admin@arrowsecurity.com"
              required
              onFocus={e => (e.currentTarget.style.borderColor = '#c96442')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e8e5e0')}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', color: '#5c5855', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                background: '#fafaf9',
                color: '#1a1916',
                border: '1.5px solid #e8e5e0',
                borderRadius: 8,
                padding: '9px 13px',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="••••••••"
              required
              onFocus={e => (e.currentTarget.style.borderColor = '#c96442')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e8e5e0')}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              padding: '8px 12px',
              color: '#ef4444',
              fontSize: 13,
              marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: '#c96442',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '11px 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.65 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Dev credentials */}
        <div style={{
          marginTop: 16,
          background: 'rgba(201,100,66,0.05)',
          border: '1px solid rgba(201,100,66,0.15)',
          borderRadius: 10,
          padding: '12px 16px',
        }}>
          <p style={{ color: '#c96442', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Dev Credentials
          </p>
          {[
            { label: 'Admin', email: 'admin@acme.secureops.in', password: 'acme123' },
            { label: 'Supervisor', email: 'supervisor@acme.secureops.in', password: 'super123' },
          ].map(({ label, email: e, password: p }) => (
            <div key={label} style={{ marginBottom: 6 }}>
              <span style={{ color: '#9a9490', fontSize: 11, display: 'block', marginBottom: 2 }}>{label}</span>
              <button
                type="button"
                onClick={() => { setEmail(e); setPassword(p) }}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: '"JetBrains Mono","Cascadia Code",ui-monospace,monospace',
                  fontSize: 11, color: '#5c5855', textAlign: 'left',
                }}
              >
                {e} / {p}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
