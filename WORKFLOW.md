# Swallow — Frontend Workflow Documentation

> AI-powered Shopify data migration platform.
> Stack: React 18 · TypeScript · Vite · React Router v6 · Framer Motion · AG Grid · Tailwind CSS

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Routing & Auth Guard](#3-routing--auth-guard)
4. [Authentication Flow](#4-authentication-flow)
5. [API Service Layer](#5-api-service-layer)
6. [Core Data Types](#6-core-data-types)
7. [Page-by-Page Workflows](#7-page-by-page-workflows)
8. [Component Reference](#8-component-reference)
9. [Data Flow: DB → UI](#9-data-flow-db--ui)
10. [State Management](#10-state-management)
11. [Theme & Styling System](#11-theme--styling-system)
12. [Local Storage Keys](#12-local-storage-keys)
13. [Environment Variables](#13-environment-variables)
14. [Key Feature Workflows](#14-key-feature-workflows)
15. [Error Handling Strategy](#15-error-handling-strategy)
16. [Performance Optimizations](#16-performance-optimizations)

---

## 1. Project Overview

**Swallow** migrates product/customer/order data from any source format into Shopify-ready CSVs. The AI backend validates, enriches, and corrects each row. The frontend lets users:

- Submit data (paste, file upload, Google Sheet, web scrape)
- Track migration jobs in real time
- Review and fix failed rows (AI retry or manual edit)
- Export results as NDJSON or Shopify CSV
- View results in an editable spreadsheet, product card grid, or CSV preview

---

## 2. Architecture Overview

```
src/
├── App.tsx                  # Route definitions + RequireAuth guard
├── main.tsx                 # React root, providers
├── index.css                # Global styles, CSS variables, Tailwind
├── types/index.ts           # All shared TypeScript interfaces
├── context/
│   ├── AuthContext.tsx      # JWT auth state + login/register/logout
│   └── ThemeContext.tsx     # Dark mode + 6 colour themes
├── services/
│   └── api.ts               # All API calls (auth, migration, crawl, export)
├── hooks/
│   └── usePageAnimation.ts  # Framer Motion page entrance hook
├── pages/
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Dashboard.tsx
│   ├── NewMigration.tsx
│   ├── Jobs.tsx
│   ├── JobProgress.tsx
│   ├── FailedRows.tsx
│   ├── Export.tsx
│   ├── ResultsGrid.tsx
│   └── Settings.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── DashboardLayout.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Logo.tsx
│   │   ├── Spinner.tsx
│   │   ├── ExcelGrid.tsx
│   │   ├── BlobBackground.tsx
│   │   └── ...
│   ├── migration/
│   │   ├── JobCard.tsx
│   │   ├── CrawlCard.tsx
│   │   ├── StatCard.tsx
│   │   ├── ShopifyGridView.tsx
│   │   └── ShopifyCsvView.tsx
│   └── rows/
│       ├── FailedRowCard.tsx
│       └── ManualEditModal.tsx
└── assests/
    ├── logo.png
    └── loading.gif
```

---

## 3. Routing & Auth Guard

```
/                        → redirect to /login
/login                   → Login (public)
/register                → Register (public)
/dashboard               → Dashboard (protected)
/new-migration           → NewMigration (protected)
/jobs                    → Jobs / Migration History (protected)
/jobs/:jobId             → JobProgress (protected)
/jobs/:jobId/failed      → FailedRows (protected)
/jobs/:jobId/export      → Export (protected)
/jobs/:jobId/results     → ResultsGrid (protected)
/settings                → Settings (protected)
*                        → redirect to /dashboard
```

### RequireAuth Guard (`App.tsx`)

```tsx
function RequireAuth({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />        // wait for token verification
  if (!user)    return <Navigate to="/login" />
  return <>{children}</>
}
```

All protected routes are wrapped:
```tsx
<Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
  ...protected routes...
</Route>
```

---

## 4. Authentication Flow

### Login
```
User fills email + password
  → authApi.login(email, password)
  → POST /api/v1/auth/login
  → Response: { access_token, refresh_token, user }
  → Store tokens in localStorage
  → Store user in localStorage (instant restoration next visit)
  → Navigate to /dashboard
```

### Session Restore (on app mount)
```
App mounts
  → Check localStorage for access_token
  → If found: restore cached user instantly (no loading flash)
  → Call GET /api/v1/auth/me to verify token
  → If valid: set user in context
  → If 401: clear tokens → redirect to /login
```

### Token Refresh
```
Any API call returns 401
  → Try POST /api/v1/auth/refresh with refresh_token
  → If success: update access_token, retry original request
  → If fail: clear all tokens → redirect to /login
```

### Logout
```
User clicks "Sign out"
  → authApi.logout()
  → Clear localStorage (tokens + user)
  → Set user = null in context
  → Navigate to /login
```

---

## 5. API Service Layer

**File:** `src/services/api.ts`

**Base URL:** `import.meta.env.VITE_API_BASE_URL`

All requests go through `request<T>(path, options?)` which:
1. Reads `access_token` from localStorage
2. Adds `Authorization: Bearer <token>` header
3. On 401: silently refreshes token once and retries
4. On other errors: parses `detail` field from backend (FastAPI/Pydantic)

---

### Auth API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `authApi.login(email, password)` | `POST /api/v1/auth/login` | Returns tokens + user |
| `authApi.register(email, password)` | `POST /api/v1/auth/register` | Creates account + auto-logs in |
| `authApi.me()` | `GET /api/v1/auth/me` | Validates current token |
| `authApi.logout()` | — | Clears localStorage |
| `authApi.getCachedUser()` | — | Reads from localStorage |

---

### Migration API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `migrationApi.start(payload, userId)` | `POST /api/v1/migration/start` | Start migration with raw text/JSON |
| `migrationApi.startFile(formData, userId)` | `POST /api/v1/migration/start-file` | Start migration with file upload |
| `migrationApi.getJob(jobId)` | `GET /api/v1/migration/{jobId}` | Full job details |
| `migrationApi.getStatus(jobId)` | `GET /api/v1/migration/{jobId}/status` | Lightweight status (used for polling) |
| `migrationApi.listJobs(userId)` | `GET /api/v1/migration/?limit=200` | All jobs for user |
| `migrationApi.getRows(jobId, params)` | `GET /api/v1/migration/{jobId}/rows` | Paginated rows (status, skip, limit) |
| `migrationApi.retry(jobId)` | `POST /api/v1/migration/{jobId}/retry` | Retry entire failed job |
| `migrationApi.stop(jobId)` | `POST /api/v1/migration/{jobId}/stop` | Stop processing job |
| `migrationApi.deleteJob(jobId)` | `DELETE /api/v1/migration/{jobId}` | Delete job |
| `migrationApi.aiRetry(rowId)` | `POST /api/v1/migration/row/{rowId}/ai-retry` | AI retry single failed row |
| `migrationApi.correct(rowId, data)` | `POST /api/v1/migration/row/{rowId}/correct` | Manually correct a row |

---

### Crawl API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `crawlApi.start(url, params)` | `POST /api/v1/crawl/start` | Start web scraper |
| `crawlApi.stop()` | `POST /api/v1/crawl/stop` | Stop scraper |
| `crawlApi.resume(url)` | `POST /api/v1/crawl/resume` | Resume paused scraper |
| `crawlApi.getStatus()` | `GET /api/v1/crawl/status` | Live scraper status |
| `crawlApi.getSession(url)` | `GET /api/v1/crawl/session?url=...` | Check if session exists |

---

### Export API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `exportApi.download(jobId, type)` | `GET /api/v1/migration/{jobId}/export?type=...` | Returns Blob (NDJSON) |
| `exportApi.triggerDownload(blob, filename)` | — | Opens native browser download |

`type` options: `'correct'` | `'failed'` | `'all'`

---

### Data Mapping

**`mapJob(raw)`** — DB document → `MigrationJob`
- snake_case → camelCase conversion
- Status mapping: `"stopped"` → `"failed"`
- Counter clamping: all counts clamped to `[0, totalRows]`
- Progress: uses `progress_pct` if available, else derives from `processedRows / totalRows`

**`mapRow(raw, rowIndex)`** — DB document → `FailedRow`
- Picks best data source: `final_result` → `cleaned_data` → `original_data`
- Merges images from `original_data` if AI-processed result dropped them
- Maps `validation_errors[]` → typed `ValidationError[]`
- Falls back to `history[last].errors` if `validation_errors` is empty
- Status mapping: `"correct"` → `"resolved"`, `"retry"` → `"retrying"`, else `"failed"`

---

## 6. Core Data Types

```typescript
// Migration job
interface MigrationJob {
  id: string
  name: string
  type: 'product' | 'customer' | 'order'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  inputFormat: 'json' | 'csv' | 'xml' | 'text' | 'raw_text' | 'ai_parser' | 'website_url' | 'google_sheet'
  totalRows: number
  processedRows: number
  correctRows: number
  failedRows: number
  processingRows: number
  progress: number          // 0–100
  createdAt: string
  updatedAt: string
  completedAt?: string
}

// Individual failed row from migration_rows collection
interface FailedRow {
  id: string
  jobId: string
  rowIndex: number
  originalData: Record<string, unknown>   // best available: final_result / cleaned_data / original_data
  errorMessage: string                    // generic error message (often null in DB)
  confidenceScore: number                 // 0–1
  attempts: number                        // iteration count
  status: 'failed' | 'retrying' | 'resolved'
  validationErrors: ValidationError[]
}

// Field-level validation error
interface ValidationError {
  field: string       // e.g. "src"
  loc: string         // dot-path e.g. "images[0].src"
  severity: 'error' | 'warning'
  msg: string         // human-readable message
  got?: unknown       // actual value that caused the error
}

// AG Grid row shape
interface GridRow {
  id: string
  rowIndex: number
  status: 'correct' | 'failed'
  confidenceScore: number
  data: Record<string, string>            // flat key→value for grid columns
  errorFields?: string[]
  cellWarnings?: Record<string, string>
  cellSeverity?: Record<string, 'error' | 'warning'>
}

// Web scraper session (localStorage)
interface StoredCrawlSession {
  url: string
  startedAt: string
  status: 'idle' | 'crawling' | 'stopping' | 'paused' | 'completed' | 'error'
  pagesVisited: number
  productsScraped: number
  elapsedSeconds: number
  jobId?: string | null
}
```

---

## 7. Page-by-Page Workflows

### `/login` — Login

```
1. User enters email + password
2. Client validates: both fields non-empty
3. authApi.login() → POST /api/v1/auth/login
4. Success → store tokens + user → navigate /dashboard
5. Failure → display error message
```

---

### `/register` — Register

```
1. User enters name + email + password
2. Validates: name required, valid email, password ≥ 8 chars
3. authApi.register() → POST /api/v1/auth/register
4. Auto-calls authApi.login() → navigate /dashboard
```

---

### `/dashboard` — Dashboard

```
On mount:
  → migrationApi.listJobs(userId)    → populate jobs[]
  → getStoredCrawlSessions(userId)   → populate crawls[] (from localStorage)

Display:
  → Summary stats: Total | Completed | Processing | Success Rate
  → Tabs: All | Migrations | Crawls
  → JobCard / CrawlCard per item
  → Empty state CTA if no jobs

Delete job:
  → Optimistic: remove from state immediately
  → migrationApi.deleteJob(id)
  → If API fails: re-fetch to restore
```

---

### `/new-migration` — New Migration (2-step wizard)

#### Step 1: Website Crawler (optional)

```
1. User enters target URL
2. crawlApi.getSession(url) → check if previous session exists
   → If yes: offer "Resume" or "Start New"
3. User configures: max pages, max depth, max products
4. crawlApi.start(url, params) → backend starts Playwright scraper
5. Poll crawlApi.getStatus() every 3s:
   → Update: pages visited, products scraped, elapsed time, progress bar
6. User can:
   → Stop  → crawlApi.stop()
   → Pause (if supported)
   → Continue to Step 2 (passes crawled job ID)
```

#### Step 2: Job Details

```
1. Name the migration job
2. Select migration type: Product | Customer | Order
3. Select input format:
   - JSON / CSV / XML / Text / Raw Text → paste in textarea
   - AI Parser → paste any unstructured text
   - Google Sheet → enter Sheet URL
   - File Upload → drag-and-drop up to 50MB (JSON, CSV, XML, TXT)
   - Website URL → filled from Step 1 crawl job
4. Validate: name required, data/file/url required
5. Submit:
   → If file: migrationApi.startFile(formData, userId)
   → Else:    migrationApi.start(payload, userId)
6. Navigate to /jobs/{jobId}
```

---

### `/jobs` — Migration History

```
On mount:
  → migrationApi.listJobs(userId) → populate jobs[]

Features:
  → Search by job name (real-time filter)
  → Filter tabs: All | Processing | Completed | Pending | Failed
  → Each tab shows count of matching jobs
  → JobCard list with delete confirmation
  → Footer: showing X of Y jobs
```

---

### `/jobs/:jobId` — Job Progress (live tracking)

```
On mount:
  → migrationApi.getJob(jobId) → load initial job state

Polling (while status === 'processing' | 'pending'):
  → migrationApi.getStatus(jobId) every 3000ms
  → Update: progress, correctRows, failedRows, processingRows
  → Estimate time remaining: ceil((total - processed) / 8) seconds
  → Stop polling when status changes to completed/failed

Progress bar:
  → Phase 1 (amber): 0% → 50% = processing rows
  → Phase 2 (emerald): 50% → 100% = validation/correction

Status → UI:
  → pending:    "Queued" banner, waiting indicator
  → processing: Live stats + progress + animated pets + Stop button
  → completed:  Green success banner + 5 action buttons
  → failed:     Red error banner + Retry Failed / Full Restart buttons

Action buttons (on completed):
  → "View Failed Rows"   → /jobs/{jobId}/failed
  → "Export Results"     → /jobs/{jobId}/export
  → "View Results Grid"  → /jobs/{jobId}/results
  → "Retry Failed"       → migrationApi.retry(jobId)
  → "Full Restart"       → migrationApi.retry(jobId)
```

---

### `/jobs/:jobId/failed` — Review Errors

```
On mount:
  → migrationApi.getJob(jobId)         → get job name, failedRows count
  → migrationApi.getRows(jobId, {      → load up to 500 failed rows
      status: 'failed',
      limit: 500
    })

Per FailedRowCard:
  → Shows: row number, product name, error/warning pills, confidence score, attempt count

  → "Retry with AI":
      migrationApi.aiRetry(rowId)
      → row status → 'retrying' (UI state)
      → After 2s: remove from list (assumed resolved)
      → On API fail: restore to 'failed'

  → "Edit Manually":
      Opens ManualEditModal
      → User edits field values
      → Save → migrationApi.correct(rowId, updatedData)
      → Row status → 'resolved', removed from list

  → Expand toggle:
      → Shows original_data in 2-column grid
      → Fields matching validation errors highlighted in red
```

---

### `/jobs/:jobId/export` — Download Results

```
Three export cards:
  → Correct Records  → exportApi.download(jobId, 'correct') → .ndjson
  → Failed Records   → exportApi.download(jobId, 'failed')  → .ndjson
  → All Records      → exportApi.download(jobId, 'all')     → .ndjson

On click:
  → Fetch Blob from API
  → exportApi.triggerDownload(blob, filename)
  → Native browser "Save File" dialog opens
```

---

### `/jobs/:jobId/results` — Results Grid

```
On mount:
  → migrationApi.getRows(jobId, { limit: 500 })          → page 1
  → migrationApi.getRows(jobId, { skip: 500, limit: 500 }) → page 2
  → Merge into single rows array

Data transformation (rowsToGridRows):
  1. For each FailedRow, expand variants:
     → 3 variants = 3 rows (product fields repeated, variant fields differ)
  2. Pair images to variants by position index:
     → Image[0] → variant row 0
     → Image[1] → variant row 1
     → Overflow images → image-only rows (handle + image fields only)
  3. Flatten all fields:
     → seo.title → seo_title
     → options[0].name → option1_name
  4. Map validation errors to column keys:
     → "images[0].src" → "image_src" column (red highlight)

Grid features:
  → Editable cells (double-click)
  → Column visibility toggle (keep ≥1 visible)
  → Search filter (150ms debounce)
  → Filter tabs: All | Correct | Failed
  → Error/warning highlights per cell
  → Save edits → migrationApi.correct() per edited row
  → Tooltip on hover shows validation error message

View modes (toggle if enabled in Settings):
  → Table:        AG Grid spreadsheet (default)
  → Shopify View: ProductGroupCard grid (1 card per product, not per variant)
  → CSV Preview:  Shopify CSV column layout

Export dropdown:
  → "Export All"         → generates Shopify CSV (all rows)
  → "Export Correct"     → Shopify CSV (correct rows only)
  → "Export Failed"      → Shopify CSV (failed rows only)
  → Filename: {jobId}-shopify.csv
```

---

### `/settings` — Settings

```
Profile:
  → Display avatar (initials)
  → Edit name, email → save (API call)

Appearance:
  → Dark mode toggle → ThemeContext
  → 6 colour theme swatches → ThemeContext + localStorage

Notifications: (UI only, no backend)
  → Job completed / failed / weekly digest / AI retry alerts

Migration Defaults: (localStorage)
  → Auto-retry with AI          (swallow_auto_retry)
  → Skip empty fields           (swallow_skip_empty)
  → Strict mode                 (swallow_strict_mode)
  → Preserve original IDs       (swallow_preserve_ids)
  → Shopify Product View        (swallow_shopify_grid_view)
  → Shopify CSV Preview         (swallow_shopify_csv_view)

Security:
  → Change password form → API call (if implemented)
```

---

## 8. Component Reference

### Layout

| Component | File | Description |
|-----------|------|-------------|
| `DashboardLayout` | `layout/DashboardLayout.tsx` | Sidebar + main outlet + BlobBackground |
| `Sidebar` | `layout/Sidebar.tsx` | Nav links, user info, logout |

### UI Primitives

| Component | Props | Description |
|-----------|-------|-------------|
| `Button` | `variant`, `size`, `loading`, `icon`, `iconPosition` | Framer Motion button |
| `Badge` | `variant`, `color`, `size` | Status / type / confidence badge |
| `Logo` | `size` | Brand logo image with gradient bg |
| `Spinner` | `size` | Inline loading gif |
| `PageLoader` | `label` | Full-screen loading gif |
| `BlobBackground` | — | Fixed decorative blur orbs (light mode only) |
| `ExcelGrid` | `rows`, `onSave`, `onRetryRow`, `editedMap` | AG Grid wrapper with validation |

### Migration Components

| Component | Description |
|-----------|-------------|
| `JobCard` | Summary card for a migration job with delete confirm |
| `CrawlCard` | Summary card for a web scraper session |
| `StatCard` | Single stat number with icon and label |
| `ShopifyGridView` | Product card grid (1 card per product handle) |
| `ShopifyCsvView` | AG Grid in Shopify CSV column format |

### Row Components

| Component | Description |
|-----------|-------------|
| `FailedRowCard` | Detailed error display per failed row |
| `ManualEditModal` | Modal form to manually correct row data |

---

## 9. Data Flow: DB → UI

```
MongoDB (migration_rows collection)
  {
    _id, job_id, iteration, status,
    original_data: { ... raw source fields ... },
    cleaned_data:  { title, handle, variants[], images[], ... },
    final_result:  { ... fully validated Shopify product ... },
    validation_errors: [{ field, loc, severity, msg, got }],
    history: [{ iteration, errors[], confidence, timestamp }],
    confidence_score, error_message
  }
          ↓
  GET /api/v1/migration/{jobId}/rows
          ↓
  mapRow(raw, rowIndex)
  → Picks best data: final_result → cleaned_data → original_data
  → Merges images if AI dropped them
  → Maps validation_errors (fallback: history[last].errors)
  → Returns FailedRow (camelCase, typed)
          ↓
  FailedRows page: setRows(FailedRow[])
          ↓
  FailedRowCard: displays errors, retry/edit actions
          ↓  (also used in ResultsGrid)
  rowsToGridRows(FailedRow[])
  → Expands variants → multiple rows
  → Pairs images by position index
  → Flattens nested keys
  → Maps loc paths → column names for highlights
  → Returns GridRow[]
          ↓
  ExcelGrid / ShopifyGridView / ShopifyCsvView
```

---

## 10. State Management

The app uses React's built-in state primitives — no Redux/Zustand.

| Scope | Mechanism | Used For |
|-------|-----------|----------|
| Global auth | `AuthContext` + `useContext` | user, isLoading, login, logout |
| Global theme | `ThemeContext` + `useContext` | colorTheme, darkMode |
| Page state | `useState` | jobs, rows, loading flags |
| Derived data | `useMemo` | filtered rows, active headers, product groups |
| Side effects | `useEffect` | API calls on mount, polling intervals |
| DOM refs | `useRef` | AG Grid API, polling timers, last edited row ID |
| Persistence | `localStorage` | tokens, user, jobs, crawls, theme, feature flags |

---

## 11. Theme & Styling System

### CSS Variables (applied to `<html>`)

```css
--accent           /* RGB values for active/primary colour */
--accent-fg        /* Foreground on accent background */
--page-bg          /* Page background colour */
--sidebar-bg       /* Sidebar background (rgba) */
--card-bg          /* Card/panel background */
--card-border      /* Card border colour */
--header-bg        /* Header backdrop colour */
--input-bg         /* Input field background */
--input-border     /* Input border colour */
```

### 6 Colour Themes

| Theme | Accent | Background |
|-------|--------|------------|
| Light | Black `0 0 0` | White / slate-50 |
| Dark | White `255 255 255` | slate-900 |
| Midnight | Indigo `99 102 241` | slate-950 |
| Aurora | Purple `168 85 247` | slate-950 |
| Forest | Emerald `16 185 129` | slate-950 |
| Sunset | Orange `249 115 22` | slate-950 |

### Utility Classes

```css
.themed-card     /* bg + backdrop blur + border from CSS vars */
.themed-header   /* header bg + backdrop blur + bottom border */
.themed-input    /* input bg + border from CSS vars */
.nav-active      /* active nav link with accent colour */
.glass           /* white/60 bg + backdrop blur */
.glass-heavy     /* white/80 bg + heavier blur */
.scrollbar-hide  /* hide scrollbars */
```

### BlobBackground

Fixed decorative orbs visible in **light mode only** (`dark:hidden`).
5 radial-gradient circles using logo palette:
- `#FDDCC4` peach, `#FB923C` orange, `#F97316` deep orange
- `blur-[70px]` to `blur-[110px]`
- Positioned at corners and center-left

---

## 12. Local Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `swallow_access_token` | string | JWT access token |
| `swallow_refresh_token` | string | JWT refresh token |
| `swallow_user` | JSON string | Cached `BackendUser` for instant restore |
| `swallow_jobs_{userId}` | JSON array | Array of job IDs (workaround for no list endpoint) |
| `swallow_crawls_{userId}` | JSON array | Stored `StoredCrawlSession[]` (max 20) |
| `color-theme` | string | Selected colour theme name |
| `swallow_shopify_grid_view` | `"true"/"false"` | Enable Shopify card view in ResultsGrid |
| `swallow_shopify_csv_view` | `"true"/"false"` | Enable Shopify CSV preview in ResultsGrid |

---

## 13. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `https://api.swallow.ai` |
| `VITE_CRAWL_API_URL` | Crawl service URL (falls back to API base) | `https://crawl.swallow.ai` |

---

## 14. Key Feature Workflows

### Complete Migration Workflow

```
[User] → /new-migration
  ↓
[Optional] Web Crawl → crawlApi.start() → poll status → done
  ↓
[Step 2] Name + Type + Format + Data
  ↓
migrationApi.start() or migrationApi.startFile()
  → POST /api/v1/migration/start[-file]
  → Response: { job_id, job_name, total_rows }
  ↓
Navigate → /jobs/{jobId}
  ↓
Poll migrationApi.getStatus() every 3s
  → Update progress bar (phase 1 amber → phase 2 green)
  → Show live stats
  ↓
status === 'completed'
  ↓
Choose action:
  ├─ View Results Grid → /jobs/{jobId}/results
  ├─ Review Failed Rows → /jobs/{jobId}/failed
  └─ Export → /jobs/{jobId}/export
```

---

### Failed Row Correction Workflow

```
/jobs/{jobId}/failed
  → Load FailedRow[] (limit 500)
  → Display FailedRowCard per row
      → Show validation errors with loc, msg, got value
      → Highlight error fields in expanded original data

Per row action:
  ┌─ "Retry with AI"
  │    migrationApi.aiRetry(rowId)
  │    → status → 'retrying' (UI)
  │    → After 2s: remove from list
  │
  └─ "Edit Manually"
       Open ManualEditModal
       → Edit any field in originalData
       → Save
       → migrationApi.correct(rowId, updatedData)
       → Row status → 'resolved' → removed from list

All rows resolved → empty state → "Export Results" CTA
```

---

### Shopify CSV Export Workflow

```
ResultsGrid → Export dropdown → "Export All / Correct / Failed"
  ↓
generateShopifyCSV(gridRows)
  → 51 official Shopify column headers
  → Map each GridRow field → Shopify column
  → Expand variants: 1 product → N rows (1 per variant)
  → Pair images by position: image[i] → variant row[i]
  → Overflow images → extra image-only rows
  → Type conversions:
      boolean → TRUE / FALSE
      weight  → grams
      price   → decimal string
  ↓
CSV Blob → browser download as {jobId}-shopify.csv
```

---

### Validation Error → Grid Highlight Workflow

```
DB: validation_errors[{ loc: "images[0].src", severity: "error", msg: "..." }]
  ↓
mapRow() in api.ts
  → rawValidationErrors from validation_errors (or history[last].errors fallback)
  → ValidationError[] with typed severity
  ↓
rowsToGridRows() in ResultsGrid.tsx
  → locToCol("images[0].src", availableCols)
      → strips [0] → "images.src"
      → MAP lookup → "image_src"
  → cellSeverity["image_src"] = "error"
  → cellWarnings["image_src"] = "images[0] unreachable: HTTP 404..."
  → errorFields.push("image_src")
  ↓
ExcelGrid makeCellClassRules("image_src", editedMap)
  → cell-error class applied → red background
  → DataCellRenderer shows red dot + tooltip on hover
```

---

## 15. Error Handling Strategy

| Scenario | Handling |
|----------|----------|
| 401 Unauthorized | Silent token refresh once; if fails → redirect `/login` |
| API error response | Extract `detail` from FastAPI response → show in UI |
| Network failure | Logged to console; UI shows last known state |
| Optimistic delete fails | Re-fetch list from API to restore correct state |
| Row retry fails | Restore row status to 'failed' |
| Empty validation_errors | Fall back to `history[last].errors` |
| Image URL unreachable | `<img onError>` hides broken image; fallback initial letter shown |
| Job counter overflow | All counts clamped to `[0, totalRows]` |
| Progress overflow | Capped at 100% |

---

## 16. Performance Optimizations

| Optimization | Location | Impact |
|--------------|----------|--------|
| `useMemo` for derived data | ResultsGrid, ShopifyGridView, ShopifyCsvView | Avoids re-computation on every render |
| `useRef` for AG Grid API | ExcelGrid | Avoids state updates for internal grid ops |
| Selective `refreshCells({ rowNodes })` | ExcelGrid | Only repaints edited row instead of full grid |
| `cellClassRules` instead of `cellStyle` | ExcelGrid | Evaluated lazily by AG Grid, not on every render |
| Memoized `gridComponents` | ExcelGrid | Prevents AG Grid re-instantiating renderers |
| Pre-parsed image cache (`buildImageCache`) | ShopifyCsvView | Parse JSON once per row, not per header check |
| 150ms debounced search | ResultsGrid | Avoids filtering on every keystroke |
| localStorage for user/token | api.ts | Instant auth restore without loading flash |
| `PageLoader` gif during data fetches | Dashboard, Jobs, all pages | Clear loading feedback instead of empty flash |
| Polling cleanup on unmount | JobProgress | No memory leaks from stale intervals |
| Product grouping by handle | ShopifyGridView | 1 card per product not per variant |

---

*Last updated: 2026-03-20*
