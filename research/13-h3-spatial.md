# Investigation 13 — Uber H3 Spatial Indexing for Guard Tracking

**Date:** 2026-05-17
**Stack context:** Fastify 4 + TypeScript + PostgreSQL + Drizzle ORM + PostGIS available. MapLibre GL on web. Sites have `latitude`, `longitude`, `geofence_radius_meters`. `guard_locations` has raw lat/lng GPS pings.

---

## Summary

H3 is Uber's hexagonal hierarchical spatial index. For Arrow Security's current use cases, **PostGIS alone covers everything adequately** — it has exact polygon operations, spatial indexes already tuned for PostgreSQL, and zero new Node.js dependencies. H3 adds genuine value in exactly two scenarios: (1) **heatmap aggregation** where grouping pings by a pre-computed cell column is dramatically simpler than any PostGIS approach, and (2) **in-memory geofence checks** where the site's cell set is cached in the API process and each incoming GPS ping is resolved to a cell ID with a single `Set.has()` call, bypassing the DB entirely.

The verdict for Arrow Security: **do not adopt H3 as a primary spatial layer**. PostGIS is the right primary. Add H3 optionally for heatmaps when that feature is built, and consider the in-memory cell-set pattern if geofencing query volume grows beyond what a PostGIS index can handle at your scale. At current scale (one tenant, dozens of guards) PostGIS wins on simplicity.

---

## Stack and Dependencies

| Package | Version | License | Size |
|---------|---------|---------|------|
| `h3-js` | 4.x | Apache 2.0 | ~1.2 MB (WASM + JS) |
| `h3` (C library) | 4.x | Apache 2.0 | — (used by h3-js) |
| `h3-pg` (PostgreSQL extension) | 4.x | Apache 2.0 | optional, see below |

**h3-js** is the TypeScript/Node.js binding to the H3 C library compiled to WebAssembly. It is the correct package for use in the Fastify API and in the browser (MapLibre integration). The API is fully synchronous — no async required.

**h3-pg** is a PostgreSQL extension that exposes H3 functions as SQL (`h3_lat_lng_to_cell`, `h3_grid_disk`, `h3_cell_to_boundary`, etc.). It requires compilation against the Postgres headers. It is **not** available as a pre-installed extension in standard PostgreSQL Docker images — you would need a custom image or a managed provider that supports it (Supabase does, Neon does not yet). For Arrow Security's current Docker Compose setup this is an extra step with no immediate payoff, since the same operations can be done in the Node layer.

---

## How H3 Works

H3 divides the Earth's surface into a hierarchy of 16 resolution levels (0 = continent-sized, 15 = 1 m2). Each cell is a hexagon (with 12 pentagons globally for geometric closure). Every cell has a 64-bit integer ID (displayed as a 15-character hex string). The hierarchy is hierarchical but not perfectly nested — each parent cell contains approximately 7 children at the next resolution level.

**Key properties relevant to Arrow Security:**

| Resolution | Edge length | Cell area | Best for |
|-----------|------------|----------|---------|
| res8 | ~531 m | ~765,000 m2 | Heatmap/dashboard tiles |
| res9 | ~201 m | ~109,000 m2 | Large campus geofencing |
| res10 | ~76 m | ~15,600 m2 | Standard site geofencing (200m radius sites) |
| res11 | ~29 m | ~2,200 m2 | Checkpoint proximity validation |
| res12 | ~11 m | ~319 m2 | Indoor navigation (not needed) |

For a 200m geofence radius site: a `polygonToCells` polyfill at **res10** produces 7 cells covering ~105,000 m2 vs the target 125,664 m2 (~84% coverage). Adding one ring of buffer cells (`gridDisk(centerCell, 1)` = 7 cells) overshoots at ~420m coverage. The polyfill approach is therefore slightly undercovering relative to the exact circle. PostGIS `ST_DWithin` is geometrically exact. This is a concrete reason to prefer PostGIS for geofencing.

---

## Data Model

### Option A — Store raw lat/lng only (current state, PostGIS for spatial queries)

