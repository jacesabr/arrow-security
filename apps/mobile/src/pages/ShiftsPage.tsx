import React, { useState, useEffect, useRef } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonSkeletonText,
  IonIcon,
  IonAlert,
} from '@ionic/react'
import { calendarOutline, locationOutline } from 'ionicons/icons'
import { registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation'
import { useHistory } from 'react-router-dom'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  scheduled: { bg: 'rgba(245,158,11,0.10)', color: '#92400e', label: 'Scheduled' },
  active:    { bg: 'rgba(16,185,129,0.12)', color: '#065f46', label: 'Active' },
  completed: { bg: 'rgba(92,88,85,0.10)',   color: '#5c5855', label: 'Completed' },
  missed:    { bg: 'rgba(239,68,68,0.10)',  color: '#b91c1c', label: 'Missed' },
  // Terminal state set by the server when a guard went off-site mid-shift.
  // Treated like missed visually but worded clearly so the guard understands.
  abandoned: { bg: 'rgba(201,100,66,0.12)', color: '#9a3412', label: 'Abandoned' },
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function hoursWorked(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime()
  return ms > 0 ? ms / 3_600_000 : 0
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
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
  // Set when the server force-ends the shift because the guard went off-site.
  // Drives an alert dialog that, on dismissal, completes the logout.
  const [abandonedAlert, setAbandonedAlert] = useState<boolean>(false)
  // Holds the watcher ID returned by addWatcher so we can remove it later
  const watcherIdRef = useRef<string | null>(null)
  // Guarantees we only run the abandon teardown once even if a queued ping
  // arrives after the watcher has been removed.
  const abandonedHandledRef = useRef(false)
  const history = useHistory()
  const logout = useAuthStore((s) => s.logout)

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
            const res = await api.locations.track({
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

            // Server side-effect: when this ping crosses the off-site hysteresis
            // threshold, the API abandons the shift and signals us to force-log
            // the guard out. Do this exactly once.
            if (res.shiftAbandoned && !abandonedHandledRef.current) {
              abandonedHandledRef.current = true
              await stopTracking()
              setAbandonedAlert(true)
            }
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

  // Newest first; the API already orders that way but defend against changes.
  const ordered = [...shifts].sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  )

  type MonthlyRollup = { hours: number }
  const monthlyTotals = ordered.reduce<Record<string, MonthlyRollup>>((acc, s) => {
    const key = monthKey(s.startsAt)
    const row = acc[key] ?? { hours: 0 }
    row.hours += hoursWorked(s.checkInAt, s.checkOutAt)
    acc[key] = row
    return acc
  }, {})
  const monthKeysOrdered = Object.keys(monthlyTotals)
    .filter(k => monthlyTotals[k].hours > 0)
    .sort().reverse()
  const currentMonthKey = monthKey(new Date().toISOString())

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
        ) : ordered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <IonIcon icon={calendarOutline} style={{ fontSize: 64, color: '#e8e5e0' }} />
            <p style={{ color: '#9a9490' }}>No shifts scheduled</p>
          </div>
        ) : (
          <div style={{ padding: '14px 14px 24px' }}>
            {/* Shifts table */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e8e5e0',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 16,
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#fafaf9' }}>
                    {['Date', 'Site', 'Clock in', 'Clock out'].map(h => (
                      <th key={h} style={{
                        padding: '10px 8px',
                        textAlign: 'left',
                        color: '#9a9490',
                        fontWeight: 600,
                        fontSize: 11,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        borderBottom: '1px solid #e8e5e0',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordered.map(s => {
                    const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.scheduled
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f0ede8' }}>
                        <td style={{ padding: '11px 8px', color: '#1a1916', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          <div>{fmtDate(s.startsAt)}</div>
                          <div style={{ marginTop: 3 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600,
                              padding: '1px 7px', borderRadius: 10,
                              background: badge.bg, color: badge.color,
                            }}>{badge.label}</span>
                          </div>
                        </td>
                        <td style={{ padding: '11px 8px', color: '#5c5855' }}>{s.siteName ?? '—'}</td>
                        <td style={{ padding: '11px 8px', color: s.checkInAt ? '#1a1916' : '#9a9490' }}>
                          {fmtTime(s.checkInAt)}
                        </td>
                        <td style={{ padding: '11px 8px', color: s.checkOutAt ? '#1a1916' : '#9a9490' }}>
                          {fmtTime(s.checkOutAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Monthly totals */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e8e5e0',
              borderRadius: 12,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '11px 14px',
                borderBottom: '1px solid #e8e5e0',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#9a9490',
              }}>Hours by month</div>
              {monthKeysOrdered.length === 0 ? (
                <div style={{ padding: '14px', color: '#9a9490', fontSize: 13 }}>
                  No completed shifts yet — clock in and out to log hours.
                </div>
              ) : monthKeysOrdered.map(key => {
                const isCurrent = key === currentMonthKey
                const r = monthlyTotals[key]
                return (
                  <div key={key} style={{
                    padding: '11px 14px',
                    borderBottom: '1px solid #f5f4f2',
                    background: isCurrent ? 'rgba(201,100,66,0.04)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: isCurrent ? 600 : 500,
                        color: isCurrent ? '#c96442' : '#1a1916',
                      }}>
                        {monthLabel(key)}{isCurrent && <span style={{ marginLeft: 8, fontSize: 11, color: '#9a9490', fontWeight: 500 }}>(this month)</span>}
                      </div>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: isCurrent ? '#c96442' : '#1a1916',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {r.hours.toFixed(1)}h
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </IonContent>

      {/* Off-site auto-logout alert.
          Server marked this shift `abandoned` because the guard left the
          site geofence for >60s. The alert is deliberately vague — guards
          must not learn the off-site rule (they'd just leave their phone
          on the desk and wander off). They're told to contact their
          supervisor, who knows the real reason. */}
      <IonAlert
        isOpen={abandonedAlert}
        backdropDismiss={false}
        header="Shift ended"
        message="Your shift has ended early. Please contact your supervisor before your next shift. You'll need to sign in again."
        buttons={[
          {
            text: 'OK',
            handler: () => {
              setAbandonedAlert(false)
              logout()
              history.replace('/login')
            },
          },
        ]}
      />
    </IonPage>
  )
}
