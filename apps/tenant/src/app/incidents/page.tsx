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

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-900 text-red-300',
  acknowledged: 'bg-yellow-900 text-yellow-300',
  in_progress: 'bg-blue-900 text-blue-300',
  resolved: 'bg-emerald-900 text-emerald-300',
  closed: 'bg-slate-700 text-slate-400',
}

export default function IncidentsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    tdApi.sites.list().then((r) => setSites(r.data ?? [])).catch(() => {})
    load()
  }, [router])

  useEffect(() => {
    load()
  }, [filterStatus, filterSeverity])

  function load() {
    setLoading(true)
    tdApi.incidents
      .list({
        status: filterStatus || undefined,
        severity: filterSeverity || undefined,
      })
      .then((r) => setIncidents(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function siteName(id: string) {
    return sites.find((s) => s.id === id)?.name ?? id
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Incidents</h1>
          <p className="text-slate-400 mt-1">{incidents.length} total</p>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Incident</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Site</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Severity</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Status</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">SLA Deadline</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : incidents.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No incidents found.</td></tr>
              ) : (
                incidents.map((inc) => {
                  const slaPast =
                    inc.slaDeadline &&
                    new Date(inc.slaDeadline) < new Date() &&
                    inc.status !== 'resolved' &&
                    inc.status !== 'closed'
                  return (
                    <tr
                      key={inc.id}
                      onClick={() => router.push(`/incidents/${inc.id}`)}
                      className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 max-w-xs">
                        <div className="text-white font-medium truncate">{inc.title}</div>
                        <div className="text-slate-500 text-sm truncate">{inc.description}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-sm">{inc.siteId ? siteName(inc.siteId) : '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SEV_COLORS[inc.severity] ?? 'bg-slate-700 text-slate-300'}`}>
                          {inc.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[inc.status] ?? 'bg-slate-700 text-slate-300'}`}>
                          {inc.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-sm ${slaPast ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                        {inc.slaDeadline ? new Date(inc.slaDeadline).toLocaleString('en-IN') : '—'}
                        {slaPast && ' ⚠️'}
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-sm">
                        {new Date(inc.createdAt).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
