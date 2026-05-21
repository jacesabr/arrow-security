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

// Confidence floor: Android's ActivityRecognition spits out spurious "walking"
// classifications when the phone is just sitting on a desk picking up vibration
// from a passing truck or the user adjusting their grip. The plugin maps
// LOW/MEDIUM/HIGH to 25/50/75 — anything below 50 we treat as noise and stay
// on the previous bucket.
const CONFIDENCE_FLOOR = 50

// Length of the live strip in seconds — long enough to see a few transitions,
// short enough not to feel laggy when you start moving.
const STRIP_SECONDS = 60

// GPS reality-check classifier — research-backed (Feng & Timmermans 2015,
// PMC4320483) layered with a "VWAP-style" adaptive baseline. Replaces the
// fixed-threshold version because that one still got fooled by phones with
// noisier GPS floors (multipath near windows, indoors).
//
//   sitting still  → P95 close to baseline,           σ low
//   GPS jitter     → P95 close to baseline,           σ low
//   walking        → P95 well above baseline,         σ elevated (step cadence)
//   driving        → P95 far above baseline,          σ doesn't matter
//
// Why P95 and not mean: a single GPS spike can drag the mean up over an
// entire window and look like walking. P95 is robust to one or two outliers.
// Why an adaptive baseline: every device + location has its own GPS noise
// floor. Tracking the session's P10 ("calm floor") gives us a per-device,
// per-location reference; the walking/driving thresholds shift WITH the floor
// instead of being absolute.

const SPEED_WINDOW_MS  = 30_000
// Asymmetric hysteresis: harder to promote (go from idle→walking, walking→
// driving) than to demote. Promoting is where false positives hurt — once
// idle, we want to require sustained evidence before we say "they're moving
// now". Demoting toward idle is much less risky since the user genuinely
// having stopped is the most common case.
const HYSTERESIS_UP_MS   = 8_000  // idle → walking, walking → driving etc.
const HYSTERESIS_DOWN_MS = 2_000  // walking → idle, driving → walking/idle
const GPS_STALE_MS       = 15_000   // no GPS sample for this long → assume the phone is still
// Retroactive correction: a "blip" bucket period (X → Y → X, where Y was
// short) is almost always a sensor misclassification. When we transition out
// of Y back to X (the bucket before Y), if Y lasted less than this, reassign
// Y's seconds to X instead of crediting them to Y. The user sees their
// walking/driving counters snap back when this fires.
const BLIP_MAX_MS        = 90_000

// Thresholds expressed as "delta above adaptive baseline". We check BOTH
// P95 (peak movement) and P75 (the top quartile) so a single GPS outlier
// can't promote the classification — the top 25% of samples have to support
// the call, not just the very tail.
const DRIVING_P75_OVER_BASE = 2.0   // P75 above base → at least a quarter of samples are driving-speed
const WALKING_P95_OVER_BASE = 0.8   // P95 above base → at least one strong walking-speed sample
const WALKING_P75_OVER_BASE = 0.3   // AND P75 above base → not just an isolated GPS spike
const WALKING_SIGMA_FLOOR   = 0.30  // AND σ this high → real oscillation, not a flat noise floor

type SpeedSample = { ts: number; speed: number }

type SpeedStats = {
  bucket: Bucket | null
  p95: number
  p75: number
  mean: number
  sigma: number
  baseline: number
  count: number
  reason: string
}

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * q))
  return sortedAsc[idx]
}

function classifySpeed(
  samples: SpeedSample[],
  baseline: number,
  now: number,
): SpeedStats {
  const recent = samples.filter(s => now - s.ts <= SPEED_WINDOW_MS)
  const lastAge = samples.length === 0 ? Infinity : now - samples[samples.length - 1].ts

  // No fresh GPS = the phone hasn't moved (or has lost signal). Either way,
  // we shouldn't credit walking/driving. This is what kills the "9 minutes of
  // phantom walking while sitting" bug — when you stop moving, you stop
  // getting GPS pings, and we converge to idle.
  if (lastAge > GPS_STALE_MS) {
    return { bucket: 'idle', p95: 0, p75: 0, mean: 0, sigma: 0, baseline, count: recent.length, reason: 'stale GPS' }
  }
  if (recent.length < 3) {
    return { bucket: null, p95: 0, p75: 0, mean: 0, sigma: 0, baseline, count: recent.length, reason: 'too few samples' }
  }

  const speeds = recent.map(s => s.speed)
  const sorted = [...speeds].sort((a, b) => a - b)
  const p75  = percentile(sorted, 0.75)
  const p95  = percentile(sorted, 0.95)
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length
  const variance = speeds.reduce((a, s) => a + (s - mean) ** 2, 0) / speeds.length
  const sigma = Math.sqrt(variance)

  const p95Above = p95 - baseline
  const p75Above = p75 - baseline

  // Driving — sustained high speed: top quartile already above driving threshold
  if (p75Above >= DRIVING_P75_OVER_BASE) {
    return { bucket: 'driving', p95, p75, mean, sigma, baseline, count: recent.length, reason: 'P75 ≥ base + 2' }
  }
  // Walking — peak AND top quartile AND σ all elevated
  if (
    p95Above >= WALKING_P95_OVER_BASE &&
    p75Above >= WALKING_P75_OVER_BASE &&
    sigma   >= WALKING_SIGMA_FLOOR
  ) {
    return { bucket: 'walking', p95, p75, mean, sigma, baseline, count: recent.length, reason: 'P75 + P95 above base, σ elevated' }
  }
  return { bucket: 'idle', p95, p75, mean, sigma, baseline, count: recent.length, reason: 'near baseline / single-spike or flat' }
}

