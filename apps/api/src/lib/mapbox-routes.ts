import { db, siteRoutes, sites } from '@secureops/db'
import { eq, and, inArray } from 'drizzle-orm'

// How long a cached route is trusted before we refetch from Mapbox.
// Sites rarely move; roads change slowly. Six months is a comfortable middle.
const CACHE_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000

interface SitePoint {
  id: string
  latitude: number
  longitude: number
}

interface RouteResult {
  durationSeconds: number
  distanceMeters: number
}

/**
 * Hit Mapbox Directions API for one ordered pair of sites and return the
 * driving estimate. Returns null on any failure (missing token, network
 * error, no route found) — callers treat that as "no reimbursable drive
 * for this pair" rather than failing the whole report.
 *
 * Coordinates go in lng,lat (Mapbox convention), not lat,lng.
 */
async function fetchMapboxRoute(
  from: SitePoint,
  to: SitePoint,
): Promise<RouteResult | null> {
  const token = process.env.MAPBOX_SERVER_TOKEN
  if (!token) return null

  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${encodeURIComponent(token)}&overview=false&geometries=geojson`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const json = (await res.json()) as { routes?: Array<{ duration: number; distance: number }> }
    const route = json.routes?.[0]
    if (!route) return null
    return {
      durationSeconds: Math.round(route.duration),
      distanceMeters: Math.round(route.distance),
    }
  } catch {
    return null
  }
}

/**
 * Bulk-resolve driving estimates for many site pairs at once. Hits the cache
 * first; any pair that is missing or stale is fetched from Mapbox and
 * upserted before being returned. Same-site pairs short-circuit to 0.
 *
 * Returns a Map keyed by `${fromId}|${toId}`. Missing entries (Mapbox
 * unreachable or token unset) are simply absent from the map.
 */
export async function getRoutesForPairs(
  tenantId: string,
  pairs: Array<{ fromSiteId: string; toSiteId: string }>,
): Promise<Map<string, RouteResult>> {
  const out = new Map<string, RouteResult>()
  if (pairs.length === 0) return out

  // Deduplicate the request set — a supervisor walking A→B→A→B in one day
  // is still just two distinct ordered pairs.
  const uniqueKeys = new Set<string>()
  const unique: Array<{ fromSiteId: string; toSiteId: string }> = []
  for (const p of pairs) {
    const k = `${p.fromSiteId}|${p.toSiteId}`
    if (uniqueKeys.has(k)) continue
    uniqueKeys.add(k)
    unique.push(p)
  }

  // Same-site pairs are free (driving from A to A = 0). Handled here so the
  // cache table doesn't fill with degenerate rows.
  const needLookup: Array<{ fromSiteId: string; toSiteId: string }> = []
  for (const p of unique) {
    if (p.fromSiteId === p.toSiteId) {
      out.set(`${p.fromSiteId}|${p.toSiteId}`, { durationSeconds: 0, distanceMeters: 0 })
      continue
    }
    needLookup.push(p)
  }
  if (needLookup.length === 0) return out

  // Cache check — one query for all the from-site IDs we care about, filtered
  // down in JS. (A composite IN over (from, to) pairs requires a different
  // query shape; this scope is small so the broad pull is fine.)
  const fromIds = Array.from(new Set(needLookup.map((p) => p.fromSiteId)))
  const cached = await db
    .select()
    .from(siteRoutes)
    .where(and(eq(siteRoutes.tenantId, tenantId), inArray(siteRoutes.fromSiteId, fromIds)))

  const cacheByKey = new Map<string, typeof cached[number]>()
  for (const row of cached) {
    cacheByKey.set(`${row.fromSiteId}|${row.toSiteId}`, row)
  }

  const now = Date.now()
  const stale: Array<{ fromSiteId: string; toSiteId: string }> = []
  for (const p of needLookup) {
    const key = `${p.fromSiteId}|${p.toSiteId}`
    const hit = cacheByKey.get(key)
    if (hit && now - new Date(hit.computedAt).getTime() < CACHE_TTL_MS) {
      out.set(key, { durationSeconds: hit.durationSeconds, distanceMeters: hit.distanceMeters })
    } else {
      stale.push(p)
    }
  }
  if (stale.length === 0) return out

  // Resolve coordinates for every site we still need to fetch.
  const siteIdsToLoad = Array.from(new Set(stale.flatMap((p) => [p.fromSiteId, p.toSiteId])))
  const siteRows = await db
    .select({ id: sites.id, latitude: sites.latitude, longitude: sites.longitude })
    .from(sites)
    .where(and(eq(sites.tenantId, tenantId), inArray(sites.id, siteIdsToLoad)))

  const siteById = new Map<string, SitePoint>()
  for (const s of siteRows) {
    siteById.set(s.id, { id: s.id, latitude: Number(s.latitude), longitude: Number(s.longitude) })
  }

  // Fetch from Mapbox one at a time. Could be parallelised with a small
  // concurrency limit if this ever becomes hot — for now a tenant has a
  // handful of new pairs per month at most.
  for (const p of stale) {
    const from = siteById.get(p.fromSiteId)
    const to   = siteById.get(p.toSiteId)
    if (!from || !to) continue
    const route = await fetchMapboxRoute(from, to)
    if (!route) continue

    const key = `${p.fromSiteId}|${p.toSiteId}`
    out.set(key, route)

    // Upsert into the cache. ON CONFLICT updates the timestamp + numbers so
    // a stale row is refreshed in place.
    await db
      .insert(siteRoutes)
      .values({
        tenantId,
        fromSiteId: p.fromSiteId,
        toSiteId: p.toSiteId,
        durationSeconds: route.durationSeconds,
        distanceMeters: route.distanceMeters,
      })
      .onConflictDoUpdate({
        target: [siteRoutes.fromSiteId, siteRoutes.toSiteId],
        set: {
          durationSeconds: route.durationSeconds,
          distanceMeters: route.distanceMeters,
          computedAt: new Date(),
        },
      })
  }

  return out
}
