import { useEffect, useRef, useState, type ReactNode } from 'react'
import { tapFeedback } from '../lib/feedback'

type Variant = 'ambra' | 'cemento' | 'nero' | 'muschio' | 'schiuma'

const variantClass: Record<Variant, string> = {
  ambra: 'bg-ambra text-nero',
  cemento: 'bg-cemento text-nero',
  nero: 'bg-nero text-cemento',
  muschio: 'bg-muschio text-schiuma',
  schiuma: 'bg-schiuma text-nero',
}

export function Btn({
  children,
  onClick,
  variant = 'cemento',
  size = 'lg',
  disabled,
  className = '',
  type = 'button',
  ariaLabel,
  testId,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  size?: 'xl' | 'lg' | 'md' | 'sm'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
  ariaLabel?: string
  testId?: string
}) {
  const [flash, setFlash] = useState(0)
  const sizes = {
    xl: 'min-h-[96px] text-4xl px-5',
    lg: 'min-h-[64px] text-2xl px-4',
    md: 'min-h-[52px] text-lg px-3',
    sm: 'min-h-[44px] text-base px-3',
  }
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        tapFeedback()
        setFlash((f) => f + 1)
        onClick?.()
      }}
      className={`bordo shadow-pieno premuto titolo flex items-center justify-center gap-3 ${sizes[size]} ${variantClass[variant]} ${
        disabled ? 'opacity-40 shadow-none' : ''
      } ${className}`}
    >
      <span key={flash} className={`flex items-center gap-3 ${flash ? 'flash' : ''}`}>
        {children}
      </span>
    </button>
  )
}

