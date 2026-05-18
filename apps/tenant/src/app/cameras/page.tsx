'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Badge, Btn, Modal, Field, Input, Select, ErrorMsg, ModalActions, FilterRow, FilterField } from '../../components/ui'
import { tdApi } from '../../lib/api'

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  online:  { color: '#10b981', bg: 'rgba(52,211,153,0.1)' },
  offline: { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  error:   { color: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
}

export default function CamerasPage() {
  const router = useRouter()
  const [cameras, setCameras] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterSite, setFilterSite] = useState('')
  const [form, setForm] = useState({
    name: '',
    siteId: '',
    rtspUrl: '',
    go2rtcStream: '',
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
    tdApi.cameras
      .list(filterSite || undefined)
      .then((r) => setCameras(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.cameras.create({
        name: form.name,
        siteId: form.siteId,
        rtspUrl: form.rtspUrl,
        go2rtcStream: form.go2rtcStream || undefined,
      })
      setShowModal(false)
      setForm({ name: '', siteId: '', rtspUrl: '', go2rtcStream: '' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function siteName(id: string) { return sites.find((s) => s.id === id)?.name ?? id }
  function truncateUrl(url: string) { return url.length > 50 ? url.slice(0, 47) + '...' : url }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Cameras"
          subtitle={`${cameras.length} cameras`}
          action={<Btn variant="primary" onClick={() => setShowModal(true)}>+ Add Camera</Btn>}
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
            cols={['Name', 'Site', 'RTSP URL', 'Status', 'Last Seen']}
            loading={loading}
            empty="No cameras yet. Add one to get started."
          >
            {cameras.map((cam) => {
              const sta = STATUS_BADGE[cam.status] ?? { color: '#5c5855', bg: 'rgba(163,160,152,0.1)' }
              return (
                <TR key={cam.id}>
                  <TD>{cam.name}</TD>
                  <TD muted>{siteName(cam.siteId)}</TD>
                  <TD muted>
                    <span style={{ fontFamily: 'monospace', fontSize: 12 }} title={cam.rtspUrl}>
                      {truncateUrl(cam.rtspUrl)}
                    </span>
                  </TD>
                  <TD><Badge label={cam.status ?? 'unknown'} color={sta.color} bg={sta.bg} /></TD>
                  <TD muted>{cam.lastSeenAt ? new Date(cam.lastSeenAt).toLocaleString('en-IN') : '—'}</TD>
                </TR>
              )
            })}
          </DataTable>
        </Card>

        <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Add Camera">
          <form onSubmit={handleCreate}>
            <Field label="Camera Name">
              <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Gate Cam" required />
            </Field>
            <Field label="Site">
              <Select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} required>
                <option value="">Select site...</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="RTSP URL">
              <Input type="text" value={form.rtspUrl} onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })} placeholder="rtsp://192.168.1.100:554/stream1" required />
            </Field>
            <Field label="go2rtc Stream Name (optional)">
              <Input type="text" value={form.go2rtcStream} onChange={(e) => setForm({ ...form, go2rtcStream: e.target.value })} placeholder="main-gate" />
            </Field>
            <ErrorMsg msg={error} />
            <ModalActions>
              <Btn variant="secondary" onClick={() => { setShowModal(false); setError(null) }}>Cancel</Btn>
              <Btn variant="primary" type="submit" loading={saving}>Add Camera</Btn>
            </ModalActions>
          </form>
        </Modal>
      </Main>
    </PageShell>
  )
}
