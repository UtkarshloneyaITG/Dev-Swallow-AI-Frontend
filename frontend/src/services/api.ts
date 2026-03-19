import type { MigrationJob, MigrationStatus, InputFormat, FailedRow, StoredCrawlSession } from '../types'

// ---------------------------------------------------------------------------
// Base URL — set VITE_API_BASE_URL in .env
// ---------------------------------------------------------------------------
const API_BASE   = (import.meta.env.VITE_API_BASE_URL  as string) ?? ''
const CRAWL_BASE = (import.meta.env.VITE_CRAWL_API_URL as string) ?? API_BASE

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------
const ACCESS_KEY  = 'swallow_access_token'
const REFRESH_KEY = 'swallow_refresh_token'
const USER_KEY    = 'swallow_user'
const JOBS_PREFIX   = 'swallow_jobs_'
const CRAWLS_PREFIX = 'swallow_crawls_'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

// ---------------------------------------------------------------------------
// Job ID cache (workaround — backend has no GET /jobs list endpoint)
// ---------------------------------------------------------------------------
function jobsKey(userId: string): string {
  return `${JOBS_PREFIX}${userId}`
}

export function storeJobId(userId: string, jobId: string): void {
  const key  = jobsKey(userId)
  const ids: string[] = JSON.parse(localStorage.getItem(key) ?? '[]')
  if (!ids.includes(jobId)) {
    localStorage.setItem(key, JSON.stringify([jobId, ...ids]))
  }
}

export function getStoredJobIds(userId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(jobsKey(userId)) ?? '[]')
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Crawl session cache — persists recent scraping sessions per user
// ---------------------------------------------------------------------------
export function storeCrawlSession(userId: string, session: StoredCrawlSession): void {
  const key = `${CRAWLS_PREFIX}${userId}`
  const sessions: StoredCrawlSession[] = JSON.parse(localStorage.getItem(key) ?? '[]')
  const idx = sessions.findIndex((s) => s.url === session.url)
  if (idx >= 0) sessions[idx] = session
  else sessions.unshift(session)
  localStorage.setItem(key, JSON.stringify(sessions.slice(0, 20)))
}

export function getStoredCrawlSessions(userId: string): StoredCrawlSession[] {
  try {
    return JSON.parse(localStorage.getItem(`${CRAWLS_PREFIX}${userId}`) ?? '[]')
  } catch {
    return []
  }
}

