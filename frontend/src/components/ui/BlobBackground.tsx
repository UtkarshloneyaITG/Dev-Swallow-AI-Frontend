/**
 * BlobBackground — fixed full-screen abstract blur orbs derived from logo colours.
 * Light mode only — hidden entirely in dark mode.
 */
export default function BlobBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 dark:hidden" aria-hidden>
      {/* Top-right — warm orange */}
      <div className="
        absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full
        bg-[radial-gradient(circle,rgba(249,115,22,0.18)_0%,rgba(251,146,60,0.10)_45%,transparent_70%)]
        blur-[96px]
      " />

      {/* Bottom-left — peach */}
      <div className="
        absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full
        bg-[radial-gradient(circle,rgba(253,220,196,0.35)_0%,rgba(251,146,60,0.12)_45%,transparent_70%)]
        blur-[110px]
      " />

      {/* Center-left — faint amber mid tone */}
      <div className="
        absolute top-1/2 -translate-y-1/2 -left-24 w-[320px] h-[320px] rounded-full
        bg-[radial-gradient(circle,rgba(251,191,36,0.10)_0%,transparent_65%)]
        blur-[80px]
      " />

      {/* Top-center — very faint peach wash */}
      <div className="
        absolute -top-20 left-1/3 w-[360px] h-[280px] rounded-full
        bg-[radial-gradient(ellipse,rgba(253,220,196,0.20)_0%,transparent_65%)]
        blur-[90px]
      " />

      {/* Bottom-right — deep orange accent */}
      <div className="
        absolute -bottom-16 -right-16 w-[280px] h-[280px] rounded-full
        bg-[radial-gradient(circle,rgba(234,88,12,0.12)_0%,transparent_65%)]
        blur-[70px]
      " />
    </div>
  )
}