// Adaptive baseline = running P10 of session speeds, floored at 0.
// Updated continuously so a phone settling into a quieter GPS floor pulls the
// thresholds down with it. We never let it climb past 1.5 m/s — otherwise a
// device that started while driving would lock its "still" baseline at
// driving speeds and never recognise idle afterwards.
function computeBaseline(samples: SpeedSample[]): number {
  if (samples.length < 5) return 0
  const sorted = samples.map(s => s.speed).sort((a, b) => a - b)
  const p10 = percentile(sorted, 0.10)
  return Math.min(1.5, Math.max(0, p10))
}

const TestMovementCard: React.FC = () => {
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0) // forces re-render every second so counters + strip tick visibly
  const [current, setCurrent] = useState<Bucket | 'unknown'>('unknown')
  const [confidence, setConfidence] = useState(0)
  const [pings, setPings] = useState(0)
  const [lastPos, setLastPos] = useState<{ lat: number; lng: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lastSampleAt, setLastSampleAt] = useState(0)
  const [speedStats, setSpeedStats] = useState<SpeedStats>({ bucket: null, p95: 0, p75: 0, mean: 0, sigma: 0, baseline: 0, count: 0, reason: '' })

  // Hysteresis state — a candidate bucket must hold steady for HYSTERESIS_MS
  // before we actually flip the credited bucket. Prevents single-sample flaps.
  const pendingBucketRef = useRef<Bucket | null>(null)
  const pendingSinceRef = useRef<number>(0)
  // Cumulative session samples (not the 30s window) — used to compute the
  // adaptive baseline as session P10. Capped at 600 samples to bound memory.
  const allSamplesRef = useRef<SpeedSample[]>([])
  // History of committed bucket entries — drives retroactive blip correction.
  // Only buckets that survived hysteresis AND weren't reassigned end up here.
  const bucketHistoryRef = useRef<{ bucket: Bucket; startedAt: number }[]>([])

  // Accumulators (refs so we don't trigger renders for every micro-update)
  const accRef = useRef<{ walking: number; driving: number; idle: number }>({ walking: 0, driving: 0, idle: 0 })
  const lastBucketRef = useRef<Bucket | null>(null)
  const lastChangeRef = useRef<number>(0)
  // GPS speed history — drives the reality-check that overrides phantom
  // Activity Recognition transitions.
  const speedSamplesRef = useRef<SpeedSample[]>([])
  // Sensor's own bucket (what Activity Recognition last claimed)
  const sensorBucketRef = useRef<Bucket | null>(null)
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

  // Reconciles sensor bucket + GPS classifier into a CANDIDATE bucket.
  // Hysteresis-gated commit happens in the tick loop, not here.
  function effectiveBucket(stats: SpeedStats): Bucket | null {
    const sensor = sensorBucketRef.current
    const gps = stats.bucket
    if (gps === 'idle') return 'idle'                       // GPS stillness wins
    const rank = (b: Bucket | null) => b === 'driving' ? 2 : b === 'walking' ? 1 : 0
    if (sensor && gps) return rank(sensor) <= rank(gps) ? sensor : gps  // pick the more conservative
    return sensor ?? gps
  }

  // Commit a candidate bucket if it has held steady through the appropriate
  // hysteresis window. Asymmetric: going UP (idle → walking → driving) takes
  // longer than going DOWN, because the cost of a false positive (claiming
  // someone is walking when they're sitting) is much higher than a false
  // negative.
  function maybeCommitBucket(candidate: Bucket | null, now: number) {
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
    lastChangeRef.current = Date.now()
    stripRef.current = []
    speedSamplesRef.current = []
    allSamplesRef.current = []
    bucketHistoryRef.current = []
    pendingBucketRef.current = null
    pendingSinceRef.current = 0
    setPings(0)
    setLastPos(null)
    setConfidence(0)
    setLastSampleAt(0)
    setRunning(true)

    // 1s ticker — drives the elapsed display, the live counters, the strip,
    // AND the GPS-based reconciliation. Reconciling every second means a
    // phantom sensor classification gets corrected within ~1s of GPS speed
    // showing stillness, rather than running forever.
    intervalRef.current = setInterval(() => {
      const now = Date.now()
      speedSamplesRef.current = speedSamplesRef.current.filter(s => now - s.ts <= SPEED_WINDOW_MS)
      const baseline = computeBaseline(allSamplesRef.current)
      const stats = classifySpeed(speedSamplesRef.current, baseline, now)
      setSpeedStats(stats)
      const candidate = effectiveBucket(stats)
      maybeCommitBucket(candidate, now)
      stripRef.current.push(lastBucketRef.current ?? 'unknown')
      if (stripRef.current.length > STRIP_SECONDS) stripRef.current.shift()
      setTick(t => t + 1)
    }, 1000)

    try {
      listenerRef.current = await ActivityRecognition.addListener(
        'activityTransition',
        (e: ActivityTransitionEvent) => {
          setConfidence(e.confidence ?? 0)
          setLastSampleAt(Date.now())
          // Drop noisy classifications — keep the previous sensor bucket. This
          // prevents a phone-on-desk vibration from racking up phantom "walking"
          // time. We just record what the sensor thinks; the 1s tick re-runs
          // effectiveBucket() to decide whether to actually credit it.
          if ((e.confidence ?? 0) < CONFIDENCE_FLOOR) return
          sensorBucketRef.current = bucketFor(e.activity)
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
          // Speed in m/s. Devices that don't compute speed report null/-1; we
          // treat those as 0 so a parked phone falls cleanly into 'idle'.
          const speed = position.speed != null && position.speed >= 0 ? position.speed : 0
          const sample = { ts: Date.now(), speed }
          speedSamplesRef.current.push(sample)
          // Cumulative session log for the adaptive baseline. Cap at 600 so
          // memory bounded even on a long test.
          allSamplesRef.current.push(sample)
          if (allSamplesRef.current.length > 600) allSamplesRef.current.shift()
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
          {lastSampleAt > 0 && Date.now() - lastSampleAt > 60_000 && (
            <div style={{ fontSize: 10.5, color: '#92400e', background: '#fef3c7', padding: '5px 8px', borderRadius: 6, marginBottom: 8 }}>
              No new activity sample in {Math.floor((Date.now() - lastSampleAt) / 1000)}s — your phone may not be supplying activity events. Counters stop growing until the next reliable sample.
            </div>
          )}

          {/* GPS speed stats — the "show your work" line. P75 + P95 above
              the adaptive baseline are what drive the classification. */}
          <div style={{ fontSize: 10.5, color: '#9a9490', fontFamily: 'ui-monospace,monospace', marginBottom: 8, lineHeight: 1.5 }}>
            P75 {speedStats.p75.toFixed(2)} · P95 {speedStats.p95.toFixed(2)} · σ {speedStats.sigma.toFixed(2)} · base {speedStats.baseline.toFixed(2)} · {speedStats.count} samples
            {speedStats.reason && <><br /><span style={{ color: '#5c5855' }}>{speedStats.reason}</span></>}
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

            {sites.length === 0 ? (
              <div style={{
                background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12,
                padding: '18px 16px', margin: '8px 0 16px',
                color: '#5c5855', fontSize: 13.5, lineHeight: 1.5, textAlign: 'left',
              }}>
                <div style={{ fontWeight: 600, color: '#1a1916', marginBottom: 4 }}>No sites yet</div>
                Your admin needs to create a site (and ideally assign you a shift) before you can start a patrol. Once that's done this page will list the sites you can patrol.
              </div>
            ) : sites.length > 1 ? (
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
            ) : null}

            <IonButton
              expand="block"
              onClick={startPatrol}
              disabled={loading || !selectedSite}
              style={{ '--background': '#10b981', '--border-radius': '12px' }}
            >
              {loading ? <IonSpinner /> : 'Begin Patrol'}
            </IonButton>

            <div style={{ height: 24 }} />
            <TestMovementCard />
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
