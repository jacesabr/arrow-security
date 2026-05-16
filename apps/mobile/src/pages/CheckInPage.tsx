import React, { useState, useEffect } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButton,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonItem,
  IonLabel,
  IonText,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonToast,
} from '@ionic/react'
import { checkmarkCircleOutline, qrCodeOutline, cameraOutline, locationOutline } from 'ionicons/icons'
import { Geolocation } from '@capacitor/geolocation'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'

export const CheckInPage: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const [sites, setSites] = useState<any[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [method, setMethod] = useState<'face' | 'qr' | 'manual'>('manual')
  const [type, setType] = useState<'check_in' | 'check_out'>('check_in')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    // Fetch sites for this guard
    Geolocation.getCurrentPosition({ enableHighAccuracy: true })
      .then((pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => null)
  }, [])

  async function handleCheckIn() {
    if (!selectedSite) return
    setLoading(true)
    setError(null)
    try {
      await api.attendance.checkIn({
        siteId: selectedSite,
        type,
        method,
        latitude: location?.lat,
        longitude: location?.lng,
      })
      setSuccess(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonTitle>Check In / Out</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#0f172a' }} className="ion-padding">
        <IonSegment
          value={type}
          onIonChange={(e) => setType(e.detail.value as 'check_in' | 'check_out')}
          style={{ marginBottom: 24, '--background': '#1e293b' }}
        >
          <IonSegmentButton value="check_in">
            <IonLabel>Check In</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="check_out">
            <IonLabel>Check Out</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <IonIcon
            icon={locationOutline}
            style={{ color: location ? '#10b981' : '#64748b', fontSize: 20, marginRight: 8 }}
          />
          <span style={{ color: location ? '#10b981' : '#64748b' }}>
            {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Location unavailable'}
          </span>
        </div>

        <div style={{ background: '#1e293b', borderRadius: 12, padding: 4, marginBottom: 16 }}>
          <IonItem lines="none" style={{ '--background': 'transparent' }}>
            <IonLabel style={{ color: '#94a3b8' }}>Method</IonLabel>
            <IonSelect
              value={method}
              onIonChange={(e) => setMethod(e.detail.value)}
              style={{ '--color': '#fff' }}
              interface="action-sheet"
            >
              <IonSelectOption value="manual">Manual</IonSelectOption>
              <IonSelectOption value="qr">QR Code</IonSelectOption>
              <IonSelectOption value="face">Face Recognition</IonSelectOption>
            </IonSelect>
          </IonItem>
        </div>

        {error && <IonText color="danger"><p>{error}</p></IonText>}

        <IonButton
          expand="block"
          onClick={handleCheckIn}
          disabled={loading || !selectedSite}
          style={{ '--background': type === 'check_in' ? '#10b981' : '#ef4444', '--border-radius': '12px', height: 56, marginTop: 24 }}
        >
          {loading ? (
            <IonSpinner name="crescent" />
          ) : (
            <>
              <IonIcon icon={checkmarkCircleOutline} slot="start" />
              {type === 'check_in' ? 'Check In Now' : 'Check Out Now'}
            </>
          )}
        </IonButton>

        <IonToast
          isOpen={success}
          onDidDismiss={() => setSuccess(false)}
          message={`${type === 'check_in' ? 'Checked in' : 'Checked out'} successfully!`}
          duration={3000}
          color="success"
        />
      </IonContent>
    </IonPage>
  )
}
