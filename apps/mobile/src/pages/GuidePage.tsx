import React, { useEffect, useState } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { GUIDE_INTRO, GUIDE_SECTIONS, GUIDE_VERSION, type GuideRole, type GuideSection } from '@secureops/shared'
import { useAuthStore } from '../store/auth'

const ACCENT = '#c96442'
const TINT   = 'rgba(201,100,66,0.10)'
const TEXT   = '#1a1916'
const TEXT2  = '#5c5855'
const TEXT3  = '#9a9490'
const BORDER = '#e8e5e0'
const SURF   = '#ffffff'
const SURF2  = '#fafaf9'

function useCycler(length: number, intervalMs: number) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (length <= 1) return
    const t = setInterval(() => setI(prev => (prev + 1) % length), intervalMs)
    return () => clearInterval(t)
  }, [length, intervalMs])
  return i
}

function PhoneMockup({ section }: { section: GuideSection }) {
  const pages = section.pages.slice(0, 6) // keep tab bar manageable
  const active = useCycler(pages.length, 5500)
  const activePage = pages[active]
  const roleLabel = section.role === 'guard' ? 'Guard' : section.role === 'supervisor' ? 'Supervisor' : 'Admin'

  return (
    <div style={{
      display: 'flex', justifyContent: 'center',
      padding: '8px 0 18px',
    }}>
      <div style={{
        width: 220, height: 360,
        background: SURF2,
        borderRadius: 28,
        border: `2px solid ${BORDER}`,
        boxShadow: '0 12px 32px -8px rgba(26,25,22,0.18), 0 2px 4px rgba(26,25,22,0.04)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}>
        {/* Status bar nub */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 4px', background: SURF }}>
          <div style={{ width: 50, height: 4, borderRadius: 3, background: '#d4d1cb' }} />
        </div>

        {/* Toolbar */}
        <div style={{
          background: SURF,
          borderBottom: `1px solid ${BORDER}`,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>Arrow Security</div>
            <div style={{ fontSize: 8.5, color: TEXT3, marginTop: 1 }}>{roleLabel} view</div>
          </div>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: TINT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: ACCENT }} />
          </div>
        </div>

        {/* Content area — fades between pages */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div
            key={active}
            style={{
              position: 'absolute', inset: 0,
              padding: '14px 14px',
              animation: 'fadeIn 0.35s ease-out',
            }}
          >
            <div style={{
              fontSize: 9, fontWeight: 700, color: TEXT3,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: 6,
            }}>{section.platform}</div>
            <div style={{
              fontSize: 15, fontWeight: 700, color: TEXT,
              letterSpacing: '-0.01em', marginBottom: 6,
            }}>{activePage.name}</div>
            <div style={{
              fontSize: 10.5, color: TEXT2,
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical' as any,
              overflow: 'hidden',
            }}>{activePage.what}</div>

            {/* Decorative skeleton bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12 }}>
              <div style={{ height: 6, width: '80%', borderRadius: 3, background: '#ebe8e2' }} />
              <div style={{ height: 6, width: '95%', borderRadius: 3, background: '#ebe8e2' }} />
              <div style={{ height: 6, width: '70%', borderRadius: 3, background: '#ebe8e2' }} />
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          background: SURF,
          borderTop: `1px solid ${BORDER}`,
          display: 'flex',
          padding: '6px 4px 8px',
        }}>
          {pages.map((p, i) => (
            <div key={p.name} style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '4px 0',
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: 4,
                background: i === active ? ACCENT : '#dcd8d2',
                transition: 'background 0.3s ease',
                position: 'relative',
              }}>
                {i === active && (
                  <div style={{
                    position: 'absolute', inset: -3, borderRadius: 6,
                    border: `1.5px solid ${ACCENT}`,
                    opacity: 0.35,
                    animation: 'pulse 1.6s ease-out infinite',
                  }} />
                )}
              </div>
              <div style={{
                fontSize: 7.5, fontWeight: 600,
                color: i === active ? ACCENT : TEXT3,
                transition: 'color 0.3s ease',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{shortTab(p.name)}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%   { opacity: 0.35; transform: scale(1); }
          70%  { opacity: 0;    transform: scale(1.4); }
          100% { opacity: 0;    transform: scale(1.4); }
        }
        @keyframes slideHighlight {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

function DesktopMockup({ section }: { section: GuideSection }) {
  const items = section.pages
  const active = useCycler(items.length, 4000)
  const activePage = items[active]

  return (
    <div style={{
      display: 'flex', justifyContent: 'center',
      padding: '8px 0 18px',
    }}>
      <div style={{
        width: 320, height: 220,
        background: SURF,
        borderRadius: 12,
        border: `1.5px solid ${BORDER}`,
        boxShadow: '0 12px 32px -8px rgba(26,25,22,0.18), 0 2px 4px rgba(26,25,22,0.04)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Browser chrome */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px',
          background: '#f4f2ef',
          borderBottom: `1px solid ${BORDER}`,
        }}>
          {['#ef5350', '#fdd835', '#10b981'].map(c => (
            <div key={c} style={{ width: 8, height: 8, borderRadius: 4, background: c }} />
          ))}
          <div style={{
            flex: 1, height: 14, borderRadius: 7,
            background: SURF, border: `1px solid ${BORDER}`,
            marginLeft: 8,
            fontSize: 8, color: TEXT3,
            display: 'flex', alignItems: 'center', padding: '0 8px',
          }}>arrow-security-tenant.onrender.com</div>
        </div>

        {/* Body — sidebar + content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{
            width: 110,
            background: SURF2,
            borderRight: `1px solid ${BORDER}`,
            padding: '10px 6px',
            display: 'flex', flexDirection: 'column', gap: 1,
            overflow: 'hidden',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: TEXT,
              letterSpacing: '-0.01em',
              padding: '0 6px 8px',
            }}>Arrow Security</div>
            {items.slice(0, 10).map((p, i) => (
              <div key={p.name} style={{
                padding: '4px 6px',
                borderRadius: 4,
                fontSize: 8.5,
                fontWeight: i === active ? 600 : 500,
                color: i === active ? ACCENT : TEXT2,
                background: i === active ? TINT : 'transparent',
                transition: 'background 0.25s ease, color 0.25s ease',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <div style={{
                  width: 4, height: 4, borderRadius: 2,
                  background: i === active ? ACCENT : '#d4d1cb',
                  flexShrink: 0,
                }} />
                {p.name}
              </div>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
            <div
              key={active}
              style={{ animation: 'fadeIn 0.35s ease-out' }}
            >
              <div style={{
                fontSize: 12, fontWeight: 700, color: TEXT,
                letterSpacing: '-0.01em', marginBottom: 4,
              }}>{activePage.name}</div>
              <div style={{
                fontSize: 9, color: TEXT2,
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical' as any,
                overflow: 'hidden',
                marginBottom: 10,
              }}>{activePage.what}</div>

              {/* Decorative skeleton */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ height: 18, borderRadius: 4, background: SURF2, border: `1px solid ${BORDER}` }} />
                <div style={{ height: 18, borderRadius: 4, background: SURF2, border: `1px solid ${BORDER}` }} />
                <div style={{ height: 18, borderRadius: 4, background: SURF2, border: `1px solid ${BORDER}` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function shortTab(name: string): string {
  // Strip parentheticals + take first word, keep readable on a 220px mock
  const cleaned = name.replace(/\s*\(.*?\)/g, '').trim()
  const word = cleaned.split(/[\s/]/)[0]
  return word.length > 7 ? word.slice(0, 6) + '…' : word
}

function NavMockup({ section }: { section: GuideSection }) {
  if (section.role === 'manager') return <DesktopMockup section={section} />
  return <PhoneMockup section={section} />
}

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

      <NavMockup section={section} />

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
