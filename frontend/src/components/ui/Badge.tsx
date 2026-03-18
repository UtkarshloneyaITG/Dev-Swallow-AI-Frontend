import type { ReactNode } from 'react'
import type { MigrationStatus, MigrationType } from '../../types'

type BadgeVariant = 'status' | 'type' | 'confidence' | 'custom'

interface BadgeProps {
  variant?: BadgeVariant
  status?: MigrationStatus
  type?: MigrationType
  confidence?: number
  color?: 'emerald' | 'rose' | 'amber' | 'slate' | 'blue' | 'violet'
  children?: ReactNode
  size?: 'xs' | 'sm'
}

const statusConfig: Record<
  MigrationStatus,
  { label: string; classes: string; dot: string }
> = {
  pending: {
    label: 'Pending',
    classes: 'bg-slate-100 text-slate-500 border border-slate-200',
    dot: 'bg-slate-400',
  },
  processing: {
    label: 'Processing',
    classes: 'bg-amber-50 text-amber-600 border border-amber-200',
    dot: 'bg-amber-500 animate-pulse',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    classes: 'bg-rose-50 text-rose-600 border border-rose-200',
    dot: 'bg-rose-500',
  },
}

const typeConfig: Record<MigrationType, { label: string; classes: string }> = {
  product: {
    label: 'Product',
    classes: 'bg-violet-50 text-violet-600 border border-violet-200',
  },
  customer: {
    label: 'Customer',
    classes: 'bg-blue-50 text-blue-600 border border-blue-200',
  },
  order: {
    label: 'Order',
    classes: 'bg-orange-50 text-orange-600 border border-orange-200',
  },
}

const colorClasses: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  rose: 'bg-rose-50 text-rose-600 border border-rose-200',
  amber: 'bg-amber-50 text-amber-600 border border-amber-200',
  slate: 'bg-slate-100 text-slate-600 border border-slate-200',
  blue: 'bg-blue-50 text-blue-600 border border-blue-200',
  violet: 'bg-violet-50 text-violet-600 border border-violet-200',
}

function getConfidenceColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-50 text-emerald-600 border border-emerald-200'
  if (score >= 0.4) return 'bg-amber-50 text-amber-600 border border-amber-200'
  return 'bg-rose-50 text-rose-600 border border-rose-200'
}

export default function Badge({
  variant = 'custom',
  status,
  type,
  confidence,
  color,
  children,
  size = 'sm',
}: BadgeProps) {
  const sizeClass = size === 'xs' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
  const baseClass = `inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClass}`

  if (variant === 'status' && status) {
    const cfg = statusConfig[status]
    return (
      <span className={`${baseClass} ${cfg.classes}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    )
  }

  if (variant === 'type' && type) {
    const cfg = typeConfig[type]
    return <span className={`${baseClass} ${cfg.classes}`}>{cfg.label}</span>
  }

  if (variant === 'confidence' && confidence !== undefined) {
    return (
      <span className={`${baseClass} ${getConfidenceColor(confidence)}`}>
        {Math.round(confidence * 100)}% confidence
      </span>
    )
  }

  return (
    <span
      className={`${baseClass} ${color ? colorClasses[color] : 'bg-slate-100 text-slate-600 border border-slate-200'}`}
    >
      {children}
    </span>
  )
}
