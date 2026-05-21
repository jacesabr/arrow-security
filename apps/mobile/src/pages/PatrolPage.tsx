import React, { useState, useEffect, useRef } from 'react'
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
import { walkOutline, flaskOutline } from 'ionicons/icons'
import { IonIcon } from '@ionic/react'
import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation'
import { ActivityRecognition, type ActivityTransitionEvent, type ActivityType } from '@secureops/capacitor-activity-recognition'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

/* ─── Test movement tracking ────────────────────────────────────────────── */
//
// Exercises the GPS + activity-recognition pipeline without needing a real
// shift. Useful when:
//   - a fresh tenant has no sites yet
//   - we want to verify walking / driving / still classification on a device
//   - troubleshooting why a guard's movement stats look wrong
//
// Counters live on-device — no DB writes for the test session, so nothing
// orphans in `guard_locations`. The user can walk around for a minute, drive
// around for a minute, and verify the buckets fill correctly.

type Bucket = 'walking' | 'driving' | 'idle'

function bucketFor(a: ActivityType): Bucket | null {
  if (a === 'walking' || a === 'running') return 'walking'
  if (a === 'vehicle' || a === 'bicycle') return 'driving'
  if (a === 'still') return 'idle'
  return null
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec - m * 60)
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

// Length of the live strip in seconds — long enough to see a few transitions,
// short enough not to feel laggy when you start moving.
const STRIP_SECONDS = 60

// Classifier is now thin: trust Google's Activity Recognition (we switched
// the Kotlin plugin from requestActivityTransitionUpdates → requestActivity
// Updates, so samples arrive every ~5s with a calibrated 0-100 confidence
// per detected activity). All we layer on top is:
//   - a confidence floor so low-confidence samples don't flap the bucket
//   - a GPS-staleness override (no GPS movement for 15s → idle, period)
//   - hysteresis so a single weird sample doesn't flip the credited bucket
//
// No more percentile math, no σ, no adaptive baseline. Removing those got
// rid of two compounding bug classes (real walks rejected by σ floor, and
// the classifier locking itself out via baseline drift).
const CONFIDENCE_FLOOR   = 50      // < this confidence → sample ignored
const ACTIVITY_STALE_MS  = 30_000  // no Activity Recognition sample for this long → fall back to GPS
const GPS_STALE_MS       = 15_000  // no GPS sample for this long → idle override
const HYSTERESIS_UP_MS   = 6_000   // idle → walking → driving takes 6s of sustained candidate
const HYSTERESIS_DOWN_MS = 2_000   // demoting to a less-energetic bucket is faster
const BLIP_MAX_MS        = 60_000  // X → Y → X blips shorter than this get reassigned to X

type SpeedSample = { ts: number; speed: number }

