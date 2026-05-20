'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Main, PageHeader, Card } from '../../components/ui'
import { GUIDE_INTRO, GUIDE_SECTIONS, GUIDE_VERSION, type GuideSection } from '@secureops/shared'

function PlatformPill({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 9px',
      borderRadius: 20,
      background: 'var(--accent-dim)',
      color: 'var(--accent)',
      border: '1px solid rgba(201,100,66,0.2)',
      marginLeft: 10,
    }}>
      {label}
    </span>
  )
}

function NavDiagram({ ascii }: { ascii: string }) {
  return (
    <pre style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 16px',
      fontSize: 12.5,
      lineHeight: 1.5,
      color: 'var(--text-2)',
      fontFamily: '"JetBrains Mono","Cascadia Code",ui-monospace,monospace',
      overflowX: 'auto',
      margin: '0 0 20px',
    }}>
      {ascii}
    </pre>
  )
}

function SectionCard({ section }: { section: GuideSection }) {
  return (
    <Card style={{ padding: 28, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ color: 'var(--text)', fontWeight: 600, fontSize: 19, margin: 0, letterSpacing: '-0.015em' }}>
          {section.title}
        </h2>
        <PlatformPill label={section.platform} />
      </div>
      <p style={{ color: 'var(--text-2)', fontSize: 14, margin: '0 0 18px' }}>{section.oneLiner}</p>

      <NavDiagram ascii={section.navDiagram} />

      <h3 style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
        Screens
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 22 }}>
        {section.pages.map((p, i) => (
          <div key={p.name} style={{
            display: 'flex',
            gap: 16,
            padding: '12px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
          }}>
            <div style={{ minWidth: 140, color: 'var(--text)', fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.55 }}>{p.what}</div>
          </div>
        ))}
      </div>

      <h3 style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
        Tips
      </h3>
      <ul style={{ margin: 0, padding: '0 0 0 18px', color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.6 }}>
        {section.tips.map((t) => (
          <li key={t} style={{ marginBottom: 4 }}>{t}</li>
        ))}
      </ul>
    </Card>
  )
}

export default function GuidePage() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem('td_token')) router.replace('/login')
  }, [router])

  return (
    <PageShell>
      <Main maxWidth={920}>
        <PageHeader
          title="User Guide"
          subtitle={`What each role sees inside Arrow Security · v${GUIDE_VERSION}`}
        />

        <Card style={{ padding: 22, marginBottom: 22, background: 'var(--surface-2)' }}>
          <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            {GUIDE_INTRO}
          </p>
        </Card>

        {GUIDE_SECTIONS.map((s) => (
          <SectionCard key={s.role} section={s} />
        ))}

        <p style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', margin: '32px 0 8px' }}>
          This guide updates as Arrow Security evolves. Last revised: {GUIDE_VERSION}
        </p>
      </Main>
    </PageShell>
  )
}
