import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { PageLoader } from '../components/ui/Spinner'
import {
  ArrowLeft,
  Download,
  Search,
  Columns,
  CheckCircle2,
  XCircle,
  Hash,
  PencilLine,
  LayoutGrid,
  Table2,
} from 'lucide-react'
import ExcelGrid from '../components/ui/ExcelGrid'
import type { GridRow } from '../components/ui/ExcelGrid'
import ShopifyGridView from '../components/migration/ShopifyGridView'
import ShopifyCsvView from '../components/migration/ShopifyCsvView'
import { migrationApi } from '../services/api'
import { toast } from 'sonner'
import type { MigrationJob, FailedRow } from '../types'
import { SHOPIFY_GRID_KEY, SHOPIFY_CSV_KEY } from './Settings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type FilterTab = 'all' | 'correct' | 'failed'

/** Stringify a single value for a CSV cell */
function csvCell(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (Array.isArray(val))
    return val.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ')
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

/**
 * Flatten one level of nested plain objects into dot-style keys.
 * e.g. { seo: { title: "X", description: "Y" } } → { seo_title: "X", seo_description: "Y" }
 * Arrays (like tags, variants, images) are left as-is for downstream handling.
 */
function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        out[`${k}_${sk}`] = sv
      }
    } else {
      out[k] = v
    }
  }
  return out
}

/**
 * If a record has a `variants` field that is a non-empty array of objects,
 * expand it into one record per variant — parent fields are merged into each variant.
 * Records without a variants array pass through unchanged.
 */
function expandVariants(record: Record<string, unknown>): Record<string, unknown>[] {
  const variants = record.variants
  if (
    Array.isArray(variants) &&
    variants.length > 0 &&
    typeof variants[0] === 'object' &&
    variants[0] !== null
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { variants: _v, ...parent } = record
    return variants.map((v) => {
      const variant = v as Record<string, unknown>
      const prefixed: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(variant)) {
        prefixed[k in parent ? `variant_${k}` : k] = val
      }
      return { ...parent, ...prefixed }
    })
  }
  return [record]
}

/**
 * Convert an array of raw data objects into uniform CSV rows.
 * - Expands `variants` arrays into separate rows first
 * - Collects ALL unique keys across every record (CSV headers)
 * - Stringifies every value (numbers, booleans, nested objects, arrays)
 * - Fills missing keys with '' so every row has exactly the same columns
 */
function toCSVRows(records: Record<string, unknown>[]): Record<string, string>[] {
  if (records.length === 0) return []

  // Expand variant arrays into separate rows, then flatten nested objects
  const flat = records.flatMap(expandVariants).map(flattenRecord)

  // Collect ordered union of all keys
  const headers = Array.from(new Set(flat.flatMap((r) => Object.keys(r))))

  return flat.map((record) => {
    const row: Record<string, string> = {}
    for (const h of headers) {
      row[h] = csvCell(record[h])
    }
    return row
  })
}

/**
 * Extract image array from a data record.
 * Returns sorted array of {src, alt, position} objects.
 */
function extractImages(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = data.images
  if (!Array.isArray(raw)) return []
  const imgs = raw as Array<Record<string, unknown>>
  return [...imgs].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
}

/**
 * Map a validation error loc string to the actual column key in the grid row.
 * Examples:
 *   "images[0].src"       → "image_src"
 *   "images[0].alt"       → "image_alt_text"
 *   "images[0].position"  → "image_position"
 *   "variants[0].price"   → "price"
 *   "variants[0].sku"     → "sku"
 *   "title"               → "title"
 */
function locToCol(loc: string, availableCols: string[]): string | null {
  // Strip array index: "images[0].src" → "images.src"
  const normalised = loc.replace(/\[\d+\]/g, '')

  // Known mappings for nested paths
  const MAP: Record<string, string> = {
    'images.src':              'image_src',
    'images.alt':              'image_alt_text',
    'images.position':         'image_position',
    'variants.price':          'price',
    'variants.compare_at_price': 'compare_at_price',
    'variants.sku':            'sku',
    'variants.barcode':        'barcode',
    'variants.weight':         'variant_weight',
    'variants.inventory_quantity': 'inventory_quantity',
    'variants.option1':        'option1_value',
    'variants.option2':        'option2_value',
    'variants.option3':        'option3_value',
    'seo.title':               'seo_title',
    'seo.description':         'seo_description',
  }

  if (MAP[normalised]) return MAP[normalised]

  // Fallback: take last segment of dot path and find matching col
  const last = normalised.split('.').pop() ?? normalised
  return availableCols.find((c) => c === last || c.replace(/-/g, '_') === last) ?? null
}

