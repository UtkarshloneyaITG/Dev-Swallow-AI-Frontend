import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

// Register useGSAP plugin
gsap.registerPlugin(useGSAP)

export { gsap, useGSAP }

export function animatePageEnter(el: HTMLElement) {
  return gsap.from(el, {
    opacity: 0,
    scale: 0.98,
    filter: 'blur(4px)',
    duration: 0.8,
    ease: 'power3.out',
    clearProps: 'filter',
  })
}

export function animateStaggerIn(
  elements: NodeListOf<Element> | Element[],
  delay = 0
) {
  return gsap.from(elements, {
    opacity: 0,
    y: 16,
    scale: 0.97,
    duration: 0.5,
    stagger: 0.08,
    delay,
    ease: 'power3.out',
  })
}

export function animateFadeIn(el: HTMLElement, delay = 0) {
  return gsap.from(el, {
    opacity: 0,
    duration: 0.4,
    delay,
    ease: 'power2.out',
  })
}

export function animateSlideDown(el: HTMLElement, delay = 0) {
  return gsap.from(el, {
    opacity: 0,
    y: -8,
    duration: 0.5,
    delay,
    ease: 'power3.out',
  })
}
