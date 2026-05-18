'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Main, PageHeader, Card, DataTable, TR, TD, Badge } from '../../../components/ui'
import { tdApi } from '../../../lib/api'

interface Incident {
  id: string
  title: string
  severity: string
  status: string
  slaDeadline: string | null
  createdAt: string
}

type BadgeConfig = { color: string; bg: string }

const SEVERITY_BADGE: Record<string, BadgeConfig> = {
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
  medium:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  low:      { color: '#5c5855', bg: 'rgba(163,160,152,0.1)' },
}

const STATUS_BADGE: Record<string, BadgeConfig> = {
  open:           { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  in_progress:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  resolved:       { color: '#10b981', bg: 'rgba(52,211,153,0.1)' },
  closed:         { color: '#10b981', bg: 'rgba(52,211,153,0.1)' },
}

const defaultBadge: BadgeConfig = { color: '#5c5855', bg: 'rgba(163,160,152,0.1)' }

export default function ClientIncidentsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('td_token')) { router.replace('/login'); return }
    tdApi.incidents.list().then(r => setIncidents(r.data ?? [])).finally(() => setLoading(false))
  }, [router])

  return (
    <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto' }}>
      <PageHeader title="Incidents" subtitle="Security incidents at your sites" />
      <Card>
        <DataTable
          cols={['Title', 'Severity', 'Status', 'SLA Deadline', 'Reported']}
          loading={loading}
          empty="No incidents reported."
        >
          {incidents.map(i => {
            const slaPast = i.slaDeadline && new Date(i.slaDeadline) < new Date()
            const sevBadge = SEVERITY_BADGE[i.severity] ?? defaultBadge
            const stsBadge = STATUS_BADGE[i.status] ?? defaultBadge
            return (
              <TR key={i.id}>
                <TD style={{ fontWeight: 600 }}>{i.title}</TD>
                <TD>
                  <Badge label={i.severity} color={sevBadge.color} bg={sevBadge.bg} />
                </TD>
                <TD>
                  <Badge label={i.status.replace(/_/g, ' ')} color={stsBadge.color} bg={stsBadge.bg} />
                </TD>
                <TD style={{ color: slaPast ? '#ef4444' : undefined }}>
                  {i.slaDeadline ? new Date(i.slaDeadline).toLocaleDateString('en-IN') : '—'}
                </TD>
                <TD muted>{new Date(i.createdAt).toLocaleDateString('en-IN')}</TD>
              </TR>
            )
          })}
        </DataTable>
      </Card>
    </main>
  )
}
