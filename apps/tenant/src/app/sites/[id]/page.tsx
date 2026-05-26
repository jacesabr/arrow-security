'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  PageShell,
  Main,
  Card,
  CardHeader,
  Badge,
  Btn,
  Field,
  Input,
  Select,
  Textarea,
  ErrorMsg,
} from '../../../components/ui'
import { tdApi } from '../../../lib/api'

// Client-only — see /sites/page.tsx for the same shape. Skips SSR of the
// heavy mapbox-gl-draw chain.
const GeofenceMap = dynamic(
  () => import('../../../components/GeofenceMap').then((m) => m.GeofenceMap),
  { ssr: false }
)

const DEFAULT_GEOFENCE_M = 200

type SiteStatus = 'pending' | 'active' | 'inactive'

type SiteForm = {
  name: string
  address: string
  latitude: string
  longitude: string
  geofenceRadiusMeters: string
  status: SiteStatus
  clientId: string
  accessInstructions: string
  gateCode: string
  contactPhone: string
  hazards: string
}

const EMPTY_FORM: SiteForm = {
  name: '',
  address: '',
  latitude: '',
  longitude: '',
  geofenceRadiusMeters: String(DEFAULT_GEOFENCE_M),
  status: 'active',
  clientId: '',
  accessInstructions: '',
  gateCode: '',
  contactPhone: '',
  hazards: '',
}

const STATUS_BADGE: Record<SiteStatus, { color: string; bg: string; label: string }> = {
  pending:  { color: '#b45309', bg: 'rgba(245,158,11,0.16)', label: 'pending review' },
  active:   { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'active' },
  inactive: { color: '#5c5855', bg: 'rgba(163,160,152,0.12)', label: 'inactive' },
}

function toForm(site: any): SiteForm {
  return {
    name: site.name ?? '',
    address: site.address ?? '',
    latitude: site.latitude != null ? String(site.latitude) : '',
    longitude: site.longitude != null ? String(site.longitude) : '',
    geofenceRadiusMeters:
      site.geofenceRadiusMeters != null
        ? String(site.geofenceRadiusMeters)
        : String(DEFAULT_GEOFENCE_M),
    status: (site.status ?? 'active') as SiteStatus,
    clientId: site.clientId ?? '',
    accessInstructions: site.accessInstructions ?? '',
    gateCode: site.gateCode ?? '',
    contactPhone: site.contactPhone ?? '',
    hazards: site.hazards ?? '',
  }
}

