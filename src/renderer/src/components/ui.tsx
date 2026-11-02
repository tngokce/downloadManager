import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../icons'

export function Button({
  children,
  onClick,
  variant = 'default',
  icon,
  disabled,
  title,
  type = 'button',
  autoFocus
}: {
  children?: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  icon?: IconName
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
  autoFocus?: boolean
}) {
  return (
    <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled} title={title} autoFocus={autoFocus}>
      {icon && <Icon name={icon} size={15} />}
      {children && <span>{children}</span>}
    </button>
  )
}

export function Modal({
  title,
  children,
  footer,
  onClose,
  width = 560,
  page = false
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  width?: number
  /** Ayrı pencerede tam sayfa gösterim (ekleme penceresi) */
  page?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const body = (
    <div className={page ? 'modal modal-page' : 'modal'} style={page ? undefined : { width }} role="dialog" aria-label={title}>
      <div className="modal-header">
        <h2>{title}</h2>
        {!page && (
          <button className="icon-btn" onClick={onClose} aria-label="close">
            <Icon name="x" />
          </button>
        )}
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </div>
  )
  if (page) return body
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {body}
    </div>
  )
}

export function Field({ label, children, help, inline }: { label: string; children: ReactNode; help?: ReactNode; inline?: boolean }) {
  return (
    <label className={inline ? 'field field-inline' : 'field'}>
      <span className="field-label">{label}</span>
      <div className="field-control">{children}</div>
      {help && <span className="field-help">{help}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  width = 90
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  width?: number
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    let n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n)) n = value
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    setText(String(n))
    if (n !== value) onChange(n)
  }
  return (
    <input
      className="input"
      style={{ width }}
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

/** KB/s cinsinden hız sınırı girişi; 0 = sınırsız */
export function SpeedInput({ value, onChange, unlimitedLabel }: { value: number; onChange: (bytesPerSec: number) => void; unlimitedLabel: string }) {
  return (
    <div className="row gap-s">
      <NumberInput value={Math.round(value / 1024)} min={0} max={10_000_000} onChange={(kb) => onChange(kb * 1024)} width={110} />
      <span className="muted">KB/s {value === 0 && `(${unlimitedLabel})`}</span>
    </div>
  )
}

export interface MenuItem {
  label?: string
  icon?: IconName
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  checked?: boolean
  separator?: boolean
  submenu?: MenuItem[]
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [openSub, setOpenSub] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: Math.min(x, window.innerWidth - r.width - 6), y: Math.min(y, window.innerHeight - r.height - 6) })
  }, [x, y])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }} role="menu">
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div key={i} className="menu-item-wrap" onMouseEnter={() => setOpenSub(it.submenu ? i : null)}>
            <button
              className={`menu-item${it.danger ? ' danger' : ''}`}
              disabled={it.disabled}
              role="menuitem"
              onClick={() => {
                if (it.submenu) return setOpenSub(i)
                it.onClick?.()
                onClose()
              }}
            >
              <span className="menu-icon">{it.checked ? <Icon name="check" size={14} /> : it.icon && <Icon name={it.icon} size={14} />}</span>
              <span className="menu-label">{it.label}</span>
              {it.submenu && <Icon name="chevronRight" size={14} />}
            </button>
            {it.submenu && openSub === i && (
              <div className="menu submenu">
                {it.submenu.map((s, j) => (
                  <button
                    key={j}
                    className="menu-item"
                    disabled={s.disabled}
                    onClick={() => {
                      s.onClick?.()
                      onClose()
                    }}
                  >
                    <span className="menu-icon">{s.checked && <Icon name="check" size={14} />}</span>
                    <span className="menu-label">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

let toastSeq = 0
type Toast = { id: number; text: string; kind: 'info' | 'error' }
const toastListeners = new Set<(t: Toast[]) => void>()
let toasts: Toast[] = []

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const t = { id: ++toastSeq, text, kind }
  toasts = [...toasts, t]
  toastListeners.forEach((l) => l(toasts))
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    toastListeners.forEach((l) => l(toasts))
  }, 3500)
}

export function Toasts() {
  const [list, setList] = useState<Toast[]>([])
  useEffect(() => {
    toastListeners.add(setList)
    return () => {
      toastListeners.delete(setList)
    }
  }, [])
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <Icon name={t.kind === 'error' ? 'alert' : 'info'} size={15} />
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** İndirme bitince kısa, hoş bir iki notalı ses (ses dosyası gerektirmez) */
export function playDoneSound(): void {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    for (const [i, f] of [880, 1318.5].entries()) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, now + i * 0.12)
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.12 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(now + i * 0.12)
      o.stop(now + i * 0.12 + 0.4)
    }
    setTimeout(() => void ctx.close(), 1000)
  } catch {
    /* ses aygıtı yok */
  }
}
