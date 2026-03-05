"use client"

import { useEffect } from "react"

/**
 * On iOS Safari, `position: fixed` elements don't move when the soft keyboard opens.
 * Inputs inside the card can end up hidden behind the keyboard.
 *
 * This hook listens to the Visual Viewport API (iOS 13+, Android Chrome) and
 * applies a CSS variable `--keyboard-offset` that shifts the card up when needed.
 * The card uses `bottom: var(--keyboard-offset, 0px)` via inline style.
 *
 * On desktop (lg+) this is a no-op since the card is `position: static`.
 */
export function useKeyboardAware(
  cardRef: React.RefObject<HTMLElement | null>,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return
    if (!window.visualViewport) return

    // Only apply on mobile (< 1024px)
    const mq = window.matchMedia("(min-width: 1024px)")
    if (mq.matches) return

    function onResize() {
      const vv = window.visualViewport!
      const windowHeight = window.innerHeight
      // How much the keyboard has pushed the viewport up
      const keyboardHeight = windowHeight - vv.height - vv.offsetTop
      const offset = Math.max(0, keyboardHeight)

      if (cardRef.current) {
        cardRef.current.style.bottom = offset > 0 ? `${offset}px` : ""
      }
    }

    window.visualViewport.addEventListener("resize", onResize)
    window.visualViewport.addEventListener("scroll", onResize)

    return () => {
      window.visualViewport!.removeEventListener("resize", onResize)
      window.visualViewport!.removeEventListener("scroll", onResize)
      if (cardRef.current) cardRef.current.style.bottom = ""
    }
  }, [cardRef, enabled])
}
