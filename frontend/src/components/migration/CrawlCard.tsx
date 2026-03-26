import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Globe, Clock, FileStack, MonitorCheck, ArrowRight, AlertTriangle, PauseCircle, Trash2 } from 'lucide-react'
import type { StoredCrawlSession } from '../../types'

interface CrawlCardProps {
  session: StoredCrawlSession
  index?: number
  onDelete?: (url: string) => void
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function fmtSeconds(s: number): string {
  const n = Math.floor(s)
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`
}

const statusConfig = {
  crawling:  { label: 'Crawling',   bg: 'bg-emerald-100 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500 animate-pulse' },
  stopping:  { label: 'Stopping',   bg: 'bg-amber-100 dark:bg-amber-950/50',     text: 'text-amber-700 dark:text-amber-400',     dot: 'bg-amber-500' },
  paused:    { label: 'Paused',     bg: 'bg-orange-100 dark:bg-orange-950/50',   text: 'text-orange-700 dark:text-orange-400',   dot: 'bg-orange-500' },
  completed: { label: 'Completed',  bg: 'bg-blue-100 dark:bg-blue-950/50',       text: 'text-blue-700 dark:text-blue-400',       dot: 'bg-blue-500' },
  error:     { label: 'Error',      bg: 'bg-rose-100 dark:bg-rose-950/50',       text: 'text-rose-700 dark:text-rose-400',       dot: 'bg-rose-500' },
  idle:      { label: 'Idle',       bg: 'bg-slate-100 dark:bg-slate-800',        text: 'text-slate-500 dark:text-slate-400',     dot: 'bg-slate-400' },
}

export default function CrawlCard({ session, index = 0, onDelete }: CrawlCardProps) {
  const navigate = useNavigate()
  const cfg = statusConfig[session.status] ?? statusConfig.idle
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canResume = session.status === 'paused' || session.status === 'completed'

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    onDelete?.(session.url)
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
      onClick={() => !confirmDelete && navigate('/new-migration', { state: { prefillUrl: session.url } })}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/40">
            <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-black dark:group-hover:text-white transition-colors truncate max-w-[280px]">
              {session.url.replace(/^https?:\/\//, '')}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono uppercase">web crawl</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all duration-150" />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              {session.pagesVisited}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Pages</div>
          </div>
          <div className="w-px h-6 bg-slate-100 dark:bg-slate-700" />
          <div className="text-center">
            <div className="text-sm font-semibold text-sky-600 tabular-nums">
              {session.productsScraped}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Products</div>
          </div>
          <div className="w-px h-6 bg-slate-100 dark:bg-slate-700" />
          <div className="text-center">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              {fmtSeconds(session.elapsedSeconds)}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Duration</div>
          </div>
        </div>

        {/* Bottom-right: hints + timestamp + delete */}
        <div className="flex items-center gap-2">
          {session.status === 'error' && (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          )}
          {session.status === 'paused' && (
            <PauseCircle className="w-3.5 h-3.5 text-orange-400" />
          )}
          {session.status === 'completed' && session.productsScraped > 0 && (
            <div className="flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400 font-medium">
              <FileStack className="w-3 h-3" />
              Use data
            </div>
          )}
          {canResume && session.status === 'paused' && (
            <div className="flex items-center gap-1 text-xs text-orange-500 dark:text-orange-400 font-medium">
              <MonitorCheck className="w-3 h-3" />
              Resume
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(session.startedAt)}
          </div>
          {onDelete && !confirmDelete && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all duration-150"
              title="Remove crawl"
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
              Remove this crawl session?
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
              Remove
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
