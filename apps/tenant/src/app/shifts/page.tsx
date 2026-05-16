'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-slate-700 text-slate-300',
  active: 'bg-emerald-900 text-emerald-300',
  completed: 'bg-blue-900 text-blue-300',
  missed: 'bg-red-900 text-red-300',
}

export default function ShiftsPage() {
  const router = useRouter()
  const [shifts, setShifts] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({
    siteId: '',
    guardId: '',
    date: '',
    startTime: '',
    endTime: '',
    notes: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    loadDeps()
  }, [router])

  function loadDeps() {
    Promise.all([
      tdApi.users.list().catch(() => ({ data: [] })),
      tdApi.sites.list().catch(() => ({ data: [] })),
    ]).then(([u, s]) => {
      setUsers(u.data ?? [])
      setSites(s.data ?? [])
    })
  }

  useEffect(() => {
    loadShifts()
  }, [filterFrom, filterTo, filterStatus])

  function loadShifts() {
    setLoading(true)
    tdApi.shifts
      .list({
        from: filterFrom || undefined,
        to: filterTo || undefined,
      })
      .then((r) => setShifts(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.startTime || !form.endTime) {
      setError('Date, start time, and end time are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const startsAt = new Date(`${form.date}T${form.startTime}`).toISOString()
      const endsAt = new Date(`${form.date}T${form.endTime}`).toISOString()
      await tdApi.shifts.create({
        siteId: form.siteId,
        guardId: form.guardId,
        startsAt,
        endsAt,
        notes: form.notes || undefined,
      })
      setShowModal(false)
      setForm({ siteId: '', guardId: '', date: '', startTime: '', endTime: '', notes: '' })
      loadShifts()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const guards = users.filter((u) => u.role === 'guard' || u.role === 'supervisor')

  const filtered = filterStatus
    ? shifts.filter((s) => s.status === filterStatus)
    : shifts

  function guardName(id: string) {
    return users.find((u) => u.id === id)?.name ?? id
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
            <h1 className="text-2xl font-bold text-white">Shifts</h1>
            <p className="text-slate-400 mt-1">{filtered.length} shifts</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            + Schedule Shift
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed</option>
            </select>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Guard</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Site</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Start</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">End</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Status</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No shifts found.</td></tr>
              ) : (
                filtered.map((sh) => (
                  <tr key={sh.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 text-white font-medium">{guardName(sh.guardId)}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{siteName(sh.siteId)}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {new Date(sh.startsAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {new Date(sh.endsAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[sh.status] ?? 'bg-slate-700 text-slate-300'}`}>
                        {sh.status ?? 'scheduled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm truncate max-w-xs">{sh.notes ?? '—'}</td>
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
            <h2 className="text-white font-bold text-lg mb-6">Schedule Shift</h2>
            <form onSubmit={handleCreate} className="space-y-4">
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
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Guard</label>
                <select
                  value={form.guardId}
                  onChange={(e) => setForm({ ...form, guardId: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                >
                  <option value="">Select guard...</option>
                  {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Start Time</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">End Time</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none"
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
                  {saving ? 'Saving...' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
