/**
 * Geofence state machine — drives shift_site_visits from incoming pings.
 *
 * Model: at any instant a shift is in exactly one of
 *   - on-site at siteId X   (open visit row with siteId = X)
 *   - off-site               (open visit row with siteId = NULL)
 *
 * Every state change closes the current visit and opens a new one. State is
 * derived purely from "did this ping fall inside any site's geofence radius?"
 * — we do not classify movement (walking / driving / idle) anymore.
 *
 * Pings are processed in event-time order (ping.recordedAt). If pings arrive
 * out of order (e.g. an offline-buffer flush), the caller is responsible for
 * sorting them by recordedAt before calling processPing for each.
 *
 * Hysteresis lives in the *trigger*, not the data:
 *   - Every transition is recorded as its own visit row, even short flickers
 *   - The abandon threshold fires only when an off-site visit has been
 *     continuously open for ≥ OFF_SITE_ABANDON_THRESHOLD_MS in event-time,
 *     observed on a subsequent ping
 *   - The shift's status flipping to 'abandoned' is the latch: subsequent
 *     pings short-circuit (loadActiveShiftWithRole returns null) so the
 *     threshold-crossed transition fires at most once
 *
 * The caller (POST /locations) decides what to do with the emitted transitions
 * — typically: enter/exit are informational; threshold-crossed triggers
 * shift abandonment + force-logout of the guard (when role = guard).
 */

import { db, shiftSiteVisits, type ShiftSiteVisit } from '@secureops/db'
import { and, desc, eq, isNull } from 'drizzle-orm'

/** How long a guard must be continuously off-site (event-time) before we abandon
 *  the shift + force-logout. Short enough to flag real walkouts, long enough to
 *  ride out GPS jitter and brief geofence-edge flickers. */
export const OFF_SITE_ABANDON_THRESHOLD_MS = 60 * 1000

export type PingForState = {
  guardId: string
  tenantId: string
  shiftId: string
  latitude: number
  longitude: number
  /** Event time — the device timestamp, not the server receive time. */
  recordedAt: Date
}

export type SiteWithGeofence = {
  id: string
  latitude: number | null
  longitude: number | null
  geofenceRadiusMeters: number
}

export type Transition =
  | { kind: 'noop' }
  | { kind: 'enter_site'; siteId: string; at: Date; visitId: string }
  | { kind: 'exit_site'; siteId: string; at: Date }
  | {
      kind: 'off_site_threshold_crossed'
      visitId: string
      enteredAt: Date
      enteredLat: number | null
      enteredLng: number | null
    }

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Determine which site (if any) a ping is inside. If multiple geofences
 * overlap at this point we return the closest by centre-distance —
 * deterministic and matches the intent ("which site are they at").
 */
export function classifyPing(
  ping: { latitude: number; longitude: number },
  sites: SiteWithGeofence[]
): { siteId: string | null } {
  let closest: { id: string; distance: number } | null = null
  for (const s of sites) {
    if (s.latitude == null || s.longitude == null) continue
    const d = haversineMeters(ping.latitude, ping.longitude, s.latitude, s.longitude)
    if (d <= s.geofenceRadiusMeters) {
      if (!closest || d < closest.distance) closest = { id: s.id, distance: d }
    }
  }
  return { siteId: closest?.id ?? null }
}

// ── DB-touching API ──────────────────────────────────────────────────────────

async function findOpenVisit(shiftId: string): Promise<ShiftSiteVisit | undefined> {
  const [row] = await db
    .select()
    .from(shiftSiteVisits)
    .where(and(eq(shiftSiteVisits.shiftId, shiftId), isNull(shiftSiteVisits.exitedAt)))
    .orderBy(desc(shiftSiteVisits.enteredAt))
    .limit(1)
  return row
}

/**
 * Apply a single ping to the state machine. Returns the transitions that
 * resulted (zero or more) so the caller can react (broadcast, abandon, etc).
 *
 * Idempotency note: this function mutates DB state, so calling it twice with
 * the same ping is *not* a no-op. The caller (POST /locations) is the single
 * source of pings, so this is acceptable; we never replay pings from raw
 * guard_locations through processPing.
 */
export async function processPing(
  ping: PingForState,
  tenantSites: SiteWithGeofence[]
): Promise<Transition[]> {
  const { siteId: newSiteId } = classifyPing(ping, tenantSites)
  const openVisit = await findOpenVisit(ping.shiftId)
  const transitions: Transition[] = []

  // No open visit → this is the first ping of the shift. Open the initial visit.
  if (!openVisit) {
    const [created] = await db
      .insert(shiftSiteVisits)
      .values({
        tenantId: ping.tenantId,
        shiftId: ping.shiftId,
        guardId: ping.guardId,
        siteId: newSiteId,
        enteredAt: ping.recordedAt,
        enteredLat: ping.latitude,
        enteredLng: ping.longitude,
      })
      .returning()

    if (newSiteId) {
      transitions.push({
        kind: 'enter_site',
        siteId: newSiteId,
        at: ping.recordedAt,
        visitId: created.id,
      })
    }
    return transitions
  }

  const stateChanged = openVisit.siteId !== newSiteId

  if (stateChanged) {
    // Close the current visit at the moment of transition.
    await db
      .update(shiftSiteVisits)
      .set({
        exitedAt: ping.recordedAt,
        exitedLat: ping.latitude,
        exitedLng: ping.longitude,
        updatedAt: new Date(),
      })
      .where(eq(shiftSiteVisits.id, openVisit.id))

    if (openVisit.siteId) {
      transitions.push({ kind: 'exit_site', siteId: openVisit.siteId, at: ping.recordedAt })
    }

    // Open the new visit.
    const [created] = await db
      .insert(shiftSiteVisits)
      .values({
        tenantId: ping.tenantId,
        shiftId: ping.shiftId,
        guardId: ping.guardId,
        siteId: newSiteId,
        enteredAt: ping.recordedAt,
        enteredLat: ping.latitude,
        enteredLng: ping.longitude,
      })
      .returning()

    if (newSiteId) {
      transitions.push({
        kind: 'enter_site',
        siteId: newSiteId,
        at: ping.recordedAt,
        visitId: created.id,
      })
    }
    return transitions
  }

  // State unchanged. If we're in an open off-site visit, check whether this
  // ping crosses the abandonment threshold. The shift status flipping to
  // 'abandoned' is the latch (loadActiveShiftWithRole skips the state machine
  // for non-active shifts), so we don't need a per-visit handled flag.
  if (openVisit.siteId === null) {
    const offSiteForMs = ping.recordedAt.getTime() - openVisit.enteredAt.getTime()
    if (offSiteForMs >= OFF_SITE_ABANDON_THRESHOLD_MS) {
      transitions.push({
        kind: 'off_site_threshold_crossed',
        visitId: openVisit.id,
        enteredAt: openVisit.enteredAt,
        enteredLat: openVisit.enteredLat,
        enteredLng: openVisit.enteredLng,
      })
    }
  }

  return transitions
}

/**
 * Stamp the current open visit as exited — call when a shift ends through
 * normal channels (clock-out, manual completion). Safe to call if no visit
 * is open. Does not emit transitions; the shift is ending regardless.
 */
export async function closeOpenVisitForShift(
  shiftId: string,
  at: Date,
  lat: number | null,
  lng: number | null
): Promise<void> {
  const openVisit = await findOpenVisit(shiftId)
  if (!openVisit) return
  await db
    .update(shiftSiteVisits)
    .set({ exitedAt: at, exitedLat: lat, exitedLng: lng, updatedAt: new Date() })
    .where(eq(shiftSiteVisits.id, openVisit.id))
}

