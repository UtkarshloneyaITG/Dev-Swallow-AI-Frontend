import { useState } from 'react'
import {
  PieChart,
  Pie,
  Sector,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { PieSectorDataItem } from 'recharts/types/polar/Pie'

export interface DonutSlice {
  label: string
  value: number
  color: string
  light: string
}

interface Props {
  slices: DonutSlice[]
  total: number
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name: string; value: number; payload: DonutSlice & { fill: string } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-2 z-50">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{d.name}</p>
      <p className="text-base font-bold tabular-nums mt-0.5" style={{ color: d.payload.fill }}>
        {d.value}
      </p>
    </div>
  )
}

function ActiveSector(props: PieSectorDataItem) {
  const { cx, cy, innerRadius, outerRadius = 0, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  )
}

function InactiveSector(props: PieSectorDataItem) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      opacity={0.35}
    />
  )
}

export default function DonutChart({ slices, total }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const dominant = slices.reduce(
    (best, s, i) => (s.value > slices[best].value ? i : best),
    0,
  )
  const display = activeIdx !== null ? activeIdx : dominant

  const data = slices.map((s) => ({
    name:  s.label,
    value: s.value || 0,
    fill:  s.color,
    color: s.color,
    light: s.light,
    label: s.label,
  }))

  return (
    <div className="relative w-full flex flex-col items-center">
      <div className="relative w-[200px] h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={3}
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
              activeShape={(props: PieSectorDataItem) => <ActiveSector {...props} />}
              inactiveShape={activeIdx !== null ? (props: PieSectorDataItem) => <InactiveSector {...props} /> : undefined}
            />
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-3xl font-bold tabular-nums transition-colors duration-150"
            style={{ color: total === 0 ? '#94a3b8' : slices[display]?.color }}
          >
            {total === 0 ? '0' : slices[display]?.value ?? 0}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
            {total === 0 ? 'No jobs' : slices[display]?.label}
          </span>
          <span className="text-[9px] text-slate-300 dark:text-slate-600 mt-0.5 tabular-nums">
            of {total} total
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 w-full mt-4 px-2">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-offset-1 dark:ring-offset-slate-900"
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
