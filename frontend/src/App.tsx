import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import { PageLoader } from './components/ui/Spinner'
import ErrorBoundary from './components/ui/ErrorBoundary'

// Layout
import DashboardLayout from './components/layout/DashboardLayout'

// Pages — lightweight (eager load)
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'

// Pages — heavy (lazy load to reduce initial bundle)
const NewMigration = lazy(() => import('./pages/NewMigration'))
const JobProgress  = lazy(() => import('./pages/JobProgress'))
const FailedRows   = lazy(() => import('./pages/FailedRows'))
const Export       = lazy(() => import('./pages/Export'))
const Settings     = lazy(() => import('./pages/Settings'))
const ResultsGrid  = lazy(() => import('./pages/ResultsGrid'))
const BatchExport  = lazy(() => import('./pages/BatchExport'))
const MergedJobView = lazy(() => import('./pages/MergedJobView'))
const CrawlDetail  = lazy(() => import('./pages/CrawlDetail'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Authenticated routes with sidebar layout */}
          <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/new-migration" element={<Suspense fallback={<PageLoader />}><NewMigration /></Suspense>} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:jobId" element={<Suspense fallback={<PageLoader />}><JobProgress /></Suspense>} />
            <Route path="/jobs/:jobId/failed" element={<Suspense fallback={<PageLoader />}><FailedRows /></Suspense>} />
            <Route path="/jobs/:jobId/export" element={<Suspense fallback={<PageLoader />}><Export /></Suspense>} />
            <Route path="/jobs/:jobId/results" element={<Suspense fallback={<PageLoader />}><ResultsGrid /></Suspense>} />
            <Route path="/batch-export" element={<Suspense fallback={<PageLoader />}><BatchExport /></Suspense>} />
            <Route path="/merged/:mergedId" element={<Suspense fallback={<PageLoader />}><MergedJobView /></Suspense>} />
            <Route path="/crawls/:jobId" element={<Suspense fallback={<PageLoader />}><CrawlDetail /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  )
}
