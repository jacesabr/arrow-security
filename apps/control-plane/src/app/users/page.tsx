'use client'
import { useEffect, useState } from 'react'
import { Sidebar } from '../../components/Sidebar'
import { cpApi } from '../../lib/api'

const ROLE_COLORS: Record<string, string> = {
  platform_admin: 'bg-purple-900 text-purple-300',
  tenant_admin: 'bg-indigo-900 text-indigo-300',
  supervisor: 'bg-blue-900 text-blue-300',
  guard: 'bg-slate-700 text-slate-300',
  client_viewer: 'bg-teal-900 text-teal-300',
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    cpApi.users.list()
      .then((r) => setUsers(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = users.filter((u) =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Users</h1>
            <p className="text-slate-400 mt-1">{users.length} users across all tenants</p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="bg-slate-800 text-white rounded-lg px-4 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 w-72"
          />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">User</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Role</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Face ID</th>
                <th className="text-left px-6 py-4 text-slate-400 text-sm font-medium">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No users found</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-white font-medium">{u.name}</div>
                    <div className="text-slate-500 text-sm">{u.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-slate-700 text-slate-300'}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold ${u.faceEnrolled ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {u.faceEnrolled ? '✓ Enrolled' : '— Not enrolled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : 'Never'}
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
