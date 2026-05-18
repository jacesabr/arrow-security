'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { tdApi } from '../../lib/api'
import {
  PageShell, Main, PageHeader, Card,
  Badge, DataTable, TR, TD,
  Btn, Modal, Field, Input, Select, ErrorMsg, ModalActions,
  FilterRow, FilterField,
} from '../../components/ui'

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  active:        { label: 'Active',        color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  expiring_soon: { label: 'Expiring Soon', color: '#d97706', bg: '#fffbeb' },
  expired:       { label: 'Expired',       color: '#dc2626', bg: '#fef2f2' },
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CertificationsPage() {
  const router = useRouter()
  const [certs, setCerts] = useState<any[]>([])
  const [guards, setGuards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterGuard, setFilterGuard] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({
    guardId: '', certType: '', certNumber: '', issuedBy: '', issuedAt: '', expiresAt: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    tdApi.users.list()
      .then((r) => setGuards((r.data ?? []).filter((u: any) => u.role === 'guard' || u.role === 'supervisor')))
      .catch(() => {})
    load()
  }, [router])

  useEffect(() => { load() }, [filterGuard, filterStatus])

  function load() {
    setLoading(true)
    tdApi.certifications.list({
      guardId: filterGuard || undefined,
      status: filterStatus || undefined,
    })
      .then((r) => setCerts(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.certifications.create({
        guardId: form.guardId,
        certType: form.certType,
        certNumber: form.certNumber || undefined,
        issuedBy: form.issuedBy || undefined,
        issuedAt: form.issuedAt || undefined,
        expiresAt: form.expiresAt || undefined,
      })
      setShowModal(false)
      setForm({ guardId: '', certType: '', certNumber: '', issuedBy: '', issuedAt: '', expiresAt: '' })
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function guardName(id: string) { return guards.find((g) => g.id === id)?.name ?? id }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Certifications"
          subtitle="Guard licences, first aid certs, and other credentials"
          action={<Btn onClick={() => { setError(null); setShowModal(true) }}>+ Add Cert</Btn>}
        />

        <FilterRow>
          <FilterField label="Guard">
            <Select value={filterGuard} onChange={(e) => setFilterGuard(e.target.value)} style={{ width: 200 }}>
              <option value="">All guards</option>
              {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 160 }}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
            </Select>
          </FilterField>
        </FilterRow>

        <Card overflow="hidden">
          <DataTable
            cols={['Guard', 'Cert Type', 'Cert Number', 'Issued By', 'Expires', 'Status']}
            loading={loading}
            empty="No certifications found."
          >
            {certs.map((c: any) => {
              const sb = STATUS_BADGE[c.status] ?? STATUS_BADGE.active
              return (
                <TR key={c.id}>
                  <TD style={{ fontWeight: 500 }}>{c.guardName ?? guardName(c.guardId)}</TD>
                  <TD>{c.certType}</TD>
                  <TD muted style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                    {c.certNumber ?? '—'}
                  </TD>
                  <TD muted>{c.issuedBy}</TD>
                  <TD muted>{c.expiresAt ? fmtDate(c.expiresAt) : '—'}</TD>
                  <TD>
                    <Badge label={sb.label} color={sb.color} bg={sb.bg} />
                  </TD>
                </TR>
              )
            })}
          </DataTable>
        </Card>
      </Main>

      <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Add Certification" width={480}>
        <form onSubmit={handleCreate}>
          <ErrorMsg msg={error} />
          <Field label="Guard">
            <Select value={form.guardId} onChange={(e) => setForm({ ...form, guardId: e.target.value })} required>
              <option value="">Select guard…</option>
              {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="Cert Type">
            <Input
              value={form.certType}
              onChange={(e) => setForm({ ...form, certType: e.target.value })}
              placeholder="Security Guard Licence, First Aid, CCTV Operator…"
              required
              autoFocus
            />
          </Field>
          <Field label="Cert Number">
            <Input
              value={form.certNumber}
              onChange={(e) => setForm({ ...form, certNumber: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Issued By">
            <Input
              value={form.issuedBy}
              onChange={(e) => setForm({ ...form, issuedBy: e.target.value })}
              placeholder="NSDC, Red Cross, State Police…"
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>Issued At</label>
              <Input type="date" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>Expires At</label>
              <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setShowModal(false); setError(null) }}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Add Certification</Btn>
          </ModalActions>
        </form>
      </Modal>
    </PageShell>
  )
}
