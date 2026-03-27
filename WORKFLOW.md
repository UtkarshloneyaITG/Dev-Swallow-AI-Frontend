# Swallow — Frontend Workflow Documentation

> AI-powered Shopify data migration & web scraping platform.
> Stack: React 18 · TypeScript · Vite · React Router v6 · Framer Motion · Tailwind CSS · GSAP

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Score & Assessment](#2-project-score--assessment)
3. [Architecture Overview](#3-architecture-overview)
4. [Routing & Auth Guard](#4-routing--auth-guard)
5. [Authentication Flow](#5-authentication-flow)
6. [API Service Layer](#6-api-service-layer)
7. [Core Data Types](#7-core-data-types)
8. [Page-by-Page Workflows](#8-page-by-page-workflows)
9. [Component Reference](#9-component-reference)
10. [Data Flow: DB → UI](#10-data-flow-db--ui)
11. [State Management](#11-state-management)
12. [Theme & Styling System](#12-theme--styling-system)
13. [Dashboard Customisation System](#13-dashboard-customisation-system)
14. [Local Storage Keys](#14-local-storage-keys)
15. [Environment Variables](#15-environment-variables)
16. [Key Feature Workflows](#16-key-feature-workflows)
17. [Error Handling Strategy](#17-error-handling-strategy)
18. [Performance Optimisations](#18-performance-optimisations)
19. [Recent Changes Log](#19-recent-changes-log)

---

## 1. Project Overview

**Swallow** migrates product/customer/order data from any source format into Shopify-ready CSVs. The AI backend validates, enriches, and corrects each row. The frontend lets users:

- Submit data (paste, file upload, Google Sheet, web scrape)
- Track migration jobs in real time
- Review and fix failed rows (AI retry or manual edit)
- Export results as NDJSON or Shopify CSV
- View results in an editable spreadsheet, product card grid, or CSV preview
- Scrape product data from any website using the built-in web crawler
- View, manage, and download crawl job results
- Batch-merge multiple migration jobs into one export

---

## 2. Project Score & Assessment

### Overall Score: **81 / 100**

| Category | Score | Notes |
|----------|-------|-------|
| **Architecture** | 17/20 | Clean separation of concerns (API layer, types, contexts, pages, components). Single `api.ts` is the source of truth. Could benefit from feature-based folder grouping at scale. |
| **UI/UX Quality** | 18/20 | Premium feel — Framer Motion animations, GSAP page transitions, 6 colour themes, responsive layout, dark mode. Dashboard redesign matches modern analytics dashboards. Minor: some pages lack skeleton loaders. |
| **Type Safety** | 15/20 | Comprehensive interfaces in `types/index.ts`. API responses cast with `as unknown as T` in some places (crawl jobs). Several `Record<string, unknown>` usages where stricter types are possible. |
| **Feature Completeness** | 17/20 | Full migration lifecycle, real-time progress, failed-row correction (AI + manual), batch/merge export, web crawling with live view, Shopify CSV export. Missing: notifications backend, password change endpoint. |
| **Error Handling** | 13/20 | 401 refresh with retry, optimistic delete with rollback, Pydantic error parsing. Gaps: no global error boundary, network errors only logged to console (no user toast), some API failures are silently caught. |
| **Performance** | 14/20 | `useMemo` in grids, selective AG Grid repaint, debounced search, localStorage auth restore. Gaps: no virtualisation for long lists in Jobs/Dashboard, no React.memo on heavy components. |
| **Code Consistency** | 13/20 | Consistent naming, Tailwind utility classes, CSS variable theming. Some duplication: `mapCrawlJobs` helper duplicated between Dashboard and Jobs. Settings panel could use a shared `DashSetting` sub-component. |

---

### Strengths
- **Single API file** — all network logic in `api.ts` with consistent error handling and token refresh
- **Runtime URL overrides** — switch backend without rebuilding (great for ngrok/dev)
- **Dashboard is data-rich** — greeting, hero metrics, interactive SVG donut chart, health bars, recent activity table
- **Crawl lifecycle complete** — start → live progress → view detail → download → extend → use for migration
- **Theming is exceptional** — 6 themes, CSS variables, Tailwind black override, all consistent

### Areas to Improve
- Add a global `<ErrorBoundary>` component wrapping authenticated routes
- Replace `console.error` fallbacks with a toast/notification system
- Extract the crawl field-mapping logic into a shared `mapCrawlJob()` util (currently duplicated in Dashboard + Jobs)
- Add React.Suspense + lazy imports for heavy pages (ResultsGrid, MergedJobView)
- Add proper TypeScript types for crawl job API responses instead of `Record<string, unknown>`

---

## 3. Architecture Overview

```
src/
├── App.tsx                    # Route definitions + RequireAuth guard
├── main.tsx                   # React root — Router, ThemeProvider, AuthProvider
├── index.css                  # Global styles, CSS variables, Tailwind directives
├── types/index.ts             # All shared TypeScript interfaces
│
├── context/
│   ├── AuthContext.tsx        # JWT auth state + login/register/logout
│   └── ThemeContext.tsx       # Dark mode + 6 colour themes via CSS variables
│
├── services/
│   └── api.ts                 # ALL API calls — auth, migration, crawl, export
│                              # Runtime URL override keys exported here
│
├── hooks/
│   └── usePageAnimation.ts   # GSAP page entrance animation
│
├── pages/
│   ├── Login.tsx              # Email/password auth
│   ├── Register.tsx           # Account creation with auto-login
│   ├── Dashboard.tsx          # Overview: greeting, metrics, charts, activity table
│   ├── NewMigration.tsx       # 2-step wizard: crawler → job details (1046 lines)
│   ├── Jobs.tsx               # All jobs list — migrations + crawls with tabs
│   ├── JobProgress.tsx        # Real-time progress (Socket.IO + polling fallback)
│   ├── FailedRows.tsx         # Review/fix failed rows (AI retry + manual edit)
│   ├── Export.tsx             # Download NDJSON results
│   ├── ResultsGrid.tsx        # AG Grid spreadsheet + Shopify views
│   ├── BatchExport.tsx        # Merge multiple jobs + combined export
│   ├── MergedJobView.tsx      # Editable grid for merged job data
│   ├── CrawlDetail.tsx        # Crawl session details, products, downloads, actions
│   └── Settings.tsx           # Profile, appearance, dashboard customisation, developer
│
├── components/
│   ├── layout/
│   │   ├── DashboardLayout.tsx  # Sidebar + outlet + BlobBackground
│   │   └── Sidebar.tsx          # Nav links, user info, logout
│   ├── ui/
│   │   ├── Button.tsx           # Variants: primary/secondary/ghost/danger/amber
│   │   ├── Badge.tsx            # Status/type/confidence badges
│   │   ├── Logo.tsx             # Brand SVG logo
│   │   ├── Modal.tsx            # Dialog (sm/md/lg/xl)
│   │   ├── Spinner.tsx          # Inline + PageLoader (full screen)
│   │   ├── ProgressBar.tsx      # Animated bar (slate/emerald/rose/amber)
│   │   ├── ExcelGrid.tsx        # AG Grid wrapper with validation highlights
│   │   ├── BlobBackground.tsx   # Decorative gradient orbs (light mode)
│   │   └── WalkingPets.tsx      # Animated SVG pets (processing state)
│   ├── migration/
│   │   ├── JobCard.tsx          # Migration job summary card
│   │   ├── CrawlCard.tsx        # Crawl session summary card
│   │   ├── StatCard.tsx         # Single stat number with icon
│   │   ├── ShopifyGridView.tsx  # Product card grid (1 card/product)
│   │   └── ShopifyCsvView.tsx   # Shopify CSV column layout
│   └── rows/
│       ├── FailedRowCard.tsx    # Error display per failed row
│       └── ManualEditModal.tsx  # Modal to manually correct row data
│
└── data/
    └── mockData.ts             # Mock data for development/testing
```

---

## 4. Routing & Auth Guard

```
/                              → redirect to /login
/login                         → Login (public)
/register                      → Register (public)

Protected (DashboardLayout wrapper with sidebar):
/dashboard                     → Main dashboard overview
/new-migration                 → 2-step migration wizard
/jobs                          → All jobs — migrations + crawls
/jobs/:jobId                   → Real-time job progress
/jobs/:jobId/failed            → Failed rows review & correction
/jobs/:jobId/export            → Download NDJSON results
/jobs/:jobId/results           → AG Grid results spreadsheet
/batch-export                  → Multi-job merge & export
/merged/:mergedId              → Merged job editable view
/crawls/:jobId                 → Crawl session detail page
/settings                      → User preferences + developer tools

*                              → redirect to /dashboard (404 fallback)
```

### RequireAuth Guard

```tsx
function RequireAuth({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />
  if (!user)    return <Navigate to="/login" replace />
  return <>{children}</>
}
```

---

## 5. Authentication Flow

### Login
```
User fills email + password
  → authApi.login(email, password)
  → POST /api/v1/auth/login
  → Response: { access_token, refresh_token }
  → Store tokens in localStorage
  → GET /api/v1/auth/me → build AuthUser object
  → Store user in localStorage (instant restore next visit)
  → Navigate to /dashboard
```

### Session Restore (on app mount)
```
App mounts → AuthContext useEffect
  → Check localStorage for swallow_access_token
  → If found: restore cached user instantly (no loading flash)
  → GET /api/v1/auth/me to validate token
  → If 401: silent refresh attempt
  → If still fails: clear tokens → redirect /login
```

### Token Refresh (auto, transparent to user)
```
Any API call returns 401
  → request() calls refreshAccessToken()
  → POST /api/v1/auth/refresh with refresh_token
  → Success: update access_token + refresh_token → retry original request
  → Failure: clearTokens() → window.location = '/login'
```

### Register
```
Name + email + password (≥8 chars)
  → authApi.register()
  → POST /api/v1/auth/register
  → Auto-calls login() → navigate /dashboard
```

### Logout
```
Click "Sign out" in sidebar
  → authApi.logout() → clearTokens()
  → user = null in context
  → Navigate /login
```

---

## 6. API Service Layer

**File:** `src/services/api.ts` (~720 lines)

**Base URL resolution (priority order):**
1. `localStorage.getItem('swallow_api_override')` — runtime dev override
2. `import.meta.env.VITE_API_BASE_URL` — env var
3. `''` — same-origin fallback

**Crawl base URL:**
1. `localStorage.getItem('swallow_crawl_override')` — runtime dev override
2. `import.meta.env.VITE_CRAWL_API_URL` — env var
3. Falls back to migration API base

All requests go through `request<T>(path, options)` which:
- Attaches `Authorization: Bearer <token>` header
- Adds `ngrok-skip-browser-warning: true` header
- On 401: silently refreshes token once and retries
- Parses FastAPI/Pydantic `detail` errors (array of objects or string)

---

### Auth API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `authApi.login(email, password)` | `POST /api/v1/auth/login` | Returns tokens |
| `authApi.register(email, password)` | `POST /api/v1/auth/register` | Creates account |
| `authApi.me()` | `GET /api/v1/auth/me` | Validates token, returns user |
| `authApi.logout()` | — | Clears localStorage |

---

### Migration API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `migrationApi.start(payload)` | `POST /api/v1/migration/start` | Start from JSON/CSV/XML/text/URL |
| `migrationApi.startFile(formData)` | `POST /api/v1/migration/start-file` | File upload (FormData) |
| `migrationApi.getJob(jobId)` | `GET /api/v1/migration/{jobId}` | Full job details |
| `migrationApi.getStatus(jobId)` | `GET /api/v1/migration/{jobId}/status` | Lightweight status poll |
| `migrationApi.listJobs(userId)` | `GET /api/v1/migration/?limit=200` | All user jobs |
| `migrationApi.getRows(jobId, params)` | `GET /api/v1/migration/{jobId}/rows` | Paginated rows |
| `migrationApi.retry(jobId)` | `POST /api/v1/migration/{jobId}/retry` | Retry entire job |
| `migrationApi.stop(jobId)` | `POST /api/v1/migration/{jobId}/stop` | Stop processing |
| `migrationApi.deleteJob(jobId)` | `DELETE /api/v1/migration/{jobId}` | Delete job |
| `migrationApi.aiRetry(rowId)` | `POST /api/v1/migration/row/{rowId}/ai-retry` | AI retry single row |
| `migrationApi.correct(rowId, data)` | `POST /api/v1/migration/row/{rowId}/correct` | Manual row fix |
| `migrationApi.batchRows(suffix, jobIds)` | `POST /api/v1/migration/batch{suffix}` | Batch fetch rows |

---

### Merged Jobs API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `mergedApi.save(name, jobIds)` | `POST /api/v1/migration/merged/save` | Create merged job |
| `mergedApi.list()` | `GET /api/v1/migration/merged/` | List merged jobs |
| `mergedApi.get(id)` | `GET /api/v1/migration/merged/{id}` | Merged job details |
| `mergedApi.getRows(id, params)` | `GET /api/v1/migration/merged/{id}/rows` | Paginated merged rows |
| `mergedApi.editRow(id, rowId, data)` | `PATCH /api/v1/migration/merged/{id}/row/{rowId}` | Edit row |
| `mergedApi.deleteRow(id, rowId)` | `DELETE /api/v1/migration/merged/{id}/row/{rowId}` | Delete row |
| `mergedApi.delete(id)` | `DELETE /api/v1/migration/merged/{id}` | Delete merged job |
| `mergedApi.sync(id, sourceJobId)` | `POST /api/v1/migration/merged/{id}/sync/{sourceJobId}` | Re-sync source |

---

### Crawl API (separate base URL)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `crawlApi.start(url, params)` | `POST /crawl` | `{ url, user_id, max_products, max_pages, max_depth }` | Start crawl (non-blocking, returns `{ status, job_id }` immediately) |
| `crawlApi.stop(jobId)` | `POST /crawl/control/stop` | `{ job_id }` | Stop active crawl |
| `crawlApi.resume(jobId)` | `POST /crawl/control/continue` | `{ job_id }` | Resume paused crawl |
| `crawlApi.extend(jobId, maxProducts)` | `POST /crawl/extend` | `{ job_id, max_products }` | Extend completed crawl (non-blocking) |
| `crawlApi.getStatus()` | `GET /crawl/status` | — | Live global crawl status |
| `crawlApi.getSessions()` | `GET /crawl/sessions` | — | Saved session list |
| `crawlApi.getDownloadUrl(params)` | `GET /download?job_id=&type=` | — | Returns direct download URL |
| `crawlApi.listUserJobs(userId)` | `GET /jobs/user/{userId}` | — | All user's crawl jobs from DB |
| `crawlApi.getJob(jobId)` | `GET /jobs/{jobId}` | — | Single crawl job details |
| `crawlApi.getJobProducts(params)` | `POST /jobs/products` | `{ job_id, page, page_size }` | Paginated products |
| `crawlApi.deleteCrawlJob(jobId)` | `DELETE /jobs/{jobId}` | — | Delete crawl job |

**Important API contract notes:**
- `POST /crawl` is **non-blocking** — returns immediately with `{ status: "started", job_id }`. Poll `GET /crawl/status` for progress.
- `POST /crawl/extend` is also **non-blocking**.
- `HTTP 409` returned when another crawl is already running.
- `GET /crawl/status` is a **global** endpoint (one crawl runs at a time).
- Crawl job status field: backend returns `"running"` which frontend normalises to `"crawling"`.

---

### Export API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `exportApi.download(jobId, type)` | `GET /api/v1/migration/{jobId}/export/{type}` | Returns Blob |
| `exportApi.triggerDownload(blob, filename)` | — | Opens native browser download |
| `crawlApi.getDownloadUrl(params)` | `GET {CRAWL_BASE}/download?...` | Direct URL for CSV/JSON/JSONL |

---

### Data Mapping

**`mapJob(raw)`** — DB → `MigrationJob`
- snake_case → camelCase
- `"stopped"` → `"failed"` status
- All counters clamped to `[0, totalRows]`
- Progress from `progress_pct` or derived from `processedRows / totalRows`

**`mapRow(raw, index)`** — DB → `FailedRow`
- Best data source: `final_result` → `cleaned_data` → `original_data`
- Merges images from `original_data` if AI dropped them
- Validation errors: `validation_errors` or fallback to `history[last].errors`
- Status: `"correct"` → `"resolved"`, `"retry"` → `"retrying"`, else `"failed"`

**`mapCrawlJob(j)`** — Crawl DB row → `StoredCrawlSession`
- `source_url ?? url` → `url`
- `total_products ?? product_output ?? stats.products_scraped` → `productsScraped`
- `stats.pages_visited ?? pages_visited` → `pagesVisited`
- `"running"` → `"crawling"` status normalisation (backend/frontend mismatch)
- Unknown statuses default to `"completed"`

---

## 7. Core Data Types

```typescript
// Migration status
type MigrationStatus = 'pending' | 'processing' | 'completed' | 'failed'
type MigrationType   = 'product' | 'customer' | 'order'
type InputFormat     = 'json' | 'csv' | 'xml' | 'text' | 'raw_text' | 'ai_parser' | 'website_url' | 'google_sheet'

// Migration job (from mapJob)
interface MigrationJob {
  id, name, type, status, inputFormat
  totalRows, processedRows, correctRows, failedRows, processingRows
  progress: number    // 0–100
  createdAt, updatedAt, completedAt?
}

// Failed row (from mapRow)
interface FailedRow {
  id, jobId, rowIndex
  originalData: Record<string, unknown>   // best available data
  errorMessage: string
  confidenceScore: number   // 0–1
  attempts: number
  status: 'failed' | 'retrying' | 'resolved'
  validationErrors: ValidationError[]
}

// Field-level validation error
interface ValidationError {
  field: string       // "src"
  loc: string         // "images[0].src"
  severity: 'error' | 'warning'
  msg: string
  got?: unknown       // actual bad value
}

// AG Grid display row
interface GridRow {
  id, rowIndex
  status: 'correct' | 'failed'
  confidenceScore: number
  data: Record<string, string>         // flat key→value
  errorFields?: string[]
  cellWarnings?: Record<string, string>
  cellSeverity?: Record<string, 'error' | 'warning'>
}

// Merged job
interface MergedJob {
  id, name
  sourceJobIds: string[]
  totalRows, correctRows, failedRows
  createdAt, updatedAt
}

// Web crawl session (mapped from DB)
interface StoredCrawlSession {
  url: string
  startedAt: string
  status: 'idle' | 'crawling' | 'stopping' | 'paused' | 'completed' | 'error'
  pagesVisited: number
  productsScraped: number
  elapsedSeconds: number
  jobId?: string
}

// Auth user
interface AuthUser {
  id, email, role
  name: string           // derived from email if not in DB
  avatarInitials: string // first 2 letters
}

// Live crawl status (from GET /crawl/status)
interface CrawlStatusResponse {
  status: 'idle' | 'crawling' | 'stopping' | 'paused' | 'completed' | 'error'
  pages_visited: number
  products_scraped?: number
  products_count?: number
  total_input_products?: number
  elapsed_seconds: number
  current_url?: string
  url?: string
  job_id?: string | null
  error?: string
}
```

---

## 8. Page-by-Page Workflows

### `/login` — Login
```
Email + password → authApi.login()
  → Success: store tokens → navigate /dashboard
  → Failure: show error
```

### `/register` — Register
```
Name + email + password (≥8 chars) → authApi.register()
  → Auto login → navigate /dashboard
```

### `/dashboard` — Dashboard (redesigned)
```
On mount:
  → migrationApi.listJobs(userId) → jobs[]
  → crawlApi.listUserJobs(userId) → crawls[] (mapped from DB, not localStorage)

Layout:
  1. Greeting header — "Good morning/afternoon/evening, [Name]!"
  2. Hero metric strip (4 cards) — Products Scraped, Rows Migrated, Success Rate, Active Now
  3. Middle row (3 columns):
     - Job status chart (donut/ring/bars — user preference)
     - Migration health progress bars
     - Crawl summary stats
  4. Recent activity table — last 8 items (migrations + crawls), clickable rows

All sections individually togglable via Settings → Dashboard.
Card style, chart type, and colour palette all user-configurable.
```

### `/new-migration` — New Migration (2-step wizard)

#### Step 1: Website Crawler
```
On mount:
  → crawlApi.getStatus() → if crawling/stopping: restore live view (auto-hydrate)

1. User enters URL (or cURL command)
2. Configure: max pages, max depth, max products
3. crawlApi.start(url, { user_id, max_products, max_pages, max_depth })
   → POST /crawl (non-blocking, returns job_id immediately)
4. Poll crawlApi.getStatus() every 2s:
   → Update: pages visited, products scraped, elapsed time, current URL
5. User can:
   → Stop  → crawlApi.stop(jobId)    [body: { job_id }]
   → Resume → crawlApi.resume(jobId) [body: { job_id }]
   → Extend (on completed) → crawlApi.extend(jobId, count)
6. When satisfied → "Continue to Step 2" or skip
```

#### Step 2: Job Details
```
1. Name the migration job
2. Select type: Product | Customer | Order
3. Select format:
   - JSON / CSV / XML / Text / Raw Text → textarea
   - AI Parser → unstructured text
   - Google Sheet → Sheet URL
   - File Upload → drag-drop (≤50MB, JSON/CSV/XML/TXT)
   - Website URL → auto-filled from Step 1 crawl job_id
4. Validate → Submit:
   → File: migrationApi.startFile(formData)
   → Else: migrationApi.start(payload)
5. Navigate → /jobs/{jobId}
```

### `/jobs` — All Jobs
```
On mount:
  → migrationApi.listJobs(userId) → migrations
  → crawlApi.listUserJobs(userId) → crawls (mapped via mapCrawlJobs)

Features:
  → Three tabs: All | Migrations | Crawls (with counts)
  → Search filter: job name (migrations) / URL (crawls)
  → Status filter buttons: All | Processing | Completed | Pending | Failed
    (only shown on All/Migrations tabs)
  → JobCard + CrawlCard per item
  → Delete with confirmation (optimistic + API)
  → Crawl divider in "All" tab
```

### `/jobs/:jobId` — Job Progress (live tracking)
```
On mount:
  → migrationApi.getJob(jobId) → initial job state

Polling (while pending | processing):
  → migrationApi.getStatus(jobId) every 3s
  → Update: progress, correctRows, failedRows, processingRows
  → Estimate: ceil((totalRows - processedRows) / 8) seconds remaining
  → Stop polling on completed/failed

Progress bar:
  → Phase 1 (amber): 0–50% = row processing
  → Phase 2 (emerald): 50–100% = validation/AI correction

Status UI:
  → pending:    "Queued" banner
  → processing: Live stats + WalkingPets + Stop button
  → completed:  Green banner + 5 action buttons
  → failed:     Red banner + Retry Failed + Full Restart
```

### `/jobs/:jobId/failed` — Review Errors
```
On mount:
  → migrationApi.getJob(jobId)
  → migrationApi.getRows(jobId, { status: 'failed', limit: 500 })

Per FailedRowCard:
  → Show: row #, product name, error pills, confidence score, attempt count
  → "Retry with AI" → aiRetry(rowId) → 'retrying' → remove after 2s
  → "Edit Manually" → ManualEditModal → correct(rowId, data) → 'resolved' → remove
  → Expand → shows original data, error fields highlighted
```

### `/jobs/:jobId/export` — Download Results
```
Three cards: Correct | Failed | All
On click → exportApi.download(jobId, type) → Blob
  → exportApi.triggerDownload(blob, filename) → browser dialog
```

### `/jobs/:jobId/results` — Results Grid
```
On mount: load up to 1000 rows (2× 500 with skip offset)

rowsToGridRows():
  1. Expand variants → 1 variant = 1 row
  2. Pair images by index (overflow → image-only rows)
  3. Flatten nested keys (seo.title → seo_title)
  4. Map loc paths → column names for error highlights

Grid features:
  → Editable cells → migrationApi.correct() per edit
  → Column visibility toggle
  → Search with 150ms debounce
  → Filter: All | Correct | Failed
  → Cell-level error/warning highlights + tooltip
  → Export dropdown: All / Correct / Failed → Shopify CSV

View modes (from Settings toggles):
  → Table (default): AG Grid spreadsheet
  → Shopify View: product card grid
  → CSV Preview: Shopify column layout
```

### `/batch-export` — Batch Merge & Export
```
On mount: migrationApi.listJobs(userId) → jobs[]

Features:
  → Select multiple completed jobs
  → mergedApi.save(name, jobIds) → create merged job
  → Navigate → /merged/{mergedId}
```

### `/merged/:mergedId` — Merged Job View
```
On mount: mergedApi.get(id) + mergedApi.getRows(id)

Features:
  → Editable grid (mergedApi.editRow)
  → Delete rows (mergedApi.deleteRow)
  → Re-sync source jobs (mergedApi.sync)
  → Export merged data as Shopify CSV
  → Delete merged job (mergedApi.delete)
```

### `/crawls/:jobId` — Crawl Detail
```
On mount:
  → crawlApi.getJob(jobId) → job details (falls back to getJobProducts if not found)
  → crawlApi.getJobProducts({ job_id, page: 1, page_size: 12 }) → first product page

Layout:
  ┌─ Hero header (gradient bg + dot grid)
  │   → Back button, job name, URL, status pill, timestamps
  │   → Stat strip: Products, Pages, Duration, Status
  │
  ├─ Left column: Downloads + Actions
  │   → Download buttons: CSV / JSON / JSONL (direct URL via getDownloadUrl)
  │   → "View live process" (green, only when running) → navigate /new-migration
  │   → "Use for migration" → navigate /new-migration with prefillUrl state
  │   → Extend crawl (number input + button, only when completed)
  │   → Delete job with confirmation
  │
  └─ Right column: Paginated products table
      → 12 per page
      → Thumbnail, title, URL, price
      → Empty state differs for running vs completed
```

### `/settings` — Settings
```
Navigation: Profile | Appearance | Notifications | Defaults | Security | Dashboard | Developer

Profile:
  → Avatar (initials), edit name/email → Save button

Appearance:
  → Dark mode toggle (ThemeContext)
  → 6 colour theme swatches with mini preview

Notifications: (UI only, no backend)
  → Job completed/failed, weekly digest, AI retry alerts

Migration Defaults: (localStorage)
  → Auto-retry, skip empty fields, strict mode, preserve IDs
  → Shopify grid view, Shopify CSV preview

Security:
  → Change password form

Dashboard: (see section 13)
  → Chart type, palette, card style, section toggles

Developer:
  → Migration API URL override (swallow_api_override)
  → Crawl API URL override (swallow_crawl_override)
  → Current active value shown in green
  → Save & Reload (applies immediately)
  → Clear overrides button
  → Storage key status badges
```

---

## 9. Component Reference

### Layout

| Component | Description |
|-----------|-------------|
| `DashboardLayout` | Sidebar + `<Outlet>` + BlobBackground |
| `Sidebar` | Nav links, user profile, logout, mobile slide-in |

### UI Primitives

| Component | Key Props | Notes |
|-----------|-----------|-------|
| `Button` | `variant` (primary/secondary/ghost/danger/amber), `size`, `loading`, `icon` | Framer Motion, disabled during loading |
| `Badge` | `variant` (status/type/confidence), `size` | Status colours: green/amber/slate/rose |
| `Modal` | `isOpen`, `onClose`, `title`, `size` | Backdrop blur, escape key close |
| `Spinner` | `size` | Inline spinner |
| `PageLoader` | `label` | Full-screen with optional label |
| `ProgressBar` | `value`, `color` | Animated width transition |
| `ExcelGrid` | `rows`, `onSave`, `editedMap` | AG Grid wrapper, cell-level error highlights |
| `BlobBackground` | — | 5 fixed radial-gradient orbs, light mode only |
| `WalkingPets` | — | SVG walking pets animation during processing |

### Migration Components

| Component | Description |
|-----------|-------------|
| `JobCard` | Migration job card — status, progress bar, stats, delete confirm |
| `CrawlCard` | Crawl session card — URL, status dot, pages/products/duration, click → /crawls/:jobId |
| `StatCard` | Single metric box with icon |
| `ShopifyGridView` | Product card grid (grouped by handle) |
| `ShopifyCsvView` | AG Grid in Shopify CSV format |

### Row Components

| Component | Description |
|-----------|-------------|
| `FailedRowCard` | Error display, expand toggle, retry/edit buttons |
| `ManualEditModal` | Edit any field in originalData, save → correct() |

---

## 10. Data Flow: DB → UI

```
MongoDB: migration_rows
  { _id, job_id, iteration, status,
    original_data, cleaned_data, final_result,
    validation_errors, history, confidence_score }
          ↓
  GET /api/v1/migration/{jobId}/rows
          ↓
  api.ts: mapRow(raw, index)
  → Picks: final_result → cleaned_data → original_data
  → Merges images if AI dropped them
  → Normalises validation_errors
  → Returns FailedRow (camelCase, typed)
          ↓
  FailedRows page → FailedRowCard (retry/edit)
          ↓
  ResultsGrid → rowsToGridRows()
  → Expand variants, pair images, flatten keys, map error locs
  → Returns GridRow[]
          ↓
  ExcelGrid / ShopifyGridView / ShopifyCsvView

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Crawl DB: jobs collection
  { job_id, name, source_url, status,
    total_products, elapsed_seconds, stats }
          ↓
  GET /jobs/user/{userId}
          ↓
  mapCrawlJob(j)
  → source_url ?? url
  → total_products ?? product_output ?? stats.products_scraped
  → "running" → "crawling" (status normalisation)
  → Returns StoredCrawlSession
          ↓
  Dashboard / Jobs page → CrawlCard → /crawls/:jobId
          ↓
  CrawlDetail → crawlApi.getJobProducts() → Product[]
```

---

## 11. State Management

No Redux/Zustand — pure React primitives.

| Scope | Mechanism | Used For |
|-------|-----------|----------|
| Global auth | `AuthContext` + `useContext` | user, login, logout |
| Global theme | `ThemeContext` + `useContext` | colorTheme, isDark |
| Page data | `useState` | jobs, rows, crawls, loading |
| Derived | `useMemo` | filtered rows, product groups, headers |
| Side effects | `useEffect` | API calls, polling intervals |
| DOM refs | `useRef` | AG Grid API, poll timers, error counts |
| Persistence | `localStorage` | tokens, user, theme, feature flags, API overrides |
| Optimistic UI | Remove then re-fetch | Delete operations |

### Polling Pattern
```typescript
useEffect(() => {
  if (status !== 'crawling' && status !== 'stopping') return
  const id = setInterval(async () => {
    const d = await crawlApi.getStatus()
    setStats({ ... })
    if (d.status !== status) setCrawlState(d.status)
  }, 2000)
  return () => clearInterval(id)
}, [status])
```

---

## 12. Theme & Styling System

### CSS Variables (on `<html>`)

```css
--accent            /* RGB values — active colour */
--accent-fg         /* Foreground on accent */
--page-bg           /* Page background */
--sidebar-bg        /* Sidebar (rgba) */
--card-bg           /* Card/panel background */
--card-border       /* Card border */
--header-bg         /* Header backdrop */
--input-bg          /* Input background */
--input-border      /* Input border */
```

### 6 Colour Themes

| Theme | Accent | Background | Dark? |
|-------|--------|------------|-------|
| Light | `#131313` (black override) | `#f8fafc` | No |
| Dark | White `255 255 255` | `#020617` | Yes |
| Midnight | Indigo `99 102 241` | `#07101e` | Yes |
| Aurora | Purple `168 85 247` | `#0d0618` | Yes |
| Forest | Emerald `34 197 94` | `#051208` | Yes |
| Sunset | Orange `249 115 22` | `#150900` | Yes |

**Tailwind black override** (`tailwind.config.ts`):
```typescript
colors: {
  black: '#131313',   // overrides Tailwind's default #000000
}
```
This affects all `text-black`, `bg-black`, `border-black`, `bg-black/5`, etc. across the app.

### Utility Classes

```css
.themed-card      /* bg + border + backdrop-blur from CSS vars */
.themed-header    /* header bg + blur + bottom border */
.themed-input     /* input bg + border */
.nav-active       /* accent-coloured active nav link */
.glass / .glass-heavy  /* white bg + blur variants */
.scrollbar-hide   /* hide scrollbars */
```

---

## 13. Dashboard Customisation System

Settings → Dashboard section provides live customisation saved to localStorage, applied immediately on Dashboard without page reload.

### Chart Types (`swallow_dash_chart_type`)

| Value | Description |
|-------|-------------|
| `donut` | Modern gradient donut with glow on hover, animated draw-in, interactive (default) |
| `ring` | Thin ring (4px stroke) with rounded caps, simpler aesthetic |
| `bars` | Horizontal progress bars with count + percentage labels |

### Chart Palettes (`swallow_dash_chart_palette`)

| Value | Colors |
|-------|--------|
| `default` | Green / Amber / Slate / Rose |
| `vibrant` | Cyan / Violet / Orange / Pink |
| `pastel` | Mint / Lavender / Yellow / Light rose |
| `mono` | Dark slate → light slate gradient |

### Card Styles (`swallow_dash_card_style`)

| Value | Description |
|-------|-------------|
| `filled` | Coloured background per metric (default) |
| `outlined` | `themed-card` + 2px accent border |
| `minimal` | `themed-card` neutral, no colour fill |

### Section Visibility

| Key | Default | Controls |
|-----|---------|----------|
| `swallow_dash_show_metrics` | `true` | 4 hero metric cards |
| `swallow_dash_show_chart` | `true` | Job status chart panel |
| `swallow_dash_show_health` | `true` | Migration health bars |
| `swallow_dash_show_crawl` | `true` | Crawl summary panel |
| `swallow_dash_compact_table` | `false` | Compact row height in activity table |

---

## 14. Local Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `swallow_access_token` | string | JWT access token |
| `swallow_refresh_token` | string | JWT refresh token |
| `swallow_user` | JSON | Cached `BackendUser` for instant restore |
| `color-theme` | string | Selected colour theme name |
| `swallow_shopify_grid_view` | `"true"/"false"` | Shopify card view in ResultsGrid |
| `swallow_shopify_csv_view` | `"true"/"false"` | Shopify CSV preview in ResultsGrid |
| `swallow_api_override` | string URL | Runtime override for migration backend URL |
| `swallow_crawl_override` | string URL | Runtime override for crawl backend URL |
| `swallow_dash_chart_type` | `donut\|ring\|bars` | Dashboard chart type |
| `swallow_dash_chart_palette` | `default\|vibrant\|pastel\|mono` | Chart colour palette |
| `swallow_dash_card_style` | `filled\|outlined\|minimal` | Hero metric card style |
| `swallow_dash_show_metrics` | `"true"/"false"` | Show hero metrics strip |
| `swallow_dash_show_chart` | `"true"/"false"` | Show job status chart |
| `swallow_dash_show_health` | `"true"/"false"` | Show migration health bars |
| `swallow_dash_show_crawl` | `"true"/"false"` | Show crawl summary |
| `swallow_dash_compact_table` | `"true"/"false"` | Compact activity table rows |

**Removed keys (previously used, now replaced by API calls):**
- ~~`swallow_jobs_{userId}`~~ → replaced by `migrationApi.listJobs()`
- ~~`swallow_crawls_{userId}`~~ → replaced by `crawlApi.listUserJobs()`

---

## 15. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Migration backend base URL | `https://abc123.ngrok.io` |
| `VITE_CRAWL_API_URL` | Crawl backend base URL (optional, falls back to API base) | `https://xyz789.ngrok.io` |

Both can be overridden at runtime via localStorage without rebuilding:
- Settings → Developer → Migration API URL → Save & Reload
- Settings → Developer → Crawl API URL → Save & Reload

---

## 16. Key Feature Workflows

### Complete Migration Workflow

```
/new-migration
  ↓
[Optional] Crawl Step
  → crawlApi.start(url, { user_id, ... })    ← POST /crawl (non-blocking)
  → Poll crawlApi.getStatus() every 2s
  → Stop/resume/extend as needed
  ↓
Step 2: Job Details
  → migrationApi.start(payload) or startFile(formData)
  → Response: { job_id }
  ↓
Navigate /jobs/{jobId}
  → Poll getStatus() every 3s
  → Watch progress: 0→50% (processing) then 50→100% (validation)
  ↓
status === 'completed'
  ↓
Choose:
  ├─ /jobs/{jobId}/results     → AG Grid + Shopify export
  ├─ /jobs/{jobId}/failed      → Review + fix errors
  ├─ /jobs/{jobId}/export      → NDJSON download
  └─ /batch-export             → Merge with other jobs
```

### Crawl → Crawl Detail Workflow

```
/new-migration → Start crawl → live progress
  ↓
Crawl completes (status: completed)
  ↓
Jobs page → CrawlCard → click → /crawls/{jobId}
  ↓
CrawlDetail:
  → Download CSV/JSON/JSONL
  → Use for migration → /new-migration?prefillUrl
  → Extend crawl → crawlApi.extend(jobId, count) → back to /new-migration for live view
  → Delete → crawlApi.deleteCrawlJob(jobId) → navigate /dashboard
  ↓
If job is still running:
  → "View live process" button → /new-migration
  → NewMigration auto-hydrates from GET /crawl/status on mount
```

### Failed Row Correction Workflow

```
/jobs/{jobId}/failed
  → Load FailedRow[] (max 500)

Per row:
  ├─ "Retry with AI"
  │    aiRetry(rowId) → 'retrying' → removed after 2s
  │    On error: restore to 'failed'
  │
  └─ "Edit Manually"
       ManualEditModal → edit fields
       → correct(rowId, updatedData)
       → 'resolved' → removed from list

All resolved → empty state → "Export Results" CTA
```

### Shopify CSV Export Workflow

```
ResultsGrid → Export dropdown → "Export All/Correct/Failed"
  ↓
generateShopifyCSV(gridRows)
  → 51 official Shopify headers
  → Expand variants → N rows per product
  → Pair images by position index
  → Overflow images → image-only rows
  → Type conversions: boolean → TRUE/FALSE, weight → grams
  ↓
Blob → browser download as {jobId}-shopify.csv
```

### Validation Error → Cell Highlight Workflow

```
DB: validation_errors[{ loc: "images[0].src", severity: "error", msg: "..." }]
  ↓ mapRow()
ValidationError[] with typed fields
  ↓ rowsToGridRows()
locToCol("images[0].src") → strips [0] → "images.src" → MAP → "image_src"
cellSeverity["image_src"] = "error"
cellWarnings["image_src"] = "HTTP 404..."
  ↓ ExcelGrid
makeCellClassRules → "cell-error" class → red background
DataCellRenderer → red dot + hover tooltip
```

---

## 17. Error Handling Strategy

| Scenario | Handling |
|----------|----------|
| 401 Unauthorized | Silent refresh once; on failure → redirect `/login` |
| API error body | Parse `detail` (string or Pydantic array) → show in UI |
| Network failure | Logged to console; UI shows last known state |
| Optimistic delete fails | Re-fetch list from API to restore correct state |
| Row retry fails | Restore row status to `'failed'` |
| Empty `validation_errors` | Fall back to `history[last].errors` |
| Broken image URLs | `<img onError>` hides element; fallback icon or initials |
| Counter overflow | All counts clamped to `[0, totalRows]` |
| Progress overflow | Capped at 100% |
| Crawl 409 conflict | Show: "A crawl is already running. Stop it first." |
| Crawl status `"running"` | Normalised to `"crawling"` in all mappers |
| Extend while running | Caught with message display in CrawlDetail |

**Known gaps:**
- No global `<ErrorBoundary>` — unhandled render errors crash the whole app
- Network errors in polling loops only log to console, no user notification
- No toast/snackbar system — errors shown inline or silently swallowed

---

## 18. Performance Optimisations

| Optimisation | Location | Impact |
|--------------|----------|--------|
| `useMemo` for derived data | ResultsGrid, ShopifyGridView, ShopifyCsvView | Avoids re-computation per render |
| `useRef` for AG Grid API | ExcelGrid | No re-render for internal grid ops |
| `refreshCells({ rowNodes })` | ExcelGrid | Repaints only edited row |
| `cellClassRules` | ExcelGrid | Lazy evaluation vs per-render `cellStyle` |
| Memoised `gridComponents` | ExcelGrid | Prevents AG Grid re-instantiating renderers |
| Image JSON parse cache | ShopifyCsvView | Parse once per row, not per column check |
| 150ms debounced search | ResultsGrid | No filter on every keystroke |
| localStorage auth restore | api.ts / AuthContext | Instant user restore — no loading flash |
| Poll cleanup on unmount | NewMigration, JobProgress | No stale interval memory leaks |
| GSAP page animations | usePageAnimation | GPU-accelerated, no JS layout thrash |
| Optimistic deletes | Jobs, Dashboard | Instant UI response without waiting for API |

---

## 19. Recent Changes Log

### 2026-03-27 (current)

**Dashboard Redesign**
- Full layout overhaul: greeting headline, 4-column hero metric strip, 3-column middle section, activity table
- SVG donut chart with gradient fills, glow filter, animated draw-in, interactive hover
- Alternative chart types: thin ring, horizontal bars
- 4 colour palettes: Default / Vibrant / Pastel / Mono
- 3 metric card styles: Filled / Outlined / Minimal
- Section visibility toggles (show/hide any panel)
- Compact table mode

**Settings — Dashboard Tab**
- Full dashboard customisation panel (chart type, palette, card style, section toggles)
- Settings saved to localStorage, applied on next Dashboard render (no reload needed)

**Settings — Developer Tab**
- Runtime URL override inputs for both backends
- "Save & Reload" applies immediately
- "Clear overrides" resets to env vars
- Storage key status badges

**Crawl Detail Page** (`/crawls/:jobId`)
- Hero header with gradient + dot grid background
- 4 stat cards in header strip
- Downloads card (CSV / JSON / JSONL direct URL)
- Actions card: "View live process" (running only) → /new-migration, "Use for migration", "Extend crawl", Delete
- Paginated products table (12/page) with thumbnails

**Jobs Page**
- Now shows both migration jobs AND crawl sessions
- Three tabs: All / Migrations / Crawls with counts
- Crawls section divider in "All" tab
- Status filter hidden on "Crawls" tab

**Crawl API Contract Updates**
- `POST /crawl` non-blocking — returns `{ status, job_id }` immediately
- `POST /crawl/extend` non-blocking
- `POST /crawl/control/stop` body: `{ job_id }` (was no body)
- `POST /crawl/control/continue` body: `{ job_id }` (was no body)
- `HTTP 409` on conflict (another crawl running)
- Status `"running"` normalised to `"crawling"` in all mappers

**Bug Fixes**
- Running crawl jobs no longer shown as "Completed" (was: unknown status defaulted to completed)
- `fmtSeconds` now handles hours correctly (was: `101m23s` instead of `1h 41m 23s`)
- `user_id` now included in `POST /crawl` body (was causing 422 Unprocessable Content)

**Styling**
- Tailwind `black` colour overridden to `#131313` globally
- Light theme preview accent updated to `#131313`

**Removed**
- All localStorage-based crawl session storage (`swallow_crawls_{userId}` key)
- `storeCrawlSession`, `getStoredCrawlSessions`, `removeCrawlSession` functions
- `storeJobId`, `getStoredJobIds` functions
- `crawlApi.getSession()` (endpoint removed from backend)

---

*Last updated: 2026-03-27*
