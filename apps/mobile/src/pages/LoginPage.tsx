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

export const LoginPage: React.FC = () => {
  const history = useHistory()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [tenantSlug, setTenantSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.login(email, password, tenantSlug || undefined)
      setAuth(res.data.token, res.data.user, tenantSlug || undefined)
      history.replace('/tabs/dashboard')
    } catch (e: any) {
      setError(e.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <IonPage>
      <IonContent className="ion-padding" style={{ '--background': '#0f172a' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, paddingBottom: 40 }}>
          <IonIcon icon={shieldCheckmarkOutline} style={{ fontSize: 64, color: '#6366f1', marginBottom: 16 }} />
          <h1 style={{ color: '#fff', margin: 0, fontSize: 28, fontWeight: 700 }}>SecureOps</h1>
          <p style={{ color: '#94a3b8', marginTop: 8 }}>Guard App</p>
        </div>

        <div style={{ maxWidth: 400, margin: '0 auto' }}>
          <IonItem lines="full" style={{ '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 12 }}>
            <IonLabel position="stacked" style={{ color: '#94a3b8' }}>Company ID (optional)</IonLabel>
            <IonInput
              value={tenantSlug}
              onIonInput={(e) => setTenantSlug(e.detail.value!)}
              placeholder="e.g. acme-security"
              style={{ color: '#fff' }}
            />
          </IonItem>

          <IonItem lines="full" style={{ '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 12 }}>
            <IonLabel position="stacked" style={{ color: '#94a3b8' }}>Email</IonLabel>
            <IonInput
              type="email"
              value={email}
              onIonInput={(e) => setEmail(e.detail.value!)}
              placeholder="guard@example.com"
              style={{ color: '#fff' }}
            />
          </IonItem>

          <IonItem lines="full" style={{ '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 24 }}>
            <IonLabel position="stacked" style={{ color: '#94a3b8' }}>Password</IonLabel>
            <IonInput
              type="password"
              value={password}
              onIonInput={(e) => setPassword(e.detail.value!)}
              placeholder="••••••••"
              style={{ color: '#fff' }}
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
            style={{ '--background': '#6366f1', '--border-radius': '8px', height: 48 }}
          >
            {loading ? <IonSpinner name="crescent" /> : 'Sign In'}
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  )
}
