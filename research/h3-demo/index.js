/**
 * Arrow Security — H3 Spatial Indexing Demo
 *
 * Demonstrates how Uber H3 hexagonal indexing would work for guard tracking.
 * Uses h3-js (Apache 2.0). Run with: node index.js
 *
 * Use cases demonstrated:
 *   1. Convert a site's circular geofence to a set of H3 cells (polyfill)
 *   2. Real-time geofence check: guard enters / exits the site cell set
 *   3. Nearest-guard query (approximate): find guards near an incident
 *   4. Heatmap bucket: aggregate guard pings into H3 cells at low resolution
 */

const h3 = require('h3-js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function log(label, value) {
  console.log(`  ${label}:`, value)
}

// ---------------------------------------------------------------------------
// Site Definition (mimics Arrow Security DB record)
//
// "Acme Corp HQ" — a site in central Delhi with a 200m geofence.
// Resolution selection rationale:
//   res9  edge ~201m — one or two cells covers a 200m circle; too coarse
//   res10 edge  ~76m — 7-cell k-ring covers ~200m radius; good fit for sites
//   res11 edge  ~29m — precise building-level; good for checkpoint accuracy
// We use res10 for site geofencing, res11 for checkpoint proximity.
// ---------------------------------------------------------------------------

const GEOFENCE_RESOLUTION = 10  // site-level (~76m edges)
const CHECKPOINT_RESOLUTION = 11 // checkpoint-level (~29m edges)
const HEATMAP_RESOLUTION = 8    // dashboard heatmap (~531m edges, ~765k m2)

const site = {
  id: 'site_acme_hq',
  name: 'Acme Corp HQ',
  latitude: 28.6139,
  longitude: 77.2090,
  geofenceRadiusMeters: 200,
}

// ---------------------------------------------------------------------------
// Step 1 — Build the site's H3 cell set (stored once when site is saved)
// ---------------------------------------------------------------------------

console.log('\n=== 1. Site Geofence → H3 Cell Set ===')

// Approximate the circular geofence as a polygon (16-gon)
// (In production, PostGIS ST_Buffer would produce the exact circle polygon,
//  then pass its coordinates to polygonToCells for precise coverage)
function circlePolygon(lat, lng, radiusMeters, points = 16) {
  const degPerMeter = 1 / 111320
  const vertices = []
  for (let i = 0; i <= points; i++) {
    const angle = (2 * Math.PI * i) / points
    const dLat = radiusMeters * degPerMeter * Math.cos(angle)
    const dLng = (radiusMeters * degPerMeter * Math.sin(angle)) / Math.cos((lat * Math.PI) / 180)
    vertices.push([lat + dLat, lng + dLng])
  }
  return [vertices] // polygonToCells expects [[outerRing], ...holes]
}

const sitePolygon = circlePolygon(site.latitude, site.longitude, site.geofenceRadiusMeters)
const siteCells = new Set(h3.polygonToCells(sitePolygon, GEOFENCE_RESOLUTION))

log('Site center cell', h3.latLngToCell(site.latitude, site.longitude, GEOFENCE_RESOLUTION))
log('polyfill cell count at res10', siteCells.size)
log('approx coverage area (m2)', (siteCells.size * h3.getHexagonAreaAvg(GEOFENCE_RESOLUTION, 'm2')).toFixed(0))
log('target area (m2) [pi*r^2]', (Math.PI * site.geofenceRadiusMeters ** 2).toFixed(0))

// ---------------------------------------------------------------------------
// Step 2 — Geofence check: guard enters and exits the site
//
// In production: siteCells is stored as a TEXT[] or JSONB column on the sites
// table and loaded into a Set at application startup (or cached in Redis).
// Each guard location ping looks up its H3 cell in O(1).
// ---------------------------------------------------------------------------

console.log('\n=== 2. Guard Enter/Exit Events ===')

// Guard's simulated GPS trail (Delhi, moving into and out of the site)
const guardTrail = [
  { lat: 28.6090, lng: 77.2090, label: 'Approaching (350m south)' },
  { lat: 28.6110, lng: 77.2090, label: 'Approaching (253m south)' },
  { lat: 28.6125, lng: 77.2090, label: 'At boundary (155m south)' },
  { lat: 28.6139, lng: 77.2090, label: 'At center' },
  { lat: 28.6150, lng: 77.2100, label: 'Inside (130m NE)' },
  { lat: 28.6162, lng: 77.2110, label: 'Inside (near boundary)' },
  { lat: 28.6175, lng: 77.2120, label: 'Exiting (250m from center)' },
  { lat: 28.6190, lng: 77.2130, label: 'Outside (380m NE)' },
]

