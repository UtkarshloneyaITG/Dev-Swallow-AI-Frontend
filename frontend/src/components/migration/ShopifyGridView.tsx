import { useState, useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Tag } from 'lucide-react'
import type { GridRow } from '../ui/ExcelGrid'

interface ShopifyGridViewProps {
  rows: GridRow[]
}

function pick(data: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = data[k]
    if (v && v.trim() !== '') return v.trim()
  }
  return ''
}

/** Extract all image URLs from a row's data */
function extractAllImgUrls(data: Record<string, string>): string[] {
  const urls: string[] = []

  const addUrl = (u: string) => {
    const s = u.trim()
    if (s.startsWith('http') && !urls.includes(s)) urls.push(s)
  }

  // Flat key set by rowsToGridRows — this row's paired image
  const flat = pick(data, 'image_src', 'Image Src')
  if (flat) addUrl(flat)

  // Raw images field — csvCell stringifies arrays as comma-joined JSON objects:
  // '{"src":"...","position":1}, {"src":"...","position":2}, ...'
  // Wrap in [] to parse as JSON array
  const raw = (data['images'] ?? '').trim()
  if (raw) {
    // Try proper JSON array first
    const toTry = raw.startsWith('[') ? raw : '[' + raw + ']'
    try {
      const arr = JSON.parse(toTry) as Array<Record<string, unknown>>
      for (const img of arr) {
        const src = String(img.src ?? img['Image Src'] ?? '').trim()
        if (src) addUrl(src)
      }
    } catch {
      // Last resort: split on }, { and parse each chunk
      const chunks = raw.replace(/^\[/, '').replace(/\]$/, '').split(/\},\s*\{/)
      for (const chunk of chunks) {
        let json = chunk.trim()
        if (!json.startsWith('{')) json = '{' + json
        if (!json.endsWith('}'))   json = json + '}'
        try {
          const img = JSON.parse(json) as Record<string, unknown>
          const src = String(img.src ?? img['Image Src'] ?? '').trim()
          if (src) addUrl(src)
        } catch { /* ignore */ }
      }
    }
  }

  return urls
}


interface ProductGroup {
  handle: string
  /** First variant row — used for product-level fields (title, vendor, status, tags, type) */
  primaryRow: GridRow
  /** All variant rows for this product */
  variantRows: GridRow[]
  /** All image URLs across all variant rows, deduplicated */
  allImages: string[]
  /** Product is failed if ANY variant row is failed */
  isFailed: boolean
  /** Has critical error if any variant row has one */
  hasCrit: boolean
  /** All unique SKUs across variants */
  skus: string[]
  /** Variant count */
  variantCount: number
  /** Min price across variants */
  minPrice: string
  /** Max price across variants */
  maxPrice: string
  /** Total inventory across variants */
  totalInventory: number | null
}

function buildProductGroups(rows: GridRow[]): ProductGroup[] {
  const map = new Map<string, GridRow[]>()
  const order: string[] = []
  for (const row of rows) {
    const handle = row.data['handle'] ?? row.id
    if (!map.has(handle)) { map.set(handle, []); order.push(handle) }
    map.get(handle)!.push(row)
  }

  return order.map((handle) => {
    const variantRows = map.get(handle)!
    const primaryRow = variantRows[0]

    // Collect all images across all variant rows
    const allImages: string[] = []
    const addUrl = (u: string) => { const s = u.trim(); if (s.startsWith('http') && !allImages.includes(s)) allImages.push(s) }
    for (const row of variantRows) {
      for (const url of extractAllImgUrls(row.data)) addUrl(url)
    }

    // Aggregate variant info
    const isFailed = variantRows.some((r) => r.status === 'failed')
    const hasCrit  = variantRows.some((r) => (r.errorFields ?? []).some((c) => r.cellSeverity?.[c] === 'error'))

    const skus = [...new Set(variantRows.map((r) => pick(r.data, 'sku', 'Variant SKU')).filter(Boolean))]

    const prices = variantRows
      .map((r) => parseFloat(pick(r.data, 'price', 'Variant Price')))
      .filter((n) => !isNaN(n))
    const minPrice = prices.length ? String(Math.min(...prices)) : ''
    const maxPrice = prices.length ? String(Math.max(...prices)) : ''

    const inventories = variantRows
      .map((r) => parseInt(pick(r.data, 'inventory_quantity', 'Variant Inventory Qty'), 10))
      .filter((n) => !isNaN(n))
    const totalInventory = inventories.length ? inventories.reduce((a, b) => a + b, 0) : null

    return { handle, primaryRow, variantRows, allImages, isFailed, hasCrit, skus, variantCount: variantRows.length, minPrice, maxPrice, totalInventory }
  })
}

