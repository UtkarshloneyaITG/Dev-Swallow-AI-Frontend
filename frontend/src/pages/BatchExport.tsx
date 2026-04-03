import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePageAnimation } from '../hooks/usePageAnimation'
import { PageLoader } from '../components/ui/Spinner'
import {
  ArrowLeft, Download, CheckCircle2, XCircle, Layers,
  Search, Hash, Check, Table2, Eye, Merge, BookOpen,
  Plus, Trash2, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { migrationApi, mergedApi } from '../services/api'
import { toast } from 'sonner'
import type { MigrationJob, FailedRow, MergedJob } from '../types'
import ExcelGrid from '../components/ui/ExcelGrid'
import type { GridRow } from '../components/ui/ExcelGrid'
import ShopifyCsvView from '../components/migration/ShopifyCsvView'

// ── Row conversion helpers ────────────────────────────────────────────────────
function csvCell(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (Array.isArray(val))
    return val.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ')
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}
function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>))
        out[`${k}_${sk}`] = sv
    } else {
      out[k] = v
    }
  }
  return out
}
function expandVariants(record: Record<string, unknown>): Record<string, unknown>[] {
  const variants = record.variants
  if (Array.isArray(variants) && variants.length > 0 && typeof variants[0] === 'object' && variants[0] !== null) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { variants: _v, ...parent } = record
    return variants.map((v) => {
      const variant = v as Record<string, unknown>
      const prefixed: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(variant))
        prefixed[k in parent ? `variant_${k}` : k] = val
      return { ...parent, ...prefixed }
    })
  }
  return [record]
}
function extractImages(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = data.images
  if (!Array.isArray(raw)) return []
  return [...(raw as Array<Record<string, unknown>>)].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)
  )
}
export function convertToGridRows(rows: FailedRow[]): GridRow[] {
  if (rows.length === 0) return []
  const expanded: Array<{ row: FailedRow; data: Record<string, unknown>; isImageOnly: boolean }> = []
  for (const row of rows) {
    const p = row.originalData
    const variantRecs = expandVariants(p).map(flattenRecord)
    const images      = extractImages(p)
    const numRows     = Math.max(variantRecs.length, images.length, 1)
    for (let i = 0; i < numRows; i++) {
      const variantData = variantRecs[i] ?? variantRecs[0] ?? {}
      const img         = images[i] ?? null
      const isImageOnly = i >= variantRecs.length
      const merged: Record<string, unknown> = isImageOnly
        ? { handle: p.handle ?? p['Handle'] ?? '' }
        : { ...variantData }
      merged['image_src']      = img ? String(img.src      ?? img['Image Src']      ?? '') : ''
      merged['image_position'] = img ? String(img.position ?? img['Image Position'] ?? '') : ''
      merged['image_alt']      = img ? String(img.alt      ?? img['Image Alt Text'] ?? '') : ''
      merged['images']         = p.images ?? []
      expanded.push({ row, data: merged, isImageOnly })
    }
  }
  const allKeys = Array.from(new Set(expanded.flatMap((e) => Object.keys(e.data))))
  const csvRows: Record<string, string>[] = expanded.map(({ data }) => {
    const r: Record<string, string> = {}
    for (const k of allKeys) r[k] = csvCell(data[k])
    return r
  })
  return expanded.map(({ row, isImageOnly }, idx) => {
    const isFailed = row.status !== 'resolved'
    const dataRecord = csvRows[idx]
    const errorFields:  string[]                           = []
    const cellWarnings: Record<string, string>             = {}
    const cellSeverity: Record<string, 'error' | 'warning'> = {}
    if (isFailed && !isImageOnly) {
      for (const [col, v] of Object.entries(dataRecord)) {
        if (v === '') {
          errorFields.push(col)
          cellSeverity[col] = 'warning'
          cellWarnings[col] = `"${col.replace(/_/g, ' ')}" is empty or missing`
        }
      }
      for (const ve of row.validationErrors) {
        const col = (ve.loc || ve.field).replace(/\[\d+\]/g, '').replace(/\./g, '_')
        cellWarnings[col] = ve.msg || cellWarnings[col] || `"${col}" has an issue`
        cellSeverity[col] = ve.severity
        if (!errorFields.includes(col)) errorFields.push(col)
      }
    }
    return {
      id: `${row.id}_${idx}`, rowIndex: idx + 1,
      status: row.status === 'resolved' ? 'correct' as const : 'failed' as const,
      confidenceScore: row.confidenceScore,
      data: dataRecord,
      errorFields:  errorFields.length  > 0 ? errorFields  : undefined,
      cellWarnings: Object.keys(cellWarnings).length > 0 ? cellWarnings : undefined,
      cellSeverity: Object.keys(cellSeverity).length > 0 ? cellSeverity : undefined,
    }
  })
}