```sql
-- Existing schema (no changes needed for PostGIS)
ALTER TABLE sites
  ADD COLUMN geofence_point geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_point);

ALTER TABLE guard_locations
  ADD COLUMN position geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

CREATE INDEX idx_guard_locations_position ON guard_locations USING GIST(position);

-- Geofence check: is guard within 200m of site center?
SELECT s.id, s.name
FROM sites s
WHERE ST_DWithin(
  s.geofence_point::geography,
  ST_SetSRID(ST_MakePoint($guardLng, $guardLat), 4326)::geography,
  s.geofence_radius_meters
);
```

### Option B — Add H3 cell columns alongside lat/lng (hybrid approach)

```sql
-- Drizzle schema additions (packages/db/src/schema/)

-- On guard_locations: pre-compute H3 cell at ping time in the Node layer
ALTER TABLE guard_locations
  ADD COLUMN h3_res10 text,   -- used for real-time geofence lookup
  ADD COLUMN h3_res8  text;   -- used for heatmap aggregation

-- B-tree index is sufficient — no GiST needed for H3 (it's just a string)
CREATE INDEX idx_guard_locations_h3_res10 ON guard_locations(tenant_id, h3_res10);
CREATE INDEX idx_guard_locations_h3_res8  ON guard_locations(tenant_id, h3_res8);

-- On sites: store the polyfill as a JSONB array (computed once at site creation)
ALTER TABLE sites
  ADD COLUMN h3_cells_res10 text[] DEFAULT '{}';

CREATE INDEX idx_sites_h3_cells ON sites USING GIN(h3_cells_res10);

-- Geofence check with H3:
SELECT s.id, s.name
FROM sites s
WHERE $guardCell = ANY(s.h3_cells_res10)
  AND s.tenant_id = $tenantId;

-- Heatmap query (trivial with H3):
SELECT h3_res8, COUNT(*) as ping_count
FROM guard_locations
WHERE tenant_id = $tenantId
  AND recorded_at > NOW() - INTERVAL '24h'
GROUP BY h3_res8
ORDER BY ping_count DESC;
```

### Drizzle ORM additions (TypeScript)

```typescript
// packages/db/src/schema/locations.ts — add H3 columns
import { pgTable, text, doublePrecision, timestamp } from 'drizzle-orm/pg-core'

export const guardLocations = pgTable('guard_locations', {
  // ... existing columns ...
  h3Res10: text('h3_res10'),  // computed in API before insert
  h3Res8:  text('h3_res8'),   // computed in API before insert
})

// packages/db/src/schema/sites.ts — store the polyfill
import { pgTable, text, integer } from 'drizzle-orm/pg-core'

export const sites = pgTable('sites', {
  // ... existing columns ...
  h3CellsRes10: text('h3_cells_res10').array().default([]),
})
```

---

## API / Interface Surface (h3-js)

All functions are synchronous. Import: `import * as h3 from 'h3-js'` or `const h3 = require('h3-js')`.

```typescript
// Coordinate → cell
h3.latLngToCell(lat: number, lng: number, resolution: number): string

// Cell → center coordinate
h3.cellToLatLng(cell: string): [lat: number, lng: number]

// Cell → boundary polygon (6 vertices for hexagon)
h3.cellToBoundary(cell: string): [lat: number, lng: number][]

// Cell → parent at lower resolution
h3.cellToParent(cell: string, parentRes: number): string

// Cell → all children at higher resolution
h3.cellToChildren(cell: string, childRes: number): string[]

// Disk of cells within k grid steps (k=1 → 7 cells, k=2 → 19 cells)
h3.gridDisk(cell: string, k: number): string[]

// Ring at exactly k steps (excludes interior)
h3.gridRingUnsafe(cell: string, k: number): string[]

// Polyfill polygon with cells at given resolution
// polygon: [[outerRing], ...holes] where each ring is [lat,lng] pairs
h3.polygonToCells(polygon: number[][][], resolution: number): string[]

// Check if cell is valid
h3.isValidCell(cell: string): boolean

// Grid distance between two cells (hops, not meters)
h3.gridDistance(a: string, b: string): number

// Compact a set of cells (replace groups of 7 children with parent)
h3.compactCells(cells: string[]): string[]

// Uncompact to a target resolution
h3.uncompactCells(cells: string[], resolution: number): string[]

// Average edge length at a resolution (meters or km)
h3.getHexagonEdgeLengthAvg(resolution: number, unit: 'km' | 'm'): number

// Average area at a resolution
h3.getHexagonAreaAvg(resolution: number, unit: 'km2' | 'm2'): number

// Area of a specific cell
h3.cellArea(cell: string, unit: 'km2' | 'm2' | 'rads2'): number
```

