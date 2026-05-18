'use client'
import { useEffect, useRef, useState } from 'react'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'
const GUARD_COLOURS = [
  '#c96442', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#fb923c', '#10b981', '#f59e0b', '#3b82f6', '#ef4444',
  '#c96442', '#a3a098', '#ef4444', '#3b82f6', '#10b981',
  '#f59e0b', '#ef4444', '#10b981', '#fb923c', '#7a7773',
]

interface GuardPin {
  id: string; name: string; lat: number; lng: number; ts: string; colour: string
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const colourMapRef = useRef<Map<string, string>>(new Map())
  const colourIdxRef = useRef(0)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const bufferRef = useRef('')

  const [guards, setGuards] = useState<Map<string, GuardPin>>(new Map())
  const [selectedGuard, setSelectedGuard] = useState<string | null>(null)
  const [trailGuardId, setTrailGuardId] = useState<string | null>(null)
  const [trailName, setTrailName] = useState('')
  const [mapReady, setMapReady] = useState(false)

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
    return () => { map?.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('td_token') : null
    if (!token) return

    let active = true
    async function stream() {
      const res = await fetch(tdApi.locations.liveUrl(), {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (!res || !res.body) return

      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()

      while (active) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
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
    }

    stream()
    return () => { active = false; readerRef.current?.cancel() }
  }, [])

  function getColour(guardId: string): string {
    if (!colourMapRef.current.has(guardId)) {
      colourMapRef.current.set(guardId, GUARD_COLOURS[colourIdxRef.current % GUARD_COLOURS.length])
      colourIdxRef.current++
    }
    return colourMapRef.current.get(guardId)!
  }

  function handleLocationEvent(evt: { guardId: string; lat: number; lng: number; ts: string }) {
    const colour = getColour(evt.guardId)
    setGuards((prev) => {
      const next = new Map(prev)
      const existing = next.get(evt.guardId)
      next.set(evt.guardId, { id: evt.guardId, name: existing?.name ?? evt.guardId.slice(0, 6), lat: evt.lat, lng: evt.lng, ts: evt.ts, colour })
      return next
    })

    if (!mapReady || !mapRef.current) return
    import('maplibre-gl').then(({ default: maplibregl }) => {
      const map = mapRef.current
      if (!map) return
      const existing = markersRef.current.get(evt.guardId)
      if (existing) {
        existing.setLngLat([evt.lng, evt.lat])
      } else {
        const el = document.createElement('div')
        el.style.cssText = `
          width:36px;height:36px;border-radius:50%;
          background:${colour};border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,.25);
          display:flex;align-items:center;justify-content:center;
          font-size:16px;cursor:pointer;user-select:none;
        `
        el.textContent = '👮'
        el.addEventListener('click', () => {
          setSelectedGuard(evt.guardId)
          setTrailGuardId(evt.guardId)
          setTrailName(evt.guardId.slice(0, 6))
        })
        const marker = new maplibregl.Marker({ element: el }).setLngLat([evt.lng, evt.lat]).addTo(map)
        markersRef.current.set(evt.guardId, marker)
      }
    })
  }

  useEffect(() => {
    if (!trailGuardId || !mapReady || !mapRef.current) return
    const map = mapRef.current
    const since = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()

    tdApi.locations.history({ guardId: trailGuardId, since, limit: 500 }).then(({ data }) => {
      if (!data.length) return
      const coords: [number, number][] = data.map((p: any) => [p.longitude, p.latitude])
      const sourceId = `trail-${trailGuardId}`
      const layerId = `trail-layer-${trailGuardId}`
      const colour = getColour(trailGuardId)

      if (map.getSource(sourceId)) {
        ;(map.getSource(sourceId) as any).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })
      } else {
        map.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } })
        map.addLayer({ id: layerId, type: 'line', source: sourceId, paint: { 'line-color': colour, 'line-width': 3, 'line-opacity': 0.8 } })
      }

      const lngs = coords.map((c) => c[0])
      const lats = coords.map((c) => c[1])
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, maxZoom: 17 })
    }).catch(console.error)
  }, [trailGuardId, mapReady])

  const guardList = Array.from(guards.values())

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
        }}>
          <div>
            <h1 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Live Guard Map
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: 12.5, margin: '2px 0 0' }}>
              {guardList.length === 0
                ? 'Waiting for guard locations…'
                : `${guardList.length} guard${guardList.length !== 1 ? 's' : ''} on map`}
            </p>
          </div>
          {trailGuardId && (
            <button
              onClick={() => { setTrailGuardId(null); setSelectedGuard(null) }}
              style={{
                fontSize: 13, color: 'var(--text-2)', background: 'var(--surface-2)',
                border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
              }}
            >
              Clear trail
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Guard list sidebar */}
          <div style={{
            width: 200, background: 'var(--surface)', borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            <div style={{ padding: '10px 14px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Active Guards
            </div>
            {guardList.length === 0 ? (
              <div style={{ padding: '16px 14px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
                No guards reporting yet
              </div>
            ) : (
              guardList.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { setTrailGuardId(g.id); setSelectedGuard(g.id); setTrailName(g.name) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                    textAlign: 'left', cursor: 'pointer', border: 'none',
                    background: selectedGuard === g.id ? 'var(--accent-dim)' : 'transparent',
                    width: '100%',
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => { if (selectedGuard !== g.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selectedGuard === g.id ? 'var(--accent-dim)' : 'transparent' }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.colour, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name}
                    </div>
                    <div style={{ color: 'var(--text-3)', fontSize: 11 }}>
                      {new Date(g.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Map */}
          <div style={{ flex: 1, position: 'relative' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
            {trailGuardId && (
              <div style={{
                position: 'absolute', top: 12, left: 12,
                background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '6px 12px', fontSize: 12.5, color: 'var(--text-2)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                Showing trail for <strong style={{ color: 'var(--text)' }}>{trailName}</strong> — last 8 hours
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
