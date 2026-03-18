import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  ArrowLeft,
  AlertTriangle,
  Download,
  Table,
  Square,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import ProgressBar from '../components/ui/ProgressBar'
import StatCard from '../components/migration/StatCard'
import type { MigrationJob } from '../types'
import { migrationApi } from '../services/api'
import WalkingPets from '../components/ui/WalkingPets'

export default function JobProgress() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const pageRef = usePageAnimation()

  const [job, setJob] = useState<MigrationJob | null>(null)
  const [stopping, setStopping] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initial load
  useEffect(() => {
    if (!jobId) return
    migrationApi.getJob(jobId).then(setJob).catch(console.error)
  }, [jobId])

  // Poll status every 3 seconds while processing
  useEffect(() => {
    if (!jobId || job?.status !== 'processing') return

    intervalRef.current = setInterval(() => {
      migrationApi.getStatus(jobId)
        .then((s) => setJob((prev) => prev ? {
          // Keep stable fields (name, type, id, createdAt) from the full job load;
          // only update live counters returned by the lightweight /status endpoint
          ...prev,
          status:        s.status,
          progress:      s.progress,
          totalRows:     s.totalRows  || prev.totalRows,
          correctRows:   s.correctRows,
          failedRows:    s.failedRows,
          processingRows:s.processingRows,
          completedAt:   s.completedAt ?? prev.completedAt,
        } : s))
        .catch(console.error)
    }, 3000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jobId, job?.status])

  // Stop polling when done
  useEffect(() => {
    if (job?.status === 'completed' || job?.status === 'failed') {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [job?.status])

  async function handleStop() {
    if (!jobId || stopping) return
    setStopping(true)
    try {
      await migrationApi.stop(jobId)
      setJob((prev) => prev ? { ...prev, status: 'failed' } : prev)
    } catch (err) {
      console.error('Stop failed:', err)
    } finally {
      setStopping(false)
    }
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Loading…</p>
          <Button variant="primary" size="sm" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  const isLive = job.status === 'processing'
  const isDone = job.status === 'completed'

  const progressColor =
    isDone ? 'emerald' : isLive ? 'amber' : 'slate'

  return (
    <div ref={pageRef} className="min-h-screen px-8 py-10">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Job Progress
              </p>
              <Badge variant="status" status={job.status} size="xs" />
              <Badge variant="type" type={job.type} size="xs" />
            </div>
            <h1 className="text-3xl font-light tracking-tight text-black dark:text-white">
              {job.name}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-light mt-1">
              Started{' '}
              {new Date(job.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {job.completedAt &&
                ` · Completed ${new Date(job.completedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>

          {isLive && (
            <div className="flex items-center gap-3">
              <motion.div
                className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-full px-3 py-1.5"
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Live · refreshes every 3s
                </span>
              </motion.div>
              <Button
                variant="danger"
                size="sm"
                icon={<Square className="w-3.5 h-3.5" />}
                loading={stopping}
                onClick={handleStop}
              >
                {stopping ? 'Stopping…' : 'Stop'}
              </Button>
            </div>
          )}
        </div>

        {/* Progress bar section */}
        <div className="themed-card rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {isDone ? 'Migration complete' : isLive ? 'Migration in progress…' : 'Queued'}
            </span>
            <span className="text-2xl font-light text-slate-800 dark:text-slate-200 tabular-nums">
              {job.progress}%
            </span>
          </div>
          <ProgressBar
            value={job.progress}
            color={progressColor}
            size="lg"
            animated={isLive}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {job.correctRows + job.failedRows} / {job.totalRows} rows processed
            </span>
            {isLive && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                ~{Math.max(0, Math.ceil((job.totalRows - job.correctRows - job.failedRows) / 8))} seconds remaining
              </span>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total"
            value={job.totalRows}
            icon={<Hash className="w-4 h-4" />}
            color="slate"
            delay={0.05}
          />
          <StatCard
            label="Correct"
            value={job.correctRows}
            icon={<CheckCircle2 className="w-4 h-4" />}
            color="emerald"
            sublabel={job.totalRows > 0 ? `${Math.round((job.correctRows / job.totalRows) * 100)}%` : undefined}
            delay={0.1}
          />
          <StatCard
            label="Failed"
            value={job.failedRows}
            icon={<XCircle className="w-4 h-4" />}
            color="rose"
            sublabel={job.failedRows > 0 ? 'needs review' : 'none so far'}
            delay={0.15}
          />
          <StatCard
            label="Processing"
            value={job.processingRows}
            icon={<Clock className="w-4 h-4" />}
            color="amber"
            sublabel={isLive ? 'in queue' : 'done'}
            delay={0.2}
          />
        </div>

        {/* Action buttons — shown when complete */}
        {isDone && (
          <motion.div
            className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Migration completed successfully
                </h3>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {job.correctRows} records imported · {job.failedRows} records need attention
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {job.failedRows > 0 && (
                <Button
                  variant="danger"
                  size="md"
                  icon={<AlertTriangle className="w-4 h-4" />}
                  onClick={() => navigate(`/jobs/${job.id}/failed`)}
                >
                  View Failed Rows ({job.failedRows})
                </Button>
              )}
              <Button
                variant="secondary"
                size="md"
                icon={<Download className="w-4 h-4" />}
                onClick={() => navigate(`/jobs/${job.id}/export`)}
              >
                Export Results
              </Button>
              <Button
                variant="secondary"
                size="md"
                icon={<Table className="w-4 h-4" />}
                onClick={() => navigate(`/jobs/${job.id}/results`)}
              >
                View Results Grid
              </Button>
            </div>
          </motion.div>
        )}

        {/* Failed rows hint when processing */}
        {isLive && job.failedRows > 0 && (
          <motion.div
            className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-4 flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <p className="text-xs text-rose-700 dark:text-rose-400">
              <span className="font-semibold">{job.failedRows} rows failed</span> so far. You can review them after migration completes.
            </p>
          </motion.div>
        )}

        {/* Pending state */}
        {job.status === 'pending' && (
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Clock className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Queued for processing
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                This job is waiting in the queue. It will start automatically when a worker becomes available.
              </p>
            </div>
          </div>
        )}
      </div>

      <WalkingPets active={isLive} />
    </div>
  )
}
