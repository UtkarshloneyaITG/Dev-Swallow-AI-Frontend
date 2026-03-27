import type { MigrationJob, MigrationStatus, InputFormat, FailedRow, MergedJob } from '../types'

// ---------------------------------------------------------------------------
// Base URL — env vars, overridable at runtime via localStorage (dev/testing)
// Keys: swallow_api_override | swallow_crawl_override
// ---------------------------------------------------------------------------
export const API_OVERRIDE_KEY   = 'swallow_api_override'
export const CRAWL_OVERRIDE_KEY = 'swallow_crawl_override'

const API_BASE   = localStorage.getItem(API_OVERRIDE_KEY)   || (import.meta.env.VITE_API_BASE_URL  as string) || ''
const CRAWL_BASE = localStorage.getItem(CRAWL_OVERRIDE_KEY) || (import.meta.env.VITE_CRAWL_API_URL as string) || API_BASE

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------
const ACCESS_KEY  = 'swallow_access_token'
const REFRESH_KEY = 'swallow_refresh_token'
const USER_KEY    = 'swallow_user'

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

  // Clamp all counters so nothing exceeds totalRows (skip clamping when totalRows is still 0)
  const rawCorrect    = Math.max((raw.correct_rows   as number) ?? 0, 0)
  const rawFailed     = Math.max((raw.failed_rows    as number) ?? 0, 0)
  const retryRows     = Math.max((raw.retry_rows     as number) ?? 0, 0)
  const rawProcessed  = Math.max((raw.processed_rows as number) ?? 0, 0)
  const correctRows   = totalRows > 0 ? Math.min(rawCorrect, totalRows) : rawCorrect
  const failedRows    = totalRows > 0 ? Math.min(rawFailed,  totalRows - correctRows) : rawFailed
  const processedRows = totalRows > 0 ? Math.min(rawProcessed, totalRows) : rawProcessed

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
  // Fall back to the latest history entry's errors if validation_errors is empty
  const rawValidationErrors: Record<string, unknown>[] =
    Array.isArray(raw.validation_errors) && (raw.validation_errors as unknown[]).length > 0
      ? (raw.validation_errors as Record<string, unknown>[])
      : (() => {
          const history = raw.history as Array<Record<string, unknown>> | undefined
          if (!Array.isArray(history) || history.length === 0) return []
          const latest = history[history.length - 1]
          return Array.isArray(latest.errors) ? (latest.errors as Record<string, unknown>[]) : []
        })()

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
  }): Promise<CreateJobResponse> {
    return request<CreateJobResponse>('/api/v1/migration/start', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        input_type: toBackendInputType(payload.input_type),
      }),
    })
  },

  async startFile(formData: FormData): Promise<CreateJobResponse> {
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
    return res.json() as Promise<CreateJobResponse>
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
    const res = await request<unknown>('/api/v1/migration/?limit=200')
    const raw: Record<string, unknown>[] = Array.isArray(res)
      ? (res as Record<string, unknown>[])
      : Array.isArray((res as Record<string, unknown>)?.items)
        ? ((res as Record<string, unknown>).items as Record<string, unknown>[])
        : Array.isArray((res as Record<string, unknown>)?.jobs)
          ? ((res as Record<string, unknown>).jobs as Record<string, unknown>[])
          : []
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

  async batchRows(
    jobIds: string[],
    filter: 'all' | 'correct' | 'failed',
    skip = 0,
    limit = 500,
  ): Promise<FailedRow[]> {
    const suffix = filter === 'correct' ? '/correct' : filter === 'failed' ? '/failed' : ''
    const rows = await request<Record<string, unknown>[]>(
      `/api/v1/migration/batch${suffix}`,
      { method: 'POST', body: JSON.stringify({ job_ids: jobIds, skip, limit }) },
    )
    return rows.map((row, idx) => mapRow(row, skip + idx + 1))
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
// Crawl API — crawlsApi.md endpoint list
// POST /crawl                POST /crawl/extend
// POST /crawl/control/stop   POST /crawl/control/continue
// GET  /crawl/status         GET  /crawl/sessions
// GET  /download
// GET  /jobs/user/{id}       GET  /jobs/{id}
// POST /jobs/products        DELETE /jobs/products   DELETE /jobs/{id}
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

// ── Response shapes ──────────────────────────────────────────────────────────

export interface CrawlStatusResponse {
  /** idle | crawling | stopping | paused | completed | error */
  status:                'idle' | 'crawling' | 'stopping' | 'paused' | 'completed' | 'error'
  pages_visited:         number
  products_scraped?:     number
  products_count?:       number
  total_input_products?: number
  elapsed_seconds:       number
  current_url?:          string
  url?:                  string
  job_id?:               string | null
  error?:                string
}

/** One entry from `GET /crawl/sessions` */
export interface CrawlSessionEntry {
  url:            string
  status:         string
  products_count: number
  saved_at:       string
}

/** `GET /crawl/sessions` */
export interface CrawlSessionsResponse {
  total:    number
  sessions: CrawlSessionEntry[]
}

/** `POST /crawl/control/stop` */
export interface CrawlStopResponse {
  /** stopped | already_stopping | no_active_crawl */
  status:   string
  message?: string
  job_id?:  string
  url?:     string
}

/** `POST /crawl/control/continue` */
export interface CrawlContinueResponse {
  /** resuming | already_running | still_stopping | not_stopped | no_session_data */
  status:   string
  message?: string
  job_id?:  string
  url?:     string
}

/** `POST /crawl/extend` */
export interface CrawlExtendResponse {
  status:   string
  message?: string
  job_id?:  string
  stats?:   { pages_visited: number; products_scraped: number; elapsed_seconds: number }
  products?: unknown[]
}

// ── API object ───────────────────────────────────────────────────────────────

export const crawlApi = {
  /**
   * POST /crawl — start a crawl in the background and return immediately.
   * Response: { status: "started", message, job_id }
   * HTTP 409 if another crawl is already running.
   * Poll GET /crawl/status for live progress.
   */
  async start(
    url: string,
    params: { name?: string; user_id?: string; max_products?: number; max_pages?: number; max_depth?: number }
  ): Promise<{ status: string; job_id?: string; message?: string }> {
    const body: Record<string, unknown> = { url, user_id: params.user_id ?? 'default' }
    if (params.name)                        body.name         = params.name
    if (params.max_products != null)        body.max_products = params.max_products
    if (params.max_pages    != null)        body.max_pages    = params.max_pages
    if (params.max_depth    != null)        body.max_depth    = params.max_depth
    return crawlRequest('/crawl', {
      method: 'POST',
      body:   JSON.stringify(body),
    })
  },

  /**
   * POST /crawl/control/stop — stop the active crawl and save state for resume.
   * Status: stopped | already_stopping | no_active_crawl
   */
  async stop(jobId: string): Promise<CrawlStopResponse> {
    return crawlRequest('/crawl/control/stop', {
      method: 'POST',
      body:   JSON.stringify({ job_id: jobId }),
    })
  },

  /**
   * POST /crawl/control/continue — resume a paused crawl.
   * Status: resuming | already_running | still_stopping | not_stopped | no_session_data
   */
  async resume(jobId: string): Promise<CrawlContinueResponse> {
    return crawlRequest('/crawl/control/continue', {
      method: 'POST',
      body:   JSON.stringify({ job_id: jobId }),
    })
  },

  /**
   * POST /crawl/extend — extend a completed crawl in the background.
   * Response: { status: "started", message, job_id }
   * HTTP 409 if another crawl is already running.
   * Poll GET /crawl/status for live progress.
   */
  async extend(jobId: string, maxProducts: number): Promise<CrawlExtendResponse> {
    return crawlRequest('/crawl/extend', {
      method: 'POST',
      body:   JSON.stringify({ job_id: jobId, max_products: maxProducts }),
    })
  },

  /** GET /crawl/status — live status of the current crawl. */
  async getStatus(): Promise<CrawlStatusResponse> {
    return crawlRequest('/crawl/status')
  },

  /** GET /crawl/sessions — list all saved crawl sessions. */
  async getSessions(): Promise<CrawlSessionsResponse> {
    return crawlRequest('/crawl/sessions')
  },

  /**
   * Build a download URL: GET /download?name=&job_id=&type=
   * At least one of (job_id, name) must be provided — backend returns 422 otherwise.
   */
  getDownloadUrl(params: { job_id?: string; name?: string; type: 'csv' | 'json' | 'jsonl' }): string {
    const qs = new URLSearchParams()
    if (params.job_id) qs.set('job_id', params.job_id)
    if (params.name)   qs.set('name',   params.name)
    qs.set('type', params.type)
    return `${CRAWL_BASE}/download?${qs}`
  },

  // ── Jobs ──────────────────────────────────────────────────────────────────

  /**
   * GET /jobs/user/{user_id} — list all crawl jobs for a user, newest first.
   * Returns { user_id, jobs: [{ job_id, url, name, status, elapsed_seconds, stats, ... }] }
   */
  async listUserJobs(userId: string): Promise<{ user_id: string; jobs: Record<string, unknown>[] }> {
    return crawlRequest(`/jobs/user/${encodeURIComponent(userId)}`)
  },

  /**
   * GET /jobs/{job_id} — get live status of a specific crawl job (in-memory).
   * When status=completed, response includes all scraped products.
   */
  async getJob(jobId: string): Promise<Record<string, unknown>> {
    return crawlRequest(`/jobs/${encodeURIComponent(jobId)}`)
  },

  /**
   * POST /jobs/products — fetch scraped products for a job with pagination.
   * Body: { job_id (required), page? (1-based), page_size? (max 500, default 50) }
   */
  async getJobProducts(params: { job_id: string; page?: number; page_size?: number }): Promise<{
    job_id: string; name: string; source_url: string; status: string
    total_products: number; page: number; page_size: number; total_pages: number
    products: unknown[]
  }> {
    return crawlRequest('/jobs/products', {
      method: 'POST',
      body:   JSON.stringify(params),
    })
  },

  /**
   * DELETE /jobs/{job_id} — permanently delete a job and ALL its products.
   * If the job is running it will be cancelled first.
   */
  async deleteCrawlJob(jobId: string): Promise<{ job_id: string; jobs_deleted: number; products_deleted: number; message: string }> {
    return crawlRequest(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
  },

  /**
   * DELETE /jobs/products — delete selected product rows from a job by index.
   * Body: { job_id (required), indexes (required) — list of idx values }
   */
  async deleteJobProducts(jobId: string, indexes: number[]): Promise<{ job_id: string; deleted: number; message: string }> {
    return crawlRequest('/jobs/products', {
      method: 'DELETE',
      body:   JSON.stringify({ job_id: jobId, indexes }),
    })
  },
}

// ---------------------------------------------------------------------------
// Merged jobs API
// ---------------------------------------------------------------------------
function mapMergedJob(raw: Record<string, unknown>): MergedJob {
  return {
    id:           String((raw._id ?? raw.id) ?? ''),
    name:         String(raw.job_name ?? raw.name ?? 'Untitled Merge'),
    sourceJobIds: Array.isArray(raw.source_job_ids) ? (raw.source_job_ids as string[]) : [],
    totalRows:    (raw.total_rows   as number) ?? 0,
    correctRows:  (raw.correct_rows as number) ?? 0,
    failedRows:   (raw.failed_rows  as number) ?? 0,
    createdAt:    String(raw.created_at ?? new Date().toISOString()),
    updatedAt:    String(raw.updated_at ?? raw.created_at ?? new Date().toISOString()),
  }
}

export const mergedApi = {
  /** POST /migration/merged/save — persist a new merged job */
  async save(jobIds: string[], name?: string): Promise<MergedJob> {
    const raw = await request<Record<string, unknown>>('/api/v1/migration/merged/save', {
      method: 'POST',
      body: JSON.stringify({ job_ids: jobIds, ...(name ? { name } : {}) }),
    })
    return mapMergedJob(raw)
  },

  /** GET /migration/merged/ — list all saved merged jobs */
  async list(): Promise<MergedJob[]> {
    const raw = await request<Record<string, unknown>[]>('/api/v1/migration/merged/')
    return raw.map(mapMergedJob)
  },

  /** GET /migration/merged/{id} — summary of one merged job */
  async get(id: string): Promise<MergedJob> {
    const raw = await request<Record<string, unknown>>(`/api/v1/migration/merged/${id}`)
    return mapMergedJob(raw)
  },

  /** GET /migration/merged/{id}/rows — paginated merged rows */
  async getRows(id: string, params?: { skip?: number; limit?: number }): Promise<FailedRow[]> {
    const qs = new URLSearchParams()
    if (params?.skip  != null) qs.set('skip',  String(params.skip))
    if (params?.limit != null) qs.set('limit', String(params.limit))
    const rows = await request<Record<string, unknown>[]>(
      `/api/v1/migration/merged/${id}/rows?${qs}`,
    )
    return rows.map((row, idx) => mapRow(row, (params?.skip ?? 0) + idx + 1))
  },

  /** PATCH /migration/merged/{id}/row/{row_id} — edit a merged row */
  async updateRow(mergedId: string, rowId: string, data: Record<string, unknown>): Promise<void> {
    return request(`/api/v1/migration/merged/${mergedId}/row/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ corrected_value: data }),
    })
  },

  /** DELETE /migration/merged/{id}/row/{row_id} — remove one row */
  async deleteRow(mergedId: string, rowId: string): Promise<void> {
    return request(`/api/v1/migration/merged/${mergedId}/row/${rowId}`, { method: 'DELETE' })
  },

  /** DELETE /migration/merged/{id} — delete merged job + all its rows */
  async deleteJob(id: string): Promise<void> {
    return request(`/api/v1/migration/merged/${id}`, { method: 'DELETE' })
  },

  /** POST /migration/merged/{id}/sync/{source_job_id} — re-sync one source job */
  async syncSourceJob(mergedId: string, sourceJobId: string): Promise<void> {
    return request(`/api/v1/migration/merged/${mergedId}/sync/${sourceJobId}`, { method: 'POST' })
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
