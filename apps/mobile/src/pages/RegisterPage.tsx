import React, { useState } from 'react'
import { IonContent, IonPage } from '@ionic/react'
import { useHistory } from 'react-router-dom'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'

const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG as string

const ROLES = [
  { value: 'guard', label: 'Guard' },
  { value: 'supervisor', label: 'Supervisor' },
]

export const RegisterPage: React.FC = () => {
  const history = useHistory()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('guard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  async function handleRegister() {
    if (!name.trim() || !email || !password) return
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.register({ name: name.trim(), email, password, role, tenantSlug: TENANT_SLUG })
      setAuth(res.data.token, res.data.user, TENANT_SLUG)
      history.replace('/tabs/dashboard')
    } catch (e: any) {
      setError(e.message ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    background: '#ffffff',
    border: `1.5px solid ${focusedField === field ? '#c96442' : '#e8e5e0'}`,
    borderRadius: 12,
    padding: '14px 16px',
    fontSize: 15,
    color: '#1a1916',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  })

  const canSubmit = name.trim().length >= 2 && email && password.length >= 8

  return (
    <IonPage>
      <IonContent style={{ '--background': '#f9f8f6' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
        }}>
          {/* Brand */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18, background: '#c96442',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h1 style={{ color: '#1a1916', margin: '0 0 6px', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Create Account
            </h1>
            <p style={{ color: '#9a9490', margin: 0, fontSize: 14 }}>Arrow Security</p>
          </div>

          {/* Form */}
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: '#5c5855', fontSize: 13.5, fontWeight: 500, marginBottom: 7 }}>
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                placeholder="John Smith"
                style={inputStyle('name')}
                autoComplete="name"
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: '#5c5855', fontSize: 13.5, fontWeight: 500, marginBottom: 7 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                placeholder="you@arrowsecurity.com"
                style={inputStyle('email')}
                autoComplete="email"
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: '#5c5855', fontSize: 13.5, fontWeight: 500, marginBottom: 7 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                placeholder="Min. 8 characters"
                style={inputStyle('password')}
                autoComplete="new-password"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', color: '#5c5855', fontSize: 13.5, fontWeight: 500, marginBottom: 10 }}>
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
                      padding: '12px 0',
                      borderRadius: 12,
                      border: `1.5px solid ${role === r.value ? '#c96442' : '#e8e5e0'}`,
                      background: role === r.value ? 'rgba(201,100,66,0.07)' : '#ffffff',
                      color: role === r.value ? '#c96442' : '#5c5855',
                      fontSize: 14,
                      fontWeight: role === r.value ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      fontFamily: 'inherit',
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
                borderRadius: 10,
                padding: '10px 14px',
                color: '#ef4444',
                fontSize: 13.5,
                marginBottom: 16,
                textAlign: 'center',
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={loading || !canSubmit}
              style={{
                width: '100%',
                background: '#c96442',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '15px 0',
                fontSize: 15,
                fontWeight: 600,
                cursor: (loading || !canSubmit) ? 'default' : 'pointer',
                opacity: (loading || !canSubmit) ? 0.6 : 1,
                transition: 'opacity 0.15s',
                fontFamily: 'inherit',
                marginBottom: 16,
              }}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <span style={{ color: '#9a9490', fontSize: 13.5 }}>Already have an account? </span>
              <button
                type="button"
                onClick={() => history.replace('/login')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: '#c96442', fontSize: 13.5, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </IonContent>
    </IonPage>
  )
}
