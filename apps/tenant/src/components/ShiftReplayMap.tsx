'use client'
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import * as turf from '@turf/turf'

import 'mapbox-gl/dist/mapbox-gl.css'

/**
 * ShiftReplayMap — visualises a shift on the map.
 *
 * Built on the MapBox stack:
 *   - `mapbox-gl`  — base map + layers + popups + markers + fitBounds
 *   - `@turf/turf` — geofence circle polygons + bounding-box computation
 *
 * Layers (bottom → top):
 *   1. Mapbox satellite-streets basemap
 *   2. Geofence circles for every site touched in the shift (turf circles)
 *   3. Route polylines, split by on-site (Arrow orange) vs off-site
 *      (red dashed when the shift was abandoned, neutral grey for normal
 *      supervisor travel)
 *   4. Numbered Marker pins for each on-site visit, with a Popup showing
 *      site name, visit number, dwell time, and entry/exit timestamps
 *
 * No fetching — the caller passes the GET /shifts/:id/replay payload.
 */

type Site = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  geofenceRadiusMeters: number
}

type Visit = {
  id: string
  siteId: string | null
  enteredAt: string
  exitedAt: string | null
  enteredLat: number | null
  enteredLng: number | null
  exitedLat: number | null
  exitedLng: number | null
}

type Ping = {
  id: string
  latitude: number
  longitude: number
  recordedAt: string
}

type Props = {
  pings: Ping[]
  visits: Visit[]
  sites: Site[]
  wasAbandoned: boolean
  height?: number
}

/**
 * Partition the ping series into runs by which visit owns each ping. A ping
 * belongs to the most recent visit whose enteredAt ≤ pingTs < exitedAt (or
 * exitedAt is null = still open). siteId carries through; null = off-site.
 */
function pingsByVisit(pings: Ping[], visits: Visit[]) {
  const sorted = [...visits].sort(
    (a, b) => new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime()
  )
  const segments: { siteId: string | null; coords: [number, number][] }[] = []
  let current: { siteId: string | null; coords: [number, number][] } | null = null
  for (const p of pings) {
    const pt = new Date(p.recordedAt).getTime()
    let owner: Visit | undefined
    for (const v of sorted) {
      const start = new Date(v.enteredAt).getTime()
      const end = v.exitedAt ? new Date(v.exitedAt).getTime() : Infinity
      if (pt >= start && pt < end) {
        owner = v
        break
      }
    }
    const siteId = owner?.siteId ?? null
    if (!current || current.siteId !== siteId) {
      current = { siteId, coords: [] }
      segments.push(current)
    }
    current.coords.push([p.longitude, p.latitude])
  }
  return segments
}

export function ShiftReplayMap({ pings, visits, sites, wasAbandoned, height = 460 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = token

    // Pick a sensible initial centre — the first site, else the first ping,
    // else India centroid as a harmless fallback for an empty render.
    const seed =
      sites.find((s) => s.latitude != null && s.longitude != null) ??
      (pings[0] ? { latitude: pings[0].latitude, longitude: pings[0].longitude } : null)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: seed ? [seed.longitude!, seed.latitude!] : [78.9629, 20.5937],
      zoom: seed ? 15 : 4,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      // ── Geofence circles ───────────────────────────────────────────────
      const geofences = turf.featureCollection(
        sites
          .filter((s) => s.latitude != null && s.longitude != null)
          .map((s) =>
            turf.circle([s.longitude!, s.latitude!], s.geofenceRadiusMeters / 1000, {
              units: 'kilometers',
              steps: 64,
              properties: { siteId: s.id, siteName: s.name },
            })
          )
      )
      map.addSource('geofences', { type: 'geojson', data: geofences })
      map.addLayer({
        id: 'geofence-fill',
        type: 'fill',
        source: 'geofences',
        paint: { 'fill-color': '#10b981', 'fill-opacity': 0.08 },
      })
      map.addLayer({
        id: 'geofence-line',
        type: 'line',
        source: 'geofences',
        paint: {
          'line-color': '#10b981',
          'line-width': 1.5,
          'line-dasharray': [3, 2],
        },
      })

      // ── Route polylines, split by on/off-site ──────────────────────────
      const segments = pingsByVisit(pings, visits)
      const routeFc = turf.featureCollection(
        segments
          .filter((s) => s.coords.length >= 2)
          .map((s) =>
            turf.lineString(s.coords, { onSite: s.siteId !== null ? 1 : 0 })
          )
      )
      map.addSource('route', { type: 'geojson', data: routeFc })
      map.addLayer({
        id: 'route-on-site',
        type: 'line',
        source: 'route',
        filter: ['==', ['get', 'onSite'], 1],
        paint: { 'line-color': '#c96442', 'line-width': 3, 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'route-off-site',
        type: 'line',
        source: 'route',
        filter: ['==', ['get', 'onSite'], 0],
        paint: {
          'line-color': wasAbandoned ? '#ef4444' : '#9a9490',
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [2, 1.5],
        },
      })

      // ── Numbered visit markers ─────────────────────────────────────────
      let visitNum = 0
      const onSiteVisits = [...visits]
        .filter((v) => v.siteId !== null)
        .sort((a, b) => new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime())

      for (const v of onSiteVisits) {
        if (v.enteredLat == null || v.enteredLng == null) continue
        visitNum++
        const site = sites.find((s) => s.id === v.siteId)
        const exitedAt = v.exitedAt ? new Date(v.exitedAt) : new Date()
        const dwellMin = Math.round(
          (exitedAt.getTime() - new Date(v.enteredAt).getTime()) / 60000
        )

        const el = document.createElement('div')
        el.style.cssText = [
          'background:#c96442',
          'color:#ffffff',
          'border:2px solid #ffffff',
          'border-radius:50%',
          'width:30px',
          'height:30px',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'font-weight:700',
          'font-size:13px',
          'box-shadow:0 2px 4px rgba(0,0,0,0.2)',
          'font-family:Inter,system-ui,sans-serif',
          'cursor:pointer',
        ].join(';')
        el.textContent = String(visitNum)

        new mapboxgl.Marker(el)
          .setLngLat([v.enteredLng, v.enteredLat])
          .setPopup(
            new mapboxgl.Popup({ offset: 18 }).setHTML(
              `<div style="font-family:Inter,system-ui,sans-serif;font-size:13px;">
                <strong>${site?.name ?? 'Site'}</strong><br/>
                Visit ${visitNum} · ${dwellMin} min<br/>
                <span style="color:#9a9490;">${new Date(v.enteredAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })} – ${
                v.exitedAt
                  ? new Date(v.exitedAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'still here'
              }</span>
              </div>`
            )
          )
          .addTo(map)
      }

      // ── Fit camera to the union of all geometry via turf.bbox ──────────
      const allFeatures: any[] = [...geofences.features, ...routeFc.features]
      for (const p of pings) {
        allFeatures.push(turf.point([p.longitude, p.latitude]))
      }
      if (allFeatures.length > 0) {
        const bbox = turf.bbox(turf.featureCollection(allFeatures)) as [number, number, number, number]
        map.fitBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          { padding: 60, duration: 0, maxZoom: 17 }
        )
      }
    })

    return () => {
      try { map.remove() } catch { /* ignore */ }
      mapRef.current = null
    }
  }, [pings, visits, sites, wasAbandoned, token])

  if (!token) {
    return (
      <div
        style={{
          height,
          borderRadius: 8,
          border: '1px dashed var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text-3)',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
          textAlign: 'center',
        }}
      >
        NEXT_PUBLIC_MAPBOX_TOKEN is not set — shift replay map unavailable.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
      }}
    />
  )
}
