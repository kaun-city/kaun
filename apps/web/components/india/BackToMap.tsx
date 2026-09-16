"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type MouseEvent } from "react"
import { hasSeenMap } from "@/lib/india/map-view-store"

/**
 * The way back to the map from an India object page.
 *
 * TWO ENTRY MODES, ONE CONTROL
 * ----------------------------
 * A visitor reaches a constituency page one of two ways, and the honest
 * behaviour differs:
 *
 *   FROM THE MAP. history.back() is strictly better than a fresh navigation —
 *   the map comes back from the router cache with its Leaflet instance, its
 *   1.4 MB of boundaries and its scroll position already paid for, so it
 *   restores instantly instead of reloading.
 *
 *   FROM A SHARED LINK. There is no map behind this page. history.back() would
 *   either do nothing (a fresh tab) or throw the visitor out of the site
 *   entirely, onto whatever WhatsApp or X was showing before. So this is a real
 *   <Link>, and the click handler only intercepts it when there is somewhere to
 *   go back to. `href` carries the seat (see mapHrefForSeat), so the fallback
 *   is not merely "not dead" — it opens the map on the seat being read.
 *
 * Being a genuine <Link> rather than a <button> is what makes cmd-click, middle
 * click, "copy link address" and keyboard navigation all behave, and it is what
 * lets Next prefetch the map. The interception is skipped for modified clicks
 * for the same reason.
 *
 * The map marker is read in an effect, not during render: sessionStorage does
 * not exist on the server, and this page is prerendered under ISR, so deciding
 * during render would either break the build or desync hydration. The first
 * paint is therefore always the plain link — which is the safe answer.
 *
 * PLACEMENT. An ordinary in-flow chip above the page header, at every width.
 * It used to float at the bottom-left on phones, where a thumb is, but a
 * floating button on a long page of prose sits on top of whatever text is
 * scrolling past it, and clearance at the end of the page does nothing for the
 * middle. The header's own "Map" nav item is there for a reader who has
 * scrolled. It is deliberately labelled, not a bare chevron: a lone "<" next
 * to a seat name reads as "previous constituency".
 */
export function BackToMap({ href }: { href: string }) {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => setCanGoBack(hasSeenMap()), [])

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!canGoBack) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    router.back()
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label="Back to the map"
      data-testid="back-to-map"
      className="mb-4 inline-flex items-center gap-2 min-h-11 px-3
        bg-paper border border-ink/20 text-ink
        font-mono text-[11px] font-semibold uppercase tracking-[0.08em]
        hover:bg-paper-muted transition-colors
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true" className="text-accent">&larr;</span>
      Map
    </Link>
  )
}
