import React, { useState } from 'react'
import {
  IonContent,
  IonPage,
  IonInput,
  IonButton,
  IonItem,
  IonLabel,
  IonText,
  IonSpinner,
  IonIcon,
} from '@ionic/react'
import { shieldCheckmarkOutline } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'

const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG as string

export const LoginPage: React.FC = () => {
  const history = useHistory()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.login(email, password, TENANT_SLUG)
      setAuth(res.data.token, res.data.user, TENANT_SLUG)
      history.replace('/tabs/dashboard')
    } catch (e: any) {
      setError(e.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <IonPage>
      <IonContent className="ion-padding" style={{ '--background': '#fafaf9' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, paddingBottom: 40 }}>
          <IonIcon icon={shieldCheckmarkOutline} style={{ fontSize: 64, color: '#c96442', marginBottom: 16 }} />
          <h1 style={{ color: '#1a1916', margin: 0, fontSize: 28, fontWeight: 700 }}>Arrow Security</h1>
          <p style={{ color: '#5c5855', marginTop: 8 }}>Guard App</p>
        </div>

        <div style={{ maxWidth: 400, margin: '0 auto' }}>
          <IonItem lines="full" style={{ '--background': '#ffffff', '--color': '#1a1916', borderRadius: 8, marginBottom: 12 }}>
            <IonLabel position="stacked" style={{ color: '#5c5855' }}>Email</IonLabel>
            <IonInput
              type="email"
              value={email}
              onIonInput={(e) => setEmail(e.detail.value!)}
              placeholder="guard@example.com"
              style={{ color: '#1a1916' }}
            />
          </IonItem>

          <IonItem lines="full" style={{ '--background': '#ffffff', '--color': '#1a1916', borderRadius: 8, marginBottom: 24 }}>
            <IonLabel position="stacked" style={{ color: '#5c5855' }}>Password</IonLabel>
            <IonInput
              type="password"
              value={password}
              onIonInput={(e) => setPassword(e.detail.value!)}
              placeholder="••••••••"
              style={{ color: '#1a1916' }}
            />
          </IonItem>

          {error && (
            <IonText color="danger">
              <p style={{ textAlign: 'center', marginBottom: 16 }}>{error}</p>
            </IonText>
          )}

          <IonButton
            expand="block"
            onClick={handleLogin}
            disabled={loading || !email || !password}
            style={{ '--background': '#c96442', '--border-radius': '8px', height: 48 }}
          >
            {loading ? <IonSpinner name="crescent" /> : 'Sign In'}
          </IonButton>

          {/* Dev credentials */}
          <div style={{
            marginTop: 24,
            background: 'rgba(201,100,66,0.05)',
            border: '1px solid rgba(201,100,66,0.15)',
            borderRadius: 10,
            padding: '12px 14px',
          }}>
            <p style={{ color: '#c96442', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
              Dev Credentials
            </p>
            {[
              { label: 'Guard 1', email: 'guard1@acme.secureops.in', password: 'guard123' },
              { label: 'Supervisor', email: 'supervisor@acme.secureops.in', password: 'super123' },
            ].map(({ label, email: e, password: p }) => (
              <div key={label} style={{ marginBottom: 6 }} onClick={() => { setEmail(e); setPassword(p) }}>
                <span style={{ color: '#9a9490', fontSize: 10, display: 'block' }}>{label}</span>
                <span style={{ fontFamily: '"JetBrains Mono",ui-monospace,monospace', fontSize: 11, color: '#5c5855' }}>
                  {e} / {p}
                </span>
              </div>
            ))}
          </div>
        </div>
      </IonContent>
    </IonPage>
  )
}
