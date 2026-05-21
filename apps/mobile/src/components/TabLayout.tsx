import React, { useState, useEffect, useRef } from 'react'
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonPage,
  IonContent,
} from '@ionic/react'
import { Route, Redirect, Link, useLocation } from 'react-router-dom'
import {
  homeOutline,
  cameraOutline,
  walkOutline,
  warningOutline,
  calendarOutline,
  personOutline,
  mapOutline,
  checkmarkCircleOutline,
  bookOutline,
} from 'ionicons/icons'
import { DashboardPage } from '../pages/DashboardPage'
import { CheckInPage } from '../pages/CheckInPage'
import { PatrolPage } from '../pages/PatrolPage'
import { IncidentPage } from '../pages/IncidentPage'
import { ShiftsPage } from '../pages/ShiftsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { GuidePage } from '../pages/GuidePage'
import { useAuthStore } from '../store/auth'
import { LeaveRequestPage } from '../pages/LeaveRequestPage'
import { api } from '../services/api'

// Cast react-router-dom v5 components to work around @types/react 18 incompatibility
const R = Route as React.ComponentType<any>
const Redir = Redirect as React.ComponentType<any>

/* ─── Missing-from-shift insight (supervisor + admin) ─────────────────────── */
//
// Pulls /guard-status/missing — guards whose shift window is open right now
// but who haven't checked in. Supervisor scope is automatic on the backend
// (their assigned sites only). Admin scope is everything in the tenant.
// Tap the card to open the detail sheet.

type MissingRow = {
  shiftId: string
  guardId: string
  guardName: string
  guardUsername: string
  siteId: string
  siteName: string
  shiftStatus: string
  shiftStartsAt: string
  shiftEndsAt: string
  minutesLate: number
  supervisor: { id: string; name: string; username: string } | null
}

function useMissingShifts(): { rows: MissingRow[]; loading: boolean; reload: () => void } {
  const [rows, setRows] = useState<MissingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${BASE_URL}/guard-status/missing`, {
      headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
    })
      .then(r => r.json())
      .then(d => { if (!cancelled) setRows(d.data ?? []) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick])

  return { rows, loading, reload: () => setTick(x => x + 1) }
}

function fmtLate(min: number): string {
  if (min < 60) return `${min}m late`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h late` : `${h}h ${m}m late`
}

function MissingShiftCard({
  rows, loading, showSupervisor, onTap,
}: {
  rows: MissingRow[]
  loading: boolean
  showSupervisor: boolean
  onTap: () => void
}) {
  const count = rows.length
  const empty = !loading && count === 0
  const accent = count === 0 ? '#10b981' : count <= 2 ? '#f59e0b' : '#ef4444'
  const bg    = count === 0 ? 'rgba(16,185,129,0.06)' : count <= 2 ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)'
  const borderC = count === 0 ? 'rgba(16,185,129,0.25)' : count <= 2 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.35)'

  return (
    <button
      onClick={empty ? undefined : onTap}
      disabled={empty}
      style={{
        all: 'unset',
        display: 'block', width: '100%', boxSizing: 'border-box',
        background: bg,
        border: `1px solid ${borderC}`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: empty ? 'default' : 'pointer',
        textAlign: 'left',
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ffffff', fontWeight: 700, fontSize: 16,
          }}>{loading ? '·' : count}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916', letterSpacing: '-0.01em' }}>
              {showSupervisor ? 'Guards missing from shift' : 'My guards missing from shift'}
            </div>
            <div style={{ fontSize: 12, color: '#5c5855', marginTop: 1 }}>
              {loading ? 'Checking…' : count === 0 ? 'Everyone scheduled right now is checked in' : 'Shift window is open but they haven’t checked in. Tap to see details.'}
            </div>
          </div>
        </div>
        {!empty && !loading && <span style={{ color: accent, fontSize: 18, fontWeight: 600 }}>›</span>}
      </div>
    </button>
  )
}

