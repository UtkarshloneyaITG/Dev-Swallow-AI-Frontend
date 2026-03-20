import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Edit3, RotateCcw, ChevronDown, ChevronUp, AlertTriangle, AlertCircle } from 'lucide-react'
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

  const errors   = row.validationErrors.filter((e) => e.severity === 'error')
  const warnings = row.validationErrors.filter((e) => e.severity === 'warning')
  const hasErrors = errors.length > 0 || !!row.errorMessage

  // Primary summary line: prefer validationErrors, fall back to errorMessage
  const summaryLine = row.errorMessage?.trim() || null

  return (
    <motion.div
      className={[
        'themed-card rounded-2xl overflow-hidden transition-all duration-200 border',
        hasErrors
          ? 'border-rose-200 dark:border-rose-800/50'
          : 'border-amber-200 dark:border-amber-800/50',
      ].join(' ')}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Severity strip */}
      <div className={['h-0.5 w-full', hasErrors ? 'bg-rose-400' : 'bg-amber-400'].join(' ')} />

      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Row number */}
            <div className={[
              'flex-shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center',
              hasErrors
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/50'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50',
            ].join(' ')}>
              <span className={['text-xs font-semibold', hasErrors ? 'text-rose-500' : 'text-amber-500'].join(' ')}>
                #{row.rowIndex}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              {!!(row.originalData['title'] || row.originalData['Product Name']) && (
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate mb-1">
                  {String(row.originalData['title'] ?? row.originalData['Product Name'] ?? '')}
                </p>
              )}

              {/* Generic error message if present */}
              {summaryLine && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                  {summaryLine}
                </p>
              )}

              {/* Validation errors list */}
              {row.validationErrors.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {row.validationErrors.map((ve, i) => (
                    <div
                      key={i}
                      className={[
                        'flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5',
                        ve.severity === 'error'
                          ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                          : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
                      ].join(' ')}
                    >
                      {ve.severity === 'error'
                        ? <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        : <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      }
                      <span className="leading-snug">
                        <span className="font-mono font-semibold">{ve.loc || ve.field}</span>
                        {' — '}
                        {ve.msg}
                        {ve.got != null && (
                          <span className="ml-1 opacity-70">
                            (got: <span className="font-mono">{String(ve.got).slice(0, 80)}</span>)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* No errors at all fallback */}
              {!summaryLine && row.validationErrors.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No error details available.</p>
              )}

              {/* Meta badges */}
              <div className="flex items-center flex-wrap gap-2 mt-2.5">
                <Badge variant="confidence" confidence={row.confidenceScore} size="xs" />
                <Badge color="slate" size="xs">
                  {row.attempts} attempt{row.attempts !== 1 ? 's' : ''}
                </Badge>
                {errors.length > 0 && (
                  <Badge color="rose" size="xs">{errors.length} error{errors.length !== 1 ? 's' : ''}</Badge>
                )}
                {warnings.length > 0 && (
                  <Badge color="amber" size="xs">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</Badge>
                )}
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
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Show'} original data
        </button>
      </div>

      {/* Expanded original data */}
      <AnimatePresence>
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
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {Object.entries(row.originalData).map(([key, value]) => {
                const hasError = row.validationErrors.some(
                  (ve) => ve.field === key || ve.loc?.includes(key)
                )
                return (
                  <div key={key} className={['flex gap-2 min-w-0 rounded px-1', hasError ? 'bg-rose-50 dark:bg-rose-950/20' : ''].join(' ')}>
                    <span className={['text-xs font-medium flex-shrink-0 truncate', hasError ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'].join(' ')}>
                      {key}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-600">:</span>
                    <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                      {value == null || value === ''
                        ? <em className="text-slate-300 dark:text-slate-600">(empty)</em>
                        : String(value as string).slice(0, 120)
                      }
                    </span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
