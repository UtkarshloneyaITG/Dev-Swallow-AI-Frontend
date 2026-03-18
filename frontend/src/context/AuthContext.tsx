import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { authApi, getAccessToken, clearTokens } from '../services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: string
  email: string
  role: string
  /** Derived display name — email prefix until backend adds name field */
  name: string
  avatarInitials: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextValue | null>(null)

function toAuthUser(raw: { id: string; email: string; role: string }): AuthUser {
  const namePart = raw.email.split('@')[0]
  const display  = namePart
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const initials = display
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return {
    id:             raw.id,
    email:          raw.email,
    role:           raw.role,
    name:           display,
    avatarInitials: initials || raw.email[0].toUpperCase(),
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null)
  const [isLoading, setLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setLoading(false)
      return
    }
    // Try to load cached user first for instant UI
    const cached = authApi.getCachedUser()
    if (cached) setUser(toAuthUser(cached))

    // Then verify with server
    authApi.me()
      .then((u) => setUser(toAuthUser(u)))
      .catch(() => {
        // Token expired / invalid — clear everything
        clearTokens()
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const raw = await authApi.login(email, password)
    setUser(toAuthUser(raw))
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password)
    // Auto-login after register
    await login(email, password)
  }, [login])

  const logout = useCallback(() => {
    authApi.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
