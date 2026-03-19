import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { Plus, TrendingUp, CheckCircle2, Clock, AlertCircle, Globe } from 'lucide-react'
import Button from '../components/ui/Button'
import JobCard from '../components/migration/JobCard'
import CrawlCard from '../components/migration/CrawlCard'
import { useAuth } from '../context/AuthContext'
import { migrationApi, getStoredCrawlSessions, removeCrawlSession } from '../services/api'
import type { MigrationJob, StoredCrawlSession } from '../types'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [jobs, setJobs] = useState<MigrationJob[]>([])
  const [crawls, setCrawls] = useState<StoredCrawlSession[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'migrations' | 'crawls'>('all')

  useEffect(() => {
    if (!user) return
    migrationApi.listJobs(user.id).then(setJobs).catch(console.error)
    setCrawls(getStoredCrawlSessions(user.id))
  }, [user])

  function handleDeleteCrawl(url: string) {
    if (!user) return
    setCrawls((prev) => prev.filter((s) => s.url !== url))
    removeCrawlSession(user.id, url)
  }

  async function handleDeleteJob(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id))
    try {
      await migrationApi.deleteJob(id)
    } catch (err) {
      console.error('Delete failed:', err)
      // Re-fetch to restore state if delete failed
      if (user) migrationApi.listJobs(user.id).then(setJobs).catch(console.error)
    }
  }

  const totalJobs = jobs.length
  const completedJobs = jobs.filter((j) => j.status === 'completed').length
  const processingJobs = jobs.filter((j) => j.status === 'processing').length
  const pendingJobs = jobs.filter((j) => j.status === 'pending').length

  const totalCorrect = jobs.reduce((a, j) => a + j.correctRows, 0)
  const totalFailed = jobs.reduce((a, j) => a + j.failedRows, 0)
  const totalRows = jobs.reduce((a, j) => a + j.totalRows, 0)

  const successRate =
    totalRows > 0 ? Math.round(((totalCorrect) / (totalCorrect + totalFailed || 1)) * 100) : 0

  const pageRef = usePageAnimation()

  return (
    <div ref={pageRef} className="min-h-screen">
      {/* Page header */}
      <motion.div
        className="px-8 pt-8 pb-6 themed-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-7">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              Overview
            </p>
            <h1 className="text-3xl font-light tracking-tight text-black dark:text-white">
              Hello, {user?.name.split(' ')[0] ?? 'there'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-light mt-1">
              {totalJobs} migration job{totalJobs !== 1 ? 's' : ''} · {processingJobs > 0 ? `${processingJobs} running` : 'all quiet'}
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => navigate('/new-migration')}
          >
            New Migration
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-5">
          {[
            {
              label: 'Total Jobs',
              value: totalJobs,
              icon: <TrendingUp className="w-4 h-4" />,
              color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
            },
            {
              label: 'Completed',
              value: completedJobs,
              icon: <CheckCircle2 className="w-4 h-4" />,
              color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
            },
            {
              label: 'Processing',
              value: processingJobs,
              icon: <Clock className="w-4 h-4" />,
              color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
            },
            {
              label: 'Success Rate',
              value: `${successRate}%`,
              icon: <AlertCircle className="w-4 h-4" />,
              color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="themed-card rounded-2xl p-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={`inline-flex p-1.5 rounded-lg ${stat.color} mb-2`}>
                {stat.icon}
              </div>
              <div className="text-2xl font-light text-slate-800 dark:text-slate-200 tabular-nums">
                {stat.value}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-widest mt-0.5">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
        </div>{/* /max-w-6xl mx-auto */}
      </motion.div>

      {/* Recent activity */}
      <div className="px-8 py-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Recent Activity
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {activeTab === 'crawls' ? 'Click any crawl to resume or use its data' : 'Click any job to view progress and details'}
            </p>
          </div>

          {/* Tabs */}
          <div className="bg-black/5 dark:bg-white/5 p-1 rounded-full flex gap-0.5 ml-auto">
            {([
              { key: 'all',        label: 'All',        count: jobs.length + crawls.length },
              { key: 'migrations', label: 'Migrations', count: jobs.length },
              { key: 'crawls',     label: 'Crawls',     count: crawls.length },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                  activeTab === key
                    ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                    activeTab === key
                      ? 'bg-white/20 text-[rgb(var(--accent-fg,_255_255_255))]'
                      : 'bg-black/8 dark:bg-white/8 text-slate-500 dark:text-slate-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {(activeTab === 'all' || activeTab === 'migrations') &&
            jobs.map((job, i) => <JobCard key={job.id} job={job} index={i} onDelete={handleDeleteJob} />)}

          {(activeTab === 'all' || activeTab === 'crawls') &&
            crawls.map((session, i) => (
              <CrawlCard key={session.url + session.startedAt} session={session} index={activeTab === 'all' ? jobs.length + i : i} onDelete={handleDeleteCrawl} />
            ))}
        </div>

        {/* Empty state */}
        {jobs.length === 0 && crawls.length === 0 && (
          <motion.div
            className="flex flex-col items-center justify-center py-20 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <TrendingUp className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              No activity yet
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 max-w-xs">
              Start a crawl to scrape a store, or create a migration job to import data.
            </p>
            <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/new-migration')}>
              Get started
            </Button>
          </motion.div>
        )}

        {/* Crawls-only empty state */}
        {activeTab === 'crawls' && crawls.length === 0 && (
          <motion.div
            className="flex flex-col items-center justify-center py-16 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center mb-4">
              <Globe className="w-5 h-5 text-sky-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">No crawls yet</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 max-w-xs">
              Use the website crawler in New Migration to scrape product data from any store URL.
            </p>
            <Button variant="secondary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/new-migration')}>
              Start crawling
            </Button>
          </motion.div>
        )}

        {/* Migrations-only empty state */}
        {activeTab === 'migrations' && jobs.length === 0 && (
          <motion.div
            className="flex flex-col items-center justify-center py-16 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <TrendingUp className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">No migrations yet</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 max-w-xs">
              Create your first migration job to start importing Shopify data.
            </p>
            <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/new-migration')}>
              Start migrating
            </Button>
          </motion.div>
        )}

        {/* Pending note */}
        {pendingJobs > 0 && (
          <motion.div
            className="mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-2xl p-4 flex items-start gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <span className="font-semibold">{pendingJobs} job{pendingJobs !== 1 ? 's' : ''} pending</span> — queued and waiting for a worker to pick them up. They will begin processing shortly.
            </p>
          </motion.div>
        )}
      </div>

    </div>
  )
}
