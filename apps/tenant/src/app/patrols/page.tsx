'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Badge, FilterRow, FilterField, Select } from '../../components/ui'
import { tdApi } from '../../lib/api'

export default function PatrolsPage() {
  const router = useRouter()
  const [patrols, setPatrols] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [filterSite, setFilterSite] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }

    Promise.all([
      tdApi.sites.list().catch(() => ({ data: [] })),
      tdApi.users.list().catch(() => ({ data: [] })),
    ]).then(([s, u]) => {
      setSites(s.data ?? [])
      setUsers(u.data ?? [])
    })

    tdApi.patrols
      .list()
      .then((r) => setPatrols(r.data ?? []))
      .catch((e) => {
        if (e.message.includes('404') || e.message.includes('not found')) {
          setNotAvailable(true)
        }
        console.error(e)
      })
      .finally(() => setLoading(false))
  }, [router])

  function guardName(id: string) { return users.find((u) => u.id === id)?.name ?? id }
  function siteName(id: string) { return sites.find((s) => s.id === id)?.name ?? id }

  const filtered = patrols.filter((p) => {
    if (filterSite && p.siteId !== filterSite) return false
    if (filterStatus && p.status !== filterStatus) return false
    return true
  })

  const statusBadge = (status: string) => {
    if (status === 'completed') return <Badge label="completed" color="#7a7773" bg="rgba(122,119,115,0.12)" />
    if (status === 'in_progress') return <Badge label="in progress" color="#3b82f6" bg="rgba(59,130,246,0.12)" />
    if (status === 'missed') return <Badge label="missed" color="#ef4444" bg="rgba(239,68,68,0.12)" />
    return <Badge label={status ?? 'unknown'} color="#a3a098" bg="rgba(163,160,152,0.12)" />
  }

  return (
    <PageShell>
      <Main>
        <PageHeader title="Patrols" subtitle="Guard patrol sessions and scan logs" />

        {notAvailable ? (
          <Card style={{ padding: 48, textAlign: 'center' }}>
            <h2 style={{ color: 'var(--text)', fontWeight: 600, fontSize: 16, margin: '0 0 8px' }}>No Patrol Data Available</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
              The patrol tracking endpoint is not yet available. Patrol logs will appear here once guards begin scanning checkpoints via the mobile app.
            </p>
          </Card>
        ) : (
          <>
            <FilterRow>
              <FilterField label="Site">
                <Select value={filterSite} onChange={(e) => setFilterSite(e.target.value)} style={{ width: 180 }}>
                  <option value="">All sites</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </FilterField>
              <FilterField label="Status">
                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 160 }}>
                  <option value="">All statuses</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="missed">Missed</option>
                </Select>
              </FilterField>
            </FilterRow>

            <Card overflow="hidden">
              <DataTable
                cols={['Guard', 'Site', 'Started', 'Completed', 'Status', 'Checkpoints']}
                loading={loading}
                empty="No patrols found."
              >
                {filtered.map((p) => (
                  <TR key={p.id}>
                    <TD>{guardName(p.guardId)}</TD>
                    <TD muted>{siteName(p.siteId)}</TD>
                    <TD muted>{p.startedAt ? new Date(p.startedAt).toLocaleString('en-IN') : '—'}</TD>
                    <TD muted>{p.completedAt ? new Date(p.completedAt).toLocaleString('en-IN') : '—'}</TD>
                    <TD>{statusBadge(p.status)}</TD>
                    <TD muted>{p.scannedCheckpoints ?? 0} / {p.totalCheckpoints ?? '?'}</TD>
                  </TR>
                ))}
              </DataTable>
            </Card>
          </>
        )}
      </Main>
    </PageShell>
  )
}
