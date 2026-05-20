'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card, DataTable, TR, TD, Badge, Btn, Modal, Field, Input, Select, ErrorMsg, ModalActions } from '../../components/ui'
import { tdApi } from '../../lib/api'

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

export default function GuardsPage() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'guard',
  })

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }
    load()
  }, [router])

  function load() {
    setLoading(true)
    tdApi.users
      .list()
      .then((r) => setUsers(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await tdApi.users.create({
        username: form.username.trim(),
        name: form.name.trim() || undefined,
        password: form.password,
        role: form.role,
      })
      setShowModal(false)
      setForm({ name: '', username: '', password: '', role: 'guard' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const roleBadge = (role: string) => {
    const c = ROLE_BADGE[role] ?? { color: '#5c5855', bg: 'rgba(163,160,152,0.12)' }
    return <Badge label={ROLE_DISPLAY[role] ?? role} color={c.color} bg={c.bg} />
  }

  return (
    <PageShell>
      <Main>
        <PageHeader
          title="Guards"
          subtitle={`${users.length} users`}
          action={<Btn variant="primary" onClick={() => setShowModal(true)}>+ Add Guard</Btn>}
        />

        <Card overflow="hidden">
          <DataTable
            cols={['Name', 'Username', 'Role', 'Last Login']}
            loading={loading}
            empty="No users yet. Add a guard to get started."
          >
            {users.map((u) => (
              <TR key={u.id} onClick={() => router.push(`/guards/${u.id}`)}>
                <TD>{u.name}</TD>
                <TD muted>{u.username}</TD>
                <TD>{roleBadge(u.role)}</TD>
                <TD muted>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : '—'}</TD>
              </TR>
            ))}
          </DataTable>
        </Card>

        <Modal open={showModal} onClose={() => { setShowModal(false); setError(null) }} title="Add Guard">
          <form onSubmit={handleCreate}>
            <Field label="Username">
              <Input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoComplete="username" />
            </Field>
            <Field label="Display Name (optional)">
              <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Defaults to username" />
            </Field>
            <Field label="Password">
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </Field>
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="guard">Guard</option>
                <option value="supervisor">Supervisor</option>
              </Select>
            </Field>
            <ErrorMsg msg={error} />
            <ModalActions>
              <Btn variant="secondary" onClick={() => { setShowModal(false); setError(null) }}>Cancel</Btn>
              <Btn variant="primary" type="submit" loading={saving}>Create</Btn>
            </ModalActions>
          </form>
        </Modal>
      </Main>
    </PageShell>
  )
}
