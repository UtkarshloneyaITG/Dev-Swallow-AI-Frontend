import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { AgGridReact } from 'ag-grid-react'
import {
  ModuleRegistry,
  ClientSideRowModelModule,
  TextEditorModule,
  ValidationModule,
  type ColDef,
  type ICellRendererParams,
  type GetRowIdParams,
  type CellValueChangedEvent,
  type GridReadyEvent,
  type GridApi,
} from 'ag-grid-community'
import { RotateCcw, Save, RefreshCw } from 'lucide-react'
import 'ag-grid-community/styles/ag-grid.css'

// Register only the modules we need (tree-shakeable)
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextEditorModule,
  ValidationModule,
])

// ---------------------------------------------------------------------------
// Public types (unchanged so ResultsGrid.tsx needs no edits)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Shopify column ordering hint
// ---------------------------------------------------------------------------
// Matches exact Shopify CSV export column order (flat snake_case keys)
const SHOPIFY_COL_ORDER = [
  'handle',
  'command',
  'title',
  'body_html',
  'vendor',
  'category', 'product_category',
  'product_type',
  'tags',
  'tags_command',
  'published',
  'option1_name', 'option1',
  'option2_name', 'option2',
  'option3_name', 'option3',
  'sku',
  'grams', 'weight_grams',
  'inventory_management',
  'inventory_quantity',
  'inventory_policy',
  'fulfillment_service',
  'price',
  'compare_at_price',
  'requires_shipping',
  'taxable',
  'barcode',
  'image_src',
  'image_position',
  'image_alt',
  'gift_card',
  'seo_title',
  'seo_description',
  'variant_image',
  'weight_unit',
  'country_of_origin', 'variant_country_of_origin', 'origin_country',
  'tax_code',
  'cost_per_item',
  'status',
  // leftover / non-Shopify keys go after
  'options', 'variants', 'images', 'metafields',
]

function deriveColumns(rows: GridRow[]): string[] {
  const colSet = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row.data)) colSet.add(key)
  const ordered = SHOPIFY_COL_ORDER.filter((c) => colSet.has(c))
  const rest    = Array.from(colSet).filter((c) => !SHOPIFY_COL_ORDER.includes(c))
  return [...ordered, ...rest]
}

// ---------------------------------------------------------------------------
// Tooltip state
// ---------------------------------------------------------------------------
interface TooltipState { x: number; y: number; msg: string; severity: 'error' | 'warning' }

// ---------------------------------------------------------------------------
// Flat row shape fed into AG Grid
// Each field from `data` is spread at the top level so AG Grid can access it.
// We keep the original GridRow reference inside __meta for callbacks.
// ---------------------------------------------------------------------------
interface FlatRow {
  __id: string
  __meta: GridRow
  [col: string]: unknown
}

function toFlatRow(row: GridRow): FlatRow {
  return { __id: row.id, __meta: row, ...row.data }
}

// ---------------------------------------------------------------------------
// Cell class rules — evaluated by AG Grid lazily per cell, replacing cellStyle
// These CSS classes are injected once via <style> in the render output.
// ---------------------------------------------------------------------------
function makeCellClassRules(col: string, editedMapRef: { current: Record<string, Set<string>> }) {
  return {
    'cell-edited':   (p: { data?: FlatRow }) => !!(p.data && editedMapRef.current[p.data.__meta.id]?.has(col)),
    'cell-error':    (p: { data?: FlatRow }) => {
      if (!p.data) return false
      const meta = p.data.__meta
      if (meta.status !== 'failed') return false
      const sev = meta.cellSeverity?.[col]
      if (sev) return sev === 'error'
      return meta.errorFields?.includes(col) ?? false
    },
    'cell-warning':  (p: { data?: FlatRow }) => {
      if (!p.data) return false
      const meta = p.data.__meta
      if (meta.status !== 'failed') return false
      return (meta.cellSeverity?.[col] ?? 'error') === 'warning' && (meta.errorFields?.includes(col) ?? false)
    },
  }
}

// ---------------------------------------------------------------------------
// Custom cell renderer — handles dot indicator + tooltip trigger
// ---------------------------------------------------------------------------
interface DataCellProps {
  value: unknown
  data: FlatRow
  col: string
  setTooltip: React.Dispatch<React.SetStateAction<TooltipState | null>>
  editedMap: { current: Record<string, Set<string>> }
}

