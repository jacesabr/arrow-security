import React, { useEffect, useState } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { walkOutline } from 'ionicons/icons'
import { IonIcon } from '@ionic/react'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth'

// "Activity" tab — the guard's read-only view of the hours they worked
// this month, broken down by site. Source of truth is /guard-stats/:id
// (which allows self-query for any role).

function monthKeyToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function recentMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date(); d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function fmtHours(seconds: number): string {
  if (seconds < 60) return '0h'
  const h = seconds / 3600
  return h >= 10 ? `${h.toFixed(0)}h` : `${h.toFixed(1)}h`
}

function fmtDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

const MyHoursLog: React.FC<{ userId: string }> = ({ userId }) => {
  const [month, setMonth] = useState<string>(monthKeyToday())
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.guardStats.get(userId, { month })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [userId, month])

  const summary = data?.summary
  const shifts: any[] = data?.shifts ?? []

  // Roll hours up per site for the "by site" view. Shows the guard exactly
  // where their hours came from this month — useful when a guard works
  // multiple sites and wants to check the split.
  const bySite = shifts.reduce<Record<string, { siteName: string; seconds: number; shifts: number }>>((acc, s) => {
    if (!s.checkInAt || !s.checkOutAt) return acc
    const key = s.siteName ?? '—'
    const row = acc[key] ?? { siteName: key, seconds: 0, shifts: 0 }
    row.seconds += s.workedSeconds ?? 0
    row.shifts  += 1
    acc[key] = row
    return acc
  }, {})
  const siteRows = Object.values(bySite).sort((a, b) => b.seconds - a.seconds)
  const totalWorked = summary?.workedSeconds ?? 0

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12, padding: '16px 16px 18px', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916', letterSpacing: '-0.01em' }}>
            Hours this month
          </div>
          <div style={{ fontSize: 11.5, color: '#9a9490', marginTop: 2 }}>
            {monthLabel(month)}
          </div>
        </div>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{
            padding: '6px 9px', borderRadius: 6, border: '1px solid #e8e5e0',
            background: '#fff', fontSize: 12, color: '#1a1916',
          }}
        >
          {recentMonths(12).map(k => (
            <option key={k} value={k}>{monthLabel(k)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ color: '#9a9490', fontSize: 13 }}>Loading…</div>
      ) : !summary ? (
        <div style={{ color: '#9a9490', fontSize: 13 }}>No shifts yet this month.</div>
      ) : (
        <>
          {/* Big total */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid #f0ede8',
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#1a1916', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {fmtHours(totalWorked)}
            </div>
            <div style={{ fontSize: 12, color: '#9a9490' }}>
              worked · {summary.shiftsCompleted} shift{summary.shiftsCompleted === 1 ? '' : 's'}
              {summary.shiftsMissed > 0 && <> · {summary.shiftsMissed} missed</>}
            </div>
          </div>

          {/* By site */}
          {siteRows.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9a9490', marginBottom: 8 }}>
                By site
              </div>
              <div style={{ marginBottom: 16 }}>
                {siteRows.map(s => (
                  <div key={s.siteName} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid #f5f4f2', fontSize: 12.5,
                  }}>
                    <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                      <div style={{ color: '#1a1916', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.siteName}
                      </div>
                      <div style={{ color: '#9a9490', fontSize: 11, marginTop: 1 }}>
                        {s.shifts} shift{s.shifts === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div style={{ color: '#1a1916', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtHours(s.seconds)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Per-shift list */}
          {shifts.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9a9490', marginBottom: 8 }}>
                Shifts ({shifts.length})
              </div>
              {shifts.slice(0, 30).map((s: any) => (
                <div key={s.shiftId} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 0', borderBottom: '1px solid #f5f4f2', fontSize: 11.5,
                }}>
                  <div style={{ minWidth: 52, color: '#1a1916', fontWeight: 600 }}>
                    {fmtDayMonth(s.startsAt)}
                  </div>
                  <div style={{ flex: 1, color: '#5c5855', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.siteName ?? '—'}
                  </div>
                  <div style={{ minWidth: 44, textAlign: 'right', color: s.workedSeconds > 0 ? '#1a1916' : '#9a9490', fontVariantNumeric: 'tabular-nums' }}>
                    {s.workedSeconds > 0 ? fmtHours(s.workedSeconds) : '—'}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

export const PatrolPage: React.FC = () => {
  const { user } = useAuthStore()

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonTitle>Activity</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }}>
        <div style={{ padding: '14px 14px 24px' }}>
          <div style={{
            background: '#ffffff', border: '1px solid #e8e5e0', borderRadius: 12,
            padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <IonIcon icon={walkOutline} style={{ fontSize: 18, color: '#10b981' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1916' }}>Your hours</div>
            </div>
            <p style={{ margin: 0, color: '#5c5855', fontSize: 12.5, lineHeight: 1.5 }}>
              The hours you worked this month, with the site for each shift. Updates by itself when you check in and out.
            </p>
          </div>

          {user?.id && <MyHoursLog userId={user.id} />}
        </div>
      </IonContent>
    </IonPage>
  )
}
