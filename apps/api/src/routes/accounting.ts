import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '@secureops/db'
import { sql } from 'drizzle-orm'
import { requireTenantAdmin } from '../lib/auth'
import { getRoutesForPairs } from '../lib/mapbox-routes'

// GET /api/accounting?month=YYYY-MM
//
// Monthly per-client / per-site rollup for billing + supervisor activity
// rollup for gas reimbursement.
//
//   hoursWorked — guards contribute their full completed-shift duration;
//     supervisors contribute their full shift duration too (their inter-site
//     driving is reimbursed separately in the supervisors[] section, not
//     deducted from client billing). Pragmatic v1 — refine if a client
//     disputes a bill.
//
//   supervisors[].drivingHours — sum of estimated driving time between
//     every consecutive distinct-site geofence visit within a single
//     supervisor shift. We don't try to detect detours (lunch, errands,
//     going home and back) — we only count the direct A→B path between
//     sites the supervisor actually checked in to. Estimates come from
//     the Mapbox Directions API, cached per (from, to) site pair in
//     site_routes. See lib/mapbox-routes.ts.
//
// Defaults to the current UTC month. Boundaries are UTC; v1 doesn't apply IST
// offset since shift timestamps are stored without timezone.
//
// Admin-only. Supervisors are intentionally not granted access to client
// billing data — same posture as /api/payroll.

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM')
    .optional(),
})

