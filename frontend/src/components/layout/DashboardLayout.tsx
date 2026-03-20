import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BlobBackground from '../ui/BlobBackground'

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 relative">
      <BlobBackground />
      <Sidebar />
      <main className="relative z-10 flex-1 overflow-y-auto min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
