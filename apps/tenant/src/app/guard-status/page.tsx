'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, CardHeader } from '../../components/ui'
import { tdApi } from '../../lib/api'

type GuardRow = {
  shiftId: string
  siteId: string
  siteName: string
  guardId: string
  guardName: string
  guardUsername: string
  shiftStatus: string
  shiftStartsAt: string
  shiftEndsAt: string
  attendanceId: string | null
  lastCheckInAt: string | null
  lastCheckInType: string | null
  selfieUrl: string | null
  livenessScore: number | null
  isWithinGeofence: boolean | null
  selfieReviewStatus: string | null
  lastPingAt: string | null
  lastLat: number | null
  lastLng: number | null
  battery: number | null
  isOnline: boolean
}

const SHIFT_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  active:    { bg: 'rgba(16,185,129,0.1)',  color: '#10b981', label: 'Active' },
  scheduled: { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', label: 'Scheduled' },
  completed: { bg: 'rgba(92,88,85,0.1)',    color: '#5c5855', label: 'Completed' },
  missed:    { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', label: 'Missed' },
}

const REVIEW_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', label: 'Pending' },
  approved: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', label: 'Approved' },
  flagged:  { bg: 'rgba(239,68,68,0.1)',  color: '#ef4444', label: 'Flagged' },
}

function Badge({ type, value }: { type: 'shift' | 'review' | 'geofence' | 'online'; value: string | boolean | null }) {
  if (value === null || value === undefined) {
    return <span style={{ color: '#9a9490', fontSize: 12 }}>—</span>
  }

  if (type === 'shift') {
    const b = SHIFT_BADGE[value as string] ?? { bg: '#eee', color: '#555', label: value }
    return <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: b.bg, color: b.color }}>{b.label}</span>
  }

  if (type === 'review') {
    const b = REVIEW_BADGE[value as string] ?? { bg: '#eee', color: '#555', label: value }
    return <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: b.bg, color: b.color }}>{b.label}</span>
  }

  if (type === 'geofence') {
    return value
      ? <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>✓ Inside</span>
      : <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>✗ Outside</span>
  }

  if (type === 'online') {
    return value
      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10b981', fontSize: 12, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          Online
        </span>
      : <span style={{ color: '#9a9490', fontSize: 12 }}>Offline</span>
  }

  return null
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function GuardStatusPage() {
  const router = useRouter()
  const [rows, setRows] = useState<GuardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [siteFilter, setSiteFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const load = useCallback(async () => {
    try {
      const r = await tdApi.guardStatus.list()
      setRows(r.data)
      setLastRefresh(new Date())
    } catch {}
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    setLoading(true)
    load().finally(() => setLoading(false))
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load, router])

  const sites = [...new Set(rows.map(r => r.siteName))].sort()
  const filtered = rows.filter(r => {
    if (siteFilter && r.siteName !== siteFilter) return false
    if (statusFilter === 'online' && !r.isOnline) return false
    if (statusFilter === 'offline' && r.isOnline) return false
    if (statusFilter === 'active' && r.shiftStatus !== 'active') return false
    return true
  })

  const onlineCount = rows.filter(r => r.isOnline).length
  const activeCount = rows.filter(r => r.shiftStatus === 'active').length

  const sel: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 7, border: '1px solid #e8e5e0',
    background: '#fff', fontSize: 13, color: '#1a1916', cursor: 'pointer',
  }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Guard Status"
          subtitle={`Live view of guard activity — refreshes every 30s · Last: ${fmtTime(lastRefresh.toISOString())}`}
          action={
            <button
              onClick={load}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid #e8e5e0',
                background: '#fff', fontSize: 13, color: '#5c5855', cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          }
        />

        {/* Summary strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Guards on shift', value: rows.length, color: '#1a1916' },
            { label: 'Active right now', value: activeCount, color: '#c96442' },
            { label: 'Online now', value: onlineCount, color: '#10b981' },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, background: '#fff', border: '1px solid #e8e5e0', borderRadius: 10,
              padding: '14px 20px',
            }}>
              <p style={{ color: '#9a9490', fontSize: 12, margin: 0 }}>{s.label}</p>
              <p style={{ color: s.color, fontSize: 24, fontWeight: 700, margin: '4px 0 0' }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} style={sel}>
            <option value="">All sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={sel}>
            <option value="">All statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="active">Active shift</option>
          </select>
          {(siteFilter || statusFilter) && (
            <button onClick={() => { setSiteFilter(''); setStatusFilter('') }} style={{ ...sel, color: '#c96442' }}>
              Clear
            </button>
          )}
        </div>

        <Card overflow="hidden">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9a9490' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9a9490' }}>
              {rows.length === 0 ? 'No shifts in the last 24 hours' : 'No guards match the selected filters'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafaf9', borderBottom: '1px solid #e8e5e0' }}>
                  {['Guard', 'Site', 'Shift', 'Check-in', 'Geofence', 'Selfie', 'GPS', 'Battery'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                      fontSize: 12, color: '#9a9490', letterSpacing: '0.03em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr
                    key={row.shiftId}
                    style={{ borderBottom: '1px solid #f0ede8', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ margin: 0, fontWeight: 600, color: '#1a1916' }}>{row.guardName}</p>
                      <p style={{ margin: '2px 0 0', color: '#9a9490', fontSize: 11 }}>@{row.guardUsername}</p>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#5c5855' }}>{row.siteName}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge type="shift" value={row.shiftStatus} />
                      <p style={{ margin: '3px 0 0', color: '#9a9490', fontSize: 11 }}>
                        {fmtTime(row.shiftStartsAt)} – {fmtTime(row.shiftEndsAt)}
                      </p>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#5c5855' }}>
                      {row.lastCheckInAt ? (
                        <>
                          <p style={{ margin: 0 }}>{fmtRelative(row.lastCheckInAt)}</p>
                          <p style={{ margin: '2px 0 0', color: '#9a9490', fontSize: 11 }}>
                            {row.lastCheckInType === 'check_in' ? 'Check in' : 'Check out'}
                          </p>
                        </>
                      ) : <span style={{ color: '#9a9490' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge type="geofence" value={row.isWithinGeofence} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {row.selfieUrl ? (
                        <img
                          src={row.selfieUrl}
                          alt="Check-in selfie"
                          style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid #e8e5e0' }}
                        />
                      ) : (
                        <span style={{ color: '#9a9490', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge type="online" value={row.isOnline} />
                      {row.lastPingAt && (
                        <p style={{ margin: '2px 0 0', color: '#9a9490', fontSize: 11 }}>{fmtRelative(row.lastPingAt)}</p>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#5c5855' }}>
                      {row.battery != null ? `${row.battery}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Main>

    </PageShell>
  )
}
