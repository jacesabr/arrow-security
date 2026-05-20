'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { tdApi } from '../../lib/api'

const ROLES = [
  { value: 'guard', label: 'Guard' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'tenant_admin', label: 'Admin' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#fafaf9',
  color: '#1a1916',
  border: '1.5px solid #e8e5e0',
  borderRadius: 8,
  padding: '9px 13px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('guard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await tdApi.auth.register({
        username: username.trim(),
        password,
        role,
        tenantSlug: process.env.NEXT_PUBLIC_TENANT_SLUG ?? '',
      })
      localStorage.setItem('td_token', res.data.token)
      localStorage.setItem('td_user', JSON.stringify(res.data.user))
      router.replace('/dashboard')
    } catch (e: any) {
      setError(e.message ?? 'Registration failed')
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
          <p style={{ color: '#9a9490', marginTop: 4, fontSize: 13 }}>Create your account</p>
        </div>

        <form
          onSubmit={handleRegister}
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
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              placeholder="Pick a username"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
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
              style={inputStyle}
              placeholder="Choose a password"
              required
              autoComplete="new-password"
              onFocus={e => (e.currentTarget.style.borderColor = '#c96442')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e8e5e0')}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', color: '#5c5855', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Role
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              {ROLES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    borderRadius: 8,
                    border: `1.5px solid ${role === r.value ? '#c96442' : '#e8e5e0'}`,
                    background: role === r.value ? 'rgba(201,100,66,0.06)' : '#fafaf9',
                    color: role === r.value ? '#c96442' : '#5c5855',
                    fontSize: 13,
                    fontWeight: role === r.value ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
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
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <span style={{ color: '#9a9490', fontSize: 13 }}>Already have an account? </span>
          <a
            href="/login"
            style={{ color: '#c96442', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}
          >
            Sign In
          </a>
        </div>
      </div>
    </div>
  )
}
