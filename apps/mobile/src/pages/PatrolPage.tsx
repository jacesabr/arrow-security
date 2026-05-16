import React, { useState, useEffect } from 'react'
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
  IonBadge,
  IonSpinner,
  IonToast,
} from '@ionic/react'
import { walkOutline, checkmarkOutline, qrCodeOutline } from 'ionicons/icons'
import { Geolocation } from '@capacitor/geolocation'
import { api } from '../services/api'

export const PatrolPage: React.FC = () => {
  const [checkpoints, setCheckpoints] = useState<any[]>([])
  const [patrol, setPatrol] = useState<any | null>(null)
  const [scanned, setScanned] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    api.patrol.checkpoints().then((res) => setCheckpoints(res.data)).catch(console.error)
  }, [])

  async function startPatrol() {
    if (!checkpoints[0]) return
    setLoading(true)
    try {
      const res = await api.patrol.startPatrol(checkpoints[0].siteId)
      setPatrol(res.data)
      setScanned(new Set())
    } catch (e: any) {
      setToast(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function scanCheckpoint(cp: any) {
    if (!patrol || scanned.has(cp.id)) return
    try {
      const pos = await Geolocation.getCurrentPosition().catch(() => null)
      await api.patrol.scan(patrol.id, {
        checkpointId: cp.id,
        method: 'manual',
        latitude: pos?.coords.latitude,
        longitude: pos?.coords.longitude,
      })
      setScanned((prev) => new Set([...prev, cp.id]))
      setToast(`✓ ${cp.name} scanned`)
    } catch (e: any) {
      setToast(e.message)
    }
  }

  async function completePatrol() {
    if (!patrol) return
    try {
      await api.patrol.complete(patrol.id)
      setPatrol(null)
      setScanned(new Set())
      setToast('Patrol completed!')
    } catch (e: any) {
      setToast(e.message)
    }
  }

  const allScanned = checkpoints.length > 0 && checkpoints.every((cp) => scanned.has(cp.id))

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonTitle>Patrol</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#0f172a' }}>
        {!patrol ? (
          <div className="ion-padding" style={{ textAlign: 'center', paddingTop: 60 }}>
            <IonIcon icon={walkOutline} style={{ fontSize: 72, color: '#10b981', marginBottom: 24 }} />
            <h2 style={{ color: '#fff' }}>Start a Patrol</h2>
            <p style={{ color: '#94a3b8' }}>{checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''} on this route</p>
            <IonButton
              expand="block"
              onClick={startPatrol}
              disabled={loading || checkpoints.length === 0}
              style={{ '--background': '#10b981', '--border-radius': '12px', marginTop: 24 }}
            >
              {loading ? <IonSpinner /> : 'Begin Patrol'}
            </IonButton>
          </div>
        ) : (
          <div>
            <div className="ion-padding" style={{ background: '#1e293b', marginBottom: 1 }}>
              <p style={{ color: '#10b981', margin: 0, fontWeight: 600 }}>
                Patrol in progress · {scanned.size}/{checkpoints.length} scanned
              </p>
            </div>

            <IonList style={{ background: 'transparent' }}>
              {checkpoints.map((cp) => (
                <IonItem
                  key={cp.id}
                  button
                  onClick={() => scanCheckpoint(cp)}
                  style={{ '--background': scanned.has(cp.id) ? '#1a2e22' : '#1e293b', '--color': '#fff', marginBottom: 2 }}
                >
                  <IonIcon
                    icon={scanned.has(cp.id) ? checkmarkOutline : qrCodeOutline}
                    slot="start"
                    style={{ color: scanned.has(cp.id) ? '#10b981' : '#64748b' }}
                  />
                  <IonLabel>
                    <h3>{cp.name}</h3>
                    {cp.latitude && <p style={{ color: '#64748b' }}>{cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)}</p>}
                  </IonLabel>
                  {scanned.has(cp.id) && <IonBadge color="success" slot="end">Done</IonBadge>}
                </IonItem>
              ))}
            </IonList>

            {allScanned && (
              <div className="ion-padding">
                <IonButton
                  expand="block"
                  onClick={completePatrol}
                  style={{ '--background': '#6366f1', '--border-radius': '12px' }}
                >
                  Complete Patrol
                </IonButton>
              </div>
            )}
          </div>
        )}

        <IonToast
          isOpen={!!toast}
          onDidDismiss={() => setToast(null)}
          message={toast ?? ''}
          duration={2500}
        />
      </IonContent>
    </IonPage>
  )
}
