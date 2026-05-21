'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Badge, FilterRow, FilterField, Select } from '../../components/ui'
import { tdApi } from '../../lib/api'

const SEV_BADGE: Record<string, { color: string; bg: string }> = {
  low:      { color: '#5c5855', bg: 'rgba(163,160,152,0.12)' },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  open:         { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  acknowledged: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  in_progress:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  resolved:     { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  closed:       { color: '#9a9490', bg: 'rgba(122,119,115,0.12)' },
}

export default function IncidentsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [guards, setGuards] = useState<any[]>([])
  const [role, setRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [filterSupervisor, setFilterSupervisor] = useState('')
  const [filterGuard, setFilterGuard] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    try {
      const u = localStorage.getItem('td_user')
      if (u) setRole(JSON.parse(u).role ?? '')
    } catch { /* ignore */ }
    // Sites are always useful for the name lookup; supervisor/guard lists
    // only matter for admin since other roles can't see anyone else anyway.
    tdApi.sites.list().then((r) => setSites(r.data ?? [])).catch(() => {})
    tdApi.users.list()
      .then((r) => {
        const all = r.data ?? []
        setSupervisors(all.filter((u: any) => u.role === 'supervisor'))
        setGuards(all.filter((u: any) => u.role === 'guard'))
      })
      .catch(() => {})
    load()
  }, [router])

  useEffect(() => {
    load()
  }, [filterStatus, filterSeverity, filterSite, filterSupervisor, filterGuard])

  function load() {
    setLoading(true)
    tdApi.incidents
      .list({
        status: filterStatus || undefined,
        severity: filterSeverity || undefined,
        siteId: filterSite || undefined,
        supervisorId: filterSupervisor || undefined,
        guardId: filterGuard || undefined,
      })
      .then((r) => setIncidents(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function siteName(id: string) {
    return sites.find((s) => s.id === id)?.name ?? id
  }

  const isAdmin = role === 'tenant_admin' || role === 'platform_admin'
  const anyFilter = filterStatus || filterSeverity || filterSite || filterSupervisor || filterGuard

  return (
    <PageShell>
      <Main>
        <PageHeader title="Incidents" subtitle={`${incidents.length} total`} />

        <FilterRow>
          <FilterField label="Status">
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 150 }}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </Select>
          </FilterField>
          <FilterField label="Severity">
            <Select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} style={{ width: 140 }}>
              <option value="">All severities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </FilterField>
          <FilterField label="Site">
            <Select value={filterSite} onChange={(e) => setFilterSite(e.target.value)} style={{ width: 180 }}>
              <option value="">All sites</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FilterField>
          {isAdmin && (
            <>
              <FilterField label="Supervisor">
                <Select value={filterSupervisor} onChange={(e) => setFilterSupervisor(e.target.value)} style={{ width: 180 }}>
                  <option value="">Any supervisor</option>
                  {supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </FilterField>
              <FilterField label="Guard">
                <Select value={filterGuard} onChange={(e) => setFilterGuard(e.target.value)} style={{ width: 180 }}>
                  <option value="">Any guard</option>
                  {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              </FilterField>
            </>
          )}
          {anyFilter && (
            <button
              onClick={() => {
                setFilterStatus(''); setFilterSeverity(''); setFilterSite('')
                setFilterSupervisor(''); setFilterGuard('')
              }}
              style={{
                marginTop: 22,
                padding: '7px 12px', borderRadius: 7, border: '1px solid #e8e5e0',
                background: '#fff', color: '#c96442', fontSize: 13, cursor: 'pointer',
              }}
            >
              Clear filters
            </button>
          )}
        </FilterRow>

        <Card overflow="hidden">
          <DataTable
            cols={['Incident', 'Site', 'Severity', 'Status', 'SLA Deadline', 'Reported']}
            loading={loading}
            empty="No incidents found."
          >
            {incidents.map((inc) => {
              const slaPast =
                inc.slaDeadline &&
                new Date(inc.slaDeadline) < new Date() &&
                inc.status !== 'resolved' &&
                inc.status !== 'closed'
              const sev = SEV_BADGE[inc.severity] ?? SEV_BADGE.low
              const sta = STATUS_BADGE[inc.status] ?? STATUS_BADGE.closed
              return (
                <TR key={inc.id} onClick={() => router.push(`/incidents/${inc.id}`)}>
                  <TD style={{ maxWidth: 240 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13.5 }}>{inc.title}</div>
                    <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 2 }}>{inc.description}</div>
                  </TD>
                  <TD muted>{inc.siteId ? siteName(inc.siteId) : '—'}</TD>
                  <TD><Badge label={inc.severity} color={sev.color} bg={sev.bg} /></TD>
                  <TD><Badge label={inc.status?.replace(/_/g, ' ')} color={sta.color} bg={sta.bg} /></TD>
                  <TD style={{ color: slaPast ? '#ef4444' : 'var(--text-2)', fontWeight: slaPast ? 600 : 400 }}>
                    {inc.slaDeadline ? new Date(inc.slaDeadline).toLocaleString('en-IN') : '—'}
                    {slaPast && ' !'}
                  </TD>
                  <TD muted>{new Date(inc.createdAt).toLocaleString('en-IN')}</TD>
                </TR>
              )
            })}
          </DataTable>
        </Card>
      </Main>
    </PageShell>
  )
}
