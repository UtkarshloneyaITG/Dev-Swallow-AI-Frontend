import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { Plus, Search } from 'lucide-react'
import Button from '../components/ui/Button'
import JobCard from '../components/migration/JobCard'
import Badge from '../components/ui/Badge'
import { useAuth } from '../context/AuthContext'
import { migrationApi } from '../services/api'
import type { MigrationJob } from '../types'
import type { MigrationStatus } from '../types'
import { PageLoader } from '../components/ui/Spinner'

const filters: { label: string; value: MigrationStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Processing', value: 'processing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Failed', value: 'failed' },
]

export default function Jobs() {
  const navigate = useNavigate()
  const pageRef = usePageAnimation()
  const { user } = useAuth()
  const [jobs, setJobs] = useState<MigrationJob[]>([])
  const [filter, setFilter] = useState<MigrationStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    migrationApi.listJobs(user.id)
      .then(setJobs)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user])

  async function handleDeleteJob(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id))
    try {
      await migrationApi.deleteJob(id)
    } catch (err) {
      if (user) migrationApi.listJobs(user.id).then(setJobs).catch(console.error)
    }
  }

  if (loading) return <PageLoader label="Loading jobs…" />

  const filtered = jobs.filter((job) => {
    const matchesFilter = filter === 'all' || job.status === filter
    const matchesSearch =
      search.trim() === '' ||
      job.name.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div ref={pageRef} className="min-h-screen relative z-10">
      {/* Header */}
      <div className="px-8 pt-10 pb-6 themed-header">
        <div className="max-w-5xl mx-auto flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-400 mb-1">
              My Jobs
            </p>
            <h1 className="text-3xl font-light tracking-tight text-black dark:text-white">
              Migration history
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-500 font-light mt-1">
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} total
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
      </div>

      {/* Body */}
      <div className="px-8 py-8 max-w-5xl mx-auto">
        {/* Controls */}
        <div className="flex items-center gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs…"
              className="themed-input w-full pl-9 pr-4 py-2 rounded-full text-sm text-slate-700 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
            />
          </div>

          {/* Filter tabs */}
          <div className="bg-black/5 dark:bg-white/5 p-1 rounded-full flex gap-0.5">
            {filters.map((f) => (
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
        </div>

        {/* Job list */}
        {filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} onDelete={handleDeleteJob} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Search className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              No jobs found
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
              {search
                ? `No jobs matching "${search}"`
                : `No ${filter} jobs yet.`}
            </p>
            {filter === 'all' && !search && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => navigate('/new-migration')}
              >
                Start migrating
              </Button>
            )}
          </div>
        )}

        {/* Summary footer */}
        {filtered.length > 0 && (
          <motion.div
            className="flex items-center gap-3 mt-6 pt-5 border-t border-black/5 dark:border-white/5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Showing {filtered.length} of {jobs.length} jobs
            </span>
            <div className="flex items-center gap-2">
              {(['completed', 'processing', 'pending'] as MigrationStatus[]).map(
                (s) => {
                  const count = jobs.filter((j) => j.status === s).length
                  if (count === 0) return null
                  return <Badge key={s} variant="status" status={s} size="xs" />
                }
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
