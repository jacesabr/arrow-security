'use client'
import { useEffect, useState } from 'react'
import { Sidebar } from '../../components/Sidebar'
import { cpApi } from '../../lib/api'

export default function SitesPage() {
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cpApi.sites.list()
      .then((r) => setSites(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Sites</h1>
          <p className="text-slate-400 mt-1">{sites.length} locations across all tenants</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Site</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Address</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Geofence</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : sites.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No sites yet</td></tr>
              ) : sites.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-white font-medium">{s.name}</div>
                    <div className="text-slate-500 text-sm font-mono text-xs">{s.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm max-w-xs truncate">{s.address}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{s.geofenceRadiusMeters}m</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.status === 'active' ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
