import Link from "next/link"
import { indiaHref } from "@/lib/host-routing"
import { SurfaceSwitcher } from "@/components/shared/SurfaceSwitcher"

/**
 * Shared chrome for every India page. Same wordmark, same accent, same voice
 * as kaun.city — a visitor arriving from a constituency link should not have
 * to work out whether this is the same site.
 *
 * `variant="overlay"` floats it over the map, matching how HomePage places the
 * wordmark; `variant="page"` is the in-flow version the object pages use.
 *
 * The nav here is intra-surface only. Leaving the India layer is the surface
 * switcher's job — it used to also carry a "bengaluru" link, which is now the
 * switcher's city entry and would otherwise be the same destination twice.
 *
 * Everything indiaHref() returns is a path on this same Next app on this same
 * host, in both cutover modes, so all of it is next/link: the destinations
 * prefetch and the transition is client-side. The only cross-host link on the
 * India surface is the switcher's city entry, and SurfaceSwitcher keeps that a
 * plain anchor off its own `external` flag.
 */
export function IndiaHeader({
  variant = "page",
  host = "",
}: {
  variant?: "page" | "overlay"
  /** Request Host header, threaded from the page so links are host-aware. */
  host?: string
}) {
  const overlay = variant === "overlay"
  return (
    <header className={
      overlay
        // Wraps rather than overflows: on a phone the map's top strip is only
        // about 280px wide once the zoom control is accounted for.
        ? "signal-map-header absolute top-4 left-4 right-16 z-[900] flex flex-wrap items-center gap-x-3 gap-y-1.5 select-none pointer-events-none md:right-auto"
        : "signal-page-header flex items-center gap-3 flex-wrap border-b-2 border-ink pb-4"
    }>
      <Link
        href={indiaHref("/")}
        className={`inline-flex min-h-11 items-center shrink-0 ${
          overlay ? "signal-wordmark pointer-events-auto bg-paper border-b-2 border-ink px-3 leading-none" : ""}`}
      >
        <span className="text-ink font-bold text-xl tracking-tight">
          KAUN<span className="text-accent">?</span>
        </span>
        <span className="text-ink/60 font-normal ml-2 text-sm">India</span>
      </Link>

      <SurfaceSwitcher current="india" host={host} variant={overlay ? "overlay" : "inline"} />

      <nav className={`flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.08em] ${
        overlay ? "signal-map-control min-h-11 px-3 pointer-events-auto bg-paper border border-ink/55" : ""}`}>
        <Link href={indiaHref("/")} className="inline-flex min-h-11 items-center text-ink/70 hover:text-ink transition-colors">Map</Link>
        <span className="text-ink/50">·</span>
        <Link href={indiaHref("/projects")} className="inline-flex min-h-11 items-center text-ink/70 hover:text-ink transition-colors">
          Project overruns
        </Link>
      </nav>
    </header>
  )
}
