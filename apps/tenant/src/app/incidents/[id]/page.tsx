'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { PageShell, Main, Card, CardHeader, Badge, Btn } from '../../../components/ui'
import { tdApi } from '../../../lib/api'

const SEV_BADGE: Record<string, { color: string; bg: string }> = {
  low:      { color: '#5c5855', bg: 'rgba(163,160,152,0.1)' },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  high:     { color: '#c96442', bg: 'rgba(201,100,66,0.1)' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
}

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  open:         { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  acknowledged: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  in_progress:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  resolved:     { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  closed:       { color: '#9a9490', bg: 'rgba(122,119,115,0.1)' },
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
      <PageShell>
        <Main>
          <div style={{ color: 'var(--text-3)', padding: 40, textAlign: 'center' }}>Loading...</div>
        </Main>
      </PageShell>
    )
  }

  if (!incident) {
    return (
      <PageShell>
        <Main>
          <p style={{ color: 'var(--text-3)' }}>Incident not found.</p>
          <Link href="/incidents" style={{ color: '#c96442', textDecoration: 'none', fontSize: 14 }}>← Back to Incidents</Link>
        </Main>
      </PageShell>
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

  const sev = SEV_BADGE[incident.severity] ?? SEV_BADGE.low
  const sta = STATUS_BADGE[incident.status] ?? STATUS_BADGE.closed

  return (
    <PageShell>
      <Main maxWidth={800}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/incidents" style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: 13 }}>
            ← Incidents
          </Link>
        </div>

        {/* Header card */}
        <Card style={{ padding: 28, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <h1 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>{incident.title}</h1>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Badge label={incident.severity} color={sev.color} bg={sev.bg} />
              <Badge label={incident.status?.replace(/_/g, ' ')} color={sta.color} bg={sta.bg} />
            </div>
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: 14, margin: '0 0 20px' }}>
            {incident.description ?? 'No description provided.'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {[
              { label: 'Site', value: incident.siteId ?? '—' },
              { label: 'Reporter', value: incident.reporterId ?? '—' },
              { label: 'Reported At', value: new Date(incident.createdAt).toLocaleString('en-IN') },
              {
                label: 'SLA Deadline',
                value: incident.slaDeadline ? new Date(incident.slaDeadline).toLocaleString('en-IN') : '—',
                color: slaPast ? '#f87171' : undefined,
                suffix: slaPast ? ' Breached' : '',
              },
            ].map((item) => (
              <div key={item.label}>
                <p style={{ color: 'var(--text-3)', fontSize: 12, margin: 0, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {item.label}
                </p>
                <p style={{ color: item.color ?? 'var(--text)', fontSize: 13.5, margin: '4px 0 0', fontWeight: item.color ? 600 : 400 }}>
                  {item.value}{item.suffix}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Status actions */}
        {canUpdate && (
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <CardHeader title="Update Status" />
            <div style={{ padding: '16px 0 4px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {incident.status === 'open' && (
                <Btn
                  variant="secondary"
                  onClick={() => updateStatus('acknowledged')}
                  disabled={updating}
                >
                  <span style={{ color: '#fbbf24' }}>Acknowledge</span>
                </Btn>
              )}
              {(incident.status === 'open' || incident.status === 'acknowledged') && (
                <Btn
                  variant="secondary"
                  onClick={() => updateStatus('in_progress')}
                  disabled={updating}
                >
                  <span style={{ color: '#3b82f6' }}>Mark In Progress</span>
                </Btn>
              )}
              {incident.status !== 'resolved' && incident.status !== 'closed' && (
                <Btn
                  variant="secondary"
                  onClick={() => updateStatus('resolved')}
                  disabled={updating}
                >
                  <span style={{ color: '#10b981' }}>Resolve</span>
                </Btn>
              )}
              {incident.status === 'resolved' && (
                <Btn
                  variant="secondary"
                  onClick={() => updateStatus('closed')}
                  disabled={updating}
                >
                  Close
                </Btn>
              )}
            </div>
          </Card>
        )}

        {/* Timeline */}
        <Card style={{ marginBottom: 16 }}>
          <CardHeader title="Timeline" />
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {timeline.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  marginTop: 3,
                  flexShrink: 0,
                  background: step.done ? '#10b981' : 'var(--border)',
                }} />
                <div>
                  <p style={{ color: step.done ? 'var(--text)' : 'var(--text-3)', fontSize: 13.5, fontWeight: step.done ? 500 : 400, margin: 0 }}>
                    {step.label}
                  </p>
                  {step.time && (
                    <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '2px 0 0' }}>
                      {new Date(step.time).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Attachments */}
        {incident.mediaUrls && incident.mediaUrls.length > 0 && (
          <Card>
            <CardHeader title="Attachments" />
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {incident.mediaUrls.map((url: string, i: number) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#c96442', fontSize: 13, textDecoration: 'none' }}
                >
                  Attachment {i + 1}: {url}
                </a>
              ))}
            </div>
          </Card>
        )}
      </Main>
    </PageShell>
  )
}
