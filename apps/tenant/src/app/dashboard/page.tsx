'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageShell, Main, Card, CardHeader } from '../../components/ui'
import { tdApi } from '../../lib/api'

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
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#5a5855')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>{label}</p>
      <p style={{ color: valueColor ?? 'var(--text)', fontSize: 28, fontWeight: 700, margin: '4px 0 0' }}>{value}</p>
    </div>
  )
  return href ? (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      {inner}
    </Link>
  ) : (
    inner
  )
}

/* ─── Admin / Manager dashboard ────────────────────────────────────────── */

function AdminDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    tdApi.stats
      .get()
      .then((s) => setStats(s?.data ?? null))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 90 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
          <StatCard label="Guards" value={stats?.guards ?? '—'} href="/guards" />
          <StatCard label="Sites" value={stats?.sites ?? '—'} valueColor="#c96442" href="/sites" />
          <StatCard label="Active Shifts" value={stats?.activeShifts ?? '—'} valueColor="#10b981" href="/shifts" />
          <StatCard label="Today's Attendance" value={stats?.todayAttendance ?? '—'} valueColor="#fbbf24" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { href: '/guards',     label: 'Manage Guards',  desc: 'Add or view guard profiles' },
          { href: '/shifts',     label: 'Schedule Shifts', desc: 'Assign guards to sites' },
          { href: '/guard-status', label: 'Guard Status', desc: 'Live presence and check-in state' },
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
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#c96442')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>{q.label}</p>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>{q.desc}</p>
          </Link>
        ))}
      </div>
    </>
  )
}

/* ─── Supervisor dashboard ─────────────────────────────────────────────── */

function SupervisorDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [guardStatus, setGuardStatus] = useState<any[]>([])
  const [mySites, setMySites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      tdApi.stats.get().catch(() => null),
      tdApi.guardStatus.list().catch(() => ({ data: [] })),
      tdApi.sites.list().catch(() => ({ data: [] })),
    ])
      .then(([s, gs, sites]) => {
        setStats(s?.data ?? null)
        setGuardStatus(gs.data ?? [])
        setMySites(sites.data ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  const onShift = guardStatus.length
  const online = guardStatus.filter((g: any) => g.isOnline).length

  return (
    <>
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 90 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
          <StatCard label="My Sites" value={stats?.sites ?? mySites.length} valueColor="#c96442" href="/sites" />
          <StatCard label="On Shift" value={onShift} href="/guard-status" />
          <StatCard label="Online Now" value={online} valueColor="#10b981" href="/guard-status" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16, marginBottom: 28 }}>
        <Card>
          <CardHeader
            title="Guards on Shift"
            action={
              <Link href="/guard-status" style={{ color: '#c96442', fontSize: 13, textDecoration: 'none' }}>
                View all →
              </Link>
            }
          />
          <div>
            {loading ? (
              <div style={{ padding: '20px 22px', color: 'var(--text-3)', fontSize: 13 }}>Loading...</div>
            ) : guardStatus.length === 0 ? (
              <div style={{ padding: '20px 22px', color: 'var(--text-3)', fontSize: 13 }}>No guards currently on shift.</div>
            ) : (
              guardStatus.slice(0, 8).map((g: any) => (
                <div
                  key={g.guardId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 22px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <p style={{ color: 'var(--text)', fontWeight: 500, fontSize: 14, margin: 0 }}>{g.guardName}</p>
                    <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '2px 0 0' }}>{g.siteName}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 20,
                        background: g.isOnline ? 'rgba(16,185,129,0.1)' : 'var(--surface-2)',
                        color: g.isOnline ? '#10b981' : 'var(--text-3)',
                        border: g.isOnline ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border)',
                      }}
                    >
                      {g.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="My Sites"
            action={
              <Link href="/sites" style={{ color: '#c96442', fontSize: 13, textDecoration: 'none' }}>
                View all →
              </Link>
            }
          />
          <div>
            {loading ? (
              <div style={{ padding: '20px 22px', color: 'var(--text-3)', fontSize: 13 }}>Loading...</div>
            ) : mySites.length === 0 ? (
              <div style={{ padding: '20px 22px', color: 'var(--text-3)', fontSize: 13 }}>No sites assigned.</div>
            ) : (
              mySites.slice(0, 8).map((s: any) => {
                const guardsHere = guardStatus.filter((g: any) => g.siteId === s.id).length
                return (
                  <Link
                    key={s.id}
                    href="/sites"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 22px',
                      borderBottom: '1px solid var(--border)',
                      textDecoration: 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <p style={{ color: 'var(--text)', fontWeight: 500, fontSize: 14, margin: 0 }}>{s.name}</p>
                    <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{guardsHere} on shift</span>
                  </Link>
                )
              })
            )}
          </div>
        </Card>
      </div>
    </>
  )
}

/* ─── Guard dashboard ──────────────────────────────────────────────────── */

function GuardDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [shifts, setShifts] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date()
    to.setDate(to.getDate() + 7)

    Promise.all([
      tdApi.stats.get().catch(() => null),
      tdApi.shifts.list({ from: from.toISOString(), to: to.toISOString() }).catch(() => ({ data: [] })),
      tdApi.sites.list().catch(() => ({ data: [] })),
    ])
      .then(([s, sh, st]) => {
        setStats(s?.data ?? null)
        setShifts(sh.data ?? [])
        setSites(st.data ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  const todayKey = new Date().toDateString()
  const todayShifts = shifts.filter((sh: any) => new Date(sh.startsAt).toDateString() === todayKey)
  const upcomingShifts = shifts.filter((sh: any) => new Date(sh.startsAt) > new Date()).slice(0, 5)

  return (
    <>
      <div
        style={{
          marginBottom: 24,
          padding: '14px 18px',
          borderRadius: 10,
          background: 'rgba(201,100,66,0.06)',
          border: '1px solid rgba(201,100,66,0.2)',
          color: 'var(--text-2)',
          fontSize: 13,
        }}
      >
        For check-ins and patrols, please use the Arrow Security mobile app on your phone.
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 90 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
          <StatCard label="Today's Shifts" value={todayShifts.length} valueColor="#10b981" href="/shifts" />
          <StatCard label="My Sites" value={stats?.sites ?? sites.length} valueColor="#c96442" href="/sites" />
        </div>
      )}

      <Card style={{ marginBottom: 28 }}>
        <CardHeader
          title="My Upcoming Shifts"
          action={
            <Link href="/shifts" style={{ color: '#c96442', fontSize: 13, textDecoration: 'none' }}>
              View all →
            </Link>
          }
        />
        <div>
          {loading ? (
            <div style={{ padding: '20px 22px', color: 'var(--text-3)', fontSize: 13 }}>Loading...</div>
          ) : upcomingShifts.length === 0 ? (
            <div style={{ padding: '20px 22px', color: 'var(--text-3)', fontSize: 13 }}>No upcoming shifts in the next 7 days.</div>
          ) : (
            upcomingShifts.map((sh: any) => {
              const site = sites.find((s: any) => s.id === sh.siteId)
              const start = new Date(sh.startsAt)
              const end = new Date(sh.endsAt)
              return (
                <div
                  key={sh.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 22px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <p style={{ color: 'var(--text)', fontWeight: 500, fontSize: 14, margin: 0 }}>{site?.name ?? 'Site'}</p>
                    <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '2px 0 0' }}>
                      {start.toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' → '}
                      {end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: sh.status === 'active' ? 'rgba(16,185,129,0.1)' : 'var(--surface-2)',
                      color: sh.status === 'active' ? '#10b981' : 'var(--text-3)',
                      border: sh.status === 'active' ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border)',
                    }}
                  >
                    {sh.status}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </>
  )
}

/* ─── Entrypoint ───────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) {
      router.replace('/login')
      return
    }

    try {
      const u = localStorage.getItem('td_user')
      if (u) {
        const parsed = JSON.parse(u)
        setRole(parsed.role ?? 'tenant_admin')
        setUserName(parsed.name ?? '')
      } else {
        setRole('tenant_admin')
      }
    } catch {
      setRole('tenant_admin')
    }
  }, [router])

  const isAdmin = role === 'tenant_admin' || role === 'platform_admin'
  const isSupervisor = role === 'supervisor'
  const isGuard = role === 'guard'

  const subtitle = isAdmin
    ? 'Operations overview across all sites'
    : isSupervisor
      ? `Live view of guards and sites under your supervision${userName ? ', ' + userName.split(' ')[0] : ''}`
      : isGuard
        ? `Your shifts${userName ? ', ' + userName.split(' ')[0] : ''}`
        : new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <PageShell>
      <Main>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>{subtitle}</p>
        </div>

        {role === null ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 90 }} />
            ))}
          </div>
        ) : isAdmin ? (
          <AdminDashboard />
        ) : isSupervisor ? (
          <SupervisorDashboard />
        ) : (
          <GuardDashboard />
        )}
      </Main>
    </PageShell>
  )
}
