'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '../../components/Sidebar'

function ComingSoonBadge() {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 ml-2">
      Coming soon
    </span>
  )
}

function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: boolean }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-4 flex items-center">
        {title}
        {badge && <ComingSoonBadge />}
      </h2>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{value}</span>
    </div>
  )
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

      // Decode JWT payload to get tenantId
      const payload = JSON.parse(atob(token.split('.')[1]))
      setTenantId(payload.tenantId ?? u.tenantId ?? '—')
    } catch {}
  }, [router])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 mt-1">Account and tenant configuration</p>
        </div>

        {/* User Info */}
        <Section title="My Account">
          {user ? (
            <>
              <InfoRow label="Name" value={user.name ?? '—'} />
              <InfoRow label="Email" value={user.email ?? '—'} />
              <InfoRow label="Role" value={user.role ?? '—'} />
              <InfoRow label="Phone" value={user.phone ?? '—'} />
            </>
          ) : (
            <p className="text-slate-500 text-sm">Loading user info...</p>
          )}
        </Section>

        {/* Tenant Info */}
        <Section title="Tenant">
          <InfoRow label="Tenant ID" value={tenantId} />
          <InfoRow label="Tenant Slug" value={user?.tenantSlug ?? '—'} />
        </Section>

        {/* Notifications - Coming Soon */}
        <Section title="Notification Settings" badge>
          <div className="space-y-3">
            {['Email alerts for critical incidents', 'SMS alerts for SLA breaches', 'Push notifications for mobile app', 'Daily summary report'].map((item) => (
              <div key={item} className="flex items-center justify-between">
                <span className="text-slate-500 text-sm">{item}</span>
                <div className="w-10 h-5 bg-slate-700 rounded-full opacity-40" />
              </div>
            ))}
          </div>
        </Section>

        {/* Integrations - Coming Soon */}
        <Section title="Integrations" badge>
          <div className="space-y-4">
            <div>
              <p className="text-slate-400 text-sm font-medium mb-1.5">Frappe / ERPNext URL</p>
              <input
                disabled
                placeholder="https://erp.yourcompany.com"
                className="w-full bg-slate-800 text-slate-600 rounded-lg px-4 py-2.5 border border-slate-700 cursor-not-allowed"
              />
            </div>
            <div>
              <p className="text-slate-400 text-sm font-medium mb-1.5">Zammad Help Desk URL</p>
              <input
                disabled
                placeholder="https://helpdesk.yourcompany.com"
                className="w-full bg-slate-800 text-slate-600 rounded-lg px-4 py-2.5 border border-slate-700 cursor-not-allowed"
              />
            </div>
            <div>
              <p className="text-slate-400 text-sm font-medium mb-1.5">Webhook URL</p>
              <input
                disabled
                placeholder="https://yourwebhook.example.com/events"
                className="w-full bg-slate-800 text-slate-600 rounded-lg px-4 py-2.5 border border-slate-700 cursor-not-allowed"
              />
            </div>
          </div>
        </Section>

        {/* Branding - Coming Soon */}
        <Section title="Branding" badge>
          <div className="space-y-4">
            <div>
              <p className="text-slate-400 text-sm font-medium mb-1.5">Company Logo</p>
              <div className="w-24 h-24 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center text-slate-600 text-xs opacity-40">
                Upload
              </div>
            </div>
            <div>
              <p className="text-slate-400 text-sm font-medium mb-1.5">Primary Color</p>
              <div className="w-10 h-10 bg-indigo-600 rounded-lg border border-slate-700 opacity-40" />
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}
