'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Badge, Btn, Modal, Field, Input, Select, Textarea, ErrorMsg, ModalActions, FilterRow, FilterField } from '../../components/ui'
import { tdApi } from '../../lib/api'

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  scheduled: { color: '#5c5855', bg: 'rgba(163,160,152,0.12)' },
  active:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  completed: { color: '#9a9490', bg: 'rgba(122,119,115,0.12)' },
  cancelled: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  missed:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  draft:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
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
  const filtered = filterStatus ? shifts.filter((s) => s.status === filterStatus) : shifts

  function guardName(id: string) { return users.find((u) => u.id === id)?.name ?? id }
  function siteName(id: string) { return sites.find((s) => s.id === id)?.name ?? id }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Shifts"
          subtitle={`${filtered.length} shifts`}
          action={<Btn variant="primary" onClick={() => setShowModal(true)}>+ Schedule Shift</Btn>}
        />

        <FilterRow>
          <FilterField label="From">
            <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} style={{ width: 160 }} />
          </FilterField>
          <FilterField label="To">
            <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} style={{ width: 160 }} />
          </FilterField>
          <FilterField label="Status">
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 160 }}>
              <option value="">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed</option>
            </Select>
          </FilterField>
        </FilterRow>

        <Card overflow="hidden">
          <DataTable
            cols={['Guard', 'Site', 'Start', 'End', 'Status', 'Notes']}
            loading={loading}
            empty="No shifts found."
          >
            {filtered.map((sh) => {
              const sta = STATUS_BADGE[sh.status] ?? STATUS_BADGE.scheduled
              return (
                <TR key={sh.id}>
                  <TD>{guardName(sh.guardId)}</TD>
                  <TD muted>{siteName(sh.siteId)}</TD>
                  <TD muted>{new Date(sh.startsAt).toLocaleString('en-IN')}</TD>
                  <TD muted>{new Date(sh.endsAt).toLocaleString('en-IN')}</TD>
                  <TD><Badge label={sh.status ?? 'scheduled'} color={sta.color} bg={sta.bg} /></TD>
                  <TD muted>{sh.notes ?? '—'}</TD>
                </TR>
              )
            })}
          </DataTable>
        </Card>

        <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Schedule Shift">
          <form onSubmit={handleCreate}>
            <Field label="Site">
              <Select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} required>
                <option value="">Select site...</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Guard">
              <Select value={form.guardId} onChange={(e) => setForm({ ...form, guardId: e.target.value })} required>
                <option value="">Select guard...</option>
                {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Start Time">
                <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
              </Field>
              <Field label="End Time">
                <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </Field>
            <ErrorMsg msg={error} />
            <ModalActions>
              <Btn variant="secondary" onClick={() => { setShowModal(false); setError(null) }}>Cancel</Btn>
              <Btn variant="primary" type="submit" loading={saving}>Schedule</Btn>
            </ModalActions>
          </form>
        </Modal>
      </Main>
    </PageShell>
  )
}
