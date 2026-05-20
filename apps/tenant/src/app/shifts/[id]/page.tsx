'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageShell, Main, Card, CardHeader, Badge, Btn } from '../../../components/ui'
import { tdApi } from '../../../lib/api'

const LABEL_COLOR: Record<string, string> = {
  stationary: '#9a9490',
  walking:    '#c96442',
  driving:    '#3b82f6',
}

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  scheduled: { color: '#5c5855', bg: 'rgba(163,160,152,0.12)' },
  active:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  completed: { color: '#9a9490', bg: 'rgba(122,119,115,0.12)' },
  missed:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

type MovementPoint = { ts: string; speedMs: number; label: 'stationary' | 'walking' | 'driving' }

type Movement = {
  walkingMeters: number
  drivingMeters: number
  walkingSeconds: number
  drivingSeconds: number
  stationarySeconds: number
  unaccountedSeconds: number
  meanSpeedMs: number
  idleBaselineMs: number
  pingsConsidered: number
  pingsAccepted: number
  cappedWalking: boolean
  cappedDriving: boolean
  series: MovementPoint[]
}

function formatKm(m: number) {
  if (m < 1000) return `${m} m`
  return `${(m / 1000).toFixed(2)} km`
}

function formatMinutes(seconds: number) {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`
}

/* ─── SVG speed graph ──────────────────────────────────────────────────── */

function SpeedGraph({
  series,
  idleBaselineMs,
  drivingThresholdMs,
  startsAt,
  endsAt,
}: {
  series: MovementPoint[]
  idleBaselineMs: number
  drivingThresholdMs: number
  startsAt: string
  endsAt: string
}) {
  if (series.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
        No GPS data was recorded for this shift.
      </div>
    )
  }

  const W = 1000
  const H = 240
  const PAD = { top: 16, right: 16, bottom: 32, left: 48 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const tMin = new Date(startsAt).getTime()
  const tMax = new Date(endsAt).getTime()
  const tRange = Math.max(1, tMax - tMin)

  const observedMax = series.reduce((m, p) => Math.max(m, p.speedMs), 0)
  const yMax = Math.max(8, Math.ceil(observedMax * 1.1))   // fix the scale so reference lines stay meaningful

  const xOf = (ts: string) => PAD.left + ((new Date(ts).getTime() - tMin) / tRange) * plotW
  const yOf = (s: number) => PAD.top + plotH - (Math.min(s, yMax) / yMax) * plotH

  // Build coloured polylines — one polyline per run of consecutive same-label points
  const runs: { label: string; points: MovementPoint[] }[] = []
  for (const p of series) {
    const last = runs[runs.length - 1]
    if (!last || last.label !== p.label) runs.push({ label: p.label, points: [p] })
    else last.points.push(p)
  }
  // Stitch adjacent runs by sharing a boundary point, so the line is continuous
  for (let i = 1; i < runs.length; i++) {
    runs[i].points.unshift(runs[i - 1].points[runs[i - 1].points.length - 1])
  }

  // Y axis grid + labels
  const yTicks = [0, idleBaselineMs, drivingThresholdMs, yMax]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => a - b)

  // X axis labels — start, ~middle, end
  const xLabels = [
    { ts: startsAt, label: new Date(startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
    { ts: new Date((tMin + tMax) / 2).toISOString(), label: new Date((tMin + tMax) / 2).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
    { ts: endsAt, label: new Date(endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
  ]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Plot background */}
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="#fafaf9" stroke="#e8e5e0" strokeWidth={1} />

        {/* Grid lines + y labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke="#ebe8e2" strokeWidth={1} strokeDasharray={v === 0 ? '0' : '3,3'} />
            <text x={PAD.left - 8} y={yOf(v) + 4} textAnchor="end" fontSize={11} fill="#9a9490">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Reference: idle baseline */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={yOf(idleBaselineMs)}
          y2={yOf(idleBaselineMs)}
          stroke="#9a9490"
          strokeWidth={1.5}
          strokeDasharray="6,4"
        />
        <text x={W - PAD.right} y={yOf(idleBaselineMs) - 4} textAnchor="end" fontSize={10} fill="#9a9490">
          idle baseline · {idleBaselineMs.toFixed(2)} m/s
        </text>

        {/* Reference: driving threshold */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={yOf(drivingThresholdMs)}
          y2={yOf(drivingThresholdMs)}
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="6,4"
        />
        <text x={W - PAD.right} y={yOf(drivingThresholdMs) - 4} textAnchor="end" fontSize={10} fill="#3b82f6">
          vehicle threshold · {drivingThresholdMs.toFixed(1)} m/s
        </text>

        {/* Speed polylines, one per coloured run */}
        {runs.map((run, i) => (
          <polyline
            key={i}
            fill="none"
            stroke={LABEL_COLOR[run.label] ?? '#5c5855'}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={run.points.map((p) => `${xOf(p.ts)},${yOf(p.speedMs)}`).join(' ')}
          />
        ))}

        {/* X axis */}
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#d8d4ce" strokeWidth={1} />
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={xOf(l.ts)}
            y={H - PAD.bottom + 18}
            textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
            fontSize={11}
            fill="#9a9490"
          >
            {l.label}
          </text>
        ))}

        {/* Y axis label */}
        <text x={12} y={PAD.top + plotH / 2} textAnchor="middle" fontSize={11} fill="#9a9490" transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}>
          speed (m/s)
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        {(['stationary', 'walking', 'driving'] as const).map((label) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: LABEL_COLOR[label], display: 'inline-block', borderRadius: 2 }} />
            <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'capitalize' }}>{label === 'driving' ? 'vehicle' : label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Stat tile ────────────────────────────────────────────────────────── */

function StatTile({
  label,
  primary,
  secondary,
  accentColor,
  capped,
}: {
  label: string
  primary: string
  secondary?: string
  accentColor?: string
  capped?: boolean
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: capped ? '1px solid #f59e0b' : '1px solid var(--border)',
      borderRadius: 12,
      padding: '18px 22px',
      position: 'relative',
    }}>
      <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>{label}</p>
      <p style={{ color: accentColor ?? 'var(--text)', fontSize: 24, fontWeight: 700, margin: '6px 0 0', letterSpacing: '-0.02em' }}>{primary}</p>
      {secondary && (
        <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '2px 0 0' }}>{secondary}</p>
      )}
      {capped && (
        <p style={{ color: '#b45309', fontSize: 11, margin: '6px 0 0', fontWeight: 600 }}>
          ⚠ sanity cap applied
        </p>
      )}
    </div>
  )
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

const DRIVING_THRESHOLD_MS = 3.5

export default function ShiftDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [data, setData] = useState<{ shift: any; movement: Movement } | null>(null)
  const [sites, setSites] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    if (!id) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([
      tdApi.shifts.movement(id),
      tdApi.sites.list().catch(() => ({ data: [] })),
      tdApi.users.list().catch(() => ({ data: [] })),
    ])
      .then(([m, s, u]) => {
        setData(m.data)
        setSites(s.data ?? [])
        setUsers(u.data ?? [])
      })
      .catch((e) => setError(e.message ?? 'Failed to load shift'))
      .finally(() => setLoading(false))
  }

  async function recompute() {
    setRecomputing(true)
    try {
      await tdApi.shifts.recomputeMovement(id)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRecomputing(false)
    }
  }

  const shift = data?.shift
  const m = data?.movement
  const sta = shift ? (STATUS_BADGE[shift.status] ?? STATUS_BADGE.scheduled) : null
  const siteName = shift ? (sites.find((s: any) => s.id === shift.siteId)?.name ?? shift.siteId) : ''
  const guardName = shift ? (users.find((u: any) => u.id === shift.guardId)?.name ?? shift.guardId) : ''

  return (
    <PageShell>
      <Main>
        <div style={{ marginBottom: 20 }}>
          <Link href="/shifts" style={{ color: 'var(--text-3)', fontSize: 13, textDecoration: 'none' }}>
            ← Back to shifts
          </Link>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading shift…</div>
        ) : error ? (
          <Card>
            <div style={{ padding: 22, color: '#ef4444', fontSize: 14 }}>{error}</div>
          </Card>
        ) : !shift || !m ? (
          <Card>
            <div style={{ padding: 22, color: 'var(--text-3)', fontSize: 14 }}>Shift not found.</div>
          </Card>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
                  {guardName} · {siteName}
                </h1>
                <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
                  {new Date(shift.startsAt).toLocaleString('en-IN')}
                  {' → '}
                  {new Date(shift.endsAt).toLocaleString('en-IN')}
                </p>
                {sta && (
                  <div style={{ marginTop: 8 }}>
                    <Badge label={shift.status} color={sta.color} bg={sta.bg} />
                  </div>
                )}
              </div>
              <Btn variant="secondary" onClick={recompute} loading={recomputing}>
                Recompute movement
              </Btn>
            </div>

            {/* Stat tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
              <StatTile
                label="Walking"
                primary={formatKm(m.walkingMeters)}
                secondary={formatMinutes(m.walkingSeconds)}
                accentColor={LABEL_COLOR.walking}
                capped={m.cappedWalking}
              />
              <StatTile
                label="Vehicle"
                primary={formatKm(m.drivingMeters)}
                secondary={formatMinutes(m.drivingSeconds)}
                accentColor={LABEL_COLOR.driving}
                capped={m.cappedDriving}
              />
              <StatTile
                label="Stationary"
                primary={formatMinutes(m.stationarySeconds)}
                secondary={`${Math.round(m.stationarySeconds / 60)} min idle`}
                accentColor={LABEL_COLOR.stationary}
              />
              <StatTile
                label="Total movement"
                primary={formatKm(m.walkingMeters + m.drivingMeters)}
                secondary={`mean ${m.meanSpeedMs.toFixed(2)} m/s`}
              />
            </div>

            {/* Speed graph */}
            <Card style={{ marginBottom: 24 }}>
              <CardHeader title="Speed timeline" />
              <div style={{ padding: '14px 22px 18px' }}>
                <p style={{ color: 'var(--text-3)', fontSize: 12.5, margin: '0 0 12px' }}>
                  Smoothed GPS speed across the shift — colour = mode at each interval.
                </p>
                <SpeedGraph
                  series={m.series}
                  idleBaselineMs={m.idleBaselineMs}
                  drivingThresholdMs={DRIVING_THRESHOLD_MS}
                  startsAt={shift.startsAt}
                  endsAt={shift.endsAt}
                />
                <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '14px 0 0', lineHeight: 1.5 }}>
                  Idle baseline is calibrated from this shift's own GPS noise floor (25th percentile of smoothed speed),
                  clamped to <code style={{ background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>[0.5, 1.0] m/s</code>.
                  Vehicle is counted when the smoothed speed stays above {DRIVING_THRESHOLD_MS} m/s for at least 2 minutes
                  <em> or </em> when the device's motion sensor confirms vehicle, running, or cycling — anything faster than a
                  legitimate patrol pace is treated as vehicle time, not walking.
                </p>
              </div>
            </Card>

            {/* Diagnostics */}
            <Card>
              <CardHeader title="Diagnostics" />
              <div style={{ padding: '14px 22px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
                <div>
                  <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 12 }}>Pings considered</p>
                  <p style={{ color: 'var(--text)', margin: '2px 0 0', fontWeight: 600 }}>{m.pingsConsidered.toLocaleString()}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 12 }}>Pings accepted</p>
                  <p style={{ color: 'var(--text)', margin: '2px 0 0', fontWeight: 600 }}>
                    {m.pingsAccepted.toLocaleString()}
                    {m.pingsConsidered > 0 && (
                      <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                        ({Math.round((m.pingsAccepted / m.pingsConsidered) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 12 }}>Mean speed</p>
                  <p style={{ color: 'var(--text)', margin: '2px 0 0', fontWeight: 600 }}>{m.meanSpeedMs.toFixed(2)} m/s</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 12 }}>Idle baseline</p>
                  <p style={{ color: 'var(--text)', margin: '2px 0 0', fontWeight: 600 }}>{m.idleBaselineMs.toFixed(2)} m/s</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 12 }}>Unaccounted time</p>
                  <p style={{ color: m.unaccountedSeconds > 60 ? '#b45309' : 'var(--text)', margin: '2px 0 0', fontWeight: 600 }}>
                    {formatMinutes(m.unaccountedSeconds)}
                  </p>
                  <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '2px 0 0' }}>
                    GPS outage or dropped low-accuracy pings
                  </p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 12 }}>Last computed</p>
                  <p style={{ color: 'var(--text)', margin: '2px 0 0', fontWeight: 600 }}>
                    {shift.movementComputedAt ? new Date(shift.movementComputedAt).toLocaleString('en-IN') : 'on-demand'}
                  </p>
                </div>
              </div>
            </Card>
          </>
        )}
      </Main>
    </PageShell>
  )
}
