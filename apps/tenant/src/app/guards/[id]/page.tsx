'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, CardHeader, DataTable, TR, TD, Badge, Btn, Modal, Field, Input, ErrorMsg, ModalActions } from '../../../components/ui'
import { tdApi } from '../../../lib/api'

const ROLE_DISPLAY: Record<string, string> = {
  tenant_admin: 'Admin',
  platform_admin: 'Admin',
  supervisor: 'Supervisor',
  guard: 'Guard',
  client_viewer: 'Client',
}

const ROLE_BADGE: Record<string, { color: string; bg: string }> = {
  guard:          { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  supervisor:     { color: '#c96442', bg: 'rgba(201,100,66,0.12)' },
  tenant_admin:   { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  platform_admin: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  client_viewer:  { color: '#5c5855', bg: 'rgba(163,160,152,0.12)' },
}

const REVIEW_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  approved: { label: 'Approved', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  flagged:  { label: 'Flagged',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

function fmt(date: string | Date | null, opts?: Intl.DateTimeFormatOptions) {
  if (!date) return '—'
  return new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', ...opts })
}

function fmtDate(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function GuardProfilePage() {
  const router = useRouter()
  const params = useParams()
  const guardId = params.id as string

  const [data, setData] = useState<{ guard: any; rows: any[]; summary: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [since, setSince] = useState(() => isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
  const [until, setUntil] = useState(() => isoDate(new Date()))

  const [selfie, setSelfie] = useState<{ url: string; reviewStatus: string | null; method: string; geofence: boolean | null; outOfZoneReason: string | null; time: string } | null>(null)
  const [selfieLoading, setSelfieLoading] = useState(false)

  const [showResetPw, setShowResetPw] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetDone, setResetDone] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    tdApi.attendance
      .logsheet({ guardId, since, until })
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [guardId, since, until])

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    load()
  }, [load, router])

  async function openSelfie(row: any) {
    if (!row.checkInSelfieUrl) return
    setSelfieLoading(true)
    try {
      const { data: { url } } = await tdApi.upload.getUrl(row.checkInSelfieUrl)
      setSelfie({
        url,
        reviewStatus: row.checkInSelfieReview,
        method: row.checkInMethod,
        geofence: row.checkInGeofence,
        outOfZoneReason: row.checkInOutOfZoneReason ?? null,
        time: new Date(row.checkInTime).toLocaleString('en-IN'),
      })
    } catch {
      // selfie URL may be a direct URL already
      setSelfie({
        url: row.checkInSelfieUrl,
        reviewStatus: row.checkInSelfieReview,
        method: row.checkInMethod,
        geofence: row.checkInGeofence,
        outOfZoneReason: row.checkInOutOfZoneReason ?? null,
        time: new Date(row.checkInTime).toLocaleString('en-IN'),
      })
    } finally {
      setSelfieLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 8) return
    setResetSaving(true)
    setResetError(null)
    try {
      await tdApi.users.update(guardId, { password: newPassword })
      setResetDone(true)
      setNewPassword('')
      setTimeout(() => { setShowResetPw(false); setResetDone(false) }, 1500)
    } catch (e: any) {
      setResetError(e.message ?? 'Failed to update password')
    } finally {
      setResetSaving(false)
    }
  }

  function exportCsv() {
    if (!data || !data.rows.length) return
    const headers = ['Date', 'Site', 'Check-In', 'Scheduled Start', 'On Time', 'Check-Out', 'Scheduled End', 'Hours', 'Method', 'Geofence', 'Out-of-Zone Reason']
    const csvRows = data.rows.map((r: any) => [
      r.date,
      `"${r.siteName}"`,
      r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
      r.scheduledStart ? new Date(r.scheduledStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
      r.checkInOnTime === null ? '' : r.checkInOnTime ? 'Yes' : 'No',
      r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
      r.scheduledEnd ? new Date(r.scheduledEnd).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
      r.hoursWorked ?? '',
      r.checkInMethod,
      r.checkInGeofence === null ? '' : r.checkInGeofence ? 'Within' : 'Outside',
      r.checkInOutOfZoneReason ? `"${String(r.checkInOutOfZoneReason).replace(/"/g, '""')}"` : '',
    ])
    const csv = [headers, ...csvRows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.guard.name.replace(/\s+/g, '_')}_logsheet_${since}_to_${until}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const guard = data?.guard
  const rows = data?.rows ?? []
  const summary = data?.summary

  const roleColors = guard ? (ROLE_BADGE[guard.role] ?? { color: '#5c5855', bg: 'rgba(163,160,152,0.12)' }) : null

  return (
    <PageShell>
      <Main>
        <PageHeader
          title={guard?.name ?? 'Loading…'}
          subtitle="Attendance logsheet"
          action={
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="secondary" onClick={() => { setShowResetPw(true); setResetError(null); setNewPassword(''); setResetDone(false) }}>
                Reset Password
              </Btn>
              <Btn variant="secondary" onClick={() => router.push('/guards')}>← Back</Btn>
            </div>
          }
        />

        {/* Profile strip */}
        {guard && (
          <Card style={{ marginBottom: 28, padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            {guard.profilePhotoUrl ? (
              <img
                src={guard.profilePhotoUrl}
                alt={guard.name}
                style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  objectFit: 'cover',
                  background: 'var(--surface-2)',
                }}
              />
            ) : (
              <div style={{
                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                background: roleColors?.bg ?? 'var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700, color: roleColors?.color ?? 'var(--text-2)',
              }}>
                {guard.name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16 }}>{guard.name}</span>
                <Badge label={ROLE_DISPLAY[guard.role] ?? guard.role} color={roleColors!.color} bg={roleColors!.bg} />
              </div>
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{guard.email}</div>
              {guard.phone && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{guard.phone}</div>}
            </div>
            <ProfileStat label="Last login" value={guard.lastLoginAt ? fmtDate(guard.lastLoginAt) : 'Never'} />
          </Card>
        )}

        {/* Date range + summary */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>From</div>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              style={{ padding: '7px 11px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)', outline: 'none', fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>To</div>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              style={{ padding: '7px 11px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)', outline: 'none', fontFamily: 'inherit' }}
            />
          </div>
          <Btn variant="primary" onClick={load} loading={loading} disabled={loading}>Apply</Btn>
          {rows.length > 0 && (
            <Btn variant="secondary" onClick={exportCsv}>Export CSV</Btn>
          )}
        </div>

        {/* Summary stats */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 28 }}>
            <StatCard label="Total Hours" value={`${summary.totalHours}h`} color="#c96442" />
            <StatCard label="Shifts Worked" value={summary.completedShifts} color="#3b82f6" />
            <StatCard
              label="Attendance Rate"
              value={summary.totalShifts > 0 ? `${Math.round((summary.completedShifts / summary.totalShifts) * 100)}%` : '—'}
              color="#10b981"
            />
            <StatCard label="On Time" value={`${summary.onTimeCheckIns}`} color="#10b981" />
            <StatCard label="Late Check-ins" value={`${summary.lateCheckIns}`} color={summary.lateCheckIns > 0 ? '#f59e0b' : '#9a9490'} />
          </div>
        )}

        {/* Logsheet table */}
        <Card overflow="hidden">
          <CardHeader title="Attendance Log" />
          <DataTable
            cols={['Date', 'Site', 'Check-In', 'Check-Out', 'Hours', 'Method', 'Geofence', 'Selfie']}
            loading={loading && !data}
            empty="No attendance records in this period."
            colSpan={8}
          >
            {rows.map((row) => (
              <TR key={row.checkInId}>
                <TD style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                  {fmtDate(row.checkInTime)}
                </TD>
                <TD style={{ fontWeight: 500 }}>{row.siteName}</TD>
                <TD>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 500 }}>{fmt(row.checkInTime)}</span>
                    {row.checkInOnTime !== null && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, display: 'inline-block', width: 'fit-content',
                        color: row.checkInOnTime ? '#10b981' : '#f59e0b',
                        background: row.checkInOnTime ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                      }}>
                        {row.checkInOnTime ? 'On time' : 'Late'}
                      </span>
                    )}
                    {row.scheduledStart && (
                      <span style={{ color: 'var(--text-3)', fontSize: 11 }}>sched. {fmt(row.scheduledStart)}</span>
                    )}
                  </div>
                </TD>
                <TD>
                  {row.checkOutTime ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 500 }}>{fmt(row.checkOutTime)}</span>
                      {row.checkOutOnTime !== null && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, display: 'inline-block', width: 'fit-content',
                          color: row.checkOutOnTime ? '#10b981' : '#f59e0b',
                          background: row.checkOutOnTime ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                        }}>
                          {row.checkOutOnTime ? 'On time' : 'Early'}
                        </span>
                      )}
                      {row.scheduledEnd && (
                        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>sched. {fmt(row.scheduledEnd)}</span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Not checked out</span>
                  )}
                </TD>
                <TD>
                  {row.hoursWorked !== null
                    ? <span style={{ fontWeight: 600, color: 'var(--text)' }}>{row.hoursWorked}h</span>
                    : <span style={{ color: 'var(--text-3)' }}>—</span>
                  }
                </TD>
                <TD muted style={{ textTransform: 'capitalize' }}>{row.checkInMethod}</TD>
                <TD>
                  {row.checkInGeofence === null ? (
                    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>—</span>
                  ) : row.checkInGeofence ? (
                    <span style={{ color: '#10b981', fontSize: 13, fontWeight: 500 }}>Within</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
                      <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 500 }}>Outside</span>
                      {row.checkInOutOfZoneReason && (
                        <span
                          title={row.checkInOutOfZoneReason}
                          style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.35, whiteSpace: 'normal' }}
                        >
                          “{row.checkInOutOfZoneReason}”
                        </span>
                      )}
                    </div>
                  )}
                </TD>
                <TD>
                  {row.checkInSelfieUrl ? (
                    <button
                      onClick={() => openSelfie(row)}
                      disabled={selfieLoading}
                      style={{
                        padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border)',
                        background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12.5,
                        fontWeight: 500, cursor: 'pointer', transition: 'border-color 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      View
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>—</span>
                  )}
                </TD>
              </TR>
            ))}
          </DataTable>
        </Card>

        {/* Reset password modal */}
        <Modal open={showResetPw} onClose={() => setShowResetPw(false)} title={`Reset Password — ${guard?.name ?? ''}`} width={400}>
          {resetDone ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#10b981', fontWeight: 600 }}>
              Password updated successfully.
            </div>
          ) : (
            <>
              <Field label="New Password">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  autoFocus
                />
              </Field>
              <ErrorMsg msg={resetError} />
              <ModalActions>
                <Btn variant="secondary" onClick={() => setShowResetPw(false)}>Cancel</Btn>
                <Btn
                  variant="primary"
                  onClick={handleResetPassword}
                  loading={resetSaving}
                  disabled={newPassword.length < 8}
                >
                  Save Password
                </Btn>
              </ModalActions>
            </>
          )}
        </Modal>

        {/* Selfie modal */}
        <Modal open={!!selfie} onClose={() => setSelfie(null)} title="Check-In Selfie" width={520}>
          {selfie && (
            <div>
              <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 18, background: 'var(--surface-2)', minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={selfie.url}
                  alt="Check-in selfie"
                  style={{ width: '100%', maxHeight: 380, objectFit: 'cover', display: 'block' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <SelfieDetail label="Time" value={selfie.time} />
                <SelfieDetail label="Method" value={selfie.method} capitalize />
                <SelfieDetail label="Geofence" value={selfie.geofence === null ? 'Unknown' : selfie.geofence ? 'Within' : 'Outside'} />
                {selfie.reviewStatus && (
                  <div>
                    <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Review</div>
                    {(() => {
                      const rb = REVIEW_BADGE[selfie.reviewStatus] ?? { label: selfie.reviewStatus, color: '#9a9490', bg: 'rgba(163,160,152,0.12)' }
                      return <Badge label={rb.label} color={rb.color} bg={rb.bg} />
                    })()}
                  </div>
                )}
              </div>
              {selfie.outOfZoneReason && (
                <div style={{
                  marginTop: 16,
                  padding: '10px 14px',
                  background: 'rgba(245,158,11,0.08)',
                  borderLeft: '3px solid #f59e0b',
                  borderRadius: 6,
                }}>
                  <div style={{ color: '#b45309', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Out-of-zone reason
                  </div>
                  <div style={{ color: 'var(--text)', fontSize: 13.5, lineHeight: 1.5 }}>
                    {selfie.outOfZoneReason}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      </Main>
    </PageShell>
  )
}

function ProfileStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ color: accent ? '#10b981' : 'var(--text)', fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Card style={{ padding: '16px 20px' }}>
      <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
    </Card>
  )
}

function SelfieDetail({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 90 }}>
      <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 500, textTransform: capitalize ? 'capitalize' : undefined }}>{value}</div>
    </div>
  )
}
