import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { Plus, TrendingUp, CheckCircle2, Clock, Globe, ArrowRight, Package, Layers } from 'lucide-react'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { migrationApi, crawlApi } from '../services/api'
import type { MigrationJob, StoredCrawlSession } from '../types'
import { PageLoader } from '../components/ui/Spinner'
import {
  DASH_CHART_TYPE, DASH_CHART_PALETTE, DASH_CARD_STYLE,
  DASH_SHOW_METRICS, DASH_SHOW_CHART,
  DASH_COMPACT_TABLE,
} from './Settings'
import DonutChart from '../components/charts/DonutChart'
import RingChart from '../components/charts/RingChart'
import BarsChart from '../components/charts/BarsChart'
import ActivityAreaChart from '../components/charts/ActivityAreaChart'
import type { ActivityPoint } from '../components/charts/ActivityAreaChart'
import type { DonutSlice } from '../components/charts/DonutChart'

// ── Palette map ───────────────────────────────────────────────────────────
const PALETTES: Record<string, { color: string; light: string }[]> = {
  default: [
    { color: '#22c55e', light: '#86efac' },
    { color: '#f59e0b', light: '#fcd34d' },
    { color: '#94a3b8', light: '#cbd5e1' },
    { color: '#f43f5e', light: '#fca5a5' },
  ],
  vibrant: [
    { color: '#06b6d4', light: '#67e8f9' },
    { color: '#8b5cf6', light: '#c4b5fd' },
    { color: '#f97316', light: '#fdba74' },
    { color: '#ec4899', light: '#f9a8d4' },
  ],
  pastel: [
    { color: '#6ee7b7', light: '#a7f3d0' },
    { color: '#c4b5fd', light: '#ddd6fe' },
    { color: '#fde68a', light: '#fef3c7' },
    { color: '#fca5a5', light: '#fee2e2' },
  ],
  mono: [
    { color: '#1e293b', light: '#475569' },
    { color: '#475569', light: '#64748b' },
    { color: '#94a3b8', light: '#cbd5e1' },
    { color: '#cbd5e1', light: '#e2e8f0' },
  ],
}

