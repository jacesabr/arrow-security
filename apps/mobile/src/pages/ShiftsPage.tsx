import React, { useState, useEffect, useRef } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonSkeletonText,
  IonIcon,
} from '@ionic/react'
import { calendarOutline, locationOutline } from 'ionicons/icons'
import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation'
import { ActivityRecognition, type ActivityTransitionEvent } from '@secureops/capacitor-activity-recognition'
import { api } from '../services/api'
import { useActivityStore } from '../store/activity'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  scheduled: { bg: 'rgba(245,158,11,0.10)', color: '#92400e', label: 'Scheduled' },
  active:    { bg: 'rgba(16,185,129,0.12)', color: '#065f46', label: 'Active' },
  completed: { bg: 'rgba(92,88,85,0.10)',   color: '#5c5855', label: 'Completed' },
  missed:    { bg: 'rgba(239,68,68,0.10)',  color: '#b91c1c', label: 'Missed' },
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

function fmtMovement(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = m / 60
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`
}

// Small stacked bar used in the shifts table + monthly rollup. Matches the
// colours used in the Patrol test panel + tenant /reports so a guard sees a
// consistent green/blue/tan story across surfaces.
const MOVEMENT_COLORS = { walking: '#10b981', driving: '#3b82f6', idle: '#d4a574' }

function MovementBar({
  walking, driving, idle, width = 70, height = 6,
}: { walking: number; driving: number; idle: number; width?: number; height?: number }) {
  const total = walking + driving + idle
  if (total === 0) {
    return <div style={{ width, height, borderRadius: height / 2, background: '#ebe8e2' }} />
  }
  return (
    <div title={`walking ${Math.round(walking)}s · driving ${Math.round(driving)}s · idle ${Math.round(idle)}s`}
      style={{ display: 'flex', width, height, borderRadius: height / 2, overflow: 'hidden', background: '#ebe8e2' }}>
      <div style={{ width: `${(walking / total) * 100}%`, background: MOVEMENT_COLORS.walking }} />
      <div style={{ width: `${(driving / total) * 100}%`, background: MOVEMENT_COLORS.driving }} />
      <div style={{ width: `${(idle    / total) * 100}%`, background: MOVEMENT_COLORS.idle }} />
    </div>
  )
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
  // Listener subscription for Activity Recognition transitions
  const activityListenerRef = useRef<PluginListenerHandle | null>(null)

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

    // Start activity recognition first — it's independent of GPS and survives
    // a GPS failure. Errors are non-fatal: classifier falls back to speed-only.
    if (activityListenerRef.current === null) {
      try {
        activityListenerRef.current = await ActivityRecognition.addListener(
          'activityTransition',
          (event: ActivityTransitionEvent) => useActivityStore.getState().setFromEvent(event),
        )
        await ActivityRecognition.start()
      } catch (e) {
        console.warn('Activity Recognition unavailable:', e)
      }
    }

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
          // Read the latest device activity snapshot. Stale samples (older than
          // ~3 min) are ignored — better to omit than to mislead the classifier.
          const a = useActivityStore.getState()
          const fresh = a.timestamp > 0 && Date.now() - a.timestamp < 180_000
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
              activityType: fresh ? a.activity : undefined,
              activityConfidence: fresh ? a.confidence : undefined,
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
    if (activityListenerRef.current !== null) {
      try { await activityListenerRef.current.remove() } catch { /* ignore */ }
      activityListenerRef.current = null
    }
    try { await ActivityRecognition.stop() } catch { /* ignore */ }
    useActivityStore.getState().clear()
    setTracking(false)
  }

  // Newest first; the API already orders that way but defend against changes.
  const ordered = [...shifts].sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  )

  // Roll up by calendar month (1st → last day). Tracks both hours-worked
  // (from check-in/out timestamps) and walking / driving / idle totals (from
  // the per-shift movement aggregates computed when each shift completed).
  type MonthlyRollup = { hours: number; walking: number; driving: number; idle: number }
  const monthlyTotals = ordered.reduce<Record<string, MonthlyRollup>>((acc, s) => {
    const key = monthKey(s.startsAt)
    const row = acc[key] ?? { hours: 0, walking: 0, driving: 0, idle: 0 }
    row.hours    += hoursWorked(s.checkInAt, s.checkOutAt)
    row.walking  += s.walkingSeconds ?? 0
    row.driving  += s.drivingSeconds ?? 0
    row.idle     += s.idleSeconds    ?? 0
    acc[key] = row
    return acc
  }, {})
  // Show every month that has either hours or movement (a completed shift
  // with no clock-out still has movement data worth showing).
  const monthKeysOrdered = Object.keys(monthlyTotals)
    .filter(k => {
      const r = monthlyTotals[k]
      return r.hours > 0 || r.walking + r.driving + r.idle > 0
    })
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
                    {['Date', 'Site', 'Clock in', 'Clock out', 'Movement'].map(h => (
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
                    const walking = s.walkingSeconds ?? 0
                    const driving = s.drivingSeconds ?? 0
                    const idle    = s.idleSeconds    ?? 0
                    const trackedTotal = walking + driving + idle
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
                        <td style={{ padding: '11px 8px' }}>
                          {trackedTotal === 0 ? (
                            <span style={{ color: '#9a9490', fontSize: 11 }}>—</span>
                          ) : (
                            <>
                              <MovementBar walking={walking} driving={driving} idle={idle} />
                              <div style={{ fontSize: 10.5, color: '#9a9490', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                                {fmtMovement(trackedTotal)}
                              </div>
                            </>
                          )}
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
                const movementTotal = r.walking + r.driving + r.idle
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
                    {movementTotal > 0 && (
                      <>
                        <div style={{ marginTop: 8 }}>
                          <MovementBar walking={r.walking} driving={r.driving} idle={r.idle} width={'100%' as any} height={7} />
                        </div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', gap: 8,
                          marginTop: 5, fontSize: 11, color: '#5c5855', fontVariantNumeric: 'tabular-nums',
                        }}>
                          <span><span style={{ width: 7, height: 7, borderRadius: 3.5, background: MOVEMENT_COLORS.walking, display: 'inline-block', marginRight: 4 }} />walking {fmtMovement(r.walking)}</span>
                          <span><span style={{ width: 7, height: 7, borderRadius: 3.5, background: MOVEMENT_COLORS.driving, display: 'inline-block', marginRight: 4 }} />driving {fmtMovement(r.driving)}</span>
                          <span><span style={{ width: 7, height: 7, borderRadius: 3.5, background: MOVEMENT_COLORS.idle,    display: 'inline-block', marginRight: 4 }} />idle {fmtMovement(r.idle)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </IonContent>
    </IonPage>
  )
}
