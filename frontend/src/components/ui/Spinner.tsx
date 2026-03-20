import loadingGif from '../../assests/loading.gif'

interface SpinnerProps {
  /** Size of the GIF in pixels (default 64) */
  size?: number
  /** Optional label shown below the gif */
  label?: string
}

/** Inline spinner — small gif, no label */
export function Spinner({ size = 64 }: Pick<SpinnerProps, 'size'>) {
  return (
    <img
      src={loadingGif}
      alt="Loading…"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="object-contain"
    />
  )
}

/** Full-page centred loader */
export function PageLoader({ label = 'Loading…' }: Pick<SpinnerProps, 'label'>) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <img
        src={loadingGif}
        alt="Loading…"
        className="w-24 h-24 object-contain"
      />
      <p className="text-sm text-slate-400 dark:text-slate-500">{label}</p>
    </div>
  )
}
