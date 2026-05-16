'use client'
import { useEffect, useState } from 'react'
import { Sidebar } from '../../components/Sidebar'
import { cpApi } from '../../lib/api'

const SEV_COLORS: Record<string, string> = {
  low: 'bg-slate-700 text-slate-300',
  medium: 'bg-yellow-900 text-yellow-300',
  high: 'bg-orange-900 text-orange-300',
  critical: 'bg-red-900 text-red-300',
}
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-900 text-red-300',
  acknowledged: 'bg-yellow-900 text-yellow-300',
  in_progress: 'bg-blue-900 text-blue-300',
  resolved: 'bg-emerald-900 text-emerald-300',
  closed: 'bg-slate-700 text-slate-400',
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    cpApi.incidents.list()
      .then((r) => setIncidents(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? incidents : incidents.filter((i) => i.status === filter)

  const counts = incidents.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Incidents</h1>
          <p className="text-slate-400 mt-1">{incidents.length} total · {counts.open ?? 0} open</p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {['all', 'open', 'acknowledged', 'in_progress', 'resolved', 'closed'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              {s.replace(/_/g, ' ')}
              {s !== 'all' && counts[s] ? <span className="ml-1.5 text-xs opacity-70">({counts[s]})</span> : null}
            </button>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Incident</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Severity</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Status</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">SLA Deadline</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No incidents</td></tr>
              ) : filtered.map((i) => {
                const slaPast = i.slaDeadline && new Date(i.slaDeadline) < new Date() && i.status !== 'resolved' && i.status !== 'closed'
                return (
                  <tr key={i.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 max-w-xs">
                      <div className="text-white font-medium truncate">{i.title}</div>
                      <div className="text-slate-500 text-sm truncate">{i.description}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SEV_COLORS[i.severity]}`}>{i.severity}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[i.status]}`}>{i.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className={`px-6 py-4 text-sm ${slaPast ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                      {i.slaDeadline ? new Date(i.slaDeadline).toLocaleString('en-IN') : '—'}
                      {slaPast && ' ⚠️'}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {new Date(i.createdAt).toLocaleString('en-IN')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
