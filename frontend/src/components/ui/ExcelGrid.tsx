import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react'
import { ChevronUp, ChevronDown, RotateCcw, Save, MoreVertical, RefreshCw } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'

export interface GridRow {
  id: string
  rowIndex: number
  status: 'correct' | 'failed'
  confidenceScore: number
  data: Record<string, string>
  errorFields?: string[]
  cellWarnings?: Record<string, string>
  cellSeverity?: Record<string, 'error' | 'warning'>
  edited?: boolean
}

interface ExcelGridProps {
  rows: GridRow[]
  onSave: (editedRows: GridRow[]) => void
  onRetryRow?: (rowId: string) => Promise<void>
}

interface ActiveCell {
  rowId: string
  col: string
}

interface SortState {
  col: string
  dir: 'asc' | 'desc'
}

interface TooltipState {
  x: number
  y: number
  msg: string
  severity: 'error' | 'warning'
}

const SHOPIFY_COL_ORDER = [
  'handle', 'title', 'body_html', 'vendor', 'category', 'product_type', 'tags', 'status',
  'options', 'option1', 'option2', 'option3',
  'variant_title', 'sku', 'price', 'compare_at_price',
  'weight', 'weight_unit',
  'inventory_management', 'inventory_quantity', 'inventory_policy', 'fulfillment_service',
  'requires_shipping', 'taxable', 'barcode',
  'images', 'variant_image',
  'seo_title', 'seo_description',
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

// ---------------------------------------------------------------------------
// ConfidenceBar — memoized so it never re-renders unless value changes
// ---------------------------------------------------------------------------
const ConfidenceBar = memo(function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 90 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums w-8 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  )
})

// ---------------------------------------------------------------------------
// MemoCell — re-renders only when its own data/state changes.
// KEY: editingValue is passed as '' for non-active cells so keystrokes in
// the active cell do NOT trigger re-renders in every other cell.
// ---------------------------------------------------------------------------
interface CellProps {
  col: string
  rowId: string
  cellValue: string
  isActive: boolean
  cellEdited: boolean
  isErrorField: boolean
  warningMsg: string | undefined
  severity: 'error' | 'warning' | null
  editingValue: string           // always '' when !isActive — keeps prop stable
  inputRef: React.RefObject<HTMLInputElement>
  onCellClick: (col: string, currentValue: string) => void
  onTooltipShow: (x: number, y: number, msg: string, sev: 'error' | 'warning') => void
  onTooltipHide: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, col: string) => void
  onBlur: () => void
  onEditChange: (v: string) => void
}

