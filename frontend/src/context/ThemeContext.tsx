import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ColorTheme = 'light' | 'dark' | 'midnight' | 'aurora' | 'forest' | 'sunset'

interface ThemeContextType {
  theme: ColorTheme
  isDark: boolean
  setTheme: (theme: ColorTheme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  setTheme: () => {},
  toggle: () => {},
})

const DARK_THEMES: ColorTheme[] = ['dark', 'midnight', 'aurora', 'forest', 'sunset']

// CSS variables applied per theme to <html>
const THEME_VARS: Record<ColorTheme, Record<string, string>> = {
  light: {
    '--accent':              '0 0 0',
    '--accent-fg':           '255 255 255',
    '--page-bg':             '#f5f4f2',        // warm off-white — pairs with blob background
    '--sidebar-bg':          'rgba(255,253,250,0.92)',  // warm white sidebar
    '--card-bg':             'rgba(255,255,255,0.80)',  // clean white cards
    '--card-border':         'rgba(0,0,0,0.06)',
    '--header-bg':           'rgba(255,253,250,0.75)',
    '--input-bg':            'rgba(255,255,255,0.90)',
    '--input-border':        'rgba(0,0,0,0.10)',
    '--metric-card-base':    '255 255 255',
    '--border-start':        'rgba(255,255,255,0.95)',  // top-left bright white highlight
    '--border-end':          'rgba(0,0,0,0.07)',        // bottom-right soft shadow edge
  },
  dark: {
    '--accent':              '255 255 255',
    '--accent-fg':           '0 0 0',
    '--page-bg':             '#080808',        // deep neutral black
    '--sidebar-bg':          'rgba(14,14,15,0.97)',
    '--card-bg':             'rgba(20,20,22,0.92)',
    '--card-border':         'rgba(255,255,255,0.07)',
    '--header-bg':           'rgba(8,8,8,0.7)',
    '--input-bg':            'rgba(20,20,22,0.85)',
    '--input-border':        'rgba(255,255,255,0.10)',
    '--metric-card-base':    '20 20 22',
    '--border-start':        'rgba(255,255,255,0.13)',  // top-left lighter edge
    '--border-end':          'rgba(255,255,255,0.04)',  // bottom-right dimmer edge
  },
  midnight: {
    '--accent':              '99 102 241',
    '--accent-fg':           '255 255 255',
    '--page-bg':             '#1b1b1b',
    '--sidebar-bg':          'rgba(32,32,32,0.9)',
    '--card-bg':             'rgba(20,20,20,0.65)',
    '--card-border':         'rgba(99,102,241,0.18)',
    '--header-bg':           'rgba(31,31,31,0.5)',
    '--input-bg':            'rgba(35,35,35,0.5)',
    '--input-border':        'rgba(99,102,241,0.2)',
    '--metric-card-base':    '12 20 60',
    '--border-start':        'rgba(99,102,241,0.35)',
    '--border-end':          'rgba(99,102,241,0.08)',
  },
  aurora: {
    '--accent':              '168 85 247',
    '--accent-fg':           '255 255 255',
    '--page-bg':             '#0d0618',
    '--sidebar-bg':          'rgba(18,6,36,0.9)',
    '--card-bg':             'rgba(35,10,65,0.7)',
    '--card-border':         'rgba(168,85,247,0.18)',
    '--header-bg':           'rgba(13,6,24,0.5)',
    '--input-bg':            'rgba(35,10,65,0.5)',
    '--input-border':        'rgba(168,85,247,0.2)',
    '--metric-card-base':    '35 10 65',
    '--border-start':        'rgba(168,85,247,0.38)',
    '--border-end':          'rgba(168,85,247,0.08)',
  },
  forest: {
    '--accent':              '34 197 94',
    '--accent-fg':           '255 255 255',
    '--page-bg':             '#051208',
    '--sidebar-bg':          'rgba(5,18,10,0.9)',
    '--card-bg':             'rgba(5,22,12,0.7)',
    '--card-border':         'rgba(34,197,94,0.15)',
    '--header-bg':           'rgba(5,18,8,0.5)',
    '--input-bg':            'rgba(5,22,12,0.5)',
    '--input-border':        'rgba(34,197,94,0.18)',
    '--metric-card-base':    '5 22 12',
    '--border-start':        'rgba(34,197,94,0.30)',
    '--border-end':          'rgba(34,197,94,0.06)',
  },
  sunset: {
    '--accent':              '249 115 22',
    '--accent-fg':           '255 255 255',
    '--page-bg':             '#150900',
    '--sidebar-bg':          'rgba(22,9,0,0.9)',
    '--card-bg':             'rgba(40,12,0,0.7)',
    '--card-border':         'rgba(249,115,22,0.18)',
    '--header-bg':           'rgba(21,9,0,0.5)',
    '--input-bg':            'rgba(40,12,0,0.5)',
    '--input-border':        'rgba(249,115,22,0.18)',
    '--metric-card-base':    '40 12 0',
    '--border-start':        'rgba(249,115,22,0.35)',
    '--border-end':          'rgba(249,115,22,0.07)',
  },
}

const ALL_THEME_CLASSES: string[] = DARK_THEMES.filter(t => t !== 'dark').map(t => `theme-${t}`)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem('color-theme') as ColorTheme | null
    if (saved && (DARK_THEMES.includes(saved) || saved === 'light')) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const isDark = DARK_THEMES.includes(theme)

  useEffect(() => {
    const html = document.documentElement

    // 1. Manage dark class
    html.classList.toggle('dark', isDark)

    // 2. Remove all theme-specific classes, add current one
    ALL_THEME_CLASSES.forEach(c => html.classList.remove(c))
    if (theme !== 'light' && theme !== 'dark') {
      html.classList.add(`theme-${theme}`)
    }

    // 3. Apply CSS variables
    const vars = THEME_VARS[theme]
    Object.entries(vars).forEach(([k, v]) => html.style.setProperty(k, v))

    localStorage.setItem('color-theme', theme)
  }, [theme, isDark])

  function setTheme(t: ColorTheme) { setThemeState(t) }
  function toggle() { setThemeState(p => p === 'light' ? 'dark' : 'light') }

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
