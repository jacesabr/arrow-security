'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-emerald-900 text-emerald-300',
  offline: 'bg-red-900 text-red-300',
  error: 'bg-orange-900 text-orange-300',
}

export default function CamerasPage() {
  const router = useRouter()
  const [cameras, setCameras] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterSite, setFilterSite] = useState('')
  const [form, setForm] = useState({
    name: '',
    siteId: '',
    rtspUrl: '',
    go2rtcStream: '',
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
    tdApi.cameras
      .list(filterSite || undefined)
      .then((r) => setCameras(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.cameras.create({
        name: form.name,
        siteId: form.siteId,
        rtspUrl: form.rtspUrl,
        go2rtcStream: form.go2rtcStream || undefined,
      })
      setShowModal(false)
      setForm({ name: '', siteId: '', rtspUrl: '', go2rtcStream: '' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function siteName(id: string) {
    return sites.find((s) => s.id === id)?.name ?? id
  }

  function truncateUrl(url: string) {
    return url.length > 50 ? url.slice(0, 47) + '...' : url
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Cameras</h1>
            <p className="text-slate-400 mt-1">{cameras.length} cameras</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            + Add Camera
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
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">RTSP URL</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Status</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : cameras.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No cameras yet. Add one to get started.</td></tr>
              ) : (
                cameras.map((cam) => (
                  <tr key={cam.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 text-white font-medium">{cam.name}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{siteName(cam.siteId)}</td>
                    <td className="px-6 py-4 text-slate-500 text-sm font-mono">
                      <span title={cam.rtspUrl}>{truncateUrl(cam.rtspUrl)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[cam.status] ?? 'bg-slate-700 text-slate-400'}`}>
                        {cam.status ?? 'unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {cam.lastSeenAt ? new Date(cam.lastSeenAt).toLocaleString('en-IN') : '—'}
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
            <h2 className="text-white font-bold text-lg mb-6">Add Camera</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Camera Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="Main Gate Cam"
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
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">RTSP URL</label>
                <input
                  type="text"
                  value={form.rtspUrl}
                  onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="rtsp://192.168.1.100:554/stream1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">go2rtc Stream Name (optional)</label>
                <input
                  type="text"
                  value={form.go2rtcStream}
                  onChange={(e) => setForm({ ...form, go2rtcStream: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="main-gate"
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
                  {saving ? 'Saving...' : 'Add Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
