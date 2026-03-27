================================================================================
                     Crawper — API Description & Documentation
================================================================================

Generated: 2026-03-26
Project:   Crawper — Universal Ecommerce Crawler & Product Extractor
Server:    FastAPI (Uvicorn) on http://localhost:8000
Docs:      http://localhost:8000/docs  (Swagger UI)


================================================================================
OVERVIEW
================================================================================

The Crawper backend exposes a REST API organised into four groups:

  1. CRAWLING   — Start, stop, resume, and extend crawling operations
  2. DOWNLOADS  — Retrieve scraped product data as downloadable files
  3. JOBS       — Manage and inspect crawl jobs and their products
  4. SYSTEM     — Health check and debug utilities

All endpoints that accept input use a JSON request body (no query params
except for the legacy GET /download endpoint).

All crawl operations run in the background — responses return immediately
with a job_id. Poll GET /crawl/status for live progress.


================================================================================
1. CRAWLING APIs
================================================================================

--------------------------------------------------------------------------------
POST /crawl
--------------------------------------------------------------------------------
Tag:     Crawling
Visible: Yes
Purpose: Start a crawl job in the background and return immediately.

Request Body (JSON):
   {
     "url":          (required) — Ecommerce website URL to crawl.
     "name":         (optional) — Custom label for this crawl job.
     "max_pages":    (optional) — Max pages to crawl (default: 100,000).
     "max_depth":    (optional) — Max crawl depth (default: 500).
     "max_products": (optional) — Stop after this many products (0 = unlimited).
   }

What it does:
   1. Rejects if another crawl is already running (HTTP 409).
   2. Creates a CrawlJob and spawns a background thread running:
      - Platform detection (Shopify / WooCommerce API fast-path)
      - Sitemap pre-discovery
      - Concurrent BFS browser crawl via Patchright (10 workers)
      - Per-page: product detection -> 3-tier extraction (JSON-LD -> LLM -> CSS)
   3. Returns immediately with the new job_id.
   4. Products are saved to PostgreSQL as they are scraped.

Response: { status: "started", message, job_id }

Notes:
   - Poll GET /crawl/status for live progress.
   - Use POST /jobs/products to fetch results once complete.
   - Only one crawl can run at a time.


--------------------------------------------------------------------------------
POST /crawl/extend
--------------------------------------------------------------------------------
Tag:     Crawling
Visible: Yes
Purpose: Extend a completed crawl in the background to scrape more products.

Request Body (JSON):
   {
     "job_id":       (required) — The completed job ID to extend.
     "max_products": (required) — Number of NEW additional products to scrape.
   }

What it does:
   1. Rejects if another crawl is already running (HTTP 409).
   2. Loads the original job from PostgreSQL (source_url, visited URLs).
   3. Starts a background thread that skips already-visited URLs and
      appends new products to the existing job record.
   4. Returns immediately with the new job_id.

Response: { status: "started", message, job_id }

Notes:
   - Poll GET /crawl/status for live progress.
   - Use POST /jobs/products to fetch results once complete.


--------------------------------------------------------------------------------
POST /crawl/control/stop
--------------------------------------------------------------------------------
Tag:     Crawling
Visible: Yes
Purpose: Stop the currently running crawl and persist state for resume.

Request Body: None

What it does:
   1. Checks if a job is already stopping -> returns "already_stopping".
   2. Finds the RUNNING job in JobManager.
   3. Cancels the job (sets asyncio.Event, status -> CANCELLED).
   4. Engine detects cancel -> saves queue checkpoint + session state.
   5. Persists "stopped" state in PostgreSQL crawl_control.

Response Model: CrawlControlResponse
   { status, message, job_id, url }
   status values: "stopped" | "already_stopping" | "no_active_crawl"


--------------------------------------------------------------------------------
POST /crawl/control/continue
--------------------------------------------------------------------------------
Tag:     Crawling
Visible: Yes
Purpose: Resume crawling from a previously stopped state.

Request Body: None