function DataCellRenderer({ value, data, col, setTooltip, editedMap }: DataCellProps) {
  const meta     = (data as FlatRow).__meta
  const isFailed = meta.status === 'failed'
  const isError  = isFailed && (meta.errorFields?.includes(col) ?? false)
  const severity = meta.cellSeverity?.[col] ?? (isError ? 'error' : null)
  const msg      = meta.cellWarnings?.[col]
  const isEdited = editedMap.current[meta.id]?.has(col) ?? false

  const dotColor = severity === 'warning' ? '#f59e0b' : '#f43f5e'
  const textColor = isEdited
    ? '#92400e'
    : severity === 'error'
      ? '#be123c'
      : severity === 'warning'
        ? '#92400e'
        : undefined

  return (
    <div
      className="relative w-full h-full flex items-center px-2 font-mono text-xs overflow-hidden"
      style={{ color: textColor }}
      onMouseEnter={msg ? (e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 6, msg, severity: severity ?? 'error' })
      } : undefined}
      onMouseLeave={msg ? () => setTooltip(null) : undefined}
    >
      {isError && !isEdited && (
        <span
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full z-10 pointer-events-none"
          style={{ background: dotColor }}
        />
      )}
      {isEdited && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 z-10 pointer-events-none" />
      )}
      <span className="truncate">
        {value ? String(value) : <span className="text-slate-300 italic">—</span>}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status cell renderer
