'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, CardHeader } from '../../components/ui'
import { tdApi } from '../../lib/api'

type Supervisor = {
  id: string
  name: string
  username: string
  lastLoginAt?: string
  createdAt: string
}

type Site = { id: string; name: string; address: string }

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function SiteAssignModal({
  supervisor,
  allSites,
  assignedIds,
  onClose,
  onSave,
}: {
  supervisor: Supervisor
  allSites: Site[]
  assignedIds: string[]
  onClose: () => void
  onSave: (supervisorId: string, toAdd: string[], toRemove: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedIds))
  const [saving, setSaving] = useState(false)

  function toggle(siteId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(siteId)) next.delete(siteId)
      else next.add(siteId)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const toAdd = allSites.map(s => s.id).filter(id => selected.has(id) && !assignedIds.includes(id))
      const toRemove = assignedIds.filter(id => !selected.has(id))
      await onSave(supervisor.id, toAdd, toRemove)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: 28, width: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 16, margin: 0, color: '#1a1916' }}>Assign Sites</p>
            <p style={{ color: '#9a9490', fontSize: 13, margin: '3px 0 0' }}>{supervisor.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a9490', fontSize: 20 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 20 }}>
          {allSites.length === 0 ? (
            <p style={{ color: '#9a9490', fontSize: 13 }}>No sites found.</p>
          ) : allSites.map(site => (
            <label
              key={site.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: selected.has(site.id) ? 'rgba(201,100,66,0.05)' : 'transparent',
                border: `1px solid ${selected.has(site.id) ? 'rgba(201,100,66,0.2)' : '#e8e5e0'}`,
                transition: 'all 0.1s',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(site.id)}
                onChange={() => toggle(site.id)}
                style={{ accentColor: '#c96442', width: 15, height: 15, flexShrink: 0 }}
              />
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#1a1916' }}>{site.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#9a9490' }}>{site.address}</p>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8,
              border: '1px solid #e8e5e0', background: '#fff', color: '#5c5855',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 2, padding: '9px 0', borderRadius: 8,
              border: 'none', background: '#c96442', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Assignments'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SupervisorsPage() {
  const router = useRouter()
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [assignedMap, setAssignedMap] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Supervisor | null>(null)

  async function load() {
    const [supRes, siteRes] = await Promise.all([
      tdApi.supervisors.list().catch(() => ({ data: [] })),
      tdApi.sites.list().catch(() => ({ data: [] })),
    ])
    setSupervisors(supRes.data)
    setSites(siteRes.data)

    // Load site assignments for each supervisor
    const entries = await Promise.all(
      supRes.data.map(async (s: Supervisor) => {
        try {
          const r = await tdApi.supervisors.getSites(s.id)
          return [s.id, r.data.map((x) => x.siteId)] as [string, string[]]
        } catch {
          return [s.id, []] as [string, string[]]
        }
      })
    )
    setAssignedMap(Object.fromEntries(entries))
  }

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [router])

  async function handleSave(supervisorId: string, toAdd: string[], toRemove: string[]) {
    if (toAdd.length > 0) {
      await tdApi.supervisors.assignSites(supervisorId, toAdd)
    }
    for (const siteId of toRemove) {
      await tdApi.supervisors.removeSite(supervisorId, siteId)
    }
    await load()
  }

  const siteNameMap = Object.fromEntries(sites.map(s => [s.id, s.name]))

  const btn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 7, border: '1px solid #e8e5e0',
    background: '#fff', fontSize: 12, color: '#5c5855', cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Supervisors"
          subtitle="Manage supervisor accounts and their site assignments"
          action={
            <button
              onClick={() => router.push('/guards?role=supervisor')}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: '#c96442', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Add Supervisor
            </button>
          }
        />

        <Card overflow="hidden">
          <CardHeader title={`${supervisors.length} supervisor${supervisors.length !== 1 ? 's' : ''}`} />
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9a9490' }}>Loading…</div>
          ) : supervisors.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9a9490' }}>
              No supervisors yet. Create a user with the Supervisor role in the Guards page.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafaf9', borderBottom: '1px solid #e8e5e0' }}>
                  {['Name', 'Email', 'Assigned Sites', 'Last Login', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '10px 18px', textAlign: 'left',
                      fontWeight: 600, fontSize: 12, color: '#9a9490', letterSpacing: '0.03em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supervisors.map(sup => {
                  const assignedSiteIds = assignedMap[sup.id] ?? []
                  return (
                    <tr
                      key={sup.id}
                      style={{ borderBottom: '1px solid #f0ede8' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', background: '#c96442',
                          color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, marginRight: 10,
                        }}>
                          {sup.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: '#1a1916' }}>{sup.name}</span>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#5c5855' }}>@{sup.username}</td>
                      <td style={{ padding: '14px 18px' }}>
                        {assignedSiteIds.length === 0 ? (
                          <span style={{ color: '#ef4444', fontSize: 12 }}>No sites assigned</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {assignedSiteIds.slice(0, 3).map(id => (
                              <span key={id} style={{
                                padding: '2px 8px', borderRadius: 5, fontSize: 11,
                                background: 'rgba(201,100,66,0.08)', color: '#c96442', fontWeight: 500,
                              }}>
                                {siteNameMap[id] ?? id}
                              </span>
                            ))}
                            {assignedSiteIds.length > 3 && (
                              <span style={{ color: '#9a9490', fontSize: 11, padding: '2px 4px' }}>
                                +{assignedSiteIds.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#9a9490', fontSize: 12 }}>
                        {fmtDate(sup.lastLoginAt)}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <button
                          onClick={() => setEditing(sup)}
                          style={btn}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c96442'; e.currentTarget.style.color = '#c96442' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e5e0'; e.currentTarget.style.color = '#5c5855' }}
                        >
                          Manage Sites
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </Main>

      {editing && (
        <SiteAssignModal
          supervisor={editing}
          allSites={sites}
          assignedIds={assignedMap[editing.id] ?? []}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </PageShell>
  )
}
