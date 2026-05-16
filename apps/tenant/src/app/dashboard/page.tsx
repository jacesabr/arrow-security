'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'

const SEV_COLORS: Record<string, string> = {
  low: 'bg-slate-700 text-slate-300',
  medium: 'bg-yellow-900 text-yellow-300',
  high: 'bg-orange-900 text-orange-300',
  critical: 'bg-red-900 text-red-300',
}

function StatCard({
  label,
  value,
  color,
  href,
}: {
  label: string
  value: string | number
  color: string
  href?: string
}) {
  const inner = (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
      <p className="text-slate-400 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-1">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-pulse h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            <StatCard label="Guards" value={stats?.guards ?? '—'} color="text-white" href="/guards" />
            <StatCard label="Sites" value={stats?.sites ?? '—'} color="text-indigo-400" href="/sites" />
            <StatCard label="Open Incidents" value={stats?.openIncidents ?? '—'} color="text-red-400" href="/incidents" />
            <StatCard label="Active Shifts" value={stats?.activeShifts ?? '—'} color="text-emerald-400" href="/shifts" />
            <StatCard label="Today's Patrols" value={stats?.todayPatrols ?? '—'} color="text-cyan-400" href="/patrols" />
            <StatCard label="Today's Attendance" value={stats?.todayAttendance ?? '—'} color="text-yellow-400" />
          </div>
        )}

        {/* Recent Incidents */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl mb-8">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-white font-semibold">Recent Incidents</h2>
            <Link href="/incidents" className="text-indigo-400 text-sm hover:text-indigo-300">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-slate-800">
            {loading ? (
              <div className="p-6 text-slate-500">Loading...</div>
            ) : incidents.length === 0 ? (
              <div className="p-6 text-slate-500">No incidents reported.</div>
            ) : (
              incidents.map((inc) => {
                const slaPast =
                  inc.slaDeadline &&
                  new Date(inc.slaDeadline) < new Date() &&
                  inc.status !== 'resolved' &&
                  inc.status !== 'closed'
                return (
                  <Link
                    key={inc.id}
                    href={`/incidents/${inc.id}`}
                    className="px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors block"
                  >
                    <div>
                      <p className="text-white font-medium">{inc.title}</p>
                      <p className="text-slate-500 text-sm">
                        {inc.status?.replace(/_/g, ' ')} ·{' '}
                        {new Date(inc.createdAt).toLocaleString('en-IN')}
                        {slaPast && <span className="text-red-400 ml-2">SLA breached</span>}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        SEV_COLORS[inc.severity] ?? 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {inc.severity}
                    </span>
                  </Link>
                )
              })
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { href: '/guards', label: 'Manage Guards', icon: '👮', desc: 'Add or view guard profiles' },
            { href: '/shifts', label: 'Schedule Shifts', icon: '📅', desc: 'Assign guards to sites' },
            { href: '/incidents', label: 'View Incidents', icon: '⚠️', desc: 'Track open incidents' },
          ].map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-indigo-600 transition-colors"
            >
              <div className="text-2xl mb-3">{q.icon}</div>
              <p className="text-white font-medium">{q.label}</p>
              <p className="text-slate-500 text-sm mt-1">{q.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
