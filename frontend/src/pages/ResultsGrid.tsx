import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import {
  ArrowLeft,
  Download,
  Search,
  Columns,
  CheckCircle2,
  XCircle,
  Hash,
  PencilLine,
} from 'lucide-react'
import ExcelGrid from '../components/ui/ExcelGrid'
import type { GridRow } from '../components/ui/ExcelGrid'
import { migrationApi } from '../services/api'
import type { MigrationJob, FailedRow } from '../types'

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

function rowsToGridRows(rows: FailedRow[]): GridRow[] {
  if (rows.length === 0) return []

  // Expand variants: one FailedRow may produce multiple GridRows
  const expanded: Array<{ row: FailedRow; data: Record<string, unknown> }> = []
  for (const row of rows) {
    for (const data of expandVariants(row.originalData).map(flattenRecord)) {
      expanded.push({ row, data })
    }
  }

  const csvRows = toCSVRows(expanded.map((p) => p.data))

  return expanded.map(({ row }, idx) => {
    const isFailed = row.status !== 'resolved'
    const dataRecord = csvRows[idx]

    // Detect error fields and severity
    const errorFields: string[] = []
    const cellWarnings: Record<string, string> = {}
    const cellSeverity: Record<string, 'error' | 'warning'> = {}

    if (isFailed) {
      const baseMsg = row.errorMessage?.trim()

      // Empty/blank cells → warning severity
      for (const [col, v] of Object.entries(dataRecord)) {
        if (v === '' || v === null || v === undefined) {
          errorFields.push(col)
          cellSeverity[col] = 'warning'
          cellWarnings[col] = `"${col.replace(/_/g, ' ')}" is empty or missing`
        }
      }

      // Fields explicitly mentioned in errorMessage → error severity (overrides warning)
      if (baseMsg) {
        for (const col of Object.keys(dataRecord)) {
          if (baseMsg.toLowerCase().includes(col.replace(/_/g, ' '))) {
            cellWarnings[col] = baseMsg
            cellSeverity[col] = 'error'
            if (!errorFields.includes(col)) errorFields.push(col)
          }
        }
      }

      // Backend field_errors / validation_errors — use severity from backend if present
      const rawRow = row as unknown as Record<string, unknown>
      const fieldErrors = (rawRow.field_errors ?? rawRow.validation_errors) as
        | Record<string, { message?: string; severity?: string } | string>
        | undefined
      if (fieldErrors) {
        for (const [col, info] of Object.entries(fieldErrors)) {
          const msg    = typeof info === 'string' ? info : (info.message ?? '')
          const sev    = typeof info === 'string' ? 'error' : ((info.severity === 'warning' ? 'warning' : 'error') as 'error' | 'warning')
          cellWarnings[col] = msg || cellWarnings[col] || `"${col.replace(/_/g, ' ')}" has an issue`
          cellSeverity[col] = sev
          if (!errorFields.includes(col)) errorFields.push(col)
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
const SHOPIFY_HEADERS = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
  'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
  'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
  'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Variant Weight Unit',
  'Image Src', 'Image Position', 'Image Alt Text', 'Variant Image',
  'SEO Title', 'SEO Description', 'Status',
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
  return s.includes('"') || s.includes(',') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function exportToShopifyCSV(rawRows: FailedRow[]) {
  const lines: string[][] = []

  for (const row of rawRows) {
    const p = row.originalData as Record<string, unknown>

    const handle       = String(p.handle ?? '')
    const title        = String(p.title ?? '')
    const bodyHtml     = String(p.body_html ?? '')
    const vendor       = String(p.vendor ?? '')
    const prodCategory = String(p.category ?? p.product_type ?? '')
    const prodType     = String(p.product_type ?? '')
    const tags         = Array.isArray(p.tags) ? (p.tags as unknown[]).join(', ') : String(p.tags ?? '')
    const published    = shopifyBool((p.status as string) === 'active' || p.published)
    const status       = String(p.status ?? '')
    const seo          = (p.seo as Record<string, unknown>) ?? {}
    const seoTitle     = String(seo.title ?? '')
    const seoDesc      = String(seo.description ?? '')

    const options  = Array.isArray(p.options)  ? p.options  as Array<Record<string, unknown>> : []
    const variants = Array.isArray(p.variants) && (p.variants as unknown[]).length > 0
      ? p.variants as Array<Record<string, unknown>>
      : [{}]
    const images   = Array.isArray(p.images)   ? p.images   as Array<Record<string, unknown>> : []

    const opt1Name = String(options[0]?.name ?? '')
    const opt2Name = String(options[1]?.name ?? '')
    const opt3Name = String(options[2]?.name ?? '')

    const numRows = Math.max(variants.length, images.length, 1)

    for (let i = 0; i < numRows; i++) {
      const v     = variants[i] ?? {}
      const img   = images[i]  ?? {}
      const first = i === 0

      lines.push([
        handle,
        first ? title        : '',
        first ? bodyHtml     : '',
        first ? vendor       : '',
        first ? prodCategory : '',
        first ? prodType     : '',
        first ? tags         : '',
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
        String(v.barcode ?? ''),
        String(v.weight_unit ?? ''),
        String(img.src ?? ''),
        String(img.position ?? ''),
        String(img.alt ?? ''),
        String(v.image ?? ''),
        first ? seoTitle : '',
        first ? seoDesc  : '',
        first ? status   : '',
      ])
    }
  }

  const header = SHOPIFY_HEADERS.map(shopifyEscape).join(',')
  const body   = lines.map((r) => r.map(shopifyEscape).join(',')).join('\n')
  const blob   = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
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

  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [editedCount, setEditedCount] = useState(0)
  const [showColMenu, setShowColMenu] = useState(false)
  // null = show all; populated only when user explicitly hides a column
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    Promise.all([
      migrationApi.getJob(jobId),
      // Backend max is 500 per request — fetch two pages to get ~1000 rows
      Promise.all([
        migrationApi.getRows(jobId, { skip: 0,   limit: 500 }),
        migrationApi.getRows(jobId, { skip: 500, limit: 500 }),
      ]).then(([p1, p2]) => [...p1, ...p2]),
    ])
      .then(([j, fetchedRows]) => {
        setJob(j)
        setRawRows(fetchedRows)

        let gridRows = rowsToGridRows(fetchedRows)

        // Fallback: if migration_rows is empty, use raw_records from the job doc
        if (gridRows.length === 0) {
          const jobRaw = j as unknown as Record<string, unknown>
          const rawRecords = Array.isArray(jobRaw.raw_records)
            ? (jobRaw.raw_records as Record<string, unknown>[])
            : []
          gridRows = rawRecordsToGridRows(rawRecords)
        }

        setRows(gridRows)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [jobId])

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

  // Filter rows by tab + search, then apply column visibility
  const filteredRows = useMemo(() => {
    let base = rows
    if (filterTab === 'correct') base = base.filter((r) => r.status === 'correct')
    if (filterTab === 'failed')  base = base.filter((r) => r.status === 'failed')

    if (search.trim()) {
      const q = search.trim().toLowerCase()
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
  }, [filterTab, search, hiddenCols, rows])

  const correctCount = rows.filter((r) => r.status === 'correct').length
  const failedCount = rows.filter((r) => r.status === 'failed').length

  // Use the product title from the first row's data, fall back to job name
  const pageTitle = rows[0]?.data?.title || job?.name || 'Migration Results'

  const [showExportModal, setShowExportModal] = useState(false)

  function handleExport(type: 'all' | 'correct' | 'failed') {
    const filtered = type === 'all'
      ? rawRows
      : rawRows.filter((r) => {
          const status = r.status === 'resolved' ? 'correct' : 'failed'
          return status === type
        })
    exportToShopifyCSV(filtered)
    setShowExportModal(false)
  }

  async function handleSave(edited: GridRow[]) {
    // Grid row ids are "${backendRowId}_${variantIdx}" — strip the suffix to get the real id
    const calls = edited.map((row) => {
      const rowId = row.id.replace(/_\d+$/, '')
      // Skip rows without a real backend id (e.g. raw_0, raw_1 fallback rows)
      if (rowId.startsWith('raw_')) return Promise.resolve()
      return migrationApi.correct(rowId, row.data as Record<string, unknown>)
    })
    try {
      await Promise.allSettled(calls)
      // Mark saved rows as correct in local state
      setRows((prev) =>
        prev.map((r) => {
          const match = edited.find((e) => e.id === r.id)
          return match ? { ...r, status: 'correct' as const, data: match.data } : r
        })
      )
    } catch (err) {
      console.error('Save failed:', err)
    }
    setEditedCount(0)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading results…</p>
      </div>
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
        <button
          onClick={() => setShowExportModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium themed-card text-slate-700 dark:text-slate-200 hover:opacity-90 transition-all shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          Export Shopify CSV
        </button>
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
          <span className="font-semibold text-slate-800 dark:text-slate-200">{rows.length}</span>
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
              { key: 'all', label: 'All', count: rows.length },
              { key: 'correct', label: 'Correct ✅', count: correctCount },
              { key: 'failed', label: 'Failed ❌', count: failedCount },
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

        {/* Column visibility toggle */}
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
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowColMenu(false)}
              />
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
      </motion.div>

      {/* Grid — fills remaining vertical space */}
      <motion.div
        className="flex-1 min-h-0"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <ExcelGrid
          rows={filteredRows}
          onSave={(edited) => {
            setEditedCount(0)
            handleSave(edited)
          }}
        />
      </motion.div>

      {/* Export type modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setShowExportModal(false)}
          />
          <motion.div
            className="relative themed-card rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
              Export Shopify CSV
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
              Choose which rows to include in the export.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleExport('all')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">All rows</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{rawRows.length} total records</p>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
              </button>

              <button
                onClick={() => handleExport('correct')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors text-left group"
              >
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Correct rows only</p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70">{correctCount} records</p>
                </div>
                <Download className="w-4 h-4 text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors" />
              </button>

              <button
                onClick={() => handleExport('failed')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-800/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left group"
              >
                <div>
                  <p className="text-sm font-medium text-rose-700 dark:text-rose-400">Failed rows only</p>
                  <p className="text-xs text-rose-600/70 dark:text-rose-500/70">{failedCount} records</p>
                </div>
                <Download className="w-4 h-4 text-rose-400 group-hover:text-rose-600 dark:group-hover:text-rose-300 transition-colors" />
              </button>
            </div>

            <button
              onClick={() => setShowExportModal(false)}
              className="mt-4 w-full py-2 rounded-xl text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}
    </div>
  )
}
