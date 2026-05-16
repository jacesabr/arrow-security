import React, { useState, useEffect } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonFab,
  IonFabButton,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSkeletonText,
} from '@ionic/react'
import { addOutline, warningOutline } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'
import { api } from '../services/api'

const SEVERITY_COLORS: Record<string, string> = {
  low: 'medium',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
}

export const IncidentPage: React.FC = () => {
  const history = useHistory()
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.incidents.list()
      .then((res) => setIncidents(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonTitle>Incidents</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#0f172a' }}>
        {loading ? (
          <div className="ion-padding">
            {[...Array(5)].map((_, i) => (
              <IonSkeletonText key={i} animated style={{ height: 60, marginBottom: 8, borderRadius: 8 }} />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <IonIcon icon={warningOutline} style={{ fontSize: 64, color: '#334155' }} />
            <p style={{ color: '#64748b' }}>No incidents reported</p>
          </div>
        ) : (
          <IonList style={{ background: 'transparent', padding: 8 }}>
            {incidents.map((inc) => (
              <IonItem
                key={inc.id}
                button
                onClick={() => history.push(`/tabs/incidents/${inc.id}`)}
                style={{ '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 8 }}
              >
                <IonLabel>
                  <h2 style={{ color: '#fff' }}>{inc.title}</h2>
                  <p style={{ color: '#64748b' }}>
                    {new Date(inc.createdAt).toLocaleString('en-IN')}
                  </p>
                </IonLabel>
                <div slot="end" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <IonBadge color={SEVERITY_COLORS[inc.severity]}>{inc.severity}</IonBadge>
                  <IonBadge color={inc.status === 'open' ? 'danger' : inc.status === 'resolved' ? 'success' : 'warning'}>
                    {inc.status}
                  </IonBadge>
                </div>
              </IonItem>
            ))}
          </IonList>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton
            onClick={() => history.push('/tabs/incidents/new')}
            style={{ '--background': '#ef4444' }}
          >
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  )
}
