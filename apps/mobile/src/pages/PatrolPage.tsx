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

// localStorage key for the active session id — lets us resume after app
// kill/relaunch. Cleared on Stop.
const ACTIVE_SESSION_KEY = 'arrow_test_session_id'
const SAMPLE_FLUSH_INTERVAL_MS = 5_000  // batch samples to the server every 5s
const TOTALS_REFRESH_INTERVAL_MS = 5_000

type Sample = {
  ts: number
  activity: 'walking' | 'driving' | 'idle' | 'unknown'
  confidence?: number
  lat?: number
  lng?: number
  speed?: number
}

const TestMovementCard: React.FC = () => {
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number>(0)
  const [tick, setTick] = useState(0) // forces re-render every second so counters + strip tick visibly
  const [current, setCurrent] = useState<Bucket | 'unknown'>('unknown')
  const [confidence, setConfidence] = useState(0)
  const [pings, setPings] = useState(0)
  const [lastPos, setLastPos] = useState<{ lat: number; lng: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lastActivityAt, setLastActivityAt] = useState(0)
  const [lastActivity, setLastActivity] = useState<string>('—')
  // Server-confirmed aggregate — canonical totals after each batch flush.
  const [totals, setTotals] = useState<{ walkingSeconds: number; drivingSeconds: number; idleSeconds: number }>(
    { walkingSeconds: 0, drivingSeconds: 0, idleSeconds: 0 },
  )

  // Hysteresis state — drives the "current bucket" display (not the totals).
  const pendingBucketRef = useRef<Bucket | null>(null)
  const pendingSinceRef = useRef<number>(0)
  const lastBucketRef = useRef<Bucket | null>(null)
  // What Activity Recognition last reported (high-confidence only)
  const sensorBucketRef = useRef<Bucket | null>(null)
  const sensorAtRef = useRef<number>(0)
  // Most recent GPS sample timestamp — the "phone actually moved" signal
  const lastGpsAtRef = useRef<number>(0)
  // Live time-series strip — one entry per second of the test session
  const stripRef = useRef<(Bucket | 'unknown')[]>([])
  // Pending samples to flush server-side
  const sampleQueueRef = useRef<Sample[]>([])
  // Native watchers
  const watcherIdRef = useRef<string | null>(null)
  const listenerRef = useRef<PluginListenerHandle | null>(null)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Avoid stale `sessionId` closure in event handlers (state isn't yet set
  // when the very first sample fires after start).
  const sessionIdRef = useRef<string | null>(null)

  // Decides the candidate bucket from current sensor state + GPS staleness.
  function effectiveBucket(now: number): Bucket | null {
    const gpsStale = now - lastGpsAtRef.current > GPS_STALE_MS
    if (gpsStale) return 'idle'
    const sensorStale = now - sensorAtRef.current > ACTIVITY_STALE_MS
    if (sensorStale) return null
    return sensorBucketRef.current
  }

  function bucketRank(b: Bucket | null): number {
    if (b === 'driving') return 2
    if (b === 'walking') return 1
    return 0
  }

  // Hysteresis-gated commit of the "current bucket" UI label.
  function maybeCommitBucket(candidate: Bucket | null, now: number) {
    if (candidate === null) return
    if (candidate === lastBucketRef.current) {
      pendingBucketRef.current = null
      pendingSinceRef.current = 0
      return
    }
    if (lastBucketRef.current === null && candidate === 'idle') {
      lastBucketRef.current = candidate
      setCurrent(candidate)
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
      lastBucketRef.current = candidate
      setCurrent(candidate)
      pendingBucketRef.current = null
      pendingSinceRef.current = 0
    }
  }

  function pushSample(s: Sample) {
    sampleQueueRef.current.push(s)
  }

  async function flushSamples() {
    const id = sessionIdRef.current
    if (!id) return
    const batch = sampleQueueRef.current.splice(0)
    if (batch.length === 0) return
    try {
      const r = await api.testSessions.appendSamples(id, batch)
      setTotals({
        walkingSeconds: r.data.walkingSeconds,
        drivingSeconds: r.data.drivingSeconds,
        idleSeconds:    r.data.idleSeconds,
      })
    } catch (e: any) {
      // Re-queue on failure so we try again next flush. Newest at the back so
      // ordering by ts on the server is still correct.
      sampleQueueRef.current.unshift(...batch)
      console.warn('test session flush failed:', e?.message ?? e)
    }
  }

  async function attachWatchersAndTimers() {
    // 1s ticker for the strip + hysteresis-driven current bucket
    tickIntervalRef.current = setInterval(() => {
      const now = Date.now()
      const candidate = effectiveBucket(now)
      maybeCommitBucket(candidate, now)
      stripRef.current.push(lastBucketRef.current ?? 'unknown')
      if (stripRef.current.length > STRIP_SECONDS) stripRef.current.shift()
      setTick(t => t + 1)
    }, 1000)

    // Batch-flush samples to server every 5s
    flushIntervalRef.current = setInterval(() => { flushSamples() }, SAMPLE_FLUSH_INTERVAL_MS)

    try {
      listenerRef.current = await ActivityRecognition.addListener(
        'activityTransition',
        (e: ActivityTransitionEvent) => {
          const conf = e.confidence ?? 0
          const now = Date.now()
          setConfidence(conf)
          setLastActivity(e.activity)
          setLastActivityAt(now)
          // Drop low-confidence for UI bucket. But STILL post a sample so the
          // server has full history; mark it 'unknown' if below floor.
          const bucket = bucketFor(e.activity)
          if (conf >= CONFIDENCE_FLOOR && bucket) {
            sensorBucketRef.current = bucket
            sensorAtRef.current = now
          }
          pushSample({
            ts: now,
            activity: (conf >= CONFIDENCE_FLOOR && bucket) ? bucket : 'unknown',
            confidence: conf,
          })
        },
      )
      await ActivityRecognition.start()
    } catch (e: any) {
      console.warn('ActivityRecognition unavailable:', e?.message ?? e)
    }

    try {
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Test movement tracking — Arrow Security',
          backgroundTitle: 'Test Mode',
          requestPermissions: true,
          stale: false,
          distanceFilter: 20,
        },
        (position?: Location, error?: Error) => {
          if (error) { setErr(error.message); return }
          if (!position) return
          setPings(p => p + 1)
          setLastPos({ lat: position.latitude, lng: position.longitude })
          lastGpsAtRef.current = Date.now()
          // Also record this as a sample so the server-side reconstruction
          // sees movement happening (gives us GPS lat/lng for the time series).
          pushSample({
            ts: Date.now(),
            activity: sensorBucketRef.current ?? 'unknown',
            lat: position.latitude,
            lng: position.longitude,
            speed: position.speed ?? undefined,
          })
        },
      )
      watcherIdRef.current = id
    } catch (e: any) {
      setErr(e?.message ?? 'Unable to start GPS')
      setRunning(false)
    }
  }

  // On mount, restore in-progress session if there is one.
  useEffect(() => {
    let cancelled = false
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_SESSION_KEY) : null
    if (!saved) return
    ;(async () => {
      try {
        const r = await api.testSessions.get(saved)
        if (cancelled) return
        if (r.data.endedAt) {
          // Server says it's already ended — clear stale local marker.
          window.localStorage.removeItem(ACTIVE_SESSION_KEY)
          return
        }
        sessionIdRef.current = saved
        setSessionId(saved)
        setStartedAt(new Date(r.data.startedAt).getTime())
        setTotals({
          walkingSeconds: r.data.walkingSeconds ?? 0,
          drivingSeconds: r.data.drivingSeconds ?? 0,
          idleSeconds:    r.data.idleSeconds ?? 0,
        })
        lastGpsAtRef.current = Date.now()  // grace period
        setRunning(true)
        await attachWatchersAndTimers()
      } catch {
        // Server lost the session, or network problem. Clear marker; user can start fresh.
        window.localStorage.removeItem(ACTIVE_SESSION_KEY)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function start() {
    setErr(null)
    sampleQueueRef.current = []
    sensorBucketRef.current = null
    sensorAtRef.current = 0
    lastGpsAtRef.current = Date.now()
    stripRef.current = []
    pendingBucketRef.current = null
    pendingSinceRef.current = 0
    lastBucketRef.current = null
    setPings(0)
    setLastPos(null)
    setConfidence(0)
    setLastActivityAt(0)
    setLastActivity('—')
    setTotals({ walkingSeconds: 0, drivingSeconds: 0, idleSeconds: 0 })

    let id: string
    try {
      const r = await api.testSessions.start()
      id = r.data.id
    } catch (e: any) {
      setErr(e?.message ?? 'Could not start test session')
      return
    }
    sessionIdRef.current = id
    setSessionId(id)
    setStartedAt(Date.now())
    window.localStorage.setItem(ACTIVE_SESSION_KEY, id)
    setRunning(true)
    await attachWatchersAndTimers()
  }

  async function stop() {
    // Flush any pending samples before sealing
    await flushSamples()

    if (watcherIdRef.current) {
      try { await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current }) } catch { /* ignore */ }
      watcherIdRef.current = null
    }
    if (listenerRef.current) {
      try { await listenerRef.current.remove() } catch { /* ignore */ }
      listenerRef.current = null
    }
    try { await ActivityRecognition.stop() } catch { /* ignore */ }
    if (tickIntervalRef.current)  { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
    if (flushIntervalRef.current) { clearInterval(flushIntervalRef.current); flushIntervalRef.current = null }

    const id = sessionIdRef.current
    if (id) {
      try {
        const r = await api.testSessions.end(id)
        setTotals({
          walkingSeconds: r.data.walkingSeconds,
          drivingSeconds: r.data.drivingSeconds,
          idleSeconds:    r.data.idleSeconds,
        })
      } catch { /* leave the totals as last-known */ }
    }
    window.localStorage.removeItem(ACTIVE_SESSION_KEY)
    sessionIdRef.current = null
    setSessionId(null)
    setRunning(false)
    // Tell any listeners (e.g. TestSessionsList) to refresh.
    window.dispatchEvent(new CustomEvent('arrow:test-session-ended'))
  }

  // NOTE: we intentionally do NOT auto-stop on unmount. The user might tab
  // away to file an incident or check their shifts — they expect the test to
  // keep running until they explicitly press Stop. The watchers are native
  // and keep firing in the background; on remount we resume via the saved
  // session id.

  // Live values = server-confirmed totals + the in-flight period since the
  // most recent flush. Best-effort visual smoothing only; the SERVER aggregate
  // is the canonical record.
  const tickGap = lastBucketRef.current && running ? (1 /* secs since last tick, smoothing */) : 0
  void tick // re-render every second
  void tickGap

  const live = totals
  const total = live.walkingSeconds + live.drivingSeconds + live.idleSeconds
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
            <div style={{ width: `${pct(live.walkingSeconds)}%`, background: '#10b981', transition: 'width 0.4s' }} />
            <div style={{ width: `${pct(live.drivingSeconds)}%`, background: '#3b82f6', transition: 'width 0.4s' }} />
            <div style={{ width: `${pct(live.idleSeconds)}%`,    background: '#d4a574', transition: 'width 0.4s' }} />
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
            <Bucket label="Walking" color="#10b981" seconds={live.walkingSeconds} active={current === 'walking'} />
            <Bucket label="Driving" color="#3b82f6" seconds={live.drivingSeconds} active={current === 'driving'} />
            <Bucket label="Idle"    color="#d4a574" seconds={live.idleSeconds}    active={current === 'idle'} />
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

/* ─── Past test sessions ──────────────────────────────────────────────── */
//
// Shows the caller's own recent test sessions — one row per session with
// a stacked walking/driving/idle bar. Refreshes itself when a test ends
// (the TestMovementCard dispatches 'arrow:test-session-ended').

function fmtDateShort(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDurationFromStart(startedAt: string | Date, endedAt: string | Date | null): string {
  if (!endedAt) return '— in progress'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  return fmtSec(Math.max(0, Math.floor(ms / 1000)))
}

const TestSessionsList: React.FC = () => {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = React.useCallback(() => {
    setLoading(true)
    api.testSessions.list(20)
      .then(r => setRows(r.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const onEnd = () => load()
    window.addEventListener('arrow:test-session-ended', onEnd as EventListener)
    return () => window.removeEventListener('arrow:test-session-ended', onEnd as EventListener)
  }, [load])

  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12,
      padding: '14px 16px', marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1916' }}>Past test sessions</div>
        <span style={{ fontSize: 11, color: '#9a9490' }}>
          {loading ? 'Loading…' : `${rows.length} session${rows.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {loading ? null : rows.length === 0 ? (
        <div style={{ color: '#9a9490', fontSize: 12 }}>No test runs yet. Tap "Start test" to record one.</div>
      ) : rows.map(r => {
        const tracked = (r.walkingSeconds ?? 0) + (r.drivingSeconds ?? 0) + (r.idleSeconds ?? 0)
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 6,
            padding: '8px 0', borderBottom: '1px solid #f5f4f2',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: '#1a1916', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fmtDateShort(r.startedAt)}
                </div>
                <div style={{ fontSize: 10.5, color: '#9a9490', marginTop: 1 }}>
                  {fmtDurationFromStart(r.startedAt, r.endedAt)}
                  {!r.endedAt && <span style={{ color: '#c96442', fontWeight: 600 }}> · live</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 96 }}>
              {tracked > 0 ? (
                <>
                  <div style={{ display: 'flex', height: 5, borderRadius: 2.5, overflow: 'hidden', width: 90, background: '#ebe8e2' }}>
                    <div style={{ width: `${(r.walkingSeconds / tracked) * 100}%`, background: '#10b981' }} />
                    <div style={{ width: `${(r.drivingSeconds / tracked) * 100}%`, background: '#3b82f6' }} />
                    <div style={{ width: `${(r.idleSeconds    / tracked) * 100}%`, background: '#d4a574' }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#9a9490', fontVariantNumeric: 'tabular-nums' }}>
                    W {fmtSec(r.walkingSeconds)} · D {fmtSec(r.drivingSeconds)} · I {fmtSec(r.idleSeconds)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 10.5, color: '#9a9490' }}>no movement</div>
              )}
            </div>
          </div>
        )
      })}
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
          {showTest && (
            <>
              <TestMovementCard />
              <TestSessionsList />
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  )
}