export default function SiteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [site, setSite] = useState<any | null>(null)
  const [clients, setClients] = useState<any[]>([])
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [assignedSupervisorIds, setAssignedSupervisorIds] = useState<string[]>([])
  const [form, setForm] = useState<SiteForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    if (!id) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function load() {
    setLoading(true)
    Promise.all([
      tdApi.sites.get(id),
      tdApi.clients.list().catch(() => ({ data: [] })),
      tdApi.supervisors.list().catch(() => ({ data: [] })),
      tdApi.supervisors.bySite(id).catch(() => ({ data: [] })),
    ])
      .then(([s, c, sup, bySite]) => {
        setSite(s.data)
        setClients(c.data ?? [])
        setSupervisors(sup.data ?? [])
        setAssignedSupervisorIds((bySite.data ?? []).map((r: any) => r.supervisorId))
        setForm(toForm(s.data))
      })
      .catch((e: any) => setError(e.message ?? 'Failed to load site'))
      .finally(() => setLoading(false))
  }

  // Build the patch from any fields that diverged from the server copy. Lets
  // the audit log record a clean diff instead of a full-row touch each save.
  function buildPatch(): Record<string, any> {
    if (!site) return {}
    const patch: Record<string, any> = {}
    if (form.name !== site.name) patch.name = form.name
    if (form.address !== site.address) patch.address = form.address
    if (form.status !== site.status) patch.status = form.status
    if (form.clientId !== (site.clientId ?? '')) patch.clientId = form.clientId || undefined

    const lat = parseFloat(form.latitude)
    const lng = parseFloat(form.longitude)
    const radius = parseInt(form.geofenceRadiusMeters)
    if (!Number.isNaN(lat) && lat !== site.latitude) patch.latitude = lat
    if (!Number.isNaN(lng) && lng !== site.longitude) patch.longitude = lng
    if (!Number.isNaN(radius) && radius !== site.geofenceRadiusMeters) {
      patch.geofenceRadiusMeters = radius
    }

    for (const k of ['accessInstructions', 'gateCode', 'contactPhone', 'hazards'] as const) {
      const next = form[k].trim() || null
      const cur = site[k] ?? null
      if (next !== cur) patch[k] = next
    }
    return patch
  }

  async function persistAssignedSupervisors(originalIds: string[]) {
    const current = new Set(assignedSupervisorIds)
    const original = new Set(originalIds)
    // Unassign anyone the admin removed.
    const removed = [...original].filter((sid) => !current.has(sid))
    // Assign anyone the admin added.
    const added = [...current].filter((sid) => !original.has(sid))
    await Promise.all([
      ...removed.map((supId) => tdApi.supervisors.removeSite(supId, id)),
      ...added.map((supId) => tdApi.supervisors.assignSites(supId, [id])),
    ])
  }

  async function save() {
    if (!site) return
    setSaving(true)
    setError(null)
    try {
      const patch = buildPatch()
      const originalAssigned = (await tdApi.supervisors.bySite(id)).data.map((r: any) => r.supervisorId)
      const supervisorChange =
        assignedSupervisorIds.length !== originalAssigned.length ||
        assignedSupervisorIds.some((sid) => !originalAssigned.includes(sid))

      if (Object.keys(patch).length === 0 && !supervisorChange) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 2000)
        return
      }

      if (Object.keys(patch).length > 0) {
        const updated = await tdApi.sites.update(id, patch)
        setSite(updated.data)
        setForm(toForm(updated.data))
      }
      if (supervisorChange) await persistAssignedSupervisors(originalAssigned)

      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function confirmPending() {
    if (!site) return
    if (!form.clientId) {
      setError('Pick a client before confirming this site.')
      return
    }
    setConfirming(true)
    setError(null)
    try {
      const patch = { ...buildPatch(), status: 'active' as const, clientId: form.clientId }
      const originalAssigned = (await tdApi.supervisors.bySite(id)).data.map((r: any) => r.supervisorId)
      const updated = await tdApi.sites.update(id, patch)
      setSite(updated.data)
      setForm(toForm(updated.data))
      await persistAssignedSupervisors(originalAssigned)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Could not confirm site')
    } finally {
      setConfirming(false)
    }
  }

  function toggleSupervisor(supId: string) {
    setAssignedSupervisorIds((prev) =>
      prev.includes(supId) ? prev.filter((x) => x !== supId) : [...prev, supId],
    )
  }

  const lat = form.latitude ? parseFloat(form.latitude) : null
  const lng = form.longitude ? parseFloat(form.longitude) : null
  const radius = form.geofenceRadiusMeters
    ? parseInt(form.geofenceRadiusMeters)
    : DEFAULT_GEOFENCE_M

  const isPending = (site?.status ?? 'active') === 'pending'

  return (
    <PageShell>
      <Main>
        <div style={{ marginBottom: 20 }}>
          <Link href="/sites" style={{ color: 'var(--text-3)', fontSize: 13, textDecoration: 'none' }}>
            ← Back to sites
          </Link>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading site…</div>
        ) : !site ? (
          <Card>
            <div style={{ padding: 22, color: 'var(--text-3)', fontSize: 14 }}>
              Site not found.
            </div>
          </Card>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
                  {site.name}
                </h1>
                <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
                  {site.address}
                </p>
                <div style={{ marginTop: 8 }}>
                  <Badge
                    label={STATUS_BADGE[(site.status ?? 'active') as SiteStatus].label}
                    color={STATUS_BADGE[(site.status ?? 'active') as SiteStatus].color}
                    bg={STATUS_BADGE[(site.status ?? 'active') as SiteStatus].bg}
                  />
                </div>
              </div>
              <Btn variant="primary" onClick={save} loading={saving}>
                Save changes
              </Btn>
            </div>

            {isPending && (
              <div
                style={{
                  background: 'rgba(245,158,11,0.10)',
                  border: '1px solid rgba(245,158,11,0.45)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  marginBottom: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#b45309', fontWeight: 600, fontSize: 14 }}>
                    Pending review
                  </div>
                  <div style={{ color: '#92400e', fontSize: 12.5, marginTop: 2 }}>
                    Auto-created when a guard checked in at this location. Adjust the geofence
                    centre and radius on the map, pick a client, assign supervisors, fill in any
                    briefing notes, then confirm.
                  </div>
                </div>
                <Btn variant="primary" onClick={confirmPending} loading={confirming}>
                  Confirm site
                </Btn>
              </div>
            )}

            {/* ── Map editor ───────────────────────────────────────── */}
            <Card overflow="hidden" style={{ marginBottom: 24 }}>
              <CardHeader title="Geofence" />
              <div style={{ padding: '0 20px 20px' }}>
                <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 14px' }}>
                  Drag the circle to reposition, drag the edge handles to resize, or
                  click an empty spot on the map to recentre. Changes auto-fill the
                  latitude / longitude / radius fields below. <strong>The geofence
                  radius drives off-site detection during every shift</strong> — guards
                  who leave it for &gt; 60 seconds automatically end the shift and are signed out.
                </p>
                <GeofenceMap
                  latitude={lat}
                  longitude={lng}
                  radiusMeters={radius}
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
              </div>
            </Card>

            {/* ── Fields ───────────────────────────────────────────── */}
            <Card overflow="hidden" style={{ marginBottom: 24 }}>
              <CardHeader title="Details" />
              <div style={{ padding: 20 }}>
                <Field label="Site name">
                  <Input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Address">
                  <Input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="Latitude">
                    <Input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    />
                  </Field>
                  <Field label="Longitude">
                    <Input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    />
                  </Field>
                  <Field label="Geofence radius (m)">
                    <Input
                      type="number"
                      min="10"
                      max="5000"
                      value={form.geofenceRadiusMeters}
                      onChange={(e) =>
                        setForm({ ...form, geofenceRadiusMeters: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label={isPending ? 'Client *' : 'Client'}>
                  <Select
                    value={form.clientId}
                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status">
                  <Select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as SiteStatus })
                    }
                  >
                    <option value="pending">Pending review</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </Field>
              </div>
            </Card>

            {/* ── Briefing / metadata ─────────────────────────────── */}
            <Card overflow="hidden" style={{ marginBottom: 24 }}>
              <CardHeader title="Site briefing" />
              <div style={{ padding: 20 }}>
                <Field label="Access instructions">
                  <Textarea
                    rows={3}
                    value={form.accessInstructions}
                    onChange={(e) => setForm({ ...form, accessInstructions: e.target.value })}
                    placeholder="How to get in — gate location, parking, who to ask for, etc."
                  />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Gate / lock code">
                    <Input
                      type="text"
                      value={form.gateCode}
                      onChange={(e) => setForm({ ...form, gateCode: e.target.value })}
                    />
                  </Field>
                  <Field label="On-site contact phone">
                    <Input
                      type="tel"
                      value={form.contactPhone}
                      onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Hazards / special notes">
                  <Textarea
                    rows={3}
                    value={form.hazards}
                    onChange={(e) => setForm({ ...form, hazards: e.target.value })}
                    placeholder="Anything a guard needs to know before their first shift."
                  />
                </Field>
              </div>
            </Card>

            {/* ── Supervisor assignment ───────────────────────────── */}
            <Card overflow="hidden">
              <CardHeader title="Assigned supervisors" />
              <div style={{ padding: 20 }}>
                {supervisors.length === 0 ? (
                  <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
                    No supervisors have been added to this tenant yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {supervisors.map((sup: any) => {
                      const checked = assignedSupervisorIds.includes(sup.id)
                      return (
                        <label
                          key={sup.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: checked ? 'var(--accent-dim)' : 'transparent',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: 'var(--text)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSupervisor(sup.id)}
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          <span>{sup.name ?? sup.username}</span>
                          {sup.name && (
                            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                              {sup.username}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}

                <ErrorMsg msg={error} />
                {success && (
                  <p style={{ color: '#10b981', fontSize: 13, margin: '8px 0 0' }}>
                    Saved.
                  </p>
                )}
              </div>
            </Card>
          </>
        )}
      </Main>
    </PageShell>
  )
}
