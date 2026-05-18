'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Btn, Modal, Field, Input, ErrorMsg, ModalActions } from '../../components/ui'
import { tdApi } from '../../lib/api'

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    load()
  }, [router])

  function load() {
    setLoading(true)
    tdApi.clients
      .list()
      .then((r) => setClients(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.clients.create(form)
      setShowModal(false)
      setForm({ name: '', contactName: '', contactEmail: '', contactPhone: '' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Clients"
          subtitle={`${clients.length} clients`}
          action={<Btn variant="primary" onClick={() => setShowModal(true)}>+ Add Client</Btn>}
        />

        <Card overflow="hidden">
          <DataTable
            cols={['Company Name', 'Contact Name', 'Contact Email', 'Contact Phone']}
            loading={loading}
            empty="No clients yet. Add one to get started."
          >
            {clients.map((c) => (
              <TR key={c.id}>
                <TD>{c.name}</TD>
                <TD muted>{c.contactName ?? '—'}</TD>
                <TD muted>{c.contactEmail ?? '—'}</TD>
                <TD muted>{c.contactPhone ?? '—'}</TD>
              </TR>
            ))}
          </DataTable>
        </Card>

        <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Add Client">
          <form onSubmit={handleCreate}>
            <Field label="Company Name">
              <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" required />
            </Field>
            <Field label="Contact Name">
              <Input type="text" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="John Doe" required />
            </Field>
            <Field label="Contact Email">
              <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="john@acmecorp.com" required />
            </Field>
            <Field label="Contact Phone">
              <Input type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="+91 98765 43210" required />
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
