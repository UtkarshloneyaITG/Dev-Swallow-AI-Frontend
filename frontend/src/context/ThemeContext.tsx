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
    '--accent':        '0 0 0',
    '--accent-fg':     '255 255 255',
    '--page-bg':       '#f8fafc',
    '--sidebar-bg':    'rgba(255,255,255,0.75)',
    '--card-bg':       'rgba(255,255,255,0.6)',
    '--card-border':   'rgba(0,0,0,0.05)',
    '--header-bg':     'rgba(255,255,255,0.4)',
    '--input-bg':      'rgba(255,255,255,0.6)',
    '--input-border':  'rgba(0,0,0,0.1)',
  },
  dark: {
    '--accent':        '255 255 255',
    '--accent-fg':     '0 0 0',
    '--page-bg':       '#020617',
    '--sidebar-bg':    'rgba(15,23,42,0.85)',
    '--card-bg':       'rgba(30,41,59,0.6)',
    '--card-border':   'rgba(255,255,255,0.05)',
    '--header-bg':     'rgba(2,6,23,0.4)',
    '--input-bg':      'rgba(30,41,59,0.6)',
    '--input-border':  'rgba(255,255,255,0.1)',
  },
  midnight: {
    '--accent':        '99 102 241',
    '--accent-fg':     '255 255 255',
    '--page-bg':       '#07101e',
    '--sidebar-bg':    'rgba(8,16,42,0.9)',
    '--card-bg':       'rgba(12,20,60,0.65)',
    '--card-border':   'rgba(99,102,241,0.18)',
    '--header-bg':     'rgba(7,16,30,0.5)',
    '--input-bg':      'rgba(12,20,60,0.5)',
    '--input-border':  'rgba(99,102,241,0.2)',
  },
  aurora: {
    '--accent':        '168 85 247',
    '--accent-fg':     '255 255 255',
    '--page-bg':       '#0d0618',
    '--sidebar-bg':    'rgba(18,6,36,0.9)',
    '--card-bg':       'rgba(35,10,65,0.7)',
    '--card-border':   'rgba(168,85,247,0.18)',
    '--header-bg':     'rgba(13,6,24,0.5)',
    '--input-bg':      'rgba(35,10,65,0.5)',
    '--input-border':  'rgba(168,85,247,0.2)',
  },
  forest: {
    '--accent':        '34 197 94',
    '--accent-fg':     '255 255 255',
    '--page-bg':       '#051208',
    '--sidebar-bg':    'rgba(5,18,10,0.9)',
    '--card-bg':       'rgba(5,22,12,0.7)',
    '--card-border':   'rgba(34,197,94,0.15)',
    '--header-bg':     'rgba(5,18,8,0.5)',
    '--input-bg':      'rgba(5,22,12,0.5)',
    '--input-border':  'rgba(34,197,94,0.18)',
  },
  sunset: {
    '--accent':        '249 115 22',
    '--accent-fg':     '255 255 255',
    '--page-bg':       '#150900',
    '--sidebar-bg':    'rgba(22,9,0,0.9)',
    '--card-bg':       'rgba(40,12,0,0.7)',
    '--card-border':   'rgba(249,115,22,0.18)',
    '--header-bg':     'rgba(21,9,0,0.5)',
    '--input-bg':      'rgba(40,12,0,0.5)',
    '--input-border':  'rgba(249,115,22,0.18)',
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