export function removeCrawlSession(userId: string, url: string): void {
  const key = `${CRAWLS_PREFIX}${userId}`
  const sessions: StoredCrawlSession[] = JSON.parse(localStorage.getItem(key) ?? '[]')
  localStorage.setItem(key, JSON.stringify(sessions.filter((s) => s.url !== url)))
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken) return null
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) { clearTokens(); return null }
    const data = await res.json() as { access_token: string; refresh_token: string }
    setTokens(data.access_token, data.refresh_token)
    return data.access_token
  } catch {
    clearTokens()
    return null
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper — attaches Bearer token, parses JSON, throws on error
// On 401: attempts one silent token refresh then retries; redirects on failure
// ---------------------------------------------------------------------------
async function request<T>(path: string, options: RequestInit = {}, _retry = true): Promise<T> {
  const token = getAccessToken()
  const isFormData = options.body instanceof FormData

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'ngrok-skip-browser-warning': 'true',
      ...options.headers,
    },
  })

  // Auto-refresh on 401 — try once, then redirect to login
  if (res.status === 401 && _retry) {
    const newToken = await refreshAccessToken()
    if (newToken) return request<T>(path, options, false)
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    // Pydantic validation errors return detail as an array of objects
    const detail = body.detail
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ')
      : (detail ?? `API error ${res.status}`)
    throw new Error(String(message))
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Data mapping: backend snake_case → frontend camelCase
// ---------------------------------------------------------------------------
function mapBackendJobStatus(s: string): MigrationStatus {
  // Backend job statuses: pending | processing | completed | stopped | failed
  // Treat "stopped" as "failed" for the frontend
  if (s === 'stopped') return 'failed'
  return s as MigrationStatus
}

function mapJob(raw: Record<string, unknown>): MigrationJob {
  // total_rows can be 0 right after creation — fall back to raw_records count
  const rawRecords  = Array.isArray(raw.raw_records) ? (raw.raw_records as unknown[]) : []
  const storedTotal = (raw.total_rows as number) ?? 0
  const totalRows   = Math.max(storedTotal > 0 ? storedTotal : rawRecords.length, 0)
  const safeTotal   = Math.max(totalRows, 1) // avoid division by zero

  // Clamp all counters so nothing exceeds totalRows
  const correctRows   = Math.min(Math.max((raw.correct_rows   as number) ?? 0, 0), totalRows)
  const failedRows    = Math.min(Math.max((raw.failed_rows    as number) ?? 0, 0), totalRows - correctRows)
  const retryRows     = Math.max((raw.retry_rows     as number) ?? 0, 0)
  const processedRows = Math.min(Math.max((raw.processed_rows as number) ?? 0, 0), totalRows)

  // progress_pct comes from /status endpoint; derive from counts when absent — clamp to 100
  const rawProgress = raw.progress_pct != null
    ? Math.round(raw.progress_pct as number)
    : Math.round((processedRows / safeTotal) * 100)
  const progress = Math.min(rawProgress, 100)

  // processingRows = rows currently in-flight (processed but not yet finalized)
  const processingRows = Math.min(
    Math.max(0, processedRows - correctRows - failedRows) + retryRows,
    totalRows - correctRows - failedRows
  )

  return {
    id:            (raw._id ?? raw.id) as string,
    name:          (raw.job_name ?? raw.name ?? 'Untitled') as string,
    type:          (raw.job_type ?? raw.type ?? 'product') as MigrationJob['type'],
    status:        mapBackendJobStatus((raw.status as string) ?? 'pending'),
    inputFormat:   ((raw.input_type ?? raw.input_format ?? 'json') as InputFormat),
    totalRows,
    processedRows,
    correctRows,
    failedRows,
    processingRows,
    progress,
    createdAt:     (raw.created_at ?? new Date().toISOString()) as string,
    updatedAt:     (raw.updated_at ?? new Date().toISOString()) as string,
    completedAt:   raw.completed_at as string | undefined,
  }
}

// rowIndex = sequential position from API response (1-based), passed by caller
function mapRow(raw: Record<string, unknown>, rowIndex = 0): FailedRow {
  const status = raw.status as string

  // Use the most complete/cleaned source available.
  // final_result is the fully AI-processed Shopify product; fall back down the chain.
  // Do NOT merge with original_data — it uses different raw field names (PRODUCT_CODE etc.)
  const finalResult = raw.final_result as Record<string, unknown> | null | undefined
  const cleanedData = raw.cleaned_data as Record<string, unknown> | null | undefined
  const originalData = raw.original_data as Record<string, unknown> | null | undefined

  const baseData: Record<string, unknown> =
    (finalResult  && Object.keys(finalResult).length  > 0) ? finalResult  :
    (cleanedData  && Object.keys(cleanedData).length  > 0) ? cleanedData  :
    (originalData ?? {})

  // If the chosen source has no images but original_data does, merge them in.
  // The AI sometimes drops images from final_result even when original_data has them.
  const hasImages = Array.isArray(baseData.images) && (baseData.images as unknown[]).length > 0
  const originalImages = Array.isArray(originalData?.images) ? originalData!.images : []
  const displayData: Record<string, unknown> =
    (!hasImages && originalImages.length > 0)
      ? { ...baseData, images: originalImages }
      : baseData

  let mappedStatus: FailedRow['status']
  if (status === 'correct')                                                   mappedStatus = 'resolved'
  else if (status === 'extracted' || status === 'retry'
        || status === 'pending'   || status === 'processing')                 mappedStatus = 'retrying'
  else                                                                        mappedStatus = 'failed'

  // Map validation_errors array from DB → typed ValidationError[]
  const rawValidationErrors = Array.isArray(raw.validation_errors)
    ? (raw.validation_errors as Record<string, unknown>[])
    : []
  const validationErrors: FailedRow['validationErrors'] = rawValidationErrors.map((ve) => ({
    field:    String(ve.field    ?? ''),
    loc:      String(ve.loc      ?? ve.field ?? ''),
    severity: (ve.severity === 'warning' ? 'warning' : 'error') as 'error' | 'warning',
    msg:      String(ve.msg      ?? ''),
    got:      ve.got,
  }))

  return {
    id:               (raw._id ?? raw.id) as string,
    jobId:            raw.job_id as string,
    rowIndex,
    originalData:     displayData,
    errorMessage:     (raw.error_message ?? '') as string,
    confidenceScore:  (raw.confidence_score ?? 0) as number,
    attempts:         (raw.iteration ?? 1) as number,
    status:           mappedStatus,
    validationErrors,
  }
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------
interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

interface BackendUser {
  id: string
  email: string
  role: string
  status: string
  created_at?: string
}

export const authApi = {
  async login(email: string, password: string): Promise<BackendUser> {
    const data = await request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setTokens(data.access_token, data.refresh_token)
    const user = await authApi.me()
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return user
  },

  async register(email: string, password: string): Promise<BackendUser> {
    return request<BackendUser>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, role: 'user' }),
    })
  },

  async me(): Promise<BackendUser> {
    return request<BackendUser>('/api/v1/auth/me')
  },

  logout(): void {
    clearTokens()
  },

  getCachedUser(): BackendUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? (JSON.parse(raw) as BackendUser) : null
    } catch {
      return null
    }
  },
}

