import { useMemo, useRef, useCallback, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ModuleRegistry,
  ClientSideRowModelModule,
  type ColDef,
  type ICellRendererParams,
  type GetRowIdParams,
  type GridReadyEvent,
  type GridApi,
} from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import type { GridRow } from '../ui/ExcelGrid'

ModuleRegistry.registerModules([ClientSideRowModelModule])

interface ShopifyCsvViewProps {
  rows: GridRow[]
}

interface TooltipState { x: number; y: number; msg: string; severity: 'error' | 'warning' }

// ── Exact Shopify CSV export column order ────────────────────────────────────
const SHOPIFY_HEADERS = [
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Product Category',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  'Option2 Name',
  'Option2 Value',
  'Option3 Name',
  'Option3 Value',
  'Variant SKU',
  'Variant Grams',
  'Variant Inventory Tracker',
  'Variant Inventory Qty',
  'Variant Inventory Policy',
  'Variant Fulfillment Service',
  'Variant Price',
  'Variant Compare At Price',
  'Variant Requires Shipping',
  'Variant Taxable',
  'Variant Barcode',
  'Image Src',
  'Image Position',
  'Image Alt Text',
  'Gift Card',
  'SEO Title',
  'SEO Description',
  'Google Shopping / Google Product Category',
  'Google Shopping / Gender',
  'Google Shopping / Age Group',
  'Google Shopping / MPN',
  'Google Shopping / AdWords Grouping',
  'Google Shopping / AdWords Labels',
  'Google Shopping / Condition',
  'Google Shopping / Custom Product',
  'Google Shopping / Custom Label 0',
  'Google Shopping / Custom Label 1',
  'Google Shopping / Custom Label 2',
  'Google Shopping / Custom Label 3',
  'Google Shopping / Custom Label 4',
  'Variant Image',
  'Variant Weight Unit',
  'Variant Tax Code',
  'Cost per item',
  'Included / International',
  'Price / International',
  'Compare At Price / International',
  'Status',
]

// ── Image columns — resolved from parsed images array, not from flat data keys
const IMAGE_COLS = new Set(['Image Src', 'Image Position', 'Image Alt Text'])

