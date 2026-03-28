import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { io, type Socket } from 'socket.io-client'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { PageLoader } from '../components/ui/Spinner'
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
  RotateCcw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import StatCard from '../components/migration/StatCard'
import type { MigrationJob } from '../types'
import { migrationApi, getAccessToken } from '../services/api'
import WalkingPets from '../components/ui/WalkingPets'

const SOCKET_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? ''

/** Merge a raw socket payload into the current job state.
 *  Handles both flat  { processed_rows: 5 }
 *  and nested         { data: { processed_rows: 5 } }  payloads. */
function applyUpdate(prev: MigrationJob, raw: Record<string, unknown>): MigrationJob {
  // Unwrap nested `data` envelope if present
  const d: Record<string, unknown> =
    raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
      ? { ...raw, ...(raw.data as Record<string, unknown>) }
      : raw

  const status = (d.status as string | undefined) ?? prev.status
  const mappedStatus =
    status === 'stopped' ? 'failed' : (status as MigrationJob['status']) ?? prev.status

  return {
    ...prev,
    status:         mappedStatus,
    progress:       (d.progress          as number) ?? prev.progress,
    totalRows:      (d.total_rows         as number) || (d.totalRows         as number) || prev.totalRows,
    processedRows:  (d.processed_rows     as number) ?? (d.processedRows     as number) ?? prev.processedRows,
    correctRows:    (d.correct_rows       as number) ?? (d.correctRows       as number) ?? prev.correctRows,
    failedRows:     (d.failed_rows        as number) ?? (d.failedRows        as number) ?? prev.failedRows,
    processingRows: (d.processing_rows    as number) ?? (d.processingRows    as number) ?? prev.processingRows,
    completedAt:    (d.completed_at       as string) ?? (d.completedAt       as string) ?? prev.completedAt,
  }
}

