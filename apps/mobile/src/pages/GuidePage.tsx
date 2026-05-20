import React, { useState } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { GUIDE_INTRO, GUIDE_SECTIONS, GUIDE_VERSION, type GuideRole, type GuideSection } from '@secureops/shared'
import { useAuthStore } from '../store/auth'

function RoleTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 0',
        background: active ? '#c96442' : '#ffffff',
        color: active ? '#ffffff' : '#5c5855',
        border: '1px solid #e8e5e0',
        borderRight: 'none',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      {label}
    </button>
  )
}

function SectionView({ section }: { section: GuideSection }) {
  return (
    <div>
      <div style={{
        background: '#ffffff',
        border: '1px solid #e8e5e0',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1a1916' }}>{section.title}</span>
          <span style={{
            fontSize: 10.5,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 20,
            background: 'rgba(201,100,66,0.1)',
            color: '#c96442',
            border: '1px solid rgba(201,100,66,0.2)',
          }}>{section.platform}</span>
        </div>
        <p style={{ color: '#5c5855', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{section.oneLiner}</p>
      </div>

      <pre style={{
        background: '#f4f2ef',
        border: '1px solid #e8e5e0',
        borderRadius: 10,
        padding: 12,
        fontSize: 11,
        lineHeight: 1.45,
        color: '#5c5855',
        fontFamily: 'ui-monospace,Menlo,monospace',
        overflowX: 'auto',
        margin: '0 0 14px',
      }}>{section.navDiagram}</pre>

      <div style={{
        background: '#ffffff',
        border: '1px solid #e8e5e0',
        borderRadius: 12,
        marginBottom: 14,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e5e0', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9a9490' }}>
          Screens
        </div>
        {section.pages.map((p, i) => (
          <div key={p.name} style={{
            padding: '11px 14px',
            borderTop: i === 0 ? 'none' : '1px solid #f5f4f2',
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1a1916', marginBottom: 2 }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: '#5c5855', lineHeight: 1.5 }}>{p.what}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: '#ffffff',
        border: '1px solid #e8e5e0',
        borderRadius: 12,
        marginBottom: 20,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e5e0', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9a9490' }}>
          Tips
        </div>
        <ul style={{ margin: 0, padding: '10px 14px 10px 30px', color: '#5c5855', fontSize: 12.5, lineHeight: 1.6 }}>
          {section.tips.map((t) => (
            <li key={t} style={{ marginBottom: 4 }}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function defaultRoleFor(userRole: string | undefined): GuideRole {
  if (userRole === 'supervisor') return 'supervisor'
  if (userRole === 'tenant_admin' || userRole === 'platform_admin') return 'manager'
  return 'guard'
}

export const GuidePage: React.FC = () => {
  const { user } = useAuthStore()
  const [activeRole, setActiveRole] = useState<GuideRole>(defaultRoleFor(user?.role))
  const section = GUIDE_SECTIONS.find(s => s.role === activeRole)!

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' }}>
          <IonTitle>User Guide</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' }}>
        <div style={{ padding: 16 }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid #e8e5e0',
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}>
            <p style={{ color: '#5c5855', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{GUIDE_INTRO}</p>
          </div>

          <div style={{ display: 'flex', marginBottom: 16, borderRadius: 10, overflow: 'hidden' }}>
            <RoleTab label="Guard"      active={activeRole === 'guard'}      onClick={() => setActiveRole('guard')} />
            <RoleTab label="Supervisor" active={activeRole === 'supervisor'} onClick={() => setActiveRole('supervisor')} />
            <button
              onClick={() => setActiveRole('manager')}
              style={{
                flex: 1,
                padding: '10px 0',
                background: activeRole === 'manager' ? '#c96442' : '#ffffff',
                color: activeRole === 'manager' ? '#ffffff' : '#5c5855',
                border: '1px solid #e8e5e0',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              Manager
            </button>
          </div>

          <SectionView section={section} />

          <p style={{ color: '#9a9490', fontSize: 11, textAlign: 'center', margin: '8px 0 24px' }}>
            Last revised: {GUIDE_VERSION}
          </p>
        </div>
      </IonContent>
    </IonPage>
  )
}