// ── Shopify CSV export ────────────────────────────────────────────────────────
const SHOPIFY_HEADERS = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
  'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
  'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
  'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
  'Image Src', 'Image Position', 'Image Alt Text', 'SEO Title', 'SEO Description',
  'Variant Image', 'Variant Weight Unit', 'Status',
]
function shopifyBool(val: unknown): string {
  if (val === true  || val === 'true'  || val === 1 || val === '1') return 'TRUE'
  if (val === false || val === 'false' || val === 0 || val === '0') return 'FALSE'
  return ''
}
function toGrams(weight: unknown, unit: unknown): string {
  const w = Number(weight); if (isNaN(w)) return ''
  const u = String(unit ?? 'g').toLowerCase()
  return String(Math.round(u === 'kg' ? w * 1000 : u === 'lb' ? w * 453.592 : u === 'oz' ? w * 28.3495 : w))
}
function shopifyEscape(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  return s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes('\t')
    ? `"${s.replace(/"/g, '""')}"` : s
}
export function exportToShopifyCSV(rawRows: FailedRow[], filename: string) {
  const lines: string[][] = []
  for (const row of rawRows) {
    const p = row.originalData as Record<string, unknown>
    const handle = String(p.handle ?? p['Handle'] ?? '')
    const title  = String(p.title  ?? p['Title']  ?? '')
    const bodyHtml = String(p.body_html ?? p['Body (HTML)'] ?? '')
    const vendor   = String(p.vendor    ?? p['Vendor']      ?? '')
    const prodCat  = String(p.category  ?? p['Product Category'] ?? p.product_type ?? p['Type'] ?? '')
    const prodType = String(p.product_type ?? p['Type'] ?? '')
    const rawTags  = p.tags ?? p['Tags']
    const tags     = Array.isArray(rawTags) ? (rawTags as unknown[]).join(', ') : String(rawTags ?? '')
    const published = shopifyBool((p.status as string) === 'active' || p.published || p['Published'])
    const status  = String(p.status ?? p['Status'] ?? '')
    const seo     = (p.seo as Record<string, unknown>) ?? {}
    const seoTitle = String(seo.title       ?? p['SEO Title']       ?? '')
    const seoDesc  = String(seo.description ?? p['SEO Description'] ?? '')
    const options  = Array.isArray(p.options)  ? p.options  as Array<Record<string, unknown>> : []
    const variants = Array.isArray(p.variants) && (p.variants as unknown[]).length > 0
      ? p.variants as Array<Record<string, unknown>> : [{}]
    const images   = Array.isArray(p.images)   ? p.images   as Array<Record<string, unknown>> : []
    const opt1Name = String(options[0]?.name ?? p['Option1 Name'] ?? '')
    const opt2Name = String(options[1]?.name ?? p['Option2 Name'] ?? '')
    const opt3Name = String(options[2]?.name ?? p['Option3 Name'] ?? '')
    for (let i = 0; i < Math.max(variants.length, images.length, 1); i++) {
      const v = variants[i] ?? {}, img = images[i] ?? {}, first = i === 0
      lines.push([
        handle,
        first ? title : '', first ? bodyHtml : '', first ? vendor : '',
        first ? prodCat : '', first ? prodType : '', first ? tags : '', first ? published : '',
        first ? opt1Name : '', String(v.option1 ?? ''),
        first ? opt2Name : '', String(v.option2 ?? ''),
        first ? opt3Name : '', String(v.option3 ?? ''),
        String(v.sku ?? ''), toGrams(v.weight, v.weight_unit),
        String(v.inventory_management ?? ''), String(v.inventory_quantity ?? ''),
        String(v.inventory_policy ?? ''), String(v.fulfillment_service ?? ''),
        String(v.price ?? ''), String(v.compare_at_price ?? ''),
        shopifyBool(v.requires_shipping), shopifyBool(v.taxable), String(v.barcode ?? ''),
        String(img.src ?? img['Image Src'] ?? ''),
        String(img.position ?? img['Image Position'] ?? ''),
        String(img.alt ?? img['Image Alt Text'] ?? ''),
        first ? seoTitle : '', first ? seoDesc : '',
        String(v.image ?? ''), String(v.weight_unit ?? ''), first ? status : '',
      ])
    }
  }
  const csv = SHOPIFY_HEADERS.map(shopifyEscape).join(',') + '\r\n'
    + lines.map((r) => r.map(shopifyEscape).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.setAttribute('download', filename)
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ── Fetch rows — first page reveals total, then fetches remaining pages in parallel
const BATCH_PAGE_SIZE = 500
async function fetchBatch(jobIds: string[], filter: 'all' | 'correct' | 'failed'): Promise<FailedRow[]> {
  // First call: get page 0 + discover total_rows
  const first = await migrationApi.batchRows(jobIds, filter, 0, BATCH_PAGE_SIZE)
  const total = first.totalRows

  // No additional pages needed
  if (total <= BATCH_PAGE_SIZE) return first.rows

  // Calculate remaining pages and fetch them in parallel
  const offsets: number[] = []
  for (let skip = BATCH_PAGE_SIZE; skip < total; skip += BATCH_PAGE_SIZE) {
    offsets.push(skip)
  }
  const rest = await Promise.all(
    offsets.map((skip) => migrationApi.batchRows(jobIds, filter, skip, BATCH_PAGE_SIZE))
  )
  return [first.rows, ...rest.map((p) => p.rows)].flat()
}

// ── Saved merge card ──────────────────────────────────────────────────────────
function MergedJobCard({
  merge, onDelete, onOpen,
}: {
  merge: MergedJob
  onDelete: (id: string) => void
  onOpen: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${merge.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await mergedApi.deleteJob(merge.id)
      onDelete(merge.id)
      toast.success(`"${merge.name}" deleted`)
    } catch {
      toast.error('Failed to delete merge')
    } finally { setDeleting(false) }
  }
  return (
    <div
      onClick={() => onOpen(merge.id)}
      className="flex items-center gap-4 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm cursor-pointer transition-all group"
    >
      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Merge className="w-4 h-4 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{merge.name}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {merge.sourceJobIds.length} source job{merge.sourceJobIds.length !== 1 ? 's' : ''}
          {' · '}{new Date(merge.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0 text-xs">
        <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
          <Hash className="w-3 h-3" />{merge.totalRows}
        </span>
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />{merge.correctRows}
        </span>
        <span className="flex items-center gap-1 text-rose-500 dark:text-rose-400">
          <XCircle className="w-3 h-3" />{merge.failedRows}
        </span>
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all disabled:opacity-40"
        title="Delete merge"
      >
        {deleting
          ? <span className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin block" />
          : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
type Tab     = 'new' | 'saved'
type NewStep = 'select' | 'preview'
type ViewMode = 'table' | 'csv'

export default function BatchExport() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const pageRef  = usePageAnimation()

  const [activeTab, setActiveTab] = useState<Tab>('new')

  // ── Source jobs ────────────────────────────────────────────────────────────
  const [jobs, setJobs]       = useState<MigrationJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [jobSearch, setJobSearch]     = useState('')

  // ── New Merge flow ─────────────────────────────────────────────────────────
  const [newStep, setNewStep]         = useState<NewStep>('select')
  const [merging, setMerging]         = useState(false)
  const [previewRows, setPreviewRows] = useState<GridRow[]>([])
  const [rawRows, setRawRows]         = useState<FailedRow[]>([])
  const [viewMode, setViewMode]       = useState<ViewMode>('table')
  const [exporting, setExporting]     = useState<'all' | 'correct' | 'failed' | null>(null)
  // Save-to-library dialog
  const [saveOpen, setSaveOpen]   = useState(false)
  const [saveName, setSaveName]   = useState('')
  const [saving, setSaving]       = useState(false)

  // ── Saved merges ───────────────────────────────────────────────────────────
  const [savedMerges, setSavedMerges]       = useState<MergedJob[]>([])
  const [loadingSaved, setLoadingSaved]     = useState(false)
  const [savedLoaded, setSavedLoaded]       = useState(false)

  useEffect(() => {
    if (!user) return
    migrationApi.listJobs(user.id)
      .then((all) => setJobs(all.filter((j) => j.status === 'completed')))
      .catch(() => toast.error('Failed to load completed jobs'))
      .finally(() => setLoadingJobs(false))
  }, [user])

  function loadSavedMerges() {
    setLoadingSaved(true)
    mergedApi.list()
      .then((list) => { setSavedMerges(list); setSavedLoaded(true) })
      .catch(() => toast.error('Failed to load saved merges'))
      .finally(() => setLoadingSaved(false))
  }

  useEffect(() => {
    if (activeTab === 'saved' && !savedLoaded) loadSavedMerges()
  }, [activeTab, savedLoaded])

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase()
    return q ? jobs.filter((j) => j.name.toLowerCase().includes(q)) : jobs
  }, [jobs, jobSearch])

  const selectedJobs   = useMemo(() => jobs.filter((j) => selected.has(j.id)), [jobs, selected])
  const totalCorrect   = selectedJobs.reduce((s, j) => s + j.correctRows, 0)
  const totalFailed    = selectedJobs.reduce((s, j) => s + j.failedRows, 0)
  const totalRows      = selectedJobs.reduce((s, j) => s + j.totalRows, 0)
  const previewCorrect = previewRows.filter((r) => r.status === 'correct').length
  const previewFailed  = previewRows.filter((r) => r.status === 'failed').length

  // ── Handlers ───────────────────────────────────────────────────────────────
  function toggleJob(id: string) {
    setSelected((prev) => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
    })
  }
  function selectAll() { setSelected(new Set(filteredJobs.map((j) => j.id))) }
  function clearAll()  { setSelected(new Set()) }

  async function handleMerge() {
    if (selected.size === 0) return
    setMerging(true)
    const tid = toast.loading(`Merging ${selected.size} job${selected.size !== 1 ? 's' : ''}…`)
    try {
      const rows = await fetchBatch([...selected], 'all')
      setRawRows(rows)
      setPreviewRows(convertToGridRows(rows))
      setSaveName(selectedJobs.map((j) => j.name).join(' + '))
      setNewStep('preview')
      toast.success(`Merged ${rows.length} rows`, { id: tid })
    } catch {
      toast.error('Failed to merge jobs', { id: tid })
    } finally { setMerging(false) }
  }

  async function handleExport(type: 'all' | 'correct' | 'failed') {
    setExporting(type)
    const tid = toast.loading('Preparing export…')
    try {
      const rows = type === 'all' ? rawRows : await fetchBatch([...selected], type)
      exportToShopifyCSV(rows, `batch_${type}_${new Date().toISOString().slice(0, 10)}.csv`)
      toast.success(`Exported ${rows.length} row${rows.length !== 1 ? 's' : ''} as CSV`, { id: tid })
    } catch {
      toast.error('Export failed', { id: tid })
    } finally { setExporting(null) }
  }

  async function handleSaveToLibrary() {
    if (!saveName.trim()) return
    setSaving(true)
    const tid = toast.loading('Saving to library…')
    try {
      const merged = await mergedApi.save([...selected], saveName.trim())
      setSavedLoaded(false)
      setSaveOpen(false)
      toast.success(`"${saveName.trim()}" saved to library`, { id: tid })
      navigate(`/merged/${merged.id}`)
    } catch {
      toast.error('Failed to save merge', { id: tid })
    } finally { setSaving(false) }
  }

  function goBackToSelect() {
    setNewStep('select'); setSaveOpen(false)
  }

  // ── SHARED SHELL ───────────────────────────────────────────────────────────
  return (
    <div ref={pageRef} className="flex flex-col h-screen px-4 sm:px-8 py-4 sm:py-8 overflow-hidden">
      {loadingJobs && <PageLoader label="Loading jobs…" />}
      {!loadingJobs && (<>

      {/* Back */}
      <button
        onClick={() => newStep === 'preview' ? goBackToSelect() : navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-5 group w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        {newStep === 'preview' && activeTab === 'new' ? 'Back to selection' : 'Back'}
      </button>

      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-0.5">
          Batch Export
        </p>
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-black dark:text-white leading-tight">
          {newStep === 'preview' && activeTab === 'new'
            ? `${selectedJobs.length} job${selectedJobs.length !== 1 ? 's' : ''} merged`
            : 'Merge & Export'}
        </h1>
        {newStep === 'preview' && activeTab === 'new' && (
          <p className="text-sm text-slate-400 dark:text-slate-500 font-light mt-0.5 truncate max-w-xl">
            {selectedJobs.map((j) => j.name).join(' · ')}
          </p>
        )}
      </div>

      {/* Tab bar — hidden during preview to keep focus */}
      {newStep === 'select' && (
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5 w-fit mb-5 flex-shrink-0">
          {([
            { key: 'new',   label: 'New Merge',     icon: Plus     },
            { key: 'saved', label: 'Saved Merges',  icon: BookOpen },
          ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150',
                activeTab === key
                  ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {key === 'saved' && savedMerges.length > 0 && (
                <span className="ml-0.5 text-[10px] text-slate-400">({savedMerges.length})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── NEW MERGE TAB ─────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'new' && newStep === 'select' && (
          <motion.div key="select" className="flex flex-col flex-1 min-h-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Stats */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-5 mb-4 flex-shrink-0 text-xs">
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">{selected.size}</span>
                of {jobs.length} selected
              </span>
              {selected.size > 0 && <>
                <span className="text-slate-200 dark:text-slate-700">|</span>
                <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <Hash className="w-3.5 h-3.5" /><b className="text-slate-800 dark:text-slate-200">{totalRows}</b> rows
                </span>
                <span className="text-slate-200 dark:text-slate-700">|</span>
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><b>{totalCorrect}</b> correct
                </span>
                <span className="text-slate-200 dark:text-slate-700">|</span>
                <span className="flex items-center gap-1 text-rose-700 dark:text-rose-400">
                  <XCircle className="w-3.5 h-3.5 text-rose-500" /><b>{totalFailed}</b> failed
                </span>
              </>}
            </div>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-3 flex-shrink-0">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type="text" value={jobSearch} onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Search jobs…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-colors"
                />
              </div>
              <button onClick={selected.size === filteredJobs.length && filteredJobs.length > 0 ? clearAll : selectAll}
                className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors px-2">
                {selected.size === filteredJobs.length && filteredJobs.length > 0 ? 'Deselect all' : 'Select all'}
              </button>
              {selected.size > 0 && (
                <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Clear</button>
              )}
            </div>
            {/* Job list */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              {filteredJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {jobSearch ? `No jobs matching "${jobSearch}"` : 'No completed jobs yet'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredJobs.map((job) => {
                    const isSel = selected.has(job.id)
                    return (
                      <li key={job.id} onClick={() => toggleJob(job.id)}
                        className={[
                          'flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors select-none',
                          isSel ? 'bg-blue-50/60 dark:bg-blue-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                        ].join(' ')}
                      >
                        <div className={['w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors',
                          isSel ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-600'].join(' ')}>
                          {isSel && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{job.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {job.type} · {new Date(job.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                          <span className="flex items-center gap-1 text-slate-500"><Hash className="w-3 h-3" />{job.totalRows}</span>
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3" />{job.correctRows}</span>
                          <span className="flex items-center gap-1 text-rose-500 dark:text-rose-400"><XCircle className="w-3 h-3" />{job.failedRows}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            {/* Action bar */}
            <div className="flex items-center gap-3 mt-4 flex-shrink-0 pt-4 border-t" style={{ borderColor: 'var(--border-end)' }}>
              <span className="text-xs text-slate-400 mr-auto">
                {selected.size === 0 ? 'Select jobs above to merge' : `${selected.size} job${selected.size !== 1 ? 's' : ''} · ${totalRows} rows`}
              </span>
              <button disabled={selected.size === 0 || merging} onClick={handleMerge}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-medium bg-slate-800 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                {merging
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white dark:border-slate-400 dark:border-t-slate-900 rounded-full animate-spin" />Merging…</>
                  : <><Merge className="w-3.5 h-3.5" />Merge &amp; Preview</>}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── PREVIEW ─────────────────────────────────────────────────────── */}
        {activeTab === 'new' && newStep === 'preview' && (
          <motion.div key="preview" className="flex flex-col flex-1 min-h-0"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Stats + view switcher */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-5 mb-4 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Hash className="w-3.5 h-3.5" /><b className="text-slate-800 dark:text-slate-200">{previewRows.length}</b> rows
              </span>
              <span className="hidden sm:inline w-px h-3 rounded-full self-center" style={{ backgroundColor: 'var(--border-end)' }} />
              <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><b>{previewCorrect}</b> correct
              </span>
              <span className="hidden sm:inline w-px h-3 rounded-full self-center" style={{ backgroundColor: 'var(--border-end)' }} />
              <span className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400">
                <XCircle className="w-3.5 h-3.5 text-rose-500" /><b>{previewFailed}</b> failed
              </span>
              <div className="ml-auto flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5">
                {(['table', 'csv'] as ViewMode[]).map((mode) => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150',
                      viewMode === mode ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300',
                    ].join(' ')}
                  >
                    {mode === 'table' ? <Table2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {mode === 'table' ? 'Table' : 'CSV Preview'}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 min-h-0 flex flex-col">
              {viewMode === 'table'
                ? <ExcelGrid rows={previewRows} onSave={() => {}} />
                : <ShopifyCsvView rows={previewRows} />}
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-3 mt-4 flex-shrink-0 pt-4 border-t flex-wrap" style={{ borderColor: 'var(--border-end)' }}>

              {/* Save to Library inline form */}
              {saveOpen ? (
                <div className="flex items-center gap-2 mr-auto">
                  <input
                    autoFocus
                    type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveToLibrary(); if (e.key === 'Escape') setSaveOpen(false) }}
                    placeholder="Merge name…"
                    className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-slate-800 border border-blue-400 dark:border-blue-600 text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-full sm:w-52 transition-colors"
                  />
                  <button onClick={handleSaveToLibrary} disabled={!saveName.trim() || saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-colors">
                    {saving ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <BookOpen className="w-3 h-3" />}
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setSaveOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-1">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setSaveOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors mr-auto">
                  <BookOpen className="w-3.5 h-3.5" />Save to Library
                </button>
              )}

              <button disabled={exporting !== null} onClick={() => handleExport('failed')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {exporting === 'failed' ? <><span className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />Exporting…</> : <><XCircle className="w-3.5 h-3.5" />Failed ({totalFailed})</>}
              </button>
              <button disabled={exporting !== null} onClick={() => handleExport('correct')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {exporting === 'correct' ? <><span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />Exporting…</> : <><CheckCircle2 className="w-3.5 h-3.5" />Correct ({totalCorrect})</>}
              </button>
              <button disabled={exporting !== null} onClick={() => handleExport('all')}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-medium bg-slate-800 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                {exporting === 'all' ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white dark:border-slate-400 dark:border-t-slate-900 rounded-full animate-spin" />Exporting…</> : <><Download className="w-3.5 h-3.5" />Export all ({totalRows})</>}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── SAVED MERGES TAB ──────────────────────────────────────────── */}
        {activeTab === 'saved' && (
          <motion.div key="saved" className="flex flex-col flex-1 min-h-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-3 mb-4 flex-shrink-0">
              <p className="text-sm text-slate-500 dark:text-slate-400 mr-auto">
                {savedMerges.length} saved merge{savedMerges.length !== 1 ? 's' : ''}
              </p>
              <button onClick={loadSavedMerges} disabled={loadingSaved}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSaved ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {loadingSaved ? (
                <div className="flex items-center justify-center h-32 gap-2 text-sm text-slate-400">
                  <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                  Loading…
                </div>
              ) : savedMerges.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
                  <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No saved merges yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Merge some jobs and click "Save to Library"
                    </p>
                  </div>
                  <button onClick={() => setActiveTab('new')}
                    className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors">
                    Go to New Merge
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedMerges.map((m) => (
                    <MergedJobCard
                      key={m.id} merge={m}
                      onDelete={(id) => setSavedMerges((prev) => prev.filter((x) => x.id !== id))}
                      onOpen={(id) => navigate(`/merged/${id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>)}
    </div>
  )
}
