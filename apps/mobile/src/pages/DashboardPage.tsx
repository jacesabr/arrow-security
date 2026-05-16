import React, { useEffect, useState } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton,
  IonIcon,
  IonBadge,
  IonSkeletonText,
} from '@ionic/react'
import {
  qrCodeOutline,
  walkOutline,
  warningOutline,
  timeOutline,
  logOutOutline,
} from 'ionicons/icons'
import { useHistory } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../services/api'

export const DashboardPage: React.FC = () => {
  const history = useHistory()
  const { user, logout } = useAuthStore()
  const [incidents, setIncidents] = useState<any[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.incidents.list({ status: 'open' }), api.shifts.list()])
      .then(([inc, sh]) => {
        setIncidents(inc.data)
        setShifts(sh.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const todayShifts = shifts.filter((s) => {
    const start = new Date(s.startsAt)
    const today = new Date()
    return start.toDateString() === today.toDateString()
  })

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonTitle>SecureOps</IonTitle>
          <IonButton slot="end" fill="clear" onClick={() => { logout(); history.replace('/login') }}>
            <IonIcon icon={logOutOutline} style={{ color: '#94a3b8' }} />
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#0f172a' }}>
        <div className="ion-padding">
          <h2 style={{ color: '#fff', marginBottom: 4 }}>Good {getGreeting()}, {user?.name?.split(' ')[0]}</h2>
          <p style={{ color: '#94a3b8', margin: 0 }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px 16px' }}>
          <ActionCard icon={qrCodeOutline} label="Check In" color="#6366f1" onClick={() => history.push('/tabs/checkin')} />
          <ActionCard icon={walkOutline} label="Patrol" color="#10b981" onClick={() => history.push('/tabs/patrol')} />
          <ActionCard icon={warningOutline} label="Incident" color="#f59e0b" onClick={() => history.push('/tabs/incidents')} />
          <ActionCard icon={timeOutline} label="Shifts" color="#3b82f6" onClick={() => history.push('/tabs/shifts')} />
        </div>

        {/* Today's shifts */}
        <IonCard style={{ '--background': '#1e293b', margin: '0 16px 16px' }}>
          <IonCardHeader>
            <IonCardTitle style={{ color: '#fff', fontSize: 16 }}>Today's Shifts</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            {loading ? (
              <IonSkeletonText animated style={{ height: 20 }} />
            ) : todayShifts.length === 0 ? (
              <p style={{ color: '#64748b', margin: 0 }}>No shifts scheduled today</p>
            ) : (
              todayShifts.map((s) => (
                <div key={s.id} style={{ marginBottom: 8, color: '#cbd5e1' }}>
                  <strong>{new Date(s.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong>
                  {' — '}
                  {new Date(s.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  <IonBadge color={s.status === 'active' ? 'success' : 'medium'} style={{ marginLeft: 8 }}>
                    {s.status}
                  </IonBadge>
                </div>
              ))
            )}
          </IonCardContent>
        </IonCard>

        {/* Open incidents */}
        <IonCard style={{ '--background': '#1e293b', margin: '0 16px 16px' }}>
          <IonCardHeader>
            <IonCardTitle style={{ color: '#fff', fontSize: 16 }}>
              Open Incidents
              {incidents.length > 0 && (
                <IonBadge color="danger" style={{ marginLeft: 8 }}>{incidents.length}</IonBadge>
              )}
            </IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            {loading ? (
              <IonSkeletonText animated style={{ height: 20 }} />
            ) : incidents.length === 0 ? (
              <p style={{ color: '#64748b', margin: 0 }}>No open incidents</p>
            ) : (
              incidents.slice(0, 3).map((i) => (
                <div key={i.id} style={{ marginBottom: 8 }}>
                  <p style={{ color: '#cbd5e1', margin: 0, fontWeight: 600 }}>{i.title}</p>
                  <p style={{ color: '#64748b', margin: 0, fontSize: 12 }}>{i.severity} · {new Date(i.createdAt).toLocaleString('en-IN')}</p>
                </div>
              ))
            )}
          </IonCardContent>
        </IonCard>
      </IonContent>
    </IonPage>
  )
}

const ActionCard: React.FC<{ icon: string; label: string; color: string; onClick: () => void }> = ({ icon, label, color, onClick }) => (
  <IonCard
    button
    onClick={onClick}
    style={{ '--background': '#1e293b', margin: 0, cursor: 'pointer' }}
  >
    <IonCardContent style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
      <IonIcon icon={icon} style={{ fontSize: 36, color, marginBottom: 8 }} />
      <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{label}</span>
    </IonCardContent>
  </IonCard>
)

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
