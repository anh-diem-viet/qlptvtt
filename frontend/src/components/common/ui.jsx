// Bộ component giao diện dùng chung — theo cấu trúc components/common của dự án mẫu web_an_toan_blockchain
// (Button, Card, Modal, Table…), đổi sang tone màu sáng.
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

export function Button({ variant = 'primary', size = 'md', loading = false, leftIcon: Icon, className, children, disabled, ...props }) {
  const variants = {
    primary: 'bg-gradient-brand text-white shadow-brand hover:brightness-105',
    gold: 'bg-gradient-gold text-[#5a3b00] shadow-[0_6px_16px_rgba(255,179,0,0.35)] hover:brightness-105',
    secondary: 'bg-white text-ink border border-slate-200 hover:bg-slate-50',
    ghost: 'bg-transparent text-brand-600 hover:bg-brand-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-md gap-1.5',
    md: 'px-4 py-2 text-sm rounded-lg gap-2',
    lg: 'px-6 py-3 text-base rounded-xl gap-2',
  }
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 active:translate-y-px',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        Icon && <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
      )}
      {children}
    </button>
  )
}

export function Card({ className, padding = 'md', children, ...props }) {
  const paddings = { none: 'p-0', sm: 'p-3', md: 'p-5', lg: 'p-6' }
  return (
    <div className={clsx('rounded-2xl border border-slate-200/80 bg-white shadow-card', paddings[padding], className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ icon: Icon, title, subtitle, actions, className }) {
  return (
    <div className={clsx('mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3', className)}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <h3 className="text-base font-bold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const BADGE_COLORS = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export function Badge({ color = 'gray', className, children }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset', BADGE_COLORS[color], className)}>
      {children}
    </span>
  )
}

const STAT_COLORS = {
  blue: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  yellow: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-violet-50 text-violet-600',
}

export function StatCard({ icon: Icon, label, value, hint, color = 'blue' }) {
  return (
    <Card className="flex items-center gap-4">
      <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-xl', STAT_COLORS[color])}>
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</p>
        <p className="truncate text-2xl font-extrabold tabular-nums text-ink">{value}</p>
        {hint && <p className="text-xs text-ink-soft">{hint}</p>}
      </div>
    </Card>
  )
}

export function Modal({ open, onClose, title, size = 'md', children }) {
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
          <DialogPanel className={clsx('w-full overflow-hidden rounded-2xl bg-white shadow-2xl', sizes[size])}>
            <div className="flex items-center justify-between bg-gradient-brand px-5 py-3 text-white">
              <DialogTitle className="text-base font-bold">{title}</DialogTitle>
              <button onClick={onClose} className="rounded-full p-1 hover:bg-white/20" aria-label="Đóng">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-5">{children}</div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

export function Field({ label, hint, error, className, children }) {
  return (
    <div className={clsx('block', className)}>
      {/* Chỉ nhãn + ô nhập nằm trong <label> để tên của ô nhập không lẫn phần gợi ý */}
      <label className="block">
        {label && <span className="label">{label}</span>}
        {children}
      </label>
      {hint && !error && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {Icon && (
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500">
          <Icon className="h-7 w-7" />
        </span>
      )}
      <p className="font-bold text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-soft">{children}</div>}
    </div>
  )
}

export function Loading({ text = 'Đang tải…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-soft">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      {text}
    </div>
  )
}

export function Callout({ color = 'blue', icon: Icon, children, className }) {
  const colors = {
    blue: 'bg-brand-50 text-brand-700 border-brand-100',
    green: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    yellow: 'bg-amber-50 text-amber-800 border-amber-100',
  }
  return (
    <div className={clsx('flex gap-2 rounded-xl border px-4 py-3 text-sm leading-relaxed', colors[color], className)}>
      {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0" />}
      <div>{children}</div>
    </div>
  )
}

/** Chọn tháng YYYY-MM. */
export function MonthPicker({ value, onChange }) {
  return <input type="month" className="input w-auto" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
}
