import { useRef } from 'react'
import { useGSAP, gsap, animatePageEnter } from '../lib/gsap'

/**
 * Attaches a GSAP page-enter animation (fade + blur + scale) to the returned ref.
 * Usage: const pageRef = usePageAnimation()
 *        <div ref={pageRef}>...</div>
 */
export function usePageAnimation<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)

  useGSAP(
    () => {
      if (ref.current) {
        animatePageEnter(ref.current)
      }
    },
    { scope: ref }
  )

  return ref
}

/**
 * Staggers a list of child elements matching `selector` inside the returned ref.
 * Usage: const listRef = useStaggerAnimation('[data-stagger]')
 */
export function useStaggerAnimation(
  selector: string,
  delay = 0
) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!ref.current) return
      const items = ref.current.querySelectorAll(selector)
      if (items.length === 0) return
      gsap.from(items, {
        opacity: 0,
        y: 16,
        scale: 0.97,
        duration: 0.5,
        stagger: 0.08,
        delay,
        ease: 'power3.out',
      })
    },
    { scope: ref }
  )

  return ref
}
