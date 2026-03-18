interface LogoProps {
  size?: number
}

export default function Logo({ size = 36 }: LogoProps) {
  const iconSize = Math.round(size * 0.62)
  const id = `logo-grad-${size}`

  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-2xl flex items-center justify-center flex-shrink-0 relative overflow-hidden"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-slate-900 to-slate-800" />
      {/* Subtle inner highlight */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.07] to-transparent" />
      {/* Ring */}
      <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.08]" />

      {/* Swallow SVG */}
      <svg
        viewBox="0 0 32 32"
        fill="none"
        style={{ width: iconSize, height: iconSize }}
        className="relative z-10"
      >
        <defs>
          <linearGradient id={id} x1="2" y1="8" x2="30" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {/* Swallow in flight — top view */}
        <path
          fill={`url(#${id})`}
          d="M16 8 C12 8 4 10 2 12 C6 13 11 15 13 17 L10 27 L16 19 L22 27 L19 17 C21 15 26 13 30 12 C28 10 20 8 16 8 Z"
        />
      </svg>
    </div>
  )
}