// ── Greeting helper ────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const pageRef = usePageAnimation()

  // ── Dashboard settings ────────────────────────────────────────────────
  const chartType    = localStorage.getItem(DASH_CHART_TYPE)    || 'donut'
  const chartPalette = localStorage.getItem(DASH_CHART_PALETTE) || 'default'
  const cardStyle    = localStorage.getItem(DASH_CARD_STYLE)    || 'filled'
  const showMetrics  = localStorage.getItem(DASH_SHOW_METRICS)  !== 'false'
  const showChart    = localStorage.getItem(DASH_SHOW_CHART)    !== 'false'
  const compactTable = localStorage.getItem(DASH_COMPACT_TABLE) === 'true'
  const palette      = PALETTES[chartPalette] ?? PALETTES.default

  const [jobs,   setJobs]   = useState<MigrationJob[]>([])
  const [crawls, setCrawls] = useState<StoredCrawlSession[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'migrations' | 'crawls'>('all')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    migrationApi.listJobs(user.id)
      .then(setJobs).catch(console.error).finally(() => setLoading(false))
    crawlApi.listUserJobs(user.id)
      .then((data) => {
        setCrawls(data.jobs.map((j) => {
          const stats = (j.stats ?? {}) as Record<string, unknown>
          const url = String(j.source_url ?? j.url ?? '')
          const productsScraped = (j.total_products as number) ?? (j.product_output as number) ?? (stats.products_scraped as number) ?? 0
          const pagesVisited = (stats.pages_visited as number) ?? (j.pages_visited as number) ?? 0
          const elapsedSeconds = (j.elapsed_seconds as number) ?? (stats.elapsed_seconds as number) ?? 0
          const startedAt = String(j.created_at ?? j.started_at ?? new Date().toISOString())
          const rawStatus = String(j.status ?? 'completed').replace('running', 'crawling')
          const status: StoredCrawlSession['status'] =
            (['idle','crawling','stopping','paused','completed','error'] as const)
              .includes(rawStatus as StoredCrawlSession['status'])
              ? rawStatus as StoredCrawlSession['status'] : 'completed'
          return { url, startedAt, status, pagesVisited, productsScraped, elapsedSeconds, jobId: String(j.job_id ?? '') }
        }))
      }).catch(console.error)
  }, [user])


  // ── Derived stats (memoized) ───────────────────────────────────────────
  const { totalJobs, completedJobs, processingJobs, pendingJobs, failedJobs,
          totalCorrect, totalFailed, totalRows, successRate, totalProducts, activeCrawls } =
    useMemo(() => {
      const totalJobs       = jobs.length
      const completedJobs   = jobs.filter(j => j.status === 'completed').length
      const processingJobs  = jobs.filter(j => j.status === 'processing').length
      const pendingJobs     = jobs.filter(j => j.status === 'pending').length
      const failedJobs      = jobs.filter(j => j.status === 'failed').length
      const totalCorrect    = jobs.reduce((a, j) => a + j.correctRows, 0)
      const totalFailed     = jobs.reduce((a, j) => a + j.failedRows, 0)
      const totalRows       = jobs.reduce((a, j) => a + j.totalRows, 0)
      const successRate     = totalRows > 0 ? Math.round((totalCorrect / totalRows) * 100) : 0
      const totalProducts   = crawls.reduce((a, c) => a + c.productsScraped, 0)
      const activeCrawls    = crawls.filter(c => c.status === 'crawling').length
      return { totalJobs, completedJobs, processingJobs, pendingJobs, failedJobs,
               totalCorrect, totalFailed, totalRows, successRate, totalProducts, activeCrawls }
    }, [jobs, crawls])

  const donutSlices: DonutSlice[] = useMemo(() => [
    { value: completedJobs,  ...palette[0], label: 'Completed' },
    { value: processingJobs, ...palette[1], label: 'Processing' },
    { value: pendingJobs,    ...palette[2], label: 'Pending' },
    { value: failedJobs,     ...palette[3], label: 'Failed' },
  ], [completedJobs, processingJobs, pendingJobs, failedJobs, palette])

  // ── Activity area chart data (last 14 days, memoized) ────────────────
  const activityData: ActivityPoint[] = useMemo(() => {
    const days = 14
    const now = new Date()
    const buckets: Record<string, { migrations: number; crawls: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      buckets[key] = { migrations: 0, crawls: 0 }
    }
    for (const j of jobs) {
      const key = new Date(j.createdAt).toISOString().slice(0, 10)
      if (buckets[key]) buckets[key].migrations++
    }
    for (const c of crawls) {
      const key = new Date(c.startedAt).toISOString().slice(0, 10)
      if (buckets[key]) buckets[key].crawls++
    }
    return Object.entries(buckets).map(([key, v]) => {
      const d = new Date(key + 'T00:00:00')
      return { date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), ...v }
    })
  }, [jobs, crawls])

  // Recent activity (memoized)
  const recentJobs   = useMemo(() => [...jobs].slice(0, 5), [jobs])
  const recentCrawls = useMemo(() => [...crawls].slice(0, 5), [crawls])
  const recentAll = useMemo(() => [
    ...jobs.map(j => ({ type: 'migration' as const, key: j.id, name: j.name, status: j.status, date: j.createdAt, meta: `${j.totalRows} rows` })),
    ...crawls.map(c => ({ type: 'crawl' as const, key: c.jobId || c.url, name: c.url.replace(/^https?:\/\//, ''), status: c.status, date: c.startedAt, meta: `${c.productsScraped} products` })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8), [jobs, crawls])

  // ── Loading guard (must be after all hooks) ───────────────────────────
  if (loading) return <PageLoader label="Loading dashboard…" />

  const statusBadge: Record<string, string> = {
    completed:  'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400',
    processing: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400',
    pending:    'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
    failed:     'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400',
    crawling:   'bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400',
    paused:     'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400',
    error:      'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400',
  }

  function formatRelative(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div ref={pageRef} className="min-h-screen relative z-10 bg-slate-50/50 dark:bg-transparent">

      {/* ── Greeting header ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-8 pt-8 pb-0 max-w-6xl mx-auto">
        <motion.div
          className="flex flex-wrap items-end justify-between gap-4 mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              Overview
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              {getGreeting()}, {user?.name.split(' ')[0] ?? 'there'}!
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
              {totalJobs > 0
                ? `${totalJobs} migration job${totalJobs !== 1 ? 's' : ''} · ${processingJobs > 0 ? `${processingJobs} running` : 'all quiet'}`
                : 'Ready to start your first migration?'}
            </p>
          </div>
          <Button variant="primary" size="md" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/new-migration')}>
            New Migration
          </Button>
        </motion.div>

        {/* ── Hero metric strip ──────────────────────────────────────────── */}
        {showMetrics && <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Products Scraped',
              value: totalProducts.toLocaleString(),
              sub: `${crawls.length} crawl${crawls.length !== 1 ? 's' : ''}`,
              icon: <Package className="w-5 h-5" />,
              accent: '#0ea5e9',
              bg: 'bg-sky-50 dark:bg-sky-950/30',
              iconBg: 'bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400',
            },
            {
              label: 'Rows Migrated',
              value: totalRows.toLocaleString(),
              sub: `${totalCorrect.toLocaleString()} successful`,
              icon: <Layers className="w-5 h-5" />,
              accent: '#8b5cf6',
              bg: 'bg-violet-50 dark:bg-violet-950/30',
              iconBg: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
            },
            {
              label: 'Success Rate',
              value: `${successRate}%`,
              sub: `${totalFailed} failed rows`,
              icon: <CheckCircle2 className="w-5 h-5" />,
              accent: '#22c55e',
              bg: 'bg-emerald-50 dark:bg-emerald-950/30',
              iconBg: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
            },
            {
              label: 'Active Now',
              value: String(processingJobs + activeCrawls),
              sub: `${processingJobs} migrating · ${activeCrawls} crawling`,
              icon: <Clock className="w-5 h-5" />,
              accent: '#f59e0b',
              bg: 'bg-amber-50 dark:bg-amber-950/30',
              iconBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
            },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              className={`rounded-2xl p-5 border transition-all ${
                cardStyle === 'filled'   ? `${s.bg} border-black/[0.04] dark:border-white/[0.04]` :
                cardStyle === 'outlined' ? `themed-card border-2` :
                                           `themed-card border-black/[0.04] dark:border-white/[0.04]`
              }`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={`inline-flex p-2 rounded-xl mb-3 ${cardStyle === 'filled' ? s.iconBg : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}>{s.icon}</div>
              <p className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none mb-1">
                {s.value}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-0.5">
                {s.label}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">{s.sub}</p>
            </motion.div>
          ))}
        </div>}

        {/* ── Middle section: Area chart (left) + Donut chart (right) ──── */}
        {showChart && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">

          {/* Activity area chart — left, wider */}
          <motion.div
            className="lg:col-span-3 themed-card rounded-2xl p-5"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Activity Overview</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Migrations & crawls — last 14 days</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Migrations</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Crawls</span>
                </div>
              </div>
            </div>
            <ActivityAreaChart data={activityData} />
          </motion.div>

          {/* Donut / Ring / Bars chart — right */}
          <motion.div
            className="lg:col-span-2 themed-card rounded-2xl p-5 flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <div className="w-full flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Job Status</h3>
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            {chartType === 'donut' && <DonutChart slices={donutSlices} total={totalJobs} />}
            {chartType === 'ring'  && <RingChart  slices={donutSlices} total={totalJobs} />}
            {chartType === 'bars'  && <BarsChart  slices={donutSlices} total={totalJobs} />}
          </motion.div>

        </div>
        )}
      </div>

      {/* ── Recent activity table ──────────────────────────────────────────── */}
      <div className="px-4 sm:px-8 pb-10 max-w-6xl mx-auto">
        <motion.div
          className="themed-card rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          {/* Table header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-black/5 dark:border-white/5">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent Activity</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Latest migrations and crawls</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-black/5 dark:bg-white/5 p-1 rounded-full flex gap-0.5">
                {([
                  { key: 'all',        label: 'All' },
                  { key: 'migrations', label: 'Migrations' },
                  { key: 'crawls',     label: 'Crawls' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                      activeTab === key
                        ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => navigate('/jobs')}
                className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                See all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Table rows */}
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {(activeTab === 'all' ? recentAll : activeTab === 'migrations'
                ? recentJobs.map(j => ({ type: 'migration' as const, key: j.id, name: j.name, status: j.status, date: j.createdAt, meta: `${j.totalRows} rows` }))
                : recentCrawls.map(c => ({ type: 'crawl' as const, key: c.jobId || c.url, name: c.url.replace(/^https?:\/\//, ''), status: c.status, date: c.startedAt, meta: `${c.productsScraped} products` }))
              ).map((row, i) => (
                <motion.button
                  key={row.key}
                  onClick={() => row.type === 'migration' ? navigate(`/jobs/${row.key}`) : navigate(`/crawls/${row.key}`)}
                  className={`w-full flex items-center gap-4 px-5 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors text-left group ${compactTable ? 'py-2' : 'py-3.5'}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  {/* Type icon */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    row.type === 'migration'
                      ? 'bg-violet-100 dark:bg-violet-900/40'
                      : 'bg-sky-100 dark:bg-sky-900/40'
                  }`}>
                    {row.type === 'migration'
                      ? <TrendingUp className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      : <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                    }
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-black dark:group-hover:text-white transition-colors">
                      {row.name}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 capitalize">
                      {row.type} · {row.meta}
                    </p>
                  </div>

                  {/* Status */}
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0 ${statusBadge[row.status] ?? statusBadge.pending}`}>
                    {row.status}
                  </span>

                  {/* Date */}
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0 w-14 text-right tabular-nums">
                    {formatRelative(row.date)}
                  </span>

                  <ArrowRight className="w-3.5 h-3.5 text-slate-200 dark:text-slate-700 group-hover:text-slate-400 dark:group-hover:text-slate-500 flex-shrink-0 transition-colors" />
                </motion.button>
              ))}

              {/* Empty states */}
              {((activeTab === 'all' && recentAll.length === 0) ||
                (activeTab === 'migrations' && recentJobs.length === 0) ||
                (activeTab === 'crawls' && recentCrawls.length === 0)) && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                    {activeTab === 'crawls'
                      ? <Globe className="w-4 h-4 text-slate-400" />
                      : <TrendingUp className="w-4 h-4 text-slate-400" />
                    }
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                    No {activeTab === 'all' ? 'activity' : activeTab} yet
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 max-w-xs">
                    {activeTab === 'crawls'
                      ? 'Use the website crawler to scrape product data from any store.'
                      : 'Create a migration job to start importing data to Shopify.'}
                  </p>
                  <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/new-migration')}>
                    Get started
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Pending banner */}
          {pendingJobs > 0 && (
            <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-100 dark:border-amber-900/40 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <span className="font-semibold">{pendingJobs} job{pendingJobs !== 1 ? 's' : ''} pending</span> — queued, will begin processing shortly.
              </p>
            </div>
          )}
        </motion.div>

      </div>

    </div>
  )
}
