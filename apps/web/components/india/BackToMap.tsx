"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type MouseEvent } from "react"
import { BackLink } from "@/components/shared/PageHeader"
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
 * PLACEMENT. PageHeader's back slot, leading the header row like every other
 * page's back link, and drawn by the same BackLink. It used to float at the
 * bottom-left on phones, where a thumb is, but a floating button on a long
 * page of prose sits on top of whatever text is scrolling past it. From sm up
 * the header is sticky, so it stays in reach; on a phone the header's own
 * "Map" nav item is there once the reader scrolls back up.
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

  return <BackLink href={href} label="Map" ariaLabel="Back to the map" onClick={onClick} testId="back-to-map" />
}
