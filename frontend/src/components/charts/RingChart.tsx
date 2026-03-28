import { useState, useRef } from 'react'
import {
  PieChart,
  Pie,
  ResponsiveContainer,
} from 'recharts'
import type { DonutSlice } from './DonutChart'

interface Props {
  slices: DonutSlice[]
  total: number
}

export default function RingChart({ slices, total }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const data = slices.map((s) => ({
    name:  s.label,
    value: s.value || 0,
    fill:  s.color,
    color: s.color,
    light: s.light,
    label: s.label,
  }))

  const activeSlice = activeIdx !== null ? slices[activeIdx] : null

  function handleMouseMove(e: React.MouseEvent) {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div className="relative w-full flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative w-[200px] h-[200px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setActiveIdx(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={84}
              paddingAngle={4}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
              animationBegin={0}
              animationDuration={700}
              animationEasing="ease-out"
              style={{ cursor: 'pointer', outline: 'none' }}
              onMouseEnter={(_, idx) => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {total}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5">
            Jobs
          </span>
        </div>

        {/* Custom tooltip — follows cursor relative to chart container */}
        {activeSlice && (
          <div
            className="absolute z-50 pointer-events-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-2 transition-opacity duration-100"
            style={{
              left: mouse.x + 12,
              top:  mouse.y - 40,
            }}
          >
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{activeSlice.label}</p>
            <p className="text-base font-bold tabular-nums mt-0.5" style={{ color: activeSlice.color }}>
              {activeSlice.value}
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 w-full mt-4 px-2">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-xs text-slate-500 dark:text-slate-400 flex-1 truncate">{s.label}</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
