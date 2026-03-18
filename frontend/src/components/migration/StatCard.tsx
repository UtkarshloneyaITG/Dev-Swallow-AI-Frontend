import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: number | string
  icon: ReactNode
  color: 'emerald' | 'rose' | 'amber' | 'slate' | 'blue' | 'violet'
  sublabel?: string
  delay?: number
}

const colorMap: Record<
  string,
  { bg: string; iconBg: string; iconText: string; value: string }
> = {
  emerald: {
    bg: 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/50',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    value: 'text-emerald-700 dark:text-emerald-400',
  },
  rose: {
    bg: 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/50',
    iconBg: 'bg-rose-100 dark:bg-rose-900/40',
    iconText: 'text-rose-600 dark:text-rose-400',
    value: 'text-rose-700 dark:text-rose-400',
  },
  amber: {
    bg: 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconText: 'text-amber-600 dark:text-amber-400',
    value: 'text-amber-700 dark:text-amber-400',
  },
  slate: {
    bg: 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-100 dark:border-slate-700',
    iconBg: 'bg-slate-100 dark:bg-slate-700',
    iconText: 'text-slate-500 dark:text-slate-400',
    value: 'text-slate-700 dark:text-slate-300',
  },
  blue: {
    bg: 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconText: 'text-blue-600 dark:text-blue-400',
    value: 'text-blue-700 dark:text-blue-400',
  },
  violet: {
    bg: 'bg-violet-50/60 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900/50',
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    iconText: 'text-violet-600 dark:text-violet-400',
    value: 'text-violet-700 dark:text-violet-400',
  },
}

export default function StatCard({
  label,
  value,
  icon,
  color,
  sublabel,
  delay = 0,
}: StatCardProps) {
  const colors = colorMap[color]

  return (
    <motion.div
      className={`rounded-2xl border p-5 backdrop-blur-sm ${colors.bg}`}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-xl ${colors.iconBg}`}>
          <span className={`w-4 h-4 block ${colors.iconText}`}>{icon}</span>
        </div>
      </div>
      <div className={`text-2xl font-light tabular-nums ${colors.value}`}>
        {value}
      </div>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-500 mt-0.5 uppercase tracking-widest">
        {label}
      </div>
      {sublabel && (
        <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sublabel}</div>
      )}
    </motion.div>
  )
}
