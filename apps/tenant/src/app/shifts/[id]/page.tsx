'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { PageShell, Main, Card, CardHeader, Badge } from '../../../components/ui'
import { tdApi } from '../../../lib/api'

// Heavy map component — load client-only so the SSR pass doesn't bundle
// mapbox-gl-draw's Node-only transitive deps.
const ShiftReplayMap = dynamic(
  () => import('../../../components/ShiftReplayMap').then((m) => m.ShiftReplayMap),
  { ssr: false }
)

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  scheduled: { color: '#5c5855', bg: 'rgba(163,160,152,0.12)' },
  active:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  completed: { color: '#9a9490', bg: 'rgba(122,119,115,0.12)' },
  missed:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  // Server-set when a guard went off-site mid-shift.
  abandoned: { color: '#9a3412', bg: 'rgba(201,100,66,0.12)' },
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export default function ShiftDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [replay, setReplay] = useState<Awaited<ReturnType<typeof tdApi.shifts.replay>>['data'] | null>(null)
  const [sites, setSites] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    if (!id) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([
      tdApi.shifts.replay(id),
      tdApi.sites.list().catch(() => ({ data: [] })),
      tdApi.users.list().catch(() => ({ data: [] })),
    ])
      .then(([r, s, u]) => {
        setReplay((r as any).data)
        setSites(s.data ?? [])
        setUsers(u.data ?? [])
      })
      .catch((e) => setError(e.message ?? 'Failed to load shift'))
      .finally(() => setLoading(false))
  }

  const shift = replay?.shift
  const sta = shift ? (STATUS_BADGE[shift.status] ?? STATUS_BADGE.scheduled) : null
  const siteName = shift ? (sites.find((s: any) => s.id === shift.siteId)?.name ?? shift.siteId) : ''
  const guardName = shift ? (users.find((u: any) => u.id === shift.guardId)?.name ?? shift.guardId) : ''

  return (
    <PageShell>
      <Main>
        <div style={{ marginBottom: 20 }}>
          <Link href="/shifts" style={{ color: 'var(--text-3)', fontSize: 13, textDecoration: 'none' }}>
            ← Back to shifts
          </Link>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading shift…</div>
        ) : error ? (
          <Card>
            <div style={{ padding: 22, color: '#ef4444', fontSize: 14 }}>{error}</div>
          </Card>
        ) : !shift ? (
          <Card>
            <div style={{ padding: 22, color: 'var(--text-3)', fontSize: 14 }}>Shift not found.</div>
          </Card>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
                  {guardName} · {siteName}
                </h1>
                <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
                  {new Date(shift.startsAt).toLocaleString('en-IN')}
                  {' → '}
                  {new Date(shift.endsAt).toLocaleString('en-IN')}
                </p>
                {sta && (
                  <div style={{ marginTop: 8 }}>
                    <Badge label={shift.status} color={sta.color} bg={sta.bg} />
                  </div>
                )}
              </div>
            </div>

            {/* ── Site visits & map replay ─────────────────────────────────
                Geofence-anchored view: shows on-site visits + off-site
                segments. Renders only when the replay endpoint returned
                visits — pre-feature shifts show nothing here. */}
            {replay && replay.visits.length > 0 ? (
              <Card overflow="hidden" style={{ marginBottom: 24 }}>
                <CardHeader title="Site visits & map" />
                <div style={{ padding: '0 20px 20px' }}>
                  <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 14px' }}>
                    {replay.visits.filter((v) => v.siteId).length} on-site visit(s) ·{' '}
                    {formatDuration(replay.summary.offSiteMs)} off-site
                  </p>
                  <ShiftReplayMap
                    pings={replay.pings}
                    visits={replay.visits}
                    sites={replay.sites}
                    wasAbandoned={replay.summary.wasAbandoned}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
                    {Object.entries(replay.summary.onSiteMsBySite).map(([siteId, ms]) => {
                      const site = replay.sites.find((s) => s.id === siteId)
                      return (
                        <div key={siteId} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px' }}>
                          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            on site
                          </p>
                          <p style={{ margin: '2px 0 0', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
                            {site?.name ?? 'Unknown site'}
                          </p>
                          <p style={{ margin: '2px 0 0', color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>
                            {formatDuration(ms)}
                          </p>
                        </div>
                      )
                    })}
                    {replay.summary.offSiteMs > 0 && (
                      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px' }}>
                        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {replay.summary.wasAbandoned ? 'off site (abandoned)' : 'travel'}
                        </p>
                        <p style={{ margin: '2px 0 0', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
                          {replay.summary.wasAbandoned ? 'Left site mid-shift' : 'Between sites'}
                        </p>
                        <p style={{ margin: '2px 0 0', color: replay.summary.wasAbandoned ? '#ef4444' : 'var(--text-2)', fontSize: 13, fontWeight: 500 }}>
                          {formatDuration(replay.summary.offSiteMs)}
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              </Card>
            ) : (
              <Card>
                <div style={{ padding: 22, color: 'var(--text-3)', fontSize: 14 }}>
                  No site visits recorded for this shift.
                </div>
              </Card>
            )}
          </>
        )}
      </Main>
    </PageShell>
  )
}
