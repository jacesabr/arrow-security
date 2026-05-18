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
  IonAlert,
  IonToast,
  IonFab,
  IonFabButton,
} from '@ionic/react'
import {
  qrCodeOutline,
  walkOutline,
  warningOutline,
  timeOutline,
  logOutOutline,
  alertCircleOutline,
} from 'ionicons/icons'
import { Geolocation } from '@capacitor/geolocation'
import { useHistory } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../services/api'

export const DashboardPage: React.FC = () => {
  const history = useHistory()
  const { user, logout } = useAuthStore()
  const [incidents, setIncidents] = useState<any[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showPanicConfirm, setShowPanicConfirm] = useState(false)
  const [panicSending, setPanicSending] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; message: string; color: string }>({
    open: false,
    message: '',
    color: 'danger',
  })

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

  const activeShift = todayShifts.find((s) => s.status === 'active')

  const handlePanicConfirm = async () => {
    setPanicSending(true)
    try {
      let latitude: number | undefined
      let longitude: number | undefined
      let accuracy: number | undefined
      try {
        const pos = await Geolocation.getCurrentPosition({ timeout: 5000 })
        latitude = pos.coords.latitude
        longitude = pos.coords.longitude
        accuracy = pos.coords.accuracy
      } catch {
        // location unavailable — send panic without coordinates
      }
      await api.panic.trigger({ shiftId: activeShift?.id, latitude, longitude, accuracy })
      setToast({ open: true, message: 'Emergency alert sent. Help is on the way.', color: 'danger' })
    } catch (err: any) {
      setToast({ open: true, message: err?.message ?? 'Failed to send emergency alert.', color: 'warning' })
    } finally {
      setPanicSending(false)
    }
  }

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
        <div className="ion-padding">
          <h2 style={{ color: '#1a1916', marginBottom: 4 }}>Good {getGreeting()}, {user?.name?.split(' ')[0]}</h2>
          <p style={{ color: '#5c5855', margin: 0 }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px 16px' }}>
          <ActionCard icon={qrCodeOutline} label="Check In" color="#c96442" onClick={() => history.push('/tabs/checkin')} />
          <ActionCard icon={walkOutline} label="Patrol" color="#10b981" onClick={() => history.push('/tabs/patrol')} />
          <ActionCard icon={warningOutline} label="Incident" color="#f59e0b" onClick={() => history.push('/tabs/incidents')} />
          <ActionCard icon={timeOutline} label="Shifts" color="#3b82f6" onClick={() => history.push('/tabs/shifts')} />
        </div>

        {/* Today's shifts */}
        <IonCard style={{ '--background': '#ffffff', margin: '0 16px 16px' }}>
          <IonCardHeader>
            <IonCardTitle style={{ color: '#1a1916', fontSize: 16 }}>Today's Shifts</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            {loading ? (
              <IonSkeletonText animated style={{ height: 20 }} />
            ) : todayShifts.length === 0 ? (
              <p style={{ color: '#9a9490', margin: 0 }}>No shifts scheduled today</p>
            ) : (
              todayShifts.map((s) => (
                <div key={s.id} style={{ marginBottom: 8, color: '#1a1916' }}>
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
        <IonCard style={{ '--background': '#ffffff', margin: '0 16px 16px' }}>
          <IonCardHeader>
            <IonCardTitle style={{ color: '#1a1916', fontSize: 16 }}>
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
              <p style={{ color: '#9a9490', margin: 0 }}>No open incidents</p>
            ) : (
              incidents.slice(0, 3).map((i) => (
                <div key={i.id} style={{ marginBottom: 8 }}>
                  <p style={{ color: '#1a1916', margin: 0, fontWeight: 600 }}>{i.title}</p>
                  <p style={{ color: '#9a9490', margin: 0, fontSize: 12 }}>{i.severity} · {new Date(i.createdAt).toLocaleString('en-IN')}</p>
                </div>
              ))
            )}
          </IonCardContent>
        </IonCard>

        {/* Spacer so content is not hidden behind the fixed panic button */}
        <div style={{ height: 96 }} />
      </IonContent>

      {/* Panic button — fixed above tab bar */}
      <style>{`
        @keyframes panic-pulse {
          0%   { transform: scale(1);   box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
          50%  { transform: scale(1.1); box-shadow: 0 0 0 12px rgba(239,68,68,0); }
          100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        .panic-fab-btn {
          animation: panic-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <IonFab style={{ position: 'fixed', bottom: 76, right: 20 }}>
        <IonFabButton
          className="panic-fab-btn"
          disabled={panicSending}
          onClick={() => setShowPanicConfirm(true)}
          style={{
            '--background': '#ef4444',
            '--background-activated': '#b91c1c',
            '--background-hover': '#dc2626',
            '--color': '#ffffff',
            width: 64,
            height: 64,
            '--border-radius': '50%',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <IonIcon icon={alertCircleOutline} style={{ fontSize: 26, color: '#ffffff' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#ffffff' }}>PANIC</span>
          </div>
        </IonFabButton>
      </IonFab>

      {/* Panic confirmation alert */}
      <IonAlert
        isOpen={showPanicConfirm}
        onDidDismiss={() => setShowPanicConfirm(false)}
        header="Send Emergency Alert?"
        message="Send emergency alert to your supervisor and control room?"
        buttons={[
          {
            text: 'Cancel',
            role: 'cancel',
            cssClass: 'alert-button-cancel',
          },
          {
            text: 'Confirm',
            role: 'confirm',
            cssClass: 'alert-button-confirm',
            handler: () => {
              handlePanicConfirm()
            },
          },
        ]}
      />

      {/* Result toast */}
      <IonToast
        isOpen={toast.open}
        onDidDismiss={() => setToast((t) => ({ ...t, open: false }))}
        message={toast.message}
        duration={4000}
        color={toast.color}
        position="top"
      />
    </IonPage>
  )
}

const ActionCard: React.FC<{ icon: string; label: string; color: string; onClick: () => void }> = ({ icon, label, color, onClick }) => (
  <IonCard
    button
    onClick={onClick}
    style={{ '--background': '#ffffff', margin: 0, cursor: 'pointer' }}
  >
    <IonCardContent style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
      <IonIcon icon={icon} style={{ fontSize: 36, color, marginBottom: 8 }} />
      <span style={{ color: '#1a1916', fontWeight: 600 }}>{label}</span>
    </IonCardContent>
  </IonCard>
)

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
