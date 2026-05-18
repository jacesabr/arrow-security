'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, Badge, Btn, Modal, Field, Textarea, ErrorMsg, ModalActions } from '../../components/ui'
import { tdApi } from '../../lib/api'

type PanicEvent = {
  id: string
  guardId: string
  shiftId?: string
  latitude?: number
  longitude?: number
  status: 'active' | 'acknowledged' | 'resolved'
  acknowledgedAt?: string
  resolvedAt?: string
  notes?: string
  triggeredAt: string
  guardName?: string
}

const STATUS_COLOR: Record<string, string> = {
  active: '#ef4444',
  acknowledged: '#f59e0b',
  resolved: '#10b981',
}
const STATUS_BG: Record<string, string> = {
  active: 'rgba(239,68,68,0.12)',
  acknowledged: 'rgba(245,158,11,0.12)',
  resolved: 'rgba(16,185,129,0.12)',
}

export default function PanicPage() {
  const router = useRouter()
  const [events, setEvents] = useState<PanicEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [resolveModal, setResolveModal] = useState<PanicEvent | null>(null)
  const [resolveNotes, setResolveNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sseRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    load()
    connectSSE(token)
    return () => sseRef.current?.()
  }, [router])

  function load() {
    setLoading(true)
    tdApi.panic.list()
      .then(r => setEvents(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function connectSSE(token: string) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
    const ctrl = new AbortController()
    sseRef.current = () => ctrl.abort()

    fetch(`${apiUrl}/locations/live`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    }).then(async res => {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const msg = JSON.parse(line.slice(5).trim())
            if (msg.type === 'panic') {
              // A new panic came in — reload the list
              load()
            }
          } catch { /* ignore */ }
        }
      }
    }).catch(() => { /* SSE disconnected */ })
  }

  async function handleAcknowledge(ev: PanicEvent) {
    try {
      await tdApi.panic.acknowledge(ev.id)
      load()
    } catch (e: any) {
      console.error(e)
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault()
    if (!resolveModal) return
    setSaving(true)
    setError(null)
    try {
      await tdApi.panic.resolve(resolveModal.id, resolveNotes || undefined)
      setResolveModal(null)
      setResolveNotes('')
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const active = events.filter(e => e.status === 'active')
  const acknowledged = events.filter(e => e.status === 'acknowledged')
  const resolved = events.filter(e => e.status === 'resolved')

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Panic Alerts"
          subtitle={active.length > 0 ? `${active.length} active alert${active.length > 1 ? 's' : ''}` : 'No active alerts'}
          action={<Btn variant="secondary" onClick={load}>Refresh</Btn>}
        />

        {active.length > 0 && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>🚨</span>
            <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 14 }}>
              {active.length} active panic alert{active.length > 1 ? 's' : ''} — respond immediately
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ color: '#9a9490', padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : events.length === 0 ? (
          <Card><div style={{ color: '#9a9490', padding: 40, textAlign: 'center' }}>No panic events recorded.</div></Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(ev => (
              <Card key={ev.id} style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <Badge label={ev.status} color={STATUS_COLOR[ev.status]} bg={STATUS_BG[ev.status]} />
                      <span style={{ color: '#1a1916', fontWeight: 600, fontSize: 14 }}>
                        Guard ID: {ev.guardId.slice(0, 8)}…
                      </span>
                      <span style={{ color: '#9a9490', fontSize: 12 }}>
                        {new Date(ev.triggeredAt).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#5c5855' }}>
                      {ev.latitude != null && ev.longitude != null && (
                        <span>📍 {ev.latitude.toFixed(5)}, {ev.longitude.toFixed(5)}</span>
                      )}
                      {ev.shiftId && <span>Shift: {ev.shiftId.slice(0, 8)}…</span>}
                      {ev.notes && <span>Note: {ev.notes}</span>}
                    </div>
                    {ev.acknowledgedAt && (
                      <p style={{ color: '#9a9490', fontSize: 12, margin: '4px 0 0' }}>
                        Acknowledged {new Date(ev.acknowledgedAt).toLocaleString()}
                      </p>
                    )}
                    {ev.resolvedAt && (
                      <p style={{ color: '#9a9490', fontSize: 12, margin: '4px 0 0' }}>
                        Resolved {new Date(ev.resolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {ev.status === 'active' && (
                      <Btn variant="secondary" onClick={() => handleAcknowledge(ev)}>Acknowledge</Btn>
                    )}
                    {(ev.status === 'active' || ev.status === 'acknowledged') && (
                      <Btn variant="primary" onClick={() => { setResolveModal(ev); setResolveNotes('') }}>Resolve</Btn>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Modal open={!!resolveModal} onClose={() => { setResolveModal(null); setError(null) }} title="Resolve Panic Alert">
          <form onSubmit={handleResolve}>
            <p style={{ color: '#5c5855', fontSize: 13, marginTop: 0 }}>
              Confirm the situation is under control and add resolution notes.
            </p>
            <Field label="Resolution Notes (optional)">
              <Textarea
                rows={3}
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="e.g. False alarm — guard confirmed safe"
              />
            </Field>
            <ErrorMsg msg={error} />
            <ModalActions>
              <Btn variant="secondary" onClick={() => { setResolveModal(null); setError(null) }}>Cancel</Btn>
              <Btn variant="primary" type="submit" loading={saving}>Mark Resolved</Btn>
            </ModalActions>
          </form>
        </Modal>
      </Main>
    </PageShell>
  )
}
