'use client'
import { useEffect, useState } from 'react'
import type { GuideSection } from '@secureops/shared'

// Phone mockup for guard/supervisor sections; desktop mockup for manager.
// Auto-cycles through each section's pages, highlighting the active tab/menu
// item and fading in its name + description in the page content area.
// Mirrors the visual in the mobile app — keep the two in sync if changed.

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

function shortTab(name: string): string {
  const cleaned = name.replace(/\s*\(.*?\)/g, '').trim()
  const word = cleaned.split(/[\s/]/)[0]
  return word.length > 7 ? word.slice(0, 6) + '…' : word
}

function PhoneMockup({ section }: { section: GuideSection }) {
  const pages = section.pages.slice(0, 6)
  const active = useCycler(pages.length, 5500)
  const activePage = pages[active]
  const roleLabel = section.role === 'guard' ? 'Guard' : section.role === 'supervisor' ? 'Supervisor' : 'Admin'

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 22px' }}>
      <div style={{
        width: 240, height: 400,
        background: SURF2,
        borderRadius: 32,
        border: `2px solid ${BORDER}`,
        boxShadow: '0 14px 36px -10px rgba(26,25,22,0.18), 0 2px 4px rgba(26,25,22,0.04)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '7px 0 4px', background: SURF }}>
          <div style={{ width: 56, height: 4, borderRadius: 3, background: '#d4d1cb' }} />
        </div>

        <div style={{
          background: SURF,
          borderBottom: `1px solid ${BORDER}`,
          padding: '11px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>Arrow Security</div>
            <div style={{ fontSize: 9.5, color: TEXT3, marginTop: 1 }}>{roleLabel} view</div>
          </div>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: TINT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 7, height: 7, borderRadius: 3.5, background: ACCENT }} />
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div
            key={active}
            style={{
              position: 'absolute', inset: 0,
              padding: '14px 14px',
              animation: 'navmockup-fadeIn 0.35s ease-out',
            }}
          >
            <div style={{
              fontSize: 9.5, fontWeight: 700, color: TEXT3,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: 6,
            }}>{section.platform}</div>
            <div style={{
              fontSize: 16, fontWeight: 700, color: TEXT,
              letterSpacing: '-0.01em', marginBottom: 6,
            }}>{activePage.name}</div>
            <div style={{
              fontSize: 11.5, color: TEXT2,
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical' as any,
              overflow: 'hidden',
            }}>{activePage.what}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 14 }}>
              <div style={{ height: 7, width: '82%', borderRadius: 3, background: '#ebe8e2' }} />
              <div style={{ height: 7, width: '95%', borderRadius: 3, background: '#ebe8e2' }} />
              <div style={{ height: 7, width: '70%', borderRadius: 3, background: '#ebe8e2' }} />
            </div>
          </div>
        </div>

        <div style={{
          background: SURF,
          borderTop: `1px solid ${BORDER}`,
          display: 'flex',
          padding: '6px 4px 9px',
        }}>
          {pages.map((p, i) => (
            <div key={p.name} style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '4px 0',
            }}>
              <div style={{
                width: 15, height: 15, borderRadius: 4,
                background: i === active ? ACCENT : '#dcd8d2',
                transition: 'background 0.3s ease',
                position: 'relative',
              }}>
                {i === active && (
                  <div style={{
                    position: 'absolute', inset: -3, borderRadius: 6,
                    border: `1.5px solid ${ACCENT}`,
                    opacity: 0.35,
                    animation: 'navmockup-pulse 1.6s ease-out infinite',
                  }} />
                )}
              </div>
              <div style={{
                fontSize: 8, fontWeight: 600,
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
    </div>
  )
}

function DesktopMockup({ section }: { section: GuideSection }) {
  const items = section.pages
  const active = useCycler(items.length, 4000)
  const activePage = items[active]

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 22px' }}>
      <div style={{
        width: 460, height: 280,
        background: SURF,
        borderRadius: 12,
        border: `1.5px solid ${BORDER}`,
        boxShadow: '0 14px 36px -10px rgba(26,25,22,0.18), 0 2px 4px rgba(26,25,22,0.04)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '8px 10px',
          background: '#f4f2ef',
          borderBottom: `1px solid ${BORDER}`,
        }}>
          {['#ef5350', '#fdd835', '#10b981'].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />
          ))}
          <div style={{
            flex: 1, height: 18, borderRadius: 9,
            background: SURF, border: `1px solid ${BORDER}`,
            marginLeft: 10,
            fontSize: 10, color: TEXT3,
            display: 'flex', alignItems: 'center', padding: '0 10px',
          }}>arrow-security-tenant.onrender.com</div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{
            width: 140,
            background: SURF2,
            borderRight: `1px solid ${BORDER}`,
            padding: '12px 8px',
            display: 'flex', flexDirection: 'column', gap: 1,
            overflow: 'hidden',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: TEXT,
              letterSpacing: '-0.01em',
              padding: '0 8px 10px',
            }}>Arrow Security</div>
            {items.slice(0, 11).map((p, i) => (
              <div key={p.name} style={{
                padding: '5px 8px',
                borderRadius: 5,
                fontSize: 10.5,
                fontWeight: i === active ? 600 : 500,
                color: i === active ? ACCENT : TEXT2,
                background: i === active ? TINT : 'transparent',
                transition: 'background 0.25s ease, color 0.25s ease',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: 2.5,
                  background: i === active ? ACCENT : '#d4d1cb',
                  flexShrink: 0,
                }} />
                {p.name}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div
              key={active}
              style={{ animation: 'navmockup-fadeIn 0.35s ease-out' }}
            >
              <div style={{
                fontSize: 14, fontWeight: 700, color: TEXT,
                letterSpacing: '-0.01em', marginBottom: 5,
              }}>{activePage.name}</div>
              <div style={{
                fontSize: 10.5, color: TEXT2,
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical' as any,
                overflow: 'hidden',
                marginBottom: 12,
              }}>{activePage.what}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ height: 22, borderRadius: 5, background: SURF2, border: `1px solid ${BORDER}` }} />
                <div style={{ height: 22, borderRadius: 5, background: SURF2, border: `1px solid ${BORDER}` }} />
                <div style={{ height: 22, borderRadius: 5, background: SURF2, border: `1px solid ${BORDER}` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function NavMockup({ section }: { section: GuideSection }) {
  if (section.role === 'manager') return <DesktopMockup section={section} />
  return <PhoneMockup section={section} />
}

// Single source for the @keyframes — mounted once in the parent page.
export function NavMockupStyles() {
  return (
    <style>{`
      @keyframes navmockup-fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes navmockup-pulse {
        0%   { opacity: 0.35; transform: scale(1); }
        70%  { opacity: 0;    transform: scale(1.4); }
        100% { opacity: 0;    transform: scale(1.4); }
      }
    `}</style>
  )
}
