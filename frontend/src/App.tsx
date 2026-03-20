import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import { PageLoader } from './components/ui/Spinner'

// Layout
import DashboardLayout from './components/layout/DashboardLayout'

// Pages
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import NewMigration from './pages/NewMigration'
import Jobs from './pages/Jobs'
import JobProgress from './pages/JobProgress'
import FailedRows from './pages/FailedRows'
import Export from './pages/Export'
import Settings from './pages/Settings'
import ResultsGrid from './pages/ResultsGrid'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Authenticated routes with sidebar layout */}
        <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/new-migration" element={<NewMigration />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:jobId" element={<JobProgress />} />
          <Route path="/jobs/:jobId/failed" element={<FailedRows />} />
          <Route path="/jobs/:jobId/export" element={<Export />} />
          <Route path="/jobs/:jobId/results" element={<ResultsGrid />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AnimatePresence>
  )
}