const TestMovementCard: React.FC = () => {
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0) // forces re-render every second so counters + strip tick visibly
  const [current, setCurrent] = useState<Bucket | 'unknown'>('unknown')
  const [confidence, setConfidence] = useState(0)
  const [pings, setPings] = useState(0)
  const [lastPos, setLastPos] = useState<{ lat: number; lng: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lastActivityAt, setLastActivityAt] = useState(0)
  const [lastActivity, setLastActivity] = useState<string>('—')

  // Hysteresis state — a candidate bucket must hold steady for HYSTERESIS_MS
  // before we actually flip the credited bucket. Prevents single-sample flaps.
  const pendingBucketRef = useRef<Bucket | null>(null)
  const pendingSinceRef = useRef<number>(0)
  // History of committed bucket entries — drives retroactive blip correction.
  const bucketHistoryRef = useRef<{ bucket: Bucket; startedAt: number }[]>([])

  // Accumulators (refs so we don't trigger renders for every micro-update)
  const accRef = useRef<{ walking: number; driving: number; idle: number }>({ walking: 0, driving: 0, idle: 0 })
  const lastBucketRef = useRef<Bucket | null>(null)
  const lastChangeRef = useRef<number>(0)
  // What Activity Recognition last reported (high-confidence only). Cleared
  // when stale so the bucket falls back to the GPS-staleness override.
  const sensorBucketRef = useRef<Bucket | null>(null)
  const sensorAtRef = useRef<number>(0)
  // Most recent GPS sample timestamp — the safety net for "phone actually moved"
  const lastGpsAtRef = useRef<number>(0)
  // Live time-series strip — one entry per second of the test session
  const stripRef = useRef<(Bucket | 'unknown')[]>([])
  const watcherIdRef = useRef<string | null>(null)
  const listenerRef = useRef<PluginListenerHandle | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function applyBucket(newBucket: Bucket | null, now: number) {
    const prev = lastBucketRef.current
    if (prev) {
      const duration = (now - lastChangeRef.current) / 1000
      const history = bucketHistoryRef.current
      const last = history[history.length - 1]  // bucket BEFORE prev (prev not yet pushed)
      const isBlip =
        newBucket !== null &&
        last !== undefined &&
        last.bucket === newBucket &&        // we're returning to the bucket we were in before prev
        (now - lastChangeRef.current) < BLIP_MAX_MS

      if (isBlip) {
        // Reassign prev's seconds to the surrounding bucket — that whole
        // period was almost certainly sensor noise.
        accRef.current[newBucket as Bucket] += duration
        // Don't add prev to history; the surrounding bucket is conceptually
        // unbroken.
      } else {
        accRef.current[prev] += duration
        if (!last || last.bucket !== prev) {
          history.push({ bucket: prev, startedAt: lastChangeRef.current })
        }
      }
    }
    lastBucketRef.current = newBucket
    lastChangeRef.current = now
    setCurrent(newBucket ?? 'unknown')
  }

  // Decides the candidate bucket from current sensor state + GPS-staleness
  // override. Activity Recognition is the primary source; GPS only intervenes
  // to say "this phone hasn't actually moved — ignore the sensor".
  function effectiveBucket(now: number): Bucket | null {
    const gpsStale = now - lastGpsAtRef.current > GPS_STALE_MS
    // Phone hasn't moved 20m in the past 15s → no possible walking/driving
    // regardless of what Activity Recognition claims.
    if (gpsStale) return 'idle'
    const sensorStale = now - sensorAtRef.current > ACTIVITY_STALE_MS
    if (sensorStale) {
      // No fresh Activity Recognition sample. We have GPS movement but can't
      // distinguish walking from driving without the sensor — hold pending.
      return null
    }
    return sensorBucketRef.current
  }

  // Commit a candidate bucket if it has held steady through the appropriate
  // hysteresis window. Asymmetric: going UP (idle → walking → driving) takes
  // longer than going DOWN, because the cost of a false positive (claiming
  // someone is walking when they're sitting) is much higher than a false
  // negative.
  function maybeCommitBucket(candidate: Bucket | null, now: number) {
    // A null candidate means "I have no opinion right now" (e.g., not enough
    // GPS samples yet). DON'T reset the hysteresis countdown — keep whatever
    // pending state we had. Otherwise a single-sample dropout would erase
    // 5+ seconds of building "walking" confidence.
    if (candidate === null) return

    if (candidate === lastBucketRef.current) {
      pendingBucketRef.current = null
      pendingSinceRef.current = 0
      return
    }
    // First classification after a 'null' bucket — only auto-commit if the
    // landing bucket is idle. Otherwise let the UP-hysteresis gate apply so a
    // one-shot phantom sensor event can't seed walking instantly at startup.
    if (lastBucketRef.current === null && candidate === 'idle') {
      applyBucket(candidate, now)
      pendingBucketRef.current = null
      pendingSinceRef.current = 0
      return
    }
    if (candidate !== pendingBucketRef.current) {
      pendingBucketRef.current = candidate
      pendingSinceRef.current = now
      return
    }
    const goingUp = bucketRank(candidate) > bucketRank(lastBucketRef.current)
    const needed = goingUp ? HYSTERESIS_UP_MS : HYSTERESIS_DOWN_MS
    if (now - pendingSinceRef.current >= needed) {
      applyBucket(candidate, now)
      pendingBucketRef.current = null
      pendingSinceRef.current = 0
    }
  }

  // Higher = more "energetic" bucket. idle < walking < driving.
  // null is treated as lowest so promoting from "no opinion" still counts as UP.
  function bucketRank(b: Bucket | null): number {
    if (b === 'driving') return 2
    if (b === 'walking') return 1
    return 0
  }

  async function start() {
    setErr(null)
    accRef.current = { walking: 0, driving: 0, idle: 0 }
    lastBucketRef.current = null
    sensorBucketRef.current = null
    sensorAtRef.current = 0
    lastGpsAtRef.current = Date.now()  // give us the staleness grace period at start
    lastChangeRef.current = Date.now()
    stripRef.current = []
    bucketHistoryRef.current = []
    pendingBucketRef.current = null
    pendingSinceRef.current = 0
    setPings(0)
    setLastPos(null)
    setConfidence(0)
    setLastActivityAt(0)
    setLastActivity('—')
    setRunning(true)

    // 1s ticker — drives the elapsed display, the live counters, the strip,
    // AND the GPS-based reconciliation. Reconciling every second means a
    // phantom sensor classification gets corrected within ~1s of GPS speed
    // showing stillness, rather than running forever.
    intervalRef.current = setInterval(() => {
      const now = Date.now()
      const candidate = effectiveBucket(now)
      maybeCommitBucket(candidate, now)
      stripRef.current.push(lastBucketRef.current ?? 'unknown')
      if (stripRef.current.length > STRIP_SECONDS) stripRef.current.shift()
      setTick(t => t + 1)
    }, 1000)

    try {
      listenerRef.current = await ActivityRecognition.addListener(
        'activityTransition',
        (e: ActivityTransitionEvent) => {
          const conf = e.confidence ?? 0
          setConfidence(conf)
          setLastActivity(e.activity)
          setLastActivityAt(Date.now())
          // Drop low-confidence samples — keep the previous verdict. The OS
          // sometimes reports "still: 35" and we'd rather hold than flap.
          if (conf < CONFIDENCE_FLOOR) return
          sensorBucketRef.current = bucketFor(e.activity)
          sensorAtRef.current = Date.now()
        },
      )
      await ActivityRecognition.start()
    } catch (e: any) {
      // Activity Recognition unavailable (browser, simulator without plugin)
      // — still exercise GPS; bucket detection just stays 'unknown'.
      console.warn('ActivityRecognition unavailable:', e?.message ?? e)
    }

    try {
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Test movement tracking — Arrow Security',
          backgroundTitle: 'Test Mode',
          requestPermissions: true,
          stale: false,
          distanceFilter: 20, // tighter than a real shift so the test feels live
        },
        (position?: Location, error?: Error) => {
          if (error) { setErr(error.message); return }
          if (!position) return
          setPings(p => p + 1)
          setLastPos({ lat: position.latitude, lng: position.longitude })
          // Every GPS callback means the phone has moved at least distanceFilter
          // metres (configured below). We just track WHEN — speed values aren't
          // used by the classifier any more, but a fresh GPS sample tells us
          // the phone is moving, which is the signal we override with.
          lastGpsAtRef.current = Date.now()
        },
      )
      watcherIdRef.current = id
    } catch (e: any) {
      setErr(e?.message ?? 'Unable to start GPS')
      setRunning(false)
    }
  }

  async function stop() {
    // Flush the time spent in the current bucket up to now
    applyBucket(null, Date.now())

    if (watcherIdRef.current) {
      try { await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current }) } catch { /* ignore */ }
      watcherIdRef.current = null
    }
    if (listenerRef.current) {
      try { await listenerRef.current.remove() } catch { /* ignore */ }
      listenerRef.current = null
    }
    try { await ActivityRecognition.stop() } catch { /* ignore */ }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setRunning(false)
  }

  // Cleanup on unmount — don't leave a watcher running if the user navigates away
  useEffect(() => () => { stop() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live values include the in-flight bucket's elapsed time since last change
  const live = (() => {
    const out = { ...accRef.current }
    const b = lastBucketRef.current
    if (running && b) out[b] += (Date.now() - lastChangeRef.current) / 1000
    return out
  })()
  void tick // ensures re-render every second

  const total = live.walking + live.driving + live.idle
  const pct = (n: number) => total === 0 ? 0 : (n / total) * 100

  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12,
      padding: '18px 18px 22px', textAlign: 'left',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <IonIcon icon={flaskOutline} style={{ color: '#3b82f6', fontSize: 18 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1916' }}>Test movement tracking</span>
      </div>
      <p style={{ color: '#5c5855', fontSize: 12, lineHeight: 1.5, margin: '0 0 14px' }}>
        Walk, drive, then stop somewhere — make sure each bucket fills. Nothing is saved to the server; this only exercises the device pipeline.
      </p>

      {running && (
        <>
          {/* Stacked totals — quick "where am I at" glance */}
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#ebe8e2', marginBottom: 10 }}>
            <div style={{ width: `${pct(live.walking)}%`, background: '#10b981', transition: 'width 0.4s' }} />
            <div style={{ width: `${pct(live.driving)}%`, background: '#3b82f6', transition: 'width 0.4s' }} />
            <div style={{ width: `${pct(live.idle)}%`,    background: '#d4a574', transition: 'width 0.4s' }} />
          </div>

          {/* Live timeline — each cell is 1s, oldest on the left, newest on the right.
              Lets you actually see classification flip in real time. */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#9a9490', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
              Live timeline (last {STRIP_SECONDS}s)
            </div>
            <div style={{
              display: 'flex', gap: 1, height: 18, borderRadius: 4, overflow: 'hidden',
              background: '#f4f2ef', border: '1px solid #ebe8e2',
            }}>
              {Array.from({ length: STRIP_SECONDS }, (_, i) => {
                // Right-align: latest sample at the rightmost cell
                const idx = stripRef.current.length - STRIP_SECONDS + i
                const v = idx >= 0 ? stripRef.current[idx] : null
                const bg =
                  v === 'walking' ? '#10b981' :
                  v === 'driving' ? '#3b82f6' :
                  v === 'idle'    ? '#d4a574' :
                                    'transparent'
                return <div key={i} style={{ flex: 1, background: bg, transition: 'background 0.2s' }} />
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9a9490', marginTop: 3 }}>
              <span>-{STRIP_SECONDS}s</span><span>now →</span>
            </div>
          </div>

          {/* Bucket totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <Bucket label="Walking" color="#10b981" seconds={live.walking} active={current === 'walking'} />
            <Bucket label="Driving" color="#3b82f6" seconds={live.driving} active={current === 'driving'} />
            <Bucket label="Idle"    color="#d4a574" seconds={live.idle}    active={current === 'idle'} />
          </div>

          {/* Live classification details — exposes WHY a bucket is filling.
              If confidence is low / sample is stale, the phone isn't giving us a
              reliable read and we shouldn't trust the count. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9a9490', marginBottom: 8 }}>
            <span>
              Current: <strong style={{ color: current === 'unknown' ? '#9a9490' : '#1a1916' }}>{current}</strong>
              {confidence > 0 && (
                <span style={{ marginLeft: 6, color: confidence >= CONFIDENCE_FLOOR ? '#10b981' : '#f59e0b' }}>
                  ({confidence}%)
                </span>
              )}
            </span>
            <span>{pings} GPS ping{pings === 1 ? '' : 's'}</span>
          </div>
          {/* Show-your-work line — what the OS just reported + how stale it is */}
          <div style={{ fontSize: 10.5, color: '#9a9490', fontFamily: 'ui-monospace,monospace', marginBottom: 8, lineHeight: 1.5 }}>
            OS sample: <span style={{ color: '#5c5855' }}>{lastActivity}</span>
            {confidence > 0 && (
              <span style={{ marginLeft: 4, color: confidence >= CONFIDENCE_FLOOR ? '#10b981' : '#f59e0b' }}>
                ({confidence}%)
              </span>
            )}
            {lastActivityAt > 0 && (
              <> · {Math.max(0, Math.floor((Date.now() - lastActivityAt) / 1000))}s ago</>
            )}
          </div>
          {lastPos && (
            <div style={{ fontSize: 10.5, color: '#9a9490', fontFamily: 'ui-monospace,monospace', marginBottom: 12 }}>
              {lastPos.lat.toFixed(5)}, {lastPos.lng.toFixed(5)}
            </div>
          )}
        </>
      )}

      {err && (
        <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 10 }}>{err}</div>
      )}

      <IonButton
        expand="block"
        onClick={running ? stop : start}
        style={{
          '--background': running ? '#ef4444' : '#3b82f6',
          '--border-radius': '10px',
          marginTop: 0,
        }}
      >
        {running ? 'Stop test' : 'Start test'}
      </IonButton>
    </div>
  )
}

function Bucket({ label, color, seconds, active }: { label: string; color: string; seconds: number; active: boolean }) {
  return (
    <div style={{
      background: active ? `${color}14` : '#fafaf9',
      border: `1px solid ${active ? color : '#e8e5e0'}`,
      borderRadius: 8, padding: '8px 10px',
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
        <span style={{ fontSize: 10.5, color: '#5c5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1916', fontVariantNumeric: 'tabular-nums' }}>
        {fmtSec(seconds)}
      </div>
    </div>
  )
}

/* ─── Monthly activity log ────────────────────────────────────────────── */
//
// Pulls the current user's per-month stats from /api/guard-stats/:userId
// (the backend now allows self-query for any role). Shows walking /
// driving / idle as a stacked bar + per-bucket totals, plus a per-shift
// breakdown for the chosen month.

function monthKeyToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
function recentMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date(); d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}
function fmtHoursOrMin(seconds: number): string {
  if (seconds < 60) return '0h'
  const h = seconds / 3600
  return h >= 10 ? `${h.toFixed(0)}h` : `${h.toFixed(1)}h`
}

const MOVE_COLORS = { walking: '#10b981', driving: '#3b82f6', idle: '#d4a574' }

const MyActivityLog: React.FC<{ userId: string }> = ({ userId }) => {
  const [month, setMonth] = useState<string>(monthKeyToday())
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.guardStats.get(userId, { month })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [userId, month])

  const summary = data?.summary
  const shifts = data?.shifts ?? []
  const tracked = summary
    ? (summary.walkingSeconds ?? 0) + (summary.drivingSeconds ?? 0) + (summary.idleSeconds ?? 0)
    : 0

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12, padding: '16px 16px 18px', marginBottom: 16, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916', letterSpacing: '-0.01em' }}>
            My activity — {monthLabel(month)}
          </div>
          <div style={{ fontSize: 11.5, color: '#9a9490', marginTop: 2 }}>
            Walking / driving / idle, accumulated from every shift this month.
          </div>
        </div>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{
            padding: '6px 9px', borderRadius: 6, border: '1px solid #e8e5e0',
            background: '#fff', fontSize: 12, color: '#1a1916',
          }}
        >
          {recentMonths(12).map(k => (
            <option key={k} value={k}>{monthLabel(k)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ color: '#9a9490', fontSize: 13 }}>Loading…</div>
      ) : !summary || tracked === 0 ? (
        <div style={{ color: '#9a9490', fontSize: 13 }}>No tracked activity yet for this month.</div>
      ) : (
        <>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#ebe8e2', marginBottom: 14 }}>
            <div style={{ width: `${(summary.walkingSeconds / tracked) * 100}%`, background: MOVE_COLORS.walking }} />
            <div style={{ width: `${(summary.drivingSeconds / tracked) * 100}%`, background: MOVE_COLORS.driving }} />
            <div style={{ width: `${(summary.idleSeconds    / tracked) * 100}%`, background: MOVE_COLORS.idle }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <ActivityCell color={MOVE_COLORS.walking} label="Walking" value={fmtHoursOrMin(summary.walkingSeconds)} />
            <ActivityCell color={MOVE_COLORS.driving} label="Driving" value={fmtHoursOrMin(summary.drivingSeconds)} />
            <ActivityCell color={MOVE_COLORS.idle}    label="Idle"    value={fmtHoursOrMin(summary.idleSeconds)} />
          </div>
          <div style={{ fontSize: 11.5, color: '#9a9490', textAlign: 'center', marginBottom: shifts.length > 0 ? 14 : 0 }}>
            {summary.shiftsCompleted} completed · {summary.shiftsMissed} missed · {fmtHoursOrMin(summary.workedSeconds ?? 0)} worked
          </div>
          {shifts.length > 0 && (
            <div style={{ borderTop: '1px solid #f0ede8', paddingTop: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9a9490', marginBottom: 8 }}>
                Shifts this month ({shifts.length})
              </div>
              {shifts.slice(0, 12).map((s: any) => {
                const tr = (s.walkingSeconds ?? 0) + (s.drivingSeconds ?? 0) + (s.idleSeconds ?? 0)
                return (
                  <div key={s.shiftId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f5f4f2', fontSize: 11.5 }}>
                    <div style={{ minWidth: 50, color: '#1a1916', fontWeight: 600 }}>
                      {new Date(s.startsAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </div>
                    <div style={{ flex: 1, color: '#5c5855', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.siteName ?? '—'}</div>
                    {tr > 0 ? (
                      <div style={{ display: 'flex', height: 5, borderRadius: 2.5, overflow: 'hidden', width: 70, background: '#ebe8e2', flexShrink: 0 }}>
                        <div style={{ width: `${(s.walkingSeconds / tr) * 100}%`, background: MOVE_COLORS.walking }} />
                        <div style={{ width: `${(s.drivingSeconds / tr) * 100}%`, background: MOVE_COLORS.driving }} />
                        <div style={{ width: `${(s.idleSeconds    / tr) * 100}%`, background: MOVE_COLORS.idle }} />
                      </div>
                    ) : <div style={{ width: 70 }} />}
                    <div style={{ minWidth: 38, textAlign: 'right', color: '#1a1916', fontVariantNumeric: 'tabular-nums' }}>
                      {tr > 0 ? fmtHoursOrMin(tr) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ActivityCell({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ background: '#fafaf9', border: '1px solid #ebe8e2', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ width: 7, height: 7, borderRadius: 3.5, background: color }} />
        <span style={{ fontSize: 10, color: '#9a9490', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1916', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

export const PatrolPage: React.FC = () => {
  const { user } = useAuthStore()
  const [showTest, setShowTest] = useState(false)

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonTitle>Activity</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }}>
        <div style={{ padding: '14px 14px 24px' }}>
          {/* Why this exists — context for supervisors + guards */}
          <div style={{
            background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12,
            padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <IonIcon icon={walkOutline} style={{ fontSize: 18, color: '#10b981' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916' }}>Activity tracking</div>
            </div>
            <p style={{ margin: 0, color: '#5c5855', fontSize: 12.5, lineHeight: 1.5 }}>
              Your phone records walking, driving, and idle time during each shift. We use it to:
            </p>
            <ul style={{ margin: '6px 0 0', padding: '0 0 0 18px', color: '#5c5855', fontSize: 12.5, lineHeight: 1.55 }}>
              <li>Reimburse supervisors for the gas they spend driving between shifts.</li>
              <li>Confirm guards are doing the patrolling they're meant to be doing.</li>
            </ul>
          </div>

          {user?.id && <MyActivityLog userId={user.id} />}

          {/* Test movement panel — collapsed by default, mainly a dev / "is the
              classifier working on this device" tool. */}
          <button
            onClick={() => setShowTest(s => !s)}
            style={{
              all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
              background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12,
              padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
              marginBottom: showTest ? 10 : 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1a1916' }}>Test movement tracking</div>
                <div style={{ fontSize: 11.5, color: '#9a9490', marginTop: 2 }}>
                  Sanity-check that walking/driving/idle detection works on this device.
                </div>
              </div>
              <span style={{ color: '#9a9490', fontSize: 16 }}>{showTest ? '▾' : '▸'}</span>
            </div>
          </button>
          {showTest && <TestMovementCard />}
        </div>
      </IonContent>
    </IonPage>
  )
}
