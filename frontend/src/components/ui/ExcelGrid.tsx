import { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronUp, ChevronDown, RotateCcw, Save } from 'lucide-react'

export interface GridRow {
  id: string
  rowIndex: number
  status: 'correct' | 'failed'
  confidenceScore: number
  data: Record<string, string>
  errorFields?: string[]
  cellWarnings?: Record<string, string>       // col → tooltip message
  cellSeverity?: Record<string, 'error' | 'warning'>  // col → severity
  edited?: boolean
}

interface ExcelGridProps {
  rows: GridRow[]
  onSave: (editedRows: GridRow[]) => void
}

interface ActiveCell {
  rowId: string
  col: string
}

interface SortState {
  col: string
  dir: 'asc' | 'desc'
}

// Derive ordered column keys from all rows (union of all data keys).
// Columns are sorted to match Shopify's product CSV field order.
// Any extra fields not in the list appear at the end.
const SHOPIFY_COL_ORDER = [
  // Product-level
  'handle', 'title', 'body_html', 'vendor', 'category', 'product_type', 'tags', 'published', 'status',
  // Options
  'options', 'option1', 'option2', 'option3',
  // Variant fields
  'variant_title', 'sku', 'weight', 'weight_unit',
  'inventory_management', 'inventory_quantity', 'inventory_policy', 'fulfillment_service',
  'price', 'compare_at_price', 'requires_shipping', 'taxable', 'barcode',
  // Images
  'images', 'variant_image',
  // SEO
  'seo_title', 'seo_description',
  // Meta
  'metafields',
]

function deriveColumns(rows: GridRow[]): string[] {
  const colSet = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row.data)) colSet.add(key)
  }
  const ordered = SHOPIFY_COL_ORDER.filter((c) => colSet.has(c))
  const rest    = Array.from(colSet).filter((c) => !SHOPIFY_COL_ORDER.includes(c))
  return [...ordered, ...rest]
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 90 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums w-8 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  )
}

