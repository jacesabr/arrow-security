'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Sidebar } from '../../components/Sidebar'
import { tdApi } from '../../lib/api'
import { Btn, Modal, Field, Input, Select, Textarea, ErrorMsg, ModalActions } from '../../components/ui'

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  scheduled: { background: 'rgba(163,160,152,0.1)', border: '1px solid rgba(163,160,152,0.3)', color: '#5c5855' },
  active:    { background: 'rgba(201,100,66,0.12)', border: '1px solid rgba(201,100,66,0.35)', color: '#c96442' },
  completed: { background: 'rgba(122,119,115,0.1)', border: '1px solid rgba(122,119,115,0.3)', color: '#9a9490' },
  missed:    { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' },
}

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d)
  mon.setDate(diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function RosterPage() {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [shifts, setShifts] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ siteId: '', guardId: '', date: '', startTime: '', endTime: '', notes: '' })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    Promise.all([
      tdApi.users.list().catch(() => ({ data: [] })),
      tdApi.sites.list().catch(() => ({ data: [] })),
    ]).then(([u, s]) => {
      setUsers(u.data ?? [])
      setSites(s.data ?? [])
    })
  }, [router])

  useEffect(() => { loadShifts() }, [weekStart])

  function loadShifts() {
    setLoading(true)
    const from = weekStart.toISOString().slice(0, 10)
    const to = addDays(weekStart, 6).toISOString().slice(0, 10)
    tdApi.shifts.list({ from, to })
      .then((r) => setShifts(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const guards = users.filter((u) => u.role === 'guard' || u.role === 'supervisor')
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  function openModal(guardId?: string, date?: string) {
    setForm({
      siteId: '', guardId: guardId ?? '',
      date: date ?? today.toISOString().slice(0, 10),
      startTime: '08:00', endTime: '20:00', notes: '',
    })
    setError(null)
    setShowModal(true)
  }

  async function handlePublishWeek() {
    const unpublished = shifts.filter((s) => !s.published).map((s) => s.id)
    if (!unpublished.length) return
    setPublishing(true)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/shifts/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('td_token')}` },
        body: JSON.stringify({ shiftIds: unpublished }),
      })
      loadShifts()
    } catch { /* ignore */ } finally {
      setPublishing(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const startsAt = new Date(`${form.date}T${form.startTime}`).toISOString()
      const endsAt = new Date(`${form.date}T${form.endTime}`).toISOString()
      await tdApi.shifts.create({ siteId: form.siteId, guardId: form.guardId, startsAt, endsAt, notes: form.notes || undefined })
      setShowModal(false)
      loadShifts()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function siteName(id: string) { return sites.find((s) => s.id === id)?.name ?? '—' }

  function shiftsFor(guardId: string, day: Date): any[] {
    return shifts.filter((s) => s.guardId === guardId && isSameDay(new Date(s.startsAt), day))
  }

  const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(addDays(weekStart, 6))}`

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', flexShrink: 0,
        }}>
          <div>
            <h1 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Roster</h1>
            <p style={{ color: 'var(--text-3)', fontSize: 12.5, margin: '2px 0 0' }}>{weekLabel}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              style={{
                fontSize: 13, color: 'var(--text-2)', background: 'var(--surface-2)',
                border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
              }}
            >
              Today
            </button>
            <div style={{ display: 'flex', gap: 2 }}>
              {[[-7, <ChevronLeft size={14} />], [7, <ChevronRight size={14} />]].map(([n, icon]) => (
                <button
                  key={String(n)}
                  onClick={() => setWeekStart(addDays(weekStart, n as number))}
                  style={{
                    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)',
                    cursor: 'pointer', color: 'var(--text-2)',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
            {shifts.some((s) => !s.published) && (
              <Btn variant="secondary" onClick={handlePublishWeek} loading={publishing}>
                Publish Week ({shifts.filter((s) => !s.published).length})
              </Btn>
            )}
            <Btn onClick={() => openModal()}>+ Schedule Shift</Btn>
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-3)' }}>
              Loading…
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 'max-content' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)' }}>
                <tr>
                  <th style={{
                    width: 160, padding: '10px 16px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase',
                    letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                  }}>
                    Guard
                  </th>
                  {days.map((day) => {
                    const isToday = isSameDay(day, today)
                    return (
                      <th
                        key={day.toISOString()}
                        style={{
                          padding: '10px 12px', textAlign: 'center',
                          fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                          borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                          minWidth: 130,
                          color: isToday ? 'var(--accent)' : 'var(--text-3)',
                          background: isToday ? 'var(--accent-dim)' : 'var(--surface)',
                        }}
                      >
                        {fmtDate(day)}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {guards.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                      No guards found — add guards first
                    </td>
                  </tr>
                ) : (
                  guards.map((guard) => (
                    <tr key={guard.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{
                        padding: '10px 16px', borderRight: '1px solid var(--border)',
                        width: 160, background: 'var(--surface)',
                      }}>
                        <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {guard.name}
                        </div>
                        <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 1 }}>
                          {{ tenant_admin: 'Admin', platform_admin: 'Admin', supervisor: 'Supervisor', guard: 'Guard', client_viewer: 'Client' }[guard.role as string] ?? guard.role}
                        </div>
                      </td>
                      {days.map((day) => {
                        const dayShifts = shiftsFor(guard.id, day)
                        const isToday = isSameDay(day, today)
                        return (
                          <td
                            key={day.toISOString()}
                            onClick={() => openModal(guard.id, day.toISOString().slice(0, 10))}
                            style={{
                              padding: '8px', borderRight: '1px solid var(--border)',
                              verticalAlign: 'top', minWidth: 130, cursor: 'pointer',
                              background: isToday ? 'var(--accent-dim)' : 'transparent',
                            }}
                            onMouseEnter={(e) => { if (!isToday) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isToday ? 'var(--accent-dim)' : 'transparent' }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {dayShifts.map((s) => (
                                <div
                                  key={s.id}
                                  onClick={(e) => e.stopPropagation()}
                                  title={`${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)} · ${siteName(s.siteId)}${!s.published ? ' · Draft' : ''}`}
                                  style={{
                                    fontSize: 11.5, padding: '3px 7px 3px 7px', borderRadius: 5,
                                    opacity: deleting === s.id ? 0.4 : s.published ? 1 : 0.6,
                                    position: 'relative',
                                    ...(STATUS_STYLE[s.status] ?? STATUS_STYLE.scheduled),
                                    ...(s.published ? {} : { borderStyle: 'dashed' }),
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                                    <div style={{ overflow: 'hidden', minWidth: 0 }}>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                                      </div>
                                      <div style={{ fontSize: 10, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {siteName(s.siteId)}
                                      </div>
                                    </div>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        setDeleting(s.id)
                                        try { await tdApi.shifts.delete(s.id); loadShifts() }
                                        catch { /* ignore */ }
                                        finally { setDeleting(null) }
                                      }}
                                      style={{
                                        flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'inherit', opacity: 0.5, padding: '0 0 0 2px', lineHeight: 1,
                                        fontSize: 12, fontWeight: 700,
                                      }}
                                      title="Delete shift"
                                    >×</button>
                                  </div>
                                </div>
                              ))}
                              {dayShifts.length === 0 && (
                                <div style={{
                                  height: 32, border: '1px dashed var(--border)', borderRadius: 5,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: 'var(--text-3)', fontSize: 11, opacity: 0,
                                }}
                                  className="group-hover:opacity-100"
                                />
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Schedule Shift" width={480}>
        <form onSubmit={handleCreate}>
          <ErrorMsg msg={error} />
          <Field label="Site">
            <Select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} required>
              <option value="">Select site…</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Guard">
            <Select value={form.guardId} onChange={(e) => setForm({ ...form, guardId: e.target.value })} required>
              <option value="">Select guard…</option>
              {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>Start</label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>End</label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
            </div>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </Field>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setShowModal(false); setError(null) }}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Schedule</Btn>
          </ModalActions>
        </form>
      </Modal>
    </div>
  )
}