export const accountingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { month } = querySchema.parse(request.query ?? {})

    const now = new Date()
    const [y, m] = month
      ? month.split('-').map(Number)
      : [now.getUTCFullYear(), now.getUTCMonth() + 1]
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end   = new Date(Date.UTC(y, m,     1))   // first of next month — JS handles year overflow
    const startIso = start.toISOString()
    const endIso   = end.toISOString()
    const monthStr = `${y}-${String(m).padStart(2, '0')}`

    // ── Site-level rows ───────────────────────────────────────────────────
    // One row per (client, site). LEFT JOIN sites so clients with no sites
    // still appear (as a row with null site_id); LEFT JOIN shifts so quiet
    // sites still show in the breakdown with zero hours. LEFT JOIN users so
    // we can scope guard_count to role='guard' only.
    const siteRows = await db.execute(sql`
      SELECT
        c.id     AS client_id,
        c.name   AS client_name,
        c.status AS client_status,
        st.id      AS site_id,
        st.name    AS site_name,
        st.address AS site_address,
        COUNT(DISTINCT sh.guard_id)
          FILTER (WHERE sh.id IS NOT NULL AND u.role = 'guard')   AS guard_count,
        COUNT(sh.id)
          FILTER (WHERE sh.status = 'completed' AND u.role = 'guard') AS shifts_completed,
        COALESCE(
          SUM(EXTRACT(EPOCH FROM (sh.ends_at - sh.starts_at)))
            FILTER (WHERE sh.status = 'completed'),
          0
        )                                                          AS worked_seconds
      FROM clients c
      LEFT JOIN sites st
        ON st.client_id = c.id AND st.tenant_id = c.tenant_id
      LEFT JOIN shifts sh
        ON sh.site_id   = st.id
       AND sh.tenant_id = st.tenant_id
       AND sh.starts_at >= ${startIso}
       AND sh.starts_at <  ${endIso}
      LEFT JOIN users u
        ON u.id = sh.guard_id
      WHERE c.tenant_id = ${tenantId}
      GROUP BY c.id, c.name, c.status, st.id, st.name, st.address
      ORDER BY c.name ASC, st.name ASC
    `)

    // ── Per-client distinct guards ────────────────────────────────────────
    // Summing per-site guard counts double-counts roving guards who worked
    // multiple sites under the same client this month; this query fixes that.
    // Excludes supervisors — they live in the supervisors[] section.
    const clientGuardRows = await db.execute(sql`
      SELECT
        c.id AS client_id,
        COUNT(DISTINCT sh.guard_id) AS guard_count
      FROM clients c
      JOIN sites  st ON st.client_id = c.id AND st.tenant_id = c.tenant_id
      JOIN shifts sh
        ON sh.site_id   = st.id
       AND sh.tenant_id = st.tenant_id
       AND sh.starts_at >= ${startIso}
       AND sh.starts_at <  ${endIso}
      JOIN users u ON u.id = sh.guard_id AND u.role = 'guard'
      WHERE c.tenant_id = ${tenantId}
      GROUP BY c.id
    `)
    const guardByClient = new Map<string, number>()
    for (const r of clientGuardRows as any[]) {
      guardByClient.set(String(r.client_id), Number(r.guard_count))
    }

    // ── Tenant-wide distinct guards (top totals strip) ────────────────────
    // Guards only — supervisors get their own count in the supervisors section.
    const totalsRows = await db.execute(sql`
      SELECT COUNT(DISTINCT sh.guard_id) AS total_guards
      FROM shifts sh
      JOIN users u ON u.id = sh.guard_id AND u.role = 'guard'
      WHERE sh.tenant_id = ${tenantId}
        AND sh.starts_at >= ${startIso}
        AND sh.starts_at <  ${endIso}
    `)
    const tenantTotalGuards = Number((totalsRows as any[])[0]?.total_guards ?? 0)

    // ── Supervisor activity: on-site vs driving ───────────────────────────
    // Two queries:
    //   1) Per-shift totals (shifts worked, total seconds) so the summary
    //      strip and per-supervisor rows match what /reports shows.
    //   2) The ordered sequence of distinct-site geofence visits inside each
    //      supervisor shift, joined from shift_site_visits. We pair every
    //      consecutive (siteA → siteB) where siteA != siteB and ask Mapbox
    //      for the direct driving time. Detours are deliberately ignored —
    //      the user only wants to reimburse the productive A-to-B leg.
    const supervisorShiftRows = await db.execute(sql`
      SELECT
        u.id      AS supervisor_id,
        u.name    AS supervisor_name,
        COUNT(sh.id) FILTER (WHERE sh.status = 'completed') AS shifts_completed,
        COALESCE(
          SUM(EXTRACT(EPOCH FROM (sh.ends_at - sh.starts_at)))
            FILTER (WHERE sh.status = 'completed'),
          0
        ) AS total_seconds
      FROM users u
      LEFT JOIN shifts sh
        ON sh.guard_id   = u.id
       AND sh.tenant_id  = u.tenant_id
       AND sh.starts_at >= ${startIso}
       AND sh.starts_at <  ${endIso}
      WHERE u.tenant_id = ${tenantId}
        AND u.role      = 'supervisor'
      GROUP BY u.id, u.name
      HAVING COUNT(sh.id) FILTER (WHERE sh.status = 'completed') > 0
      ORDER BY u.name ASC
    `) as any[]

    type SupervisorAgg = {
      supervisorId: string
      supervisorName: string
      shiftsCompleted: number
      totalSeconds: number
      sitesVisited: Set<string>
      pendingPairs: Array<{ fromSiteId: string; toSiteId: string }>
    }
    const supByUser = new Map<string, SupervisorAgg>()
    for (const r of supervisorShiftRows) {
      const id = String(r.supervisor_id)
      supByUser.set(id, {
        supervisorId:    id,
        supervisorName:  r.supervisor_name,
        shiftsCompleted: Number(r.shifts_completed),
        totalSeconds:    Number(r.total_seconds),
        sitesVisited:    new Set(),
        pendingPairs:    [],
      })
    }

    // Geofence visits inside completed supervisor shifts this month. siteId
    // IS NOT NULL filters out the off-site segments (lunch, driving, etc).
    // We order by (supervisor, shift, entered_at) so a linear scan can build
    // the pair list per shift without sorting in JS.
    const visitRows = await db.execute(sql`
      SELECT
        u.id   AS supervisor_id,
        v.shift_id,
        v.site_id,
        v.entered_at
      FROM shift_site_visits v
      JOIN shifts sh
        ON sh.id        = v.shift_id
       AND sh.tenant_id = v.tenant_id
      JOIN users u
        ON u.id        = v.guard_id
       AND u.tenant_id = v.tenant_id
      WHERE v.tenant_id   = ${tenantId}
        AND v.site_id    IS NOT NULL
        AND u.role        = 'supervisor'
        AND sh.status     = 'completed'
        AND sh.starts_at >= ${startIso}
        AND sh.starts_at <  ${endIso}
      ORDER BY u.id ASC, v.shift_id ASC, v.entered_at ASC
    `) as any[]

    // Linear scan: every time we see a new shift, reset the "previous site"
    // pointer so transitions don't bleed across shift boundaries.
    let prevSupervisorId: string | null = null
    let prevShiftId: string | null = null
    let prevSiteId: string | null = null
    for (const v of visitRows) {
      const supervisorId = String(v.supervisor_id)
      const shiftId      = String(v.shift_id)
      const siteId       = String(v.site_id)
      const agg = supByUser.get(supervisorId)
      if (!agg) continue
      agg.sitesVisited.add(siteId)

      const sameShift = prevSupervisorId === supervisorId && prevShiftId === shiftId
      if (sameShift && prevSiteId && prevSiteId !== siteId) {
        agg.pendingPairs.push({ fromSiteId: prevSiteId, toSiteId: siteId })
      }
      prevSupervisorId = supervisorId
      prevShiftId      = shiftId
      prevSiteId       = siteId
    }

    // Bulk-fetch routes (cache + Mapbox) for every distinct pair we collected.
    const allPairs: Array<{ fromSiteId: string; toSiteId: string }> = []
    for (const agg of supByUser.values()) {
      for (const p of agg.pendingPairs) allPairs.push(p)
    }
    const routeByKey = await getRoutesForPairs(tenantId, allPairs)

    const supervisors = Array.from(supByUser.values()).map((agg) => {
      let drivingSeconds = 0
      for (const p of agg.pendingPairs) {
        const r = routeByKey.get(`${p.fromSiteId}|${p.toSiteId}`)
        if (r) drivingSeconds += r.durationSeconds
      }
      const totalH   = Math.round(agg.totalSeconds   / 36) / 100
      const drivingH = Math.round(drivingSeconds     / 36) / 100
      const onSiteH  = Math.max(0, Math.round((totalH - drivingH) * 100) / 100)
      return {
        supervisorId:    agg.supervisorId,
        supervisorName:  agg.supervisorName,
        shiftsCompleted: agg.shiftsCompleted,
        totalHours:      totalH,
        onSiteHours:     onSiteH,
        drivingHours:    drivingH,
        sitesVisited:    agg.sitesVisited.size,
      }
    }).sort((a, b) => a.supervisorName.localeCompare(b.supervisorName))

    // ── Pivot rows → clients[] with embedded sites[] ──────────────────────
    type SiteOut = {
      siteId: string
      siteName: string
      siteAddress: string
      guardCount: number
      shiftsCompleted: number
      hoursWorked: number
    }
    type ClientOut = {
      clientId: string
      clientName: string
      clientStatus: string
      totalSites: number
      totalGuards: number
      totalShifts: number
      totalHours: number
      sites: SiteOut[]
    }

    const clientMap = new Map<string, ClientOut>()
    for (const r of siteRows as any[]) {
      const cid = String(r.client_id)
      let client = clientMap.get(cid)
      if (!client) {
        client = {
          clientId:     cid,
          clientName:   r.client_name,
          clientStatus: r.client_status,
          totalSites:   0,
          totalGuards:  guardByClient.get(cid) ?? 0,
          totalShifts:  0,
          totalHours:   0,
          sites:        [],
        }
        clientMap.set(cid, client)
      }
      if (r.site_id !== null && r.site_id !== undefined) {
        const hours  = Math.round(Number(r.worked_seconds) / 36) / 100  // ÷3600 then round to 2dp
        const sCount = Number(r.shifts_completed)
        client.sites.push({
          siteId:          String(r.site_id),
          siteName:        r.site_name,
          siteAddress:     r.site_address,
          guardCount:      Number(r.guard_count),
          shiftsCompleted: sCount,
          hoursWorked:     hours,
        })
        client.totalSites  += 1
        client.totalShifts += sCount
        client.totalHours   = Math.round((client.totalHours + hours) * 100) / 100
      }
    }

    const clients = Array.from(clientMap.values())
    const supervisorOnSiteHours  = Math.round(supervisors.reduce((s, x) => s + x.onSiteHours,  0) * 100) / 100
    const supervisorDrivingHours = Math.round(supervisors.reduce((s, x) => s + x.drivingHours, 0) * 100) / 100
    const totals = {
      clients:                clients.length,
      sites:                  clients.reduce((s, c) => s + c.totalSites, 0),
      guards:                 tenantTotalGuards,
      hours:                  Math.round(clients.reduce((s, c) => s + c.totalHours, 0) * 100) / 100,
      shiftsCompleted:        clients.reduce((s, c) => s + c.totalShifts, 0),
      supervisors:            supervisors.length,
      supervisorOnSiteHours,
      supervisorDrivingHours,
    }

    return reply.send({
      data: {
        month:      monthStr,
        rangeStart: startIso,
        rangeEnd:   endIso,
        totals,
        clients,
        supervisors,
      },
    })
  })

  // GET /api/accounting/supervisor/:supervisorId?month=YYYY-MM
  //
  // Per-shift detail for one supervisor: every shift in the month with the
  // ordered sequence of geofence visits (site name + lat/lng + entered/exited)
  // so the tenant can render an audit minimap per shift. We also resolve the
  // Mapbox drive time for each consecutive distinct-site transition so the
  // map can show the same number as the /accounting summary row.
  //
  // Lazy-loaded by the /accounting page when the user expands a supervisor row.
  fastify.get('/supervisor/:supervisorId', { preHandler: requireTenantAdmin }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { supervisorId } = request.params as { supervisorId: string }
    const { month } = querySchema.parse(request.query ?? {})

    const now = new Date()
    const [y, m] = month
      ? month.split('-').map(Number)
      : [now.getUTCFullYear(), now.getUTCMonth() + 1]
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end   = new Date(Date.UTC(y, m,     1))
    const startIso = start.toISOString()
    const endIso   = end.toISOString()

    // Confirm the target is actually a supervisor in this tenant before we
    // hand back any of their data.
    const userRows = await db.execute(sql`
      SELECT id, name, role
      FROM users
      WHERE id = ${supervisorId} AND tenant_id = ${tenantId}
      LIMIT 1
    `) as any[]
    const u = userRows[0]
    if (!u || u.role !== 'supervisor') {
      return reply.code(404).send({ error: 'Not found', message: 'Supervisor not found', statusCode: 404 })
    }

    // Pull every visit row inside every completed shift this supervisor
    // worked, joined with the site for its coords + name. siteId IS NOT NULL
    // skips the in-transit segments — only on-site stops appear on the map.
    const visitRows = await db.execute(sql`
      SELECT
        sh.id          AS shift_id,
        sh.starts_at,
        sh.ends_at,
        v.site_id,
        st.name        AS site_name,
        st.latitude,
        st.longitude,
        v.entered_at,
        v.exited_at
      FROM shifts sh
      JOIN shift_site_visits v
        ON v.shift_id  = sh.id
       AND v.tenant_id = sh.tenant_id
      JOIN sites st
        ON st.id        = v.site_id
       AND st.tenant_id = v.tenant_id
      WHERE sh.tenant_id  = ${tenantId}
        AND sh.guard_id   = ${supervisorId}
        AND sh.status     = 'completed'
        AND sh.starts_at >= ${startIso}
        AND sh.starts_at <  ${endIso}
      ORDER BY sh.starts_at ASC, v.entered_at ASC
    `) as any[]

    type Visit = {
      siteId: string
      siteName: string
      latitude: number
      longitude: number
      enteredAt: string
      exitedAt: string | null
    }
    type Shift = {
      shiftId: string
      startsAt: string
      endsAt: string
      visits: Visit[]
      transitions: Array<{
        fromSiteId: string
        toSiteId: string
        durationSeconds: number | null
        distanceMeters: number | null
      }>
      drivingSeconds: number
    }

    const shiftMap = new Map<string, Shift>()
    for (const r of visitRows) {
      const shiftId = String(r.shift_id)
      let s = shiftMap.get(shiftId)
      if (!s) {
        s = {
          shiftId,
          startsAt: String(r.starts_at),
          endsAt:   String(r.ends_at),
          visits:   [],
          transitions: [],
          drivingSeconds: 0,
        }
        shiftMap.set(shiftId, s)
      }
      s.visits.push({
        siteId:    String(r.site_id),
        siteName:  r.site_name,
        latitude:  Number(r.latitude),
        longitude: Number(r.longitude),
        enteredAt: String(r.entered_at),
        exitedAt:  r.exited_at ? String(r.exited_at) : null,
      })
    }

    // Build the pair list across every shift, then resolve in one bulk
    // Mapbox lookup. Same site → same site is skipped (zero-length leg).
    const allPairs: Array<{ fromSiteId: string; toSiteId: string }> = []
    for (const s of shiftMap.values()) {
      for (let i = 1; i < s.visits.length; i++) {
        const from = s.visits[i - 1].siteId
        const to   = s.visits[i].siteId
        if (from === to) continue
        s.transitions.push({ fromSiteId: from, toSiteId: to, durationSeconds: null, distanceMeters: null })
        allPairs.push({ fromSiteId: from, toSiteId: to })
      }
    }
    const routeByKey = await getRoutesForPairs(tenantId, allPairs)
    for (const s of shiftMap.values()) {
      for (const t of s.transitions) {
        const r = routeByKey.get(`${t.fromSiteId}|${t.toSiteId}`)
        if (r) {
          t.durationSeconds = r.durationSeconds
          t.distanceMeters  = r.distanceMeters
          s.drivingSeconds += r.durationSeconds
        }
      }
    }

    const shifts = Array.from(shiftMap.values()).sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )

    return reply.send({
      data: {
        supervisor: { id: u.id, name: u.name },
        shifts,
      },
    })
  })
}