const MemoCell = memo(function MemoCell({
  col, cellValue, isActive, cellEdited, isErrorField, warningMsg, severity,
  editingValue, inputRef, onCellClick, onTooltipShow, onTooltipHide,
  onKeyDown, onBlur, onEditChange,
}: CellProps) {
  const isWarning = severity === 'warning'

  const borderClass = isActive
    ? 'outline outline-2 outline-blue-500 z-10 border-slate-200 dark:border-slate-700'
    : isErrorField && !isWarning
      ? 'border-rose-300 dark:border-rose-700'
      : isErrorField && isWarning
        ? 'border-amber-300 dark:border-amber-600'
        : 'border-slate-200 dark:border-slate-700'

  const bgClass = isActive
    ? 'bg-white dark:bg-slate-800'
    : cellEdited
      ? 'bg-amber-50 dark:bg-amber-950/30'
      : isErrorField && !isWarning
        ? 'bg-rose-50/60 dark:bg-rose-950/30'
        : isErrorField && isWarning
          ? 'bg-amber-50/60 dark:bg-amber-950/20'
          : ''

  const dotClass = isWarning
    ? 'bg-amber-400 dark:bg-amber-500'
    : 'bg-rose-400 dark:bg-rose-500'

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
      className={['border px-0 py-0 relative cursor-text', borderClass, bgClass].join(' ')}
      style={{ minWidth: '9rem' }}
      onClick={() => onCellClick(col, cellValue)}
      onMouseEnter={warningMsg && !isActive
        ? (e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onTooltipShow(rect.left + rect.width / 2, rect.top - 6, warningMsg, severity ?? 'error')
          }
        : undefined}
      onMouseLeave={warningMsg ? onTooltipHide : undefined}
    >
      {isErrorField && !isActive && !cellEdited && (
        <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${dotClass} z-10 pointer-events-none`} />
      )}
      {cellEdited && !isActive && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 z-10 pointer-events-none" />
      )}
      {isActive ? (
        <input
          ref={inputRef}
          value={editingValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => onKeyDown(e, col)}
          onBlur={onBlur}
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
})

// ---------------------------------------------------------------------------
// MemoRow — re-renders only when this row's data or active state changes.
// Receives activeCol (null if not the active row) so unrelated rows skip
// re-rendering entirely when the user clicks into a different row.
// ---------------------------------------------------------------------------
interface RowProps {
  row: GridRow
  displayIdx: number
  dataCols: string[]
  activeCol: string | null
  rowEdits: Record<string, string>
  editingValue: string
  isRetrying: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onCellClick: (rowId: string, col: string, currentValue: string) => void
  onTooltipShow: (x: number, y: number, msg: string, sev: 'error' | 'warning') => void
  onTooltipHide: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, col: string) => void
  onBlur: () => void
  onEditChange: (v: string) => void
  onRetryRow?: (rowId: string) => void
}

const MemoRow = memo(function MemoRow({
  row, displayIdx, dataCols, activeCol, rowEdits, editingValue, isRetrying,
  inputRef, onCellClick, onTooltipShow, onTooltipHide, onKeyDown, onBlur, onEditChange, onRetryRow,
}: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const isCorrect = row.status === 'correct'
  const rowBg = isCorrect ? 'bg-white dark:bg-slate-900' : 'bg-rose-50/30 dark:bg-rose-950/10'

  return (
    <tr className={`${rowBg} group`}>
      {/* Row number */}
      <td
        className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-right font-mono text-slate-400 dark:text-slate-500 select-none"
        style={{ minWidth: '3rem' }}
      >
        {displayIdx + 1}
      </td>

      {/* Status pill */}
      <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 whitespace-nowrap">
        {isCorrect ? (
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
      <td className="border border-slate-200 dark:border-slate-700 px-3 py-2" style={{ minWidth: '8rem' }}>
        <ConfidenceBar value={row.confidenceScore} />
      </td>

      {/* Actions — three-dot menu */}
      <td className="border border-slate-200 dark:border-slate-700 px-2 py-2 text-center" style={{ minWidth: '2.5rem' }}>
        <div className="relative inline-block" ref={menuRef}>
          <button
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Row actions"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[9rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1">
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isRetrying}
                onClick={() => {
                  setMenuOpen(false)
                  onRetryRow?.(row.id)
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin text-blue-500' : 'text-slate-400'}`} />
                {isRetrying ? 'Retrying…' : 'Retry row'}
              </button>
            </div>
          )}
        </div>
      </td>

      {/* Data cells */}
      {dataCols.map((col) => {
        const isActive     = activeCol === col
        const cellEdited   = col in rowEdits
        const cellValue    = rowEdits[col] ?? row.data[col] ?? ''
        const isErrorField = row.errorFields?.includes(col) ?? false
        const warningMsg   = row.cellWarnings?.[col]
        const severity     = row.cellSeverity?.[col] ?? (isErrorField ? 'error' : null)

        return (
          <MemoCell
            key={col}
            col={col}
            rowId={row.id}
            cellValue={cellValue}
            isActive={isActive}
            cellEdited={cellEdited}
            isErrorField={isErrorField}
            warningMsg={warningMsg}
            severity={severity}
            editingValue={isActive ? editingValue : ''}
            inputRef={inputRef}
            onCellClick={(c, v) => onCellClick(row.id, c, v)}
            onTooltipShow={onTooltipShow}
            onTooltipHide={onTooltipHide}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            onEditChange={onEditChange}
          />
        )
      })}
    </tr>
  )
})

