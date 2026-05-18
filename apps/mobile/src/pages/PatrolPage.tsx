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
  IonSelect,
  IonSelectOption,
} from '@ionic/react'
import { walkOutline, checkmarkOutline, qrCodeOutline, handLeftOutline } from 'ionicons/icons'
import { Geolocation } from '@capacitor/geolocation'
import { api } from '../services/api'
import { QrScannerModal } from '../components/QrScannerModal'

export const PatrolPage: React.FC = () => {
  const [sites, setSites] = useState<any[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [checkpoints, setCheckpoints] = useState<any[]>([])
  const [patrol, setPatrol] = useState<any | null>(null)
  const [scanned, setScanned] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanTargetId, setScanTargetId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    api.sites.list().then((res) => {
      setSites(res.data)
      if (res.data.length > 0) setSelectedSite(res.data[0].id)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedSite) return
    api.patrol.checkpoints(selectedSite).then((res) => setCheckpoints(res.data)).catch(console.error)
  }, [selectedSite])

  async function startPatrol() {
    if (!selectedSite) return
    setLoading(true)
    try {
      const res = await api.patrol.startPatrol(selectedSite)
      setPatrol(res.data)
      setScanned(new Set())
    } catch (e: any) {
      setToast(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function markCheckpoint(cp: any, method: 'manual' | 'qr') {
    if (!patrol || scanned.has(cp.id)) return
    try {
      const pos = await Geolocation.getCurrentPosition().catch(() => null)
      await api.patrol.scan(patrol.id, {
        checkpointId: cp.id,
        method,
        latitude: pos?.coords.latitude,
        longitude: pos?.coords.longitude,
      })
      setScanned((prev) => new Set([...prev, cp.id]))
      setToast(`✓ ${cp.name} ${method === 'qr' ? 'QR scanned' : 'marked done'}`)
    } catch (e: any) {
      setToast(e.message)
    }
  }

  function openQrScanner(cpId: string) {
    setScanTargetId(cpId)
    setScannerOpen(true)
  }

  function handleQrScan(value: string) {
    setScannerOpen(false)
    if (!scanTargetId) return

    const cp = checkpoints.find((c) => c.id === scanTargetId)
    if (!cp) return

    if (cp.qrCode === value) {
      markCheckpoint(cp, 'qr')
    } else {
      setToast(`QR code doesn't match this checkpoint (got: ${value.slice(0, 20)}…)`)
    }
    setScanTargetId(null)
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
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonTitle>Patrol</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }}>
        {!patrol ? (
          <div className="ion-padding" style={{ textAlign: 'center', paddingTop: 48 }}>
            <IonIcon icon={walkOutline} style={{ fontSize: 72, color: '#10b981', marginBottom: 24 }} />
            <h2 style={{ color: '#1a1916', marginBottom: 8 }}>Start a Patrol</h2>

            {sites.length > 1 && (
              <div style={{ background: '#ffffff', borderRadius: 8, padding: 4, marginBottom: 16, textAlign: 'left' }}>
                <IonItem lines="none" style={{ '--background': 'transparent' }}>
                  <IonLabel style={{ color: '#5c5855' }}>Site</IonLabel>
                  <IonSelect
                    value={selectedSite}
                    onIonChange={(e) => setSelectedSite(e.detail.value)}
                    interface="action-sheet"
                    style={{ '--color': '#1a1916' }}
                  >
                    {sites.map((s) => (
                      <IonSelectOption key={s.id} value={s.id}>{s.name}</IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
              </div>
            )}

            <p style={{ color: '#5c5855', marginBottom: 24 }}>
              {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''} on this route
            </p>

            <IonButton
              expand="block"
              onClick={startPatrol}
              disabled={loading || checkpoints.length === 0}
              style={{ '--background': '#10b981', '--border-radius': '12px' }}
            >
              {loading ? <IonSpinner /> : 'Begin Patrol'}
            </IonButton>
          </div>
        ) : (
          <div>
            <div className="ion-padding" style={{ background: '#f4f2ef', marginBottom: 1 }}>
              <p style={{ color: '#10b981', margin: 0, fontWeight: 600 }}>
                Patrol in progress · {scanned.size}/{checkpoints.length} checkpoints
              </p>
            </div>

            <IonList style={{ background: 'transparent' }}>
              {checkpoints.map((cp) => {
                const done = scanned.has(cp.id)
                return (
                  <IonItem
                    key={cp.id}
                    style={{
                      '--background': done ? '#10b98114' : '#ffffff',
                      '--color': '#1a1916',
                      border: done ? '1px solid #10b98133' : 'none',
                      marginBottom: 2,
                    }}
                  >
                    <IonIcon
                      icon={done ? checkmarkOutline : qrCodeOutline}
                      slot="start"
                      style={{ color: done ? '#10b981' : '#9a9490' }}
                    />
                    <IonLabel>
                      <h3 style={{ color: '#1a1916' }}>{cp.name}</h3>
                      {cp.orderInRoute && <p style={{ color: '#9a9490', fontSize: 12 }}>Stop {cp.orderInRoute}</p>}
                    </IonLabel>
                    {done ? (
                      <IonBadge color="success" slot="end">Done</IonBadge>
                    ) : (
                      <div slot="end" style={{ display: 'flex', gap: 8 }}>
                        <IonButton
                          size="small"
                          fill="outline"
                          onClick={() => openQrScanner(cp.id)}
                          style={{ '--color': '#10b981', '--border-color': '#10b981' }}
                        >
                          <IonIcon icon={qrCodeOutline} slot="start" />
                          QR
                        </IonButton>
                        <IonButton
                          size="small"
                          fill="outline"
                          onClick={() => markCheckpoint(cp, 'manual')}
                          style={{ '--color': '#5c5855', '--border-color': '#e8e5e0' }}
                        >
                          <IonIcon icon={handLeftOutline} slot="start" />
                          Manual
                        </IonButton>
                      </div>
                    )}
                  </IonItem>
                )
              })}
            </IonList>

            {allScanned && (
              <div className="ion-padding">
                <IonButton
                  expand="block"
                  onClick={completePatrol}
                  style={{ '--background': '#c96442', '--border-radius': '12px' }}
                >
                  Complete Patrol
                </IonButton>
              </div>
            )}
          </div>
        )}

        <QrScannerModal
          isOpen={scannerOpen}
          onScan={handleQrScan}
          onClose={() => { setScannerOpen(false); setScanTargetId(null) }}
          title="Scan Checkpoint QR"
        />

        <IonToast isOpen={!!toast} onDidDismiss={() => setToast(null)} message={toast ?? ''} duration={2500} />
      </IonContent>
    </IonPage>
  )
}
