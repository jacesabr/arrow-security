'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card } from '../../components/ui'

function ComingSoonBadge() {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 20,
      background: 'var(--surface-2)',
      color: 'var(--text-3)',
      marginLeft: 8,
      border: '1px solid var(--border)',
    }}>
      Coming soon
    </span>
  )
}

function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: boolean }) {
  return (
    <Card style={{ padding: 24, marginBottom: 16 }}>
      <h2 style={{ color: 'var(--text)', fontWeight: 600, fontSize: 15, margin: '0 0 16px', display: 'flex', alignItems: 'center' }}>
        {title}
        {badge && <ComingSoonBadge />}
      </h2>
      {children}
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const disabledInput: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  color: 'var(--text-3)',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13.5,
  cursor: 'not-allowed',
  opacity: 0.6,
  boxSizing: 'border-box',
}

const ROLE_DISPLAY: Record<string, string> = {
  tenant_admin: 'Admin',
  platform_admin: 'Admin',
  supervisor: 'Supervisor',
  guard: 'Guard',
  client_viewer: 'Client Viewer',
}

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string>('')

  useEffect(() => {
    const token = localStorage.getItem('td_token')
    if (!token) { router.replace('/login'); return }

    try {
      const u = JSON.parse(localStorage.getItem('td_user') ?? '{}')
      setUser(u)
      const payload = JSON.parse(atob(token.split('.')[1]))
      setTenantId(payload.tenantId ?? u.tenantId ?? '—')
    } catch {}
  }, [router])

  return (
    <PageShell>
      <Main maxWidth={720}>
        <PageHeader title="Settings" subtitle="Account and tenant configuration" />

        {/* User Info */}
        <Section title="My Account">
          {user ? (
            <>
              <InfoRow label="Name" value={user.name ?? '—'} />
              <InfoRow label="Email" value={user.email ?? '—'} />
              <InfoRow label="Role" value={ROLE_DISPLAY[user.role] ?? user.role ?? '—'} />
              <InfoRow label="Phone" value={user.phone ?? '—'} />
            </>
          ) : (
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading user info...</p>
          )}
        </Section>

        {/* Tenant Info */}
        <Section title="Tenant">
          <InfoRow label="Tenant ID" value={tenantId} />
        </Section>

        {/* Notifications */}
        <Section title="Notification Settings" badge>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {['Email alerts for critical incidents', 'SMS alerts for SLA breaches', 'Push notifications for mobile app', 'Daily summary report'].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-3)', fontSize: 13.5 }}>{item}</span>
                <div style={{ width: 36, height: 20, background: 'var(--surface-2)', borderRadius: 10, opacity: 0.4, border: '1px solid var(--border)' }} />
              </div>
            ))}
          </div>
        </Section>

        {/* Integrations */}
        <Section title="Integrations" badge>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Frappe / ERPNext URL', placeholder: 'https://erp.yourcompany.com' },
              { label: 'Zammad Help Desk URL', placeholder: 'https://helpdesk.yourcompany.com' },
              { label: 'Webhook URL', placeholder: 'https://yourwebhook.example.com/events' },
            ].map((f) => (
              <div key={f.label}>
                <p style={{ color: 'var(--text-2)', fontSize: 13.5, fontWeight: 500, margin: '0 0 6px' }}>{f.label}</p>
                <input disabled placeholder={f.placeholder} style={disabledInput} />
              </div>
            ))}
          </div>
        </Section>

        {/* Branding */}
        <Section title="Branding" badge>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ color: 'var(--text-2)', fontSize: 13.5, fontWeight: 500, margin: '0 0 6px' }}>Company Logo</p>
              <div style={{
                width: 88,
                height: 88,
                background: 'var(--surface-2)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-3)',
                fontSize: 12,
                opacity: 0.5,
              }}>
                Upload
              </div>
            </div>
            <div>
              <p style={{ color: 'var(--text-2)', fontSize: 13.5, fontWeight: 500, margin: '0 0 6px' }}>Primary Color</p>
              <div style={{ width: 36, height: 36, background: '#c96442', borderRadius: 8, border: '1px solid var(--border)', opacity: 0.6 }} />
            </div>
          </div>
        </Section>
      </Main>
    </PageShell>
  )
}
