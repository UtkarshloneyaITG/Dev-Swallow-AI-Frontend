import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { PageLoader } from '../components/ui/Spinner'
import { ArrowLeft, AlertTriangle, Download, Filter } from 'lucide-react'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import FailedRowCard from '../components/rows/FailedRowCard'
import ManualEditModal from '../components/rows/ManualEditModal'
import type { FailedRow } from '../types'
import { migrationApi } from '../services/api'

export default function FailedRows() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [job, setJob] = useState<{ id: string; name: string; failedRows: number } | null>(null)
  const [rows, setRows] = useState<FailedRow[]>([])
  const [editingRow, setEditingRow] = useState<FailedRow | null>(null)
  const [loading, setLoading] = useState(true)
  const pageRef = usePageAnimation()

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    Promise.all([
      migrationApi.getJob(jobId)
        .then((j) => setJob({ id: j.id, name: j.name, failedRows: j.failedRows }))
        .catch(console.error),
      migrationApi.getRows(jobId, { status: 'failed', limit: 500 })
        .then(setRows)
        .catch(console.error),
    ]).finally(() => setLoading(false))
  }, [jobId])

  async function handleRetry(rowId: string) {
    setRows((prev) =>
      prev.map((r) => r.id === rowId ? { ...r, status: 'retrying' as const } : r)
    )
    try {
      await migrationApi.aiRetry(rowId)
      setTimeout(() => setRows((prev) => prev.filter((r) => r.id !== rowId)), 2000)
    } catch {
      setRows((prev) =>
        prev.map((r) => r.id === rowId ? { ...r, status: 'failed' as const } : r)
      )
    }
  }

  async function handleSave(rowId: string, updatedData: Record<string, unknown>) {
    try {
      await migrationApi.correct(rowId, updatedData)
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId ? { ...r, originalData: updatedData, status: 'resolved' as const } : r
        )
      )
    } catch (err) {
      console.error('Failed to save correction:', err)
    }
  }

  if (loading) return <PageLoader label="Loading failed rows…" />
  if (!job) return <PageLoader label="Job not found." />

  return (
    <div ref={pageRef} className="min-h-screen px-8 py-10">
      <div className="max-w-4xl mx-auto">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Job
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              Failed Rows
            </p>
            <h1 className="text-3xl font-light tracking-tight text-black dark:text-white">
              Review errors
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-light mt-1">
              {job.name} · {rows.length} row{rows.length !== 1 ? 's' : ''} need attention
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Filter className="w-3.5 h-3.5" />}
            >
              Filter
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={() => navigate(`/jobs/${jobId}/export`)}
            >
              Export Failed
            </Button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl">
          <div className="p-2 bg-rose-100 dark:bg-rose-900/40 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
              {rows.length} records failed validation
            </p>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
              Use "Retry with AI" to let the AI attempt auto-correction, or "Edit Manually" to fix data directly.
            </p>
          </div>
          <Badge color="rose" size="xs">
            {rows.length} pending
          </Badge>
        </div>

        {/* Rows */}
        {rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <FailedRowCard
                key={row.id}
                row={row}
                index={i}
                onRetry={handleRetry}
                onEdit={(r) => setEditingRow(r)}
              />
            ))}
          </div>
        ) : (
          <motion.div
            className="flex flex-col items-center justify-center py-20 text-center"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              All rows resolved!
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
              No more failed rows to review.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/jobs/${jobId}/export`)}
            >
              Export Results
            </Button>
          </motion.div>
        )}
      </div>

      {/* Edit modal */}
      <ManualEditModal
        isOpen={editingRow !== null}
        onClose={() => setEditingRow(null)}
        row={editingRow}
        onSave={handleSave}
      />
    </div>
  )
}
