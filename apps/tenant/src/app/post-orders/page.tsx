'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { tdApi } from '../../lib/api'
import {
  PageShell, Main, PageHeader, Card, CardHeader,
  Btn, Modal, Field, Input, Select, Textarea, ErrorMsg, ModalActions,
  Badge, DataTable, TR, TD,
} from '../../components/ui'

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function PostOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [acks, setAcks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterSite, setFilterSite] = useState('')
  const [form, setForm] = useState({ siteId: '', title: '', content: '', requiresAck: true })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    tdApi.sites.list().then((r) => setSites(r.data ?? [])).catch(() => {})
    load()
  }, [router])

  useEffect(() => { load() }, [filterSite])

  function load() {
    setLoading(true)
    tdApi.postOrders.list(filterSite || undefined)
      .then((r) => setOrders(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function selectOrder(order: any) {
    setSelected(order)
    setAcks([])
    tdApi.postOrders.get(order.id)
      .then((r) => setAcks(r.data?.acknowledgements ?? []))
      .catch(() => {})
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.postOrders.create({
        siteId: form.siteId,
        title: form.title,
        content: form.content,
        requiresAck: form.requiresAck,
      })
      setShowModal(false)
      setForm({ siteId: '', title: '', content: '', requiresAck: true })
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function siteName(id: string) { return sites.find((s) => s.id === id)?.name ?? id }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Post Orders"
          subtitle="Standing instructions guards must acknowledge before starting a shift"
          action={<Btn onClick={() => { setError(null); setShowModal(true) }}>+ New Post Order</Btn>}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Left — list */}
          <Card overflow="hidden">
            <CardHeader title="Orders" />
            <div style={{ padding: '8px' }}>
              <Select
                value={filterSite}
                onChange={(e) => setFilterSite(e.target.value)}
                style={{ width: '100%', marginBottom: 4 }}
              >
                <option value="">All sites</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            {loading ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
            ) : orders.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No post orders yet</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {orders.map((o) => (
                  <li key={o.id}>
                    <button
                      onClick={() => selectOrder(o)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '11px 14px',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        background: selected?.id === o.id ? 'var(--accent-dim)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                      }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.3 }}>{o.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{siteName(o.siteId)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Right — detail */}
          <div>
            {!selected ? (
              <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-3)', fontSize: 13.5, margin: 0 }}>Select a post order to view details</p>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card style={{ padding: '20px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{selected.title}</h2>
                      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>{siteName(selected.siteId)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {selected.version != null && (
                        <Badge label={`v${selected.version}`} color="var(--text-3)" bg="var(--surface-2)" />
                      )}
                      <Badge
                        label={selected.requiresAck ? 'Ack required' : 'Info only'}
                        color={selected.requiresAck ? '#3b82f6' : '#9a9490'}
                        bg={selected.requiresAck ? 'rgba(59,130,246,0.1)' : 'var(--surface-2)'}
                      />
                    </div>
                  </div>
                  <div style={{
                    padding: '14px 16px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13.5,
                    color: 'var(--text-2)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap' as const,
                    minHeight: 80,
                  }}>
                    {selected.content}
                  </div>
                </Card>

                <Card overflow="hidden">
                  <CardHeader title="Acknowledgements" />
                  <DataTable
                    cols={['Guard', 'Shift', 'Acknowledged At']}
                    empty="No acknowledgements yet."
                  >
                    {acks.map((a: any) => (
                      <TR key={a.id}>
                        <TD>{a.guardName}</TD>
                        <TD muted style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{a.shiftId ?? '—'}</TD>
                        <TD muted>{a.ackedAt ? fmtDateTime(a.ackedAt) : '—'}</TD>
                      </TR>
                    ))}
                  </DataTable>
                </Card>
              </div>
            )}
          </div>
        </div>
      </Main>

      <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="New Post Order" width={520}>
        <form onSubmit={handleCreate}>
          <ErrorMsg msg={error} />
          <Field label="Site">
            <Select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} required>
              <option value="">Select site…</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Main Gate Inspection Protocol"
              required
              autoFocus
            />
          </Field>
          <Field label="Content">
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Detailed standing orders for guards at this post…"
              rows={6}
              required
            />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <input
              id="requires-ack"
              type="checkbox"
              checked={form.requiresAck}
              onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <label htmlFor="requires-ack" style={{ fontSize: 13.5, color: 'var(--text)', cursor: 'pointer' }}>
              Requires guard acknowledgement before shift start
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setShowModal(false); setError(null) }}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Create</Btn>
          </ModalActions>
        </form>
      </Modal>
    </PageShell>
  )
}