// ---------------------------------------------------------------------------
function StatusRenderer({ data }: ICellRendererParams) {
  const meta    = (data as FlatRow).__meta
  const correct = meta.status === 'correct'
  return (
    <div className="swallow-status-cell">
      <span className={correct ? 'swallow-badge-correct' : 'swallow-badge-failed'}>
        <span className={correct ? 'swallow-dot-correct' : 'swallow-dot-failed'} />
        {correct ? 'correct' : 'failed'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confidence cell renderer
// ---------------------------------------------------------------------------
function ConfidenceRenderer({ data }: ICellRendererParams) {
  const pct = Math.round((data as FlatRow).__meta.confidenceScore * 100)
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <div className="flex items-center gap-2 px-3 w-full h-full">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums w-7 text-right shrink-0">
        {(data as FlatRow).__meta.confidenceScore.toFixed(2)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Actions cell renderer (retry button)
// ---------------------------------------------------------------------------
interface ActionRendererProps extends ICellRendererParams {
  onRetry?: (id: string) => void
  retryingRows: Set<string>
}

function ActionsRenderer({ data, onRetry, retryingRows }: ActionRendererProps) {
  const meta      = (data as FlatRow).__meta
  const backendId = meta.id.replace(/_\d+$/, '')
  const retrying  = retryingRows.has(backendId)

  if (!onRetry) return null
  return (
    <div className="flex items-center justify-center h-full">
      <button
        disabled={retrying}
        onClick={() => onRetry(meta.id)}
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
        title="Retry row"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin text-blue-500' : ''}`} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ExcelGrid component
// ---------------------------------------------------------------------------
export default function ExcelGrid({ rows, onSave, onRetryRow }: ExcelGridProps) {
  const gridRef  = useRef<AgGridReact<FlatRow>>(null)
  const apiRef   = useRef<GridApi<FlatRow> | null>(null)

  // editedMap: rowId → set of edited col keys
  const [editedMap,   setEditedMap]   = useState<Record<string, Set<string>>>({})
  // Stable ref — colDefs/cellClassRules/DataCellRenderer read from this so colDefs
  // never need to be recreated on each cell edit (prevents full grid re-render).
  const editedMapRef = useRef<Record<string, Set<string>>>({})
  const [tooltip,     setTooltip]     = useState<TooltipState | null>(null)
  const [retryingRows,setRetryingRows]= useState<Set<string>>(new Set())

  const totalEdited = useMemo(
    () => Object.values(editedMap).reduce((s, cols) => s + cols.size, 0),
    [editedMap],
  )

  // Derive flat rows for AG Grid
  const flatRows = useMemo(() => rows.map(toFlatRow), [rows])

  // Derive data columns
  const dataCols = useMemo(() => deriveColumns(rows), [rows])

  // Column definitions
  const colDefs = useMemo<ColDef<FlatRow>[]>(() => {
    const fixed: ColDef<FlatRow>[] = [
      {
        headerName: '#',
        field: '__id' as keyof FlatRow as string,
        width: 52,
        pinned: 'left',
        sortable: false,
        editable: false,
        suppressMovable: true,
        headerClass: '!justify-end',
        cellStyle: { justifyContent: 'flex-end', padding: '0 8px', fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8' },
        valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
      },
      {
        headerName: '',
        colId: '__actions',
        width: 44,
        pinned: 'left',
        sortable: false,
        editable: false,
        suppressMovable: true,
        cellRenderer: 'actionsRenderer',
        cellStyle: { padding: 0, justifyContent: 'center' },
      },
      {
        headerName: 'Status',
        colId: '__status',
        width: 100,
        sortable: true,
        editable: false,
        cellRenderer: 'statusRenderer',
        valueGetter: (p) => (p.data as FlatRow).__meta.status,
        cellStyle: { padding: 0 },
      },
      {
        headerName: 'Confidence',
        colId: '__confidence',
        width: 140,
        sortable: true,
        editable: false,
        cellRenderer: 'confidenceRenderer',
        valueGetter: (p) => (p.data as FlatRow).__meta.confidenceScore,
        cellStyle: { padding: 0 },
      },
    ]

    const data: ColDef<FlatRow>[] = dataCols.map((col) => ({
      headerName: col.replace(/_/g, ' '),
      field: col,
      width: 160,
      editable: true,
      sortable: true,
      resizable: true,
      wrapText: false,
      cellRenderer: 'dataCellRenderer',
      cellRendererParams: { col, setTooltip, editedMap: editedMapRef },
      cellClassRules: makeCellClassRules(col, editedMapRef),
      valueGetter: (p) => (p.data as FlatRow)?.[col] ?? '',
      valueSetter: (p) => {
        ;(p.data as FlatRow)[col] = p.newValue
        return true
      },
    }))

    return [...fixed, ...data]
  }, [dataCols])

  // Track edits
  const onCellValueChanged = useCallback((e: CellValueChangedEvent<FlatRow>) => {
    if (!e.colDef.field || e.colDef.field.startsWith('__')) return
    const col      = e.colDef.field
    const meta     = (e.data as FlatRow).__meta
    const original = meta.data[col] ?? ''
    const newVal   = e.newValue ?? ''

    lastEditedId.current = meta.id

    setEditedMap((prev) => {
      const colSet = new Set(prev[meta.id] ?? [])
      if (newVal === original) {
        colSet.delete(col)
      } else {
        colSet.add(col)
      }
      const next = { ...prev }
      if (colSet.size === 0) delete next[meta.id]
      else next[meta.id] = colSet
      // Keep ref in sync so colDefs/cellClassRules always see latest state
      editedMapRef.current = next
      return next
    })
  }, [])

  // Refresh only the last-edited row instead of the entire grid
  const lastEditedId = useRef<string | null>(null)
  useEffect(() => {
    const api = apiRef.current
    if (!api || !lastEditedId.current) return
    const id = lastEditedId.current
    lastEditedId.current = null
    api.forEachNode((node) => {
      if ((node.data as FlatRow)?.__meta.id === id) {
        api.refreshCells({ rowNodes: [node], force: true })
      }
    })
  }, [editedMap])

  const handleGridReady = useCallback((e: GridReadyEvent) => {
    apiRef.current = e.api
  }, [])

  const handleRetryRow = useCallback(async (rowId: string) => {
    if (!onRetryRow) return
    const backendId = rowId.replace(/_\d+$/, '')
    setRetryingRows((prev) => new Set(prev).add(backendId))
    try {
      await onRetryRow(backendId)
    } finally {
      setRetryingRows((prev) => { const n = new Set(prev); n.delete(backendId); return n })
    }
  }, [onRetryRow])

  function handleSave() {
    if (!apiRef.current) return
    // Always read from the ref — it is kept in sync with every cell edit
    // and is never stale (unlike the React state which may lag one render).
    const snapshot = editedMapRef.current
    const edited: GridRow[] = []
    apiRef.current.forEachNode((node) => {
      const flat = node.data as FlatRow
      const meta = flat.__meta
      const editedCols = snapshot[meta.id]
      if (!editedCols || editedCols.size === 0) return
      const updatedData = { ...meta.data }
      for (const col of Array.from(editedCols)) {
        updatedData[col] = String(flat[col] ?? '')
      }
      edited.push({ ...meta, data: updatedData, edited: true })
    })
    if (edited.length === 0) return
    editedMapRef.current = {}
    setEditedMap({})
    onSave(edited)
  }

  function handleReset() {
    if (!apiRef.current) return
    const restored: FlatRow[] = []
    apiRef.current.forEachNode((node) => {
      if (node.data) restored.push(toFlatRow((node.data as FlatRow).__meta))
    })
    apiRef.current.applyTransaction({ update: restored })
    editedMapRef.current = {}
    setEditedMap({})
    toast.info('Changes reset to original values')
  }

  const getRowId = useCallback((p: GetRowIdParams<FlatRow>) => p.data.__id, [])

  // Memoize components map — prevents AG Grid re-instantiating renderers on every render
  const gridComponents = useMemo(() => ({
    actionsRenderer:    (p: ICellRendererParams) =>
      ActionsRenderer({ ...p, onRetry: onRetryRow ? handleRetryRow : undefined, retryingRows }),
    statusRenderer:     StatusRenderer,
    confidenceRenderer: ConfidenceRenderer,
    dataCellRenderer:   DataCellRenderer,
  }), [handleRetryRow, onRetryRow, retryingRows])

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* AG Grid container */}
      <div
        className="flex-1 min-h-0 rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border-end, rgba(0,0,0,0.10))' }}
      >
        <style>{`
          /* ── Light mode ─────────────────────────────────────────── */
          .ag-theme-swallow {
            --ag-background-color:              #ffffff;
            --ag-foreground-color:              #374151;
            --ag-header-background-color:       #f1f5f9;
            --ag-header-foreground-color:       #6b7280;
            --ag-border-color:                  #e2e8f0;
            --ag-row-border-color:              #e2e8f0;
            --ag-row-border-width:              1px;
            --ag-row-border-style:              solid;
            --ag-cell-horizontal-border:        solid 1px #e2e8f0;
            --ag-row-hover-color:               #f8fafc;
            --ag-selected-row-background-color: #eff6ff;
            --ag-odd-row-background-color:      #ffffff;
            --ag-cell-horizontal-padding:       0px;
            --ag-cell-vertical-padding:         0px;
            --ag-row-height:                    36px;
            --ag-header-height:                 38px;
            --ag-font-size:                     12px;
            --ag-font-family:                   ui-monospace, SFMono-Regular, Menlo, monospace;
            --ag-header-column-separator-display: block;
            --ag-header-column-separator-height:  60%;
            --ag-header-column-separator-width:   1px;
            --ag-header-column-separator-color:   #cbd5e1;
            --ag-header-column-resize-handle-display: block;
            --ag-header-column-resize-handle-height:  40%;
            --ag-header-column-resize-handle-width:   2px;
            --ag-header-column-resize-handle-color:   #94a3b8;
          }

          /* ── Dark mode ───────────────────────────────────────────── */
          .dark .ag-theme-swallow {
            --ag-background-color:              #080808;
            --ag-foreground-color:              #d1d5db;
            --ag-header-background-color:       #141416;
            --ag-header-foreground-color:       #9ca3af;
            --ag-border-color:                  rgba(255,255,255,0.08);
            --ag-row-border-color:              rgba(255,255,255,0.06);
            --ag-cell-horizontal-border:        solid 1px rgba(255,255,255,0.06);
            --ag-row-hover-color:               #1a1a1c;
            --ag-selected-row-background-color: rgba(255,255,255,0.07);
            --ag-odd-row-background-color:      #080808;
            --ag-header-column-separator-color: rgba(255,255,255,0.08);
            --ag-header-column-resize-handle-color: rgba(255,255,255,0.20);
          }

          /* ── Remove double outer border ─────────────────────────── */
          .ag-theme-swallow .ag-root-wrapper { border: none !important; }

          /* ── Every cell: flex, vertically centered, explicit borders */
          .ag-theme-swallow .ag-cell {
            display: flex !important;
            align-items: center !important;
            padding: 0 !important;
            border-right: 1px solid var(--ag-border-color) !important;
            border-bottom: 1px solid var(--ag-row-border-color) !important;
            overflow: hidden;
          }

          /* ── Header cells: flex centered + right border ─────────── */
          .ag-theme-swallow .ag-header-cell {
            display: flex !important;
            align-items: center !important;
            border-right: 1px solid var(--ag-border-color) !important;
          }
          .ag-theme-swallow .ag-header-cell-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 0 8px;
            width: 100%;
          }

          /* ── Inline editor ───────────────────────────────────────── */
          .ag-theme-swallow .ag-cell-inline-editing {
            display: flex !important;
            align-items: center !important;
            padding: 0 !important;
            background: var(--ag-background-color) !important;
            outline: 2px solid #3b82f6 !important;
            outline-offset: -2px;
            border-radius: 0;
            overflow: visible !important;
            z-index: 10;
          }
          .ag-theme-swallow .ag-cell-inline-editing input,
          .ag-theme-swallow .ag-cell-inline-editing .ag-input-field-input {
            width: 100%;
            height: 100%;
            padding: 0 8px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 12px;
            color: var(--ag-foreground-color);
            background: transparent;
            border: none !important;
            outline: none !important;
          }

          /* ── Cell highlight classes (replaces per-cell cellStyle functions) ── */
          .ag-theme-swallow .ag-cell.cell-edited   { background: rgb(255 251 235 / 0.8) !important; }
          .ag-theme-swallow .ag-cell.cell-error    { background: rgb(255 241 242 / 0.7) !important; }
          .ag-theme-swallow .ag-cell.cell-warning  { background: rgb(255 251 235 / 0.6) !important; }
          .dark .ag-theme-swallow .ag-cell.cell-edited  { background: rgb(120 100 20 / 0.25) !important; }
          .dark .ag-theme-swallow .ag-cell.cell-error   { background: rgb(120 20 30 / 0.3)  !important; }
          .dark .ag-theme-swallow .ag-cell.cell-warning { background: rgb(120 80 10 / 0.25) !important; }

          /* ── Sort icon color ────────────────────────────────────── */
          .ag-theme-swallow .ag-sort-indicator-icon .ag-icon { color: #64748b; }

          /* ── Pinned column shadow ───────────────────────────────── */
          .ag-theme-swallow .ag-pinned-left-cols-container {
            box-shadow: 2px 0 4px -1px rgba(0,0,0,0.08);
          }
          .dark .ag-theme-swallow .ag-pinned-left-cols-container {
            box-shadow: 2px 0 6px -1px rgba(0,0,0,0.4);
          }

          /* ── Status badge ────────────────────────────────────────── */
          .swallow-status-cell {
            display: flex;
            align-items: center;
            width: 100%;
            height: 100%;
            padding: 0 8px;
          }
          .swallow-badge-correct,
          .swallow-badge-failed {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 500;
            font-family: inherit;
            white-space: nowrap;
          }
          /* Light */
          .swallow-badge-correct { background: #d1fae5; color: #065f46; }
          .swallow-badge-failed  { background: #ffe4e6; color: #9f1239; }
          .swallow-dot-correct   { width: 6px; height: 6px; border-radius: 50%; background: #10b981; flex-shrink: 0; }
          .swallow-dot-failed    { width: 6px; height: 6px; border-radius: 50%; background: #f43f5e; flex-shrink: 0; }
          /* Dark */
          .dark .swallow-badge-correct { background: rgba(16,185,129,0.15); color: #34d399; }
          .dark .swallow-badge-failed  { background: rgba(244,63,94,0.15);  color: #fb7185; }
          .dark .swallow-dot-correct   { background: #34d399; }
          .dark .swallow-dot-failed    { background: #fb7185; }
        `}</style>

        <AgGridReact<FlatRow>
          ref={gridRef}
          className="ag-theme-swallow h-full w-full"
          rowData={flatRows}
          columnDefs={colDefs}
          getRowId={getRowId}
          onGridReady={handleGridReady}
          onCellValueChanged={onCellValueChanged}
          suppressMovableColumns={false}
          suppressColumnVirtualisation={false}
          animateRows={false}
          rowHeight={36}
          headerHeight={38}
          defaultColDef={{
            sortable: true,
            resizable: true,
            editable: false,
            suppressHeaderMenuButton: true,
            icons: {
              sortAscending: () => {
                const el = document.createElement('span')
                el.innerHTML = '↑'
                el.className = 'text-slate-500 text-xs'
                return el
              },
              sortDescending: () => {
                const el = document.createElement('span')
                el.innerHTML = '↓'
                el.className = 'text-slate-500 text-xs'
                return el
              },
            },
          }}
          components={gridComponents}
        />
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

      {/* Cell warning tooltip — fixed-position, never clipped by scroll */}
      {tooltip && (() => {
        const isWarn = tooltip.severity === 'warning'
        const bg     = isWarn ? 'bg-amber-900' : 'bg-rose-900'
        const text   = isWarn ? 'text-amber-100' : 'text-rose-100'
        const dot    = isWarn ? 'bg-amber-400' : 'bg-rose-400'
        const arrow  = isWarn ? 'border-t-amber-900' : 'border-t-rose-900'
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
