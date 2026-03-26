import loadingGif  from '../../assests/loading.gif'
import loading2Gif from '../../assests/loading2.gif'

interface SpinnerProps {
  /** Size of the spinner in pixels (default 64) */
  size?: number
  /** Optional label shown below the gif */
  label?: string
}

/** Inline spinner — CSS ring, no GIF */
export function Spinner({ size = 16 }: Pick<SpinnerProps, 'size'>) {
  return (
    <span
      aria-label="Loading…"
      style={{ width: size, height: size }}
      className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin opacity-70 flex-shrink-0"
    />
  )
}

/** Full-page centred loader */
export function PageLoader({ label = 'Loading…' }: Pick<SpinnerProps, 'label'>) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <img src={loadingGif}  alt="Loading…" className="w-24 h-24 object-contain dark:hidden" />
      <img src={loading2Gif} alt="Loading…" className="w-24 h-24 object-contain hidden dark:block" />
      <p className="text-sm text-slate-400 dark:text-slate-500">{label}</p>
    </div>
  )
}
