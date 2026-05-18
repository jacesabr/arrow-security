'use client'
import React from 'react'
import { Sidebar } from './Sidebar'
import { X, Loader2 } from 'lucide-react'

/* ─── Layout ─────────────────────────────────────────────────────────── */

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', minHeight: '100vh' }}><Sidebar />{children}</div>
}

export function Main({ children, maxWidth }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto', ...(maxWidth ? { maxWidth } : {}) }}>
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
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
      <div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
          {title}
        </h1>
        {subtitle && <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>{subtitle}</p>}
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
      borderRadius: 10,
      boxShadow: '0 1px 6px rgba(26,25,22,0.06)',
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
      padding: '14px 22px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>{title}</span>
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
              padding: '9px 22px',
              textAlign: 'left',
              color: 'var(--text-3)',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
              borderBottom: '1px solid var(--border)',
              whiteSpace: 'nowrap' as const,
            }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr><td colSpan={span} style={{ padding: '28px 22px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</td></tr>
        ) : !children || (Array.isArray(children) && children.length === 0) ? (
          <tr><td colSpan={span} style={{ padding: '28px 22px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{empty ?? 'No data yet.'}</td></tr>
        ) : children}
      </tbody>
    </table>
  )
}

export function TR({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [hover, setHover] = React.useState(false)
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border)', background: hover ? 'var(--surface-2)' : 'transparent', cursor: onClick ? 'pointer' : 'default', transition: 'background 0.1s' }}
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
    <td style={{ padding: '12px 22px', color: muted ? 'var(--text-2)' : 'var(--text)', fontSize: 13.5, ...style }}>
      {children ?? '—'}
    </td>
  )
}

/* ─── Badge ──────────────────────────────────────────────────────────── */

export function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      color,
      background: bg,
      border: `1px solid ${color}30`,
    }}>
      {label}
    </span>
  )
}

export function DotStatus({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{label}</span>
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
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  loading?: boolean
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff', border: '1px solid transparent', boxShadow: '0 1px 3px rgba(217,119,87,0.25)' },
    secondary: { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)' },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        borderRadius: 8,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: (disabled || loading) ? 'default' : 'pointer',
        opacity: (disabled || loading) ? 0.65 : 1,
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
  width = 440,
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 24, backdropFilter: 'blur(2px)',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        width: '100%',
        maxWidth: width,
        boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
      }}>
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

/* ─── Form helpers ───────────────────────────────────────────────────── */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>
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
  borderRadius: 8,
  padding: '8px 12px',
  color: 'var(--text)',
  fontSize: 13.5,
  outline: 'none',
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

/* ─── Error / empty ──────────────────────────────────────────────────── */

export function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div style={{
      background: 'rgba(220,38,38,0.06)',
      border: '1px solid rgba(220,38,38,0.2)',
      borderRadius: 8,
      padding: '8px 12px',
      color: '#ef4444',
      fontSize: 13,
      marginBottom: 14,
    }}>
      {msg}
    </div>
  )
}

export function FilterRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' as const, alignItems: 'flex-end' }}>{children}</div>
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 500, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </div>
  )
}

export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>{children}</div>
}