// ── Map each Shopify header → flat data keys to try (in order) ───────────────
const HEADER_KEYS: Record<string, string[]> = {
  'Handle':                                    ['handle'],
  'Title':                                     ['title'],
  'Body (HTML)':                               ['body_html'],
  'Vendor':                                    ['vendor'],
  'Product Category':                          ['category', 'product_category'],
  'Type':                                      ['product_type', 'type'],
  'Tags':                                      ['tags'],
  'Published':                                 ['published'],
  // Options resolved separately via resolveOption()
  'Option1 Name':                              ['option1_name'],
  'Option1 Value':                             ['option1'],
  'Option2 Name':                              ['option2_name'],
  'Option2 Value':                             ['option2'],
  'Option3 Name':                              ['option3_name'],
  'Option3 Value':                             ['option3'],
  'Variant SKU':                               ['sku', 'variant_sku'],
  'Variant Grams':                             ['grams', 'weight_grams', 'variant_grams'],
  'Variant Inventory Tracker':                 ['inventory_management'],
  'Variant Inventory Qty':                     ['inventory_quantity'],
  'Variant Inventory Policy':                  ['inventory_policy'],
  'Variant Fulfillment Service':               ['fulfillment_service'],
  'Variant Price':                             ['price', 'variant_price'],
  'Variant Compare At Price':                  ['compare_at_price'],
  'Variant Requires Shipping':                 ['requires_shipping'],
  'Variant Taxable':                           ['taxable'],
  'Variant Barcode':                           ['barcode'],
  // Image cols intentionally empty — handled via parseImages()
  'Image Src':                                 [],
  'Image Position':                            [],
  'Image Alt Text':                            [],
  'Gift Card':                                 ['gift_card', 'Gift Card'],
  'SEO Title':                                 ['seo_title'],
  'SEO Description':                           ['seo_description'],
  'Google Shopping / Google Product Category': ['Google Shopping / Google Product Category', 'google_shopping_google_product_category'],
  'Google Shopping / Gender':                  ['Google Shopping / Gender', 'google_shopping_gender'],
  'Google Shopping / Age Group':               ['Google Shopping / Age Group', 'google_shopping_age_group'],
  'Google Shopping / MPN':                     ['Google Shopping / MPN', 'google_shopping_mpn'],
  'Google Shopping / AdWords Grouping':        ['Google Shopping / AdWords Grouping', 'google_shopping_adwords_grouping'],
  'Google Shopping / AdWords Labels':          ['Google Shopping / AdWords Labels', 'google_shopping_adwords_labels'],
  'Google Shopping / Condition':               ['Google Shopping / Condition', 'google_shopping_condition'],
  'Google Shopping / Custom Product':          ['Google Shopping / Custom Product', 'google_shopping_custom_product'],
  'Google Shopping / Custom Label 0':          ['Google Shopping / Custom Label 0', 'google_shopping_custom_label_0'],
  'Google Shopping / Custom Label 1':          ['Google Shopping / Custom Label 1', 'google_shopping_custom_label_1'],
  'Google Shopping / Custom Label 2':          ['Google Shopping / Custom Label 2', 'google_shopping_custom_label_2'],
  'Google Shopping / Custom Label 3':          ['Google Shopping / Custom Label 3', 'google_shopping_custom_label_3'],
  'Google Shopping / Custom Label 4':          ['Google Shopping / Custom Label 4', 'google_shopping_custom_label_4'],
  'Variant Image':                             ['variant_image'],
  'Variant Weight Unit':                       ['weight_unit', 'variant_weight_unit'],
  'Variant Tax Code':                          ['tax_code', 'variant_tax_code'],
  'Cost per item':                             ['cost_per_item', 'cost'],
  'Included / International':                  ['included_international', 'Included / International'],
  'Price / International':                     ['price_international', 'Price / International'],
  'Compare At Price / International':          ['compare_at_price_international', 'Compare At Price / International'],
  'Status':                                    ['status'],
}

// ── Keys already covered by HEADER_KEYS (already mapped to a Shopify header) ─
const COVERED_KEYS = new Set<string>(Object.values(HEADER_KEYS).flat())

// ── Keys that are structural or handled specially — never shown as raw extras ─
const SKIP_KEYS = new Set([
  'images',         // raw array — consumed by parseImages, re-presented as Image Src/Position/Alt cols
  'options',        // raw array — resolved via resolveOption, re-presented as Option Name/Value cols
  'variants',       // raw array — already expanded into separate rows
  'image_src',      // synthetic key added by rowsToGridRows, covered by Image Src header
  'image_position', // synthetic key added by rowsToGridRows, covered by Image Position header
  'image_alt',      // synthetic key added by rowsToGridRows, covered by Image Alt Text header
])

/** Keys in row.data that have no Shopify header mapping — shown as extra raw columns */
function getExtraKeys(rows: GridRow[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    for (const k of Object.keys(row.data)) {
      if (!COVERED_KEYS.has(k) && !SKIP_KEYS.has(k) && !k.startsWith('__')) {
        seen.add(k)
      }
    }
  }
  return Array.from(seen)
}

// ── Image object from backend ────────────────────────────────────────────────
interface ImageObject {
  src:       string
  alt?:      string
  position?: number
}

/**
 * Parse the `images` field from row.data.
 *
 * csvCell() in ResultsGrid stringifies arrays by joining items with ", " —
 * so an array of objects becomes:  '{"src":"...","alt":"...","position":1}, {"src":"...","position":2}, ...'
 * We need to handle that format AS WELL AS proper JSON arrays and plain URLs.
 */