export default function JobProgress() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const pageRef = usePageAnimation()

  const [job, setJob] = useState<MigrationJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'idle'>('idle')

  const socketRef       = useRef<Socket | null>(null)
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const socketStatusRef = useRef(socketStatus)
  socketStatusRef.current = socketStatus

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  /** Lightweight poll — only used when socket is disconnected/reconnecting */
  const startFallbackPoll = useCallback((id: string) => {
    if (pollRef.current) return
    pollRef.current = setInterval(() => {
      // Stop polling the moment socket reconnects
      if (socketStatusRef.current === 'connected') { stopPoll(); return }
      migrationApi.getStatus(id)
        .then((s) => setJob((prev) => prev ? applyUpdate(prev, {
          status:          s.status,
          total_rows:      s.totalRows,
          processed_rows:  s.processedRows,
          correct_rows:    s.correctRows,
          failed_rows:     s.failedRows,
          processing_rows: s.processingRows,
          completed_at:    s.completedAt,
        }) : prev))
        .catch(() => { /* ignore transient errors */ })
    }, 4000)
  }, [stopPoll])

  // ── Socket.IO — primary live updates ────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return

    let pendingPoll: ReturnType<typeof setInterval> | null = null

    const connectSocket = () => {
      if (socketRef.current) return // already connected
      setSocketStatus('connecting')

      const token = getAccessToken()
      const socket = io(SOCKET_URL, {
        auth:                 token ? { token } : {},
        transports:           ["WebSocket",'polling'],
        extraHeaders:         { 'ngrok-skip-browser-warning': '1' },
        reconnection:         true,
        reconnectionDelay:    1000,
        reconnectionAttempts: Infinity,
        timeout:              8000,
      })
      socketRef.current = socket

      const joinRoom = () => {
        socket.emit('join_job',  jobId)
        socket.emit('join_job',  { job_id: jobId })
        socket.emit('subscribe', jobId)
        socket.emit('subscribe', { job_id: jobId })
      }

      socket.on('connect', () => {
        if (import.meta.env.DEV) console.log('[Socket] connected, id:', socket.id)
        setSocketStatus('connected')
        stopPoll()
        joinRoom()
      })

      const handleUpdate = (eventName: string, raw: Record<string, unknown>) => {
        if (import.meta.env.DEV) console.log(`[Socket] event="${eventName}"`, raw)
        const incoming = (raw.job_id ?? raw.jobId ?? raw.id) as string | undefined
        if (incoming && incoming !== jobId) return
        setJob((prev) => prev ? applyUpdate(prev, raw) : prev)
      }

      const makeHandler = (eventName: string) => (raw: Record<string, unknown>) => handleUpdate(eventName, raw)

      socket.on('job_update',      makeHandler('job_update'))
      socket.on('job_progress',    makeHandler('job_progress'))
      socket.on('progress_update', makeHandler('progress_update'))
      socket.on('status_update',   makeHandler('status_update'))
      socket.on('progress',        makeHandler('progress'))
      socket.on('job_complete',    makeHandler('job_complete'))
      socket.on('job_completed',   makeHandler('job_completed'))
      socket.on('job_failed',      makeHandler('job_failed'))
      socket.on('job_error',       makeHandler('job_error'))

      socket.on('connect_error', (err) => {
        if (import.meta.env.DEV) console.log('[Socket] connect_error', err.message)
        setSocketStatus('disconnected')
        startFallbackPoll(jobId)
      })
      socket.on('disconnect', (reason) => {
        if (import.meta.env.DEV) console.log('[Socket] disconnected, reason:', reason)
        setSocketStatus('disconnected')
        startFallbackPoll(jobId)
      })
      // Socket.IO v4 — reconnect is a Manager event
      socket.io.on('reconnect', (attempt) => {
        if (import.meta.env.DEV) console.log('[Socket] reconnected after', attempt, 'attempt(s)')
        setSocketStatus('connected')
        stopPoll()
        joinRoom()
      })
    }

    migrationApi.getJob(jobId).then((j) => {
      setJob(j)
      setLoading(false)

      if (j.status === 'processing') {
        connectSocket()
        return
      }

      // Job is pending — poll until it transitions to processing, then connect
      if (j.status === 'pending') {
        pendingPoll = setInterval(() => {
          migrationApi.getJob(jobId).then((updated) => {
            setJob(updated)
            if (updated.status === 'processing') {
              clearInterval(pendingPoll!)
              pendingPoll = null
              connectSocket()
            } else if (updated.status !== 'pending') {
              // terminal or unexpected state — stop polling
              clearInterval(pendingPoll!)
              pendingPoll = null
            }
          }).catch((err) => { if (import.meta.env.DEV) console.error('Pending poll error:', err) })
        }, 3000)
      }
    }).catch((err) => { if (import.meta.env.DEV) console.error('Failed to load job:', err); setLoading(false) })

    return () => {
      if (pendingPoll) { clearInterval(pendingPoll); pendingPoll = null }
      socketRef.current?.disconnect()
      socketRef.current = null
      stopPoll()
    }
  }, [jobId, stopPoll, startFallbackPoll])

  // Disconnect once job reaches a terminal state
  useEffect(() => {
    if (job?.status === 'completed' || job?.status === 'failed') {
      socketRef.current?.disconnect()
      socketRef.current = null
      stopPoll()
      setSocketStatus('idle')
    }
  }, [job?.status, stopPoll])

  async function handleRestart() {
    if (!jobId || restarting) return
    setRestarting(true)
    try {
      await migrationApi.retry(jobId)
      const refreshed = await migrationApi.getJob(jobId)
      setJob(refreshed)
    } catch (err) {
      console.error('Restart failed:', err)
    } finally {
      setRestarting(false)
    }
  }

  async function handleRetry() {
    if (!jobId || retrying) return
    setRetrying(true)
    try {
      // Fetch only the failed rows for this job
      const failedRows = await migrationApi.getRows(jobId, { status: 'failed' })
      // Fire ai-retry for each failed row individually
      await Promise.allSettled(failedRows.map((row) => migrationApi.aiRetry(row.id)))
      // Re-fetch full job so status + counters reflect the new run
      const refreshed = await migrationApi.getJob(jobId)
      setJob(refreshed)
    } catch (err) {
      console.error('Retry failed:', err)
    } finally {
      setRetrying(false)
    }
  }

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

  if (loading) return <PageLoader label="Loading job…" />
  if (!job) return <PageLoader label="Job not found." />

  const isLive = job.status === 'processing'
  const isDone = job.status === 'completed'

  // Data is already clamped in mapJob — just alias for readability
  const total          = Math.max(job.totalRows, 1)
  const processedRows  = job.processedRows
  const correctRows    = job.correctRows
  const failedRows     = job.failedRows
  const processingRows = job.processingRows

  // Two-phase progress: phase 1 = processing (0→50%), phase 2 = correction (50→100%)
  const phase1Pct   = Math.min((processedRows / total) * 50, 50)
  const phase2Pct   = Math.min(((correctRows + failedRows) / total) * 50, 50)
  const combinedPct = Math.min(Math.round(phase1Pct + phase2Pct), 100)

  const isPhase2 = isLive && processedRows >= total
  const isPhase1 = isLive && !isPhase2

  return (
    <div ref={pageRef} className="min-h-screen px-4 sm:px-8 py-6 sm:py-10">
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
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Job Progress
              </p>
              <Badge variant="status" status={job.status} size="xs" />
              <Badge variant="type" type={job.type} size="xs" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-black dark:text-white">
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
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 border transition-colors ${
                  socketStatus === 'connected'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50'
                    : socketStatus === 'connecting'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/50'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/50'
                }`}
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {socketStatus === 'connected' ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                ) : socketStatus === 'connecting' ? (
                  <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                )}
                <span className={`text-xs font-medium ${
                  socketStatus === 'connected'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : socketStatus === 'connecting'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {socketStatus === 'connected'     ? 'Live · socket' :
                   socketStatus === 'connecting'    ? 'Connecting…'   :
                   'Reconnecting…'}
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
        <div className="relative themed-card rounded-2xl p-4 sm:p-6 mb-6">
          {/* Cat gif sitting at top-center of the card */}
          <img
            src="/src/assests/gatos-memes-gato-meme.gif"
            alt="cat"
            className="absolute left-1/2 -translate-x-1/2 h-12 w-auto select-none pointer-events-none z-10"
            style={{ top: '-2.15rem' }}
            draggable={false}
          />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {isDone
                  ? 'Migration complete'
                  : isPhase2
                  ? 'Phase 2 · Cleaning & correcting…'
                  : isLive
                  ? 'Phase 1 · Processing rows…'
                  : 'Queued'}
              </span>
              {isLive && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  ({isPhase2 ? 'correction' : 'processing'})
                </span>
              )}
            </div>
            <span className="text-xl sm:text-2xl font-light text-slate-800 dark:text-slate-200 tabular-nums">
              {combinedPct}%
            </span>
          </div>

          {/* Two-segment bar: amber = phase 1 (0→50%), emerald = phase 2 (50→100%) */}
          <div className="relative w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            {/* Phase 1: Processing (amber) */}
            <motion.div
              className={`absolute left-0 top-0 h-full rounded-full bg-amber-500 ${isPhase1 ? 'after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent' : ''}`}
              animate={{ width: `${phase1Pct}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Phase 2: Correction (emerald) */}
            <motion.div
              className={`absolute top-0 h-full rounded-r-full bg-emerald-500 ${isPhase2 ? 'after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent' : ''}`}
              animate={{ left: `${phase1Pct}%`, width: `${phase2Pct}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>

          {/* Phase labels */}
          <div className="flex items-center justify-between mt-2 mb-1">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Processing · {processedRows}/{total}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Corrected · {correctRows + failedRows}/{total}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {processedRows} / {total} rows processed
            </span>
            {isLive && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                ~{Math.max(0, Math.ceil((total - processedRows) / 8))} seconds remaining
              </span>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <StatCard
            label="Total"
            value={total}
            icon={<Hash className="w-4 h-4" />}
            color="slate"
            delay={0.05}
          />
          <StatCard
            label="Correct"
            value={correctRows}
            icon={<CheckCircle2 className="w-4 h-4" />}
            color="emerald"
            sublabel={`${Math.round((correctRows / total) * 100)}%`}
            delay={0.1}
          />
          <StatCard
            label="Failed"
            value={failedRows}
            icon={<XCircle className="w-4 h-4" />}
            color="rose"
            sublabel={failedRows > 0 ? 'needs review' : 'none so far'}
            delay={0.15}
          />
          <StatCard
            label="Processing"
            value={processingRows}
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
                  {correctRows} records imported · {failedRows} records need attention
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {failedRows > 0 && (
                <Button
                  variant="primary"
                  size="md"
                  icon={<RotateCcw className="w-4 h-4" />}
                  loading={retrying}
                  onClick={handleRetry}
                >
                  {retrying ? 'Retrying…' : `Retry Failed (${failedRows})`}
                </Button>
              )}
              <Button
                variant="secondary"
                size="md"
                icon={<RotateCcw className="w-4 h-4" />}
                loading={restarting}
                onClick={handleRestart}
              >
                {restarting ? 'Restarting…' : 'Full Restart'}
              </Button>
              {failedRows > 0 && (
                <Button
                  variant="danger"
                  size="md"
                  icon={<AlertTriangle className="w-4 h-4" />}
                  onClick={() => navigate(`/jobs/${job.id}/failed`)}
                >
                  View Failed Rows
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
        {isLive && failedRows > 0 && (
          <motion.div
            className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-4 flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <p className="text-xs text-rose-700 dark:text-rose-400">
              <span className="font-semibold">{failedRows} rows failed</span> so far. You can review them after migration completes.
            </p>
          </motion.div>
        )}

        {/* Failed state */}
        {job.status === 'failed' && (
          <motion.div
            className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-rose-100 dark:bg-rose-900/40 rounded-xl">
                <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-300">
                  Migration stopped or failed
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                  {correctRows} records imported · {failedRows} records failed. Retry to reprocess failed rows.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="primary"
                size="md"
                icon={<RotateCcw className="w-4 h-4" />}
                loading={retrying}
                onClick={handleRetry}
              >
                {retrying ? 'Retrying…' : 'Retry Failed Rows'}
              </Button>
              <Button
                variant="secondary"
                size="md"
                icon={<RotateCcw className="w-4 h-4" />}
                loading={restarting}
                onClick={handleRestart}
              >
                {restarting ? 'Restarting…' : 'Full Restart'}
              </Button>
              {failedRows > 0 && (
                <Button
                  variant="secondary"
                  size="md"
                  icon={<AlertTriangle className="w-4 h-4" />}
                  onClick={() => navigate(`/jobs/${job.id}/failed`)}
                >
                  View Failed Rows
                </Button>
              )}
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
