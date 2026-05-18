'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Badge, Btn, Modal, Field, Input, Select, ErrorMsg, ModalActions } from '../../components/ui'
import { tdApi } from '../../lib/api'

export default function SitesPage() {
  const router = useRouter()
  const [sites, setSites] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    geofenceRadiusMeters: '',
    clientId: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    load()
  }, [router])

  function load() {
    setLoading(true)
    Promise.all([
      tdApi.sites.list(),
      tdApi.clients.list().catch(() => ({ data: [] })),
    ]).then(([s, c]) => {
      setSites(s.data ?? [])
      setClients(c.data ?? [])
    }).catch(console.error).finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.sites.create({
        name: form.name,
        address: form.address,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
        geofenceRadiusMeters: form.geofenceRadiusMeters ? parseInt(form.geofenceRadiusMeters) : undefined,
        clientId: form.clientId || undefined,
      })
      setShowModal(false)
      setForm({ name: '', address: '', latitude: '', longitude: '', geofenceRadiusMeters: '', clientId: '' })
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
          title="Sites"
          subtitle={`${sites.length} sites`}
          action={<Btn variant="primary" onClick={() => setShowModal(true)}>+ Add Site</Btn>}
        />

        <Card overflow="hidden">
          <DataTable
            cols={['Name', 'Address', 'Geofence Radius', 'Client', 'Status']}
            loading={loading}
            empty="No sites yet. Add one to get started."
          >
            {sites.map((s) => (
              <TR key={s.id}>
                <TD>{s.name}</TD>
                <TD muted style={{ maxWidth: 200 }}>{s.address}</TD>
                <TD muted>{s.geofenceRadiusMeters ? `${s.geofenceRadiusMeters}m` : '—'}</TD>
                <TD muted>{clients.find((c) => c.id === s.clientId)?.name ?? '—'}</TD>
                <TD>
                  <Badge
                    label={s.status ?? 'active'}
                    color={s.status === 'active' ? '#10b981' : '#a3a098'}
                    bg={s.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(163,160,152,0.12)'}
                  />
                </TD>
              </TR>
            ))}
          </DataTable>
        </Card>

        <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Add Site">
          <form onSubmit={handleCreate}>
            <Field label="Site Name">
              <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Address">
              <Input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Latitude">
                <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="12.9716" />
              </Field>
              <Field label="Longitude">
                <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="77.5946" />
              </Field>
            </div>
            <Field label="Geofence Radius (meters)">
              <Input type="number" value={form.geofenceRadiusMeters} onChange={(e) => setForm({ ...form, geofenceRadiusMeters: e.target.value })} placeholder="100" />
            </Field>
            <Field label="Client">
              <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">— No client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
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