function parseImages(raw: string): ImageObject[] {
  if (!raw) return []
  const t = raw.trim()

  // Plain URL
  if (t.startsWith('http://') || t.startsWith('https://')) return [{ src: t }]

  // Proper JSON array
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t) as unknown[]
      return arr.flatMap((item): ImageObject[] => parseImageItem(item))
    } catch { /* fall through to comma-split */ }
  }

  // Single JSON object
  if (t.startsWith('{')) {
    try {
      return [parseImageItem(JSON.parse(t) as unknown)].flat()
    } catch { /* fall through */ }
  }

  // csvCell joined format: '{"src":"...","position":1}, {"src":"...","position":2}, ...'
  // Wrap in [] to make it a valid JSON array and re-parse
  const wrapped = '[' + t + ']'
  try {
    const arr = JSON.parse(wrapped) as unknown[]
    const result = arr.flatMap((item) => parseImageItem(item))
    if (result.length > 0) return result
  } catch { /* fall through to split approach */ }

  // Last resort: split on '}, {' boundaries
  if (t.includes('}, {') || t.includes('},{')) {
    const chunks = t.split(/\},\s*\{/)
    return chunks.flatMap((chunk) => {
      let json = chunk.trim()
      if (!json.startsWith('{')) json = '{' + json
      if (!json.endsWith('}'))   json = json + '}'
      try { return parseImageItem(JSON.parse(json) as unknown) }
      catch { return [] }
    })
  }

  return []
}

function parseImageItem(item: unknown): ImageObject[] {
  if (!item) return []
  if (typeof item === 'string') {
    const s = item.trim()
    return (s.startsWith('http://') || s.startsWith('https://')) ? [{ src: s }] : []
  }
  if (typeof item === 'object') {
    const o = item as Record<string, unknown>
    const src = typeof o.src === 'string' ? o.src.trim()
      : typeof o['Image Src'] === 'string' ? (o['Image Src'] as string).trim() : ''
    // Only accept valid http URLs — skip empty or malformed entries
    if (!src || (!src.startsWith('http://') && !src.startsWith('https://'))) return []
    return [{
      src,
      alt: typeof o.alt === 'string' ? o.alt
        : typeof o['Image Alt Text'] === 'string' ? o['Image Alt Text'] as string : undefined,
      position: typeof o.position === 'number' ? o.position
        : typeof o['Image Position'] === 'number' ? o['Image Position'] as number : undefined,
    }]
  }
  return []
}

/** Parse tags: JSON array string OR comma-separated */
function resolveTags(raw: string): string {
  if (!raw) return ''
  const t = raw.trim()
  if (t.startsWith('[')) {
    try { return (JSON.parse(t) as unknown[]).map(String).join(', ') }
    catch { /* fall through */ }
  }
  return t
}

/**
 * Resolve Option N name/value.
 * After expandVariants+flattenRecord in ResultsGrid, options land as:
 *   option1 = "37", option1_name = "Size"  (already flat)
 * OR still as JSON string in `options` key if not expanded.
 */
function resolveOption(data: Record<string, string>, n: 1|2|3, part: 'name'|'value'): string {
  const flatKey = part === 'name' ? `option${n}_name` : `option${n}`
  if (data[flatKey]) return data[flatKey]
  // fallback: parse options JSON array
  const raw = data['options'] ?? ''
  if (!raw || !raw.trim().startsWith('[')) return ''
  try {
    const arr = JSON.parse(raw) as Array<{ name?: string; values?: unknown[] }>
    const opt = arr[n - 1]
    if (!opt) return ''
    return part === 'name'
      ? String(opt.name ?? '')
      : opt.values?.[0] != null ? String(opt.values[0]) : ''
  } catch { return '' }
}