export default function ExcelGrid({ rows, onSave }: ExcelGridProps) {
  // editMap: rowId -> { col -> newValue }
  const [editMap, setEditMap] = useState<Record<string, Record<string, string>>>({})
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [sort, setSort] = useState<SortState | null>(null)
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; msg: string; severity: 'error' | 'warning' } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const dataCols = deriveColumns(rows)

  // Build display rows with edits applied
  const displayRows: GridRow[] = rows.map((row) => {
    const overrides = editMap[row.id] ?? {}
    return {
      ...row,
      data: { ...row.data, ...overrides },
      edited: Object.keys(overrides).length > 0,
    }
  })

  // Sort
  const sortedRows = sort
    ? [...displayRows].sort((a, b) => {
        let aVal: string
        let bVal: string
        if (sort.col === '__status') {
          aVal = a.status
          bVal = b.status
        } else if (sort.col === '__confidence') {
          aVal = String(a.confidenceScore)
          bVal = String(b.confidenceScore)
        } else {
          aVal = a.data[sort.col] ?? ''
          bVal = b.data[sort.col] ?? ''
        }
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' })
        return sort.dir === 'asc' ? cmp : -cmp
      })
    : displayRows

  const totalEdited = Object.values(editMap).reduce(
    (sum, cols) => sum + Object.keys(cols).length,
    0
  )

  // Focus input when active cell changes
  useEffect(() => {
    if (activeCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [activeCell])

  function getCellValue(row: GridRow, col: string): string {
    return editMap[row.id]?.[col] ?? row.data[col] ?? ''
  }

  function getOriginalValue(row: GridRow, col: string): string {
    return row.data[col] ?? ''
  }

  function isCellEdited(rowId: string, col: string): boolean {
    return col in (editMap[rowId] ?? {})
  }

  function handleCellClick(row: GridRow, col: string) {
    // Save previous edit value if any
    if (activeCell) {
      commitEdit(activeCell.rowId, activeCell.col, editingValue)
    }
    const current = getCellValue(row, col)
    setActiveCell({ rowId: row.id, col })
    setEditingValue(current)
  }

  function commitEdit(rowId: string, col: string, value: string) {
    // Find original row to compare
    const originalRow = rows.find((r) => r.id === rowId)
    if (!originalRow) return
    const original = originalRow.data[col] ?? ''

    setEditMap((prev) => {
      const rowEdits = { ...(prev[rowId] ?? {}) }
      if (value === original) {
        // Remove the override if it reverts to original
        delete rowEdits[col]
      } else {
        rowEdits[col] = value
      }
      if (Object.keys(rowEdits).length === 0) {
        const next = { ...prev }
        delete next[rowId]
        return next
      }
      return { ...prev, [rowId]: rowEdits }
    })
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    row: GridRow,
    col: string
  ) {
    if (e.key === 'Escape') {
      // Revert
      setEditingValue(getOriginalValue(row, col))
      setEditMap((prev) => {
        const rowEdits = { ...(prev[row.id] ?? {}) }
        delete rowEdits[col]
        if (Object.keys(rowEdits).length === 0) {
          const next = { ...prev }
          delete next[row.id]
          return next
        }
        return { ...prev, [row.id]: rowEdits }
      })
      setActiveCell(null)
      return
    }

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      commitEdit(row.id, col, editingValue)

      const colIdx = dataCols.indexOf(col)
      const rowIdx = sortedRows.findIndex((r) => r.id === row.id)

      let nextRowIdx = rowIdx
      let nextColIdx = colIdx

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          nextColIdx = colIdx - 1
          if (nextColIdx < 0) {
            nextColIdx = dataCols.length - 1
            nextRowIdx = rowIdx - 1
          }
        } else {
          nextColIdx = colIdx + 1
          if (nextColIdx >= dataCols.length) {
            nextColIdx = 0
            nextRowIdx = rowIdx + 1
          }
        }
      } else {
        // Enter: move down
        nextRowIdx = rowIdx + 1
      }

      if (nextRowIdx >= 0 && nextRowIdx < sortedRows.length) {
        const nextRow = sortedRows[nextRowIdx]
        const nextCol = dataCols[nextColIdx] ?? dataCols[0]
        const nextVal = getCellValue(nextRow, nextCol)
        setActiveCell({ rowId: nextRow.id, col: nextCol })
        setEditingValue(nextVal)
      } else {
        setActiveCell(null)
      }
    }
  }

  function handleBlur() {
    if (activeCell) {
      commitEdit(activeCell.rowId, activeCell.col, editingValue)
      setActiveCell(null)
    }
  }

  function handleSort(col: string) {
    setSort((prev) => {
      if (prev?.col === col) {
        return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { col, dir: 'asc' }
    })
  }

  const handleSave = useCallback(() => {
    const editedRows = rows
      .filter((row) => editMap[row.id])
      .map((row) => ({
        ...row,
        data: { ...row.data, ...(editMap[row.id] ?? {}) },
        edited: true,
      }))
    onSave(editedRows)
    setEditMap({})
    setActiveCell(null)
    setShowSaveToast(true)
    setTimeout(() => setShowSaveToast(false), 2000)
  }, [rows, editMap, onSave])

  function handleReset() {
    setEditMap({})
    setActiveCell(null)
    setEditingValue('')
  }

  function SortIcon({ col }: { col: string }) {
    if (sort?.col !== col) {
      return <ChevronDown className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-50" />
    }
    return sort.dir === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-slate-500 dark:text-slate-400" />
    ) : (
      <ChevronDown className="w-3 h-3 text-slate-500 dark:text-slate-400" />
    )
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Grid wrapper — both axes scrollable */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
        <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
          {/* HEADER */}
          <thead>
            <tr>
              {/* Row number header */}
              <th
                className="sticky left-0 top-0 z-30 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-right font-medium text-slate-400 dark:text-slate-400 select-none"
                style={{ minWidth: '3rem' }}
              >
                #
              </th>
              {/* Status header */}
              <th
                className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                style={{ minWidth: '6rem' }}
                onClick={() => handleSort('__status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  <SortIcon col="__status" />
                </div>
              </th>
              {/* Confidence header */}
              <th
                className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                style={{ minWidth: '8rem' }}
                onClick={() => handleSort('__confidence')}
              >
                <div className="flex items-center gap-1">
                  Confidence
                  <SortIcon col="__confidence" />
                </div>
              </th>
              {/* Data column headers */}
              {dataCols.map((col) => (
                <th
                  key={col}
                  className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  style={{ minWidth: '9rem' }}
                  onClick={() => handleSort(col)}
                >
                  <div className="flex items-center gap-1">
                    {col.replace(/_/g, ' ')}
                    <SortIcon col={col} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* BODY */}
          <tbody>
            {sortedRows.map((row, displayIdx) => {
              const isCorrect = row.status === 'correct'
              const rowBg = isCorrect
                ? 'bg-white dark:bg-slate-900'
                : 'bg-rose-50/30 dark:bg-rose-950/10'

              return (
                <tr key={row.id} className={`${rowBg} group`}>
                  {/* Row number */}
                  <td
                    className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-right font-mono text-slate-400 dark:text-slate-500 select-none"
                    style={{ minWidth: '3rem' }}
                  >
                    {displayIdx + 1}
                  </td>

                  {/* Status pill */}
                  <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 whitespace-nowrap">
                    {row.status === 'correct' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        correct
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        failed
                      </span>
                    )}
                  </td>

                  {/* Confidence bar */}
                  <td
                    className="border border-slate-200 dark:border-slate-700 px-3 py-2"
                    style={{ minWidth: '8rem' }}
                  >
                    <ConfidenceBar value={row.confidenceScore} />
                  </td>

                  {/* Data cells */}
                  {dataCols.map((col) => {
                    const isActive =
                      activeCell?.rowId === row.id && activeCell?.col === col
                    const cellEdited = isCellEdited(row.id, col)
                    const isErrorField = row.errorFields?.includes(col) ?? false
                    const warningMsg = row.cellWarnings?.[col]
                    const severity = row.cellSeverity?.[col] ?? (isErrorField ? 'error' : null)
                    const isWarning = severity === 'warning'
                    const cellValue = getCellValue(row, col)

                    // Border class
                    const borderClass = isActive
                      ? 'outline outline-2 outline-blue-500 z-10 border-slate-200 dark:border-slate-700'
                      : isErrorField && !isWarning
                        ? 'border-rose-300 dark:border-rose-700'
                        : isErrorField && isWarning
                          ? 'border-amber-300 dark:border-amber-600'
                          : 'border-slate-200 dark:border-slate-700'

                    // Background class
                    const bgClass = isActive
                      ? 'bg-white dark:bg-slate-800'
                      : cellEdited
                        ? 'bg-amber-50 dark:bg-amber-950/30'
                        : isErrorField && !isWarning
                          ? 'bg-rose-50/60 dark:bg-rose-950/30'
                          : isErrorField && isWarning
                            ? 'bg-amber-50/60 dark:bg-amber-950/20'
                            : ''

                    // Dot color
                    const dotClass = isWarning
                      ? 'bg-amber-400 dark:bg-amber-500'
                      : 'bg-rose-400 dark:bg-rose-500'

                    // Text color
                    const textClass = isErrorField
                      ? isWarning
                        ? 'text-amber-700 dark:text-amber-300 font-medium'
                        : 'text-rose-700 dark:text-rose-300 font-medium'
                      : 'text-slate-700 dark:text-slate-300'

                    const emptyClass = isErrorField
                      ? isWarning
                        ? 'text-amber-400 dark:text-amber-600 italic'
                        : 'text-rose-400 dark:text-rose-600 italic'
                      : 'text-slate-300 dark:text-slate-600 italic'

                    return (
                      <td
                        key={col}
                        className={[
                          'border px-0 py-0 relative cursor-text',
                          borderClass,
                          bgClass,
                        ].join(' ')}
                        style={{ minWidth: '9rem' }}
                        onClick={() => handleCellClick(row, col)}
                        onMouseEnter={warningMsg && !isActive ? (e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 6, msg: warningMsg, severity: severity ?? 'error' })
                        } : undefined}
                        onMouseLeave={warningMsg ? () => setTooltip(null) : undefined}
                      >
                        {/* Severity dot */}
                        {isErrorField && !isActive && !cellEdited && (
                          <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${dotClass} z-10 pointer-events-none`} />
                        )}

                        {/* Edited dot */}
                        {cellEdited && !isActive && (
                          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 z-10 pointer-events-none" />
                        )}

                        {isActive ? (
                          <input
                            ref={inputRef}
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, row, col)}
                            onBlur={handleBlur}
                            className="w-full h-full px-3 py-2 font-mono text-xs bg-white dark:bg-slate-800 outline-none border-0 text-slate-800 dark:text-slate-100"
                            style={{ minWidth: '9rem', minHeight: '2rem' }}
                          />
                        ) : (
                          <span className={`block px-3 py-2 font-mono text-xs truncate max-w-xs ${textClass}`}>
                            {cellValue || <span className={emptyClass}>—</span>}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom action bar — only when there are edits */}
      {totalEdited > 0 && (
        <div className="flex items-center justify-end gap-3 pt-3">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/30 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save Changes ({totalEdited} edited)
          </button>
        </div>
      )}

      {/* Save success toast */}
      {showSaveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-medium shadow-lg shadow-emerald-500/30 flex items-center gap-2 pointer-events-none">
          <span className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-xs">✓</span>
          Changes saved successfully
        </div>
      )}

      {/* Cell warning tooltip — fixed position avoids scroll clipping */}
      {tooltip && (() => {
        const isWarn = tooltip.severity === 'warning'
        const bg    = isWarn ? 'bg-amber-900 dark:bg-amber-950' : 'bg-rose-900 dark:bg-rose-950'
        const text  = isWarn ? 'text-amber-100' : 'text-rose-100'
        const dot   = isWarn ? 'bg-amber-400' : 'bg-rose-400'
        const arrow = isWarn ? 'border-t-amber-900 dark:border-t-amber-950' : 'border-t-rose-900 dark:border-t-rose-950'
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
