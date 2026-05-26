'use client'
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
// @ts-expect-error — no types ship with the plugin
import { DragCircleMode, DirectMode, SimpleSelectMode } from 'mapbox-gl-draw-circle'
import * as turf from '@turf/turf'

import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'

/**
 * GeofenceMap — visual editor for a site's geofence circle.
 *
 * Built on the MapBox stack so we don't hand-roll any map mechanics:
 *   - `mapbox-gl`               — base map + tiles + camera
 *   - `@mapbox/mapbox-gl-draw`  — official drawing/editing primitives
 *   - `mapbox-gl-draw-circle`   — community Draw mode that adds a circle
 *                                 primitive with drag-to-resize handles
 *                                 and drag-to-move on the whole shape
 *   - `@turf/turf`              — geodesic math (distance, centre, etc.)
 *
 * Caller passes (latitude, longitude, radiusMeters); we fire `onChange` with
 * a partial whenever the user moves or resizes the circle, or clicks the map
 * to recentre. The styling matches our palette — orange Arrow accent on a
 * dark satellite basemap so the boundary reads at a glance.
 */

type Props = {
  latitude: number | null
  longitude: number | null
  radiusMeters: number
  onChange?: (
    next: Partial<{ latitude: number; longitude: number; radiusMeters: number }>
  ) => void
  height?: number
}

const MIN_RADIUS_M = 10
const MAX_RADIUS_M = 5000

export function GeofenceMap({
  latitude,
  longitude,
  radiusMeters,
  onChange,
  height = 320,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const featureIdRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

  // ── Initialise once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = token

    const lat = latitude ?? 20.5937
    const lng = longitude ?? 78.9629

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // satellite + labels is the right basemap for siting a geofence
      center: [lng, lat],
      zoom: latitude && longitude ? 17 : 5,
      cooperativeGestures: false,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      // Initialise the Draw plugin with the community Circle mode added.
      // We pass the additional modes from `mapbox-gl-draw-circle` so the
      // user can drag the circle (DirectMode/SimpleSelectMode) AND resize it
      // by dragging the radius handle (DragCircleMode).
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        userProperties: true,
        // The plugin overrides Draw's built-in modes so dragging works.
        modes: {
          ...MapboxDraw.modes,
          draw_circle: DragCircleMode,
          direct_select: DirectMode,
          simple_select: SimpleSelectMode,
        },
        styles: drawStyles(),
      })
      map.addControl(draw)
      drawRef.current = draw

      // Seed the editor with the existing geofence as a turf circle, tagged
      // so the plugin recognises it.
      const initial = turf.circle([lng, lat], radiusMeters / 1000, {
        units: 'kilometers',
        steps: 64,
        properties: { isCircle: true, center: [lng, lat], radiusInKm: radiusMeters / 1000 },
      })
      const [featureId] = draw.add(initial)
      featureIdRef.current = featureId
      draw.changeMode('simple_select', { featureIds: [featureId] })

      // Emit changes back to the parent whenever the user edits the shape.
      const emit = () => {
        const feature = draw.get(featureIdRef.current!)
        if (!feature) return
        const props = feature.properties as any
        if (!props?.isCircle) return
        const [cLng, cLat] = props.center as [number, number]
        const km = props.radiusInKm as number
        const next = Math.round(
          Math.max(MIN_RADIUS_M, Math.min(MAX_RADIUS_M, km * 1000))
        )
        onChangeRef.current?.({ latitude: cLat, longitude: cLng, radiusMeters: next })
      }
      map.on('draw.update', emit)
      map.on('draw.create', emit)

      // Click on empty map → recentre the circle. Reads the existing radius
      // off the feature so we keep size during a relocation.
      map.on('click', (e) => {
        // Skip if the click hit the feature itself (Draw handles drags).
        const featureAtPoint = draw.getFeatureIdsAt(e.point)
        if (featureAtPoint.length > 0) return
        const feature = draw.get(featureIdRef.current!)
        const props = (feature?.properties ?? {}) as any
        const km = (props.radiusInKm ?? radiusMeters / 1000) as number
        const next = turf.circle([e.lngLat.lng, e.lngLat.lat], km, {
          units: 'kilometers',
          steps: 64,
          properties: {
            isCircle: true,
            center: [e.lngLat.lng, e.lngLat.lat],
            radiusInKm: km,
          },
        })
        if (featureIdRef.current) draw.delete(featureIdRef.current)
        const [id] = draw.add(next)
        featureIdRef.current = id
        draw.changeMode('simple_select', { featureIds: [id] })
        emit()
      })
    })

    return () => {
      drawRef.current = null
      featureIdRef.current = null
      try { map.remove() } catch { /* ignore */ }
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ── Sync external prop changes into the editor ───────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const draw = drawRef.current
    if (!map || !draw || latitude == null || longitude == null) return
    const id = featureIdRef.current
    if (!id) return
    const feature = draw.get(id)
    const props = (feature?.properties ?? {}) as any
    const [curLng, curLat] = (props.center ?? [longitude, latitude]) as [number, number]
    const curKm = (props.radiusInKm ?? radiusMeters / 1000) as number
    const targetKm = radiusMeters / 1000
    const sameCenter = Math.abs(curLat - latitude) < 1e-7 && Math.abs(curLng - longitude) < 1e-7
    const sameRadius = Math.abs(curKm - targetKm) < 1e-4
    if (sameCenter && sameRadius) return

    const next = turf.circle([longitude, latitude], targetKm, {
      units: 'kilometers',
      steps: 64,
      properties: {
        isCircle: true,
        center: [longitude, latitude],
        radiusInKm: targetKm,
      },
    })
    draw.delete(id)
    const [newId] = draw.add(next)
    featureIdRef.current = newId
    draw.changeMode('simple_select', { featureIds: [newId] })
    map.panTo([longitude, latitude], { duration: 200 })
  }, [latitude, longitude, radiusMeters])

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
        NEXT_PUBLIC_MAPBOX_TOKEN is not set — geofence editor unavailable.
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

/**
 * Draw style overrides — uses our Arrow orange accent for the circle and
 * white handles with an orange ring so they read against the satellite tiles.
 * Mostly mirrors mapbox-gl-draw defaults except for colours.
 */
function drawStyles() {
  return [
    {
      id: 'gl-draw-polygon-fill',
      type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon']],
      paint: { 'fill-color': '#c96442', 'fill-opacity': 0.15 },
    },
    {
      id: 'gl-draw-polygon-stroke-active',
      type: 'line',
      filter: ['all', ['==', '$type', 'Polygon']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#c96442', 'line-width': 2 },
    },
    {
      id: 'gl-draw-polygon-and-line-vertex-halos-active',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 8, 'circle-color': '#ffffff' },
    },
    {
      id: 'gl-draw-polygon-and-line-vertex-active',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: {
        'circle-radius': 6,
        'circle-color': '#c96442',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    },
  ]
}
