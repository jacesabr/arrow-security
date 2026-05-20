import { db, guardLocations, shifts } from '@secureops/db'
import { eq, and, gte, lte, asc } from 'drizzle-orm'

// ── Tunables ──────────────────────────────────────────────────────────────
const ACCURACY_THRESHOLD_M = 30      // drop pings worse than this
const MAX_IMPLIED_SPEED_MS = 30      // 108 km/h ceiling — kills GPS teleports
const SMOOTH_WINDOW = 5              // rolling median window for speed

// Driving: absolute physical threshold + must be sustained
const DRIVING_SPEED_MS = 3.5         // ~12.6 km/h — clearly above human walking pace
const MIN_DRIVING_DURATION_MS = 2 * 60 * 1000  // 2 min sustained

// Stationary: per-shift adaptive — typical idle speed for THIS shift's data.
// We take the 25th percentile of smoothed speed as the idle baseline, then add a
// small margin. This adapts to each guard's device/GPS conditions without letting
// real walking get swallowed by jitter.
const IDLE_PERCENTILE = 0.25
const IDLE_MARGIN_MS = 0.3           // tolerance above baseline still counts as idle
const STATIONARY_FLOOR_MS = 0.5      // absolute floor — anything below = idle
const STATIONARY_CEILING_MS = 1.0    // absolute ceiling — never call > 1 m/s idle

// Device activity tiebreaker — applied only in the ambiguous speed band.
// Speeds < AMBIGUOUS_LOW or > AMBIGUOUS_HIGH are decided by GPS alone.
const AMBIGUOUS_LOW_MS = 0.42        // ≈ 1.5 km/h
const AMBIGUOUS_HIGH_MS = 3.33       // ≈ 12 km/h
const ACTIVITY_CONFIDENCE_MIN = 60   // skip tiebreak when device confidence is low

// Stop-detection second pass — catches GPS jitter that the speed gate alone
// would smear into walking (e.g. guard standing at a checkpoint for 10 min
// while position drifts within ~25 m).
const STOP_RADIUS_M = 25
const MIN_STOP_DURATION_MS = 5 * 60 * 1000  // 5 minutes

// Unaccounted-time detection — gaps between accepted pings that are suspiciously
// longer than the median gap indicate dropped low-accuracy pings or a GPS outage.
const UNACCOUNTED_GAP_FACTOR = 3              // 3× the median gap
const UNACCOUNTED_GAP_FLOOR_MS = 2 * 60 * 1000  // …but always at least 2 min

// Sanity caps — defence against runaway-drift inflation. These cap totals at
// generous human-physiological / typical-vehicle limits per shift hour.
const MAX_WALK_KMH = 6
const MAX_VEHICLE_KMH = 80

type Ping = {
  latitude: number
  longitude: number
  recordedAt: Date
  accuracy: number | null
  speed: number | null
  activityType: string | null         // 'still' | 'walking' | 'running' | 'vehicle' | 'bicycle' | 'unknown' | null
  activityConfidence: number | null   // 0..100
}

type Interval = {
  startTs: Date
  endTs: Date
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  distanceM: number
  durationMs: number
  speedMs: number
  smoothedSpeedMs: number
  activityType: string | null
  activityConfidence: number | null
  label: 'stationary' | 'walking' | 'driving'
}

export type MovementPoint = {
  ts: string           // ISO timestamp at end of interval
  speedMs: number      // smoothed speed
  label: 'stationary' | 'walking' | 'driving'
}

export type ShiftMovement = {
  walkingMeters: number
  drivingMeters: number
  walkingSeconds: number
  drivingSeconds: number
  stationarySeconds: number
  /** Total time we have no confidence about — large gaps between accepted
   *  pings (dropped low-accuracy samples or GPS outage). Not double-counted
   *  in stationary/walking/driving. */
  unaccountedSeconds: number
  meanSpeedMs: number
  idleBaselineMs: number      // the threshold actually used to split stationary/walking
  pingsConsidered: number
  pingsAccepted: number
  /** True when a sanity cap was applied (real GPS noise inflated the total
   *  past a physiological / typical-vehicle limit). The exposed totals are
   *  already clamped — these flags exist for audit. */
  cappedWalking: boolean
  cappedDriving: boolean
  series: MovementPoint[]     // for the audit graph
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function rollingMedian(values: number[], window: number, index: number): number {
  const half = Math.floor(window / 2)
  const lo = Math.max(0, index - half)
  const hi = Math.min(values.length - 1, index + half)
  const slice = values.slice(lo, hi + 1).sort((a, b) => a - b)
  return slice[Math.floor(slice.length / 2)]
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length))
  return sortedAsc[idx]
}