function MissingShiftModal({
  rows, showSupervisor, onClose,
}: {
  rows: MissingRow[]
  showSupervisor: boolean
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 9000,
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff',
          width: '100%',
          maxHeight: '82vh',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.22s ease-out',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
          <div style={{ width: 38, height: 4, borderRadius: 3, background: '#dcd8d2' }} />
        </div>
        <div style={{ padding: '12px 18px 8px', borderBottom: '1px solid #e8e5e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1916' }}>Missing from shift</div>
            <div style={{ fontSize: 12, color: '#9a9490', marginTop: 1 }}>{rows.length} {rows.length === 1 ? 'guard' : 'guards'} · shift open, not checked in</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#5c5855', fontSize: 22, cursor: 'pointer', padding: 4 }}
            aria-label="Close"
          >✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0 18px' }}>
          {rows.length === 0 ? (
            <div style={{ padding: '24px 18px', color: '#9a9490', fontSize: 13, textAlign: 'center' }}>No missing guards right now.</div>
          ) : rows.map(r => (
            <div key={r.shiftId} style={{ padding: '12px 18px', borderBottom: '1px solid #f5f4f2' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#1a1916' }}>{r.guardName}</div>
                  <div style={{ fontSize: 12, color: '#5c5855', marginTop: 2 }}>{r.siteName}</div>
                  {showSupervisor && (
                    <div style={{ fontSize: 11.5, color: '#9a9490', marginTop: 4 }}>
                      Supervisor: <span style={{ color: '#5c5855', fontWeight: 500 }}>{r.supervisor?.name ?? '— unassigned'}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#9a9490', marginTop: 4 }}>
                    Scheduled {new Date(r.shiftStartsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(r.shiftEndsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: r.minutesLate > 120 ? '#fee2e2' : '#fef3c7',
                  color: r.minutesLate > 120 ? '#b91c1c' : '#92400e',
                  padding: '3px 8px', borderRadius: 12,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>{fmtLate(r.minutesLate)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ─── Pending leave + high-severity incident triage (Home cards) ──────────── */
//
// Two more "glance + one-tap action" cards for the admin / supervisor Home
// pages, designed so an away-from-desk admin can clear common review work
// without ever opening the laptop. Both follow the same shape as
// MissingShiftCard above — coloured pill on the left, count + label + a
// bottom-sheet on tap with quick action buttons inline.

function fmtRelativeDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function useGenericList<T = any>(
  fetcher: () => Promise<{ data: T[] }>,
  deps: any[] = [],
): { rows: T[]; loading: boolean; reload: () => void } {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher()
      .then(r => { if (!cancelled) setRows(r.data ?? []) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { rows, loading, reload: () => setTick(x => x + 1) }
}

/* Sites under my supervision ----------------------------------------------- */
//
// One card per site the caller can see (supervisor → their assigned sites;
// admin → every site). 6 metrics: total guards, on shift, missing,
// weekly attendance %, weekly tardiness %, weekly incidents.
//
// Tap behaviour intentionally not wired yet — when we have a /sites/:id
// drill-down on mobile we'll hook the card into it.

function pctTone(v: number | null, kind: 'attendance' | 'tardy'): string {
  if (v === null) return '#9a9490'
  if (kind === 'attendance') return v >= 90 ? '#065f46' : v >= 75 ? '#92400e' : '#b91c1c'
  // tardiness — lower is better
  return v <= 5 ? '#065f46' : v <= 15 ? '#92400e' : '#b91c1c'
}

function SiteSupervisionCard({ s }: { s: any }) {
  const attendance = s.weeklyAttendancePct
  const tardy = s.weeklyTardinessPct
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12,
      padding: '12px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.siteName}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#5c5855', marginBottom: 10 }}>
        <strong style={{ color: '#1a1916' }}>{s.totalGuards}</strong> guards
        {' · '}<strong style={{ color: s.onShift > 0 ? '#065f46' : '#9a9490' }}>{s.onShift}</strong> on shift
        {s.missing > 0 && <> {' · '}<strong style={{ color: '#b91c1c' }}>{s.missing}</strong> missing</>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, paddingTop: 10, borderTop: '1px solid #f0ede8' }}>
        <Metric label="Attendance" value={attendance === null ? '—' : `${attendance}%`} color={pctTone(attendance, 'attendance')} />
        <Metric label="Tardy"      value={tardy      === null ? '—' : `${tardy}%`}      color={pctTone(tardy,      'tardy')} />
        <Metric label="Incidents"  value={String(s.weeklyIncidents)} color={s.weeklyIncidents > 0 ? '#b91c1c' : '#5c5855'} />
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#9a9490', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function SitesUnderSupervision({ title }: { title: string }) {
  const { rows, loading } = useGenericList(() => api.sites.listStats())
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12,
      overflow: 'hidden', marginBottom: 14,
    }}>
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid #e8e5e0',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916' }}>{title}</div>
          <div style={{ fontSize: 11, color: '#9a9490', marginTop: 1 }}>Past 7 days. Tap a site for the live map.</div>
        </div>
        <span style={{ fontSize: 12, color: '#9a9490' }}>
          {loading ? '…' : `${rows.length} site${rows.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div style={{ padding: '10px 10px 4px' }}>
        {loading ? (
          <div style={{ padding: '12px 4px', color: '#9a9490', fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '12px 4px', color: '#9a9490', fontSize: 13 }}>No sites yet.</div>
        ) : (
          rows.map((s: any) => <SiteSupervisionCard key={s.siteId} s={s} />)
        )}
      </div>
    </div>
  )
}

/* Pending leave card -------------------------------------------------------- */

function PendingLeaveCard({
  count, loading, onTap,
}: { count: number; loading: boolean; onTap: () => void }) {
  const empty = !loading && count === 0
  const accent = count === 0 ? '#10b981' : '#f59e0b'
  const bg     = count === 0 ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.08)'
  const border = count === 0 ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.3)'
  return (
    <button
      onClick={empty ? undefined : onTap}
      disabled={empty}
      style={{
        all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
        background: bg, border: `1px solid ${border}`, borderRadius: 12,
        padding: '14px 16px', cursor: empty ? 'default' : 'pointer',
        textAlign: 'left', marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ffffff', fontWeight: 700, fontSize: 16,
          }}>{loading ? '·' : count}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916', letterSpacing: '-0.01em' }}>
              Pending leave requests
            </div>
            <div style={{ fontSize: 12, color: '#5c5855', marginTop: 1 }}>
              {loading ? 'Checking…' : count === 0 ? 'Nothing waiting for your review' : 'Tap to approve or reject inline.'}
            </div>
          </div>
        </div>
        {!empty && !loading && <span style={{ color: accent, fontSize: 18, fontWeight: 600 }}>›</span>}
      </div>
    </button>
  )
}

function PendingLeaveModal({
  rows, onClose, onActed,
}: { rows: any[]; onClose: () => void; onActed: () => void }) {
  const [acting, setActing] = useState<string | null>(null)
  async function act(id: string, status: 'approved' | 'rejected') {
    setActing(id)
    try { await api.leaveRequests.review(id, { status }); onActed() }
    catch { /* swallow — toast surfaces on the dashboard if needed */ }
    finally { setActing(null) }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#ffffff', width: '100%', maxHeight: '82vh',
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingBottom: 'env(safe-area-inset-bottom)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.22s ease-out',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
          <div style={{ width: 38, height: 4, borderRadius: 3, background: '#dcd8d2' }} />
        </div>
        <div style={{ padding: '12px 18px 8px', borderBottom: '1px solid #e8e5e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1916' }}>Pending leave</div>
            <div style={{ fontSize: 12, color: '#9a9490', marginTop: 1 }}>{rows.length} waiting for review</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5c5855', fontSize: 22, cursor: 'pointer', padding: 4 }} aria-label="Close">✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0 18px' }}>
          {rows.length === 0 ? (
            <div style={{ padding: '24px 18px', color: '#9a9490', fontSize: 13, textAlign: 'center' }}>Nothing pending.</div>
          ) : rows.map(r => (
            <div key={r.id} style={{ padding: '12px 18px', borderBottom: '1px solid #f5f4f2' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1916' }}>{r.guardName ?? r.guardUsername ?? 'Guard'}</div>
                <div style={{ fontSize: 11.5, color: '#9a9490' }}>{r.leaveType ?? 'leave'}</div>
              </div>
              <div style={{ fontSize: 12.5, color: '#5c5855', marginTop: 4 }}>
                {fmtRelativeDate(r.startDate)} – {fmtRelativeDate(r.endDate)}
              </div>
              {r.reason && (
                <div style={{ fontSize: 12, color: '#9a9490', marginTop: 4, lineHeight: 1.4 }}>{r.reason}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => act(r.id, 'approved')}
                  disabled={acting === r.id}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                    background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 13,
                    opacity: acting === r.id ? 0.6 : 1, cursor: 'pointer',
                  }}
                >Approve</button>
                <button
                  onClick={() => act(r.id, 'rejected')}
                  disabled={acting === r.id}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 8,
                    border: '1.5px solid #ef4444', background: 'transparent',
                    color: '#ef4444', fontWeight: 600, fontSize: 13,
                    opacity: acting === r.id ? 0.6 : 1, cursor: 'pointer',
                  }}
                >Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* High-severity incidents card --------------------------------------------- */

function HighSeverityCard({
  count, loading, onTap,
}: { count: number; loading: boolean; onTap: () => void }) {
  const empty = !loading && count === 0
  const accent = count === 0 ? '#10b981' : '#ef4444'
  const bg     = count === 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)'
  const border = count === 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.35)'
  return (
    <button
      onClick={empty ? undefined : onTap}
      disabled={empty}
      style={{
        all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
        background: bg, border: `1px solid ${border}`, borderRadius: 12,
        padding: '14px 16px', cursor: empty ? 'default' : 'pointer',
        textAlign: 'left', marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ffffff', fontWeight: 700, fontSize: 16,
          }}>{loading ? '·' : count}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916', letterSpacing: '-0.01em' }}>
              High-priority incidents
            </div>
            <div style={{ fontSize: 12, color: '#5c5855', marginTop: 1 }}>
              {loading ? 'Checking…' : count === 0 ? 'Nothing critical open right now' : 'Critical / high open. Tap to triage.'}
            </div>
          </div>
        </div>
        {!empty && !loading && <span style={{ color: accent, fontSize: 18, fontWeight: 600 }}>›</span>}
      </div>
    </button>
  )
}

function IncidentTriageModal({
  rows, onClose, onActed,
}: { rows: any[]; onClose: () => void; onActed: () => void }) {
  const [acting, setActing] = useState<string | null>(null)
  async function act(id: string, status: 'acknowledged' | 'resolved') {
    setActing(id)
    try { await api.incidents.updateStatus(id, status); onActed() }
    catch { /* ignore */ }
    finally { setActing(null) }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#ffffff', width: '100%', maxHeight: '82vh',
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingBottom: 'env(safe-area-inset-bottom)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.22s ease-out',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
          <div style={{ width: 38, height: 4, borderRadius: 3, background: '#dcd8d2' }} />
        </div>
        <div style={{ padding: '12px 18px 8px', borderBottom: '1px solid #e8e5e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1916' }}>High-priority incidents</div>
            <div style={{ fontSize: 12, color: '#9a9490', marginTop: 1 }}>{rows.length} open · acknowledge or resolve inline</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5c5855', fontSize: 22, cursor: 'pointer', padding: 4 }} aria-label="Close">✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0 18px' }}>
          {rows.length === 0 ? (
            <div style={{ padding: '24px 18px', color: '#9a9490', fontSize: 13, textAlign: 'center' }}>Nothing open.</div>
          ) : rows.map(r => {
            const sev = r.severity ?? 'medium'
            const sevColor = sev === 'critical' ? '#b91c1c' : '#ea580c'
            return (
              <div key={r.id} style={{ padding: '12px 18px', borderBottom: '1px solid #f5f4f2' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1916', flex: 1, minWidth: 0 }}>{r.title}</div>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700,
                    background: sev === 'critical' ? '#fee2e2' : '#ffedd5',
                    color: sevColor,
                    padding: '2px 7px', borderRadius: 10,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{sev}</span>
                </div>
                {r.description && (
                  <div style={{ fontSize: 12, color: '#5c5855', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{r.description}</div>
                )}
                <div style={{ fontSize: 11, color: '#9a9490', marginTop: 4 }}>
                  {new Date(r.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {r.status && r.status !== 'open' && <> · <span style={{ color: '#5c5855', fontWeight: 500 }}>{r.status}</span></>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {r.status === 'open' && (
                    <button
                      onClick={() => act(r.id, 'acknowledged')}
                      disabled={acting === r.id}
                      style={{
                        flex: 1, padding: '9px 0', borderRadius: 8,
                        border: '1.5px solid #f59e0b', background: 'transparent',
                        color: '#92400e', fontWeight: 600, fontSize: 13,
                        opacity: acting === r.id ? 0.6 : 1, cursor: 'pointer',
                      }}
                    >Acknowledge</button>
                  )}
                  <button
                    onClick={() => act(r.id, 'resolved')}
                    disabled={acting === r.id}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                      background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 13,
                      opacity: acting === r.id ? 0.6 : 1, cursor: 'pointer',
                    }}
                  >Resolve</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const SupervisorDashboard: React.FC = () => {
  const { user, logout } = useAuthStore()
  const [guardStatus, setGuardStatus] = useState<any[]>([])
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { rows: missing, loading: missingLoading } = useMissingShifts()
  const [showMissing, setShowMissing] = useState(false)
  // Mobile-triage cards: pending leave + high-severity incidents.
  // The hook deps array is empty by design — each card refreshes itself on
  // action via the modal's onActed callback so the dashboard doesn't need
  // its own visibility-change wiring.
  const { rows: pendingLeave, loading: leaveLoading, reload: reloadLeave } =
    useGenericList(() => api.leaveRequests.list().then((r: any) => ({ data: (r.data ?? []).filter((x: any) => x.status === 'pending') })))
  const { rows: highSev, loading: highSevLoading, reload: reloadHighSev } =
    useGenericList(() => api.incidents.list({ status: 'open' }).then((r: any) => ({ data: (r.data ?? []).filter((x: any) => x.severity === 'critical' || x.severity === 'high') })))
  const [showLeave, setShowLeave] = useState(false)
  const [showHighSev, setShowHighSev] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_URL}/guard-status`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${BASE_URL}/incidents?status=open&limit=5`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      }).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([gs, inc]) => {
      setGuardStatus(gs.data ?? [])
      setIncidents(inc.data ?? [])
    }).finally(() => setLoading(false))
  }, [])

  const onShift = guardStatus.length
  const online = guardStatus.filter((g: any) => g.isOnline).length

  const statBoxStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 12,
    padding: '14px 16px',
    flex: 1,
    border: '1px solid #e8e5e0',
  }

  return (
    <IonPage>
      <IonContent style={{ '--background': '#fafaf9' }}>
      <div style={{ background: '#fafaf9', color: '#1a1916' }}>
      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e8e5e0', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Arrow Security</div>
          <div style={{ color: '#9a9490', fontSize: 12 }}>Good {getTimeOfDay()}, {user?.name?.split(' ')[0]}</div>
        </div>
        <button
          onClick={() => { logout(); window.location.replace('/login') }}
          style={{ background: 'none', border: 'none', color: '#9a9490', cursor: 'pointer', padding: 4 }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: 16 }}>
        <MissingShiftCard rows={missing} loading={missingLoading} showSupervisor={false} onTap={() => setShowMissing(true)} />
        <HighSeverityCard count={highSev.length} loading={highSevLoading} onTap={() => setShowHighSev(true)} />
        <PendingLeaveCard count={pendingLeave.length} loading={leaveLoading} onTap={() => setShowLeave(true)} />
        <SitesUnderSupervision title="Sites under my supervision" />
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={statBoxStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#c96442' }}>{loading ? '—' : onShift}</div>
            <div style={{ fontSize: 11, color: '#9a9490', marginTop: 2 }}>On Shift</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{loading ? '—' : online}</div>
            <div style={{ fontSize: 11, color: '#9a9490', marginTop: 2 }}>Online</div>
          </div>
        </div>

        {/* Guard list */}
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e8e5e0', marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e8e5e0', fontWeight: 600, fontSize: 14 }}>Guards on Shift</div>
          {loading ? (
            <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>Loading…</div>
          ) : guardStatus.length === 0 ? (
            <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>No guards currently on shift</div>
          ) : (
            guardStatus.slice(0, 6).map((g: any) => (
              <div key={g.guardId} style={{ padding: '10px 14px', borderBottom: '1px solid #f5f4f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{g.guardName}</div>
                  <div style={{ color: '#9a9490', fontSize: 11 }}>{g.siteName}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: g.isOnline ? '#d1fae5' : '#f5f4f2',
                  color: g.isOnline ? '#065f46' : '#9a9490',
                }}>
                  {g.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Recent open incidents */}
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e8e5e0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e8e5e0', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Open Incidents</span>
            {incidents.length > 0 && (
              <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }}>{incidents.length}</span>
            )}
          </div>
          {loading ? (
            <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>Loading…</div>
          ) : incidents.length === 0 ? (
            <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>No open incidents</div>
          ) : (
            incidents.map((inc: any) => (
              <div key={inc.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f5f4f2' }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{inc.title}</div>
                <div style={{ color: '#9a9490', fontSize: 11, marginTop: 2 }}>
                  {inc.severity?.toUpperCase()} · {new Date(inc.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
      </IonContent>
      {showMissing && (
        <MissingShiftModal rows={missing} showSupervisor={false} onClose={() => setShowMissing(false)} />
      )}
      {showLeave && (
        <PendingLeaveModal rows={pendingLeave} onClose={() => setShowLeave(false)} onActed={reloadLeave} />
      )}
      {showHighSev && (
        <IncidentTriageModal rows={highSev} onClose={() => setShowHighSev(false)} onActed={reloadHighSev} />
      )}
    </IonPage>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

/* ─── Live Guard Map ─────────────────────────────────────────────────────── */

const BASE_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:4000/api'

const GUARD_COLOURS = [
  '#c96442', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#d97706', '#a3a098', '#059669', '#1d6fa4', '#7a7773',
]

interface GuardPin {
  id: string
  name: string
  lat: number
  lng: number
  ts: string
  colour: string
}

const SupervisorMapPage: React.FC = () => {
  const { token } = useAuthStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const labelsRef = useRef<Map<string, any>>(new Map())
  const colourMapRef = useRef<Map<string, string>>(new Map())
  const colourIdxRef = useRef(0)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const bufferRef = useRef('')
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(true)

  const [guards, setGuards] = useState<Map<string, GuardPin>>(new Map())
  const [selectedGuardId, setSelectedGuardId] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [sseError, setSseError] = useState(false)

  // Stable colour per guard
  function getColour(guardId: string): string {
    if (!colourMapRef.current.has(guardId)) {
      colourMapRef.current.set(guardId, GUARD_COLOURS[colourIdxRef.current % GUARD_COLOURS.length])
      colourIdxRef.current++
    }
    return colourMapRef.current.get(guardId)!
  }

  // Place or update a marker + name label on the map
  function upsertMarker(guardId: string, guardName: string, lat: number, lng: number, colour: string) {
    if (!mapRef.current) return
    import('maplibre-gl').then(({ default: maplibregl }) => {
      const map = mapRef.current
      if (!map) return

      const existing = markersRef.current.get(guardId)
      if (existing) {
        existing.setLngLat([lng, lat])
        const labelEl = labelsRef.current.get(guardId)
        if (labelEl) labelEl.setLngLat([lng, lat])
      } else {
        // Dot marker
        const dotEl = document.createElement('div')
        dotEl.style.cssText = [
          'width:14px;height:14px;border-radius:50%;',
          `background:${colour};`,
          'border:2.5px solid #eeece8;',
          'box-shadow:0 0 0 3px rgba(0,0,0,0.35),0 2px 6px rgba(0,0,0,0.5);',
          'cursor:pointer;flex-shrink:0;',
        ].join('')
        dotEl.addEventListener('click', () => setSelectedGuardId(guardId))

        const dotMarker = new maplibregl.Marker({ element: dotEl })
          .setLngLat([lng, lat])
          .addTo(map)
        markersRef.current.set(guardId, dotMarker)

        // Name label above dot
        const labelEl2 = document.createElement('div')
        labelEl2.style.cssText = [
          'pointer-events:none;',
          'background:rgba(43,42,39,0.88);',
          'border:1px solid #4a4845;',
          'border-radius:4px;',
          'padding:2px 6px;',
          'font-size:11px;font-weight:600;',
          `color:${colour};`,
          'white-space:nowrap;',
          'transform:translate(-50%,-28px);',
          'box-shadow:0 1px 4px rgba(0,0,0,0.4);',
        ].join('')
        labelEl2.textContent = guardName || guardId.slice(0, 6)

        const labelMarker = new maplibregl.Marker({ element: labelEl2, offset: [0, 0] })
          .setLngLat([lng, lat])
          .addTo(map)
        labelsRef.current.set(guardId, labelMarker)
      }
    })
  }

  function handleLocationEvent(evt: {
    guardId: string
    guardName?: string
    latitude: number
    longitude: number
    accuracy?: number
  }) {
    const colour = getColour(evt.guardId)
    const guardName = evt.guardName ?? evt.guardId.slice(0, 8)
    const ts = new Date().toISOString()

    setGuards(prev => {
      const next = new Map(prev)
      next.set(evt.guardId, { id: evt.guardId, name: guardName, lat: evt.latitude, lng: evt.longitude, ts, colour })
      return next
    })

    if (mapReady) {
      upsertMarker(evt.guardId, guardName, evt.latitude, evt.longitude, colour)
    }
  }

  // Init MapLibre
  useEffect(() => {
    let map: any
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (!containerRef.current || mapRef.current) return
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [78.9629, 20.5937],
        zoom: 4,
      })
      mapRef.current = map
      map.on('load', () => setMapReady(true))
    })
    return () => {
      map?.remove()
      mapRef.current = null
    }
  }, [])

  // When map becomes ready, replay any already-received guard positions
  useEffect(() => {
    if (!mapReady) return
    guards.forEach(g => upsertMarker(g.id, g.name, g.lat, g.lng, g.colour))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady])

  // SSE connection
  useEffect(() => {
    if (!token) return
    activeRef.current = true

    async function stream() {
      setSseError(false)
      try {
        const res = await fetch(`${BASE_URL}/locations/live`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

        const reader = res.body.getReader()
        readerRef.current = reader
        const decoder = new TextDecoder()

        while (activeRef.current) {
          const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined as any }))
          if (done) break
          bufferRef.current += decoder.decode(value, { stream: true })
          const lines = bufferRef.current.split('\n')
          bufferRef.current = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === 'location') handleLocationEvent(evt)
            } catch { /* ignore malformed */ }
          }
        }
      } catch {
        if (!activeRef.current) return
        setSseError(true)
        retryTimerRef.current = setTimeout(() => {
          if (activeRef.current) stream()
        }, 5000)
      }
    }

    stream()

    return () => {
      activeRef.current = false
      readerRef.current?.cancel()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Fly to guard when chip is tapped
  function flyToGuard(guardId: string) {
    const g = guards.get(guardId)
    if (!g || !mapRef.current) return
    setSelectedGuardId(guardId)
    mapRef.current.flyTo({ center: [g.lng, g.lat], zoom: 16, duration: 800 })
  }

  const guardList = Array.from(guards.values())

  return (
    <IonPage>
      <IonContent
        fullscreen
        scrollY={false}
        style={{ '--background': '#1a1916', '--padding-top': '0', '--padding-bottom': '0', '--padding-start': '0', '--padding-end': '0' } as any}
      >
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#1a1916', overflow: 'hidden' }}>
      {/* Map container */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Header bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'rgba(27,25,22,0.88)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #4a4845',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ color: '#eeece8', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Live Guard Map
          </div>
          <div style={{ color: '#7a7773', fontSize: 11, marginTop: 1 }}>
            {guardList.length === 0
              ? 'Waiting for guard locations…'
              : `${guardList.length} guard${guardList.length !== 1 ? 's' : ''} active`}
          </div>
        </div>
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: sseError ? '#ef4444' : '#10b981',
            boxShadow: sseError ? 'none' : '0 0 0 2px rgba(16,185,129,0.3)',
            display: 'inline-block',
            animation: sseError ? 'none' : 'pulse 2s infinite',
          }} />
          <span style={{ color: sseError ? '#ef4444' : '#10b981', fontSize: 11, fontWeight: 600 }}>
            {sseError ? 'Offline' : 'Live'}
          </span>
        </div>
      </div>

      {/* SSE error overlay */}
      {sseError && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          background: '#2b2a27', border: '1px solid #4a4845', borderRadius: 10,
          padding: '16px 20px', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          maxWidth: 260,
        }}>
          <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Connection lost
          </div>
          <div style={{ color: '#7a7773', fontSize: 12 }}>
            Could not connect to live feed. Retrying in 5 seconds…
          </div>
        </div>
      )}

      {/* Guard chips — horizontal scroll at bottom */}
      <div style={{
        position: 'absolute', bottom: 12, left: 0, right: 0, zIndex: 10,
        overflowX: 'auto', overflowY: 'hidden',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 14px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      } as React.CSSProperties}>
        {guardList.length === 0 ? (
          <div style={{
            background: 'rgba(43,42,39,0.88)', backdropFilter: 'blur(6px)',
            border: '1px solid #4a4845', borderRadius: 20,
            padding: '7px 14px', color: '#7a7773', fontSize: 12,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            No guards on map yet
          </div>
        ) : (
          guardList.map(g => (
            <button
              key={g.id}
              onClick={() => flyToGuard(g.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: selectedGuardId === g.id
                  ? `${g.colour}22`
                  : 'rgba(43,42,39,0.88)',
                backdropFilter: 'blur(6px)',
                border: `1.5px solid ${selectedGuardId === g.id ? g.colour : '#4a4845'}`,
                borderRadius: 20,
                padding: '7px 12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.colour, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: '#eeece8', fontSize: 12, fontWeight: 500 }}>{g.name}</span>
              <span style={{ color: '#7a7773', fontSize: 10, marginLeft: 2 }}>
                {new Date(g.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          ))
        )}
      </div>

      {/* CSS pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
      </IonContent>
    </IonPage>
  )
}

const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuthStore()
  const [stats, setStats] = useState<any>(null)
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { rows: missing, loading: missingLoading } = useMissingShifts()
  const [showMissing, setShowMissing] = useState(false)
  const { rows: pendingLeave, loading: leaveLoading, reload: reloadLeave } =
    useGenericList(() => api.leaveRequests.list().then((r: any) => ({ data: (r.data ?? []).filter((x: any) => x.status === 'pending') })))
  const { rows: highSev, loading: highSevLoading, reload: reloadHighSev } =
    useGenericList(() => api.incidents.list({ status: 'open' }).then((r: any) => ({ data: (r.data ?? []).filter((x: any) => x.severity === 'critical' || x.severity === 'high') })))
  const [showLeave, setShowLeave] = useState(false)
  const [showHighSev, setShowHighSev] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_URL}/stats`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      }).then(r => r.json()).catch(() => ({ data: null })),
      fetch(`${BASE_URL}/incidents?status=open&limit=5`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      }).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([s, inc]) => {
      setStats(s.data ?? null)
      setIncidents(inc.data ?? [])
    }).finally(() => setLoading(false))
  }, [])

  const statBoxStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 12,
    padding: '14px 16px',
    border: '1px solid #e8e5e0',
  }

  return (
    <IonPage>
      <IonContent style={{ '--background': '#fafaf9' }}>
        <div style={{ padding: '24px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#1a1916', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
                Good {getTimeOfDay()}, {user?.name?.split(' ')[0] ?? 'admin'}
              </div>
              <div style={{ color: '#9a9490', fontSize: 13, marginTop: 4 }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>
            <button
              onClick={() => { logout(); window.location.replace('/login') }}
              style={{ background: 'none', border: 'none', color: '#9a9490', cursor: 'pointer', padding: 6, fontSize: 18 }}
              aria-label="Sign out"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: '0 20px' }}>
          <MissingShiftCard rows={missing} loading={missingLoading} showSupervisor={true} onTap={() => setShowMissing(true)} />
          <HighSeverityCard count={highSev.length} loading={highSevLoading} onTap={() => setShowHighSev(true)} />
          <PendingLeaveCard count={pendingLeave.length} loading={leaveLoading} onTap={() => setShowLeave(true)} />
          <SitesUnderSupervision title="All sites" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={statBoxStyle}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#c96442' }}>{loading ? '—' : stats?.activeShifts ?? 0}</div>
              <div style={{ fontSize: 12, color: '#9a9490', marginTop: 2 }}>Guards on shift</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ fontSize: 24, fontWeight: 700, color: stats?.openIncidents > 0 ? '#ef4444' : '#10b981' }}>
                {loading ? '—' : stats?.openIncidents ?? 0}
              </div>
              <div style={{ fontSize: 12, color: '#9a9490', marginTop: 2 }}>Open incidents</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1916' }}>{loading ? '—' : stats?.guards ?? 0}</div>
              <div style={{ fontSize: 12, color: '#9a9490', marginTop: 2 }}>Total guards</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1916' }}>{loading ? '—' : stats?.sites ?? 0}</div>
              <div style={{ fontSize: 12, color: '#9a9490', marginTop: 2 }}>Active sites</div>
            </div>
          </div>

          <a
            href="https://arrow-security-tenant.onrender.com"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block', textDecoration: 'none',
              background: 'linear-gradient(135deg, #c96442 0%, #b3572e 100%)',
              color: '#ffffff', borderRadius: 14, padding: '18px 18px',
              marginBottom: 16,
              boxShadow: '0 4px 14px rgba(201,100,66,0.25)',
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>
              Operations Portal
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
              Open full management →
            </div>
            <div style={{ fontSize: 12, opacity: 0.88, marginTop: 4, lineHeight: 1.4 }}>
              Payroll, roster, guard status, sites — everything you need is on the web portal.
            </div>
          </a>

          <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e8e5e0', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #e8e5e0', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Recent incidents</span>
              {incidents.length > 0 && (
                <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }}>{incidents.length}</span>
              )}
            </div>
            {loading ? (
              <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>Loading…</div>
            ) : incidents.length === 0 ? (
              <div style={{ padding: '16px 14px', color: '#9a9490', fontSize: 13 }}>No open incidents</div>
            ) : (
              incidents.map((inc: any) => (
                <div key={inc.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f5f4f2' }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: '#1a1916' }}>{inc.title}</div>
                  <div style={{ color: '#9a9490', fontSize: 11, marginTop: 2 }}>
                    {inc.severity?.toUpperCase()} · {new Date(inc.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </IonContent>
      {showMissing && (
        <MissingShiftModal rows={missing} showSupervisor={true} onClose={() => setShowMissing(false)} />
      )}
      {showLeave && (
        <PendingLeaveModal rows={pendingLeave} onClose={() => setShowLeave(false)} onActed={reloadLeave} />
      )}
      {showHighSev && (
        <IncidentTriageModal rows={highSev} onClose={() => setShowHighSev(false)} onActed={reloadHighSev} />
      )}
    </IonPage>
  )
}

/* ─── Guide Banner (top of every screen except /tabs/guide itself) ─────── */
// Full-width banner inviting users to the user guide. Lives as a normal block
// in TabLayout's flex column (NOT position: fixed) so IonRouterOutlet — which
// uses position: absolute and ignores its parent's padding — naturally sits
// below it. `padding-top: env(safe-area-inset-top)` handles the Android status
// bar without relying on a fragile fixed-offset constant.

function GuideBanner() {
  const location = useLocation()
  const onGuide = location.pathname === '/tabs/guide'
  if (onGuide) return null
  return (
    <div style={{
      flexShrink: 0,
      paddingTop: 'env(safe-area-inset-top)',
      background: 'linear-gradient(135deg, rgba(201,100,66,0.10) 0%, rgba(201,100,66,0.04) 100%)',
      borderBottom: '1px solid rgba(201,100,66,0.18)',
    }}>
      <Link
        to="/tabs/guide"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          height: 56,
          padding: '0 16px',
          textDecoration: 'none',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(201,100,66,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IonIcon icon={bookOutline} style={{ fontSize: 20, color: '#c96442' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916', lineHeight: 1.15 }}>
            How Arrow Security works
          </div>
          <div style={{ fontSize: 11.5, color: '#5c5855', lineHeight: 1.2, marginTop: 2 }}>
            What every role can do — read this first
          </div>
        </div>
        <span style={{ color: '#c96442', fontSize: 18, fontWeight: 600 }}>›</span>
      </Link>
    </div>
  )
}

const LAYOUT_SHELL: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100vh',
}
const LAYOUT_BODY: React.CSSProperties = {
  flex: 1, position: 'relative', minHeight: 0,
}

/* ─── Main Layout ───────────────────────────────────────────────────────── */

export const TabLayout: React.FC = () => {
  const { user } = useAuthStore()

  const role = user?.role
  const isSupervisor = role === 'supervisor'
  const isAdmin = role === 'tenant_admin' || role === 'platform_admin'
  const tabBarStyle = { '--background': '#ffffff', '--border': '1px solid #e8e5e0' } as any

  if (isAdmin) {
    return (
      <div style={LAYOUT_SHELL}>
        <GuideBanner />
        <div style={LAYOUT_BODY}>
          <IonTabs>
            <IonRouterOutlet>
              <R exact path="/tabs/dashboard" component={AdminDashboard} />
              <R exact path="/tabs/map" component={SupervisorMapPage} />
              <R exact path="/tabs/shifts" component={ShiftsPage} />
              <R exact path="/tabs/incidents" component={IncidentPage} />
              <R exact path="/tabs/leave" component={LeaveRequestPage} />
              <R exact path="/tabs/guide" component={GuidePage} />
              <R exact path="/tabs/profile" component={ProfilePage} />
              <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
            </IonRouterOutlet>
            <IonTabBar slot="bottom" style={tabBarStyle}>
              <IonTabButton tab="dashboard" href="/tabs/dashboard">
                <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
              </IonTabButton>
              <IonTabButton tab="map" href="/tabs/map">
                <IonIcon icon={mapOutline} /><IonLabel>Map</IonLabel>
              </IonTabButton>
              <IonTabButton tab="profile" href="/tabs/profile">
                <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
              </IonTabButton>
            </IonTabBar>
          </IonTabs>
        </div>
      </div>
    )
  }

  if (isSupervisor) {
    return (
      <div style={LAYOUT_SHELL}>
        <GuideBanner />
        <div style={LAYOUT_BODY}>
          <IonTabs>
            <IonRouterOutlet>
              <R exact path="/tabs/dashboard" component={SupervisorDashboard} />
              <R exact path="/tabs/checkin" component={CheckInPage} />
              <R exact path="/tabs/patrol" component={PatrolPage} />
              <R exact path="/tabs/map" component={SupervisorMapPage} />
              <R exact path="/tabs/shifts" component={ShiftsPage} />
              <R exact path="/tabs/incidents" component={IncidentPage} />
              <R exact path="/tabs/leave" component={LeaveRequestPage} />
              <R exact path="/tabs/guide" component={GuidePage} />
              <R exact path="/tabs/profile" component={ProfilePage} />
              <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
            </IonRouterOutlet>
            <IonTabBar slot="bottom" style={tabBarStyle}>
              <IonTabButton tab="dashboard" href="/tabs/dashboard">
                <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
              </IonTabButton>
              <IonTabButton tab="checkin" href="/tabs/checkin">
                <IonIcon icon={cameraOutline} /><IonLabel>Check In</IonLabel>
              </IonTabButton>
              <IonTabButton tab="map" href="/tabs/map">
                <IonIcon icon={mapOutline} /><IonLabel>Map</IonLabel>
              </IonTabButton>
              <IonTabButton tab="shifts" href="/tabs/shifts">
                <IonIcon icon={calendarOutline} /><IonLabel>Shifts</IonLabel>
              </IonTabButton>
              <IonTabButton tab="incidents" href="/tabs/incidents">
                <IonIcon icon={warningOutline} /><IonLabel>Reports</IonLabel>
              </IonTabButton>
              <IonTabButton tab="leave" href="/tabs/leave">
                <IonIcon icon={checkmarkCircleOutline} /><IonLabel>Leave</IonLabel>
              </IonTabButton>
              <IonTabButton tab="profile" href="/tabs/profile">
                <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
              </IonTabButton>
            </IonTabBar>
          </IonTabs>
        </div>
      </div>
    )
  }

  // Guard view (default)
  return (
    <div style={LAYOUT_SHELL}>
      <GuideBanner />
      <div style={LAYOUT_BODY}>
        <IonTabs>
          <IonRouterOutlet>
            <R exact path="/tabs/dashboard" component={DashboardPage} />
            <R exact path="/tabs/checkin" component={CheckInPage} />
            <R exact path="/tabs/patrol" component={PatrolPage} />
            <R exact path="/tabs/incidents" component={IncidentPage} />
            <R exact path="/tabs/leave" component={LeaveRequestPage} />
            <R exact path="/tabs/shifts" component={ShiftsPage} />
            <R exact path="/tabs/guide" component={GuidePage} />
            <R exact path="/tabs/profile" component={ProfilePage} />
            <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
          </IonRouterOutlet>
          <IonTabBar slot="bottom" style={tabBarStyle}>
            <IonTabButton tab="dashboard" href="/tabs/dashboard">
              <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
            </IonTabButton>
            <IonTabButton tab="incidents" href="/tabs/incidents">
              <IonIcon icon={warningOutline} /><IonLabel>Incidents</IonLabel>
            </IonTabButton>
            <IonTabButton tab="leave" href="/tabs/leave">
              <IonIcon icon={checkmarkCircleOutline} /><IonLabel>Leave</IonLabel>
            </IonTabButton>
            <IonTabButton tab="profile" href="/tabs/profile">
              <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </div>
    </div>
  )
}
