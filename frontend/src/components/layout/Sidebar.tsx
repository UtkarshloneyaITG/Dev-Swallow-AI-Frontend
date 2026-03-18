import type { ComponentType } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Plus,
  Layers,
  Settings,
  LogOut,
} from 'lucide-react'
import Logo from '../ui/Logo'
import { useAuth } from '../../context/AuthContext'

interface NavItem {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'New Migration', to: '/new-migration', icon: Plus },
  { label: 'My Jobs', to: '/jobs', icon: Layers },
  { label: 'Settings', to: '/settings', icon: Settings },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <motion.aside
      className="w-60 flex-shrink-0 h-screen sticky top-0 flex flex-col backdrop-blur-xl border-r border-black/5 dark:border-white/5 overflow-hidden"
      data-sidebar
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <div>
            <span className="text-lg font-light tracking-tight text-black dark:text-white">
              Swallow
            </span>
            <div className="text-xs text-slate-400 dark:text-slate-500 font-light -mt-0.5">
              The Migration Platform
            </div>
          </div>
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
      <div className="px-3 pb-5 border-t border-black/5 dark:border-white/5 pt-4 space-y-1">
        {/* User info */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center flex-shrink-0">
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

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-150 group"
        >
          <LogOut className="w-4 h-4 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
          Sign out
        </button>
      </div>
    </motion.aside>
  )
}
