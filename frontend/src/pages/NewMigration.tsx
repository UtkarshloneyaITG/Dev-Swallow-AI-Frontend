import { useState, useRef, useEffect } from 'react'
import { usePageAnimation } from '../hooks/usePageAnimation'
import type { ComponentType, FormEvent, DragEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { migrationApi, crawlApi } from '../services/api'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingBag,
  Users,
  ShoppingCart,
  Upload,
  FileText,
  Sparkles,
  Globe,
  Sheet,
  ArrowRight,
  ArrowLeft,
  X,
  CheckCircle2,
  SkipForward,
  Play,
  Square,
  RotateCcw,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import Button from '../components/ui/Button'
import type { MigrationType, InputFormat } from '../types'

type CrawlState = 'idle' | 'crawling' | 'stopping' | 'paused' | 'completed' | 'error'

function fmtSeconds(s: number): string {
  const n = Math.floor(s)
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`
}


interface MigrationTypeOption {
  value: MigrationType
  label: string
  icon: ComponentType<{ className?: string }>
  desc: string
}

interface InputFormatOption {
  value: InputFormat
  label: string
  icon: ComponentType<{ className?: string }>
  desc: string
}

const migrationTypes: MigrationTypeOption[] = [
  {
    value: 'product',
    label: 'Product',
    icon: ShoppingBag,
    desc: 'Import product catalog, variants, images',
  },
  {
    value: 'customer',
    label: 'Customer',
    icon: Users,
    desc: 'Import customer profiles and addresses',
  },
  {
    value: 'order',
    label: 'Order',
    icon: ShoppingCart,
    desc: 'Import historical order data',
  },
]

const inputFormats: InputFormatOption[] = [
  { value: 'json',         label: 'JSON',         icon: FileText,  desc: 'Structured JSON data' },
  { value: 'csv',          label: 'CSV',          icon: FileText,  desc: 'Comma-separated values' },
  { value: 'xml',          label: 'XML',          icon: FileText,  desc: 'XML / SOAP format' },
  { value: 'text',         label: 'Text',         icon: FileText,  desc: 'Plain text lines' },
  { value: 'raw_text',     label: 'Raw Text',     icon: FileText,  desc: 'Unstructured raw data' },
  { value: 'google_sheet', label: 'Google Sheet', icon: Sheet,     desc: 'Import via Sheets URL' },
  { value: 'ai_parser',    label: 'AI Parser',    icon: Sparkles,  desc: 'Let AI figure it out' },
]

const placeholders: Record<InputFormat, string> = {
  json: `[
  {
    "first_name": "Jordan",
    "last_name": "Smith",
    "email": "jordan@example.com",
    "phone": "+1-555-0192",
    "accepts_marketing": true
  }
]`,
  csv: `first_name,last_name,email,phone,accepts_marketing
Jordan,Smith,jordan@example.com,+1-555-0192,true
Amara,Okonkwo,amara@example.com,,false`,
  xml: `<customers>
  <customer>
    <first_name>Jordan</first_name>
    <last_name>Smith</last_name>
    <email>jordan@example.com</email>
  </customer>
</customers>`,
  text: `Jordan Smith | jordan@example.com | +1-555-0192
Amara Okonkwo | amara@example.com`,
  raw_text: `Customer: Jordan Smith, email jordan@example.com, phone 555-0192, marketing opted in.`,
  ai_parser: `Paste any format here — JSON, CSV, natural language, or mixed data. Our AI will extract and normalize the records automatically.`,
  website_url: '',
  google_sheet: '',
}

export default function NewMigration() {
  const navigate = useNavigate()
  const pageRef = usePageAnimation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()

  const [step, setStep] = useState<1 | 2>(1)
  const [jobName, setJobName] = useState('')
  const [migrationType, setMigrationType] = useState<MigrationType>('product')
  const [inputFormat, setInputFormat] = useState<InputFormat>('json')
  const [rawData, setRawData] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [googleSheetUrl, setGoogleSheetUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})


  // ── Crawler state ──────────────────────────────────────────────────────
  const [crawlState, setCrawlState]     = useState<CrawlState>('idle')
  const [crawlStats, setCrawlStats]     = useState({ pagesVisited: 0, productsScraped: 0, elapsedSeconds: 0, currentUrl: '' })
  const [_crawlJobId, setCrawlJobId]    = useState<string | null>(null)
  const [urlSession, setUrlSession]     = useState<{ productsCount: number; savedAt: string } | null>(null)
  const [maxPages, setMaxPages]         = useState(100)
  const [maxDepth, setMaxDepth]         = useState(5)
  const [maxProducts, setMaxProducts]   = useState(0)
  const [crawlError, setCrawlError]     = useState('')
  const crawlIntervalRef                = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionCheckedUrl               = useRef('')

  // Poll crawl status while active
  useEffect(() => {
    if (crawlState !== 'crawling' && crawlState !== 'stopping') return
    crawlIntervalRef.current = setInterval(async () => {
      try {
        const d = await crawlApi.getStatus()
        setCrawlStats({
          pagesVisited:    d.pages_visited ?? 0,
          productsScraped: d.products_scraped ?? d.products_count ?? 0,
          elapsedSeconds:  d.elapsed_seconds ?? 0,
          currentUrl:      d.current_url ?? d.url ?? '',
        })
        if (d.job_id) setCrawlJobId(d.job_id)
        if (d.status && d.status !== crawlState) setCrawlState(d.status)
      } catch { /* ignore transient poll errors */ }
    }, 3000)
    return () => { if (crawlIntervalRef.current) clearInterval(crawlIntervalRef.current) }
  }, [crawlState])

  // Check URL for existing session whenever URL changes
  useEffect(() => {
    if (!websiteUrl || !websiteUrl.startsWith('http') || websiteUrl === sessionCheckedUrl.current) return
    sessionCheckedUrl.current = websiteUrl
    crawlApi.getSession(websiteUrl)
      .then((d) => setUrlSession(d.has_session ? { productsCount: d.products_count, savedAt: d.saved_at } : null))
      .catch(() => setUrlSession(null))
  }, [websiteUrl])

  // ── Crawl actions ──────────────────────────────────────────────────────
  async function handleStartCrawl() {
    if (!websiteUrl.startsWith('http')) { setErrors({ url: 'URL must start with http:// or https://' }); return }
    setCrawlState('crawling')
    setUrlSession(null)
    setCrawlStats({ pagesVisited: 0, productsScraped: 0, elapsedSeconds: 0, currentUrl: '' })
    setCrawlError('')
    try {
      const d = await crawlApi.start(websiteUrl, { max_pages: maxPages, max_depth: maxDepth, max_products: maxProducts })
      if (d.job_id) setCrawlJobId(d.job_id)
      if (d.status === 'already_running') { setCrawlState('idle'); setCrawlError('A crawl is already running. Stop it first.') }
    } catch (err) {
      setCrawlState('error')
      setCrawlError(err instanceof Error ? err.message : 'Failed to start crawl')
    }
  }

  async function handleStopCrawl() {
    setCrawlState('stopping')
    try { await crawlApi.stop() } catch { setCrawlState('crawling') }
  }

  async function handleResumeCrawl() {
    setCrawlState('crawling')
    setUrlSession(null)
    try {
      const d = await crawlApi.resume(websiteUrl)
      if (d.job_id) setCrawlJobId(d.job_id)
    } catch { setCrawlState('paused') }
  }

  function goToStep2() {
    if (websiteUrl.trim() && !/^https?:\/\/.+/.test(websiteUrl.trim())) {
      setErrors({ url: 'URL must start with http:// or https://' })
      return
    }
    setErrors({})
    setStep(2)
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!jobName.trim()) newErrors.jobName = 'Job name is required.'
    if (inputFormat === 'google_sheet') {
      if (!googleSheetUrl.trim()) newErrors.data = 'Paste your Google Sheet URL.'
      else if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(googleSheetUrl.trim()))
        newErrors.data = 'URL must be a Google Sheets link (docs.google.com/spreadsheets/…).'
    } else {
      const hasData = rawData.trim() || file || websiteUrl.trim()
      if (!hasData) newErrors.data = 'Paste data or upload a file.'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const userId = user?.id ?? 'anonymous'
      let jobId: string

      if (file) {
        const fd = new FormData()
        fd.append('job_name', jobName)
        fd.append('migration_type', migrationType)
        fd.append('file', file)
        const res = await migrationApi.startFile(fd, userId)
        jobId = res.job_id
      } else {
        // google_sheet → URL; website crawl → websiteUrl; paste → rawData
        const data = inputFormat === 'google_sheet' ? googleSheetUrl.trim()
          : websiteUrl.trim() || rawData.trim()
        const effectiveInputType: InputFormat =
          inputFormat === 'google_sheet' ? 'google_sheet'
          : websiteUrl.trim() && !rawData.trim() ? 'website_url' as InputFormat
          : inputFormat
        const res = await migrationApi.start(
          { job_name: jobName, migration_type: migrationType, input_type: effectiveInputType, data },
          userId
        )
        jobId = res.job_id
      }
      navigate(`/jobs/${jobId}`)
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Submission failed.' })
    } finally {
      setSubmitting(false)
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  return (
    <div ref={pageRef} className="min-h-screen">
      {/* Header */}
      <div className="px-8 pt-10 pb-6 themed-header">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
            New Migration
          </p>
          <h1 className="text-3xl font-light tracking-tight text-black dark:text-white">
            {step === 1 ? 'Website Crawler' : 'Job Details'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-light mt-1">
            {step === 1
              ? 'Crawl a store URL to extract products automatically, or skip to paste data manually.'
              : 'Name your migration, choose its type, and provide the source data.'}
          </p>
        </div>
      </div>

      <div className="px-8 py-8 max-w-5xl mx-auto">

        {/* Step indicator — horizontal pill track */}
        <div className="flex items-center gap-0 mb-8 w-fit">
          {([1, 2] as const).map((s, i) => (
            <div key={s} className="flex items-center">
              {i > 0 && (
                <div className={`w-16 h-px mx-1 transition-colors duration-300 ${step > 1 ? 'bg-emerald-400' : 'bg-black/10 dark:bg-white/10'}`} />
              )}
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  step === s
                    ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm'
                    : step > s
                      ? 'bg-emerald-500 text-white'
                      : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-slate-500'
                }`}>
                  {step > s ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
                </div>
                <span className={`text-xs font-medium transition-colors duration-300 ${
                  step === s ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {s === 1 ? 'Website URL' : 'Job Details'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <AnimatePresence mode="wait">

            {/* ── Step 1: Website Crawler ── */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-5"
              >
                {/* ── URL Input card ── */}
                <div className="themed-card rounded-2xl p-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[rgb(var(--accent,_0_0_0))]/10">
                      <Globe className="w-5 h-5 text-[rgb(var(--accent,_0_0_0))]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Website Crawler</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Enter a store URL to crawl and extract product data automatically</p>
                    </div>
                    {crawlState !== 'idle' && (
                      <span className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                        crawlState === 'crawling'  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' :
                        crawlState === 'stopping'  ? 'bg-amber-100  dark:bg-amber-950/60  text-amber-700  dark:text-amber-400'  :
                        crawlState === 'paused'    ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400' :
                        crawlState === 'completed' ? 'bg-blue-100   dark:bg-blue-950/60   text-blue-700   dark:text-blue-400'   :
                        crawlState === 'error'     ? 'bg-rose-100   dark:bg-rose-950/60   text-rose-700   dark:text-rose-400'   :
                        'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {crawlState === 'crawling'  && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Crawling</>}
                        {crawlState === 'stopping'  && <><Clock className="w-3 h-3" /> Stopping</>}
                        {crawlState === 'paused'    && 'Paused'}
                        {crawlState === 'completed' && <><CheckCircle2 className="w-3 h-3" /> Completed</>}
                        {crawlState === 'error'     && <><AlertTriangle className="w-3 h-3" /> Error</>}
                      </span>
                    )}
                  </div>

                  {/* URL grouped input */}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Target URL</label>
                    <div className={`flex items-center rounded-xl overflow-hidden themed-input focus-within:ring-2 focus-within:ring-[rgb(var(--accent,_0_0_0))]/20 transition-all${errors.url ? ' ring-2 ring-rose-300 dark:ring-rose-700' : ''}`}>
                      <span className="px-3 py-3 text-xs font-mono text-slate-400 dark:text-slate-500 bg-black/5 dark:bg-white/5 border-r border-black/8 dark:border-white/8 select-none whitespace-nowrap">
                        https://
                      </span>
                      <input
                        type="text"
                        value={websiteUrl}
                        disabled={crawlState === 'crawling' || crawlState === 'stopping'}
                        onChange={(e) => { setWebsiteUrl(e.target.value); setErrors({}); sessionCheckedUrl.current = '' }}
                        placeholder="example.com/products"
                        className="flex-1 px-3 py-3 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none font-mono disabled:opacity-50"
                      />
                      {websiteUrl && crawlState === 'idle' && (
                        <button type="button"
                          onClick={() => { setWebsiteUrl(''); setUrlSession(null); sessionCheckedUrl.current = '' }}
                          className="px-3 text-slate-300 dark:text-slate-600 hover:text-rose-400 dark:hover:text-rose-500 transition-colors flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {errors.url && <p className="text-xs text-rose-500 mt-1.5">{errors.url}</p>}
                  </div>

                  {/* Session banner */}
                  {urlSession && crawlState === 'idle' && (
                    <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl px-4 py-3">
                      <RotateCcw className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                        <span className="font-semibold">Previous session found</span> — {urlSession.productsCount} products already scraped
                        {urlSession.savedAt && <span className="text-blue-500 dark:text-blue-400"> (saved {urlSession.savedAt.slice(0, 16).replace('T', ' ')})</span>}.
                        {' '}Click <span className="font-semibold">Resume</span> to continue or <span className="font-semibold">Start New</span> to crawl fresh.
                      </div>
                    </div>
                  )}

                  {/* Crawl settings — only when idle/paused */}
                  {(crawlState === 'idle' || crawlState === 'paused') && (
                    <div className="border-t border-black/5 dark:border-white/5 pt-5">
                      <p className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Crawl Settings</p>
                      <div className="grid grid-cols-3 gap-4">
                        {([
                          { lbl: 'Max Pages',    value: maxPages,    min: 1, max: 10000,  step: 10, set: setMaxPages,    hint: 'pages' },
                          { lbl: 'Max Depth',    value: maxDepth,    min: 1, max: 20,     step: 1,  set: setMaxDepth,    hint: 'levels' },
                          { lbl: 'Max Products', value: maxProducts, min: 0, max: 100000, step: 10, set: setMaxProducts, hint: '0 = unlimited' },
                        ] as const).map(({ lbl, value, min, max, step: s, set, hint }) => (
                          <div key={lbl}>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                              {lbl}
                              <span className="ml-1.5 text-slate-400 dark:text-slate-500 font-normal text-[10px]">{hint}</span>
                            </label>
                            {/* Custom number input — native arrows hidden, custom stacked buttons */}
                            <div className="flex items-stretch themed-input rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[rgb(var(--accent,_0_0_0))]/20 transition-all">
                              <input
                                type="number" min={min} max={max} step={s} value={value}
                                onChange={(e) => set(Number(e.target.value))}
                                className="flex-1 min-w-0 pl-3 py-2.5 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none tabular-nums
                                  [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              {/* Stacked ▲ / ▼ buttons */}
                              <div className="flex flex-col border-l border-black/8 dark:border-white/8 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => set(Math.min(max, value + s))}
                                  className="flex-1 flex items-center justify-center px-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-black/8 dark:border-white/8 leading-none"
                                >
                                  <svg className="w-2.5 h-2.5" viewBox="0 0 10 6" fill="currentColor">
                                    <path d="M5 0L10 6H0L5 0Z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => set(Math.max(min, value - s))}
                                  className="flex-1 flex items-center justify-center px-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors leading-none"
                                >
                                  <svg className="w-2.5 h-2.5" viewBox="0 0 10 6" fill="currentColor">
                                    <path d="M5 6L0 0H10L5 6Z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live stats — while crawling / stopping / completed */}
                  {(crawlState === 'crawling' || crawlState === 'stopping' || crawlState === 'completed') && (
                    <div className="space-y-4">
                      {/* Metrics row */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-black/5 dark:bg-white/5 rounded-xl p-3 text-center">
                          <p className="text-2xl font-light tabular-nums text-slate-800 dark:text-slate-200">{crawlStats.pagesVisited}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Pages visited</p>
                        </div>
                        <div className="bg-black/5 dark:bg-white/5 rounded-xl p-3 text-center">
                          <p className="text-2xl font-light tabular-nums text-slate-800 dark:text-slate-200">{crawlStats.productsScraped}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Products scraped</p>
                        </div>
                        <div className="bg-black/5 dark:bg-white/5 rounded-xl p-3 text-center">
                          <p className="text-2xl font-light tabular-nums text-slate-800 dark:text-slate-200">{fmtSeconds(crawlStats.elapsedSeconds)}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Elapsed</p>
                        </div>
                      </div>

                      {/* Pages progress bar */}
                      {maxPages > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mb-1.5">
                            <span>Pages</span>
                            <span>{crawlStats.pagesVisited} / {maxPages}</span>
                          </div>
                          <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${crawlState === 'completed' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((crawlStats.pagesVisited / maxPages) * 100, 100)}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Currently processing URL */}
                      {crawlStats.currentUrl && (
                        <div className="bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2.5">
                          <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">
                            {crawlState === 'completed' ? 'Last page processed' : 'Currently processing'}
                          </p>
                          <p className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">{crawlStats.currentUrl}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {crawlState === 'error' && crawlError && (
                    <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 rounded-xl px-4 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <p className="text-xs text-rose-700 dark:text-rose-400">{crawlError}</p>
                    </div>
                  )}

                  {/* Stopping spinner */}
                  {crawlState === 'stopping' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 animate-spin" />
                      Stopping crawl and saving progress…
                    </p>
                  )}

                  {/* Completion message */}
                  {crawlState === 'completed' && (
                    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl px-4 py-2.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                        Crawl complete — {crawlStats.productsScraped} products scraped in {fmtSeconds(crawlStats.elapsedSeconds)}.
                        Continue to start the migration.
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Action buttons ── */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* IDLE */}
                  {crawlState === 'idle' && (
                    urlSession ? (
                      <>
                        <Button type="button" variant="primary" size="lg" icon={<Play className="w-4 h-4" />} onClick={handleResumeCrawl} disabled={!websiteUrl}>
                          Resume Crawling
                        </Button>
                        <Button type="button" variant="secondary" size="lg" onClick={handleStartCrawl} disabled={!websiteUrl}>
                          Start New
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="primary" size="lg" icon={<Play className="w-4 h-4" />} onClick={handleStartCrawl} disabled={!websiteUrl}>
                        Start Crawl
                      </Button>
                    )
                  )}

                  {/* CRAWLING */}
                  {crawlState === 'crawling' && (
                    <Button type="button" variant="danger" size="lg" icon={<Square className="w-4 h-4" />} onClick={handleStopCrawl}>
                      Stop Crawling
                    </Button>
                  )}

                  {/* PAUSED */}
                  {crawlState === 'paused' && (
                    <>
                      <Button type="button" variant="primary" size="lg" icon={<Play className="w-4 h-4" />} onClick={handleResumeCrawl}>
                        Resume Crawling
                      </Button>
                      <Button type="button" variant="secondary" size="lg" icon={<RotateCcw className="w-4 h-4" />} onClick={() => { setCrawlState('idle'); setUrlSession(null); setCrawlStats({ pagesVisited: 0, productsScraped: 0, elapsedSeconds: 0, currentUrl: '' }) }}>
                        Start New
                      </Button>
                    </>
                  )}

                  {/* ERROR */}
                  {crawlState === 'error' && (
                    <Button type="button" variant="secondary" size="lg" icon={<RotateCcw className="w-4 h-4" />} onClick={handleStartCrawl} disabled={!websiteUrl}>
                      Retry
                    </Button>
                  )}

                  {/* Continue to Step 2 — always available except while actively crawling/stopping */}
                  {crawlState !== 'crawling' && crawlState !== 'stopping' && (
                    <Button
                      type="button"
                      variant={crawlState === 'completed' ? 'primary' : 'ghost'}
                      size="lg"
                      icon={crawlState === 'completed' ? <ArrowRight className="w-4 h-4" /> : <SkipForward className="w-4 h-4" />}
                      iconPosition="right"
                      onClick={goToStep2}
                    >
                      {crawlState === 'completed'
                        ? `Continue with ${crawlStats.productsScraped} products`
                        : crawlState === 'idle' && !websiteUrl
                          ? 'Skip'
                          : 'Continue'}
                    </Button>
                  )}

                  <Button type="button" variant="ghost" size="lg" onClick={() => navigate('/dashboard')} className="ml-auto">
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Job Details ── */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-7"
              >
                {/* Job Name */}
                <div>
                  <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                    Job Name
                  </label>
                  <input
                    type="text"
                    value={jobName}
                    onChange={(e) => { setJobName(e.target.value); setErrors((p) => ({ ...p, jobName: '' })) }}
                    placeholder="e.g. Black Friday Product Import"
                    className={`themed-input w-full px-4 py-3 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all ${errors.jobName ? 'border-rose-300 dark:border-rose-700' : ''}`}
                  />
                  {errors.jobName && <p className="text-xs text-rose-500 mt-1.5">{errors.jobName}</p>}
                </div>

                {/* Migration Type */}
                <div>
                  <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
                    Migration Type
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {migrationTypes.map(({ value, label: lbl, icon: Icon, desc }) => {
                      const active = migrationType === value
                      return (
                        <motion.button key={value} type="button" onClick={() => setMigrationType(value)}
                          className={`relative p-4 rounded-2xl border text-left transition-all duration-150 ${active ? 'bg-[rgb(var(--accent,_0_0_0))] border-[rgb(var(--accent,_0_0_0))] shadow-md' : 'themed-card border-transparent hover:opacity-80'}`}
                          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                        >
                          {active && <CheckCircle2 className="absolute top-3 right-3 w-3.5 h-3.5 text-[rgb(var(--accent-fg,_255_255_255))] opacity-70" />}
                          <Icon className={`w-5 h-5 mb-2.5 ${active ? 'text-[rgb(var(--accent-fg,_255_255_255))]' : 'text-slate-500 dark:text-slate-400'}`} />
                          <div className={`text-sm font-semibold ${active ? 'text-[rgb(var(--accent-fg,_255_255_255))]' : 'text-slate-800 dark:text-slate-200'}`}>{lbl}</div>
                          <div className={`text-xs mt-0.5 ${active ? 'text-[rgb(var(--accent-fg,_255_255_255))] opacity-70' : 'text-slate-400 dark:text-slate-500'}`}>{desc}</div>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                {/* Input Format */}
                <div>
                  <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
                    Input Format
                  </label>
                  <div className="bg-black/5 dark:bg-white/5 p-1 rounded-full flex gap-0.5 w-fit flex-wrap">
                    {inputFormats.map(({ value, label: lbl }) => {
                      const active = inputFormat === value
                      return (
                        <button key={value} type="button" onClick={() => setInputFormat(value)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${active ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                          {value === 'ai_parser' && <Sparkles className="w-3 h-3" />}
                          {lbl}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Source Data */}
                <div>
                  <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
                    Source Data
                  </label>

                  <AnimatePresence mode="wait">
                    {/* ── Google Sheet URL ── */}
                    {inputFormat === 'google_sheet' ? (
                      <motion.div key="gsheet" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                        <div className={`themed-card rounded-2xl p-5 border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 ${errors.data ? 'ring-2 ring-rose-200 dark:ring-rose-800 ring-offset-2' : ''}`}>
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                              <Sheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Google Sheets</p>
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Share your sheet as "Anyone with the link can view", then paste the URL below.</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 themed-input rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-300 dark:focus-within:ring-emerald-700">
                            <span className="pl-3 text-xs text-slate-400 dark:text-slate-500 shrink-0 select-none">URL</span>
                            <input
                              type="url"
                              value={googleSheetUrl}
                              onChange={(e) => { setGoogleSheetUrl(e.target.value); setErrors((p) => ({ ...p, data: '' })) }}
                              placeholder="https://docs.google.com/spreadsheets/d/…"
                              spellCheck={false}
                              className="flex-1 min-w-0 px-2 py-3 bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none font-mono"
                            />
                            {googleSheetUrl && (
                              <button type="button" onClick={() => setGoogleSheetUrl('')} className="pr-3 text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      /* ── Paste + File ── */
                      <motion.div key="paste-file" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="space-y-4">
                        <div className={errors.data ? 'rounded-2xl ring-2 ring-rose-200 dark:ring-rose-800 ring-offset-2' : ''}>
                          <div className="themed-input rounded-2xl overflow-hidden relative focus-within:ring-2 focus-within:ring-black/10 dark:focus-within:ring-white/10">
                            <textarea
                              value={rawData}
                              onChange={(e) => { setRawData(e.target.value); setErrors((p) => ({ ...p, data: '' })) }}
                              rows={8}
                              placeholder={placeholders[inputFormat]}
                              spellCheck={false}
                              className="w-full px-4 py-3.5 bg-transparent text-xs font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none resize-none leading-relaxed"
                            />
                            {rawData && (
                              <button type="button" onClick={() => setRawData('')} className="absolute top-3 right-3 p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* File upload */}
                        <div
                          onDragOver={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true) }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-150 ${
                            dragOver ? 'border-black/30 dark:border-white/30 bg-black/5 dark:bg-white/5'
                            : file    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30'
                            :           'border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-900 hover:border-black/20 dark:hover:border-white/20 hover:bg-white/60 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <input ref={fileInputRef} type="file" accept=".json,.csv,.xml,.txt" className="hidden" onChange={handleFileChange} />
                          <AnimatePresence mode="wait">
                            {file ? (
                              <motion.div key="file-selected" className="flex items-center justify-center gap-2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{file.name}</span>
                                <span className="text-xs text-slate-400 dark:text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null) }} className="ml-1 p-0.5 rounded text-slate-400 hover:text-rose-500 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </motion.div>
                            ) : (
                              <motion.div key="file-empty" className="flex flex-col items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <Upload className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">Drop your file here or click to browse</p>
                                <p className="text-xs text-slate-300 dark:text-slate-600">.json, .csv, .xml, .txt — up to 50 MB</p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {errors.data && <p className="text-xs text-rose-500 mt-2">{errors.data}</p>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1">
                  <Button type="button" variant="ghost" size="lg" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => { setErrors({}); setStep(1) }}>
                    Back
                  </Button>
                  <Button type="submit" variant="primary" size="lg" loading={submitting} icon={<ArrowRight className="w-4 h-4" />} iconPosition="right">
                    {submitting ? 'Starting…' : 'Start Migration'}
                  </Button>
                  <Button type="button" variant="ghost" size="lg" onClick={() => navigate('/dashboard')} className="ml-auto">
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </form>
      </div>
    </div>
  )
}
