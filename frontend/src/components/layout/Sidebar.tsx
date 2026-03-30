import type { ComponentType } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Plus,
  Layers,
  Combine,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import Logo from '../ui/Logo'
import { useAuth } from '../../context/AuthContext'

interface NavItem {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { label: 'Dashboard',     to: '/dashboard',    icon: LayoutDashboard },
  { label: 'New Migration', to: '/new-migration', icon: Plus },
  { label: 'My Jobs',       to: '/jobs',          icon: Layers },
  { label: 'Batch Export',  to: '/batch-export',  icon: Combine },
  { label: 'Settings',      to: '/settings',      icon: Settings },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const sidebarContent = (
    <div
      className="w-60 flex-shrink-0 h-screen flex flex-col backdrop-blur-xl overflow-hidden"
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        boxShadow: 'inset -1px 0 0 var(--border-end), inset 0 1px 0 var(--border-start)',
      }}
    >
      {/* Logo */}
      <div className="relative px-5 pt-6 pb-5" style={{ boxShadow: 'inset 0 -1px 0 var(--border-end)' }}>
        <div className="flex items-center gap-2.5">
          <Logo size={42} />
          <div className="flex-1 min-w-0">
            <span className="text-lg font-light tracking-tight text-black dark:text-white">
              Swallow
            </span>
            <div className="text-xs text-slate-400 dark:text-slate-500 font-light -mt-0.5">
              The Migration Platform
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        <div className="mb-2 px-2">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">
            Navigation
          </p>
        </div>
        {navItems.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              [
                'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'nav-active bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm shadow-black/20'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/5 dark:hover:bg-white/5',
              ].join(' ')
            }
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                <Icon
                  className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-[rgb(var(--accent-fg,_255_255_255))]' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`}
                />
                {label}
                {label === 'New Migration' && (
                  <span
                    className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-[rgb(var(--accent-fg,_255_255_255))]/20 text-[rgb(var(--accent-fg,_255_255_255))]' : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}
                  >
                    +
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-3 pb-5 pt-4 space-y-1" style={{ boxShadow: 'inset 0 1px 0 var(--border-end)' }}>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-[#F97316] dark:from-neutral-600 dark:to-neutral-800 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-white">
              {user?.avatarInitials ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              {user?.name ?? '—'}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
              {user?.email ?? '—'}
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-150 group"
        >
          <LogOut className="w-4 h-4 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop — always visible */}
      <motion.div
        className="hidden md:block sticky top-0 h-screen flex-shrink-0"
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {sidebarContent}
      </motion.div>

      {/* Mobile — slide-in overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-y-0 left-0 z-50 md:hidden"
            initial={{ x: -240, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -240, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
