import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { PageLoader } from '../components/ui/Spinner'
import {
  ArrowLeft, Download, CheckCircle2, XCircle, RefreshCw,
  Table2, Eye, AlertCircle, Layers,
} from 'lucide-react'
import { mergedApi } from '../services/api'
import type { MergedJob, FailedRow } from '../types'
import ExcelGrid from '../components/ui/ExcelGrid'
import type { GridRow } from '../components/ui/ExcelGrid'
import ShopifyCsvView from '../components/migration/ShopifyCsvView'
import { convertToGridRows, exportToShopifyCSV } from './BatchExport'

type ViewMode = 'table' | 'csv'
type ExportingState = null | 'all' | 'correct' | 'failed'

/** Strip the `_<idx>` suffix added by convertToGridRows to recover the original row ID */
function sourceRowId(gridId: string): string {
  return gridId.replace(/_\d+$/, '')
}

export default function MergedJobView() {
  const { mergedId } = useParams<{ mergedId: string }>()
  const navigate = useNavigate()
  const pageRef = usePageAnimation()

  const [job, setJob] = useState<MergedJob | null>(null)
  const [rawRows, setRawRows] = useState<FailedRow[]>([])
  const [gridRows, setGridRows] = useState<GridRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [exporting, setExporting] = useState<ExportingState>(null)
  const [activeTab, setActiveTab] = useState<'data' | 'sources'>('data')
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Load job + rows ─────────────────────────────────────────────────────────
  const loadData = useCallback(async (id: string) => {
    const PAGE = 500
    // Fetch job metadata and first page together
    const [jobData, firstPage] = await Promise.all([
      mergedApi.get(id),
      mergedApi.getRows(id, { skip: 0, limit: PAGE }),
    ])
    const total = jobData.totalRows
    // Only fetch additional pages if there are more rows beyond the first page
    let rows = firstPage
    if (total > PAGE) {
      const offsets: number[] = []
      for (let skip = PAGE; skip < total; skip += PAGE) offsets.push(skip)
      const rest = await Promise.all(
        offsets.map((skip) => mergedApi.getRows(id, { skip, limit: PAGE }))
      )
      rows = [firstPage, ...rest].flat()
    }
    return { jobData, rows }
  }, [])

  useEffect(() => {
    if (!mergedId) return
    setLoading(true)
    setLoadError(null)
    loadData(mergedId)
      .then(({ jobData, rows }) => {
        setJob(jobData)
        setRawRows(rows)
        setGridRows(convertToGridRows(rows))
      })
      .catch((err) => setLoadError(String(err)))
      .finally(() => setLoading(false))
  }, [mergedId, loadData])

  // ── Save edits ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (editedRows: GridRow[]) => {
    if (!mergedId) return
    const changed = editedRows.filter((r) => r.edited)
    if (changed.length === 0) return
    setSaving(true)
    try {
      await Promise.all(
        changed.map((row) =>
          mergedApi.updateRow(mergedId, sourceRowId(row.id), row.data as Record<string, unknown>)
        )
      )
      setGridRows((prev) =>
        prev.map((r) => {
          const updated = changed.find((c) => c.id === r.id)
          return updated ? { ...updated, edited: false } : r
        })
      )
    } catch (err) {
      console.error('Save failed', err)
    } finally {
      setSaving(false)
    }
  }, [mergedId])

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async (type: 'all' | 'correct' | 'failed') => {
    if (!mergedId || exporting) return
    setExporting(type)
    try {
      let rows = rawRows
      if (type === 'correct') rows = rawRows.filter((r) => r.status === 'resolved')
      if (type === 'failed')  rows = rawRows.filter((r) => r.status !== 'resolved')
      exportToShopifyCSV(rows, `merged_${mergedId.slice(-8)}_${type}.csv`)
    } finally {
      setExporting(null)
    }
  }, [rawRows, mergedId, exporting])

  // ── Sync source job ─────────────────────────────────────────────────────────
  const handleSync = useCallback(async (sourceJobId: string) => {
    if (!mergedId || syncing) return
    setSyncing(sourceJobId)
    setSyncMsg(null)
    try {
      await mergedApi.syncSourceJob(mergedId, sourceJobId)
      const { jobData, rows } = await loadData(mergedId)
      setJob(jobData)
      setRawRows(rows)
      setGridRows(convertToGridRows(rows))
      setSyncMsg({ text: `Job synced — ${rows.length} rows reloaded.`, ok: true })
    } catch (err) {
      setSyncMsg({ text: `Sync failed: ${String(err)}`, ok: false })
    } finally {
      setSyncing(null)
    }
  }, [mergedId, syncing, loadData])

  // ── Derived counts ──────────────────────────────────────────────────────────
  const totalRows    = gridRows.length
  const totalCorrect = gridRows.filter((r) => r.status === 'correct').length
  const totalFailed  = gridRows.filter((r) => r.status === 'failed').length

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <PageLoader label="Loading merged job…" />

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <AlertCircle className="w-8 h-8 text-rose-500" />
      <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
      <button
        onClick={() => navigate('/batch-export')}
        className="text-xs underline text-slate-500 hover:text-slate-700 transition-colors"
      >
        Back to Batch Export
      </button>
    </div>
  )

  if (!job) return null

  return (
    <div ref={pageRef} className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-black/5 dark:border-white/5">
        <button
          onClick={() => navigate('/batch-export')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-slate-900 dark:text-white truncate">
            {job.name}
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {job.sourceJobIds.length} source job{job.sourceJobIds.length !== 1 ? 's' : ''} ·{' '}
            Created {new Date(job.createdAt).toLocaleDateString()}
          </p>
        </div>

        {/* Stats pills */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            <Layers className="w-3 h-3" />{totalRows} rows
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />{totalCorrect}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400">
            <XCircle className="w-3 h-3" />{totalFailed}
          </span>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-1 px-4 sm:px-6 border-b border-black/5 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/30">
        {(['data', 'sources'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab
                ? 'border-orange-500 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            ].join(' ')}
          >
            {tab === 'data' ? 'Edit Data' : `Source Jobs (${job.sourceJobIds.length})`}
          </button>
        ))}
        {saving && (
          <span className="ml-auto text-xs text-slate-400 flex items-center gap-1.5 pr-2">
            <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            Saving…
          </span>
        )}
      </div>

      {/* ── Tab: Edit Data ─────────────────────────────────────────────────── */}
      {activeTab === 'data' && (
        <div className="flex flex-col flex-1 min-h-0">

          {/* Toolbar */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-black/5 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/5 rounded-full p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Table2 className="w-3 h-3" />Table
              </button>
              <button
                onClick={() => setViewMode('csv')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  viewMode === 'csv'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Eye className="w-3 h-3" />Shopify CSV
              </button>
            </div>

            <div className="flex-1" />

            {/* Export buttons */}
            <button
              disabled={exporting !== null}
              onClick={() => handleExport('failed')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {exporting === 'failed'
                ? <><span className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />Exporting…</>
                : <><XCircle className="w-3 h-3" />Failed ({totalFailed})</>}
            </button>
            <button
              disabled={exporting !== null}
              onClick={() => handleExport('correct')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {exporting === 'correct'
                ? <><span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />Exporting…</>
                : <><CheckCircle2 className="w-3 h-3" />Correct ({totalCorrect})</>}
            </button>
            <button
              disabled={exporting !== null}
              onClick={() => handleExport('all')}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-slate-800 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {exporting === 'all'
                ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white dark:border-slate-400 dark:border-t-slate-900 rounded-full animate-spin" />Exporting…</>
                : <><Download className="w-3 h-3" />All ({totalRows})</>}
            </button>
          </div>

          {/* Grid */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-4 pb-4">
            {viewMode === 'table'
              ? <ExcelGrid rows={gridRows} onSave={handleSave} />
              : <ShopifyCsvView rows={gridRows} />}
          </div>
        </div>
      )}

      {/* ── Tab: Source Jobs ────────────────────────────────────────────────── */}
      {activeTab === 'sources' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          {syncMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-5 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm ${
                syncMsg.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'
              }`}
            >
              {syncMsg.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {syncMsg.text}
            </motion.div>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 max-w-lg">
            Re-sync a source job to pull in its latest corrected rows — this replaces all rows
            from that job within this merged view.
          </p>

          <div className="space-y-2.5 max-w-xl">
            {job.sourceJobIds.map((sourceId) => (
              <div
                key={sourceId}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm"
              >
                <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                    {sourceId}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Source job</p>
                </div>
                <button
                  onClick={() => handleSync(sourceId)}
                  disabled={syncing !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-950/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${syncing === sourceId ? 'animate-spin' : ''}`} />
                  {syncing === sourceId ? 'Syncing…' : 'Sync'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
