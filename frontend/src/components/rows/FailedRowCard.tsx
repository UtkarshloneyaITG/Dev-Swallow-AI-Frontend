import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Edit3, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import type { FailedRow } from '../../types'

interface FailedRowCardProps {
  row: FailedRow
  index?: number
  onRetry: (rowId: string) => void
  onEdit: (row: FailedRow) => void
}

export default function FailedRowCard({
  row,
  index = 0,
  onRetry,
  onEdit,
}: FailedRowCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [retrying, setRetrying] = useState(false)

  function handleRetry() {
    setRetrying(true)
    onRetry(row.id)
    setTimeout(() => setRetrying(false), 2000)
  }

  const dataEntries = Object.entries(row.originalData)

  return (
    <motion.div
      className="themed-card rounded-2xl overflow-hidden transition-all duration-200"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: index * 0.07,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Row number badge */}
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/50 flex items-center justify-center">
              <span className="text-xs font-semibold text-rose-500">
                #{row.rowIndex}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              {/* Error message */}
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {row.errorMessage}
              </p>

              {/* Meta badges */}
              <div className="flex items-center flex-wrap gap-2 mt-2">
                <Badge
                  variant="confidence"
                  confidence={row.confidenceScore}
                  size="xs"
                />
                <Badge color="slate" size="xs">
                  {row.attempts} attempt{row.attempts !== 1 ? 's' : ''}
                </Badge>
                {row.status === 'retrying' && (
                  <Badge color="amber" size="xs">
                    <RotateCcw className="w-2.5 h-2.5" />
                    Retrying…
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="amber"
              size="sm"
              icon={<Zap className="w-3.5 h-3.5" />}
              onClick={handleRetry}
              loading={retrying}
            >
              Retry with AI
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Edit3 className="w-3.5 h-3.5" />}
              onClick={() => onEdit(row)}
            >
              Edit Manually
            </Button>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          className="mt-3 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          {expanded ? 'Hide' : 'Show'} original data
        </button>
      </div>

      {/* Expanded data preview */}
      {expanded && (
        <motion.div
          className="border-t border-black/5 dark:border-white/5 bg-slate-50/80 dark:bg-slate-900/60 px-5 py-4"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
            Original Data
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {dataEntries.map(([key, value]) => (
              <div key={key} className="flex gap-2 min-w-0">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0 min-w-0 truncate">
                  {key}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-600">:</span>
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                  {value === '' ? (
                    <em className="text-slate-300 dark:text-slate-600">(empty)</em>
                  ) : (
                    String(value)
                  )}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
