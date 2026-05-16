'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'

export default function SitesPage() {
  const router = useRouter()
  const [sites, setSites] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    geofenceRadiusMeters: '',
    clientId: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    load()
  }, [router])

  function load() {
    setLoading(true)
    Promise.all([
      tdApi.sites.list(),
      tdApi.clients.list().catch(() => ({ data: [] })),
    ]).then(([s, c]) => {
      setSites(s.data ?? [])
      setClients(c.data ?? [])
    }).catch(console.error).finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.sites.create({
        name: form.name,
        address: form.address,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
        geofenceRadiusMeters: form.geofenceRadiusMeters ? parseInt(form.geofenceRadiusMeters) : undefined,
        clientId: form.clientId || undefined,
      })
      setShowModal(false)
      setForm({ name: '', address: '', latitude: '', longitude: '', geofenceRadiusMeters: '', clientId: '' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Sites</h1>
            <p className="text-slate-400 mt-1">{sites.length} sites</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            + Add Site
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Name</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Address</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Geofence Radius</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Client</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : sites.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No sites yet. Add one to get started.</td></tr>
              ) : (
                sites.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 text-white font-medium">{s.name}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm max-w-xs truncate">{s.address}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {s.geofenceRadiusMeters ? `${s.geofenceRadiusMeters}m` : '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {clients.find((c) => c.id === s.clientId)?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        s.status === 'active' ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {s.status ?? 'active'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-6">Add Site</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Site Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    placeholder="12.9716"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    placeholder="77.5946"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Geofence Radius (meters)</label>
                <input
                  type="number"
                  value={form.geofenceRadiusMeters}
                  onChange={(e) => setForm({ ...form, geofenceRadiusMeters: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Client</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">— No client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError(null) }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