function rowsToGridRows(rows: FailedRow[]): GridRow[] {
  if (rows.length === 0) return []

  // Step 1: Expand variants per FailedRow — each variant becomes its own record
  // keeping the images array on each (images belong to the product, same for all variants)
  const expanded: Array<{ row: FailedRow; data: Record<string, unknown>; imgIndex: number; isImageOnly: boolean }> = []

  for (const row of rows) {
    const p = row.originalData
    const variantRecords = expandVariants(p).map(flattenRecord)
    const images = extractImages(p)
    const numRows = Math.max(variantRecords.length, images.length, 1)

    for (let i = 0; i < numRows; i++) {
      const variantData = variantRecords[i] ?? variantRecords[0] ?? {}
      const img = images[i] ?? null
      const isImageOnly = i >= variantRecords.length  // more images than variants

      // Build the merged record for this row
      const merged: Record<string, unknown> = isImageOnly
        ? { handle: p.handle ?? p['Handle'] ?? '' }  // image-only row: just handle
        : { ...variantData }

      // Attach image fields for this row's paired image
      merged['image_src']      = img ? String(img.src      ?? img['Image Src']      ?? '') : ''
      merged['image_position'] = img ? String(img.position ?? img['Image Position'] ?? '') : ''
      merged['image_alt']      = img ? String(img.alt      ?? img['Image Alt Text'] ?? '') : ''

      // Keep full images array on every row so grid/card views can collect all product images
      merged['images'] = p.images ?? []

      expanded.push({ row, data: merged, imgIndex: i, isImageOnly })
    }
  }

  // Step 2: Collect all keys and stringify values uniformly
  const allKeys = Array.from(new Set(expanded.flatMap((e) => Object.keys(e.data))))
  const csvRows: Record<string, string>[] = expanded.map(({ data }) => {
    const r: Record<string, string> = {}
    for (const k of allKeys) r[k] = csvCell(data[k])
    return r
  })

  // Step 3: Build GridRows
  return expanded.map(({ row, isImageOnly }, idx) => {
    const isFailed = row.status !== 'resolved'
    const dataRecord = csvRows[idx]

    const errorFields: string[] = []
    const cellWarnings: Record<string, string> = {}
    const cellSeverity: Record<string, 'error' | 'warning'> = {}

    // Only flag errors on real variant rows, not image-only rows
    if (isFailed && !isImageOnly) {
      const baseMsg = row.errorMessage?.trim()

      for (const [col, v] of Object.entries(dataRecord)) {
        if (v === '' || v === null || v === undefined) {
          errorFields.push(col)
          cellSeverity[col] = 'warning'
          cellWarnings[col] = `"${col.replace(/_/g, ' ')}" is empty or missing`
        }
      }

      if (baseMsg) {
        for (const col of Object.keys(dataRecord)) {
          if (baseMsg.toLowerCase().includes(col.replace(/_/g, ' '))) {
            cellWarnings[col] = baseMsg
            cellSeverity[col] = 'error'
            if (!errorFields.includes(col)) errorFields.push(col)
          }
        }
      }

      for (const ve of row.validationErrors) {
        // Map loc like "images[0].src" → grid column key
        const raw = (ve.loc || ve.field)
        const col = locToCol(raw, Object.keys(dataRecord))
        const cols = col ? [col] : [raw.replace(/\./g, '_')]
        for (const c of cols) {
          cellWarnings[c] = ve.msg || cellWarnings[c] || `"${c.replace(/_/g, ' ')}" has an issue`
          cellSeverity[c] = ve.severity
          if (!errorFields.includes(c)) errorFields.push(c)
        }
      }
    }

    return {
      id: `${row.id}_${idx}`,
      rowIndex: idx + 1,
      status: row.status === 'resolved' ? 'correct' as const : 'failed' as const,
      confidenceScore: row.confidenceScore,
      data: dataRecord,
      errorFields: errorFields.length > 0 ? errorFields : undefined,
      cellWarnings: Object.keys(cellWarnings).length > 0 ? cellWarnings : undefined,
      cellSeverity: Object.keys(cellSeverity).length > 0 ? cellSeverity : undefined,
    }
  })
}

