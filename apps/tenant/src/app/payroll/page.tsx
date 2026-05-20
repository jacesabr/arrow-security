'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { tdApi } from '../../lib/api'
import {
  PageShell, Main, PageHeader, Card, CardHeader,
  Badge, Btn, Modal, Field, Input, ErrorMsg, ModalActions,
} from '../../components/ui'

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  draft:      { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  processing: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  finalized:  { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
}

const REC_STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  pending:  { color: '#5c5855', bg: 'rgba(163,160,152,0.12)' },
  approved: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  paid:     { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
}

function paise(n: number) {
  return '₹' + (n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PayrollPage() {
  const router = useRouter()
  const [periods, setPeriods] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ periodStart: '', periodEnd: '' })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    loadPeriods()
  }, [router])

  function loadPeriods() {
    setLoading(true)
    tdApi.payroll.listPeriods().then((r) => setPeriods(r.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }

  function selectPeriod(period: any) {
    setSelected(period)
    setRecords([])
    tdApi.payroll.getPeriod(period.id).then((r) => setRecords(r.data.records ?? [])).catch(() => {})
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.periodStart || !form.periodEnd) return
    setSaving(true)
    setError(null)
    try {
      await tdApi.payroll.createPeriod({
        periodStart: new Date(form.periodStart).toISOString(),
        periodEnd: new Date(form.periodEnd + 'T23:59:59').toISOString(),
      })
      setShowNewModal(false)
      setForm({ periodStart: '', periodEnd: '' })
      loadPeriods()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCalculate() {
    if (!selected) return
    setCalculating(true)
    setError(null)
    try {
      await tdApi.payroll.calculate(selected.id)
      const r = await tdApi.payroll.getPeriod(selected.id)
      setRecords(r.data.records ?? [])
      const ps = await tdApi.payroll.listPeriods()
      setPeriods(ps.data ?? [])
      const updated = ps.data.find((p: any) => p.id === selected.id)
      if (updated) setSelected(updated)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCalculating(false)
    }
  }

  async function handleFinalize() {
    if (!selected) return
    if (!confirm('Finalize this payroll period? This cannot be undone.')) return
    setError(null)
    try {
      await tdApi.payroll.finalize(selected.id)
      const ps = await tdApi.payroll.listPeriods()
      setPeriods(ps.data ?? [])
      const updated = ps.data.find((p: any) => p.id === selected.id)
      if (updated) setSelected(updated)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const totalNetPaise = records.reduce((sum: number, r: any) => sum + (r.record?.netPayPaise ?? 0), 0)
  const totalEsiEr = records.reduce((sum: number, r: any) => sum + (r.record?.esiEmployerPaise ?? 0), 0)
  const totalPfEr = records.reduce((sum: number, r: any) => sum + (r.record?.pfEmployerPaise ?? 0), 0)

  const thStyle: React.CSSProperties = {
    padding: '9px 16px',
    textAlign: 'left',
    color: 'var(--text-3)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)',
  }
  const tdStyle: React.CSSProperties = { padding: '11px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--text)' }
  const tdMuted: React.CSSProperties = { ...tdStyle, color: 'var(--text-2)' }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Payroll"
          subtitle="Monthly guard payroll with ESI & PF computation"
          action={<Btn onClick={() => setShowNewModal(true)}>+ New Period</Btn>}
        />

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
          {/* Period list */}
          <Card overflow="hidden">
            <CardHeader title="Periods" />
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
            ) : periods.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No payroll periods yet</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {periods.map((p: any) => {
                  const sb = STATUS_BADGE[p.status] ?? STATUS_BADGE.draft
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => selectPeriod(p)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '12px 16px',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderBottom: '1px solid var(--border)',
                          background: selected?.id === p.id ? 'var(--accent-dim)' : 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                          {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                        </span>
                        <Badge label={p.status} color={sb.color} bg={sb.bg} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* Period detail */}
          <div>
            {!selected ? (
              <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-3)', fontSize: 13.5 }}>Select a period to view records</p>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Summary bar */}
                <Card style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 28 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Net Payroll</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginTop: 3 }}>{paise(totalNetPaise)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>ESI (employer)</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginTop: 3 }}>{paise(totalEsiEr)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>PF (employer)</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginTop: 3 }}>{paise(totalPfEr)}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {selected.status !== 'finalized' && (
                      <Btn onClick={handleCalculate} loading={calculating}>Calculate</Btn>
                    )}
                    {selected.status === 'processing' && (
                      <Btn onClick={handleFinalize} variant="secondary">Finalize</Btn>
                    )}
                  </div>
                </Card>

                {/* Records table */}
                <Card overflow="hidden">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Guard</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Shifts</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Gross</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>ESI</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>PF</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ ...tdMuted, textAlign: 'center', padding: '32px 16px' }}>
                            {selected.status === 'draft' ? 'Click Calculate to generate records' : 'No records'}
                          </td>
                        </tr>
                      ) : (
                        records.map((r: any) => {
                          const rec = r.record
                          const rsb = REC_STATUS_BADGE[rec.status] ?? REC_STATUS_BADGE.pending
                          return (
                            <tr key={rec.id}>
                              <td style={tdStyle}>
                                <div style={{ fontWeight: 500 }}>{r.guardName}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>@{r.guardUsername}</div>
                              </td>
                              <td style={{ ...tdMuted, textAlign: 'right' }}>{rec.completedShifts}/{rec.scheduledShifts}</td>
                              <td style={{ ...tdMuted, textAlign: 'right' }}>{paise(rec.grossPayPaise)}</td>
                              <td style={{ ...tdMuted, textAlign: 'right', fontSize: 12 }}>
                                <div>{paise(rec.esiEmployeePaise)} <span style={{ color: 'var(--text-3)' }}>emp</span></div>
                                <div>{paise(rec.esiEmployerPaise)} <span style={{ color: 'var(--text-3)' }}>er</span></div>
                              </td>
                              <td style={{ ...tdMuted, textAlign: 'right', fontSize: 12 }}>
                                <div>{paise(rec.pfEmployeePaise)} <span style={{ color: 'var(--text-3)' }}>emp</span></div>
                                <div>{paise(rec.pfEmployerPaise)} <span style={{ color: 'var(--text-3)' }}>er</span></div>
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{paise(rec.netPayPaise)}</td>
                              <td style={{ ...tdStyle, textAlign: 'center' }}>
                                <Badge label={rec.status} color={rsb.color} bg={rsb.bg} />
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}
          </div>
        </div>
      </Main>

      <Modal open={showNewModal} onClose={() => { setShowNewModal(false); setError(null) }} title="New Payroll Period">
        <form onSubmit={handleCreate}>
          <ErrorMsg msg={error} />
          <Field label="Period Start">
            <Input type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} required autoFocus />
          </Field>
          <Field label="Period End">
            <Input type="date" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} required />
          </Field>
          <ModalActions>
            <Btn variant="secondary" onClick={() => { setShowNewModal(false); setError(null) }}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Create Period</Btn>
          </ModalActions>
        </form>
      </Modal>
    </PageShell>
  )
}
