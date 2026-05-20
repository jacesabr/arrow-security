import React, { useState } from 'react'
import { IonContent, IonPage } from '@ionic/react'
import { useHistory } from 'react-router-dom'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'

const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG as string

export const LoginPage: React.FC = () => {
  const history = useHistory()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.login(username.trim(), password, TENANT_SLUG)
      setAuth(res.data.token, res.data.user, TENANT_SLUG)
      history.replace('/tabs/dashboard')
    } catch (e: any) {
      setError(e.message ?? 'Login failed')
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
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
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
              Arrow Security
            </h1>
            <p style={{ color: '#9a9490', margin: 0, fontSize: 14 }}>Guard Operations</p>
          </div>

          <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: '#5c5855', fontSize: 13.5, fontWeight: 500, marginBottom: 7 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                placeholder="Your username"
                style={inputStyle('username')}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', color: '#5c5855', fontSize: 13.5, fontWeight: 500, marginBottom: 7 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                onKeyDown={e => { if (e.key === 'Enter' && username && password) handleLogin() }}
                placeholder="••••••••"
                style={inputStyle('password')}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 16,
              }}>
                <span style={{ color: '#ef4444', fontSize: 13.5 }}>
                  {error.toLowerCase().includes('fetch') ? 'Server is waking up — wait a moment and try again.' : error}
                </span>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading || !username || !password}
              style={{
                width: '100%',
                background: '#c96442',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '15px 0',
                fontSize: 15,
                fontWeight: 600,
                cursor: (loading || !username || !password) ? 'default' : 'pointer',
                opacity: (loading || !username || !password) ? 0.6 : 1,
                transition: 'opacity 0.15s',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span style={{ color: '#9a9490', fontSize: 13.5 }}>New here? </span>
            <button
              type="button"
              onClick={() => history.push('/register')}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: '#c96442', fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Create an account
            </button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  )
}