What it does:
   1. Checks if a crawl is already running -> "already_running".
   2. Reads PostgreSQL crawl_control for "stopped" state + URL.
   3. Loads session data (sessions.json -> crawl_state.json -> DB fallback).
   4. Creates a new CrawlJob and starts a background thread.
   5. Engine enters resume mode: restores URLQueue + pre-loads products.
   6. Updates crawl_control state to "crawling".

Response Model: CrawlControlResponse
   { status, message, job_id, url }
   status values: "resuming" | "already_running" | "still_stopping" |
                  "not_stopped" | "no_session_data"


--------------------------------------------------------------------------------
GET /crawl/sessions
--------------------------------------------------------------------------------
Tag:     Crawling
Visible: Yes
Purpose: List all saved crawl sessions (paused/stopped crawls available
          for resume).

Returns: List of session objects with URL, job_id, product count, saved_at.


--------------------------------------------------------------------------------
GET /crawl/status
--------------------------------------------------------------------------------
Tag:     Crawling
Visible: Yes
Purpose: Return live crawl status. Poll this endpoint for progress updates.

Returns state in priority order:
   1. RUNNING job   -> { status: "crawling", job_id, url, pages_visited,
                         products_scraped, current_url, elapsed_seconds }
   2. STOPPING      -> { status: "stopping", job_id, url, ... }
   3. Paused session -> { status: "paused", url, products_count, saved_at }
   4. COMPLETED job -> { status: "completed", job_id, url, pages_visited,
                         products_scraped, elapsed_seconds }
   5. Nothing       -> { status: "idle" }


================================================================================
2. DOWNLOADS API
================================================================================

--------------------------------------------------------------------------------
GET /download
--------------------------------------------------------------------------------
Tag:     Downloads
Visible: Yes
Purpose: Fetch scraped products from PostgreSQL and return as a
          downloadable file.

Query Parameters:
   - name    (optional) — The name field from crawl_jobs.
   - job_id  (optional) — Job ID created during crawling.
   - type    (optional) — Output format: "csv" (default) | "json" | "jsonl"

Validation:
   - At least ONE of (name, job_id) must be provided.
   - If neither is given -> HTTP 422.
   - If database is disabled -> HTTP 503.

What it does:
   1. Queries crawl_jobs by name and/or job_id.
   2. Fetches all linked products from crawl_products ordered by idx.
   3. Converts to requested format and returns as file download.

Response: File download with Content-Disposition header.
   - CSV   -> media_type: text/csv
   - JSON  -> media_type: application/json
   - JSONL -> media_type: application/x-ndjson


================================================================================
3. JOBS APIs
================================================================================


--------------------------------------------------------------------------------
GET /jobs/user/{user_id}
--------------------------------------------------------------------------------
Tag:     Jobs
Visible: Yes
Purpose: List all crawl jobs for a specific user, newest first.

Path Parameter:
   - user_id (required) — User identifier (e.g. "dp").

Returns:
   {
     "user_id": "dp",
     "jobs": [ { same fields as GET /jobs } ]
   }

Example: GET /jobs/user/dp


--------------------------------------------------------------------------------
GET /jobs/{job_id}
--------------------------------------------------------------------------------
Tag:     Jobs
Visible: Yes
Purpose: Get live status of a specific crawl job from in-memory JobManager.
          When status=completed, includes all scraped products.

Path Parameter:
   - job_id (required) — Unique job identifier.

Response Model: JobResponse
   { job_id, url, status, elapsed_seconds, stats, error, output_file, products }

Notes:
   - Reads from in-memory JobManager (not PostgreSQL).
   - Lost on server restart. Use GET /jobs for persistent DB records.


--------------------------------------------------------------------------------
POST /jobs/products
--------------------------------------------------------------------------------
Tag:     Jobs
Visible: Yes
Purpose: Fetch all scraped products for a specific job with pagination.

Request Body (JSON):
   {
     "job_id":    (required) — The job identifier.
     "page":      (optional) — Page number, 1-based (default: 1).
     "page_size": (optional) — Products per page, max 500 (default: 50).
   }

Response:
   {
     "job_id", "name", "source_url", "status",
     "total_products", "page", "page_size", "total_pages",
     "products": [ { product fields... } ]
   }

