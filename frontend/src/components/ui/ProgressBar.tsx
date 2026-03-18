import { motion } from 'framer-motion'

interface ProgressBarProps {
  value: number // 0-100
  color?: 'emerald' | 'amber' | 'rose' | 'slate' | 'blue'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  animated?: boolean
  className?: string
}

const colorClasses: Record<string, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-600',
  blue: 'bg-blue-500',
}

const trackClasses: Record<string, string> = {
  emerald: 'bg-emerald-100',
  amber: 'bg-amber-100',
  rose: 'bg-rose-100',
  slate: 'bg-slate-200',
  blue: 'bg-blue-100',
}

const sizeClasses: Record<string, string> = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
}

export default function ProgressBar({
  value,
  color = 'emerald',
  size = 'md',
  showLabel = false,
  animated = true,
  className = '',
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value))

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-slate-500">Progress</span>
          <span className="text-xs font-semibold text-slate-700">
            {clampedValue}%
          </span>
        </div>
      )}
      <div
        className={`w-full rounded-full overflow-hidden ${sizeClasses[size]} ${trackClasses[color]}`}
      >
        <motion.div
          className={`h-full rounded-full ${colorClasses[color]} ${animated && clampedValue < 100 ? 'relative' : ''}`}
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          {animated && clampedValue < 100 && clampedValue > 0 && (
            <span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{
                animation: 'shimmer 2s linear infinite',
                backgroundSize: '200% 100%',
              }}
            />
          )}
        </motion.div>
      </div>
    </div>
  )
}