// ---------------------------------------------------------------------------
// Migration API
// ---------------------------------------------------------------------------
interface CreateJobResponse {
  job_id: string
  job_name: string
  total_rows: number
  message: string
  parse_warnings?: string[]
}

// Frontend InputFormat → backend input_type
function toBackendInputType(fmt: InputFormat): string {
  if (fmt === 'website_url') return 'url'
  if (fmt === 'google_sheet') return 'google_sheet'
  return fmt
}

export const migrationApi = {
  async start(payload: {
    job_name: string
    migration_type: string
    input_type: InputFormat
    data: unknown
  }, userId: string): Promise<CreateJobResponse> {
    const res = await request<CreateJobResponse>('/api/v1/migration/start', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        input_type: toBackendInputType(payload.input_type),
      }),
    })
    storeJobId(userId, res.job_id)
    return res
  },

  async startFile(formData: FormData, userId: string): Promise<CreateJobResponse> {
    const token = getAccessToken()
    const res = await fetch(`${API_BASE}/api/v1/migration/start-file`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(body.detail ?? 'Upload failed')
    }
    const data: CreateJobResponse = await res.json()
    storeJobId(userId, data.job_id)
    return data
  },

  async getJob(jobId: string): Promise<MigrationJob> {
    const raw = await request<Record<string, unknown>>(`/api/v1/migration/${jobId}`)
    return mapJob(raw)
  },

  async getStatus(jobId: string): Promise<MigrationJob> {
    const raw = await request<Record<string, unknown>>(`/api/v1/migration/${jobId}/status`)
    return mapJob(raw)
  },

  async listJobs(_userId: string): Promise<MigrationJob[]> {
    const raw = await request<Record<string, unknown>[]>('/api/v1/migration/?limit=200')
    return raw.map(mapJob)
  },

  async getRows(
    jobId: string,
    params?: { status?: string; skip?: number; limit?: number }
  ): Promise<FailedRow[]> {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.skip   != null) qs.set('skip',  String(params.skip))
    if (params?.limit  != null) qs.set('limit', String(params.limit))
    const rows = await request<Record<string, unknown>[]>(
      `/api/v1/migration/${jobId}/rows?${qs}`
    )
    return rows.map((row, idx) => mapRow(row, idx + 1))
  },

  async retry(jobId: string): Promise<void> {
    return request(`/api/v1/migration/${jobId}/retry`, { method: 'POST' })
  },

  async stop(jobId: string): Promise<void> {
    return request(`/api/v1/migration/${jobId}/stop`, { method: 'POST' })
  },

  async deleteJob(jobId: string): Promise<void> {
    return request(`/api/v1/migration/${jobId}`, { method: 'DELETE' })
  },

  async aiRetry(rowId: string): Promise<void> {
    return request(`/api/v1/migration/row/${rowId}/ai-retry`, { method: 'POST' })
  },

  async correct(rowId: string, correctedValue: Record<string, unknown>): Promise<void> {
    return request(`/api/v1/migration/row/${rowId}/correct`, {
      method: 'POST',
      body: JSON.stringify({ corrected_value: correctedValue }),
    })
  },
}

