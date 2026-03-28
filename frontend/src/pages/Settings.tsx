import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { Save, Bell, Shield, Sliders, User, Palette, Moon, Sun, Check, Server, RotateCcw, RefreshCw, LayoutDashboard } from 'lucide-react'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ColorTheme } from '../context/ThemeContext'
import { API_OVERRIDE_KEY, CRAWL_OVERRIDE_KEY } from '../services/api'

export const SHOPIFY_GRID_KEY = 'swallow_shopify_grid_view'
export const SHOPIFY_CSV_KEY  = 'swallow_shopify_csv_view'

// Dashboard customisation keys
export const DASH_CHART_TYPE    = 'swallow_dash_chart_type'    // donut | ring | bars
export const DASH_CHART_PALETTE = 'swallow_dash_chart_palette' // default | vibrant | pastel | mono
export const DASH_CARD_STYLE    = 'swallow_dash_card_style'    // filled | outlined | minimal
export const DASH_SHOW_METRICS  = 'swallow_dash_show_metrics'
export const DASH_SHOW_CHART    = 'swallow_dash_show_chart'
export const DASH_COMPACT_TABLE = 'swallow_dash_compact_table'

interface ToggleProps {
  label: string
  description: string
  defaultChecked?: boolean
  storageKey?: string
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
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-black/5 dark:border-white/5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleToggle}
        className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
          checked
            ? 'bg-[rgb(var(--accent,_0_0_0))] dark:bg-emerald-500'
            : 'bg-slate-200 dark:bg-slate-700'
        }`}
      >
        <motion.span
          className="inline-block h-4 w-4 rounded-full bg-white dark:bg-slate-100 shadow-sm"
          animate={{ x: checked ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  )
}

const sections = [
  { id: 'profile',       label: 'Profile',       icon: User    },
  { id: 'appearance',    label: 'Appearance',    icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell    },
  { id: 'migration',     label: 'Defaults',      icon: Sliders },
  { id: 'security',      label: 'Security',      icon: Shield  },
  { id: 'dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'developer',     label: 'Developer',     icon: Server  },
]

export default function Settings() {
  const pageRef = usePageAnimation()
  const { user } = useAuth()
  const { isDark, toggle, theme: currentTheme, setTheme } = useTheme()
  const [activeSection, setActiveSection] = useState('profile')
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saved, setSaved] = useState(false)

  // Developer overrides
  const [apiOverride, setApiOverride]     = useState(() => localStorage.getItem(API_OVERRIDE_KEY)   ?? '')
  const [crawlOverride, setCrawlOverride] = useState(() => localStorage.getItem(CRAWL_OVERRIDE_KEY) ?? '')
  const [urlSaved, setUrlSaved]           = useState(false)

  // Dashboard customisation state
  const [chartType,    setChartType]    = useState(() => localStorage.getItem(DASH_CHART_TYPE)    || 'donut')
  const [chartPalette, setChartPalette] = useState(() => localStorage.getItem(DASH_CHART_PALETTE) || 'default')
  const [cardStyle,    setCardStyle]    = useState(() => localStorage.getItem(DASH_CARD_STYLE)    || 'filled')
  const [showMetrics,  setShowMetrics]  = useState(() => localStorage.getItem(DASH_SHOW_METRICS)  !== 'false')
  const [showChart,    setShowChart]    = useState(() => localStorage.getItem(DASH_SHOW_CHART)    !== 'false')
  const [compactTable, setCompactTable] = useState(() => localStorage.getItem(DASH_COMPACT_TABLE) === 'true')

  function saveDashSetting(key: string, value: string) {
    localStorage.setItem(key, value)
  }

  const envApiBase   = import.meta.env.VITE_API_BASE_URL  as string | undefined
  const envCrawlBase = import.meta.env.VITE_CRAWL_API_URL as string | undefined

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleSaveUrls() {
    if (apiOverride.trim())   localStorage.setItem(API_OVERRIDE_KEY,   apiOverride.trim())
    else                      localStorage.removeItem(API_OVERRIDE_KEY)
    if (crawlOverride.trim()) localStorage.setItem(CRAWL_OVERRIDE_KEY, crawlOverride.trim())
    else                      localStorage.removeItem(CRAWL_OVERRIDE_KEY)
    setUrlSaved(true)
    setTimeout(() => window.location.reload(), 800)
  }

  function handleClearUrls() {
    localStorage.removeItem(API_OVERRIDE_KEY)
    localStorage.removeItem(CRAWL_OVERRIDE_KEY)
    setApiOverride('')
    setCrawlOverride('')
    setTimeout(() => window.location.reload(), 300)
  }

  const activeLabel = sections.find(s => s.id === activeSection)?.label ?? ''

  return (
    <div ref={pageRef} className="min-h-screen relative z-10">
      {/* Header */}
      <div className="px-4 sm:px-8 pt-6 sm:pt-10 pb-6 themed-header">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-1">
            Settings
          </p>
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-black dark:text-white">
            Preferences
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-light mt-1">
            Manage your account and migration settings
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">

          {/* ── Navigation ── */}
          <div className="sm:w-44 sm:flex-shrink-0">

            {/* Mobile: icon + label pill tabs */}
            <div className="sm:hidden flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
              {sections.map(({ id, label, icon: Icon }) => {
                const active = activeSection === id
                return (
                  <button
                    key={id}
                    onClick={() => setActiveSection(id)}
                    className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl text-[10px] font-semibold uppercase tracking-wide transition-all duration-150 min-w-[60px] ${
                      active
                        ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm'
                        : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Desktop: vertical sidebar nav */}
            <nav className="hidden sm:block space-y-0.5">
              <div className="mb-3 px-2">
                <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">
                  Preferences
                </p>
              </div>
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

          {/* ── Content ── */}
          <div className="flex-1 min-w-0">
            {/* Active section label — mobile only */}
            <p className="sm:hidden text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
              {activeLabel}
            </p>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >

                {/* ── Profile ── */}
                {activeSection === 'profile' && (
                  <div className="themed-card rounded-2xl p-4 sm:p-6 space-y-5">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Profile Information
                    </h2>

                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-[#F97316] dark:from-slate-700 dark:to-slate-900 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-base font-semibold text-white">
                          {user?.avatarInitials ?? '??'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {email}
                        </p>
                        <button className="text-xs text-[rgb(var(--accent,_0_0_0))] dark:text-slate-400 hover:opacity-70 transition-opacity mt-1">
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

                {/* ── Appearance ── */}
                {activeSection === 'appearance' && (
                  <div className="themed-card rounded-2xl p-4 sm:p-6 space-y-6">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                        Appearance
                      </h2>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Customize how Swallow looks on your device.
                      </p>
                    </div>

                    {/* Light / Dark toggle */}
                    <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl transition-colors ${isDark ? 'bg-slate-700' : 'bg-white shadow-sm'}`}>
                          <motion.div
                            animate={{ rotate: isDark ? 0 : 180 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                          >
                            {isDark
                              ? <Moon className="w-4 h-4 text-slate-300" />
                              : <Sun className="w-4 h-4 text-amber-500" />
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
                        className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`}
                      >
                        <motion.span
                          className="inline-block h-4 w-4 rounded-full bg-white shadow-sm"
                          animate={{ x: isDark ? 24 : 4 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      </button>
                    </div>

                    {/* Color theme swatches */}
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">
                        Color Theme
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {([
                          { id: 'light',    label: 'Light',    bg: '#f8fafc',  sidebar: 'rgba(255,255,255,0.85)', accent: '#131313', bar1: '#e2e8f0', bar2: '#cbd5e1' },
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
                              {/* Mini preview */}
                              <div className="h-12 sm:h-14 rounded-lg overflow-hidden mb-2 flex" style={{ background: bg }}>
                                <div className="w-5 h-full flex flex-col gap-1 p-1" style={{ background: sidebar }}>
                                  <div className="w-full h-1 rounded-full" style={{ background: accent, opacity: 0.9 }} />
                                  <div className="w-full h-0.5 rounded-full" style={{ background: accent, opacity: 0.3 }} />
                                  <div className="w-full h-0.5 rounded-full" style={{ background: accent, opacity: 0.3 }} />
                                </div>
                                <div className="flex-1 p-1.5 space-y-1">
                                  <div className="h-1.5 w-3/4 rounded-full" style={{ background: bar1 }} />
                                  <div className="h-1 w-1/2 rounded-full" style={{ background: bar2 }} />
                                  <div className="mt-1.5 h-3 w-full rounded" style={{ background: bar2, opacity: 0.6 }} />
                                  <div className="h-1 rounded-full w-2/3" style={{ background: bar1, opacity: 0.5 }} />
                                </div>
                              </div>
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
                  </div>
                )}

                {/* ── Notifications ── */}
                {activeSection === 'notifications' && (
                  <div className="themed-card rounded-2xl p-4 sm:p-6">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                      Notification Preferences
                    </h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
                      Choose which events trigger notifications.
                    </p>
                    <Toggle label="Job completed"   description="Notify when a migration job finishes"                defaultChecked={true}  />
                    <Toggle label="Job failed"      description="Alert when a job encounters critical errors"         defaultChecked={true}  />
                    <Toggle label="Weekly digest"   description="Summary of migration activity every Monday"         defaultChecked={false} />
                    <Toggle label="AI retry alerts" description="Notify when AI auto-corrections are applied"        defaultChecked={false} />
                  </div>
                )}

                {/* ── Migration Defaults ── */}
                {activeSection === 'migration' && (
                  <div className="themed-card rounded-2xl p-4 sm:p-6">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                      Migration Defaults
                    </h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
                      Default behaviour applied to all new migration jobs.
                    </p>
                    <Toggle label="Auto-retry with AI"    description="Automatically retry failed rows using AI correction"              defaultChecked={true}  />
                    <Toggle label="Skip empty fields"     description="Ignore blank optional fields instead of erroring"                defaultChecked={true}  />
                    <Toggle label="Strict mode"           description="Fail rows with any validation warning, not just errors"          defaultChecked={false} />
                    <Toggle label="Preserve original IDs" description="Keep source system IDs as external_id in Shopify"               defaultChecked={false} />
                    <Toggle label="Shopify Product View"  description="Show a Shopify-style card view button on the Results page"       storageKey={SHOPIFY_GRID_KEY} />
                    <Toggle label="Shopify CSV Preview"   description="Show a Shopify CSV format preview button on the Results page"    storageKey={SHOPIFY_CSV_KEY}  />
                  </div>
                )}

                {/* ── Dashboard ── */}
                {activeSection === 'dashboard' && (
                  <div className="themed-card rounded-2xl p-4 sm:p-6 space-y-6">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-0.5">Dashboard</h2>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Customize your dashboard layout and charts.</p>
                    </div>

                    {/* Chart Type */}
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Chart Type</p>
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          {
                            id: 'donut', label: 'Donut',
                            preview: (
                              <svg viewBox="0 0 40 40" className="w-10 h-10">
                                <circle cx="20" cy="20" r="14" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                                <circle cx="20" cy="20" r="14" fill="none" stroke="#22c55e" strokeWidth="6"
                                  strokeDasharray="44 44" strokeDashoffset="0" strokeLinecap="round" transform="rotate(-90 20 20)" />
                                <circle cx="20" cy="20" r="14" fill="none" stroke="#f59e0b" strokeWidth="6"
                                  strokeDasharray="22 66" strokeDashoffset="-44" strokeLinecap="round" transform="rotate(-90 20 20)" />
                              </svg>
                            ),
                          },
                          {
                            id: 'ring', label: 'Thin Ring',
                            preview: (
                              <svg viewBox="0 0 40 40" className="w-10 h-10">
                                <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                                <circle cx="20" cy="20" r="16" fill="none" stroke="#22c55e" strokeWidth="3"
                                  strokeDasharray="50 50" strokeDashoffset="0" strokeLinecap="round" transform="rotate(-90 20 20)" />
                                <circle cx="20" cy="20" r="16" fill="none" stroke="#f59e0b" strokeWidth="3"
                                  strokeDasharray="25 75" strokeDashoffset="-50" strokeLinecap="round" transform="rotate(-90 20 20)" />
                              </svg>
                            ),
                          },
                          {
                            id: 'bars', label: 'Bars',
                            preview: (
                              <svg viewBox="0 0 40 28" className="w-10 h-7">
                                {[{ y: 0, w: 28, c: '#22c55e' }, { y: 8, w: 18, c: '#f59e0b' }, { y: 16, w: 10, c: '#94a3b8' }, { y: 24, w: 6, c: '#f43f5e' }].map((b, i) => (
                                  <g key={i}>
                                    <rect x="0" y={b.y} width="40" height="5" rx="2" fill="#e2e8f0" />
                                    <rect x="0" y={b.y} width={b.w} height="5" rx="2" fill={b.c} />
                                  </g>
                                ))}
                              </svg>
                            ),
                          },
                        ] as const).map(({ id, label, preview }) => {
                          const active = chartType === id
                          return (
                            <button
                              key={id}
                              onClick={() => { setChartType(id); saveDashSetting(DASH_CHART_TYPE, id) }}
                              className={`relative flex flex-col items-center gap-2.5 p-3 rounded-xl border-2 transition-all duration-150 ${
                                active
                                  ? 'border-[rgb(var(--accent,_0_0_0))] dark:border-white/60 bg-black/[0.02] dark:bg-white/[0.03]'
                                  : 'border-transparent bg-black/[0.02] dark:bg-white/[0.02] hover:border-slate-200 dark:hover:border-slate-600'
                              }`}
                            >
                              {preview}
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
                              {active && (
                                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[rgb(var(--accent,_0_0_0))] flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 text-[rgb(var(--accent-fg,_255_255_255))]" />
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Color Palette */}
                    <div className="border-t border-black/5 dark:border-white/5 pt-5">
                      <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Chart Palette</p>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { id: 'default',  label: 'Default',  colors: ['#22c55e', '#f59e0b', '#94a3b8', '#f43f5e'] },
                          { id: 'vibrant',  label: 'Vibrant',  colors: ['#06b6d4', '#8b5cf6', '#f97316', '#ec4899'] },
                          { id: 'pastel',   label: 'Pastel',   colors: ['#6ee7b7', '#c4b5fd', '#fde68a', '#fca5a5'] },
                          { id: 'mono',     label: 'Mono',     colors: ['#1e293b', '#475569', '#94a3b8', '#cbd5e1'] },
                        ] as const).map(({ id, label, colors }) => {
                          const active = chartPalette === id
                          return (
                            <button
                              key={id}
                              onClick={() => { setChartPalette(id); saveDashSetting(DASH_CHART_PALETTE, id) }}
                              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-150 ${
                                active
                                  ? 'border-[rgb(var(--accent,_0_0_0))] dark:border-white/60'
                                  : 'border-transparent bg-black/[0.02] dark:bg-white/[0.02] hover:border-slate-200 dark:hover:border-slate-600'
                              }`}
                            >
                              <div className="flex gap-1 flex-shrink-0">
                                {colors.map((c, i) => (
                                  <span key={i} className="w-4 h-4 rounded-full" style={{ backgroundColor: c }} />
                                ))}
                              </div>
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-300 flex-1 text-left">{label}</span>
                              {active && <Check className="w-3.5 h-3.5 text-[rgb(var(--accent,_0_0_0))] flex-shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Card Style */}
                    <div className="border-t border-black/5 dark:border-white/5 pt-5">
                      <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Metric Card Style</p>
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          {
                            id: 'filled', label: 'Filled',
                            preview: <div className="w-full h-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-end px-2 pb-1.5"><span className="text-xs font-bold text-sky-600">142</span></div>,
                          },
                          {
                            id: 'outlined', label: 'Outlined',
                            preview: <div className="w-full h-10 rounded-lg border-2 border-sky-300 dark:border-sky-700 flex items-end px-2 pb-1.5"><span className="text-xs font-bold text-sky-600">142</span></div>,
                          },
                          {
                            id: 'minimal', label: 'Minimal',
                            preview: <div className="w-full h-10 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] flex items-end px-2 pb-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-300">142</span></div>,
                          },
                        ] as const).map(({ id, label, preview }) => {
                          const active = cardStyle === id
                          return (
                            <button
                              key={id}
                              onClick={() => { setCardStyle(id); saveDashSetting(DASH_CARD_STYLE, id) }}
                              className={`relative flex flex-col gap-2 p-2.5 rounded-xl border-2 transition-all duration-150 ${
                                active
                                  ? 'border-[rgb(var(--accent,_0_0_0))] dark:border-white/60'
                                  : 'border-transparent bg-black/[0.02] dark:bg-white/[0.02] hover:border-slate-200 dark:hover:border-slate-600'
                              }`}
                            >
                              {preview}
                              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 text-center">{label}</span>
                              {active && (
                                <span className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full bg-[rgb(var(--accent,_0_0_0))] flex items-center justify-center">
                                  <Check className="w-2 h-2 text-[rgb(var(--accent-fg,_255_255_255))]" />
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Visible sections */}
                    <div className="border-t border-black/5 dark:border-white/5 pt-5">
                      <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-1">Visible Sections</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Show or hide individual blocks on your dashboard.</p>
                      {([
                        { label: 'Hero Metrics',  desc: 'Products scraped, rows migrated, success rate, active jobs',          val: showMetrics,  set: setShowMetrics,  key: DASH_SHOW_METRICS },
                        { label: 'Charts Panel',  desc: 'Activity area chart and donut / ring / bar job status chart',         val: showChart,    set: setShowChart,    key: DASH_SHOW_CHART },
                        { label: 'Compact Table', desc: 'Use tighter row height in the recent activity table',                 val: compactTable, set: setCompactTable, key: DASH_COMPACT_TABLE },
                      ]).map(({ label, desc, val, set, key }) => (
                        <div key={key} className="flex items-start justify-between gap-4 py-3.5 border-b border-black/5 dark:border-white/5 last:border-0">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={val}
                            onClick={() => { const next = !val; set(next); saveDashSetting(key, String(next)) }}
                            className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                              val ? 'bg-[rgb(var(--accent,_0_0_0))] dark:bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                          >
                            <motion.span
                              className="inline-block h-4 w-4 rounded-full bg-white dark:bg-slate-100 shadow-sm"
                              animate={{ x: val ? 24 : 4 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                          </button>
                        </div>
                      ))}
                    </div>

                  </div>
                )}

                {/* ── Developer ── */}
                {activeSection === 'developer' && (
                  <div className="space-y-4">
                    <div className="themed-card rounded-2xl p-4 sm:p-6 space-y-5">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          API URL Overrides
                        </h2>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">
                          Override backend URLs at runtime without rebuilding. Saved to localStorage — page reloads automatically on save.
                        </p>
                      </div>

                      {/* Migration API */}
                      <div>
                        <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                          Migration API URL
                        </label>
                        <input
                          type="url"
                          value={apiOverride}
                          onChange={(e) => setApiOverride(e.target.value)}
                          placeholder={envApiBase || 'https://your-api-tunnel.ngrok.io'}
                          className="themed-input w-full px-4 py-2.5 rounded-xl text-sm text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
                        />
                        {envApiBase && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">
                            env: {envApiBase}
                          </p>
                        )}
                        {localStorage.getItem(API_OVERRIDE_KEY) && (
                          <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-0.5 font-mono">
                            active override: {localStorage.getItem(API_OVERRIDE_KEY)}
                          </p>
                        )}
                      </div>

                      {/* Crawl API */}
                      <div>
                        <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                          Crawl API URL
                        </label>
                        <input
                          type="url"
                          value={crawlOverride}
                          onChange={(e) => setCrawlOverride(e.target.value)}
                          placeholder={envCrawlBase || envApiBase || 'https://your-crawl-tunnel.ngrok.io'}
                          className="themed-input w-full px-4 py-2.5 rounded-xl text-sm text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
                        />
                        {envCrawlBase && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">
                            env: {envCrawlBase}
                          </p>
                        )}
                        {localStorage.getItem(CRAWL_OVERRIDE_KEY) && (
                          <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-0.5 font-mono">
                            active override: {localStorage.getItem(CRAWL_OVERRIDE_KEY)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="primary"
                          size="md"
                          icon={urlSaved ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                          onClick={handleSaveUrls}
                          loading={urlSaved}
                        >
                          {urlSaved ? 'Saved — reloading…' : 'Save & Reload'}
                        </Button>
                        <button
                          type="button"
                          onClick={handleClearUrls}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Clear overrides
                        </button>
                      </div>
                    </div>

                    {/* localStorage keys info */}
                    <div className="themed-card rounded-2xl p-4 sm:p-5">
                      <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">
                        Storage keys
                      </p>
                      <div className="space-y-2">
                        {[
                          { key: API_OVERRIDE_KEY,   label: 'Migration API override' },
                          { key: CRAWL_OVERRIDE_KEY, label: 'Crawl API override' },
                        ].map(({ key, label }) => (
                          <div key={key} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.03]">
                            <div>
                              <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{key}</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">{label}</p>
                            </div>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              localStorage.getItem(key)
                                ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                            }`}>
                              {localStorage.getItem(key) ? 'active' : 'not set'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Security ── */}
                {activeSection === 'security' && (
                  <div className="themed-card rounded-2xl p-4 sm:p-6 space-y-5">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Security Settings
                      </h2>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        Update your password to keep your account secure.
                      </p>
                    </div>

                    {[
                      { label: 'Current Password',     placeholder: '••••••••' },
                      { label: 'New Password',         placeholder: 'Min. 8 characters' },
                      { label: 'Confirm New Password', placeholder: 'Repeat new password' },
                    ].map(({ label, placeholder }) => (
                      <div key={label}>
                        <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                          {label}
                        </label>
                        <input
                          type="password"
                          placeholder={placeholder}
                          className="themed-input w-full px-4 py-2.5 rounded-xl text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
                        />
                      </div>
                    ))}

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
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  )
}