---

## Operations Mapped to Our Use Cases

### Site Geofencing (enter/exit events)

**PostGIS approach (recommended):**
```typescript
// In locations route — POST /api/locations
// After inserting the ping, check all sites for this tenant
const sql = `
  SELECT s.id, s.name
  FROM sites s
  WHERE s.tenant_id = $1
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
      s.geofence_radius_meters
    )
`
// Run after each ping insert; fire enter/exit events where status changed
```

**H3 approach (in-memory, no DB round-trip):**
```typescript
// In API startup: load all site cell sets into memory
const siteGeofences = new Map<string, Set<string>>() // siteId → Set<h3Cell>

async function loadSiteGeofences(tenantId: string) {
  const rows = await db.select({ id: sites.id, cells: sites.h3CellsRes10 })
    .from(sites).where(eq(sites.tenantId, tenantId))
  for (const row of rows) {
    siteGeofences.set(row.id, new Set(row.cells ?? []))
  }
}

// In POST /api/locations:
const guardCell = h3.latLngToCell(body.latitude, body.longitude, 10)
for (const [siteId, cellSet] of siteGeofences) {
  const inside = cellSet.has(guardCell)
  // compare to previous state, fire event if changed
}
// Zero DB queries, O(sites * 1) per ping
```

**Verdict for geofencing:** PostGIS is geometrically exact and simpler to implement. H3 in-memory wins if you are processing hundreds of guard pings per second and cannot afford the DB round-trip — not a concern at Arrow Security's current scale.

### Nearest Guard to Incident X

**PostGIS (simplest):**
```sql
SELECT gl.guard_id,
       ST_Distance(
         ST_SetSRID(ST_MakePoint(gl.longitude, gl.latitude), 4326)::geography,
         ST_SetSRID(ST_MakePoint($incLng, $incLat), 4326)::geography
       ) AS dist_meters
FROM guard_locations gl
WHERE gl.tenant_id = $tenantId
  AND gl.recorded_at = (
    SELECT MAX(recorded_at) FROM guard_locations
    WHERE guard_id = gl.guard_id AND tenant_id = $tenantId
  )
ORDER BY dist_meters
LIMIT 5;
```

**H3 pre-filter + exact sort:**
```typescript
// Candidates: guards whose last ping falls in a k-ring around the incident
const incidentCell = h3.latLngToCell(incident.lat, incident.lng, 10)
const candidateCells = h3.gridDisk(incidentCell, 2) // ~500m radius, 19 cells

// SQL: filter by H3 cell (index hit), then sort by exact distance
const sql = `
  SELECT DISTINCT ON (guard_id) guard_id, latitude, longitude
  FROM guard_locations
  WHERE tenant_id = $1 AND h3_res10 = ANY($2::text[])
  ORDER BY guard_id, recorded_at DESC
`
// Then sort in Node by haversine for exact order
```

**Verdict for nearest-guard:** PostGIS `ST_Distance + ORDER BY` with a spatial index is optimal and idiomatic. H3 pre-filtering is an optimization that makes sense at large scale where the guard table has millions of rows and you want to avoid a full table scan — not needed at current scale.

### Heatmap (guard activity density)

This is where H3 genuinely wins. There is no elegant PostGIS equivalent for the query `GROUP BY h3_cell` because PostGIS doesn't have a built-in "snap coordinate to grid" function at a specific meter resolution. You would need `ST_SnapToGrid` with a manually calculated degree increment, which is latitude-dependent and inaccurate.

