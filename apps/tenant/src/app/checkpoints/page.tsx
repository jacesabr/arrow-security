'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'

export default function CheckpointsPage() {
  const router = useRouter()
  const [checkpoints, setCheckpoints] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterSite, setFilterSite] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    siteId: '',
    latitude: '',
    longitude: '',
    orderInRoute: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    tdApi.sites.list().then((r) => setSites(r.data ?? [])).catch(() => {})
    load()
  }, [router])

  useEffect(() => {
    load()
  }, [filterSite])

  function load() {
    setLoading(true)
    tdApi.checkpoints
      .list(filterSite || undefined)
      .then((r) => setCheckpoints(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.checkpoints.create({
        name: form.name,
        siteId: form.siteId,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
        orderInRoute: form.orderInRoute ? parseInt(form.orderInRoute) : undefined,
      })
      setShowModal(false)
      setForm({ name: '', siteId: '', latitude: '', longitude: '', orderInRoute: '' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function copyQr(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(value)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function siteName(id: string) {
    return sites.find((s) => s.id === id)?.name ?? id
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Checkpoints</h1>
            <p className="text-slate-400 mt-1">{checkpoints.length} checkpoints</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            + Add Checkpoint
          </button>
        </div>

        {/* Filter */}
        <div className="mb-6">
          <select
            value={filterSite}
            onChange={(e) => setFilterSite(e.target.value)}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Name</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Site</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">QR / ID</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Order</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Coordinates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : checkpoints.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No checkpoints yet.</td></tr>
              ) : (
                checkpoints.map((cp) => {
                  const qrValue = cp.qrCode ?? cp.id
                  return (
                    <tr key={cp.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 text-white font-medium">{cp.name}</td>
                      <td className="px-6 py-4 text-slate-400 text-sm">{siteName(cp.siteId)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">
                            {qrValue}
                          </span>
                          <button
                            onClick={() => copyQr(qrValue)}
                            className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                            title="Copy"
                          >
                            {copied === qrValue ? '✓' : '📋'}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-sm">
                        {cp.orderInRoute ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm font-mono">
                        {cp.latitude != null && cp.longitude != null
                          ? `${cp.latitude.toFixed(4)}, ${cp.longitude.toFixed(4)}`
                          : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-6">Add Checkpoint</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Checkpoint Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="Main Gate"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Site</label>
                <select
                  value={form.siteId}
                  onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                >
                  <option value="">Select site...</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
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
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Order in Route</label>
                <input
                  type="number"
                  value={form.orderInRoute}
                  onChange={(e) => setForm({ ...form, orderInRoute: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="1"
                />
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