function rawRecordsToGridRows(records: Record<string, unknown>[]): GridRow[] {
  if (records.length === 0) return []
  // toCSVRows already calls expandVariants internally
  const csvRows = toCSVRows(records)
  return csvRows.map((data, idx) => ({
    id: `raw_${idx}`,
    rowIndex: idx + 1,
    status: 'failed' as const,
    confidenceScore: 0,
    data,
  }))
}

// ---------------------------------------------------------------------------
// Shopify CSV export
// ---------------------------------------------------------------------------
// Column order matches the official Shopify product CSV template exactly.
const SHOPIFY_HEADERS = [
  'Handle', 'Command', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Tags Command', 'Published',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
  'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
  'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
  'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
  'Image Src', 'Image Position', 'Image Alt Text',
  'SEO Title', 'SEO Description',
  'Variant Image', 'Variant Weight Unit', 'Variant Country of Origin',
  'Status',
]

function shopifyBool(val: unknown): string {
  if (val === true || val === 'true' || val === 1 || val === '1') return 'TRUE'
  if (val === false || val === 'false' || val === 0 || val === '0') return 'FALSE'
  return ''
}

function toGrams(weight: unknown, unit: unknown): string {
  const w = Number(weight)
  if (isNaN(w)) return ''
  const u = String(unit ?? 'g').toLowerCase()
  const grams = u === 'kg' ? w * 1000 : u === 'lb' ? w * 453.592 : u === 'oz' ? w * 28.3495 : w
  return String(Math.round(grams))
}

