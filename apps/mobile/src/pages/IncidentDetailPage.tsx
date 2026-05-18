import React, { useState, useEffect } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonBackButton,
  IonButtons,
  IonBadge,
  IonButton,
  IonSpinner,
  IonSkeletonText,
  IonIcon,
  IonToast,
} from '@ionic/react'
import { timeOutline, locationOutline, warningOutline } from 'ionicons/icons'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../services/api'

const SEVERITY_COLOR: Record<string, string> = {
  low: '#3b82f6', medium: '#fbbf24', high: '#f97316', critical: '#ef4444',
}
const STATUS_COLOR: Record<string, string> = {
  open: '#ef4444', acknowledged: '#f97316', in_progress: '#fbbf24',
  resolved: '#10b981', closed: '#9a9490',
}

const STATUS_FLOW: Record<string, { label: string; next: string }> = {
  open: { label: 'Acknowledge', next: 'acknowledged' },
  acknowledged: { label: 'Mark In Progress', next: 'in_progress' },
  in_progress: { label: 'Mark Resolved', next: 'resolved' },
  resolved: { label: 'Close Incident', next: 'closed' },
}

export const IncidentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const [incident, setIncident] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const canUpdate = user?.role === 'supervisor' || user?.role === 'tenant_admin' || user?.role === 'platform_admin'

  useEffect(() => {
    api.incidents.get(id)
      .then((res) => setIncident(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  async function advanceStatus() {
    if (!incident || !STATUS_FLOW[incident.status]) return
    setUpdating(true)
    try {
      const res = await api.incidents.updateStatus(id, STATUS_FLOW[incident.status].next)
      setIncident(res.data)
      setToast('Status updated')
    } catch (e: any) {
      setToast(e.message)
    } finally {
      setUpdating(false)
    }
  }

  const slaMs = incident ? new Date(incident.slaDeadline).getTime() - Date.now() : 0
  const slaExpired = slaMs < 0
  const slaHours = Math.abs(Math.floor(slaMs / 3600000))
  const slaMins = Math.abs(Math.floor((slaMs % 3600000) / 60000))

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/incidents" style={{ color: '#1a1916' }} />
          </IonButtons>
          <IonTitle>Incident</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }} className="ion-padding">
        {loading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <IonSkeletonText key={i} animated style={{ height: 60, marginBottom: 12, borderRadius: 8 }} />
            ))}
          </>
        ) : !incident ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <IonIcon icon={warningOutline} style={{ fontSize: 64, color: '#e8e5e0' }} />
            <p style={{ color: '#9a9490' }}>Incident not found</p>
          </div>
        ) : (
          <>
            {/* Header card */}
            <div style={{ background: '#ffffff', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span style={{
                  background: SEVERITY_COLOR[incident.severity] + '22',
                  color: SEVERITY_COLOR[incident.severity],
                  fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                }}>
                  {incident.severity.toUpperCase()}
                </span>
                <span style={{
                  background: STATUS_COLOR[incident.status] + '22',
                  color: STATUS_COLOR[incident.status],
                  fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                }}>
                  {incident.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <h2 style={{ color: '#1a1916', margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>{incident.title}</h2>
              <p style={{ color: '#5c5855', margin: 0, lineHeight: 1.6 }}>{incident.description}</p>
            </div>

            {/* SLA */}
            {incident.status !== 'resolved' && incident.status !== 'closed' && (
              <div style={{
                background: slaExpired ? '#fff0f0' : '#ffffff',
                border: `1px solid ${slaExpired ? '#ef4444' : '#e8e5e0'}`,
                borderRadius: 12, padding: 16, marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <IonIcon icon={timeOutline} style={{ color: slaExpired ? '#ef4444' : '#9a9490', fontSize: 22 }} />
                <div>
                  <p style={{ color: '#5c5855', margin: 0, fontSize: 12 }}>SLA Deadline</p>
                  <p style={{ color: slaExpired ? '#ef4444' : '#1a1916', margin: 0, fontWeight: 600 }}>
                    {slaExpired ? `Overdue by ${slaHours}h ${slaMins}m` : `${slaHours}h ${slaMins}m remaining`}
                  </p>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div style={{ background: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <p style={{ color: '#9a9490', margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Timeline</p>
              {[
                { label: 'Reported', time: incident.createdAt, done: true },
                { label: 'Acknowledged', time: incident.acknowledgedAt, done: !!incident.acknowledgedAt },
                { label: 'Resolved', time: incident.resolvedAt, done: !!incident.resolvedAt },
                { label: 'Closed', time: incident.closedAt, done: !!incident.closedAt },
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: step.done ? '#10b981' : '#e8e5e0', flexShrink: 0,
                  }} />
                  <span style={{ color: step.done ? '#1a1916' : '#9a9490', fontSize: 14, flex: 1 }}>{step.label}</span>
                  {step.time && (
                    <span style={{ color: '#5c5855', fontSize: 12 }}>
                      {new Date(step.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Media */}
            {incident.mediaUrls?.length > 0 && (
              <div style={{ background: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <p style={{ color: '#9a9490', margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Photos</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {incident.mediaUrls.map((url: string, i: number) => (
                    <img key={i} src={url} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Action button */}
            {canUpdate && STATUS_FLOW[incident.status] && (
              <IonButton
                expand="block"
                onClick={advanceStatus}
                disabled={updating}
                style={{ '--background': '#c96442', '--border-radius': '12px', height: 52, marginTop: 8 }}
              >
                {updating ? <IonSpinner name="crescent" /> : STATUS_FLOW[incident.status].label}
              </IonButton>
            )}
          </>
        )}

        <IonToast isOpen={!!toast} onDidDismiss={() => setToast(null)} message={toast ?? ''} duration={2500} />
      </IonContent>
    </IonPage>
  )
}
