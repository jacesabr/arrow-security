import React, { useState, useEffect } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButton,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToast,
} from '@ionic/react'
import { walkOutline } from 'ionicons/icons'
import { IonIcon } from '@ionic/react'
import { api } from '../services/api'

export const PatrolPage: React.FC = () => {
  const [sites, setSites] = useState<any[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [patrol, setPatrol] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    api.sites.list().then((res) => {
      setSites(res.data)
      if (res.data.length > 0) setSelectedSite(res.data[0].id)
    }).catch(console.error)
  }, [])

  async function startPatrol() {
    if (!selectedSite) return
    setLoading(true)
    try {
      const res = await api.patrol.startPatrol(selectedSite)
      setPatrol(res.data)
    } catch (e: any) {
      setToast(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function completePatrol() {
    if (!patrol) return
    try {
      await api.patrol.complete(patrol.id)
      setPatrol(null)
      setToast('Patrol completed!')
    } catch (e: any) {
      setToast(e.message)
    }
  }

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

            <IonButton
              expand="block"
              onClick={startPatrol}
              disabled={loading || !selectedSite}
              style={{ '--background': '#10b981', '--border-radius': '12px' }}
            >
              {loading ? <IonSpinner /> : 'Begin Patrol'}
            </IonButton>
          </div>
        ) : (
          <div className="ion-padding" style={{ textAlign: 'center', paddingTop: 48 }}>
            <IonIcon icon={walkOutline} style={{ fontSize: 72, color: '#10b981', marginBottom: 24 }} />
            <h2 style={{ color: '#1a1916', marginBottom: 8 }}>Patrol in Progress</h2>
            <p style={{ color: '#5c5855', marginBottom: 32 }}>
              {sites.find(s => s.id === selectedSite)?.name ?? 'Site'}
            </p>
            <IonButton
              expand="block"
              onClick={completePatrol}
              style={{ '--background': '#c96442', '--border-radius': '12px' }}
            >
              Complete Patrol
            </IonButton>
          </div>
        )}

        <IonToast isOpen={!!toast} onDidDismiss={() => setToast(null)} message={toast ?? ''} duration={2500} />
      </IonContent>
    </IonPage>
  )
}
