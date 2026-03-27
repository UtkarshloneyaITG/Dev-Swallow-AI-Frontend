import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import type { DonutSlice } from './DonutChart'

interface Props {
  slices: DonutSlice[]
  total: number
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name: string; value: number; payload: DonutSlice & { fill: string; pct: number } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-2">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{d.name}</p>
      <p className="text-base font-bold tabular-nums mt-0.5" style={{ color: d.payload.fill }}>
        {d.value}
        <span className="text-xs font-normal text-slate-400 ml-1">({d.payload.pct}%)</span>
      </p>
    </div>
  )
}

export default function BarsChart({ slices, total }: Props) {
  const data = slices.map((s) => ({
    name:  s.label,
    value: s.value,
    fill:  s.color,
    color: s.color,
    light: s.light,
    label: s.label,
    pct:   total > 0 ? Math.round((s.value / total) * 100) : 0,
  }))

  return (
    <div className="w-full flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 44, bottom: 0, left: 4 }}
          barSize={14}
        >
          <XAxis type="number" hide domain={[0, total || 1]} />
          <YAxis
            type="category"
            dataKey="name"
            width={70}
            tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'inherit' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar
            dataKey="value"
            radius={6}
            animationBegin={0}
            animationDuration={700}
            animationEasing="ease-out"
          >
            <LabelList
              dataKey="value"
              position="right"
              style={{ fontSize: 11, fontWeight: 700, fontFamily: 'inherit', fill: '#64748b' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-2">
        <span className="text-xs text-slate-400">Total</span>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">{total}</span>
      </div>
    </div>
  )
}
