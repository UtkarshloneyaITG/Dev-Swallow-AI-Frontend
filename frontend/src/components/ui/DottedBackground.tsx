/**
 * DottedBackground
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen canvas dot grid with interactive spring-physics ripple.
 *
 * Architecture:
 *  • Single <canvas> — no per-dot DOM nodes; one draw-call loop at ~60 fps.
 *  • All mutable animation state lives in refs → zero React re-renders during
 *    the animation loop.
 *  • HiDPI / Retina: canvas physical pixels = CSS pixels × DPR (capped at 2×).
 *  • Touch-friendly: touchmove drives the same cursor position as mousemove.
 *
 * Physics model (per dot, per frame):
 *  1. If the mouse is within INFLUENCE_R, apply an outward push force with a
 *     quadratic falloff so the edge of the ripple is feathered, not hard.
 *  2. A Hooke's-law spring pulls the dot back toward its rest position.
 *  3. Velocity is damped each frame so motion naturally decays.
 *
 * Usage:
 *   // Full-screen background (no children)
 *   <DottedBackground />
 *
 *   // As a layout wrapper — children float above the canvas
 *   <DottedBackground>
 *     <HeroSection />
 *   </DottedBackground>
 */

import { useEffect, useRef, useCallback, type ReactNode } from 'react'

// ─── Tuning knobs ─────────────────────────────────────────────────────────────

/** Distance between dot centres in CSS pixels */
const SPACING = 12

/** Base dot radius at rest, in CSS pixels */
const DOT_RADIUS = 0.70

/** Radius around the cursor that influences dots, in CSS pixels */
const INFLUENCE_R = 110

/** Maximum displacement from rest position, in CSS pixels */
const PUSH_STRENGTH = 0.80

/** Spring stiffness — how aggressively a dot snaps back to rest (0 → 1) */
const SPRING_K = 0.10

/**
 * Velocity damping applied every frame (0 = instant stop, 1 = never stops).
 * 0.72 gives a natural, slightly bouncy decay over ~20 frames.
 */
const DAMPING = 0.40

/** Dot opacity when fully at rest */
const ALPHA_REST = 0.20

/** Dot opacity at maximum displacement (fully pushed by cursor) */
const ALPHA_PEAK = 0.50

/** Page background — matches the app dark-mode palette */
const BG_COLOR = '#050509'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dot {
  /** Rest position — never changes after grid construction */
  rx: number
  ry: number
  /** Current offset from rest position (displacement) */
  ox: number
  oy: number
  /** Current velocity */
  vx: number
  vy: number
}

interface CanvasSize {
  /** CSS pixel dimensions (used for drawing coordinates) */
  w: number
  h: number
  /** Device pixel ratio (capped at 2 for performance on 3×+ screens) */
  dpr: number
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  children?: ReactNode
  /** Extra className applied to the root wrapper */
  className?: string
}

