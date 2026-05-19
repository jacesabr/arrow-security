import React, { useState, useEffect, useRef } from 'react'
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
import { checkmarkCircleOutline, locationOutline, cameraOutline } from 'ionicons/icons'
import { Geolocation } from '@capacitor/geolocation'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const CheckInPage: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const [sites, setSites] = useState<any[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [type, setType] = useState<'check_in' | 'check_out'>('check_in')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.sites.list().then((res) => setSites(res.data)).catch(() => null)
    Geolocation.getCurrentPosition({ enableHighAccuracy: true })
      .then((pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => null)
  }, [])

  const site = sites.find((s) => s.id === selectedSite)

  const distanceMeters: number | null =
    location && site?.latitude != null && site?.longitude != null
      ? Math.round(haversineMeters(location.lat, location.lng, site.latitude, site.longitude))
      : null

  const withinGeofence =
    distanceMeters !== null && site?.geofenceRadiusMeters != null
      ? distanceMeters <= site.geofenceRadiusMeters
      : null

  async function takeSelfie() {
    try {
      const photo = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
      })
      if (photo.dataUrl) setSelfieDataUrl(photo.dataUrl)
    } catch {
      // User cancelled or camera unavailable — fall back to file input
      fileInputRef.current?.click()
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setSelfieDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleCheckIn() {
    if (!selectedSite || !selfieDataUrl) return
    setLoading(true)
    setError(null)
    try {
      await api.attendance.checkIn({
        siteId: selectedSite,
        type,
        method: 'face',
        latitude: location?.lat,
        longitude: location?.lng,
      })
      setSuccess(true)
      setSelfieDataUrl(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isCheckIn = type === 'check_in'
  const accentColor = isCheckIn ? '#10b981' : '#ef4444'
  const canSubmit = !!selectedSite && !!selfieDataUrl && !loading

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonTitle>Check In / Out</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }} className="ion-padding">
        {/* Type toggle */}
        <IonSegment
          value={type}
          onIonChange={(e) => setType(e.detail.value as 'check_in' | 'check_out')}
          style={{ marginBottom: 20, '--background': '#f4f2ef' }}
        >
          <IonSegmentButton value="check_in"><IonLabel>Check In</IonLabel></IonSegmentButton>
          <IonSegmentButton value="check_out"><IonLabel>Check Out</IonLabel></IonSegmentButton>
        </IonSegment>

        {/* Location */}
        <div style={{ background: '#ffffff', borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IonIcon icon={locationOutline} style={{ color: location ? '#10b981' : '#9a9490', fontSize: 20, flexShrink: 0 }} />
          {location ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              {distanceMeters !== null ? (
                <span style={{ color: withinGeofence ? '#10b981' : '#f59e0b', fontSize: 14, fontWeight: 500 }}>
                  {distanceMeters < 1000
                    ? `${distanceMeters} m from ${site?.name ?? 'site'}`
                    : `${(distanceMeters / 1000).toFixed(1)} km from ${site?.name ?? 'site'}`}
                  {withinGeofence !== null && (
                    <span style={{ color: '#9a9490', fontWeight: 400 }}>
                      {withinGeofence ? ' · In zone' : ' · Out of zone'}
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ color: '#10b981', fontSize: 14 }}>Location acquired</span>
              )}
            </div>
          ) : (
            <span style={{ color: '#9a9490', fontSize: 14 }}>Getting location…</span>
          )}
        </div>

        {/* Site selector */}
        <div style={{ background: '#ffffff', borderRadius: 8, padding: 4, marginBottom: 12 }}>
          <IonItem lines="none" style={{ '--background': 'transparent' }}>
            <IonLabel style={{ color: '#5c5855' }}>Site</IonLabel>
            <IonSelect
              value={selectedSite}
              onIonChange={(e) => setSelectedSite(e.detail.value)}
              placeholder="Select site"
              style={{ '--color': '#1a1916' }}
              interface="action-sheet"
            >
              {sites.map((s) => (
                <IonSelectOption key={s.id} value={s.id}>{s.name}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        </div>

        {/* Selfie capture */}
        <div style={{ background: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: '#5c5855', margin: '0 0 12px', fontSize: 13.5, fontWeight: 500 }}>
            Selfie — uniform &amp; appearance check
          </p>
          {selfieDataUrl ? (
            <div style={{ textAlign: 'center' }}>
              <img
                src={selfieDataUrl}
                alt="Selfie preview"
                style={{ width: '100%', maxWidth: 240, borderRadius: 10, marginBottom: 10, objectFit: 'cover', aspectRatio: '1' }}
              />
              <button
                onClick={() => setSelfieDataUrl(null)}
                style={{
                  display: 'block', width: '100%', marginTop: 4,
                  background: 'none', border: '1px solid #e8e5e0',
                  borderRadius: 8, padding: '8px 0',
                  color: '#9a9490', fontSize: 13, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Retake
              </button>
            </div>
          ) : (
            <button
              onClick={takeSelfie}
              style={{
                width: '100%',
                background: '#fafaf9',
                border: '1.5px dashed #e8e5e0',
                borderRadius: 10,
                padding: '28px 0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                cursor: 'pointer', color: '#9a9490',
                fontFamily: 'inherit',
              }}
            >
              <IonIcon icon={cameraOutline} style={{ fontSize: 36, color: '#c96442' }} />
              <span style={{ fontSize: 14, color: '#5c5855' }}>Take Selfie</span>
              <span style={{ fontSize: 12, color: '#9a9490' }}>Face forward, uniform visible</span>
            </button>
          )}
          {/* Hidden file input fallback */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>

        {error && <IonText color="danger"><p style={{ marginBottom: 12 }}>{error}</p></IonText>}

        <IonButton
          expand="block"
          onClick={handleCheckIn}
          disabled={!canSubmit}
          style={{ '--background': accentColor, '--border-radius': '12px', height: 56, marginTop: 4 }}
        >
          {loading ? <IonSpinner name="crescent" /> : (
            <>
              <IonIcon icon={checkmarkCircleOutline} slot="start" />
              {isCheckIn ? 'Check In Now' : 'Check Out Now'}
            </>
          )}
        </IonButton>

        <IonToast
          isOpen={success}
          onDidDismiss={() => setSuccess(false)}
          message={`${isCheckIn ? 'Checked in' : 'Checked out'} successfully!`}
          duration={3000}
          color="success"
        />
      </IonContent>
    </IonPage>
  )
}
