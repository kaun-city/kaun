import Link from "next/link"
import { surfaceLinks, type SurfaceId } from "@/lib/host-routing"

/**
 * SurfaceSwitcher — the one control that says which Kaun you are looking at.
 *
 * Kaun is a family of surfaces: the national India layer, a city site, and the
 * open-data wiki. They are three deploys' worth of different chrome, so without
 * a shared marker a visitor who follows a constituency link has no way to tell
 * they are still on the same project. This renders on every one of them, in the
 * same order, with the same words.
 *
 * A segmented pill, not a dropdown: three destinations do not earn a menu, and
 * a menu costs a tap on the phones that are most of Kaun's traffic. It is sized
 * to survive a 360px header — the city map's top strip already carries the
 * wordmark, the info button and the search affordance.
 *
 * Every href comes from surfaceLinks() in lib/host-routing.ts, which is pure and
 * exhaustively tested, so the flag- and host-awareness lives in one place rather
 * than being re-derived per surface. The active surface is deliberately NOT an
 * anchor: a link to the page you are on is noise for everyone and a trap for
 * screen readers.
 *
 * `external` decides next/link versus a plain anchor, and nothing else may.
 * The flag means "following this leaves the current origin", and a soft
 * navigation across origins is not a thing — a <Link> to bengaluru.kaun.city
 * from kaun.city would try to fetch an RSC payload from another host. The
 * relative ones are this same Next app on this same host, so they get a Link
 * and prefetch. surfaceLinks() computes the flag and host-routing.test.mjs
 * asserts it agrees with the href on every host in every mode, so the question
 * is answered in one place, once.
 */
export function SurfaceSwitcher({
  current,
  host = "",
  indiaRoot,
  variant = "inline",
  className = "",
}: {
  /** Which surface is rendering this. Renders as text, not a link. */
  current: SurfaceId
  /** Request Host header. Absent, links resolve for the production domain. */
  host?: string
  /** Defaults to NEXT_PUBLIC_INDIA_ROOT — pass only in tests/stories. */
  indiaRoot?: boolean
  /** `overlay` floats over a map; `inline` sits in a page header. */
  variant?: "overlay" | "inline"
  className?: string
}) {
  const links = surfaceLinks(host, indiaRoot)

  return (
    <nav
      aria-label="Kaun surfaces"
      className={`inline-flex items-center shrink-0 overflow-hidden rounded-full
        border border-white/12 divide-x divide-white/10
        ${variant === "overlay" ? "bg-black/60 backdrop-blur-md shadow-lg pointer-events-auto" : "bg-white/5"}
        ${className}`}
    >
      {links.map(link => {
        const cls = "px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] leading-none whitespace-nowrap transition-colors"
        if (link.id === current) {
          return (
            <span key={link.id} aria-current="page" className={`${cls} bg-[#FF9933]/10 text-[#FF9933] font-medium`}>
              {link.label}
            </span>
          )
        }
        const linkCls = `${cls} text-white/45 hover:text-white/85 hover:bg-white/5`
        return link.external ? (
          <a key={link.id} href={link.href} className={linkCls}>{link.label}</a>
        ) : (
          <Link key={link.id} href={link.href} className={linkCls}>{link.label}</Link>
        )
      })}
    </nav>
  )
}
