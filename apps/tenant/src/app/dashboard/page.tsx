'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageShell, Main, Card, CardHeader } from '../../components/ui'
import { tdApi } from '../../lib/api'

const SEV_COLOR: Record<string, { color: string; bg: string }> = {
  low:      { color: '#5c5855', bg: 'rgba(163,160,152,0.1)' },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  high:     { color: '#c96442', bg: 'rgba(201,100,66,0.1)' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
}

function StatCard({
  label,
  value,
  valueColor,
  href,
}: {
  label: string
  value: string | number
  valueColor?: string
  href?: string
}) {
  const inner = (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 24px',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#5a5855')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>{label}</p>
      <p style={{ color: valueColor ?? 'var(--text)', fontSize: 28, fontWeight: 700, margin: '4px 0 0' }}>{value}</p>
    </div>
  )
  return href ? (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
  ) : inner
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }

    Promise.all([
      tdApi.stats.get().catch(() => null),
      tdApi.incidents.list({ limit: 5 }).catch(() => ({ data: [] })),
    ]).then(([s, inc]) => {
      setStats(s?.data ?? null)
      setIncidents(inc.data ?? [])
    }).finally(() => setLoading(false))
  }, [router])

  return (
    <PageShell>
      <Main>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* Stats grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 90 }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
            <StatCard label="Guards" value={stats?.guards ?? '—'} href="/guards" />
            <StatCard label="Sites" value={stats?.sites ?? '—'} valueColor="#c96442" href="/sites" />
            <StatCard label="Open Incidents" value={stats?.openIncidents ?? '—'} valueColor="#f87171" href="/incidents" />
            <StatCard label="Active Shifts" value={stats?.activeShifts ?? '—'} valueColor="#10b981" href="/shifts" />
            <StatCard label="Today's Patrols" value={stats?.todayPatrols ?? '—'} valueColor="#3b82f6" href="/patrols" />
            <StatCard label="Today's Attendance" value={stats?.todayAttendance ?? '—'} valueColor="#fbbf24" />
          </div>
        )}

        {/* Recent Incidents */}
        <Card style={{ marginBottom: 28 }}>
          <CardHeader
            title="Recent Incidents"
            action={
              <Link href="/incidents" style={{ color: '#c96442', fontSize: 13, textDecoration: 'none' }}>
                View all →
              </Link>
            }
          />
          <div>
            {loading ? (
              <div style={{ padding: '20px 22px', color: 'var(--text-3)', fontSize: 13 }}>Loading...</div>
            ) : incidents.length === 0 ? (
              <div style={{ padding: '20px 22px', color: 'var(--text-3)', fontSize: 13 }}>No incidents reported.</div>
            ) : (
              incidents.map((inc) => {
                const slaPast =
                  inc.slaDeadline &&
                  new Date(inc.slaDeadline) < new Date() &&
                  inc.status !== 'resolved' &&
                  inc.status !== 'closed'
                const sev = SEV_COLOR[inc.severity] ?? { color: '#5c5855', bg: 'rgba(163,160,152,0.1)' }
                return (
                  <Link
                    key={inc.id}
                    href={`/incidents/${inc.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 22px',
                      borderBottom: '1px solid var(--border)',
                      textDecoration: 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <p style={{ color: 'var(--text)', fontWeight: 500, fontSize: 14, margin: 0 }}>{inc.title}</p>
                      <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '2px 0 0' }}>
                        {inc.status?.replace(/_/g, ' ')} · {new Date(inc.createdAt).toLocaleString('en-IN')}
                        {slaPast && <span style={{ color: '#f87171', marginLeft: 8 }}>SLA breached</span>}
                      </p>
                    </div>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 9px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      color: sev.color,
                      background: sev.bg,
                      border: `1px solid ${sev.color}30`,
                      flexShrink: 0,
                    }}>
                      {inc.severity}
                    </span>
                  </Link>
                )
              })
            )}
          </div>
        </Card>

        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[
            { href: '/guards', label: 'Manage Guards', desc: 'Add or view guard profiles' },
            { href: '/shifts', label: 'Schedule Shifts', desc: 'Assign guards to sites' },
            { href: '/incidents', label: 'View Incidents', desc: 'Track open incidents' },
          ].map((q) => (
            <Link
              key={q.href}
              href={q.href}
              style={{
                display: 'block',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '20px 24px',
                textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#c96442')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>{q.label}</p>
              <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>{q.desc}</p>
            </Link>
          ))}
        </div>
      </Main>
    </PageShell>
  )
}
