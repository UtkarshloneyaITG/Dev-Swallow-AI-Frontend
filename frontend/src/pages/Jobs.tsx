import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { Plus, Search, Globe, TrendingUp } from 'lucide-react'
import Button from '../components/ui/Button'
import JobCard from '../components/migration/JobCard'
import CrawlCard from '../components/migration/CrawlCard'
import Badge from '../components/ui/Badge'
import { useAuth } from '../context/AuthContext'
import { migrationApi, crawlApi } from '../services/api'
import type { MigrationJob, MigrationStatus, StoredCrawlSession } from '../types'
import { PageLoader } from '../components/ui/Spinner'

const migrationFilters: { label: string; value: MigrationStatus | 'all' }[] = [
  { label: 'All',        value: 'all' },
  { label: 'Processing', value: 'processing' },
  { label: 'Completed',  value: 'completed' },
  { label: 'Pending',    value: 'pending' },
  { label: 'Failed',     value: 'failed' },
]

function mapCrawlJobs(jobs: Record<string, unknown>[]): StoredCrawlSession[] {
  return jobs.map((j) => {
    const stats = (j.stats ?? {}) as Record<string, unknown>
    const url = String(j.source_url ?? j.url ?? '')
    const productsScraped =
      (j.total_products as number) ??
      (j.product_output as number) ??
      (stats.products_scraped as number) ?? 0
    const pagesVisited = (stats.pages_visited as number) ?? (j.pages_visited as number) ?? 0
    const elapsedSeconds = (j.elapsed_seconds as number) ?? (stats.elapsed_seconds as number) ?? 0
    const startedAt = String(j.created_at ?? j.started_at ?? new Date().toISOString())
    const rawStatus = String(j.status ?? 'completed').replace('running', 'crawling')
    const validStatuses = ['idle', 'crawling', 'stopping', 'paused', 'completed', 'error'] as const
    const status: StoredCrawlSession['status'] =
      (validStatuses as readonly string[]).includes(rawStatus)
        ? rawStatus as StoredCrawlSession['status']
        : 'completed'
    return { url, startedAt, status, pagesVisited, productsScraped, elapsedSeconds, jobId: String(j.job_id ?? '') }
  })
}

export default function Jobs() {
  const navigate = useNavigate()
  const pageRef = usePageAnimation()
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState<'all' | 'migrations' | 'crawls'>('all')
  const [jobs, setJobs] = useState<MigrationJob[]>([])
  const [crawls, setCrawls] = useState<StoredCrawlSession[]>([])
  const [filter, setFilter] = useState<MigrationStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([
      migrationApi.listJobs(user.id).then(setJobs).catch(console.error),
      crawlApi.listUserJobs(user.id)
        .then((d) => setCrawls(mapCrawlJobs(d.jobs)))
        .catch(console.error),
    ]).finally(() => setLoading(false))
  }, [user])

  async function handleDeleteJob(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id))
    try {
      await migrationApi.deleteJob(id)
    } catch {
      if (user) migrationApi.listJobs(user.id).then(setJobs).catch(console.error)
    }
  }

  async function handleDeleteCrawl(url: string) {
    const session = crawls.find((s) => s.url === url)
    setCrawls((prev) => prev.filter((s) => s.url !== url))
    if (session?.jobId) {
      try { await crawlApi.deleteCrawlJob(session.jobId) } catch (err) { console.error(err) }
    }
  }

  if (loading) return <PageLoader label="Loading jobs…" />

  const q = search.trim().toLowerCase()

  const filteredMigrations = jobs.filter((j) => {
    const matchesFilter = filter === 'all' || j.status === filter
    const matchesSearch = !q || j.name.toLowerCase().includes(q)
    return matchesFilter && matchesSearch
  })

  const filteredCrawls = crawls.filter((c) => {
    return !q || c.url.toLowerCase().includes(q)
  })

  const showMigrations = activeTab === 'all' || activeTab === 'migrations'
  const showCrawls     = activeTab === 'all' || activeTab === 'crawls'
  const totalShown     = (showMigrations ? filteredMigrations.length : 0) + (showCrawls ? filteredCrawls.length : 0)

  const tabs = [
    { key: 'all',        label: 'All',        count: jobs.length + crawls.length,  icon: <TrendingUp className="w-3 h-3" /> },
    { key: 'migrations', label: 'Migrations',  count: jobs.length,                  icon: <TrendingUp className="w-3 h-3" /> },
    { key: 'crawls',     label: 'Crawls',      count: crawls.length,                icon: <Globe className="w-3 h-3" /> },
  ] as const

  return (
    <div ref={pageRef} className="min-h-screen relative z-10">
      {/* Header */}
      <div className="px-4 sm:px-8 pt-8 pb-6 themed-header">
        <div className="max-w-5xl mx-auto flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-400 mb-1">My Jobs</p>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-black dark:text-white">All Jobs</h1>
            <p className="text-sm text-slate-500 dark:text-slate-500 font-light mt-1">
              {jobs.length} migration{jobs.length !== 1 ? 's' : ''} · {crawls.length} crawl{crawls.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="primary" size="md" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/new-migration')}>
            New Migration
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto">

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs…"
              className="themed-input w-full pl-9 pr-4 py-2 rounded-full text-sm text-slate-700 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
            />
          </div>

          {/* Type tabs */}
          <div className="bg-black/5 dark:bg-white/5 p-1 rounded-full flex gap-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                  activeTab === t.key
                    ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                    activeTab === t.key
                      ? 'bg-white/20'
                      : 'bg-black/8 dark:bg-white/8 text-slate-500 dark:text-slate-400'
                  }`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Status filter — only for migrations tab */}
          {activeTab !== 'crawls' && (
            <div className="bg-black/5 dark:bg-white/5 p-1 rounded-full flex gap-0.5">
              {migrationFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                    filter === f.value
                      ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {f.label}
                  {f.value !== 'all' && (
                    <span className="ml-1 opacity-60">
                      ({jobs.filter((j) => j.status === f.value).length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lists */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="space-y-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {showMigrations && filteredMigrations.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} onDelete={handleDeleteJob} />
            ))}

            {showCrawls && filteredCrawls.length > 0 && (
              <>
                {activeTab === 'all' && filteredMigrations.length > 0 && (
                  <div className="flex items-center gap-3 pt-1 pb-0.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      Crawls
                    </span>
                    <div className="flex-1 h-px bg-black/5 dark:bg-white/5" />
                  </div>
                )}
                {filteredCrawls.map((session, i) => (
                  <CrawlCard key={session.jobId || session.url} session={session} index={i} onDelete={handleDeleteCrawl} />
                ))}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Empty state */}
        {totalShown === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Search className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">No jobs found</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
              {q ? `No jobs matching "${search}"` : `No ${activeTab === 'all' ? '' : activeTab + ' '}jobs yet.`}
            </p>
            {!q && (
              <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/new-migration')}>
                Get started
              </Button>
            )}
          </div>
        )}

        {/* Footer */}
        {totalShown > 0 && (
          <motion.div
            className="flex items-center gap-3 mt-6 pt-5 border-t border-black/5 dark:border-white/5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Showing {totalShown} of {jobs.length + crawls.length} jobs
            </span>
            <div className="flex items-center gap-2">
              {(['completed', 'processing', 'pending'] as MigrationStatus[]).map((s) => {
                const count = jobs.filter((j) => j.status === s).length
                if (count === 0) return null
                return <Badge key={s} variant="status" status={s} size="xs" />
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