Error Responses:
   - 503: Database not enabled
   - 404: Job not found


--------------------------------------------------------------------------------
DELETE /jobs/products
--------------------------------------------------------------------------------
Tag:     Jobs
Visible: Yes
Purpose: Delete selected product rows from a job (by index).

Request Body (JSON):
   {
     "job_id":  (required) — The job identifier.
     "indexes": (required) — List of product idx values to delete.
                             (idx values come from POST /jobs/products response)
   }

What it does:
   1. Looks up the job in crawl_jobs.
   2. Deletes matching rows from crawl_products by source_id + idx.
   3. Decrements product_output count on the parent job.

Response:
   {
     "job_id":  "abc123",
     "deleted": 4,
     "message": "Successfully deleted 4 product(s)."
   }

Error Responses:
   - 422: indexes list is empty
   - 503: Database not enabled
   - 404: No matching products found


--------------------------------------------------------------------------------
DELETE /jobs/{job_id}
--------------------------------------------------------------------------------
Tag:     Jobs
Visible: Yes
Purpose: Permanently delete a job and ALL its associated products from
          the database.

Path Parameter:
   - job_id (required) — The job identifier to delete.

What it does:
   1. If the job is currently RUNNING -> cancels it first.
   2. Deletes all linked rows from crawl_products.
   3. Deletes the job row from crawl_jobs.

Response:
   {
     "job_id":           "abc123",
     "jobs_deleted":     1,
     "products_deleted": 320,
     "message":          "Job and 320 product(s) permanently deleted."
   }

Error Responses:
   - 404: Job not found in database


================================================================================
4. SYSTEM APIs
================================================================================

--------------------------------------------------------------------------------
GET /health
--------------------------------------------------------------------------------
Tag:     System
Visible: Yes
Purpose: Liveness probe.

Returns: { "status": "ok" }


--------------------------------------------------------------------------------
GET /debug/test-db
--------------------------------------------------------------------------------
Tag:     System
Visible: Yes
Purpose: Test PostgreSQL connectivity and return connection status.

Returns: { "status": "ok" | "error", "detail": "..." }




================================================================================
STATE MANAGEMENT
================================================================================

Crawl state is managed at THREE levels:

1. IN-MEMORY (JobManager)
    - Tracks: PENDING -> RUNNING -> COMPLETED / CANCELLED / FAILED
    - Cancellation via asyncio.Event
    - Lost on server restart

2. LOCAL FILES
    - sessions.json            — URL-keyed paused sessions
    - crawl_state.json         — Latest single paused state
    - checkpoints/{id}_queue.json — URLQueue snapshot (seen + pending URLs)
    - Survives server restarts, lost on disk wipe

3. POSTGRESQL (crawl_control table)
    - Single row: { status, job_id, url, updated_at }
    - State transitions:
        idle     -> crawling  (on crawl start)
        crawling -> stopped   (on /crawl/control/stop)
        stopped  -> crawling  (on /crawl/control/continue)
        crawling -> idle      (on natural completion or error)
    - Survives server restarts and disk loss


================================================================================
API ENDPOINT SUMMARY TABLE
================================================================================

Method   Path                      Tag        Purpose
------   ----                      ---        -------
POST     /crawl                    Crawling   Start background crawl, returns job_id
POST     /crawl/extend             Crawling   Extend completed crawl in background
POST     /crawl/control/stop       Crawling   Stop running crawl + persist state
POST     /crawl/control/continue   Crawling   Resume stopped crawl
GET      /crawl/status             Crawling   Live crawl progress (poll this)
GET      /crawl/sessions           Crawling   List saved sessions
GET      /download                 Downloads  Download products as CSV/JSON/JSONL
GET      /jobs/user/{user_id}      Jobs       List all jobs for a user
GET      /jobs/{job_id}            Jobs       Get job status
POST     /jobs/products            Jobs       Fetch products with pagination
DELETE   /jobs/products            Jobs       Delete selected product rows
DELETE   /jobs/{job_id}            Jobs       Delete job + all its products
GET      /health                   System     Liveness probe
GET      /debug/test-db            System     Test DB connection

================================================================================
 