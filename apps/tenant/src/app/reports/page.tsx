'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageShell, Main, PageHeader, Card } from '../../components/ui'
import { tdApi } from '../../lib/api'

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function lastNMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function fmtHours(seconds: number): string {
  if (seconds <= 0) return '0h'
  const h = seconds / 3600
  return h >= 10 ? `${h.toFixed(0)}h` : `${h.toFixed(1)}h`
}

/* ─── Movement bar — three stacked segments per row ─────────────────────── */
//
// Tiny visual cue an admin can scan down the table. Widths are computed against
// the row max so each row's bar shows the *mix* (walking vs driving vs idle),
// not the absolute time — that's what the numeric columns are for. When tracked
// is 0 we render a flat grey bar so the row doesn't look broken.

function MovementBar({
  walking, driving, idle,
}: { walking: number; driving: number; idle: number }) {
  const total = walking + driving + idle
  if (total === 0) {
    return (
      <div style={{ height: 6, background: '#ebe8e2', borderRadius: 3, width: 120 }} />
    )
  }
  const w = (walking / total) * 100
  const d = (driving / total) * 100
  const i = (idle    / total) * 100
  return (
    <div title={`walking ${w.toFixed(0)}% · driving ${d.toFixed(0)}% · idle ${i.toFixed(0)}%`}
      style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', width: 120, background: '#ebe8e2' }}>
      <div style={{ width: `${w}%`, background: '#10b981' }} />
      <div style={{ width: `${d}%`, background: '#3b82f6' }} />
      <div style={{ width: `${i}%`, background: '#d4a574' }} />
    </div>
  )
}

/* ─── Sort header ───────────────────────────────────────────────────────── */

type SortKey =
  | 'name' | 'shiftsCompleted' | 'shiftsMissed'
  | 'walkingSeconds' | 'drivingSeconds' | 'idleSeconds'
  | 'trackedSeconds' | 'activePct'

function SortTh({
  label, sortKey, current, dir, onClick, align = 'left',
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: 'asc' | 'desc'
  onClick: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === current
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        padding: '10px 14px', textAlign: align,
        fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
        color: active ? '#c96442' : '#9a9490',
        textTransform: 'uppercase',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}{active && (dir === 'asc' ? ' ↑' : ' ↓')}
    </th>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
//
// Next 16's static prerender chokes on top-level useSearchParams() in a client
// page, so we extract the content into an inner component and wrap it in
// Suspense at the export boundary. The Suspense fallback is null because the
// shell renders immediately and the inner component's own loading state takes
// over once Suspense resolves.

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsContent />
    </Suspense>
  )
}

function ReportsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const initialMonth = params.get('month') || currentMonthKey()

  const [month, setMonth] = useState(initialMonth)
  const [guards, setGuards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Display page size — 5k rows in one DOM is sluggish, this keeps it snappy
  // while still letting the user "Load more" without leaving the page.
  const PAGE = 50
  const [visible, setVisible] = useState(PAGE)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem('td_token')) router.replace('/login')
  }, [router])

  useEffect(() => {
    setLoading(true)
    tdApi.guardStats.list({ month })
      .then(r => setGuards(r.data.guards ?? []))
      .catch(() => setGuards([]))
      .finally(() => setLoading(false))
    setVisible(PAGE)
  }, [month])

  function changeSort(k: SortKey) {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(k)
      setSortDir(k === 'name' ? 'asc' : 'desc')
    }
  }

  // Tenant-wide rollup for the strip at the top — fast at 5k since it's just
  // summing the already-aggregated guard rows in memory.
  const totals = useMemo(() => {
    return guards.reduce(
      (acc, g) => {
        acc.guards += 1
        acc.activeGuards     += (g.trackedSeconds ?? 0) > 0 ? 1 : 0
        acc.shiftsCompleted  += g.shiftsCompleted
        acc.shiftsMissed     += g.shiftsMissed
        acc.walkingSeconds   += g.walkingSeconds
        acc.drivingSeconds   += g.drivingSeconds
        acc.idleSeconds      += g.idleSeconds
        acc.trackedSeconds   += g.trackedSeconds
        return acc
      },
      { guards: 0, activeGuards: 0, shiftsCompleted: 0, shiftsMissed: 0,
        walkingSeconds: 0, drivingSeconds: 0, idleSeconds: 0, trackedSeconds: 0 },
    )
  }, [guards])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = q ? guards.filter(g =>
      g.guardName?.toLowerCase().includes(q) || g.guardUsername?.toLowerCase().includes(q)
    ) : guards.slice()
    rows.sort((a, b) => {
      let av: any, bv: any
      if (sortKey === 'name') { av = a.guardName?.toLowerCase() ?? ''; bv = b.guardName?.toLowerCase() ?? '' }
      else { av = a[sortKey] ?? 0; bv = b[sortKey] ?? 0 }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [guards, search, sortKey, sortDir])

  const visibleRows = filtered.slice(0, visible)
  const tenantTrackedAvg = totals.activeGuards > 0
    ? Math.round(((totals.walkingSeconds + totals.drivingSeconds) / totals.trackedSeconds) * 1000) / 10
    : null

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Reports"
          subtitle="Monthly summary of every guard — shifts worked, hours tracked, walking · driving · idle breakdown. Click any row for the per-shift detail."
          action={
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e5e0',
                background: '#fff', fontSize: 13.5, color: '#1a1916',
                cursor: 'pointer',
              }}
            >
              {lastNMonths(12).map(k => (
                <option key={k} value={k}>{monthLabel(k)}</option>
              ))}
            </select>
          }
        />

        {/* Tenant rollup strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 22 }}>
          <Stat label="Guards" value={totals.guards} sub={`${totals.activeGuards} with tracked time`} />
          <Stat label="Shifts completed" value={totals.shiftsCompleted} sub={totals.shiftsMissed > 0 ? `${totals.shiftsMissed} missed` : undefined} subTone={totals.shiftsMissed > 0 ? 'warn' : undefined} />
          <Stat label="Walking" value={fmtHours(totals.walkingSeconds)} dot="#10b981" />
          <Stat label="Driving" value={fmtHours(totals.drivingSeconds)} dot="#3b82f6" />
          <Stat label="Idle"    value={fmtHours(totals.idleSeconds)}    dot="#d4a574" />
          <Stat label="Active %" value={tenantTrackedAvg !== null ? `${tenantTrackedAvg}%` : '—'} sub="walking + driving / tracked" />
        </div>

        {/* Search */}
        <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search guards by name or username…"
            style={{
              flex: 1, maxWidth: 360,
              padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e5e0',
              background: '#fff', fontSize: 13.5, color: '#1a1916',
            }}
          />
          <span style={{ color: '#9a9490', fontSize: 12.5 }}>
            {loading ? 'Loading…' : `${filtered.length} guard${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Table */}
        <Card overflow="hidden">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9a9490' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9a9490' }}>
              {guards.length === 0 ? 'No guards in this tenant yet.' : 'No guards match the search.'}
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#fafaf9', borderBottom: '1px solid #e8e5e0' }}>
                    <SortTh label="Guard"     sortKey="name"            current={sortKey} dir={sortDir} onClick={changeSort} />
                    <SortTh label="Shifts"    sortKey="shiftsCompleted" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="Walking"   sortKey="walkingSeconds"  current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="Driving"   sortKey="drivingSeconds"  current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="Idle"      sortKey="idleSeconds"     current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="Tracked"   sortKey="trackedSeconds"  current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="Active %"  sortKey="activePct"       current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <th style={{ padding: '10px 14px', textAlign: 'left' }} />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(g => (
                    <tr
                      key={g.guardId}
                      onClick={() => router.push(`/guards/${g.guardId}?month=${month}`)}
                      style={{ borderBottom: '1px solid #f0ede8', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#1a1916' }}>{g.guardName}</div>
                        <div style={{ fontSize: 11.5, color: '#9a9490', marginTop: 2 }}>@{g.guardUsername}</div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#1a1916', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ fontWeight: 600 }}>{g.shiftsCompleted}</span>
                        {g.shiftsMissed > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#b91c1c' }}>·{g.shiftsMissed}m</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#5c5855', fontVariantNumeric: 'tabular-nums' }}>{fmtHours(g.walkingSeconds)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#5c5855', fontVariantNumeric: 'tabular-nums' }}>{fmtHours(g.drivingSeconds)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#5c5855', fontVariantNumeric: 'tabular-nums' }}>{fmtHours(g.idleSeconds)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#1a1916', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtHours(g.trackedSeconds)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#1a1916', fontVariantNumeric: 'tabular-nums' }}>
                        {g.activePct === null ? <span style={{ color: '#9a9490' }}>—</span> : `${g.activePct}%`}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <MovementBar walking={g.walkingSeconds} driving={g.drivingSeconds} idle={g.idleSeconds} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible < filtered.length && (
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid #f0ede8', background: '#fafaf9' }}>
                  <button
                    onClick={() => setVisible(v => v + PAGE)}
                    style={{
                      padding: '7px 16px', borderRadius: 7, border: '1px solid #e8e5e0',
                      background: '#fff', color: '#5c5855', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Load more ({filtered.length - visible} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Legend */}
        <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'center', color: '#9a9490', fontSize: 12 }}>
          <Legend dot="#10b981" label="Walking" />
          <Legend dot="#3b82f6" label="Driving" />
          <Legend dot="#d4a574" label="Idle" />
          <span style={{ marginLeft: 'auto' }}>Bar shows mix per guard; widths sum to 100%</span>
        </div>
      </Main>
    </PageShell>
  )
}

function Stat({
  label, value, sub, dot, subTone,
}: { label: string; value: string | number; sub?: string; dot?: string; subTone?: 'warn' }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e5e0', borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flexShrink: 0 }} />}
        <span style={{ fontSize: 11.5, color: '#9a9490', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1916', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11.5, color: subTone === 'warn' ? '#b91c1c' : '#9a9490', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: dot }} />
      {label}
    </span>
  )
}
