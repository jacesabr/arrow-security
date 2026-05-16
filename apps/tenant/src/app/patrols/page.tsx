'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'

export default function PatrolsPage() {
  const router = useRouter()
  const [patrols, setPatrols] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [filterSite, setFilterSite] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }

    Promise.all([
      tdApi.sites.list().catch(() => ({ data: [] })),
      tdApi.users.list().catch(() => ({ data: [] })),
    ]).then(([s, u]) => {
      setSites(s.data ?? [])
      setUsers(u.data ?? [])
    })

    tdApi.patrols
      .list()
      .then((r) => setPatrols(r.data ?? []))
      .catch((e) => {
        if (e.message.includes('404') || e.message.includes('not found')) {
          setNotAvailable(true)
        }
        console.error(e)
      })
      .finally(() => setLoading(false))
  }, [router])

  function guardName(id: string) {
    return users.find((u) => u.id === id)?.name ?? id
  }
  function siteName(id: string) {
    return sites.find((s) => s.id === id)?.name ?? id
  }

  const filtered = patrols.filter((p) => {
    if (filterSite && p.siteId !== filterSite) return false
    if (filterStatus && p.status !== filterStatus) return false
    return true
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Patrols</h1>
          <p className="text-slate-400 mt-1">Guard patrol sessions and scan logs</p>
        </div>

        {notAvailable ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">🚶</div>
            <h2 className="text-white font-semibold text-lg mb-2">No Patrol Data Available</h2>
            <p className="text-slate-500 text-sm">
              The patrol tracking endpoint is not yet available. Patrol logs will appear here once guards begin scanning checkpoints via the mobile app.
            </p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex gap-3 mb-6 flex-wrap">
              <select
                value={filterSite}
                onChange={(e) => setFilterSite(e.target.value)}
                className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All sites</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All statuses</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
              </select>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Guard</th>
                    <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Site</th>
                    <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Started</th>
                    <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Completed</th>
                    <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Status</th>
                    <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Checkpoints</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No patrols found.</td></tr>
                  ) : (
                    filtered.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 text-white font-medium">{guardName(p.guardId)}</td>
                        <td className="px-6 py-4 text-slate-400 text-sm">{siteName(p.siteId)}</td>
                        <td className="px-6 py-4 text-slate-400 text-sm">
                          {p.startedAt ? new Date(p.startedAt).toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-400 text-sm">
                          {p.completedAt ? new Date(p.completedAt).toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            p.status === 'completed' ? 'bg-emerald-900 text-emerald-300'
                            : p.status === 'in_progress' ? 'bg-blue-900 text-blue-300'
                            : p.status === 'missed' ? 'bg-red-900 text-red-300'
                            : 'bg-slate-700 text-slate-300'
                          }`}>
                            {p.status ?? 'unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-400 text-sm">
                          {p.scannedCheckpoints ?? 0} / {p.totalCheckpoints ?? '?'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