```typescript
// API: compute h3_res8 at ping write time (negligible CPU)
const h3Res8 = h3.latLngToCell(body.latitude, body.longitude, 8)
await db.insert(guardLocations).values({ ...body, h3Res8 })

// Dashboard query for heatmap tiles:
const rows = await db.execute(sql`
  SELECT h3_res8 as cell, COUNT(*) as count
  FROM guard_locations
  WHERE tenant_id = ${tenantId}
    AND recorded_at > ${since}
  GROUP BY h3_res8
  ORDER BY count DESC
`)

// Convert cells to GeoJSON for MapLibre:
const features = rows.map(row => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [h3.cellToBoundary(row.cell).map(([lat, lng]) => [lng, lat])]
  },
  properties: { count: row.count }
}))
```

This is a single SQL GROUP BY with no PostGIS extension needed. The `h3_res8` column has a B-tree index. The output is directly renderable in MapLibre as a fill-extrusion layer.

### Site Polygon Overlap ("which sites overlap this zone?")

**PostGIS wins clearly.** Site overlap requires exact polygon intersection. H3 can approximate with cell set intersection but the coverage error (polyfill undershoot/overshoot) makes it unsuitable as the definitive answer for operational queries.

```sql
-- PostGIS: which of our sites overlap a reported incident zone (500m radius)?
SELECT s.id, s.name
FROM sites s
WHERE ST_DWithin(
  ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography,
  ST_SetSRID(ST_MakePoint($zoneLng, $zoneLat), 4326)::geography,
  500
);
```

---

## Algorithms and Techniques Worth Borrowing

### 1. Compact + Uncompact for variable-density sites

When a site has an irregular polygon (building boundary rather than circular geofence), polyfilling at res11 may produce hundreds of cells. Use `h3.compactCells()` to replace groups of 7 children with their parent — the resulting set is smaller for storage while `uncompactCells()` reconstructs the full set for lookups.

```typescript
const fineCells = h3.polygonToCells(buildingPolygon, 11)  // hundreds of cells
const compacted = h3.compactCells(fineCells)               // dozens of cells
// Store compacted on sites.h3_cells_compact
// At lookup time: uncompactCells(compacted, 11) then Set.has()
```

### 2. gridDisk for radius-based queries without trigonometry

`h3.gridDisk(cell, k)` returns all cells within k hops — no Haversine, no ST_DWithin. The relationship between k and meters at res10 is approximately: k=1 → ~300m, k=2 → ~500m, k=3 → ~700m. This is useful for a fast "find nearby checkpoints" query without any geometry.

### 3. Multi-resolution hierarchy for zoom-adaptive rendering

Store cell IDs at multiple resolutions. The `/map` page can request res8 cells at low zoom (city view) and res10 cells at high zoom (site view) — same data, different granularity. The hierarchy is already implicit in the H3 index: res8 parent of any res10 cell is `h3.cellToParent(cell10, 8)`.

### 4. Cell compaction for efficient "sites in bounding box" queries

The Operations Portal map viewport sends a bounding box. Polyfill the viewport at res6 (city block scale) and query `h3_res6 = ANY($viewportCells)` — far fewer cells than a raw bbox query, and the B-tree index is faster than a GiST range scan at this scale.

---

## What Is Missing for Our Security App

### 1. H3 does not solve the core geofencing problem better than PostGIS

Our sites are circular (lat/lng + radius) — the exact use case PostGIS `ST_DWithin` is optimized for. H3 polyfill introduces coverage error of 15-20% for a 200m radius circle at res10. This would cause false enter/exit events at the boundary. If sites grow to support polygon shapes (building outlines), the error is manageable but PostGIS `ST_Contains` is still preferred.

### 2. No h3-pg in our Docker image

`h3-pg` is not in the standard `postgres:16` image. All H3 operations must happen in the Node layer, meaning the cell values must be pre-computed and stored as columns. This is fine architecturally but means migrations are needed whenever you want to add a new resolution.

### 3. Cell set staleness on site update

If a site's geofence radius or boundary changes, the stored `h3_cells_res10` array must be recomputed. This requires a trigger or an explicit migration step. PostGIS generated columns handle this automatically if the geometry is a stored generated column.

