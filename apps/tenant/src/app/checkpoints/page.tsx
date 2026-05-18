'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Btn, Modal, Field, Input, Select, ErrorMsg, ModalActions, FilterRow, FilterField } from '../../components/ui'
import { tdApi } from '../../lib/api'

export default function CheckpointsPage() {
  const router = useRouter()
  const [checkpoints, setCheckpoints] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterSite, setFilterSite] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    siteId: '',
    latitude: '',
    longitude: '',
    orderInRoute: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    tdApi.sites.list().then((r) => setSites(r.data ?? [])).catch(() => {})
    load()
  }, [router])

  useEffect(() => {
    load()
  }, [filterSite])

  function load() {
    setLoading(true)
    tdApi.checkpoints
      .list(filterSite || undefined)
      .then((r) => setCheckpoints(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.checkpoints.create({
        name: form.name,
        siteId: form.siteId,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
        orderInRoute: form.orderInRoute ? parseInt(form.orderInRoute) : undefined,
      })
      setShowModal(false)
      setForm({ name: '', siteId: '', latitude: '', longitude: '', orderInRoute: '' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function copyQr(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(value)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function siteName(id: string) { return sites.find((s) => s.id === id)?.name ?? id }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Checkpoints"
          subtitle={`${checkpoints.length} checkpoints`}
          action={<Btn variant="primary" onClick={() => setShowModal(true)}>+ Add Checkpoint</Btn>}
        />

        <FilterRow>
          <FilterField label="Site">
            <Select value={filterSite} onChange={(e) => setFilterSite(e.target.value)} style={{ width: 200 }}>
              <option value="">All sites</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FilterField>
        </FilterRow>

        <Card overflow="hidden">
          <DataTable
            cols={['Name', 'Site', 'QR / ID', 'Order', 'Coordinates']}
            loading={loading}
            empty="No checkpoints yet."
          >
            {checkpoints.map((cp) => {
              const qrValue = cp.qrCode ?? cp.id
              return (
                <TR key={cp.id}>
                  <TD>{cp.name}</TD>
                  <TD muted>{siteName(cp.siteId)}</TD>
                  <TD>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        background: 'var(--surface-2)',
                        color: 'var(--text-2)',
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}>
                        {qrValue}
                      </span>
                      <button
                        onClick={() => copyQr(qrValue)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copied === qrValue ? '#10b981' : 'var(--text-3)',
                          fontSize: 12,
                          padding: 0,
                        }}
                        title="Copy"
                      >
                        {copied === qrValue ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </TD>
                  <TD muted>{cp.orderInRoute ?? '—'}</TD>
                  <TD muted style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {cp.latitude != null && cp.longitude != null
                      ? `${cp.latitude.toFixed(4)}, ${cp.longitude.toFixed(4)}`
                      : '—'}
                  </TD>
                </TR>
              )
            })}
          </DataTable>
        </Card>

        <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Add Checkpoint">
          <form onSubmit={handleCreate}>
            <Field label="Checkpoint Name">
              <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Gate" required />
            </Field>
            <Field label="Site">
              <Select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} required>
                <option value="">Select site...</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Latitude">
                <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
              </Field>
              <Field label="Longitude">
                <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
              </Field>
            </div>
            <Field label="Order in Route">
              <Input type="number" value={form.orderInRoute} onChange={(e) => setForm({ ...form, orderInRoute: e.target.value })} placeholder="1" />
            </Field>
            <ErrorMsg msg={error} />
            <ModalActions>
              <Btn variant="secondary" onClick={() => { setShowModal(false); setError(null) }}>Cancel</Btn>
              <Btn variant="primary" type="submit" loading={saving}>Create</Btn>
            </ModalActions>
          </form>
        </Modal>
      </Main>
    </PageShell>
  )
}
