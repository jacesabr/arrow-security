'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { X, Loader2, BookOpen } from 'lucide-react'

/* ─── Layout ─────────────────────────────────────────────────────────── */

function TopBar() {
  const pathname = usePathname()
  const onGuide = pathname === '/guide'
  return (
    <div style={{
      height: 38,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '0 24px',
      background: '#ffffff',
      borderBottom: '1px solid #ebe8e2',
    }}>
      <Link
        href="/guide"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 11px',
          borderRadius: 7,
          fontSize: 12.5,
          fontWeight: 500,
          textDecoration: 'none',
          background: onGuide ? 'rgba(201,100,66,0.1)' : 'transparent',
          color: onGuide ? '#c96442' : '#5c5855',
          border: `1px solid ${onGuide ? 'rgba(201,100,66,0.2)' : 'transparent'}`,
          transition: 'color 0.12s, background 0.12s, border-color 0.12s',
        }}
        onMouseEnter={e => {
          if (!onGuide) {
            (e.currentTarget as HTMLElement).style.background = '#f4f2ef'
            ;(e.currentTarget as HTMLElement).style.color = '#1a1916'
          }
        }}
        onMouseLeave={e => {
          if (!onGuide) {
            (e.currentTarget as HTMLElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = '#5c5855'
          }
        }}
      >
        <BookOpen size={14} />
        User Guide
      </Link>
    </div>
  )
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        {children}
      </div>
    </div>
  )
}

export function Main({ children, maxWidth }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <main style={{ flex: 1, padding: '52px 60px', overflowY: 'auto', ...(maxWidth ? { maxWidth } : {}) }}>
      {children}
    </main>
  )
}

/* ─── Page header ────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
          {title}
        </h1>
        {subtitle && <p style={{ color: 'var(--text-3)', fontSize: 13.5, margin: '5px 0 0' }}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

/* ─── Card ───────────────────────────────────────────────────────────── */

export function Card({ children, style, overflow }: { children: React.ReactNode; style?: React.CSSProperties; overflow?: string }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: (overflow as any) ?? 'visible',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{
      padding: '18px 26px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14.5 }}>{title}</span>
      {action}
    </div>
  )
}

/* ─── Table ──────────────────────────────────────────────────────────── */

export function DataTable({
  cols,
  children,
  loading,
  empty,
  colSpan,
}: {
  cols: string[]
  children: React.ReactNode
  loading?: boolean
  empty?: string
  colSpan?: number
}) {
  const span = colSpan ?? cols.length
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} style={{
              padding: '11px 26px',
              textAlign: 'left',
              color: 'var(--text-3)',
              fontSize: 11.5,
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
              borderBottom: '1px solid var(--border)',
              whiteSpace: 'nowrap' as const,
              background: 'var(--surface-2)',
            }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr><td colSpan={span} style={{ padding: '36px 26px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13.5 }}>Loading…</td></tr>
        ) : !children || (Array.isArray(children) && children.length === 0) ? (
          <tr><td colSpan={span} style={{ padding: '36px 26px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13.5 }}>{empty ?? 'No data yet.'}</td></tr>
        ) : children}
      </tbody>
    </table>
  )
}

export function TR({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [hover, setHover] = React.useState(false)
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border)', background: hover ? 'var(--surface-2)' : 'transparent', cursor: onClick ? 'pointer' : 'default', transition: 'background 0.12s' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export function TD({ children, muted, style }: { children?: React.ReactNode; muted?: boolean; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: '14px 26px', color: muted ? 'var(--text-2)' : 'var(--text)', fontSize: 14, ...style }}>
      {children ?? '—'}
    </td>
  )
}

/* ─── Badge ──────────────────────────────────────────────────────────── */

export function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      color,
      background: bg,
      border: `1px solid ${color}28`,
    }}>
      {label}
    </span>
  )
}

export function DotStatus({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{label}</span>
    </div>
  )
}

/* ─── Buttons ────────────────────────────────────────────────────────── */

export function Btn({
  children,
  variant = 'primary',
  onClick,
  disabled,
  type = 'button',
  loading,
  size,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  loading?: boolean
  size?: 'sm'
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: 'var(--accent)', color: '#fff', border: '1px solid transparent' },
    secondary: { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost:     { background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)' },
  }
  const pad = size === 'sm' ? '6px 13px' : '9px 18px'
  const fz  = size === 'sm' ? 12.5 : 13.5
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: pad,
        borderRadius: 9,
        fontSize: fz,
        fontWeight: 600,
        cursor: (disabled || loading) ? 'default' : 'pointer',
        opacity: (disabled || loading) ? 0.55 : 1,
        transition: 'opacity 0.15s',
        ...styles[variant],
      }}
    >
      {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
      {children}
    </button>
  )
}

/* ─── Modal ──────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 460,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: number
}) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,25,22,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 24, backdropFilter: 'blur(3px)',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        width: '100%',
        maxWidth: width,
        boxShadow: '0 8px 48px rgba(26,25,22,0.1)',
        animation: 'fade-in 0.15s ease',
      }}>
        <div style={{
          padding: '22px 28px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ color: 'var(--text)', fontWeight: 700, fontSize: 17, margin: 0, letterSpacing: '-0.015em' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '24px 28px' }}>{children}</div>
      </div>
    </div>
  )
}

/* ─── Form helpers ───────────────────────────────────────────────────── */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, marginBottom: 7 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputBase: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1.5px solid var(--border)',
  borderRadius: 9,
  padding: '9px 13px',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  lineHeight: 1.5,
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = React.useState(false)
  return (
    <input
      {...props}
      style={{ ...inputBase, borderColor: focused ? 'var(--accent)' : 'var(--border)', ...props.style }}
      onFocus={e => { setFocused(true); props.onFocus?.(e) }}
      onBlur={e => { setFocused(false); props.onBlur?.(e) }}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [focused, setFocused] = React.useState(false)
  return (
    <select
      {...props}
      style={{ ...inputBase, borderColor: focused ? 'var(--accent)' : 'var(--border)', ...props.style }}
      onFocus={e => { setFocused(true); props.onFocus?.(e) }}
      onBlur={e => { setFocused(false); props.onBlur?.(e) }}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = React.useState(false)
  return (
    <textarea
      {...props}
      style={{ ...inputBase, resize: 'vertical', borderColor: focused ? 'var(--accent)' : 'var(--border)', ...props.style }}
      onFocus={e => { setFocused(true); props.onFocus?.(e) }}
      onBlur={e => { setFocused(false); props.onBlur?.(e) }}
    />
  )
}

/* ─── Error / filter ─────────────────────────────────────────────────── */

export function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div style={{
      background: 'rgba(220,38,38,0.05)',
      border: '1px solid rgba(220,38,38,0.18)',
      borderRadius: 9,
      padding: '10px 14px',
      color: '#ef4444',
      fontSize: 13.5,
      marginBottom: 16,
    }}>
      {msg}
    </div>
  )
}

export function FilterRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' as const, alignItems: 'flex-end' }}>{children}</div>
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{label}</div>
      {children}
    </div>
  )
}

export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>{children}</div>
}
