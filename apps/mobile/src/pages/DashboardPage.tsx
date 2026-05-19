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
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonTitle>Arrow Security</IonTitle>
          <IonButton slot="end" fill="clear" onClick={() => { logout(); history.replace('/login') }}>
            <IonIcon icon={logOutOutline} style={{ color: '#5c5855' }} />
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }}>
        <div style={{ padding: '28px 20px 20px' }}>
          <h2 style={{ color: '#1a1916', marginBottom: 4, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Good {getGreeting()}, {user?.name?.split(' ')[0]}
          </h2>
          <p style={{ color: '#9a9490', margin: 0, fontSize: 14 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '0 20px 20px' }}>
          <ActionCard icon={qrCodeOutline} label="Check In" color="#c96442" onClick={() => history.push('/tabs/checkin')} />
          <ActionCard icon={walkOutline} label="Patrol" color="#10b981" onClick={() => history.push('/tabs/patrol')} />
          <ActionCard icon={warningOutline} label="Incident" color="#f59e0b" onClick={() => history.push('/tabs/incidents')} />
          <ActionCard icon={timeOutline} label="Shifts" color="#3b82f6" onClick={() => history.push('/tabs/shifts')} />
        </div>

        {/* Today's shifts */}
        <IonCard style={{ '--background': '#ffffff', margin: '0 20px 16px', borderRadius: '14px', boxShadow: 'none', border: '1px solid #ebe8e2' }}>
          <IonCardHeader>
            <IonCardTitle style={{ color: '#1a1916', fontSize: 15, fontWeight: 600 }}>Today's Shifts</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            {loading ? (
              <IonSkeletonText animated style={{ height: 20 }} />
            ) : todayShifts.length === 0 ? (
              <p style={{ color: '#9a9490', margin: 0, fontSize: 14 }}>No shifts scheduled today</p>
            ) : (
              todayShifts.map((s) => (
                <div key={s.id} style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#1a1916', fontWeight: 500, fontSize: 14 }}>
                    {new Date(s.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {' — '}
                    {new Date(s.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <IonBadge color={s.status === 'active' ? 'success' : 'medium'}>{s.status}</IonBadge>
                </div>
              ))
            )}
          </IonCardContent>
        </IonCard>

        {/* Open incidents */}
        <IonCard style={{ '--background': '#ffffff', margin: '0 20px 16px', borderRadius: '14px', boxShadow: 'none', border: '1px solid #ebe8e2' }}>
          <IonCardHeader>
            <IonCardTitle style={{ color: '#1a1916', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              Open Incidents
              {incidents.length > 0 && (
                <IonBadge color="danger">{incidents.length}</IonBadge>
              )}
            </IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            {loading ? (
              <IonSkeletonText animated style={{ height: 20 }} />
            ) : incidents.length === 0 ? (
              <p style={{ color: '#9a9490', margin: 0, fontSize: 14 }}>No open incidents</p>
            ) : (
              incidents.slice(0, 3).map((i) => (
                <div key={i.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f4f2ef' }}>
                  <p style={{ color: '#1a1916', margin: '0 0 3px', fontWeight: 500, fontSize: 14 }}>{i.title}</p>
                  <p style={{ color: '#9a9490', margin: 0, fontSize: 12.5 }}>{i.severity} · {new Date(i.createdAt).toLocaleString('en-IN')}</p>
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
    style={{ '--background': '#ffffff', margin: 0, cursor: 'pointer', borderRadius: '14px', boxShadow: 'none', border: '1px solid #ebe8e2' }}
  >
    <IonCardContent style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px' }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <IonIcon icon={icon} style={{ fontSize: 26, color }} />
      </div>
      <span style={{ color: '#1a1916', fontWeight: 600, fontSize: 14 }}>{label}</span>
    </IonCardContent>
  </IonCard>
)

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
