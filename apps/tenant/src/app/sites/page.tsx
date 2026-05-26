'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Badge, Btn, Modal, Field, Input, ErrorMsg, ModalActions } from '../../components/ui'
import dynamic from 'next/dynamic'
import { GoogleAddressAutocomplete, type PlacePick } from '../../components/GoogleAddressAutocomplete'
import { tdApi } from '../../lib/api'

type SiteStatus = 'pending' | 'active' | 'inactive'
type FilterValue = SiteStatus | 'all'

const STATUS_BADGE: Record<SiteStatus, { color: string; bg: string; label: string }> = {
  pending:  { color: '#b45309', bg: 'rgba(245,158,11,0.16)', label: 'pending review' },
  active:   { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'active' },
  inactive: { color: '#5c5855', bg: 'rgba(163,160,152,0.12)', label: 'inactive' },
}

// MapBox + draw + draw-circle pull in transitive Node-only modules
// (jsonlint-lines, geojsonhint) that Turbopack can't statically prove are
// dead code in the browser. Loading the map dynamically with ssr:false skips
// the SSR pass entirely, so those references are never bundled there.
const GeofenceMap = dynamic(
  () => import('../../components/GeofenceMap').then((m) => m.GeofenceMap),
  { ssr: false }
)

// Geofence radius is now load-bearing for off-site detection during shifts.
// Default kept aligned with the DB default (200m) so the visible circle matches
// what the server uses when the operator leaves the field blank.
const DEFAULT_GEOFENCE_M = 200

export default function SitesPage() {
  const router = useRouter()
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Default to pending when any pending sites exist so admins land on the
  // review queue without having to hunt for the chip.
  const [filter, setFilter] = useState<FilterValue>('all')
  const [form, setForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    geofenceRadiusMeters: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    load()
  }, [router])

  function load() {
    setLoading(true)
    tdApi.sites.list()
      .then((s) => {
        const list = s.data ?? []
        setSites(list)
        // First load: if there's a review backlog, jump to the Pending tab.
        if (filter === 'all' && list.some((x: any) => x.status === 'pending')) {
          setFilter('pending')
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const counts = useMemo(() => {
    const c = { all: sites.length, pending: 0, active: 0, inactive: 0 }
    for (const s of sites) {
      const k = (s.status ?? 'active') as SiteStatus
      if (k in c) c[k] += 1
    }
    return c
  }, [sites])

  const filtered = useMemo(
    () => (filter === 'all' ? sites : sites.filter((s) => (s.status ?? 'active') === filter)),
    [sites, filter],
  )

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
      })
      setShowModal(false)
      setForm({ name: '', address: '', latitude: '', longitude: '', geofenceRadiusMeters: '' })
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
          subtitle={`${sites.length} sites${counts.pending ? ` · ${counts.pending} pending review` : ''}`}
          action={<Btn variant="primary" onClick={() => setShowModal(true)}>+ Add Site</Btn>}
        />

        <StatusChips filter={filter} setFilter={setFilter} counts={counts} />

        <Card overflow="hidden">
          <DataTable
            cols={['Name', 'Address', 'Geofence Radius', 'Status']}
            loading={loading}
            empty={
              filter === 'pending'
                ? 'No pending sites. New locations a guard checks in at will appear here for review.'
                : 'No sites yet. Add one to get started.'
            }
          >
            {filtered.map((s) => {
              const sta = (s.status ?? 'active') as SiteStatus
              const badge = STATUS_BADGE[sta] ?? STATUS_BADGE.active
              return (
                <TR key={s.id} onClick={() => router.push(`/sites/${s.id}`)}>
                  <TD>
                    {s.name}
                    {sta === 'pending' && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                        NEEDS REVIEW
                      </span>
                    )}
                  </TD>
                  <TD muted style={{ maxWidth: 200 }}>{s.address}</TD>
                  <TD muted>{s.geofenceRadiusMeters ? `${s.geofenceRadiusMeters}m` : '—'}</TD>
                  <TD>
                    <Badge label={badge.label} color={badge.color} bg={badge.bg} />
                  </TD>
                </TR>
              )
            })}
          </DataTable>
        </Card>

        <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Add Site">
          <form onSubmit={handleCreate}>
            <Field label="Site Name">
              <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Address">
              <GoogleAddressAutocomplete
                value={form.address}
                onChange={(address) => setForm(f => ({ ...f, address }))}
                onPick={(pick: PlacePick) => setForm(f => ({
                  ...f,
                  address: pick.address,
                  latitude: pick.latitude.toFixed(6),
                  longitude: pick.longitude.toFixed(6),
                  // If the user hasn't typed a site name yet, suggest the
                  // place's short name (e.g. "TCS BKC Tower 1"). Don't
                  // overwrite a name they've already entered.
                  name: f.name || pick.shortName || f.name,
                }))}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Latitude">
                <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="auto-filled from address" />
              </Field>
              <Field label="Longitude">
                <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="auto-filled from address" />
              </Field>
            </div>
            <Field label="Geofence Radius (meters)">
              <Input
                type="number"
                value={form.geofenceRadiusMeters}
                onChange={(e) => setForm({ ...form, geofenceRadiusMeters: e.target.value })}
                placeholder={String(DEFAULT_GEOFENCE_M)}
              />
            </Field>

            {/* Live geofence preview. The map is omitted until we have a centre
                to render (avoids a spinning world-map). Clicking the map moves
                the centre and updates the lat/lng inputs above. */}
            {form.latitude && form.longitude ? (
              <Field label="Geofence preview (click the map to reposition)">
                <GeofenceMap
                  latitude={parseFloat(form.latitude)}
                  longitude={parseFloat(form.longitude)}
                  radiusMeters={
                    form.geofenceRadiusMeters
                      ? parseInt(form.geofenceRadiusMeters)
                      : DEFAULT_GEOFENCE_M
                  }
                  onChange={({ latitude, longitude, radiusMeters }) =>
                    setForm((f) => ({
                      ...f,
                      ...(latitude !== undefined ? { latitude: latitude.toFixed(6) } : {}),
                      ...(longitude !== undefined ? { longitude: longitude.toFixed(6) } : {}),
                      ...(radiusMeters !== undefined
                        ? { geofenceRadiusMeters: String(radiusMeters) }
                        : {}),
                    }))
                  }
                />
              </Field>
            ) : (
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px dashed var(--border)',
                  borderRadius: 8,
                  padding: 16,
                  color: 'var(--text-3)',
                  fontSize: 13,
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                Pick an address or enter a latitude / longitude to preview the geofence.
              </div>
            )}
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

function StatusChips({
  filter,
  setFilter,
  counts,
}: {
  filter: FilterValue
  setFilter: (v: FilterValue) => void
  counts: { all: number; pending: number; active: number; inactive: number }
}) {
  const items: { key: FilterValue; label: string }[] = [
    { key: 'all',      label: `All (${counts.all})` },
    { key: 'pending',  label: `Pending (${counts.pending})` },
    { key: 'active',   label: `Active (${counts.active})` },
    { key: 'inactive', label: `Inactive (${counts.inactive})` },
  ]
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {items.map((it) => {
        const isActive = filter === it.key
        const isPending = it.key === 'pending' && counts.pending > 0
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => setFilter(it.key)}
            style={{
              background: isActive
                ? 'var(--accent)'
                : isPending
                  ? 'rgba(245,158,11,0.16)'
                  : 'var(--surface)',
              color: isActive ? '#fff' : isPending ? '#b45309' : 'var(--text-2)',
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '-0.005em',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
