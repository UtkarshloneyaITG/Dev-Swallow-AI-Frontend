import { useState } from 'react'

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

// ─── Geometry ─────────────────────────────────────────────────────────────────
const SIZE    = 180
const CX      = SIZE / 2
const CY      = SIZE / 2
const OUTER_R = 80
const INNER_R = 62   // thin ring — modern minimal style
const GAP_DEG = 2

function polar(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function arcPath(start: number, end: number): string {
  const s  = start + GAP_DEG / 2
  const e  = end   - GAP_DEG / 2
  if (e - s < 0.3) return ''
  const lg = e - s > 180 ? 1 : 0
  const f  = (v: number) => +v.toFixed(3)
  const o1 = polar(OUTER_R, s), o2 = polar(OUTER_R, e)
  const i1 = polar(INNER_R, s), i2 = polar(INNER_R, e)
  return `M${f(o1.x)} ${f(o1.y)} A${OUTER_R} ${OUTER_R} 0 ${lg} 1 ${f(o2.x)} ${f(o2.y)} L${f(i2.x)} ${f(i2.y)} A${INNER_R} ${INNER_R} 0 ${lg} 0 ${f(i1.x)} ${f(i1.y)}Z`
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DonutChart({ slices, total }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)

  let deg = 0
  const segments = slices.map((s, i) => {
    const sweep = total > 0 ? (s.value / total) * 360 : 0
    const out = { ...s, i, startDeg: deg, endDeg: deg + sweep,
                  pct: total > 0 ? Math.round((s.value / total) * 100) : 0 }
    deg += sweep
    return out
  })

  const dominant = slices.reduce((b, s, i) => s.value > slices[b].value ? i : b, 0)
  const show     = hovered ?? dominant
  const active   = segments[show]

  return (
    <div className="flex flex-col items-center w-full gap-5">

      {/* ── Ring ─────────────────────────────────────────────────────── */}
      <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: 'visible' }}>

          {/* Track */}
          <circle cx={CX} cy={CY}
            r={(OUTER_R + INNER_R) / 2}
            fill="none"
            strokeWidth={OUTER_R - INNER_R}
            stroke="rgba(255,255,255,0.04)"
          />

          {/* Empty dashed */}
          {total === 0 && (
            <circle cx={CX} cy={CY}
              r={(OUTER_R + INNER_R) / 2}
              fill="none"
              strokeWidth={OUTER_R - INNER_R}
              stroke="rgba(255,255,255,0.09)"
              strokeDasharray="4 8"
            />
          )}

          {/* Segments */}
          {total > 0 && segments.map((s) => {
            const isHov = hovered === s.i
            const isDim = hovered !== null && !isHov
            const path  = arcPath(s.startDeg, s.endDeg)
            if (!path) return null
            return (
              <path
                key={s.label}
                d={path}
                fill={s.color}
                opacity={isDim ? 0.2 : isHov ? 1 : 0.85}
                style={{
                  transition: 'opacity 180ms ease',
                  cursor: 'pointer',
                  transform: isHov ? `scale(1.04)` : 'scale(1)',
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
                onMouseEnter={() => setHovered(s.i)}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}
        </svg>

        {/* Centre */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none gap-0.5">
          <span
            className="text-2xl font-semibold tabular-nums leading-none"
            style={{ color: total === 0 ? 'rgba(148,163,184,0.4)' : active?.color }}
          >
            {total === 0 ? '—' : active?.value ?? 0}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest mt-1"
            style={{ color: total === 0 ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.7)' }}>
            {total === 0 ? 'empty' : active?.label}
          </span>
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 w-full px-2">
        {segments.map((s) => {
          const isHov = hovered === s.i || (hovered === null && show === s.i)
          return (
            <div
              key={s.label}
              className="flex items-center gap-2 cursor-pointer"
              onMouseEnter={() => setHovered(s.i)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-150"
                style={{
                  backgroundColor: s.color,
                  opacity: isHov ? 1 : 0.5,
                  boxShadow: isHov ? `0 0 5px ${s.color}80` : 'none',
                }}
              />
              <span
                className="text-xs flex-1 truncate transition-colors duration-150"
                style={{ color: isHov ? '#e2e8f0' : '#64748b' }}
              >
                {s.label}
              </span>
              <span
                className="text-xs font-semibold tabular-nums transition-colors duration-150"
                style={{ color: isHov ? s.color : '#475569' }}
              >
                {s.value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