// ---------------------------------------------------------------------------
// ExcelGrid
// ---------------------------------------------------------------------------
export default function ExcelGrid({ rows, onSave, onRetryRow }: ExcelGridProps) {
  const [editMap, setEditMap]           = useState<Record<string, Record<string, string>>>({})
  const [activeCell, setActiveCell]     = useState<ActiveCell | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [sort, setSort]                 = useState<SortState | null>(null)
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [tooltip, setTooltip]           = useState<TooltipState | null>(null)
  const [retryingRows, setRetryingRows] = useState<Set<string>>(new Set())

  const inputRef    = useRef<HTMLInputElement>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)

  // Mirrors of state used inside stable callbacks — avoids stale closures
  // without adding them as useCallback deps (which would recreate the fn every render)
  const activeCellRef    = useRef(activeCell)
  const editingValueRef  = useRef(editingValue)
  const sortedRowsRef    = useRef<GridRow[]>([])
  activeCellRef.current   = activeCell
  editingValueRef.current = editingValue

  const dataCols = useMemo(() => deriveColumns(rows), [rows])

  const displayRows = useMemo(() =>
    rows.map((row) => {
      const overrides = editMap[row.id] ?? {}
      return { ...row, data: { ...row.data, ...overrides }, edited: Object.keys(overrides).length > 0 }
    }),
  [rows, editMap])

  const sortedRows = useMemo(() =>
    sort
      ? [...displayRows].sort((a, b) => {
          let aVal: string, bVal: string
          if (sort.col === '__status') {
            aVal = a.status; bVal = b.status
          } else if (sort.col === '__confidence') {
            aVal = String(a.confidenceScore); bVal = String(b.confidenceScore)
          } else {
            aVal = a.data[sort.col] ?? ''; bVal = b.data[sort.col] ?? ''
          }
          const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' })
          return sort.dir === 'asc' ? cmp : -cmp
        })
      : displayRows,
  [displayRows, sort])

  sortedRowsRef.current = sortedRows

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  const totalEdited = useMemo(
    () => Object.values(editMap).reduce((sum, cols) => sum + Object.keys(cols).length, 0),
    [editMap]
  )

  useEffect(() => {
    if (activeCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [activeCell])

  // Stable commitEdit — only depends on rows (not activeCell/editingValue)
  const commitEdit = useCallback((rowId: string, col: string, value: string) => {
    const originalRow = rows.find((r) => r.id === rowId)
    if (!originalRow) return
    const original = originalRow.data[col] ?? ''
    setEditMap((prev) => {
      const rowEdits = { ...(prev[rowId] ?? {}) }
      if (value === original) {
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
  }, [rows])

  // Stable handlers using refs for current activeCell / editingValue
  const handleCellClick = useCallback((rowId: string, col: string, currentValue: string) => {
    const prev = activeCellRef.current
    if (prev) commitEdit(prev.rowId, prev.col, editingValueRef.current)
    setActiveCell({ rowId, col })
    setEditingValue(currentValue)
  }, [commitEdit])

  const handleBlur = useCallback(() => {
    const cell = activeCellRef.current
    if (cell) {
      commitEdit(cell.rowId, cell.col, editingValueRef.current)
      setActiveCell(null)
    }
  }, [commitEdit])

  const handleKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    col: string,
  ) => {
    const cell = activeCellRef.current
    if (!cell) return
    const { rowId } = cell

    if (e.key === 'Escape') {
      const originalRow = sortedRowsRef.current.find((r) => r.id === rowId)
      setEditingValue(originalRow?.data[col] ?? '')
      setEditMap((prev) => {
        const rowEdits = { ...(prev[rowId] ?? {}) }
        delete rowEdits[col]
        if (Object.keys(rowEdits).length === 0) {
          const next = { ...prev }; delete next[rowId]; return next
        }
        return { ...prev, [rowId]: rowEdits }
      })
      setActiveCell(null)
      return
    }

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      commitEdit(rowId, col, editingValueRef.current)

      const sorted = sortedRowsRef.current
      const colIdx = dataCols.indexOf(col)
      const rowIdx = sorted.findIndex((r) => r.id === rowId)

      let nextRowIdx = rowIdx, nextColIdx = colIdx
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          nextColIdx = colIdx - 1
          if (nextColIdx < 0) { nextColIdx = dataCols.length - 1; nextRowIdx = rowIdx - 1 }
        } else {
          nextColIdx = colIdx + 1
          if (nextColIdx >= dataCols.length) { nextColIdx = 0; nextRowIdx = rowIdx + 1 }
        }
      } else {
        nextRowIdx = rowIdx + 1
      }

      if (nextRowIdx >= 0 && nextRowIdx < sorted.length) {
        const nextRow = sorted[nextRowIdx]
        const nextCol = dataCols[nextColIdx] ?? dataCols[0]
        const nextVal = (editMap[nextRow.id]?.[nextCol] ?? nextRow.data[nextCol]) || ''
        setActiveCell({ rowId: nextRow.id, col: nextCol })
        setEditingValue(nextVal)
      } else {
        setActiveCell(null)
      }
    }
  }, [dataCols, commitEdit, editMap])

  const handleTooltipShow = useCallback((x: number, y: number, msg: string, sev: 'error' | 'warning') => {
    setTooltip({ x, y, msg, severity: sev })
  }, [])

  const handleTooltipHide = useCallback(() => setTooltip(null), [])
  const handleEditChange  = useCallback((v: string) => setEditingValue(v), [])

  function handleSort(col: string) {
    setSort((prev) => {
      if (prev?.col === col) return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { col, dir: 'asc' }
    })
  }

  const handleSave = useCallback(() => {
    const editedRows = rows
      .filter((row) => editMap[row.id])
      .map((row) => ({ ...row, data: { ...row.data, ...(editMap[row.id] ?? {}) }, edited: true }))
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

  const handleRetryRow = useCallback(async (rowId: string) => {
    if (!onRetryRow) return
    // Strip variant suffix to get the real backend id
    const backendId = rowId.replace(/_\d+$/, '')
    setRetryingRows((prev) => new Set(prev).add(backendId))
    try {
      await onRetryRow(backendId)
    } finally {
      setRetryingRows((prev) => {
        const next = new Set(prev)
        next.delete(backendId)
        return next
      })
    }
  }, [onRetryRow])

  function SortIcon({ col }: { col: string }) {
    if (sort?.col !== col) return <ChevronDown className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-50" />
    return sort.dir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-slate-500 dark:text-slate-400" />
      : <ChevronDown className="w-3 h-3 text-slate-500 dark:text-slate-400" />
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* Grid wrapper — both axes scrollable */}
      <div ref={scrollRef} className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
        <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
          {/* HEADER */}
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-30 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-right font-medium text-slate-400 dark:text-slate-400 select-none"
                style={{ minWidth: '3rem' }}
              >#</th>
              <th
                className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                style={{ minWidth: '6rem' }}
                onClick={() => handleSort('__status')}
              >
                <div className="flex items-center gap-1">Status <SortIcon col="__status" /></div>
              </th>
              <th
                className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                style={{ minWidth: '8rem' }}
                onClick={() => handleSort('__confidence')}
              >
                <div className="flex items-center gap-1">Confidence <SortIcon col="__confidence" /></div>
              </th>
              <th
                className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap select-none text-center"
                style={{ minWidth: '2.5rem' }}
              />
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

          {/* BODY — virtualized */}
          <tbody>
            {rowVirtualizer.getVirtualItems()[0]?.start > 0 && (
              <tr style={{ height: rowVirtualizer.getVirtualItems()[0].start }}>
                <td colSpan={dataCols.length + 4} />
              </tr>
            )}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = sortedRows[virtualRow.index]
              const backendId = row.id.replace(/_\d+$/, '')
              return (
                <MemoRow
                  key={row.id}
                  row={row}
                  displayIdx={virtualRow.index}
                  dataCols={dataCols}
                  activeCol={activeCell?.rowId === row.id ? activeCell.col : null}
                  rowEdits={editMap[row.id] ?? {}}
                  editingValue={activeCell?.rowId === row.id ? editingValue : ''}
                  isRetrying={retryingRows.has(backendId)}
                  inputRef={inputRef}
                  onCellClick={handleCellClick}
                  onTooltipShow={handleTooltipShow}
                  onTooltipHide={handleTooltipHide}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  onEditChange={handleEditChange}
                  onRetryRow={onRetryRow ? handleRetryRow : undefined}
                />
              )
            })}
            {(() => {
              const items = rowVirtualizer.getVirtualItems()
              const lastItem = items[items.length - 1]
              const paddingBottom = lastItem ? rowVirtualizer.getTotalSize() - lastItem.end : 0
              return paddingBottom > 0 ? (
                <tr style={{ height: paddingBottom }}>
                  <td colSpan={dataCols.length + 4} />
                </tr>
              ) : null
            })()}
          </tbody>
        </table>
      </div>

      {/* Bottom action bar */}
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

      {/* Cell warning tooltip */}
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
