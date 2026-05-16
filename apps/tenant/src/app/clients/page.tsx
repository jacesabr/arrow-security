'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    load()
  }, [router])

  function load() {
    setLoading(true)
    tdApi.clients
      .list()
      .then((r) => setClients(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.clients.create(form)
      setShowModal(false)
      setForm({ name: '', contactName: '', contactEmail: '', contactPhone: '' })
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
            <h1 className="text-2xl font-bold text-white">Clients</h1>
            <p className="text-slate-400 mt-1">{clients.length} clients</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            + Add Client
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Company Name</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Contact Name</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Contact Email</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Contact Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No clients yet. Add one to get started.</td></tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 text-white font-medium">{c.name}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{c.contactName ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{c.contactEmail ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{c.contactPhone ?? '—'}</td>
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
            <h2 className="text-white font-bold text-lg mb-6">Add Client</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="Acme Corp"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Contact Name</label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Contact Email</label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="john@acmecorp.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Contact Phone</label>
                <input
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  placeholder="+91 98765 43210"
                  required
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