/** pressione prolungata (R19): un tap singolo non fa nulla */
export function HoldButton({
  children,
  onHold,
  ms = 1000,
  className = '',
  testId,
}: {
  children: ReactNode
  onHold: () => void
  ms?: number
  className?: string
  testId?: string
}) {
  const [progress, setProgress] = useState(0)
  const [hint, setHint] = useState(false)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const firedRef = useRef(false)

  const stop = (fromRelease: boolean) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (fromRelease && startRef.current !== null && !firedRef.current) {
      setHint(true)
      setTimeout(() => setHint(false), 1600)
    }
    startRef.current = null
    setProgress(0)
  }

  const tick = () => {
    if (startRef.current === null) return
    const p = Math.min(1, (performance.now() - startRef.current) / ms)
    setProgress(p)
    if (p >= 1) {
      firedRef.current = true
      tapFeedback()
      stop(false)
      onHold()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => stop(false), [])

  return (
    <button
      type="button"
      data-testid={testId}
      onPointerDown={(e) => {
        e.preventDefault()
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        firedRef.current = false
        startRef.current = performance.now()
        rafRef.current = requestAnimationFrame(tick)
      }}
      onPointerUp={() => stop(true)}
      onPointerCancel={() => stop(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        // accessibilità da tastiera: tenere premuto Invio/Spazio
        if ((e.key === 'Enter' || e.key === ' ') && startRef.current === null && !e.repeat) {
          e.preventDefault()
          firedRef.current = false
          startRef.current = performance.now()
          rafRef.current = requestAnimationFrame(tick)
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') stop(true)
      }}
      className={`relative overflow-hidden bordo border-cemento bg-nero text-cemento titolo min-h-[64px] text-2xl px-4 select-none ${className}`}
      style={{ WebkitTouchCallout: 'none' }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-rosso-linea"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">{hint ? 'TIENI PREMUTO' : children}</span>
    </button>
  )
}

/** timbro storto rosso: "SEGNATO", "BANGLA 3" */
export function Stamp({ text, small }: { text: string; small?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center" role="status" aria-live="polite">
      <div
        className={`timbro titolo border-[5px] border-rosso-linea text-rosso-linea bg-cemento/80 px-5 py-3 ${
          small ? 'text-3xl' : 'text-6xl'
        }`}
      >
        {text}
      </div>
    </div>
  )
}

export function useStamp(): [string | null, (t: string, ms?: number) => void] {
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = (t: string, ms = 1200) => {
    setText(t)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setText(null), ms)
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return [text, show]
}

export function Sheet({
  children,
  title,
  onClose,
  dark,
}: {
  children: ReactNode
  title?: string
  onClose?: () => void
  dark?: boolean
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-nero/60" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`sale bordo border-b-0 safe-bottom max-h-[92vh] overflow-y-auto px-4 pt-5 ${
          dark ? 'bg-nero text-cemento border-cemento' : 'bg-cemento text-nero'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="titolo text-4xl mb-4">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function MugIcon({ size = 32, fill = '#F2B230', stroke = '#111111' }: { size?: number; fill?: string; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="10" y="20" width="32" height="38" fill={fill} stroke={stroke} strokeWidth="5" />
      <path d="M42 28h7a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5h-7" fill="none" stroke={stroke} strokeWidth="5" />
      <path
        d="M10 20c0-7 4-10 9-10 3-5 11-5 14-1 5-1 9 2 9 7v4z"
        fill="#FFFFFF"
        stroke={stroke}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <line x1="20" y1="30" x2="20" y2="50" stroke={stroke} strokeWidth="4" />
      <line x1="31" y1="30" x2="31" y2="50" stroke={stroke} strokeWidth="4" />
    </svg>
  )
}

export function FlagIcon({ size = 28, color = '#111111' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <line x1="14" y1="6" x2="14" y2="60" stroke={color} strokeWidth="6" />
      <path d="M14 8h36l-8 12 8 12H14z" fill="none" stroke={color} strokeWidth="6" strokeLinejoin="miter" />
    </svg>
  )
}

export function PersonIcon({ size = 24, color = '#111111' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="22" y="6" width="20" height="20" fill="none" stroke={color} strokeWidth="6" />
      <path d="M10 60V40h44v20" fill="none" stroke={color} strokeWidth="6" />
      <text x="44" y="22" fontSize="22" fontFamily="Archivo Black" fill={color}>?</text>
    </svg>
  )
}

/** voto a blocchi: 5 quadrati che si riempiono di ambra (non stelle) */
export function VoteBlocks({ value, onChange, dark }: { value: number | null; onChange: (v: number) => void; dark?: boolean }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Voto da 1 a 5">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={`Voto ${v}`}
          data-testid={`voto-${v}`}
          onClick={() => {
            tapFeedback()
            onChange(v)
          }}
          className={`premuto aspect-square flex-1 bordo shadow-pieno titolo text-3xl ${
            dark ? 'border-cemento' : ''
          } ${value !== null && v <= value ? 'bg-ambra text-nero' : dark ? 'bg-nero text-cemento' : 'bg-cemento text-nero'}`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

export function Counter({ label, value, dark }: { label: string; value: number | string; dark?: boolean }) {
  return (
    <div className={`bordo p-3 ${dark ? 'border-cemento' : ''}`}>
      <div className="titolo text-5xl tabular-nums">{value}</div>
      <div className="etichetta text-sm mt-1">{label}</div>
    </div>
  )
}

export function UndoBar({ label, onUndo, dark }: { label: string; onUndo: () => void; dark?: boolean }) {
  return (
    <div className="fixed left-0 right-0 bottom-[104px] z-20 px-4" role="status">
      <div className={`bordo flex items-center justify-between gap-3 px-3 py-2 ${dark ? 'bg-cemento text-nero' : 'bg-nero text-cemento border-nero'}`}>
        <span className="etichetta text-sm truncate">{label}</span>
        <button
          type="button"
          data-testid="annulla-ultimo"
          onClick={() => {
            tapFeedback()
            onUndo()
          }}
          className="etichetta bordo bg-rosso-linea text-schiuma px-3 min-h-[44px]"
        >
          ANNULLA
        </button>
      </div>
    </div>
  )
}

export function ScreenTitle({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <header className="mb-5">
      {kicker && <div className="etichetta text-sm mb-2">{kicker}</div>}
      <h1 className="titolo text-5xl break-words">{children}</h1>
    </header>
  )
}

export function BackLink({ to, label = '← INDIETRO' }: { to: string; label?: string }) {
  return (
    <a href={`#/${to}`} className="etichetta inline-block underline underline-offset-4 decoration-2 min-h-[44px] py-2">
      {label}
    </a>
  )
}