/** Resolve a single Shopify CSV header to its display string from flat row.data */
function resolveCell(data: Record<string, string>, header: string): string {
  // Image cols are handled separately via parseImages — always blank here
  if (IMAGE_COLS.has(header)) return ''

  switch (header) {
    case 'Tags':          return resolveTags(data['tags'] ?? '')
    case 'Option1 Name':  return resolveOption(data, 1, 'name')
    case 'Option1 Value': return resolveOption(data, 1, 'value')
    case 'Option2 Name':  return resolveOption(data, 2, 'name')
    case 'Option2 Value': return resolveOption(data, 2, 'value')
    case 'Option3 Name':  return resolveOption(data, 3, 'name')
    case 'Option3 Value': return resolveOption(data, 3, 'value')
    case 'SEO Title':        return data['seo_title'] ?? ''
    case 'SEO Description':  return data['seo_description'] ?? ''
    default: break
  }

  const keys = HEADER_KEYS[header] ?? []
  for (const k of keys) {
    const v = data[k]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return ''
}

/** Pre-parse all images once per row — keyed by row.id — avoids re-parsing in every loop */
function buildImageCache(rows: GridRow[]): Map<string, ImageObject[]> {
  const cache = new Map<string, ImageObject[]>()
  for (const row of rows) {
    cache.set(row.id, parseImages(row.data['images'] ?? ''))
  }
  return cache
}

/** Returns true if this header should appear as a column (has at least 1 non-empty value) */
function headerHasData(rows: GridRow[], header: string, imageCache: Map<string, ImageObject[]>): boolean {
  if (IMAGE_COLS.has(header)) {
    return rows.some((r) => (imageCache.get(r.id)?.length ?? 0) > 0)
  }
  return rows.some((r) => resolveCell(r.data, header) !== '')
}

// ── Flat row shape for AG Grid ───────────────────────────────────────────────
interface FlatCsvRow {
  __id:         string
  __meta:       GridRow
  __rowType:    'product' | 'image-extra'
  __imageIndex: number
  [col: string]: unknown
}

/**
 * Expand GridRows into Shopify CSV rows, matching images to variants by index:
 *
 *   - Images are sorted by position (1, 2, 3, ...)
 *   - Image[0] → variant row 1  (image position matches variant index)
 *   - Image[1] → variant row 2
 *   - Image[2] → variant row 3
 *   - Image[3..N] → extra image-only rows (no variant to pair with)
 *
 * Example: 3 variants, 5 images
 *   Row 1: variant1 + image1 (pos 1)
 *   Row 2: variant2 + image2 (pos 2)
 *   Row 3: variant3 + image3 (pos 3)
 *   Row 4: [extra image row] image4 (pos 4)
 *   Row 5: [extra image row] image5 (pos 5)
 *
 * All GridRows for the same handle are grouped first, then processed together.
 */
function expandRows(rows: GridRow[], activeHeaders: string[], extraKeys: string[], imageCache?: Map<string, ImageObject[]>): FlatCsvRow[] {
  // Group GridRows by handle (each handle = one product, multiple variants)
  const productMap = new Map<string, GridRow[]>()
  const handleOrder: string[] = []
  for (const row of rows) {
    const handle = row.data['handle'] ?? `__nohandle_${row.id}`
    if (!productMap.has(handle)) {
      productMap.set(handle, [])
      handleOrder.push(handle)
    }
    productMap.get(handle)!.push(row)
  }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
  const result: FlatCsvRow[] = []

  for (const handle of handleOrder) {
    const variantRows = productMap.get(handle)!
    // Images come from any variant row (they're all the same — images belong to product)
    const images = imageCache?.get(variantRows[0].id) ?? parseImages(variantRows[0].data['images'] ?? '')
    // Sort images by position ascending
    const sorted = [...images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    // ── Emit one row per variant, pairing each with its image by index ────
    variantRows.forEach((row, vi) => {
      const img = sorted[vi] ?? null  // null if more variants than images
      const d = row.data
      const flat: FlatCsvRow = {
        __id:         row.id,
        __meta:       row,
        __rowType:    'product',
        __imageIndex: vi + 1,
      }
      for (const h of activeHeaders) {
        if (h === 'Image Src')           flat[h] = img?.src ?? ''
        else if (h === 'Image Position') flat[h] = img ? String(img.position ?? vi + 1) : ''
        else if (h === 'Image Alt Text') flat[h] = img?.alt ?? ''
        else                             flat[h] = resolveCell(d, h)
      }
      // Extra (non-Shopify) keys — raw values pass through as-is
      for (const k of extraKeys) flat[k] = d[k] ?? ''
      result.push(flat)
    })

    // ── Extra image-only rows for images beyond the variant count ─────────
    const overflowImages = sorted.slice(variantRows.length)
    overflowImages.forEach((img, oi) => {
      const extra: FlatCsvRow = {
        __id:         `${handle}__img_overflow${oi}`,
        __meta:       variantRows[0],
        __rowType:    'image-extra',
        __imageIndex: variantRows.length + oi + 1,
      }
      for (const h of activeHeaders) {
        if (h === 'Handle')              extra[h] = handle
        else if (h === 'Image Src')      extra[h] = img.src
        else if (h === 'Image Position') extra[h] = String(img.position ?? variantRows.length + oi + 1)
        else if (h === 'Image Alt Text') extra[h] = img.alt ?? ''
        else                             extra[h] = ''  // Shopify spec: blank on image-only rows
      }
      for (const k of extraKeys) extra[k] = ''
      result.push(extra)
    })
  }

  return result
}

// ── Status cell renderer ─────────────────────────────────────────────────────
function CsvStatusRenderer({ data }: ICellRendererParams) {
  const row = data as FlatCsvRow
  if (row.__rowType === 'image-extra') {
    return (
      <div className="csv-status-cell">
        <span className="csv-badge-image">+ img</span>
      </div>
    )
  }
  const correct = row.__meta.status === 'correct'
  return (
    <div className="csv-status-cell">
      <span className={correct ? 'swallow-badge-correct' : 'swallow-badge-failed'}>
        <span className={correct ? 'swallow-dot-correct' : 'swallow-dot-failed'} />
        {correct ? 'correct' : 'failed'}
      </span>
    </div>
  )
}

// ── Data cell renderer ────────────────────────────────────────────────────────
interface CsvCellProps {
  value:      unknown
  data:       FlatCsvRow
  header:     string
  setTooltip: React.Dispatch<React.SetStateAction<TooltipState | null>>
}

function CsvCellRenderer({ value, data, header, setTooltip }: CsvCellProps) {
  const row        = data as FlatCsvRow
  const isExtra    = row.__rowType === 'image-extra'
  const meta       = row.__meta
  // For standard Shopify headers, look up mapped keys; for extra columns, the header IS the key
  const candidates = HEADER_KEYS[header] ?? [header]
  const matchedKey = !isExtra ? candidates.find((k) => meta.errorFields?.includes(k)) : undefined
  const severity   = matchedKey ? (meta.cellSeverity?.[matchedKey] ?? 'error') : null
  const msg        = matchedKey ? meta.cellWarnings?.[matchedKey] : undefined

  const textColor = severity === 'error' ? '#be123c' : severity === 'warning' ? '#92400e' : undefined
  const str = value !== undefined && value !== null && value !== '' ? String(value) : ''

  function handleEnter(e: React.MouseEvent) {
    if (!msg) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 6, msg, severity: severity ?? 'error' })
  }
  function handleLeave() { if (msg) setTooltip(null) }

  // Image Src column — plain URL text only
  if (header === 'Image Src' && str) {
    return (
      <div
        className="relative flex items-center w-full h-full px-3 overflow-hidden"
        style={{ color: textColor }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <span className="truncate font-mono text-[11px] text-blue-600 dark:text-blue-400">{str}</span>
        {severity && (
          <span
            className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full pointer-events-none"
            style={{ background: severity === 'error' ? '#f43f5e' : '#f59e0b' }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className="relative flex items-center w-full h-full px-3 font-mono text-xs overflow-hidden"
      style={{ color: textColor }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {str
        ? <span className="truncate">{str}</span>
        : <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>—</span>
      }
      {severity && (
        <span
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{ background: severity === 'error' ? '#f43f5e' : '#f59e0b' }}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ShopifyCsvView({ rows }: ShopifyCsvViewProps) {
  const apiRef = useRef<GridApi<FlatCsvRow> | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Pre-parse all images once — avoids repeated JSON.parse in every header/cell check
  const imageCache = useMemo(() => buildImageCache(rows), [rows])

  // All 51 Shopify headers, filtered to only those with at least 1 non-empty value
  const activeHeaders = useMemo(
    () => SHOPIFY_HEADERS.filter((h) => headerHasData(rows, h, imageCache)),
    [rows, imageCache],
  )

  // Keys in row.data that don't map to any Shopify header — appended as raw columns
  const extraKeys = useMemo(() => getExtraKeys(rows), [rows])

  const flatRows = useMemo<FlatCsvRow[]>(
    () => expandRows(rows, activeHeaders, extraKeys, imageCache),
    [rows, activeHeaders, extraKeys, imageCache],
  )

  const totalImages = flatRows.filter((r) => r.__rowType === 'image-extra').length

  const colDefs = useMemo<ColDef<FlatCsvRow>[]>(() => {
    const fixed: ColDef<FlatCsvRow>[] = [
      {
        headerName: '#',
        colId: '__num',
        width: 52,
        pinned: 'left',
        sortable: false,
        editable: false,
        suppressMovable: true,
        cellStyle: { justifyContent: 'flex-end', padding: '0 8px', fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' },
        valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
      },
      {
        headerName: 'Status',
        colId: '__status',
        width: 90,
        pinned: 'left',
        sortable: true,
        editable: false,
        cellRenderer: 'csvStatusRenderer',
        cellStyle: { padding: 0 },
        valueGetter: (p) => (p.data as FlatCsvRow).__meta.status,
      },
    ]

    const dataCols: ColDef<FlatCsvRow>[] = activeHeaders.map((h) => ({
      headerName: h,
      field: h,
      width: h === 'Image Src' ? 210
        : h === 'Body (HTML)' || h === 'SEO Description' ? 220
        : h.startsWith('Google Shopping') ? 180
        : 150,
      sortable: true,
      resizable: true,
      editable: false,
      cellRenderer: 'csvCellRenderer',
      cellRendererParams: { header: h, setTooltip },
      cellStyle: (p) => {
        if (!p.data) return {}
        const row = p.data as FlatCsvRow
        if (row.__rowType === 'image-extra') {
          return { background: '#f0fdf4' } as Record<string, string>
        }
        const meta       = row.__meta
        const candidates = HEADER_KEYS[h] ?? []
        const matchedKey = candidates.find((k) => meta.errorFields?.includes(k))
        const severity   = matchedKey ? (meta.cellSeverity?.[matchedKey] ?? 'error') : null
        if (severity === 'error')   return { background: 'rgb(255 241 242 / 0.7)' } as Record<string, string>
        if (severity === 'warning') return { background: 'rgb(255 251 235 / 0.6)' } as Record<string, string>
        return {}
      },
      valueGetter: (p) => (p.data as FlatCsvRow)?.[h] ?? '',
    }))

    // Extra (non-Shopify) columns — raw keys appended after all Shopify columns
    const extraCols: ColDef<FlatCsvRow>[] = extraKeys.map((k) => ({
      headerName: k.replace(/_/g, ' '),
      field: k,
      width: 160,
      sortable: true,
      resizable: true,
      editable: false,
      cellRenderer: 'csvCellRenderer',
      cellRendererParams: { header: k, setTooltip },
      cellStyle: (p) => {
        if (!p.data) return {}
        const row = p.data as FlatCsvRow
        if (row.__rowType === 'image-extra') return {}
        const meta = row.__meta
        if (meta.errorFields?.includes(k)) {
          const severity = meta.cellSeverity?.[k] ?? 'error'
          if (severity === 'error')   return { background: 'rgb(255 241 242 / 0.7)' } as Record<string, string>
          if (severity === 'warning') return { background: 'rgb(255 251 235 / 0.6)' } as Record<string, string>
        }
        return {}
      },
      valueGetter: (p) => (p.data as FlatCsvRow)?.[k] ?? '',
    }))

    return [...fixed, ...dataCols, ...extraCols]
  }, [activeHeaders, extraKeys, setTooltip])

  const getRowId    = useCallback((p: GetRowIdParams<FlatCsvRow>) => p.data.__id, [])
  const onGridReady = useCallback((e: GridReadyEvent) => { apiRef.current = e.api }, [])

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        No rows to preview
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-0">

      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-t-xl bg-[#008060] text-white text-[11px] font-medium select-none flex-shrink-0">
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.337 2.094a.5.5 0 0 0-.469-.09L8.5 3.875 3.163 5.469A.5.5 0 0 0 2.8 5.9L1.013 18.469a.5.5 0 0 0 .438.563l1.456.156 1.5.162 6.093.656 6.094.656 1.5.162 1.456.156a.5.5 0 0 0 .55-.419L21.988 7.9a.5.5 0 0 0-.363-.556l-5.9-1.656-.388-3.594ZM8.5 5.344l5.5-1.375.344 3.187-8.375 2.344L8.5 5.344Zm7.063 1.187.312 2.907-10.719 3L4.25 7.125l11.313-.594Z"/>
        </svg>
        Shopify CSV Preview
        <span className="opacity-60 ml-1">
          — {rows.length} product{rows.length !== 1 ? 's' : ''}
          {totalImages > 0 && ` · +${totalImages} image row${totalImages !== 1 ? 's' : ''}`}
          {' '}· {activeHeaders.length} / {SHOPIFY_HEADERS.length} Shopify columns
          {extraKeys.length > 0 && ` · +${extraKeys.length} extra`}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-50 dark:bg-slate-900 border-x border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0">
        <span className='extra-image'>
          <span className='extra-icon bg-green-700 px-1 py-1 rounded-md mr-1 text-white'>
            + img
          </span>
          Extra image
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-rose-400" />
          Error
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
          Warning
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 rounded-b-xl border border-t-0 border-slate-200 dark:border-slate-700 overflow-hidden">
        <style>{`
          .ag-theme-shopify-csv {
            --ag-background-color:              #ffffff;
            --ag-foreground-color:              #374151;
            --ag-header-background-color:       #f0fdf4;
            --ag-header-foreground-color:       #166534;
            --ag-border-color:                  #e2e8f0;
            --ag-row-border-color:              #e2e8f0;
            --ag-row-border-width:              1px;
            --ag-row-border-style:              solid;
            --ag-cell-horizontal-border:        solid 1px #e2e8f0;
            --ag-row-hover-color:               #f0fdf4;
            --ag-selected-row-background-color: #dcfce7;
            --ag-odd-row-background-color:      #ffffff;
            --ag-cell-horizontal-padding:       0px;
            --ag-cell-vertical-padding:         0px;
            --ag-row-height:                    36px;
            --ag-header-height:                 38px;
            --ag-font-size:                     11px;
            --ag-font-family:                   ui-monospace, SFMono-Regular, Menlo, monospace;
            --ag-header-column-separator-display: block;
            --ag-header-column-separator-height:  60%;
            --ag-header-column-separator-width:   1px;
            --ag-header-column-separator-color:   #bbf7d0;
            --ag-header-column-resize-handle-display: block;
            --ag-header-column-resize-handle-height:  40%;
            --ag-header-column-resize-handle-width:   2px;
            --ag-header-column-resize-handle-color:   #86efac;
          }
          .dark .ag-theme-shopify-csv {
            --ag-background-color:              #0f172a;
            --ag-foreground-color:              #cbd5e1;
            --ag-header-background-color:       #052e16;
            --ag-header-foreground-color:       #86efac;
            --ag-border-color:                  #334155;
            --ag-row-border-color:              #334155;
            --ag-cell-horizontal-border:        solid 1px #334155;
            --ag-row-hover-color:               #14532d;
            --ag-selected-row-background-color: #166534;
            --ag-odd-row-background-color:      #0f172a;
            --ag-header-column-separator-color: #14532d;
            --ag-header-column-resize-handle-color: #166534;
          }
          .ag-theme-shopify-csv .ag-root-wrapper { border: none !important; }
          .ag-theme-shopify-csv .ag-cell {
            display: flex !important;
            align-items: center !important;
            padding: 0 !important;
            border-right: 1px solid var(--ag-border-color) !important;
            border-bottom: 1px solid var(--ag-row-border-color) !important;
            overflow: hidden;
          }
          .ag-theme-shopify-csv .ag-header-cell {
            display: flex !important;
            align-items: center !important;
            border-right: 1px solid var(--ag-border-color) !important;
          }
          .ag-theme-shopify-csv .ag-header-cell-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 0 8px;
            width: 100%;
          }
          .ag-theme-shopify-csv .ag-pinned-left-cols-container {
            box-shadow: 2px 0 4px -1px rgba(0,0,0,0.08);
          }
          .dark .ag-theme-shopify-csv .ag-pinned-left-cols-container {
            box-shadow: 2px 0 6px -1px rgba(0,0,0,0.4);
          }
          .csv-status-cell {
            display: flex; align-items: center;
            width: 100%; height: 100%; padding: 0 8px;
          }
          .csv-badge-image {
            font-size: 10px; font-weight: 600;
            padding: 1px 6px; border-radius: 4px;
            background: #dcfce7; color: #166534;
          }
          .dark .csv-badge-image {
            background: #14532d; color: #86efac;
          }
          /* Status badges — defined here since ExcelGrid is not mounted in CSV view mode */
          .swallow-badge-correct,
          .swallow-badge-failed {
            display: inline-flex; align-items: center; gap: 4px;
            padding: 2px 8px; border-radius: 999px;
            font-size: 11px; font-weight: 500; white-space: nowrap;
          }
          .swallow-badge-correct { background: #d1fae5; color: #065f46; }
          .swallow-badge-failed  { background: #ffe4e6; color: #9f1239; }
          .swallow-dot-correct   { width: 6px; height: 6px; border-radius: 50%; background: #10b981; flex-shrink: 0; }
          .swallow-dot-failed    { width: 6px; height: 6px; border-radius: 50%; background: #f43f5e; flex-shrink: 0; }
          .dark .swallow-badge-correct { background: rgba(16,185,129,0.15); color: #34d399; }
          .dark .swallow-badge-failed  { background: rgba(244,63,94,0.15);  color: #fb7185; }
          .dark .swallow-dot-correct   { background: #34d399; }
          .dark .swallow-dot-failed    { background: #fb7185; }
        `}</style>

        <AgGridReact<FlatCsvRow>
          className="ag-theme-shopify-csv h-full w-full"
          rowData={flatRows}
          columnDefs={colDefs}
          getRowId={getRowId}
          onGridReady={onGridReady}
          animateRows={false}
          rowHeight={36}
          headerHeight={38}
          suppressMovableColumns={false}
          defaultColDef={{
            sortable: true,
            resizable: true,
            editable: false,
            suppressHeaderMenuButton: true,
          }}
          components={{
            csvStatusRenderer: CsvStatusRenderer,
            csvCellRenderer:   CsvCellRenderer,
          }}
        />
      </div>

      {/* Cell warning tooltip — fixed-position, never clipped by grid scroll */}
      {tooltip && (() => {
        const isWarn = tooltip.severity === 'warning'
        const bg    = isWarn ? 'bg-amber-900' : 'bg-rose-900'
        const text  = isWarn ? 'text-amber-100' : 'text-rose-100'
        const dot   = isWarn ? 'bg-amber-400' : 'bg-rose-400'
        const arrow = isWarn ? 'border-t-amber-900' : 'border-t-rose-900'
        return (
          <div
            className="fixed z-[9999] pointer-events-none flex flex-col items-center"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%) translateY(-100%)' }}
          >
            <div className={`flex items-start gap-1.5 max-w-[260px] px-3 py-2 rounded-lg ${bg} ${text} text-[11px] leading-snug shadow-lg shadow-black/30`}>
              <span className={`mt-px flex-shrink-0 w-3 h-3 rounded-full ${dot} inline-block`} />
              <span>{tooltip.msg}</span>
            </div>
            <div className={`w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent ${arrow}`} />
          </div>
        )
      })()}
    </div>
  )
}
