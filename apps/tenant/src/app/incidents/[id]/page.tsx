'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '../../../components/Sidebar'
import { tdApi } from '../../../lib/api'

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

export default function IncidentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [incident, setIncident] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [userRole, setUserRole] = useState<string>('')

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }

    try {
      const user = JSON.parse(localStorage.getItem('td_user') ?? '{}')
      setUserRole(user.role ?? '')
    } catch {}

    tdApi.incidents.get(id)
      .then((r) => setIncident(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [router, id])

  async function updateStatus(status: string) {
    setUpdating(true)
    try {
      const res = await tdApi.incidents.updateStatus(id, status)
      setIncident(res.data)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setUpdating(false)
    }
  }

  const canUpdate = userRole === 'supervisor' || userRole === 'tenant_admin'

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-8 flex items-center justify-center">
          <div className="text-slate-500">Loading...</div>
        </main>
      </div>
    )
  }

  if (!incident) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-8">
          <p className="text-slate-500">Incident not found.</p>
          <Link href="/incidents" className="text-indigo-400 hover:text-indigo-300 mt-4 inline-block">← Back to Incidents</Link>
        </main>
      </div>
    )
  }

  const slaPast =
    incident.slaDeadline &&
    new Date(incident.slaDeadline) < new Date() &&
    incident.status !== 'resolved' &&
    incident.status !== 'closed'

  const timeline = [
    { label: 'Reported', time: incident.createdAt, done: true },
    { label: 'Acknowledged', time: incident.acknowledgedAt, done: !!incident.acknowledgedAt },
    { label: 'In Progress', time: incident.inProgressAt, done: !!incident.inProgressAt },
    { label: 'Resolved', time: incident.resolvedAt, done: !!incident.resolvedAt },
    { label: 'Closed', time: incident.closedAt, done: !!incident.closedAt },
  ]

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 max-w-4xl">
        <div className="mb-6">
          <Link href="/incidents" className="text-slate-400 hover:text-white text-sm">← Incidents</Link>
        </div>

        {/* Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 mb-6">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">{incident.title}</h1>
            <div className="flex gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SEV_COLORS[incident.severity] ?? 'bg-slate-700 text-slate-300'}`}>
                {incident.severity}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[incident.status] ?? 'bg-slate-700 text-slate-300'}`}>
                {incident.status?.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <p className="text-slate-400 mb-6">{incident.description ?? 'No description provided.'}</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Site</p>
              <p className="text-white mt-0.5">{incident.siteId ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Reporter</p>
              <p className="text-white mt-0.5">{incident.reporterId ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Reported At</p>
              <p className="text-white mt-0.5">{new Date(incident.createdAt).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-slate-500">SLA Deadline</p>
              <p className={`mt-0.5 font-medium ${slaPast ? 'text-red-400' : 'text-white'}`}>
                {incident.slaDeadline ? new Date(incident.slaDeadline).toLocaleString('en-IN') : '—'}
                {slaPast && ' ⚠️ Breached'}
              </p>
            </div>
          </div>
        </div>

        {/* Status Actions */}
        {canUpdate && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-4">Update Status</h2>
            <div className="flex gap-2 flex-wrap">
              {incident.status === 'open' && (
                <button
                  onClick={() => updateStatus('acknowledged')}
                  disabled={updating}
                  className="bg-yellow-700 hover:bg-yellow-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  Acknowledge
                </button>
              )}
              {(incident.status === 'open' || incident.status === 'acknowledged') && (
                <button
                  onClick={() => updateStatus('in_progress')}
                  disabled={updating}
                  className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  Mark In Progress
                </button>
              )}
              {incident.status !== 'resolved' && incident.status !== 'closed' && (
                <button
                  onClick={() => updateStatus('resolved')}
                  disabled={updating}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  Resolve
                </button>
              )}
              {incident.status === 'resolved' && (
                <button
                  onClick={() => updateStatus('closed')}
                  disabled={updating}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-6">Timeline</h2>
          <div className="flex flex-col gap-4">
            {timeline.map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${step.done ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                <div>
                  <p className={`text-sm font-medium ${step.done ? 'text-white' : 'text-slate-600'}`}>{step.label}</p>
                  {step.time && (
                    <p className="text-slate-500 text-xs mt-0.5">{new Date(step.time).toLocaleString('en-IN')}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Media */}
        {incident.mediaUrls && incident.mediaUrls.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Attachments</h2>
            <div className="space-y-2">
              {incident.mediaUrls.map((url: string, i: number) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm"
                >
                  📎 {url}
                </a>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
