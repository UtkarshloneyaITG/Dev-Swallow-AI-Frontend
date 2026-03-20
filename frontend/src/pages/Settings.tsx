import { useState } from 'react'
import { motion } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { Save, Bell, Shield, Sliders, User, Palette, Moon, Sun, Check } from 'lucide-react'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ColorTheme } from '../context/ThemeContext'

export const SHOPIFY_GRID_KEY = 'swallow_shopify_grid_view'
export const SHOPIFY_CSV_KEY  = 'swallow_shopify_csv_view'

interface ToggleProps {
  label: string
  description: string
  defaultChecked?: boolean
  storageKey?: string        // if provided, persists to localStorage
}

function Toggle({ label, description, defaultChecked = false, storageKey }: ToggleProps) {
  const [checked, setChecked] = useState(() => {
    if (storageKey) return localStorage.getItem(storageKey) === 'true'
    return defaultChecked
  })

  function handleToggle() {
    const next = !checked
    setChecked(next)
    if (storageKey) localStorage.setItem(storageKey, String(next))
  }

  return (
    <div className="flex items-center justify-between py-3.5 border-b border-black/5 dark:border-white/5 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleToggle}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
          checked ? 'bg-[rgb(var(--accent,_0_0_0))]' : 'bg-slate-200 dark:bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

const sections = [
  { id: 'profile',       label: 'Profile',            icon: User    },
  { id: 'appearance',    label: 'Appearance',          icon: Palette },
  { id: 'notifications', label: 'Notifications',       icon: Bell    },
  { id: 'migration',     label: 'Migration Defaults',  icon: Sliders },
  { id: 'security',      label: 'Security',            icon: Shield  },
]

export default function Settings() {
  const pageRef = usePageAnimation()
  const { user } = useAuth()
  const { isDark, toggle, theme: currentTheme, setTheme } = useTheme()
  const [activeSection, setActiveSection] = useState('profile')
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div ref={pageRef} className="min-h-screen relative z-10">
      {/* Header */}
      <div className="px-8 pt-10 pb-6 themed-header">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-1">
            Settings
          </p>
          <h1 className="text-3xl font-light tracking-tight text-black dark:text-white">
            Preferences
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-light mt-1">
            Manage your account and migration settings
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="flex gap-8">
          {/* Side nav */}
          <div className="w-44 flex-shrink-0">
            <nav className="space-y-0.5">
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 text-left ${
                    activeSection === id
                      ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))]'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${activeSection === id ? 'text-[rgb(var(--accent-fg,_255_255_255))]' : 'text-slate-400 dark:text-slate-500'}`}
                  />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 max-w-lg">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeSection === 'profile' && (
                <div className="themed-card rounded-2xl p-6 space-y-5">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Profile Information
                  </h2>

                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                      <span className="text-sm font-semibold text-white">
                        {user?.avatarInitials ?? '??'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {name}
                      </p>
                      <button className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mt-0.5">
                        Change avatar
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                      Full Name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="themed-input w-full px-4 py-2.5 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="themed-input w-full px-4 py-2.5 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
                    />
                  </div>

                  <Button
                    variant="primary"
                    size="md"
                    icon={<Save className="w-4 h-4" />}
                    onClick={handleSave}
                    loading={saved}
                  >
                    {saved ? 'Saved!' : 'Save Changes'}
                  </Button>
                </div>
              )}

              {activeSection === 'appearance' && (
                <div className="themed-card rounded-2xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    Appearance
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
                    Customize how Swallow looks on your device.
                  </p>

                  {/* Light / Dark base toggle */}
                  <div className="flex items-center justify-between py-3.5 border-b border-black/5 dark:border-white/5 mb-5">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl transition-colors ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                        <motion.div
                          animate={{ rotate: isDark ? 0 : 180 }}
                          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        >
                          {isDark
                            ? <Moon className="w-4 h-4 text-slate-300" />
                            : <Sun className="w-4 h-4 text-slate-500" />
                          }
                        </motion.div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {isDark ? 'Dark mode' : 'Light mode'}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`}
                    >
                      <motion.span
                        className="inline-block h-4 w-4 rounded-full bg-white shadow-sm"
                        animate={{ x: isDark ? 24 : 4 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>

                  {/* Theme swatches — 3-column grid */}
                  <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Color Theme</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {([
                      { id: 'light',    label: 'Light',    bg: '#f8fafc',  sidebar: 'rgba(255,255,255,0.85)', accent: '#000000', bar1: '#e2e8f0', bar2: '#cbd5e1' },
                      { id: 'dark',     label: 'Dark',     bg: '#020617',  sidebar: 'rgba(15,23,42,0.9)',     accent: '#ffffff', bar1: '#1e293b', bar2: '#0f172a' },
                      { id: 'midnight', label: 'Midnight', bg: '#07101e',  sidebar: 'rgba(8,16,42,0.95)',     accent: '#6366f1', bar1: '#1e2a4a', bar2: '#131e38' },
                      { id: 'aurora',   label: 'Aurora',   bg: '#0d0618',  sidebar: 'rgba(18,6,36,0.95)',     accent: '#a855f7', bar1: '#2e1052', bar2: '#1a0830' },
                      { id: 'forest',   label: 'Forest',   bg: '#051208',  sidebar: 'rgba(5,18,10,0.95)',     accent: '#22c55e', bar1: '#052e16', bar2: '#041e0d' },
                      { id: 'sunset',   label: 'Sunset',   bg: '#150900',  sidebar: 'rgba(22,9,0,0.95)',      accent: '#f97316', bar1: '#431407', bar2: '#2c0e04' },
                    ] as const).map(({ id, label, bg, sidebar, accent, bar1, bar2 }) => {
                      const isActive = currentTheme === id
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setTheme(id as ColorTheme)}
                          className={`relative rounded-xl border-2 p-2.5 text-left transition-all duration-150 ${
                            isActive
                              ? 'border-[rgb(var(--accent,_0_0_0))] dark:border-white/60'
                              : 'border-transparent hover:border-slate-200 dark:hover:border-slate-600'
                          }`}
                        >
                          {/* Mini app preview */}
                          <div
                            className="h-14 rounded-lg overflow-hidden mb-2 flex"
                            style={{ background: bg }}
                          >
                            {/* Sidebar strip */}
                            <div
                              className="w-5 h-full flex flex-col gap-1 p-1"
                              style={{ background: sidebar }}
                            >
                              <div className="w-full h-1 rounded-full" style={{ background: accent, opacity: 0.9 }} />
                              <div className="w-full h-0.5 rounded-full" style={{ background: accent, opacity: 0.3 }} />
                              <div className="w-full h-0.5 rounded-full" style={{ background: accent, opacity: 0.3 }} />
                            </div>
                            {/* Content area */}
                            <div className="flex-1 p-1.5 space-y-1">
                              <div className="h-1.5 w-3/4 rounded-full" style={{ background: bar1 }} />
                              <div className="h-1 w-1/2 rounded-full" style={{ background: bar2 }} />
                              <div className="mt-1.5 h-3 w-full rounded" style={{ background: bar2, opacity: 0.6 }} />
                              <div className="h-1 rounded-full w-2/3" style={{ background: bar1, opacity: 0.5 }} />
                            </div>
                          </div>

                          {/* Label + checkmark */}
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</p>
                            {isActive && (
                              <span className="w-4 h-4 rounded-full bg-[rgb(var(--accent,_0_0_0))] flex items-center justify-center flex-shrink-0">
                                <Check className="w-2.5 h-2.5 text-[rgb(var(--accent-fg,_255_255_255))]" />
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {activeSection === 'notifications' && (
                <div className="themed-card rounded-2xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                    Notification Preferences
                  </h2>
                  <Toggle
                    label="Job completed"
                    description="Notify when a migration job finishes"
                    defaultChecked={true}
                  />
                  <Toggle
                    label="Job failed"
                    description="Alert when a job encounters critical errors"
                    defaultChecked={true}
                  />
                  <Toggle
                    label="Weekly digest"
                    description="Summary of migration activity every Monday"
                    defaultChecked={false}
                  />
                  <Toggle
                    label="AI retry alerts"
                    description="Notify when AI auto-corrections are applied"
                    defaultChecked={false}
                  />
                </div>
              )}

              {activeSection === 'migration' && (
                <div className="themed-card rounded-2xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                    Migration Defaults
                  </h2>
                  <Toggle
                    label="Auto-retry with AI"
                    description="Automatically retry failed rows using AI correction"
                    defaultChecked={true}
                  />
                  <Toggle
                    label="Skip empty fields"
                    description="Ignore blank optional fields instead of erroring"
                    defaultChecked={true}
                  />
                  <Toggle
                    label="Strict mode"
                    description="Fail rows with any validation warning (not just errors)"
                    defaultChecked={false}
                  />
                  <Toggle
                    label="Preserve original IDs"
                    description="Keep source system IDs as external_id in Shopify"
                    defaultChecked={false}
                  />
                  <Toggle
                    label="Shopify Product View"
                    description="Show a Shopify-style product card view button on the Results page"
                    storageKey={SHOPIFY_GRID_KEY}
                  />
                  <Toggle
                    label="Shopify CSV Preview"
                    description="Show a Shopify CSV format preview button on the Results page"
                    storageKey={SHOPIFY_CSV_KEY}
                  />
                </div>
              )}

              {activeSection === 'security' && (
                <div className="themed-card rounded-2xl p-6 space-y-5">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Security Settings
                  </h2>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                      Current Password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="themed-input w-full px-4 py-2.5 rounded-xl text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      placeholder="Min. 8 characters"
                      className="themed-input w-full px-4 py-2.5 rounded-xl text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      placeholder="Repeat new password"
                      className="themed-input w-full px-4 py-2.5 rounded-xl text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
                    />
                  </div>

                  <Button
                    variant="primary"
                    size="md"
                    icon={<Shield className="w-4 h-4" />}
                    onClick={handleSave}
                    loading={saved}
                  >
                    Update Password
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
