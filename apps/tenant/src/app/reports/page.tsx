'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageShell, Main, PageHeader, Card } from '../../components/ui'
import { tdApi } from '../../lib/api'

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

type SortKey =
  | 'name'
  | 'shiftsCompleted'
  | 'shiftsMissed'
  | 'shiftsScheduled'
  | 'shiftsAbandoned'
  | 'onSitePct'

function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return '—'
  return `${pct.toFixed(1)}%`
}

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

  const totals = useMemo(() => {
    return guards.reduce(
      (acc, g) => {
        acc.guards += 1
        acc.shiftsCompleted += g.shiftsCompleted
        acc.shiftsMissed    += g.shiftsMissed
        acc.shiftsScheduled += g.shiftsScheduled
        acc.shiftsAbandoned += g.shiftsAbandoned ?? 0
        return acc
      },
      { guards: 0, shiftsCompleted: 0, shiftsMissed: 0, shiftsScheduled: 0, shiftsAbandoned: 0 },
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

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Reports"
          subtitle="Monthly summary of every guard — shifts completed and missed. Click any row for the per-shift detail."
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 22 }}>
          <Stat label="Guards" value={totals.guards} />
          <Stat label="Shifts completed" value={totals.shiftsCompleted} />
          <Stat label="Shifts missed" value={totals.shiftsMissed} subTone={totals.shiftsMissed > 0 ? 'warn' : undefined} />
          <Stat
            label="Shifts abandoned"
            value={totals.shiftsAbandoned}
            subTone={totals.shiftsAbandoned > 0 ? 'warn' : undefined}
            sub={totals.shiftsAbandoned > 0 ? 'auto-ended off-site' : undefined}
          />
          <Stat label="Upcoming shifts" value={totals.shiftsScheduled} />
        </div>

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
                    <SortTh label="Guard"     sortKey="name"             current={sortKey} dir={sortDir} onClick={changeSort} />
                    <SortTh label="Completed" sortKey="shiftsCompleted"  current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="Missed"    sortKey="shiftsMissed"     current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="Abandoned" sortKey="shiftsAbandoned"  current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="Upcoming"  sortKey="shiftsScheduled"  current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                    <SortTh label="On site %" sortKey="onSitePct"        current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
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
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#1a1916', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{g.shiftsCompleted}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: g.shiftsMissed > 0 ? '#b91c1c' : '#9a9490', fontVariantNumeric: 'tabular-nums' }}>{g.shiftsMissed}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: (g.shiftsAbandoned ?? 0) > 0 ? '#9a3412' : '#9a9490', fontVariantNumeric: 'tabular-nums' }}>{g.shiftsAbandoned ?? 0}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#5c5855', fontVariantNumeric: 'tabular-nums' }}>{g.shiftsScheduled}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: g.onSitePct == null ? '#9a9490' : g.onSitePct >= 85 ? '#10b981' : g.onSitePct >= 60 ? '#f59e0b' : '#ef4444', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtPct(g.onSitePct)}</td>
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
      </Main>
    </PageShell>
  )
}

function Stat({
  label, value, sub, subTone,
}: { label: string; value: string | number; sub?: string; subTone?: 'warn' }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e5e0', borderRadius: 12, padding: '14px 16px',
    }}>
      <span style={{ fontSize: 11.5, color: '#9a9490', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1916', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11.5, color: subTone === 'warn' ? '#b91c1c' : '#9a9490', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  )
}
