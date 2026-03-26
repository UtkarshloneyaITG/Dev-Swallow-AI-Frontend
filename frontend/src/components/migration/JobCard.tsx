import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ShoppingBag,
  Users,
  ShoppingCart,
  Clock,
  Trash2,
} from 'lucide-react'
import Badge from '../ui/Badge'
import ProgressBar from '../ui/ProgressBar'
import type { MigrationJob } from '../../types'

interface JobCardProps {
  job: MigrationJob
  index?: number
  onDelete?: (id: string) => void
}

const typeIconMap = {
  product: ShoppingBag,
  customer: Users,
  order: ShoppingCart,
}

const typeColorMap = {
  product: 'violet',
  customer: 'blue',
  order: 'amber',
} as const

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export default function JobCard({ job, index = 0, onDelete }: JobCardProps) {
  const navigate = useNavigate()
  const TypeIcon = typeIconMap[job.type]
  const typeColor = typeColorMap[job.type]
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const progressColor =
    job.status === 'completed'
      ? 'emerald'
      : job.status === 'processing'
        ? 'amber'
        : 'slate'

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    onDelete?.(job.id)
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDelete(false)
  }

  return (
    <motion.div
      className="group relative themed-card rounded-2xl p-5 cursor-pointer hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-200 overflow-hidden"
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.97 },
        show:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
      }}
      animate={deleting ? { opacity: 0, scale: 0.97 } : undefined}
      onClick={() => !confirmDelete && navigate(`/jobs/${job.id}`)}
    >

      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-xl ${typeColor === 'violet' ? 'bg-violet-100 dark:bg-violet-900/40' : typeColor === 'blue' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}`}
          >
            <TypeIcon
              className={`w-4 h-4 ${typeColor === 'violet' ? 'text-violet-600 dark:text-violet-400' : typeColor === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-black dark:group-hover:text-white transition-colors">
              {job.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="type" type={job.type} size="xs" />
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono uppercase">
                {job.inputFormat}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="status" status={job.status} size="xs" />
          <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all duration-150" />
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar
        value={job.progress}
        color={progressColor}
        size="sm"
        animated={job.status === 'processing'}
      />

      {/* Stats row */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              {job.totalRows}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Total</div>
          </div>
          <div className="w-px h-6 bg-slate-100 dark:bg-slate-700" />
          <div className="text-center">
            <div className="text-sm font-semibold text-emerald-600 tabular-nums">
              {job.correctRows}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Correct</div>
          </div>
          <div className="w-px h-6 bg-slate-100 dark:bg-slate-700" />
          <div className="text-center">
            <div className="text-sm font-semibold text-rose-500 tabular-nums">
              {job.failedRows}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Failed</div>
          </div>
          {job.status === 'processing' && (
            <>
              <div className="w-px h-6 bg-slate-100 dark:bg-slate-700" />
              <div className="text-center">
                <div className="text-sm font-semibold text-amber-500 tabular-nums">
                  {job.processingRows}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">Processing</div>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(job.updatedAt)}
          </div>
          {onDelete && !confirmDelete && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all duration-150"
              title="Delete job"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Confirm delete bar — slides up from bottom */}
      {confirmDelete && (
        <motion.div
          className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-5 py-3 bg-rose-50 dark:bg-rose-950/60 border-t border-rose-100 dark:border-rose-900/50"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
            <span className="text-xs font-medium text-rose-700 dark:text-rose-300">
              Delete this job? This cannot be undone.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleCancelDelete}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors"
            >
              Delete
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