### 4. h3-js is WASM: cold-start cost

h3-js loads a ~700KB WASM binary at module initialization. In a Fastify serverless deployment (Lambda/Cloud Functions) this adds ~50-100ms to cold starts. In our always-on Docker container on Render this is a one-time startup cost and is irrelevant.

### 5. No native Drizzle ORM support

Drizzle has no built-in H3 column type. H3 columns are plain `text` or `text[]`. You lose type safety — no schema-level guarantee that the stored string is a valid H3 cell. A Zod check at the API layer mitigates this.

---

## Verdict

**Primary spatial layer: PostGIS.** Add the two generated geometry columns (`geofence_point` on `sites`, `position` on `guard_locations`) and their GiST indexes. This enables exact geofencing, nearest-guard queries, and site overlap queries with standard SQL. No new npm packages, no migration complexity.

**H3 adoption: targeted and deferred.** The one concrete win is heatmap aggregation — when you build the `/map` heatmap feature, add `h3_res8 text` to `guard_locations` and compute it at ping write time in the Node layer. The `GROUP BY h3_res8` query is 5 lines of SQL and the output directly feeds MapLibre's fill-extrusion layer. This is worth adopting at that point.

The in-memory cell-set geofence pattern (cache site cells in the API process, `Set.has()` per ping) is worth keeping in mind for future scale — if you grow to hundreds of sites and thousands of guards, the DB round-trip per ping becomes a bottleneck and this pattern eliminates it. At current scale it is premature optimization.

Do not adopt h3-pg — the installation complexity is not justified.

---

## Concrete Extracts

### Demo output (verified running `node research/h3-demo/index.js`)

```
=== 1. Site Geofence → H3 Cell Set ===
  Site center cell: 8a3da11462f7fff
  polyfill cell count at res10: 7
  approx coverage area (m2): 105333
  target area (m2) [pi*r^2]: 125664      ← 84% coverage — PostGIS is exact

=== 2. Guard Enter/Exit Events ===
  [OUT] Approaching (350m south)       | dist= 545m | cell=8a3da11429a7fff
  [OUT] Approaching (253m south)       | dist= 322m | cell=8a3da1142937fff
  [IN ] At boundary (155m south)       | dist= 156m | cell=8a3da114628ffff  <<< ENTERED SITE >>>
  [IN ] At center                      | dist=   0m | cell=8a3da11462f7fff
  [IN ] Inside (130m NE)               | dist= 156m | cell=8a3da11462e7fff
  [OUT] Inside (near boundary)         | dist= 322m | cell=8a3da1146257fff  <<< EXITED SITE >>>

=== 3. Nearest-Guard Query (Incident Proximity) ===
  [CANDIDATE] Rajan Kumar     | dist=   30m | cell=8a3da11462f7fff
  [FILTERED]  Priya Sharma    | dist=  845m   ← eliminated without distance calc
  [CANDIDATE] Amit Verma      | dist=  209m | cell=8a3da1146257fff
  [FILTERED]  Sita Patel      | dist= 1148m   ← eliminated without distance calc
  [CANDIDATE] Deepak Singh    | dist=   51m | cell=8a3da11462e7fff
  Nearest guard to incident: Rajan Kumar (30m exact)

=== 4. Heatmap Aggregation (24h Guard Activity) ===
  total pings: 50
  distinct res8 cells: 4
  top 5 hotspots: 883da11463fffff(31), 883da11429fffff(10), ...

=== 5. Checkpoint Scan Validation at res11 ===
  [VALID  ] Standing at checkpoint              | dist=   0m
  [VALID  ] Within same cell (~20m)             | dist=  22m
  [INVALID] Adjacent cell (~100m)               | dist= 112m
  [INVALID] Wrong location (~250m)              | dist= 260m
```

### PostGIS migration (what to actually build next)