function emptyResult(considered: number, accepted: number): ShiftMovement {
  return {
    walkingMeters: 0, drivingMeters: 0,
    walkingSeconds: 0, drivingSeconds: 0, stationarySeconds: 0,
    unaccountedSeconds: 0,
    meanSpeedMs: 0, idleBaselineMs: STATIONARY_FLOOR_MS,
    pingsConsidered: considered, pingsAccepted: accepted,
    cappedWalking: false, cappedDriving: false,
    series: [],
  }
}

/**
 * Pure function — takes ordered pings, returns movement breakdown + audit graph series.
 * Classification rules:
 *   - driving: smoothed speed > 3.5 m/s sustained over ≥ 2 min (absolute)
 *   - stationary: smoothed speed ≤ idle baseline (per-shift adaptive)
 *   - walking: everything else
 *
 * Idle baseline = 25th percentile of smoothed speeds + 0.3 m/s margin, clamped to
 * [0.5, 1.0] m/s. This separates real GPS-noise idle from genuine slow walking.
 */
export function computeMovement(pings: Ping[]): ShiftMovement {
  const considered = pings.length

  // 1. Filter by accuracy + sort ascending
  const filtered = pings
    .filter((p) => p.accuracy == null || p.accuracy <= ACCURACY_THRESHOLD_M)
    .slice()
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())

  if (filtered.length < 2) return emptyResult(considered, filtered.length)

  // 2. Build intervals between consecutive pings, dropping teleports
  const intervals: Interval[] = []
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1]
    const curr = filtered[i]
    const dt = curr.recordedAt.getTime() - prev.recordedAt.getTime()
    if (dt <= 0) continue
    const dist = haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
    const implied = dist / (dt / 1000)
    if (implied > MAX_IMPLIED_SPEED_MS) continue
    const speed = curr.speed != null && curr.speed >= 0 ? curr.speed : implied
    intervals.push({
      startTs: prev.recordedAt,
      endTs: curr.recordedAt,
      startLat: prev.latitude,
      startLng: prev.longitude,
      endLat: curr.latitude,
      endLng: curr.longitude,
      distanceM: dist,
      durationMs: dt,
      speedMs: speed,
      smoothedSpeedMs: speed,
      activityType: curr.activityType,
      activityConfidence: curr.activityConfidence,
      label: 'stationary',
    })
  }

  if (intervals.length === 0) return emptyResult(considered, filtered.length)

  // 3. Smooth speeds with rolling median
  const rawSpeeds = intervals.map((iv) => iv.speedMs)
  for (let i = 0; i < intervals.length; i++) {
    intervals[i].smoothedSpeedMs = rollingMedian(rawSpeeds, SMOOTH_WINDOW, i)
  }

  // 4. Determine the adaptive idle baseline for THIS shift
  const sortedSmoothed = intervals.map((iv) => iv.smoothedSpeedMs).sort((a, b) => a - b)
  const p25 = percentile(sortedSmoothed, IDLE_PERCENTILE)
  const idleBaseline = Math.min(
    STATIONARY_CEILING_MS,
    Math.max(STATIONARY_FLOOR_MS, p25 + IDLE_MARGIN_MS),
  )
  const meanSpeed = intervals.reduce((a, iv) => a + iv.smoothedSpeedMs, 0) / intervals.length

  // 5. Initial classification per interval.
  //    Decisive bands (very slow / very fast) use GPS alone. The middle band
  //    consults the device's Activity Recognition output as a tiebreaker.
  for (const iv of intervals) {
    const s = iv.smoothedSpeedMs

    if (s <= idleBaseline) {
      iv.label = 'stationary'
      continue
    }
    if (s >= DRIVING_SPEED_MS) {
      iv.label = 'driving'
      continue
    }

    // Ambiguous band — use activity recognition if we have a confident sample
    const hasGoodActivity =
      iv.activityType != null &&
      iv.activityType !== 'unknown' &&
      (iv.activityConfidence == null || iv.activityConfidence >= ACTIVITY_CONFIDENCE_MIN)

    if (hasGoodActivity && s >= AMBIGUOUS_LOW_MS && s <= AMBIGUOUS_HIGH_MS) {
      switch (iv.activityType) {
        case 'vehicle':
        case 'bicycle':
        case 'running':
          // Per product spec: cycling and running both count as vehicle minutes,
          // since neither is a legitimate patrol pace.
          iv.label = 'driving'
          continue
        case 'still':
          iv.label = 'stationary'
          continue
        case 'walking':
          iv.label = 'walking'
          continue
      }
    }

    iv.label = 'walking'
  }

  // 5b. Stop-detection second pass — find spans of intervals whose positions
  //     stay within STOP_RADIUS_M for ≥ MIN_STOP_DURATION_MS, and override
  //     those to 'stationary' regardless of their speed-based label. This
  //     catches checkpoint dwells where GPS jitter inflates apparent speed.
  {
    let i = 0
    while (i < intervals.length) {
      // Seed cluster at this interval's start position.
      let centroidLat = intervals[i].startLat
      let centroidLng = intervals[i].startLng
      let count = 1
      let j = i
      while (j < intervals.length) {
        const dist = haversineMeters(centroidLat, centroidLng, intervals[j].endLat, intervals[j].endLng)
        if (dist > STOP_RADIUS_M) break
        // Rolling centroid mean
        centroidLat = (centroidLat * count + intervals[j].endLat) / (count + 1)
        centroidLng = (centroidLng * count + intervals[j].endLng) / (count + 1)
        count++
        j++
      }
      // Cluster covers intervals[i..j-1]
      if (j > i) {
        let dur = 0
        for (let k = i; k < j; k++) dur += intervals[k].durationMs
        if (dur >= MIN_STOP_DURATION_MS) {
          for (let k = i; k < j; k++) intervals[k].label = 'stationary'
          i = j
          continue
        }
      }
      i++
    }
  }

  // 6. Coalesce into segments
  type Segment = { label: 'stationary' | 'walking' | 'driving'; distanceM: number; durationMs: number; from: number; to: number }
  const segments: Segment[] = []
  let cur: Segment | null = null
  for (let i = 0; i < intervals.length; i++) {
    const iv = intervals[i]
    if (!cur || cur.label !== iv.label) {
      if (cur) segments.push(cur)
      cur = { label: iv.label, distanceM: iv.distanceM, durationMs: iv.durationMs, from: i, to: i }
    } else {
      cur.distanceM += iv.distanceM
      cur.durationMs += iv.durationMs
      cur.to = i
    }
  }
  if (cur) segments.push(cur)

  // 7. Downgrade brief driving segments to walking (require sustained speed) —
  //    unless the device activity sensor confirms vehicle / running / bicycle
  //    in at least one interval of the segment. A confirmed brief run counts
  //    as vehicle minutes per product spec.
  for (const seg of segments) {
    if (seg.label !== 'driving' || seg.durationMs >= MIN_DRIVING_DURATION_MS) continue
    let activityConfirmed = false
    for (let i = seg.from; i <= seg.to; i++) {
      const iv = intervals[i]
      const confident = iv.activityConfidence == null || iv.activityConfidence >= ACTIVITY_CONFIDENCE_MIN
      if (confident && (iv.activityType === 'vehicle' || iv.activityType === 'bicycle' || iv.activityType === 'running')) {
        activityConfirmed = true
        break
      }
    }
    if (!activityConfirmed) {
      seg.label = 'walking'
      for (let i = seg.from; i <= seg.to; i++) intervals[i].label = 'walking'
    }
  }

  // 8. Sum totals
  let walkingMeters = 0, drivingMeters = 0
  let walkingSeconds = 0, drivingSeconds = 0, stationarySeconds = 0
  for (const seg of segments) {
    if (seg.label === 'walking') {
      walkingMeters += seg.distanceM
      walkingSeconds += seg.durationMs / 1000
    } else if (seg.label === 'driving') {
      drivingMeters += seg.distanceM
      drivingSeconds += seg.durationMs / 1000
    } else {
      stationarySeconds += seg.durationMs / 1000
    }
  }

  // 8b. Unaccounted-time — sum of gaps between accepted pings that are
  //     suspiciously longer than the median (dropped pings or GPS outage).
  const sortedDurations = intervals.map((iv) => iv.durationMs).sort((a, b) => a - b)
  const medianGapMs = sortedDurations[Math.floor(sortedDurations.length / 2)]
  const gapThreshold = Math.max(UNACCOUNTED_GAP_FLOOR_MS, medianGapMs * UNACCOUNTED_GAP_FACTOR)
  let unaccountedMs = 0
  for (const iv of intervals) {
    if (iv.durationMs > gapThreshold) {
      // Count only the excess beyond a "normal" interval — the normal portion
      // is already attributed to its bucket.
      unaccountedMs += iv.durationMs - gapThreshold
    }
  }

  // 8c. Sanity caps — defence against runaway-drift inflation. We use the
  //     accepted-pings time span (not the scheduled shift duration) because
  //     the shift may have begun before the guard's first ping and ended
  //     after the last; capping by the latter would over-permit.
  const observedSpanMs = filtered[filtered.length - 1].recordedAt.getTime() - filtered[0].recordedAt.getTime()
  const observedSpanHours = observedSpanMs / 3_600_000
  const maxWalkM = MAX_WALK_KMH * 1000 * observedSpanHours
  const maxVehM  = MAX_VEHICLE_KMH * 1000 * observedSpanHours
  let cappedWalking = false
  let cappedDriving = false
  if (walkingMeters > maxWalkM) { walkingMeters = maxWalkM; cappedWalking = true }
  if (drivingMeters > maxVehM)  { drivingMeters  = maxVehM;  cappedDriving = true }

  // 9. Build the audit graph series — one point per interval
  const series: MovementPoint[] = intervals.map((iv) => ({
    ts: iv.endTs.toISOString(),
    speedMs: Number(iv.smoothedSpeedMs.toFixed(3)),
    label: iv.label,
  }))

  return {
    walkingMeters: Math.round(walkingMeters),
    drivingMeters: Math.round(drivingMeters),
    walkingSeconds: Math.round(walkingSeconds),
    drivingSeconds: Math.round(drivingSeconds),
    stationarySeconds: Math.round(stationarySeconds),
    unaccountedSeconds: Math.round(unaccountedMs / 1000),
    meanSpeedMs: Number(meanSpeed.toFixed(3)),
    idleBaselineMs: Number(idleBaseline.toFixed(3)),
    pingsConsidered: considered,
    pingsAccepted: filtered.length,
    cappedWalking,
    cappedDriving,
    series,
  }
}

