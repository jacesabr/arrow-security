'use client'
import { useEffect, useState } from 'react'
import { Sidebar } from '../../components/Sidebar'
import { cpApi } from '../../lib/api'

const TIER_COLORS: Record<string, string> = {
  bronze: 'bg-orange-900 text-orange-300',
  silver: 'bg-slate-700 text-slate-200',
  gold: 'bg-yellow-900 text-yellow-300',
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', tier: 'bronze', frappeSiteUrl: '', zammadUrl: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    cpApi.tenants.list().then((res) => setTenants(res.data)).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      await cpApi.tenants.create(form)
      setShowCreate(false)
      setForm({ name: '', slug: '', tier: 'bronze', frappeSiteUrl: '', zammadUrl: '' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  async function toggleStatus(t: any) {
    const next = t.status === 'active' ? 'suspended' : 'active'
    await cpApi.tenants.updateStatus(t.id, next)
    load()
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Tenants</h1>
            <p className="text-slate-400 mt-1">{tenants.length} security companies</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            + New Tenant
          </button>
        </div>

        {showCreate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-8">
              <h2 className="text-white font-bold text-lg mb-6">Create Tenant</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                {[
                  { label: 'Company Name', key: 'name', placeholder: 'Acme Security' },
                  { label: 'Slug', key: 'slug', placeholder: 'acme-security' },
                  { label: 'Frappe Site URL', key: 'frappeSiteUrl', placeholder: 'https://acme.frappe.cloud' },
                  { label: 'Zammad URL', key: 'zammadUrl', placeholder: 'https://acme.zammad.com' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm text-slate-400 mb-1">{label}</label>
                    <input
                      value={(form as any)[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Tier</label>
                  <select
                    value={form.tier}
                    onChange={(e) => setForm({ ...form, tier: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="bronze">Bronze (₹100–150/guard/mo)</option>
                    <option value="silver">Silver (₹200–300/guard/mo)</option>
                    <option value="gold">Gold (₹400–500/guard/mo)</option>
                  </select>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowCreate(false)} className="flex-1 bg-slate-800 text-slate-300 rounded-lg py-2.5 font-medium">Cancel</button>
                  <button type="submit" disabled={creating} className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 font-semibold disabled:opacity-50">
                    {creating ? 'Creating...' : 'Create Tenant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Company</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Tier</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Status</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Created</th>
                <th className="text-right px-6 py-4 text-slate-400 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : tenants.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No tenants yet</td></tr>
              ) : tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-white font-medium">{t.name}</div>
                    <div className="text-slate-500 text-sm">{t.slug}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TIER_COLORS[t.tier] ?? ''}`}>{t.tier}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      t.status === 'active' ? 'bg-emerald-900 text-emerald-300'
                      : t.status === 'trial' ? 'bg-yellow-900 text-yellow-300'
                      : 'bg-red-900 text-red-300'
                    }`}>{t.status}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {new Date(t.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => toggleStatus(t)}
                      className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
                    >
                      {t.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
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
