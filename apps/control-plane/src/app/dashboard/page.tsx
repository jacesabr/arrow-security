'use client'
import { useEffect, useState } from 'react'
import { Sidebar } from '../../components/Sidebar'
import { cpApi } from '../../lib/api'

interface Stats {
  tenants: number
  active: number
  suspended: number
  trial: number
  sites: number
  guards: number
  openIncidents: number
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <p className="text-slate-400 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cpApi.tenants.list()
      .then((res) => setTenants(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const stats: Stats = {
    tenants: tenants.length,
    active: tenants.filter((t) => t.status === 'active').length,
    suspended: tenants.filter((t) => t.status === 'suspended').length,
    trial: tenants.filter((t) => t.status === 'trial').length,
    sites: 0,
    guards: 0,
    openIncidents: 0,
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-slate-400 mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-pulse h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Tenants" value={stats.tenants} color="text-white" />
            <StatCard label="Active" value={stats.active} color="text-emerald-400" />
            <StatCard label="Trial" value={stats.trial} color="text-yellow-400" />
            <StatCard label="Suspended" value={stats.suspended} color="text-red-400" />
          </div>
        )}

        {/* Recent tenants */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-white font-semibold">Recent Tenants</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {loading ? (
              <div className="p-6 text-slate-500">Loading...</div>
            ) : tenants.length === 0 ? (
              <div className="p-6 text-slate-500">No tenants yet. Create one to get started.</div>
            ) : (
              tenants.slice(0, 10).map((t) => (
                <div key={t.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                  <div>
                    <p className="text-white font-medium">{t.name}</p>
                    <p className="text-slate-500 text-sm">{t.slug} · {t.tier}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    t.status === 'active' ? 'bg-emerald-900 text-emerald-300'
                    : t.status === 'trial' ? 'bg-yellow-900 text-yellow-300'
                    : 'bg-red-900 text-red-300'
                  }`}>
                    {t.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
