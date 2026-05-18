'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { tdApi } from '../../lib/api'
import {
  PageShell, Main, PageHeader, Card,
  Badge, DataTable, TR, TD,
  Btn, Modal, Field, Input, Select, Textarea, ErrorMsg, ModalActions,
  FilterRow, FilterField,
} from '../../components/ui'

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  pending:  { color: '#d97706', bg: '#fffbeb' },
  approved: { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  rejected: { color: '#dc2626', bg: '#fef2f2' },
}

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid', 'other']

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.round(ms / 86400000) + 1
}

export default function LeaveRequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<any[]>([])
  const [guards, setGuards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewing, setReviewing] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterGuard, setFilterGuard] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({ leaveType: 'casual', startDate: '', endDate: '', reason: '' })
  const [reviewForm, setReviewForm] = useState<{ status: 'approved' | 'rejected'; reviewNote: string }>({ status: 'approved', reviewNote: '' })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    tdApi.users.list()
      .then((r) => setGuards((r.data ?? []).filter((u: any) => u.role === 'guard' || u.role === 'supervisor')))
      .catch(() => {})
    load()
  }, [router])

  useEffect(() => { load() }, [filterGuard, filterStatus])

  function load() {
    setLoading(true)
    tdApi.leaveRequests.list({
      guardId: filterGuard || undefined,
      status: filterStatus || undefined,
    })
      .then((r) => setRequests(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.leaveRequests.create({
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || undefined,
      })
      setShowNewModal(false)
      setForm({ leaveType: 'casual', startDate: '', endDate: '', reason: '' })
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function openReview(req: any) {
    setReviewing(req)
    setReviewForm({ status: 'approved', reviewNote: '' })
    setError(null)
    setShowReviewModal(true)
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault()
    if (!reviewing) return
    setSaving(true)
    setError(null)
    try {
      await tdApi.leaveRequests.review(reviewing.id, {
        status: reviewForm.status,
        reviewNote: reviewForm.reviewNote || undefined,
      })
      setShowReviewModal(false)
      setReviewing(null)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function guardName(id: string) { return guards.find((g) => g.id === id)?.name ?? id }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Leave Requests"
          subtitle="Guard leave applications and approval management"
          action={<Btn onClick={() => { setError(null); setShowNewModal(true) }}>+ New Request</Btn>}
        />

        <FilterRow>
          <FilterField label="Guard">
            <Select value={filterGuard} onChange={(e) => setFilterGuard(e.target.value)} style={{ width: 200 }}>
              <option value="">All guards</option>
              {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 150 }}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
          </FilterField>
        </FilterRow>

        <Card overflow="hidden">
          <DataTable
            cols={['Guard', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', '']}
            loading={loading}
            empty="No leave requests yet."
          >
            {requests.map((r: any) => {
              const sb = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending
              const days = r.startDate && r.endDate ? daysBetween(r.startDate, r.endDate) : '—'
              return (
                <TR key={r.id}>
                  <TD style={{ fontWeight: 500 }}>{r.guardName ?? guardName(r.guardId)}</TD>
                  <TD muted style={{ textTransform: 'capitalize' as const }}>{r.leaveType}</TD>
                  <TD muted>{fmtDate(r.startDate)}</TD>
                  <TD muted>{fmtDate(r.endDate)}</TD>
                  <TD muted>{days}</TD>
                  <TD muted style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {r.reason ?? '—'}
                  </TD>
                  <TD>
                    <Badge label={r.status} color={sb.color} bg={sb.bg} />
                  </TD>
                  <TD>
                    {r.status === 'pending' && (
                      <Btn variant="ghost" onClick={() => openReview(r)}>Review</Btn>
                    )}
                  </TD>
                </TR>
              )
            })}
          </DataTable>
        </Card>
      </Main>

      <Modal open={showNewModal} onClose={() => { setShowNewModal(false); setError(null) }} title="New Leave Request" width={460}>
        <form onSubmit={handleCreate}>
          <ErrorMsg msg={error} />
          <Field label="Leave Type">
            <Select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} required>
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </Select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>From</label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>To</label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
            </div>
          </div>
          <Field label="Reason">
            <Textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Optional reason for the leave request…"
              rows={3}
            />
          </Field>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setShowNewModal(false); setError(null) }}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Submit Request</Btn>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={showReviewModal} onClose={() => { setShowReviewModal(false); setError(null) }} title="Review Leave Request" width={440}>
        {reviewing && (
          <form onSubmit={handleReview}>
            <ErrorMsg msg={error} />
            <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                {reviewing.guardName ?? guardName(reviewing.guardId)}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                {reviewing.leaveType} leave · {fmtDate(reviewing.startDate)} – {fmtDate(reviewing.endDate)}
                {reviewing.startDate && reviewing.endDate && (
                  <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
                    ({daysBetween(reviewing.startDate, reviewing.endDate)} day{daysBetween(reviewing.startDate, reviewing.endDate) !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
              {reviewing.reason && (
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6, fontStyle: 'italic' }}>"{reviewing.reason}"</div>
              )}
            </div>
            <Field label="Decision">
              <Select
                value={reviewForm.status}
                onChange={(e) => setReviewForm({ ...reviewForm, status: e.target.value as 'approved' | 'rejected' })}
                required
              >
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
              </Select>
            </Field>
            <Field label="Review Note">
              <Textarea
                value={reviewForm.reviewNote}
                onChange={(e) => setReviewForm({ ...reviewForm, reviewNote: e.target.value })}
                placeholder="Optional note to the guard…"
                rows={3}
              />
            </Field>
            <ModalActions>
              <Btn variant="secondary" onClick={() => { setShowReviewModal(false); setError(null) }}>Cancel</Btn>
              <Btn
                type="submit"
                loading={saving}
                variant={reviewForm.status === 'approved' ? 'primary' : 'secondary'}
              >
                {reviewForm.status === 'approved' ? 'Approve' : 'Reject'}
              </Btn>
            </ModalActions>
          </form>
        )}
      </Modal>
    </PageShell>
  )
}