/**
 * Load all relevant pings for a shift and run the segmenter.
 * Returns the breakdown WITHOUT persisting (used by the GET endpoint and by
 * computeAndStoreShiftMovement below).
 */
export async function computeShiftMovement(
  shiftId: string,
  tenantId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<ShiftMovement> {
  // Pull pings tagged with this shift first; fall back to time-window if empty
  // (legacy pings may not have shiftId set).
  let rows = await db
    .select({
      latitude: guardLocations.latitude,
      longitude: guardLocations.longitude,
      recordedAt: guardLocations.recordedAt,
      accuracy: guardLocations.accuracy,
      speed: guardLocations.speed,
      activityType: guardLocations.activityType,
      activityConfidence: guardLocations.activityConfidence,
    })
    .from(guardLocations)
    .where(and(eq(guardLocations.tenantId, tenantId), eq(guardLocations.shiftId, shiftId)))
    .orderBy(asc(guardLocations.recordedAt))

  if (rows.length === 0) {
    rows = await db
      .select({
        latitude: guardLocations.latitude,
        longitude: guardLocations.longitude,
        recordedAt: guardLocations.recordedAt,
        accuracy: guardLocations.accuracy,
        speed: guardLocations.speed,
        activityType: guardLocations.activityType,
        activityConfidence: guardLocations.activityConfidence,
      })
      .from(guardLocations)
      .where(and(
        eq(guardLocations.tenantId, tenantId),
        gte(guardLocations.recordedAt, startsAt),
        lte(guardLocations.recordedAt, endsAt),
      ))
      .orderBy(asc(guardLocations.recordedAt))
  }

  return computeMovement(rows.map((r) => ({
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    recordedAt: r.recordedAt,
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    speed: r.speed != null ? Number(r.speed) : null,
    activityType: r.activityType ?? null,
    activityConfidence: r.activityConfidence != null ? Number(r.activityConfidence) : null,
  })))
}

/**
 * Compute and persist the per-shift movement summary. Idempotent.
 * The `series` field is NOT persisted (re-derivable from guard_locations).
 */
export async function computeAndStoreShiftMovement(
  shiftId: string,
  tenantId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<ShiftMovement> {
  const result = await computeShiftMovement(shiftId, tenantId, startsAt, endsAt)

  await db
    .update(shifts)
    .set({
      walkingMeters: result.walkingMeters,
      drivingMeters: result.drivingMeters,
      walkingSeconds: result.walkingSeconds,
      drivingSeconds: result.drivingSeconds,
      stationarySeconds: result.stationarySeconds,
      meanSpeedMs: result.meanSpeedMs,
      idleBaselineMs: result.idleBaselineMs,
      movementComputedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(shifts.id, shiftId), eq(shifts.tenantId, tenantId)))

  return result
}