export default function DottedBackground({ children, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /** Dot grid — rebuilt on every resize */
  const dotsRef = useRef<Dot[]>([])

  /**
   * Mouse / touch position in CSS pixels.
   * Set to (-9999, -9999) when the cursor is outside the viewport so no
   * dots are influenced when the user is not hovering.
   */
  const mouseRef = useRef({ x: -9999, y: -9999 })

  /** Current canvas logical (CSS pixel) dimensions + DPR */
  const sizeRef = useRef<CanvasSize>({ w: 0, h: 0, dpr: 1 })

  /** rAF handle — stored so we can cancel on unmount */
  const rafRef = useRef<number>(0)

  // ── Grid construction ────────────────────────────────────────────────────────

  /**
   * Builds a centred grid of dots that covers the given CSS-pixel dimensions.
   * Adding +2 cols/rows ensures the grid bleeds past viewport edges even after
   * spring displacement.
   */
  const buildGrid = useCallback((w: number, h: number) => {
    const cols = Math.floor(w / SPACING) + 2
    const rows = Math.floor(h / SPACING) + 2

    // Offset so the grid is visually centred — equal dead-space on all sides
    const startX = (w - (cols - 1) * SPACING) / 2
    const startY = (h - (rows - 1) * SPACING) / 2

    const next: Dot[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        next.push({
          rx: startX + c * SPACING,
          ry: startY + r * SPACING,
          ox: 0, oy: 0,
          vx: 0, vy: 0,
        })
      }
    }
    dotsRef.current = next
  }, [])

  // ── Animation loop ───────────────────────────────────────────────────────────

  /**
   * Per-frame physics update + draw.
   * Called by requestAnimationFrame — runs at ~60 fps.
   *
   * We re-apply the DPR transform at the top of each frame because assigning
   * canvas.width on resize resets the 2D context's transform matrix.
   */
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h, dpr } = sizeRef.current
    const { x: mx, y: my } = mouseRef.current

    // Re-establish the DPR scale transform (reset by canvas resize events)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    for (const d of dotsRef.current) {
      // ── 1. Compute mouse influence ──────────────────────────────────────────
      //   World position of this dot (rest + current offset)
      const wx = d.rx + d.ox
      const wy = d.ry + d.oy

      const dx   = wx - mx
      const dy   = wy - my
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < INFLUENCE_R && dist > 0.01) {
        /**
         * Quadratic ease-out: t² gives a strong push near the cursor that
         * fades smoothly to zero at the influence boundary — much softer than
         * a linear falloff which creates a visible hard ring.
         */
        const t     = 1 - dist / INFLUENCE_R
        const force = t * t * PUSH_STRENGTH
        d.vx += (dx / dist) * force
        d.vy += (dy / dist) * force
      }

      // ── 2. Spring back to rest (Hooke's law: F = -k × displacement) ────────
      d.vx += -d.ox * SPRING_K
      d.vy += -d.oy * SPRING_K

      // ── 3. Apply friction / damping ─────────────────────────────────────────
      d.vx *= DAMPING
      d.vy *= DAMPING

      // ── 4. Integrate position ────────────────────────────────────────────────
      d.ox += d.vx
      d.oy += d.vy

      // ── 5. Draw ──────────────────────────────────────────────────────────────
      /**
       * Map displacement magnitude [0 → PUSH_STRENGTH] to a normalised [0→1]
       * value used to interpolate both opacity and radius.
       */
      const mag    = Math.min(Math.hypot(d.ox, d.oy) / PUSH_STRENGTH, 1)
      const alpha  = ALPHA_REST + mag * (ALPHA_PEAK - ALPHA_REST)
      const radius = DOT_RADIUS + mag * 0.3  // subtle size growth on displacement

      ctx.beginPath()
      ctx.arc(d.rx + d.ox, d.ry + d.oy, radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
      ctx.fill()
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  // ── Setup: resize + event listeners ─────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    /**
     * Resizes the canvas backing store to physical pixels (w × dpr) while
     * keeping the CSS size fixed at logical pixels (w). Rebuilds the dot grid
     * to match the new viewport.
     */
    const handleResize = () => {
      // Cap DPR at 2 — on 3× screens the extra sharpness isn't worth the cost
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w   = window.innerWidth
      const h   = window.innerHeight

      // Physical pixel dimensions (what the GPU actually rasterises)
      canvas.width  = w * dpr
      canvas.height = h * dpr
      // CSS dimensions (what the layout engine uses)
      canvas.style.width  = `${w}px`
      canvas.style.height = `${h}px`

      // Store logical size for use in the draw loop
      sizeRef.current = { w, h, dpr }

      buildGrid(w, h)
    }

    // Mouse tracking — raw clientX/Y are already in CSS pixels
    const onMouseMove  = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    // When cursor leaves the browser viewport entirely, deactivate influence
    const onDocLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null) mouseRef.current = { x: -9999, y: -9999 }
    }

    // Mirror touch position so the ripple works on mobile
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) mouseRef.current = { x: t.clientX, y: t.clientY }
    }
    const onTouchEnd = () => { mouseRef.current = { x: -9999, y: -9999 } }

    // Initial layout
    handleResize()

    window.addEventListener('resize',     handleResize)
    window.addEventListener('mousemove',  onMouseMove)
    document.addEventListener('mouseout', onDocLeave)
    window.addEventListener('touchmove',  onTouchMove, { passive: true })
    window.addEventListener('touchend',   onTouchEnd)

    // Kick off the animation loop
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize',     handleResize)
      window.removeEventListener('mousemove',  onMouseMove)
      document.removeEventListener('mouseout', onDocLeave)
      window.removeEventListener('touchmove',  onTouchMove)
      window.removeEventListener('touchend',   onTouchEnd)
    }
  }, [animate, buildGrid])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={`fixed inset-0 w-screen h-screen overflow-hidden ${className ?? ''}`}
      style={{ background: BG_COLOR, cursor: 'none' }}
    >
      {/* Canvas layer — pointer-events-none so UI elements above stay interactive */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 pointer-events-none"
      />

      {/**
       * Vignette overlay — a subtle radial darkening toward the edges.
       * This creates perceived depth and keeps the centre bright/focused
       * while gently bleeding into the page background at the borders.
       */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 35%, rgba(0, 0, 0, 0.72) 100%)',
        }}
      />

      {/* Optional overlay content — rendered above canvas + vignette */}
      {children && (
        <div className="relative z-10 w-full h-full">
          {children}
        </div>
      )}
    </div>
  )
}
