import React, { useState, useEffect, useRef } from 'react'
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
} from '@ionic/react'
import { Route, Redirect } from 'react-router-dom'
import {
  homeOutline,
  qrCodeOutline,
  walkOutline,
  warningOutline,
  calendarOutline,
  personOutline,
  mapOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons'
import { DashboardPage } from '../pages/DashboardPage'
import { CheckInPage } from '../pages/CheckInPage'
import { PatrolPage } from '../pages/PatrolPage'
import { IncidentPage } from '../pages/IncidentPage'
import { ShiftsPage } from '../pages/ShiftsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { useAuthStore } from '../store/auth'
import { LeaveRequestPage } from '../pages/LeaveRequestPage'

// Cast react-router-dom v5 components to work around @types/react 18 incompatibility
const R = Route as React.ComponentType<any>
const Redir = Redirect as React.ComponentType<any>

const SupervisorDashboard: React.FC = () => {
  const { user, logout } = useAuthStore()
  const [guardStatus, setGuardStatus] = useState<any[]>([])
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_URL}/guard-status`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${BASE_URL}/incidents?status=open&limit=5`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      }).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([gs, inc]) => {
      setGuardStatus(gs.data ?? [])
      setIncidents(inc.data ?? [])
    }).finally(() => setLoading(false))
  }, [])

  const onShift = guardStatus.length
  const online = guardStatus.filter((g: any) => g.isOnline).length
  const pendingReview = guardStatus.filter((g: any) => g.selfieReviewStatus === 'pending' && g.selfieUrl).length

  const statBoxStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 12,
    padding: '14px 16px',
    flex: 1,
    border: '1px solid #e8e5e0',
  }

  return (
    <div style={{ background: '#fafaf9', minHeight: '100vh', color: '#1a1916' }}>
      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e8e5e0', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Arrow Security</div>
          <div style={{ color: '#9a9490', fontSize: 12 }}>Good {getTimeOfDay()}, {user?.name?.split(' ')[0]}</div>
        </div>
        <button
          onClick={() => { logout(); window.location.replace('/login') }}
          style={{ background: 'none', border: 'none', color: '#9a9490', cursor: 'pointer', padding: 4 }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: 16 }}>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={statBoxStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#c96442' }}>{loading ? '—' : onShift}</div>
            <div style={{ fontSize: 11, color: '#9a9490', marginTop: 2 }}>On Shift</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{loading ? '—' : online}</div>
            <div style={{ fontSize: 11, color: '#9a9490', marginTop: 2 }}>Online</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: pendingReview > 0 ? '#f59e0b' : '#9a9490' }}>{loading ? '—' : pendingReview}</div>
            <div style={{ fontSize: 11, color: '#9a9490', marginTop: 2 }}>To Review</div>
          </div>
        </div>

        {/* Guard list */}
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e8e5e0', marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e8e5e0', fontWeight: 600, fontSize: 14 }}>Guards on Shift</div>
          {loading ? (
            <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>Loading…</div>
          ) : guardStatus.length === 0 ? (
            <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>No guards currently on shift</div>
          ) : (
            guardStatus.slice(0, 6).map((g: any) => (
              <div key={g.guardId} style={{ padding: '10px 14px', borderBottom: '1px solid #f5f4f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{g.guardName}</div>
                  <div style={{ color: '#9a9490', fontSize: 11 }}>{g.siteName}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: g.isOnline ? '#d1fae5' : '#f5f4f2',
                  color: g.isOnline ? '#065f46' : '#9a9490',
                }}>
                  {g.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Recent open incidents */}
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e8e5e0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e8e5e0', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Open Incidents</span>
            {incidents.length > 0 && (
              <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }}>{incidents.length}</span>
            )}
          </div>
          {loading ? (
            <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>Loading…</div>
          ) : incidents.length === 0 ? (
            <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>No open incidents</div>
          ) : (
            incidents.map((inc: any) => (
              <div key={inc.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f5f4f2' }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{inc.title}</div>
                <div style={{ color: '#9a9490', fontSize: 11, marginTop: 2 }}>
                  {inc.severity?.toUpperCase()} · {new Date(inc.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

/* ─── Live Guard Map ─────────────────────────────────────────────────────── */

const BASE_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:4000/api'

const GUARD_COLOURS = [
  '#c96442', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#d97706', '#a3a098', '#059669', '#1d6fa4', '#7a7773',
]

interface GuardPin {
  id: string
  name: string
  lat: number
  lng: number
  ts: string
  colour: string
}

const SupervisorMapPage: React.FC = () => {
  const { token } = useAuthStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const labelsRef = useRef<Map<string, any>>(new Map())
  const colourMapRef = useRef<Map<string, string>>(new Map())
  const colourIdxRef = useRef(0)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const bufferRef = useRef('')
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(true)

  const [guards, setGuards] = useState<Map<string, GuardPin>>(new Map())
  const [selectedGuardId, setSelectedGuardId] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [sseError, setSseError] = useState(false)

  // Stable colour per guard
  function getColour(guardId: string): string {
    if (!colourMapRef.current.has(guardId)) {
      colourMapRef.current.set(guardId, GUARD_COLOURS[colourIdxRef.current % GUARD_COLOURS.length])
      colourIdxRef.current++
    }
    return colourMapRef.current.get(guardId)!
  }

  // Place or update a marker + name label on the map
  function upsertMarker(guardId: string, guardName: string, lat: number, lng: number, colour: string) {
    if (!mapRef.current) return
    import('maplibre-gl').then(({ default: maplibregl }) => {
      const map = mapRef.current
      if (!map) return

      const existing = markersRef.current.get(guardId)
      if (existing) {
        existing.setLngLat([lng, lat])
        const labelEl = labelsRef.current.get(guardId)
        if (labelEl) labelEl.setLngLat([lng, lat])
      } else {
        // Dot marker
        const dotEl = document.createElement('div')
        dotEl.style.cssText = [
          'width:14px;height:14px;border-radius:50%;',
          `background:${colour};`,
          'border:2.5px solid #eeece8;',
          'box-shadow:0 0 0 3px rgba(0,0,0,0.35),0 2px 6px rgba(0,0,0,0.5);',
          'cursor:pointer;flex-shrink:0;',
        ].join('')
        dotEl.addEventListener('click', () => setSelectedGuardId(guardId))

        const dotMarker = new maplibregl.Marker({ element: dotEl })
          .setLngLat([lng, lat])
          .addTo(map)
        markersRef.current.set(guardId, dotMarker)

        // Name label above dot
        const labelEl2 = document.createElement('div')
        labelEl2.style.cssText = [
          'pointer-events:none;',
          'background:rgba(43,42,39,0.88);',
          'border:1px solid #4a4845;',
          'border-radius:4px;',
          'padding:2px 6px;',
          'font-size:11px;font-weight:600;',
          `color:${colour};`,
          'white-space:nowrap;',
          'transform:translate(-50%,-28px);',
          'box-shadow:0 1px 4px rgba(0,0,0,0.4);',
        ].join('')
        labelEl2.textContent = guardName || guardId.slice(0, 6)

        const labelMarker = new maplibregl.Marker({ element: labelEl2, offset: [0, 0] })
          .setLngLat([lng, lat])
          .addTo(map)
        labelsRef.current.set(guardId, labelMarker)
      }
    })
  }

  function handleLocationEvent(evt: {
    guardId: string
    guardName?: string
    latitude: number
    longitude: number
    accuracy?: number
  }) {
    const colour = getColour(evt.guardId)
    const guardName = evt.guardName ?? evt.guardId.slice(0, 8)
    const ts = new Date().toISOString()

    setGuards(prev => {
      const next = new Map(prev)
      next.set(evt.guardId, { id: evt.guardId, name: guardName, lat: evt.latitude, lng: evt.longitude, ts, colour })
      return next
    })

    if (mapReady) {
      upsertMarker(evt.guardId, guardName, evt.latitude, evt.longitude, colour)
    }
  }

  // Init MapLibre
  useEffect(() => {
    let map: any
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (!containerRef.current || mapRef.current) return
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [78.9629, 20.5937],
        zoom: 4,
      })
      mapRef.current = map
      map.on('load', () => setMapReady(true))
    })
    return () => {
      map?.remove()
      mapRef.current = null
    }
  }, [])

  // When map becomes ready, replay any already-received guard positions
  useEffect(() => {
    if (!mapReady) return
    guards.forEach(g => upsertMarker(g.id, g.name, g.lat, g.lng, g.colour))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady])

  // SSE connection
  useEffect(() => {
    if (!token) return
    activeRef.current = true

    async function stream() {
      setSseError(false)
      try {
        const res = await fetch(`${BASE_URL}/locations/live`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

        const reader = res.body.getReader()
        readerRef.current = reader
        const decoder = new TextDecoder()

        while (activeRef.current) {
          const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined as any }))
          if (done) break
          bufferRef.current += decoder.decode(value, { stream: true })
          const lines = bufferRef.current.split('\n')
          bufferRef.current = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === 'location') handleLocationEvent(evt)
            } catch { /* ignore malformed */ }
          }
        }
      } catch {
        if (!activeRef.current) return
        setSseError(true)
        retryTimerRef.current = setTimeout(() => {
          if (activeRef.current) stream()
        }, 5000)
      }
    }

    stream()

    return () => {
      activeRef.current = false
      readerRef.current?.cancel()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Fly to guard when chip is tapped
  function flyToGuard(guardId: string) {
    const g = guards.get(guardId)
    if (!g || !mapRef.current) return
    setSelectedGuardId(guardId)
    mapRef.current.flyTo({ center: [g.lng, g.lat], zoom: 16, duration: 800 })
  }

  const guardList = Array.from(guards.values())

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 56px)', background: '#1a1916', overflow: 'hidden' }}>
      {/* Map container */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Header bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'rgba(27,25,22,0.88)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #4a4845',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ color: '#eeece8', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Live Guard Map
          </div>
          <div style={{ color: '#7a7773', fontSize: 11, marginTop: 1 }}>
            {guardList.length === 0
              ? 'Waiting for guard locations…'
              : `${guardList.length} guard${guardList.length !== 1 ? 's' : ''} active`}
          </div>
        </div>
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: sseError ? '#ef4444' : '#10b981',
            boxShadow: sseError ? 'none' : '0 0 0 2px rgba(16,185,129,0.3)',
            display: 'inline-block',
            animation: sseError ? 'none' : 'pulse 2s infinite',
          }} />
          <span style={{ color: sseError ? '#ef4444' : '#10b981', fontSize: 11, fontWeight: 600 }}>
            {sseError ? 'Offline' : 'Live'}
          </span>
        </div>
      </div>

      {/* SSE error overlay */}
      {sseError && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          background: '#2b2a27', border: '1px solid #4a4845', borderRadius: 10,
          padding: '16px 20px', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          maxWidth: 260,
        }}>
          <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Connection lost
          </div>
          <div style={{ color: '#7a7773', fontSize: 12 }}>
            Could not connect to live feed. Retrying in 5 seconds…
          </div>
        </div>
      )}

      {/* Guard chips — horizontal scroll at bottom */}
      <div style={{
        position: 'absolute', bottom: 12, left: 0, right: 0, zIndex: 10,
        overflowX: 'auto', overflowY: 'hidden',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 14px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      } as React.CSSProperties}>
        {guardList.length === 0 ? (
          <div style={{
            background: 'rgba(43,42,39,0.88)', backdropFilter: 'blur(6px)',
            border: '1px solid #4a4845', borderRadius: 20,
            padding: '7px 14px', color: '#7a7773', fontSize: 12,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            No guards on map yet
          </div>
        ) : (
          guardList.map(g => (
            <button
              key={g.id}
              onClick={() => flyToGuard(g.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: selectedGuardId === g.id
                  ? `${g.colour}22`
                  : 'rgba(43,42,39,0.88)',
                backdropFilter: 'blur(6px)',
                border: `1.5px solid ${selectedGuardId === g.id ? g.colour : '#4a4845'}`,
                borderRadius: 20,
                padding: '7px 12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.colour, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: '#eeece8', fontSize: 12, fontWeight: 500 }}>{g.name}</span>
              <span style={{ color: '#7a7773', fontSize: 10, marginLeft: 2 }}>
                {new Date(g.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          ))
        )}
      </div>

      {/* CSS pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

const LeaveApprovalsPage: React.FC = () => (
  <div style={{ background: '#fafaf9', minHeight: '100vh', padding: 24, color: '#1a1916' }}>
    <h2 style={{ margin: '0 0 8px' }}>Leave Approvals</h2>
    <p style={{ color: '#9a9490', margin: 0 }}>Time-off request approvals — coming soon.</p>
  </div>
)

const AdminDashboard: React.FC = () => {
  const { user } = useAuthStore()
  return (
    <div style={{ background: '#fafaf9', minHeight: '100vh', padding: 24, color: '#1a1916' }}>
      <h2 style={{ margin: '0 0 8px' }}>Management View</h2>
      <p style={{ color: '#9a9490', margin: 0 }}>Logged in as: {user?.name}</p>
      <p style={{ color: '#5c5855', marginTop: 16, fontSize: 14 }}>
        Use the Operations Portal for full management features including payroll, roster, and guard status.
      </p>
    </div>
  )
}

/* ─── Dev Account Bar ───────────────────────────────────────────────────── */

const DEV_USERS = [
  { label: 'Arun',   email: 'guard1@acme.secureops.in',      password: 'guard123', color: '#3b82f6' },
  { label: 'Vikram', email: 'guard2@acme.secureops.in',      password: 'guard123', color: '#10b981' },
  { label: 'Priya',  email: 'guard3@acme.secureops.in',      password: 'guard123', color: '#f59e0b' },
  { label: 'Rajesh', email: 'supervisor@acme.secureops.in',  password: 'super123', color: '#c96442' },
]
const TENANT_SLUG_DEV = (import.meta as any).env?.VITE_TENANT_SLUG ?? 'acme'

function DevAccountBar() {
  const { user, setAuth } = useAuthStore()
  const [switching, setSwitching] = useState<string | null>(null)

  async function switchTo(acc: typeof DEV_USERS[0]) {
    if (switching || user?.email === acc.email) return
    setSwitching(acc.email)
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: acc.password, tenantSlug: TENANT_SLUG_DEV }),
      })
      const data = await res.json()
      if (data.data?.token) {
        setAuth(data.data.token, data.data.user, TENANT_SLUG_DEV)
        window.location.replace('/tabs/dashboard')
      }
    } catch (e) { console.error(e) }
    finally { setSwitching(null) }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9000,
      background: '#2b2a27', borderBottom: '1px solid #3a3835',
      padding: '5px 10px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ color: '#c96442', fontSize: 9, fontFamily: 'ui-monospace,monospace', flexShrink: 0 }}>◈ dev</span>
      <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
        {DEV_USERS.map(a => {
          const active = user?.email === a.email
          return (
            <button key={a.email} onClick={() => switchTo(a)} disabled={!!switching} style={{
              padding: '3px 9px', borderRadius: 12,
              fontSize: 10, fontWeight: active ? 700 : 400,
              border: `1px solid ${active ? a.color : '#4a4845'}`,
              background: active ? `${a.color}22` : 'transparent',
              color: active ? a.color : '#7a7773',
              cursor: active ? 'default' : 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
              opacity: switching && switching !== a.email ? 0.35 : 1,
              transition: 'all 0.1s',
            }}>
              {switching === a.email ? '…' : a.label}
              {active && <span style={{ marginLeft: 2, fontSize: 8 }}>✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Main Layout ───────────────────────────────────────────────────────── */

export const TabLayout: React.FC = () => {
  const { user } = useAuthStore()

  const role = user?.role
  const isSupervisor = role === 'supervisor'
  const isAdmin = role === 'tenant_admin' || role === 'platform_admin'
  const tabBarStyle = { '--background': '#ffffff', '--border': '1px solid #e8e5e0' } as any
  const topPad = { paddingTop: 28 }

  if (isAdmin) {
    return (
      <>
        {import.meta.env.DEV && <DevAccountBar />}
        <div style={topPad}>
          <IonTabs>
            <IonRouterOutlet>
              <R exact path="/tabs/dashboard" component={AdminDashboard} />
              <R exact path="/tabs/map" component={SupervisorMapPage} />
              <R exact path="/tabs/shifts" component={ShiftsPage} />
              <R exact path="/tabs/incidents" component={IncidentPage} />
              <R exact path="/tabs/leave" component={LeaveApprovalsPage} />
              <R exact path="/tabs/profile" component={ProfilePage} />
              <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
            </IonRouterOutlet>
            <IonTabBar slot="bottom" style={tabBarStyle}>
              <IonTabButton tab="dashboard" href="/tabs/dashboard">
                <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
              </IonTabButton>
              <IonTabButton tab="map" href="/tabs/map">
                <IonIcon icon={mapOutline} /><IonLabel>Map</IonLabel>
              </IonTabButton>
              <IonTabButton tab="shifts" href="/tabs/shifts">
                <IonIcon icon={calendarOutline} /><IonLabel>Shifts</IonLabel>
              </IonTabButton>
              <IonTabButton tab="incidents" href="/tabs/incidents">
                <IonIcon icon={warningOutline} /><IonLabel>Incidents</IonLabel>
              </IonTabButton>
              <IonTabButton tab="profile" href="/tabs/profile">
                <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
              </IonTabButton>
            </IonTabBar>
          </IonTabs>
        </div>
      </>
    )
  }

  if (isSupervisor) {
    return (
      <>
        {import.meta.env.DEV && <DevAccountBar />}
        <div style={topPad}>
          <IonTabs>
            <IonRouterOutlet>
              <R exact path="/tabs/dashboard" component={SupervisorDashboard} />
              <R exact path="/tabs/map" component={SupervisorMapPage} />
              <R exact path="/tabs/shifts" component={ShiftsPage} />
              <R exact path="/tabs/incidents" component={IncidentPage} />
              <R exact path="/tabs/leave" component={LeaveApprovalsPage} />
              <R exact path="/tabs/profile" component={ProfilePage} />
              <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
            </IonRouterOutlet>
            <IonTabBar slot="bottom" style={tabBarStyle}>
              <IonTabButton tab="dashboard" href="/tabs/dashboard">
                <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
              </IonTabButton>
              <IonTabButton tab="map" href="/tabs/map">
                <IonIcon icon={mapOutline} /><IonLabel>Map</IonLabel>
              </IonTabButton>
              <IonTabButton tab="shifts" href="/tabs/shifts">
                <IonIcon icon={calendarOutline} /><IonLabel>Shifts</IonLabel>
              </IonTabButton>
              <IonTabButton tab="incidents" href="/tabs/incidents">
                <IonIcon icon={warningOutline} /><IonLabel>Incidents</IonLabel>
              </IonTabButton>
              <IonTabButton tab="leave" href="/tabs/leave">
                <IonIcon icon={checkmarkCircleOutline} /><IonLabel>Leave</IonLabel>
              </IonTabButton>
              <IonTabButton tab="profile" href="/tabs/profile">
                <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
              </IonTabButton>
            </IonTabBar>
          </IonTabs>
        </div>
      </>
    )
  }

  // Guard view (default)
  return (
    <>
      {import.meta.env.DEV && <DevAccountBar />}
      <div style={topPad}>
        <IonTabs>
          <IonRouterOutlet>
            <R exact path="/tabs/dashboard" component={DashboardPage} />
            <R exact path="/tabs/checkin" component={CheckInPage} />
            <R exact path="/tabs/patrol" component={PatrolPage} />
            <R exact path="/tabs/incidents" component={IncidentPage} />
            <R exact path="/tabs/leave" component={LeaveRequestPage} />
            <R exact path="/tabs/shifts" component={ShiftsPage} />
            <R exact path="/tabs/profile" component={ProfilePage} />
            <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
          </IonRouterOutlet>
          <IonTabBar slot="bottom" style={tabBarStyle}>
            <IonTabButton tab="dashboard" href="/tabs/dashboard">
              <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
            </IonTabButton>
            <IonTabButton tab="checkin" href="/tabs/checkin">
              <IonIcon icon={qrCodeOutline} /><IonLabel>Check In</IonLabel>
            </IonTabButton>
            <IonTabButton tab="patrol" href="/tabs/patrol">
              <IonIcon icon={walkOutline} /><IonLabel>Patrol</IonLabel>
            </IonTabButton>
            <IonTabButton tab="incidents" href="/tabs/incidents">
              <IonIcon icon={warningOutline} /><IonLabel>Incidents</IonLabel>
            </IonTabButton>
            <IonTabButton tab="shifts" href="/tabs/shifts">
              <IonIcon icon={calendarOutline} /><IonLabel>Shifts</IonLabel>
            </IonTabButton>
            <IonTabButton tab="profile" href="/tabs/profile">
              <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </div>
    </>
  )
}
