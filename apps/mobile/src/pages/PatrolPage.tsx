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

const TestMovementCard: React.FC = () => {
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0) // forces re-render every second so counters tick visibly
  const [current, setCurrent] = useState<Bucket | 'unknown'>('unknown')
  const [pings, setPings] = useState(0)
  const [lastPos, setLastPos] = useState<{ lat: number; lng: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Accumulators (refs so we don't trigger renders for every micro-update)
  const accRef = useRef<{ walking: number; driving: number; idle: number }>({ walking: 0, driving: 0, idle: 0 })
  const lastBucketRef = useRef<Bucket | null>(null)
  const lastChangeRef = useRef<number>(0)
  const watcherIdRef = useRef<string | null>(null)
  const listenerRef = useRef<PluginListenerHandle | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function applyTransition(newBucket: Bucket | null, now: number) {
    const prev = lastBucketRef.current
    if (prev) {
      accRef.current[prev] += (now - lastChangeRef.current) / 1000
    }
    lastBucketRef.current = newBucket
    lastChangeRef.current = now
    setCurrent(newBucket ?? 'unknown')
  }

  async function start() {
    setErr(null)
    accRef.current = { walking: 0, driving: 0, idle: 0 }
    lastBucketRef.current = null
    lastChangeRef.current = Date.now()
    setPings(0)
    setLastPos(null)
    setRunning(true)

    // 1s ticker so the elapsed-time display keeps moving even when activity
    // doesn't change. The accumulator updates by recalculating "elapsed since
    // last change" against the visible current bucket each render.
    intervalRef.current = setInterval(() => setTick(t => t + 1), 1000)

    try {
      listenerRef.current = await ActivityRecognition.addListener(
        'activityTransition',
        (e: ActivityTransitionEvent) => applyTransition(bucketFor(e.activity), Date.now()),
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
    applyTransition(null, Date.now())

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
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#ebe8e2', marginBottom: 12 }}>
            <div style={{ width: `${pct(live.walking)}%`, background: '#10b981', transition: 'width 0.4s' }} />
            <div style={{ width: `${pct(live.driving)}%`, background: '#3b82f6', transition: 'width 0.4s' }} />
            <div style={{ width: `${pct(live.idle)}%`,    background: '#d4a574', transition: 'width 0.4s' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <Bucket label="Walking" color="#10b981" seconds={live.walking} active={current === 'walking'} />
            <Bucket label="Driving" color="#3b82f6" seconds={live.driving} active={current === 'driving'} />
            <Bucket label="Idle"    color="#d4a574" seconds={live.idle}    active={current === 'idle'} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9a9490', marginBottom: 12 }}>
            <span>Current: <strong style={{ color: '#1a1916' }}>{current}</strong></span>
            <span>{pings} GPS ping{pings === 1 ? '' : 's'}</span>
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
