import React from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButton,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/react'
import { personOutline, logOutOutline, mailOutline } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export const ProfilePage: React.FC = () => {
  const history = useHistory()
  const { user, logout } = useAuthStore()

  function handleLogout() {
    logout()
    history.replace('/login')
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonTitle>Profile</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }}>
        <div style={{ textAlign: 'center', padding: '40px 16px 24px' }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: '#f4f2ef', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IonIcon icon={personOutline} style={{ fontSize: 40, color: '#c96442' }} />
          </div>
          <h2 style={{ color: '#1a1916', margin: 0 }}>{user?.name}</h2>
          <p style={{ color: '#5c5855', margin: '4px 0 0' }}>
            {(({ tenant_admin: 'Admin', platform_admin: 'Admin', supervisor: 'Supervisor', guard: 'Guard', client_viewer: 'Client' } as Record<string, string>)[user?.role ?? '']) ?? user?.role?.replace('_', ' ')}
          </p>
        </div>

        <IonList style={{ background: 'transparent', padding: '0 16px' }}>
          <IonItem style={{ '--background': '#ffffff', '--color': '#1a1916', borderRadius: 8, marginBottom: 8 }}>
            <IonIcon icon={mailOutline} slot="start" style={{ color: '#c96442' }} />
            <IonLabel>@{user?.username}</IonLabel>
          </IonItem>
        </IonList>

        <div className="ion-padding" style={{ marginTop: 24 }}>
          <IonButton
            expand="block"
            onClick={handleLogout}
            style={{ '--background': '#f4f2ef', '--color': '#ef4444', '--border-radius': '12px' }}
          >
            <IonIcon icon={logOutOutline} slot="start" />
            Sign Out
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  )
}