// ---------------------------------------------------------------------------
// Crawl API — mirrors sample_scraper.py backend contract
// Endpoints: POST /crawl/start  POST /crawl/stop  POST /crawl/resume
//            GET  /crawl/status  GET /crawl/session?url=...
// Uses VITE_CRAWL_API_URL as base (falls back to VITE_API_BASE_URL)
// ---------------------------------------------------------------------------
async function crawlRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken()
  const res = await fetch(`${CRAWL_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'ngrok-skip-browser-warning': 'true',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(String(body.detail ?? `Crawl API error ${res.status}`))
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}
export interface CrawlStatusResponse {
  status: 'idle' | 'crawling' | 'stopping' | 'paused' | 'completed' | 'error'
  pages_visited: number
  products_scraped?: number
  products_count?: number
  elapsed_seconds: number
  current_url?: string
  url?: string
  job_id?: string | null
  error?: string
}

export interface CrawlSessionResponse {
  has_session: boolean
  products_count: number
  saved_at: string
}

export const crawlApi = {
  async start(
    url: string,
    params: { max_pages?: number; max_depth?: number; max_products?: number }
  ): Promise<{ status: string; job_id?: string; message?: string }> {
    const qs = new URLSearchParams({
      url,
      max_pages:    String(params.max_pages    ?? 100),
      max_depth:    String(params.max_depth    ?? 5),
      max_products: String(params.max_products ?? 0),
    })
    return crawlRequest(`/crawl/start?${qs}`, { method: 'POST' })
  },

  async stop(): Promise<{ status: string }> {
    return crawlRequest('/crawl/stop', { method: 'POST' })
  },

  async resume(url: string): Promise<{ status: string; job_id?: string }> {
    const qs = new URLSearchParams({ url })
    return crawlRequest(`/crawl/resume?${qs}`, { method: 'POST' })
  },

  async getStatus(): Promise<CrawlStatusResponse> {
    return crawlRequest('/crawl/status')
  },

  async getSession(url: string): Promise<CrawlSessionResponse> {
    const qs = new URLSearchParams({ url })
    return crawlRequest(`/crawl/session?${qs}`)
  },
}

// ---------------------------------------------------------------------------
// Export API — streams NDJSON from backend → returns Blob for download
// ---------------------------------------------------------------------------
export const exportApi = {
  async download(jobId: string, type: 'correct' | 'failed' | 'all'): Promise<Blob> {
    const token = getAccessToken()
    const res = await fetch(`${API_BASE}/api/v1/migration/${jobId}/export/${type}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'ngrok-skip-browser-warning': 'true',
      },
    })
    if (!res.ok) throw new Error(`Export failed: ${res.statusText}`)
    return res.blob()
  },

  triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}
