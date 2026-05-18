import React, { useState, useEffect, useRef } from 'react'
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
import { calendarOutline, locationOutline } from 'ionicons/icons'
import { registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation'
import { api } from '../services/api'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'primary',
  active: 'success',
  completed: 'medium',
  missed: 'danger',
}

function getActiveShift(shifts: any[]): any | null {
  const now = Date.now()
  return (
    shifts.find((s) => {
      const start = new Date(s.startsAt).getTime()
      const end = new Date(s.endsAt).getTime()
      return start <= now && now <= end
    }) ?? null
  )
}

export const ShiftsPage: React.FC = () => {
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState(false)
  // Holds the watcher ID returned by addWatcher so we can remove it later
  const watcherIdRef = useRef<string | null>(null)

  useEffect(() => {
    api.shifts.list()
      .then((res) => setShifts(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const active = getActiveShift(shifts)

    if (active) {
      startTracking(active.id)
    } else {
      stopTracking()
    }

    // Don't stop on unmount if a shift is active — tracking must survive tab switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts])

  async function startTracking(shiftId: string) {
    // Already watching — don't register a second watcher
    if (watcherIdRef.current !== null) return
    try {
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Arrow Security is tracking your location during your shift.',
          backgroundTitle: 'On Duty — Location Active',
          requestPermissions: true,
          stale: false,
          distanceFilter: 50, // metres moved before firing (battery optimisation)
        },
        async (position?: Location, error?: Error) => {
          if (error || !position) return
          try {
            await api.locations.track({
              latitude: position.latitude,
              longitude: position.longitude,
              accuracy: position.accuracy ?? undefined,
              // The Location type uses "bearing" (compass deviation from true north).
              // The API and DB column are named "heading" — map it here.
              heading: position.bearing ?? undefined,
              speed: position.speed ?? undefined,
              altitude: position.altitude ?? undefined,
              shiftId,
              recordedAt: new Date(position.time ?? Date.now()).toISOString(),
            })
          } catch {
            // Silently fail — offline; will retry on the next location event
          }
        }
      )
      watcherIdRef.current = id
      setTracking(true)
    } catch (err) {
      console.error('Background geolocation error:', err)
    }
  }

  async function stopTracking() {
    if (watcherIdRef.current !== null) {
      try {
        await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current })
      } catch {
        // ignore — may already be removed
      }
      watcherIdRef.current = null
    }
    setTracking(false)
  }

  const grouped = shifts.reduce<Record<string, any[]>>((acc, s) => {
    const date = new Date(s.startsAt).toDateString()
    if (!acc[date]) acc[date] = []
    acc[date].push(s)
    return acc
  }, {})

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonTitle>My Shifts</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }}>
        {tracking && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#10b98122', borderBottom: '1px solid #10b98144',
            padding: '8px 16px',
          }}>
            <IonIcon icon={locationOutline} style={{ color: '#10b981', fontSize: 16 }} />
            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 500 }}>
              On duty — background location active
            </span>
            <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          </div>
        )}

        {loading ? (
          <div className="ion-padding">
            {[...Array(4)].map((_, i) => (
              <IonSkeletonText key={i} animated style={{ height: 60, marginBottom: 8, borderRadius: 8 }} />
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <IonIcon icon={calendarOutline} style={{ fontSize: 64, color: '#e8e5e0' }} />
            <p style={{ color: '#9a9490' }}>No shifts scheduled</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, dayShifts]) => (
            <div key={date}>
              <div style={{ padding: '12px 16px 4px', color: '#c96442', fontWeight: 600, fontSize: 13 }}>
                {date === new Date().toDateString() ? 'Today' : date}
              </div>
              <IonList style={{ background: 'transparent', padding: '0 8px 8px' }}>
                {dayShifts.map((s) => (
                  <IonItem
                    key={s.id}
                    style={{ '--background': '#ffffff', '--color': '#1a1916', borderRadius: 8, marginBottom: 6 }}
                  >
                    <IonLabel>
                      <h2 style={{ color: '#1a1916' }}>
                        {new Date(s.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(s.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </h2>
                      {s.notes && <p style={{ color: '#9a9490' }}>{s.notes}</p>}
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