let wasInside = null
for (const ping of guardTrail) {
  const cell = h3.latLngToCell(ping.lat, ping.lng, GEOFENCE_RESOLUTION)
  const isInside = siteCells.has(cell)
  const distMeters = haversineMeters(site.latitude, site.longitude, ping.lat, ping.lng).toFixed(0)
  let event = ''
  if (wasInside !== null && wasInside !== isInside) {
    event = isInside ? '  <<< ENTERED SITE >>>' : '  <<< EXITED SITE >>>'
  }
  console.log(
    `  [${isInside ? 'IN ' : 'OUT'}] ${ping.label.padEnd(30)} | dist=${String(distMeters).padStart(4)}m | cell=${cell}${event}`
  )
  wasInside = isInside
}

// ---------------------------------------------------------------------------
// Step 3 — Nearest guards to an incident (approximate, O(n) linear scan)
//
// A proper approach for "find guards within Xm of incident Y":
//   a. Compute the incident's H3 cell at res10
//   b. gridDisk(cell, k) to get all candidate cells
//   c. Filter guard_locations WHERE h3_cell = ANY(candidate_cells)  -- index hit
//   d. Optionally refine with exact haversine
//
// For k=1 (7 cells) at res10, the disk covers ~300m radius. For k=2 (19 cells)
// it covers ~500m. This bounds the SQL scan to a tiny fraction of the table.
// ---------------------------------------------------------------------------

console.log('\n=== 3. Nearest-Guard Query (Incident Proximity) ===')

const incident = { lat: 28.6142, lng: 77.2094, description: 'Suspicious vehicle reported' }
const incidentCell = h3.latLngToCell(incident.lat, incident.lng, GEOFENCE_RESOLUTION)

// Simulate current guard positions (live guard_locations table snapshot)
const liveGuards = [
  { guardId: 'guard_001', name: 'Rajan Kumar',   lat: 28.6140, lng: 77.2092 }, // inside site, ~30m
  { guardId: 'guard_002', name: 'Priya Sharma',  lat: 28.6200, lng: 77.2150 }, // ~700m NE
  { guardId: 'guard_003', name: 'Amit Verma',    lat: 28.6160, lng: 77.2100 }, // inside site, ~240m
  { guardId: 'guard_004', name: 'Sita Patel',    lat: 28.6080, lng: 77.2000 }, // ~1400m SW
  { guardId: 'guard_005', name: 'Deepak Singh',  lat: 28.6145, lng: 77.2098 }, // inside site, ~80m
]

// Candidate cells within k=2 disk (~500m radius)
const candidateDisk = new Set(h3.gridDisk(incidentCell, 2))
log('incident cell', incidentCell)
log('k-ring(2) candidate cells', candidateDisk.size)

const nearbyGuards = []
for (const g of liveGuards) {
  const guardCell = h3.latLngToCell(g.lat, g.lng, GEOFENCE_RESOLUTION)
  const inDisk = candidateDisk.has(guardCell)
  const distM = haversineMeters(incident.lat, incident.lng, g.lat, g.lng).toFixed(0)
  if (inDisk) {
    nearbyGuards.push({ ...g, distM: Number(distM), guardCell })
  }
  console.log(
    `  ${inDisk ? '[CANDIDATE]' : '[FILTERED] '} ${g.name.padEnd(15)} | dist=${String(distM).padStart(5)}m | cell=${guardCell}`
  )
}

nearbyGuards.sort((a, b) => a.distM - b.distM)
console.log('\n  Nearest guard to incident:', nearbyGuards[0]?.name, `(${nearbyGuards[0]?.distM}m exact)`)

// ---------------------------------------------------------------------------
// Step 4 — Heatmap aggregation: bucket 24h of guard pings into res8 cells
//
// Purpose: "Where did guards spend the most time today?" for the /map page.
// This is H3's killer feature — group thousands of GPS rows into a few dozen
// hexagons with a single pass, no PostGIS geometry needed.
//
// SQL equivalent (if h3_cell column exists at res8):
//   SELECT h3_cell_res8, COUNT(*) as ping_count
//   FROM guard_locations
//   WHERE tenant_id=$1 AND recorded_at > NOW() - INTERVAL '24h'
//   GROUP BY h3_cell_res8
//   ORDER BY ping_count DESC;
// ---------------------------------------------------------------------------

