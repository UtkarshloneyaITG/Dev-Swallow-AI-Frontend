import { useState, useEffect } from 'react'
import type { ComponentType } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { PageLoader } from '../components/ui/Spinner'
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  XCircle,
  Layers,
  FileJson,
} from 'lucide-react'
import Button from '../components/ui/Button'
import { migrationApi, exportApi } from '../services/api'

type ExportType = 'correct' | 'failed' | 'all'

const exportCardConfig: Record<
  ExportType,
  {
    label: string
    sublabel: string
    icon: ComponentType<{ className?: string }>
    iconBg: string
    iconText: string
    border: string
    bg: string
    btnVariant: 'primary' | 'secondary' | 'danger'
  }
> = {
  correct: {
    label: 'Correct Records',
    sublabel: 'Successfully validated and ready for Shopify import',
    icon: CheckCircle2,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-100 dark:border-emerald-900/50',
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/30',
    btnVariant: 'primary',
  },
  failed: {
    label: 'Failed Records',
    sublabel: 'Records that failed validation — review or fix manually',
    icon: XCircle,
    iconBg: 'bg-rose-100 dark:bg-rose-900/40',
    iconText: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-100 dark:border-rose-900/50',
    bg: 'bg-rose-50/50 dark:bg-rose-950/30',
    btnVariant: 'danger',
  },
  all: {
    label: 'All Records',
    sublabel: 'Complete dataset including both correct and failed rows',
    icon: Layers,
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconText: 'text-slate-500 dark:text-slate-400',
    border: 'border-slate-100 dark:border-slate-800',
    bg: 'bg-slate-50/50 dark:bg-slate-900/50',
    btnVariant: 'secondary',
  },
}

const EXPORT_TYPES: ExportType[] = ['correct', 'failed', 'all']

export default function Export() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const pageRef = usePageAnimation()

  const [job, setJob] = useState<{ id: string; name: string; correctRows: number; failedRows: number; totalRows: number } | null>(null)
  const [downloading, setDownloading] = useState<ExportType | null>(null)

  useEffect(() => {
    if (!jobId) return
    migrationApi.getJob(jobId)
      .then((j) => setJob({ id: j.id, name: j.name, correctRows: j.correctRows, failedRows: j.failedRows, totalRows: j.totalRows }))
      .catch(console.error)
  }, [jobId])

  function countFor(type: ExportType): number {
    if (!job) return 0
    if (type === 'correct') return job.correctRows
    if (type === 'failed')  return job.failedRows
    return job.totalRows
  }

  async function handleDownload(type: ExportType) {
    if (!jobId) return
    setDownloading(type)
    try {
      const blob = await exportApi.download(jobId, type)
      exportApi.triggerDownload(blob, `${jobId}_${type}.ndjson`)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setDownloading(null)
    }
  }

  if (!job) {
    return (
      <PageLoader />
    )
  }

  return (
    <div ref={pageRef} className="min-h-screen px-8 py-10">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Job
        </button>

        {/* Header */}
        <div className="mb-9">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
            Export Results
          </p>
          <h1 className="text-3xl font-light tracking-tight text-black dark:text-white">
            Download your data
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-light mt-1">
            {job.name} · Exports are formatted as JSON
          </p>
        </div>

        {/* Export cards */}
        <div className="space-y-4">
          {EXPORT_TYPES.map((type, i) => {
            const cfg = exportCardConfig[type]
            const Icon = cfg.icon
            const count = countFor(type)
            const isDownloading = downloading === type

            return (
              <motion.div
                key={type}
                className={`rounded-2xl border p-6 ${cfg.bg} ${cfg.border} hover:shadow-sm transition-all duration-200`}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl ${cfg.iconBg}`}>
                      <Icon className={`w-5 h-5 ${cfg.iconText}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {cfg.label}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xs">
                        {cfg.sublabel}
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-white/80 dark:bg-slate-700/80 border border-black/5 dark:border-white/5 flex items-center justify-center">
                            <FileJson className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                          </div>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {`${job.id}_${type}.ndjson`}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {count} record{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant={cfg.btnVariant}
                    size="md"
                    icon={<Download className="w-4 h-4" />}
                    loading={isDownloading}
                    onClick={() => handleDownload(type)}
                  >
                    {isDownloading ? 'Preparing…' : 'Download'}
                  </Button>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Info note */}
        <motion.div
          className="mt-6 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            All exports are in <span className="font-semibold text-slate-700 dark:text-slate-300">JSON format</span> and contain the full
            record data as processed by Swallow. Correct records are ready to be imported
            into Shopify via the Admin API or Shopify's import tools.
          </p>
        </motion.div>

        {/* Back to dashboard */}
        <div className="mt-6 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </Button>
          {job.failedRows > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/jobs/${jobId}/failed`)}
            >
              Review Failed Rows
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
