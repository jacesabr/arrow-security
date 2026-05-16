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
  IonBadge,
} from '@ionic/react'
import { checkmarkCircleOutline, qrCodeOutline, locationOutline, handLeftOutline, cameraOutline } from 'ionicons/icons'
import { Geolocation } from '@capacitor/geolocation'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'
import { QrScannerModal } from '../components/QrScannerModal'

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
  const [scannerOpen, setScannerOpen] = useState(false)
  const [qrVerified, setQrVerified] = useState(false)
  const [geofenceStatus, setGeofenceStatus] = useState<boolean | null>(null)

  useEffect(() => {
    api.sites.list().then((res) => setSites(res.data)).catch(() => null)
    Geolocation.getCurrentPosition({ enableHighAccuracy: true })
      .then((pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => null)
  }, [])

  // Reset QR verification when site or method changes
  useEffect(() => {
    setQrVerified(false)
  }, [selectedSite, method, type])

  function handleQrScan(value: string) {
    setScannerOpen(false)
    // Any valid QR scan from the camera counts as QR verification
    if (value) {
      setQrVerified(true)
    }
  }

  async function handleCheckIn() {
    if (!selectedSite) return
    if (method === 'qr' && !qrVerified) {
      setScannerOpen(true)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.attendance.checkIn({
        siteId: selectedSite,
        type,
        method,
        latitude: location?.lat,
        longitude: location?.lng,
      })
      setGeofenceStatus(res.data?.isWithinGeofence ?? null)
      setSuccess(true)
      setQrVerified(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isCheckIn = type === 'check_in'
  const accentColor = isCheckIn ? '#10b981' : '#ef4444'

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonTitle>Check In / Out</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#0f172a' }} className="ion-padding">
        {/* Type toggle */}
        <IonSegment
          value={type}
          onIonChange={(e) => setType(e.detail.value as 'check_in' | 'check_out')}
          style={{ marginBottom: 20, '--background': '#1e293b' }}
        >
          <IonSegmentButton value="check_in"><IonLabel>Check In</IonLabel></IonSegmentButton>
          <IonSegmentButton value="check_out"><IonLabel>Check Out</IonLabel></IonSegmentButton>
        </IonSegment>

        {/* Location */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IonIcon icon={locationOutline} style={{ color: location ? '#10b981' : '#64748b', fontSize: 20 }} />
          <span style={{ color: location ? '#10b981' : '#64748b', fontSize: 14 }}>
            {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Getting location…'}
          </span>
          {geofenceStatus !== null && (
            <IonBadge color={geofenceStatus ? 'success' : 'warning'} style={{ marginLeft: 'auto' }}>
              {geofenceStatus ? 'In zone' : 'Out of zone'}
            </IonBadge>
          )}
        </div>

        {/* Site */}
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 4, marginBottom: 12 }}>
          <IonItem lines="none" style={{ '--background': 'transparent' }}>
            <IonLabel style={{ color: '#94a3b8' }}>Site</IonLabel>
            <IonSelect
              value={selectedSite}
              onIonChange={(e) => setSelectedSite(e.detail.value)}
              placeholder="Select site"
              style={{ '--color': '#fff' }}
              interface="action-sheet"
            >
              {sites.map((s) => (
                <IonSelectOption key={s.id} value={s.id}>{s.name}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        </div>

        {/* Method */}
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <p style={{ color: '#64748b', margin: '0 0 12px', fontSize: 13 }}>Verification Method</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: 'manual', icon: handLeftOutline, label: 'Manual' },
              { value: 'qr', icon: qrCodeOutline, label: 'QR Code' },
              { value: 'face', icon: cameraOutline, label: 'Face' },
            ].map(({ value, icon, label }) => (
              <button
                key={value}
                onClick={() => setMethod(value as any)}
                style={{
                  flex: 1,
                  background: method === value ? accentColor + '22' : '#0f172a',
                  border: `1px solid ${method === value ? accentColor : '#334155'}`,
                  borderRadius: 8,
                  padding: '10px 4px',
                  color: method === value ? accentColor : '#64748b',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}
              >
                <IonIcon icon={icon} style={{ fontSize: 22 }} />
                <span style={{ fontSize: 11 }}>{label}</span>
              </button>
            ))}
          </div>

          {method === 'qr' && (
            <div style={{ marginTop: 12, padding: 10, background: '#0f172a', borderRadius: 8, textAlign: 'center' }}>
              {qrVerified ? (
                <span style={{ color: '#10b981', fontSize: 13 }}>✓ QR code verified — tap button to submit</span>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 13 }}>Tap the button below to scan QR code</span>
              )}
            </div>
          )}

          {method === 'face' && (
            <div style={{ marginTop: 12, padding: 10, background: '#0f172a', borderRadius: 8, textAlign: 'center' }}>
              <span style={{ color: '#fbbf24', fontSize: 13 }}>Face recognition coming soon — use Manual for now</span>
            </div>
          )}
        </div>

        {error && <IonText color="danger"><p style={{ marginBottom: 12 }}>{error}</p></IonText>}

        <IonButton
          expand="block"
          onClick={handleCheckIn}
          disabled={loading || !selectedSite || (method === 'face')}
          style={{ '--background': accentColor, '--border-radius': '12px', height: 56, marginTop: 16 }}
        >
          {loading ? <IonSpinner name="crescent" /> : (
            <>
              <IonIcon icon={method === 'qr' && !qrVerified ? qrCodeOutline : checkmarkCircleOutline} slot="start" />
              {method === 'qr' && !qrVerified
                ? 'Scan QR Code'
                : isCheckIn ? 'Check In Now' : 'Check Out Now'}
            </>
          )}
        </IonButton>

        <QrScannerModal
          isOpen={scannerOpen}
          onScan={handleQrScan}
          onClose={() => setScannerOpen(false)}
          title={`Scan QR — ${isCheckIn ? 'Check In' : 'Check Out'}`}
        />

        <IonToast
          isOpen={success}
          onDidDismiss={() => { setSuccess(false); setGeofenceStatus(null) }}
          message={`${isCheckIn ? 'Checked in' : 'Checked out'} successfully!`}
          duration={3000}
          color="success"
        />
      </IonContent>
    </IonPage>
  )
}
