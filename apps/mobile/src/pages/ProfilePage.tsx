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
import { personOutline, logOutOutline, shieldCheckmarkOutline, callOutline, mailOutline } from 'ionicons/icons'
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
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonTitle>Profile</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#0f172a' }}>
        <div style={{ textAlign: 'center', padding: '40px 16px 24px' }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: '#1e293b', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IonIcon icon={personOutline} style={{ fontSize: 40, color: '#6366f1' }} />
          </div>
          <h2 style={{ color: '#fff', margin: 0 }}>{user?.name}</h2>
          <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>{user?.role?.replace('_', ' ')}</p>
        </div>

        <IonList style={{ background: 'transparent', padding: '0 16px' }}>
          <IonItem style={{ '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 8 }}>
            <IonIcon icon={mailOutline} slot="start" style={{ color: '#6366f1' }} />
            <IonLabel>{user?.email}</IonLabel>
          </IonItem>
          {user?.phone && (
            <IonItem style={{ '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 8 }}>
              <IonIcon icon={callOutline} slot="start" style={{ color: '#6366f1' }} />
              <IonLabel>{user.phone}</IonLabel>
            </IonItem>
          )}
          <IonItem style={{ '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 8 }}>
            <IonIcon icon={shieldCheckmarkOutline} slot="start" style={{ color: user?.faceEnrolled ? '#10b981' : '#ef4444' }} />
            <IonLabel>Face Recognition: {user?.faceEnrolled ? 'Enrolled' : 'Not enrolled'}</IonLabel>
          </IonItem>
        </IonList>

        <div className="ion-padding" style={{ marginTop: 24 }}>
          <IonButton
            expand="block"
            onClick={handleLogout}
            style={{ '--background': '#1e293b', '--color': '#ef4444', '--border-radius': '12px' }}
          >
            <IonIcon icon={logOutOutline} slot="start" />
            Sign Out
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  )
}