```sql
-- Run once: enable PostGIS if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add generated geometry columns
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS geofence_point geometry(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
      END
    ) STORED;

ALTER TABLE guard_locations
  ADD COLUMN IF NOT EXISTS position geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

-- Spatial indexes
CREATE INDEX IF NOT EXISTS idx_sites_geofence_point
  ON sites USING GIST(geofence_point);

CREATE INDEX IF NOT EXISTS idx_guard_locations_position
  ON guard_locations USING GIST(position);

-- Composite index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_guard_locations_tenant_time
  ON guard_locations(tenant_id, recorded_at DESC);
```

### H3 heatmap integration (when /map heatmap is built)

```typescript
// apps/api/src/routes/locations.ts — add to POST handler
import * as h3 from 'h3-js'

// In ping insert:
const h3Res8 = h3.latLngToCell(body.latitude, body.longitude, 8)
await db.insert(guardLocations).values({
  ...body,
  h3Res8,  // new column
})

// New GET /api/locations/heatmap endpoint
fastify.get('/heatmap', { preHandler: requireAuth }, async (request, reply) => {
  const payload = request.user as { tenantId: string }
  const { since = new Date(Date.now() - 86400000).toISOString() } = request.query as any

  const rows = await db.execute(sql`
    SELECT h3_res8 as cell, COUNT(*)::int as count
    FROM guard_locations
    WHERE tenant_id = ${payload.tenantId}
      AND recorded_at > ${new Date(since)}
      AND h3_res8 IS NOT NULL
    GROUP BY h3_res8
    ORDER BY count DESC
    LIMIT 500
  `)

  const geojson = {
    type: 'FeatureCollection',
    features: rows.rows.map((row: any) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [h3.cellToBoundary(row.cell).map(([lat, lng]) => [lng, lat])],
      },
      properties: { count: row.count, cell: row.cell },
    })),
  }

  return reply.send({ data: geojson })
})
```

### H3 vs PostGIS decision matrix

| Use case | Recommendation | Rationale |
|----------|---------------|-----------|
| Circular geofence (200m) | PostGIS ST_DWithin | Exact; H3 polyfill is 84% coverage |
| Polygon geofence (building) | PostGIS ST_Contains | Exact; H3 polyfill over/undershoot |
| Nearest guard to incident | PostGIS ST_Distance | Simple, indexed, exact |
| Guard heatmap | H3 GROUP BY cell | No PostGIS equivalent is this clean |
| Site zone overlap | PostGIS ST_Overlaps | Requires exact geometry |
| Checkpoint scan proximity | PostGIS ST_DWithin | 30m tolerance, exact needed |
| In-memory geofence cache | H3 cell Set.has() | Zero DB queries per ping — scale optimization |
| Historical trail polyline | PostGIS ST_MakeLine | H3 adds nothing here |

---

## Open Questions for Synthesis

1. **Geofence accuracy SLA**: if Arrow Security needs to distinguish "guard is 195m away" from "guard is 205m away" (e.g. for compliance), PostGIS is mandatory. If ±50m tolerance is acceptable, H3 with buffer cells is fine. What does the contract say?

2. **Site polygon support**: the current schema is lat/lng + radius (circular). If clients want to define irregular building footprints (drawn on a map), we need a `geometry(Polygon, 4326)` column on `sites` — and at that point PostGIS is unquestionably the right tool.

3. **Heatmap feature priority**: the `/map` page exists but shows only live guard markers. Is a historical heatmap on the roadmap? If yes, the `h3_res8` column addition is the one H3 adoption worth planning now.

4. **Multi-server SSE**: the current SSE fan-out is in-process memory. If you run 2+ API replicas (Render autoscaling), guard pings broadcast to only some supervisors. Redis Pub/Sub is the fix — this is a more urgent infrastructure gap than any spatial indexing question.

5. **PostGIS on Render**: Render's PostgreSQL service does include PostGIS. Verify with `SELECT PostGIS_Version()` on the production DB before running the migration. If using Neon (a likely candidate for serverless), confirm PostGIS availability — Neon has it on paid plans.

6. **h3-js WASM in Cloudflare Workers**: if the API ever migrates to an edge runtime, h3-js WASM exceeds Cloudflare Workers' 1MB script limit. The pure-JS h3-js-legacy package exists as a fallback but is significantly slower.