function shopifyEscape(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  return s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes('\t')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function exportToShopifyCSV(rawRows: FailedRow[]) {
  const lines: string[][] = []

  for (const row of rawRows) {
    const p = row.originalData as Record<string, unknown>

    // Support both cleaned_data/final_result (snake_case) and original_data (Shopify CSV capitalized keys)
    const handle       = String(p.handle       ?? p['Handle']       ?? '')
    const command      = String(p.command      ?? p['Command']      ?? 'NEW')
    const title        = String(p.title        ?? p['Title']        ?? '')
    const bodyHtml     = String(p.body_html    ?? p['Body (HTML)']  ?? '')
    const vendor       = String(p.vendor       ?? p['Vendor']       ?? '')
    const prodCategory = String(p.category     ?? p['Product Category'] ?? p.product_type ?? p['Type'] ?? '')
    const prodType     = String(p.product_type ?? p['Type']         ?? '')
    const rawTags      = p.tags ?? p['Tags']
    const tags         = Array.isArray(rawTags) ? (rawTags as unknown[]).join(', ') : String(rawTags ?? '')
    const tagsCommand  = String(p.tags_command ?? p['Tags Command'] ?? 'REPLACE')
    const published    = shopifyBool((p.status as string) === 'active' || p.published || p['Published'])
    const status       = String(p.status ?? p['Status'] ?? '')
    const seo          = (p.seo as Record<string, unknown>) ?? {}
    const seoTitle     = String(seo.title ?? p['SEO Title'] ?? '')
    const seoDesc      = String(seo.description ?? p['SEO Description'] ?? '')

    const options  = Array.isArray(p.options)  ? p.options  as Array<Record<string, unknown>> : []
    const variants = Array.isArray(p.variants) && (p.variants as unknown[]).length > 0
      ? p.variants as Array<Record<string, unknown>>
      : [{}]
    const images   = Array.isArray(p.images)   ? p.images   as Array<Record<string, unknown>> : []

    // Option names come from the options[].name array; fall back to original_data Option1/2/3 Name columns
    const opt1Name = String(options[0]?.name ?? p['Option1 Name'] ?? '')
    const opt2Name = String(options[1]?.name ?? p['Option2 Name'] ?? '')
    const opt3Name = String(options[2]?.name ?? p['Option3 Name'] ?? '')

    const numRows = Math.max(variants.length, images.length, 1)

    for (let i = 0; i < numRows; i++) {
      const v     = variants[i] ?? {}
      const img   = images[i]  ?? {}
      const first = i === 0

      lines.push([
        handle,
        command,
        first ? title        : '',
        first ? bodyHtml     : '',
        first ? vendor       : '',
        first ? prodCategory : '',
        first ? prodType     : '',
        first ? tags         : '',
        first ? tagsCommand  : '',
        first ? published    : '',
        first ? opt1Name     : '',  String(v.option1 ?? ''),
        first ? opt2Name     : '',  String(v.option2 ?? ''),
        first ? opt3Name     : '',  String(v.option3 ?? ''),
        String(v.sku ?? ''),
        toGrams(v.weight, v.weight_unit),
        String(v.inventory_management ?? ''),
        String(v.inventory_quantity ?? ''),
        String(v.inventory_policy ?? ''),
        String(v.fulfillment_service ?? ''),
        String(v.price ?? ''),
        String(v.compare_at_price ?? ''),
        shopifyBool(v.requires_shipping),
        shopifyBool(v.taxable),
        String(v.barcode ?? v.upc ?? v.ean ?? ''),
        String(img.src ?? img.url ?? img['Image Src'] ?? ''),
        String(img.position ?? img['Image Position'] ?? ''),
        String(img.alt ?? img['Image Alt Text'] ?? ''),
        first ? seoTitle : '',
        first ? seoDesc  : '',
        String(v.variant_image ?? v.image ?? v['Variant Image'] ?? ''),
        String(v.weight_unit ?? ''),
        String(v.country_of_origin ?? v.origin_country ?? p.country_of_origin ?? ''),
        first ? status   : '',
      ])
    }
  }

  const header = SHOPIFY_HEADERS.map(shopifyEscape).join(',')
  const body   = lines.map((r) => r.map(shopifyEscape).join(',')).join('\r\n')
  const blob   = new Blob(['\uFEFF' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href = url
  a.setAttribute('download', 'shopify_products.csv')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ResultsGrid() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const pageRef = usePageAnimation()

  const [job, setJob] = useState<MigrationJob | null>(null)
  const [rows, setRows] = useState<GridRow[]>([])
  const [rawRows, setRawRows] = useState<FailedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoading, setRowsLoading] = useState(false)

  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editedCount, setEditedCount] = useState(0)
  const [showColMenu, setShowColMenu] = useState(false)
  // null = show all; populated only when user explicitly hides a column
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())

  // View mode — enabled via Settings → Migration Defaults toggles
  const shopifyGridEnabled = localStorage.getItem(SHOPIFY_GRID_KEY) === 'true'
  const shopifyCsvEnabled  = localStorage.getItem(SHOPIFY_CSV_KEY)  === 'true'
  const [viewMode, setViewMode] = useState<'table' | 'shopify' | 'csv'>('table')

  // Load job metadata once on mount
  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    migrationApi.getJob(jobId)
      .then(setJob)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [jobId])

  // Re-fetch rows from API whenever the filter tab changes
  useEffect(() => {
    if (!jobId) return
    setRowsLoading(true)
    const status = filterTab === 'all' ? undefined : filterTab
    Promise.all([
      migrationApi.getRows(jobId, { status, skip: 0,   limit: 500 }),
      migrationApi.getRows(jobId, { status, skip: 500, limit: 500 }),
    ])
      .then(([p1, p2]) => {
        const fetchedRows = [...p1, ...p2]
        setRawRows(fetchedRows)
        let gridRows = rowsToGridRows(fetchedRows)
        // Fallback only on 'all' tab: use raw_records from job doc if API returned nothing
        if (gridRows.length === 0 && filterTab === 'all') {
          setJob((prev) => {
            if (!prev) return prev
            const jobRaw = prev as unknown as Record<string, unknown>
            const rawRecords = Array.isArray(jobRaw.raw_records)
              ? (jobRaw.raw_records as Record<string, unknown>[])
              : []
            gridRows = rawRecordsToGridRows(rawRecords)
            return prev
          })
        }
        setRows(gridRows)
      })
      .catch(console.error)
      .finally(() => setRowsLoading(false))
  }, [jobId, filterTab])

  // Debounce search — filter only fires 150ms after the user stops typing
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(id)
  }, [search])

  // All possible data columns derived from loaded rows
  const allDataCols = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      for (const k of Object.keys(row.data)) set.add(k)
    }
    return Array.from(set)
  }, [rows])

  // A column is visible unless the user explicitly hid it
  const visibleCols = useMemo(
    () => new Set(allDataCols.filter((c) => !hiddenCols.has(c))),
    [allDataCols, hiddenCols]
  )

  function toggleCol(col: string) {
    setHiddenCols((prev) => {
      const next = new Set(prev)
      if (next.has(col)) {
        next.delete(col)           // un-hide
      } else {
        if (visibleCols.size === 1) return prev  // keep at least 1
        next.add(col)              // hide
      }
      return next
    })
  }

  // Apply search + column visibility (tab filtering is now handled by the API)
  const filteredRows = useMemo(() => {
    let base = rows

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase()
      base = base.filter((row) =>
        Object.values(row.data).some((v) => v.toLowerCase().includes(q))
      )
    }

    // Only strip hidden columns — when nothing is hidden, data passes through intact
    if (hiddenCols.size === 0) return base

    return base.map((row) => ({
      ...row,
      data: Object.fromEntries(
        Object.entries(row.data).filter(([k]) => !hiddenCols.has(k))
      ),
    }))
  }, [filterTab, debouncedSearch, hiddenCols, rows])

  const correctCount = job?.correctRows ?? 0
  const failedCount  = job?.failedRows  ?? 0

  const pageTitle = job?.name || 'Migration Results'

  const [showExportModal, setShowExportModal] = useState(false)
  const exportBtnRef = useRef<HTMLButtonElement>(null)

  function handleExport(type: 'all' | 'correct' | 'failed') {
    const filtered = type === 'all'
      ? rawRows
      : rawRows.filter((r) => {
          const status = r.status === 'resolved' ? 'correct' : 'failed'
          return status === type
        })
    exportToShopifyCSV(filtered)
    setShowExportModal(false)
    toast.success(`Exported ${filtered.length} row${filtered.length !== 1 ? 's' : ''} as CSV`)
  }

  async function handleRetryRow(rowId: string) {
    const tid = toast.loading('Retrying row…')
    try {
      await migrationApi.aiRetry(rowId)
      toast.success('Row queued for retry', { id: tid })
    } catch {
      toast.error('Failed to retry row', { id: tid })
    }
  }

  async function handleSave(edited: GridRow[]) {
    const calls = edited.map((row) => {
      const rowId = row.id.replace(/_\d+$/, '')
      if (rowId.startsWith('raw_')) return Promise.resolve()
      return migrationApi.correct(rowId, row.data as Record<string, unknown>)
    })
    const tid = toast.loading(`Saving ${edited.length} row${edited.length !== 1 ? 's' : ''}…`)
    try {
      const results = await Promise.allSettled(calls)
      const failed = results.filter((r) => r.status === 'rejected').length
      setRows((prev) =>
        prev.map((r) => {
          const match = edited.find((e) => e.id === r.id)
          return match ? { ...r, status: 'correct' as const, data: match.data } : r
        })
      )
      if (failed > 0) toast.warning(`Saved with ${failed} error${failed !== 1 ? 's' : ''}`, { id: tid })
      else toast.success(`${edited.length} row${edited.length !== 1 ? 's' : ''} saved`, { id: tid })
    } catch {
      toast.error('Failed to save changes', { id: tid })
    }
    setEditedCount(0)
  }

  if (loading) {
    return (
      <PageLoader label="Loading results…" />
    )
  }

  return (
    <div ref={pageRef} className="flex flex-col h-screen px-8 py-8 overflow-hidden">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-5 group w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Back
      </button>

      {/* Page header */}
      <div className="flex items-start justify-between mb-5 flex-shrink-0">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-0.5">
            Results Grid
          </p>
          <h1 className="text-3xl font-light tracking-tight text-black dark:text-white leading-tight">
            {pageTitle}
          </h1>
          {job && (
            <p className="text-sm text-slate-400 dark:text-slate-500 font-light mt-0.5">
              Job ID: {job.id} &middot; {job.type} migration &middot;{' '}
              {job.totalRows} total rows
            </p>
          )}
        </div>

        {/* Export Shopify CSV */}
        <div className="relative">
          <button
            ref={exportBtnRef}
            onClick={() => setShowExportModal((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium themed-card text-slate-700 dark:text-slate-200 hover:opacity-90 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export 
          </button>

          {showExportModal && (
            <>
              {/* Click-outside backdrop (invisible) */}
              <div className="fixed inset-0 z-40" onClick={() => setShowExportModal(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
                <button
                  onClick={() => handleExport('all')}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group border-b border-slate-100 dark:border-slate-800"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-200">All rows <span className="font-normal text-slate-400">({rawRows.length})</span></span>
                  <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                </button>
                <button
                  onClick={() => handleExport('correct')}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors text-left group border-b border-slate-100 dark:border-slate-800"
                >
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">Correct only <span className="font-normal text-emerald-600/60">({correctCount})</span></span>
                  <Download className="w-3.5 h-3.5 text-emerald-400 group-hover:text-emerald-600" />
                </button>
                <button
                  onClick={() => handleExport('failed')}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left group"
                >
                  <span className="font-medium text-rose-700 dark:text-rose-400">Failed only <span className="font-normal text-rose-600/60">({failedCount})</span></span>
                  <Download className="w-3.5 h-3.5 text-rose-400 group-hover:text-rose-600" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <motion.div
        className="flex items-center gap-5 mb-5 flex-shrink-0"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Hash className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-800 dark:text-slate-200">{job?.totalRows ?? rows.length}</span>
          <span className="dark:text-slate-400">total rows</span>
        </div>
        <span className="text-slate-200 dark:text-slate-700">|</span>
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span className="font-semibold">{correctCount}</span>
          correct
        </div>
        <span className="text-slate-200 dark:text-slate-700">|</span>
        <div className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400">
          <XCircle className="w-3.5 h-3.5 text-rose-500" />
          <span className="font-semibold">{failedCount}</span>
          failed
        </div>
        {editedCount > 0 && (
          <>
            <span className="text-slate-200 dark:text-slate-700">|</span>
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <PencilLine className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-semibold">{editedCount}</span>
              edited
            </div>
          </>
        )}
      </motion.div>

      {/* Toolbar: filter tabs + search + column toggle */}
      <motion.div
        className="flex items-center gap-3 mb-4 flex-shrink-0 flex-wrap"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Segmented filter tabs */}
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5">
          {(
            [
              { key: 'all',     label: 'All',     count: job?.totalRows  ?? rows.length },
              { key: 'correct', label: 'Correct', count: correctCount },
              { key: 'failed',  label: 'Failed',  count: failedCount },
            ] as { key: FilterTab; label: string; count: number }[]
          ).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilterTab(key)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150',
                filterTab === key
                  ? 'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              ].join(' ')}
            >
              {label}{' '}
              <span
                className={`ml-0.5 ${filterTab === key ? 'text-slate-500' : 'text-slate-400'}`}
              >
                ({count})
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rows…"
            className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-600 transition-colors"
          />
        </div>

        {/* Column visibility toggle — only in table mode */}
        {viewMode === 'table' && (
          <div className="relative">
            <button
              onClick={() => setShowColMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Columns className="w-3.5 h-3.5" />
              Columns
              <span className="text-slate-400">
                ({allDataCols.length - hiddenCols.size}/{allDataCols.length})
              </span>
            </button>

            {showColMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowColMenu(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-2 min-w-[160px]">
                  {allDataCols.map((col) => (
                    <label
                      key={col}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs text-slate-700 dark:text-slate-300 select-none"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(col)}
                        onChange={() => toggleCol(col)}
                        className="accent-blue-500 w-3 h-3"
                      />
                      <span className="font-mono">{col}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* View mode switcher — shown when at least one alternate view is enabled in Settings */}
        {(shopifyGridEnabled || shopifyCsvEnabled) && (
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5 ml-auto">
            {(['table', ...(shopifyGridEnabled ? ['shopify'] : []), ...(shopifyCsvEnabled ? ['csv'] : [])] as ('table' | 'shopify' | 'csv')[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150',
                  viewMode === mode
                    ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300',
                ].join(' ')}
              >
                {mode === 'table'   && <Table2     className="w-3.5 h-3.5" />}
                {mode === 'shopify' && <LayoutGrid className="w-3.5 h-3.5" />}
                {mode === 'csv'     && <Download   className="w-3.5 h-3.5" />}
                {mode === 'table'   ? 'Table' : mode === 'shopify' ? 'Shopify View' : 'CSV Preview'}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Grid — fills remaining vertical space */}
      <motion.div
        className="flex-1 min-h-0 flex flex-col"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {rowsLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 gap-3">
            <span className="w-7 h-7 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-700 dark:border-t-slate-300 animate-spin" />
            <p className="text-xs text-slate-400 dark:text-slate-500">Loading rows…</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center gap-3">
            <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                No results for <span className="text-slate-800 dark:text-slate-200">&ldquo;{debouncedSearch}&rdquo;</span>
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Try a different keyword or clear the search
              </p>
            </div>
            <button
              onClick={() => setSearch('')}
              className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Clear search
            </button>
          </div>
        ) : viewMode === 'shopify' ? (
          <ShopifyGridView rows={filteredRows} />
        ) : viewMode === 'csv' ? (
          <ShopifyCsvView rows={filteredRows} />
        ) : (
          <ExcelGrid
            rows={filteredRows}
            onRetryRow={handleRetryRow}
            onSave={(edited) => {
              setEditedCount(0)
              handleSave(edited)
            }}
          />
        )}
      </motion.div>

    </div>
  )
}