function ProductGroupCard({ group }: { group: ProductGroup }) {
  const [hoverIdx, setHoverIdx] = useState(0)
  const d = group.primaryRow.data

  const title  = pick(d, 'title', 'Title') || '(no title)'
  const vendor = pick(d, 'vendor', 'Vendor')
  const status = pick(d, 'status', 'Status')
  const tags   = pick(d, 'tags', 'Tags')
  const type   = pick(d, 'product_type', 'Type')

  const { isFailed, hasCrit, allImages, skus, variantCount, minPrice, maxPrice, totalInventory } = group

  const tagList = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3) : []
  const currentImg = allImages[hoverIdx] ?? ''

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (allImages.length <= 1) return
    const { left, width } = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - left
    const idx = Math.min(Math.floor((x / width) * allImages.length), allImages.length - 1)
    setHoverIdx(idx)
  }

  const priceLabel = minPrice === maxPrice || !maxPrice
    ? (minPrice ? `$${parseFloat(minPrice).toFixed(2)}` : '')
    : `$${parseFloat(minPrice).toFixed(2)} – $${parseFloat(maxPrice).toFixed(2)}`

  const invColor = totalInventory === 0
    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
    : totalInventory !== null && totalInventory < 5
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'

  return (
    <div className={[
      'relative group rounded-xl border bg-white dark:bg-slate-900 overflow-hidden flex flex-col transition-shadow hover:shadow-md',
      isFailed
        ? hasCrit ? 'border-rose-200 dark:border-rose-800/50' : 'border-amber-200 dark:border-amber-800/50'
        : 'border-slate-200 dark:border-slate-700',
    ].join(' ')}>
      {/* Status strip */}
      <div className={['h-0.5 w-full flex-shrink-0', isFailed ? (hasCrit ? 'bg-rose-400' : 'bg-amber-400') : 'bg-emerald-400'].join(' ')} />

      {/* Image area */}
      <div
        className="relative aspect-square bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden border-b border-slate-100 dark:border-slate-800 cursor-default"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(0)}
      >
        {currentImg ? (
          <img
            key={currentImg}
            src={currentImg}
            alt={title}
            className="w-full h-full object-cover transition-opacity duration-200"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full bg-slate-100 dark:bg-slate-800">
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <span className="text-slate-400 dark:text-slate-500 text-lg font-bold select-none">{title.charAt(0).toUpperCase()}</span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">No image</span>
          </div>
        )}

        {allImages.length > 1 && (
          <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1 pointer-events-none">
            {allImages.map((_, i) => (
              <span key={i} className={['w-1 h-1 rounded-full transition-all duration-150', i === hoverIdx ? 'bg-white scale-125' : 'bg-white/50'].join(' ')} />
            ))}
          </div>
        )}

        {/* Status badge */}
        <span className={[
          'absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1',
          isFailed ? 'bg-rose-100/90 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400' : 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400',
        ].join(' ')}>
          {isFailed ? <AlertTriangle className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
          {isFailed ? 'failed' : 'correct'}
        </span>
      </div>

      {/* Card body */}
      <div className="flex flex-col gap-2 p-3 flex-1">
        <div>
          <p className={['text-sm font-medium leading-tight line-clamp-2', isFailed && hasCrit ? 'text-rose-700 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'].join(' ')}>
            {title}
          </p>
          {vendor && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{vendor}</p>}
        </div>

        <div className="flex items-center justify-between gap-2">
          {priceLabel && <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{priceLabel}</span>}
          {status && (
            <span className={[
              'text-[10px] font-medium px-1.5 py-0.5 rounded capitalize',
              status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                : status === 'draft' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
            ].join(' ')}>
              {status}
            </span>
          )}
        </div>

        {variantCount > 1 && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500">{variantCount} variants</p>
        )}
        {skus.length > 0 && (
          <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">
            SKU: {skus.slice(0, 2).join(', ')}{skus.length > 2 ? ` +${skus.length - 2}` : ''}
          </p>
        )}
        {type && <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{type}</p>}
        {totalInventory !== null && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded self-start ${invColor}`}>
            {totalInventory === 0 ? 'Out of stock' : `${totalInventory} in stock`}
          </span>
        )}

        {tagList.length > 0 && (
          <div className="flex items-center flex-wrap gap-1 mt-auto pt-1">
            <Tag className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600 flex-shrink-0" />
            {tagList.map((tag) => (
              <span key={tag} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">{tag}</span>
            ))}
          </div>
        )}

        {isFailed && (
          <div className={[
            'mt-1 rounded-lg px-2 py-1.5 text-[10px] leading-snug',
            hasCrit ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
          ].join(' ')}>
            <span className="font-medium">{hasCrit ? 'Error' : 'Warning'}:</span>{' '}
            {group.variantRows.flatMap((r) => (r.errorFields ?? []).slice(0, 1).map((c) => r.cellWarnings?.[c] ?? `"${c.replace(/_/g, ' ')}" has an issue`)).slice(0, 2).join(' · ')}
          </div>
        )}

        {/* Confidence bar — average across variants */}
        <div className="flex items-center gap-1.5 mt-1">
          <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            {(() => {
              const avg = group.variantRows.reduce((s, r) => s + r.confidenceScore, 0) / group.variantRows.length
              return (
                <div
                  className={['h-full rounded-full', avg >= 0.9 ? 'bg-emerald-400' : avg >= 0.6 ? 'bg-amber-400' : 'bg-rose-400'].join(' ')}
                  style={{ width: `${Math.round(avg * 100)}%` }}
                />
              )
            })()}
          </div>
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums w-7 text-right shrink-0">
            {(group.variantRows.reduce((s, r) => s + r.confidenceScore, 0) / group.variantRows.length).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ShopifyGridView({ rows }: ShopifyGridViewProps) {
  const products = useMemo(() => buildProductGroups(rows), [rows])

  if (products.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-20">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <span className="text-slate-400 text-xl">🛍</span>
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500">No products to display</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
        {products.map((group) => (
          <ProductGroupCard key={group.handle} group={group} />
        ))}
      </div>
    </div>
  )
}