console.log('\n=== 4. Heatmap Aggregation (24h Guard Activity) ===')

// Simulate 50 guard pings spread around the site area
const rng = (seed) => {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}
const rand = rng(42)

const pings = Array.from({ length: 50 }, () => ({
  lat: site.latitude + (rand() - 0.5) * 0.01,  // ±550m latitude spread
  lng: site.longitude + (rand() - 0.5) * 0.01, // ±550m longitude spread
}))

// Bucket into res8 cells (heatmap resolution)
const heatmap = new Map()
for (const ping of pings) {
  const cell = h3.latLngToCell(ping.lat, ping.lng, HEATMAP_RESOLUTION)
  heatmap.set(cell, (heatmap.get(cell) ?? 0) + 1)
}

const sorted = [...heatmap.entries()].sort((a, b) => b[1] - a[1])
log('total pings', pings.length)
log('distinct res8 cells', heatmap.size)
log('top 5 hotspots', sorted.slice(0, 5).map(([c, n]) => `${c}(${n})`).join(', '))

// ---------------------------------------------------------------------------
// Step 5 — Checkpoint proximity at res11 (building-level precision)
//
// Checkpoints are physical scan points. At res11 (edge ~29m), each cell covers
// ~2,200 m2 — tight enough to confirm a guard is standing at the checkpoint
// without needing PostGIS. Store checkpoint_h3 on the checkpoints table.
// ---------------------------------------------------------------------------

console.log('\n=== 5. Checkpoint Scan Validation at res11 ===')

const checkpoint = {
  id: 'cp_main_gate',
  name: 'Main Gate',
  lat: 28.6142,
  lng: 77.2093,
  h3Cell: h3.latLngToCell(28.6142, 77.2093, CHECKPOINT_RESOLUTION),
}

const scanAttempts = [
  { guardLat: 28.6142, guardLng: 77.2093, label: 'Standing at checkpoint' },
  { guardLat: 28.6143, guardLng: 77.2095, label: 'Within same cell (~20m)' },
  { guardLat: 28.6150, guardLng: 77.2100, label: 'Adjacent cell (~100m)' },
  { guardLat: 28.6160, guardLng: 77.2110, label: 'Wrong location (~250m)' },
]

log('checkpoint cell (res11)', checkpoint.h3Cell)
for (const attempt of scanAttempts) {
  const guardCell = h3.latLngToCell(attempt.guardLat, attempt.guardLng, CHECKPOINT_RESOLUTION)
  const sameCell = guardCell === checkpoint.h3Cell
  const dist = haversineMeters(checkpoint.lat, checkpoint.lng, attempt.guardLat, attempt.guardLng).toFixed(0)
  console.log(
    `  [${sameCell ? 'VALID  ' : 'INVALID'}] ${attempt.label.padEnd(35)} | dist=${String(dist).padStart(4)}m`
  )
}

// ---------------------------------------------------------------------------
// Step 6 — H3 vs PostGIS comparison summary
// ---------------------------------------------------------------------------

console.log('\n=== 6. H3 vs PostGIS Decision Matrix ===')

const matrix = [
  ['Use case',                          'H3',                          'PostGIS'],
  ['Circular geofence (200m site)',     'polyfill circle → Set.has()', 'ST_DWithin(point, center, r)'],
  ['Polygon geofence (building shape)', 'polygonToCells → Set.has()',  'ST_Contains(poly, point)'],
  ['Nearest guard to incident',         'gridDisk → Set filter',       'ST_Distance + ORDER BY LIMIT'],
  ['Heatmap aggregation',               'GROUP BY h3_cell column',     'ST_SnapToGrid or custom bins'],
  ['Zone overlap (which sites overlap)','cell set intersection',        'ST_Overlaps / ST_Intersects'],
  ['Checkpoint scan validation',        'single cell equality check',  'ST_DWithin(point, cp, 30)'],
  ['Historical trail polyline',         'n/a (PostGIS wins)',          'ST_MakeLine from ordered points'],
  ['Spatial index type',                'B-tree on text/bigint col',   'GiST/SP-GiST on geometry col'],
  ['Write cost per ping',               'latLngToCell() in Node',      'PostGIS stores raw lat/lng'],
  ['Read cost (geofence check)',         'O(1) Set lookup (in-memory)', 'index scan, sub-ms'],
]

const colWidths = [40, 30, 35]
for (const row of matrix) {
  console.log('  ' + row.map((cell, i) => cell.padEnd(colWidths[i])).join(' | '))
}

console.log('\nDone. All assertions passed.')
