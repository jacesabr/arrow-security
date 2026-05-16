import React, { useState, useEffect } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSkeletonText,
  IonIcon,
} from '@ionic/react'
import { calendarOutline } from 'ionicons/icons'
import { api } from '../services/api'

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'primary',
  active: 'success',
  completed: 'medium',
  missed: 'danger',
}

export const ShiftsPage: React.FC = () => {
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.shifts.list()
      .then((res) => setShifts(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const grouped = shifts.reduce<Record<string, any[]>>((acc, s) => {
    const date = new Date(s.startsAt).toDateString()
    if (!acc[date]) acc[date] = []
    acc[date].push(s)
    return acc
  }, {})

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonTitle>My Shifts</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#0f172a' }}>
        {loading ? (
          <div className="ion-padding">
            {[...Array(4)].map((_, i) => <IonSkeletonText key={i} animated style={{ height: 60, marginBottom: 8, borderRadius: 8 }} />)}
          </div>
        ) : shifts.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <IonIcon icon={calendarOutline} style={{ fontSize: 64, color: '#334155' }} />
            <p style={{ color: '#64748b' }}>No shifts scheduled</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, dayShifts]) => (
            <div key={date}>
              <div style={{ padding: '12px 16px 4px', color: '#6366f1', fontWeight: 600, fontSize: 13 }}>
                {date === new Date().toDateString() ? 'Today' : date}
              </div>
              <IonList style={{ background: 'transparent', padding: '0 8px 8px' }}>
                {dayShifts.map((s) => (
                  <IonItem key={s.id} style={{ '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 6 }}>
                    <IonLabel>
                      <h2 style={{ color: '#fff' }}>
                        {new Date(s.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(s.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </h2>
                      {s.notes && <p style={{ color: '#64748b' }}>{s.notes}</p>}
                    </IonLabel>
                    <IonBadge color={STATUS_COLOR[s.status] ?? 'medium'} slot="end">
                      {s.status}
                    </IonBadge>
                  </IonItem>
                ))}
              </IonList>
            </div>
          ))
        )}
      </IonContent>
    </IonPage>
  )
}
