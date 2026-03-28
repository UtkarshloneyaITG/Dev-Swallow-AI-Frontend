import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { PageLoader } from '../components/ui/Spinner'
import {
  ArrowLeft, Globe, Download, Trash2, RotateCcw, Play,
  CheckCircle2, AlertTriangle, Clock, FileStack,
  ChevronLeft, ChevronRight, Package, Layers, ExternalLink, Eye,
} from 'lucide-react'
import Button from '../components/ui/Button'
import { crawlApi } from '../services/api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  const n = Math.floor(s)
  if (n < 60) return `${n}s`
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const sec = n % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  return `${m}m ${sec}s`
}

function formatDate(str: string): string {
  try {
    return new Date(str).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return str }
}

const statusConfig: Record<string, { label: string; dot: string; ring: string; text: string }> = {
  completed: { label: 'Completed', dot: 'bg-blue-500',    ring: 'ring-blue-200 dark:ring-blue-800/60',   text: 'text-blue-600 dark:text-blue-400' },
  crawling:  { label: 'Crawling',  dot: 'bg-emerald-500 animate-pulse', ring: 'ring-emerald-200 dark:ring-emerald-800/60', text: 'text-emerald-600 dark:text-emerald-400' },
  running:   { label: 'Running',   dot: 'bg-emerald-500 animate-pulse', ring: 'ring-emerald-200 dark:ring-emerald-800/60', text: 'text-emerald-600 dark:text-emerald-400' },
  paused:    { label: 'Paused',    dot: 'bg-orange-400',  ring: 'ring-orange-200 dark:ring-orange-800/60', text: 'text-orange-600 dark:text-orange-400' },
  error:     { label: 'Error',     dot: 'bg-rose-500',    ring: 'ring-rose-200 dark:ring-rose-800/60',   text: 'text-rose-600 dark:text-rose-400' },
  idle:      { label: 'Idle',      dot: 'bg-slate-400',   ring: 'ring-slate-200 dark:ring-slate-700',    text: 'text-slate-500 dark:text-slate-400' },
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobDetail {
  job_id: string
  name?: string
  source_url?: string
  url?: string
  status: string
  elapsed_seconds?: number
  total_products?: number
  pages_visited?: number
  created_at?: string
  stats?: Record<string, unknown>
}

interface Product {
  idx?: number
  title?: string
  name?: string
  product_name?: string
  price?: string | number
  url?: string
  image?: string
  images?: string[]
  [key: string]: unknown
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CrawlDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate  = useNavigate()
  const pageRef   = usePageAnimation()

  const [job,            setJob]            = useState<JobDetail | null>(null)
  const [pageError,      setPageError]      = useState('')
  const [loading,        setLoading]        = useState(true)

  const [products,       setProducts]       = useState<Product[]>([])
  const [page,           setPage]           = useState(1)
  const [totalPages,     setTotalPages]     = useState(1)
  const [totalProducts,  setTotalProducts]  = useState(0)
  const [prodLoading,    setProdLoading]    = useState(false)

  const [extendCount,    setExtendCount]    = useState(50)
  const [extending,      setExtending]      = useState(false)
  const [extendError,    setExtendError]    = useState('')

  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [deleting,       setDeleting]       = useState(false)

  // ── Load job ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    crawlApi.getJob(jobId)
      .then((d) => setJob(d as unknown as JobDetail))
      .catch(() =>
        crawlApi.getJobProducts({ job_id: jobId, page: 1, page_size: 1 })
          .then((d) => setJob({
            job_id: jobId, name: d.name, source_url: d.source_url,
            status: d.status, total_products: d.total_products,
          }))
          .catch(() => setPageError('Could not load crawl job.'))
      )
      .finally(() => setLoading(false))
  }, [jobId])

  // ── Load products page ────────────────────────────────────────────────────

  useEffect(() => {
    if (!jobId) return
    setProdLoading(true)
    crawlApi.getJobProducts({ job_id: jobId, page, page_size: 12 })
      .then((d) => {
        setProducts(d.products as Product[])
        setTotalPages(d.total_pages)
        setTotalProducts(d.total_products)
      })
      .catch((err) => { if (import.meta.env.DEV) console.error('Failed to load products:', err) })
      .finally(() => setProdLoading(false))
  }, [jobId, page])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleExtend() {
    if (!jobId || extending) return
    setExtending(true); setExtendError('')
    try {
      await crawlApi.extend(jobId, extendCount)
      navigate('/dashboard')
    } catch (err) {
      setExtendError(err instanceof Error ? err.message : 'Extend failed')
    } finally { setExtending(false) }
  }

  async function handleDelete() {
    if (!jobId || deleting) return
    setDeleting(true)
    try {
      await crawlApi.deleteCrawlJob(jobId)
      navigate('/dashboard')
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  // ── Render guards ─────────────────────────────────────────────────────────

  if (loading) return <PageLoader label="Loading crawl details…" />

  if (pageError && !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-8 h-8 text-rose-400" />
        <p className="text-sm text-slate-500">{pageError}</p>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const url         = job?.source_url ?? job?.url ?? ''
  const displayUrl  = url.replace(/^https?:\/\//, '')
  const status      = job?.status ?? 'completed'
  const cfg         = statusConfig[status] ?? statusConfig.completed
  const stats       = (job?.stats ?? {}) as Record<string, unknown>
  const pagesVisited= (job?.pages_visited ?? stats.pages_visited as number) ?? 0
  const elapsed     = (job?.elapsed_seconds ?? stats.elapsed_seconds as number) ?? 0
  const createdAt   = job?.created_at ?? ''
  const isCompleted = status === 'completed'
  const isRunning   = status === 'running' || status === 'crawling' || status === 'stopping'
  const prodCount   = totalProducts || job?.total_products || 0

  return (
    <div ref={pageRef} className="min-h-screen relative z-10">

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950/30 border-b border-black/5 dark:border-white/5">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle, #0ea5e9 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />

        <div className="relative px-4 sm:px-8 pt-6 pb-8 max-w-5xl mx-auto">
          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mb-5 transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Back
          </button>

          <div className="flex flex-wrap items-start justify-between gap-5">
            {/* Left: icon + title */}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-black/5 dark:border-white/5 flex-shrink-0">
                <Globe className="w-6 h-6 text-sky-500" />
              </div>
              <div>
                {job?.name && (
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                    {job.name}
                  </p>
                )}
                <h1 className="text-xl sm:text-2xl font-light tracking-tight text-slate-900 dark:text-white break-all">
                  {displayUrl || 'Crawl Job'}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {/* Status pill */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ring-1 bg-white dark:bg-slate-800 ${cfg.ring} ${cfg.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                  {createdAt && (
                    <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                      <Clock className="w-3 h-3" />
                      {formatDate(createdAt)}
                    </span>
                  )}
                  {url && (
                    <a
                      href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> Visit site
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right: delete */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <AnimatePresence mode="wait">
                {!confirmDelete ? (
                  <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Button variant="ghost" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)}>
                      Delete job
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="confirm" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Sure?</span>
                    <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>Delete</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Stat strip ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: 'Products scraped', value: prodCount,                       icon: <Package className="w-4 h-4 text-sky-500" />,    accent: 'text-sky-600 dark:text-sky-400' },
              { label: 'Pages visited',    value: pagesVisited,                    icon: <Layers className="w-4 h-4 text-violet-500" />,  accent: 'text-violet-600 dark:text-violet-400' },
              { label: 'Duration',         value: elapsed ? fmtSeconds(elapsed) : '—', icon: <Clock className="w-4 h-4 text-amber-500" />, accent: 'text-amber-600 dark:text-amber-400' },
              { label: 'Status',           value: cfg.label,                       icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, accent: cfg.text },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-xl p-3.5 border border-black/5 dark:border-white/5 shadow-sm"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.05 }}
              >
                <div className="flex items-center gap-2 mb-1.5">{s.icon}<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{s.label}</span></div>
                <p className={`text-lg font-light tabular-nums ${s.accent}`}>{s.value}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left column: downloads + actions ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Downloads card */}
            <motion.div
              className="themed-card rounded-2xl p-5"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Download Data</h3>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
                Download all {prodCount > 0 ? prodCount : ''} scraped products in your preferred format.
              </p>
              <div className="space-y-2">
                {(['csv', 'json', 'jsonl'] as const).map((fmt) => {
                  const href = crawlApi.getDownloadUrl({ job_id: jobId!, type: fmt })
                  const desc = fmt === 'csv' ? 'Spreadsheet-compatible' : fmt === 'json' ? 'Structured array' : 'Streaming / NDJSON'
                  return (
                    <a
                      key={fmt}
                      href={href}
                      download
                      className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl border border-black/8 dark:border-white/8 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group"
                    >
                      <div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-black dark:group-hover:text-white">{fmt.toUpperCase()}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">{desc}</p>
                      </div>
                      <Download className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors" />
                    </a>
                  )
                })}
              </div>
            </motion.div>

            {/* Actions card */}
            <motion.div
              className="themed-card rounded-2xl p-5"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.15 }}
            >
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Actions</h3>

              {/* View live process — only when running */}
              {isRunning && (
                <button
                  onClick={() => navigate('/new-migration')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition-colors mb-2"
                >
                  <Eye className="w-4 h-4 flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium">View live process</p>
                    <p className="text-[10px] opacity-70">See real-time crawl progress</p>
                  </div>
                  <span className="ml-auto w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
                </button>
              )}

              {/* Use for migration */}
              <button
                onClick={() => navigate('/new-migration', { state: { prefillUrl: url } })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] hover:opacity-90 transition-opacity mb-2"
              >
                <Play className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-medium">Use for migration</p>
                  <p className="text-[10px] opacity-70">Start a migration job with this data</p>
                </div>
              </button>

              {/* Extend crawl */}
              {isCompleted && (
                <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Extend crawl</p>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="number" min={1} max={10000} value={extendCount}
                      onChange={(e) => setExtendCount(Math.max(1, Number(e.target.value)))}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-center themed-input bg-transparent focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent,_0_0_0))]/20 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">more</span>
                  </div>
                  <Button variant="secondary" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} loading={extending} onClick={handleExtend} className="w-full justify-center">
                    {extending ? 'Starting…' : 'Extend crawl'}
                  </Button>
                  {extendError && <p className="text-xs text-rose-500 mt-2">{extendError}</p>}
                </div>
              )}
            </motion.div>
          </div>

          {/* ── Right column: products ── */}
          <motion.div
            className="lg:col-span-2 themed-card rounded-2xl overflow-hidden"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            {/* Table header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Scraped Products</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{prodCount} total</p>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page <= 1 || prodLoading}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400 tabular-nums min-w-[48px] text-center">{page} / {totalPages}</span>
                  <button
                    disabled={page >= totalPages || prodLoading}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Product rows */}
            <AnimatePresence mode="wait">
              {prodLoading ? (
                <motion.div key="loader" className="flex items-center justify-center py-20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-700 border-t-slate-500 rounded-full animate-spin" />
                </motion.div>
              ) : products.length === 0 ? (
                <motion.div key="empty" className="flex flex-col items-center justify-center py-20 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <FileStack className="w-8 h-8 text-slate-200 dark:text-slate-700 mb-3" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">No products found</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
                    {isRunning ? 'Products will appear here as the crawl progresses' : 'Products appear here once the crawl completes'}
                  </p>
                </motion.div>
              ) : (
                <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {products.map((p, i) => {
                    const title      = String(p.title ?? p.name ?? p.product_name ?? '—')
                    const price      = p.price != null ? String(p.price) : null
                    const img        = (Array.isArray(p.images) ? p.images[0] : p.image) as string | undefined
                    const productUrl = p.url as string | undefined

                    return (
                      <motion.div
                        key={`${page}-${i}`}
                        className="flex items-center gap-4 px-5 py-3.5 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        {/* Image thumbnail */}
                        <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden border border-black/5 dark:border-white/5">
                          {img
                            ? <img src={img} alt={title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            : <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-slate-300 dark:text-slate-600" /></div>
                          }
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate leading-snug">{title}</p>
                          {productUrl && (
                            <a
                              href={productUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-sky-500 transition-colors truncate block max-w-[260px] font-mono mt-0.5"
                            >
                              {productUrl.replace(/^https?:\/\//, '').slice(0, 60)}
                            </a>
                          )}
                        </div>

                        {/* Price */}
                        {price && (
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                            {price}
                          </span>
                        )}
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

        </div>
      </div>
    </div>
  )
}
