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
 * a menu costs a tap on the phones that are most of Kaun's traffic. It renders
 * inside PageHeader on every page, beside the wordmark.
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
 * for a client-side transition. surfaceLinks() computes the flag and
 * host-routing.test.mjs asserts it agrees with the href on every host in every
 * mode, so the question is answered in one place, once.
 *
 * No prefetch. Every link here leaves the current surface, and a surface's
 * page can carry heavy resource hints: /india preloads its 1.4 MB constituency
 * outlines, so prefetching it from the Bengaluru map downloaded a file that
 * page never uses. A cross-surface hop is rare enough to pay for on click.
 *
 * Every segment is at least 44px wide on phones ("IN" alone is 35px).
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
  /** `overlay` floats over a map (turns pointer events back on); `inline` sits in a page header. */
  variant?: "overlay" | "inline"
  className?: string
}) {
  const links = surfaceLinks(host, indiaRoot)

  return (
    <nav
      aria-label="Kaun surfaces"
      className={`inline-flex items-stretch shrink-0 overflow-hidden border border-ink/55 divide-x divide-ink/15 bg-paper
        ${variant === "overlay" ? "pointer-events-auto" : ""}
        ${className}`}
    >
      {links.map(link => {
        // One label set on every surface; the full name stays in aria-label.
        const displayLabel = link.id === "india" ? "IN" : link.id === "city" ? "BLR" : "DATA"
        // One size at every width and in both variants: the switcher is the
        // same control wherever it appears, and 44px is a touch target.
        const cls = "min-h-11 min-w-11 px-3 font-mono text-[11px] font-semibold tracking-[0.08em] leading-none whitespace-nowrap transition-colors flex items-center justify-center"
        if (link.id === current) {
          return (
            <span key={link.id} aria-current="page" aria-label={link.label} className={`${cls} bg-ink text-paper`}>
              {displayLabel}
            </span>
          )
        }
        const linkCls = `${cls} text-ink/60 hover:text-ink hover:bg-ink/5`
        return link.external ? (
          <a key={link.id} href={link.href} aria-label={link.label} className={linkCls}>{displayLabel}</a>
        ) : (
          <Link key={link.id} href={link.href} prefetch={false} aria-label={link.label} className={linkCls}>{displayLabel}</Link>
        )
      })}
    </nav>
  )
}
