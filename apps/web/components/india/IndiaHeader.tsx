import Link from "next/link"
import { indiaHref } from "@/lib/host-routing"
import { SurfaceSwitcher } from "@/components/shared/SurfaceSwitcher"

/**
 * Shared chrome for every India page. Same wordmark, same accent, same voice
 * as kaun.city — a visitor arriving from a constituency link should not have
 * to work out whether this is the same site.
 *
 * `variant="overlay"` is the version that floats over the map. It does NOT
 * position itself: IndiaHome stacks it in one flow column with the search box
 * and the state filter, because three separately absolute-positioned rows
 * guessing each other's heights is exactly what put the search input on top of
 * this nav on a 375px phone. `variant="page"` is the in-flow object-page
 * version.
 *
 * The nav here is intra-surface only. Leaving the India layer is the surface
 * switcher's job — it used to also carry a "bengaluru" link, which is now the
 * switcher's city entry and would otherwise be the same destination twice.
 *
 * `current` marks where the reader is. The map and the tracker are pages in
 * their own right (aria-current="page"); a seat page belongs to the map and a
 * project page to the tracker, so those mark their section with
 * aria-current="true" instead of claiming to be the page itself.
 *
 * Everything indiaHref() returns is a path on this same Next app on this same
 * host, in both cutover modes, so all of it is next/link: the destinations
 * prefetch and the transition is client-side. The only cross-host link on the
 * India surface is the switcher's city entry, and SurfaceSwitcher keeps that a
 * plain anchor off its own `external` flag.
 */
export type IndiaHeaderCurrent = "map" | "seat" | "projects" | "project"

const NAV: Array<{ id: "map" | "projects"; label: string; path: string }> = [
  { id: "map", label: "Map", path: "/" },
  { id: "projects", label: "Project overruns", path: "/projects" },
]

export function IndiaHeader({
  variant = "page",
  host = "",
  current,
}: {
  variant?: "page" | "overlay"
  /** Request Host header, threaded from the page so links are host-aware. */
  host?: string
  /** Which page, or which section's object page, is rendering this header. */
  current?: IndiaHeaderCurrent
}) {
  const overlay = variant === "overlay"
  const section = current === "seat" ? "map" : current === "project" ? "projects" : current
  const exact = current === "map" || current === "projects"

  return (
    <header className={
      overlay
        // Wraps rather than overflows. On a 360–430px phone the wordmark and
        // switcher take the first row and the nav the second.
        ? "signal-map-header flex flex-wrap items-center gap-x-3 gap-y-1.5 select-none pointer-events-none"
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

      <nav
        aria-label="India pages"
        className={`inline-flex items-stretch shrink-0 border border-ink/55 divide-x divide-ink/15 bg-paper
          font-mono text-[11px] uppercase tracking-[0.08em] ${overlay ? "signal-map-control pointer-events-auto" : ""}`}
      >
        {NAV.map(item => {
          const active = item.id === section
          return (
            <Link
              key={item.id}
              href={indiaHref(item.path)}
              aria-current={active ? (exact ? "page" : "true") : undefined}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center px-3 whitespace-nowrap transition-colors
                focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "bg-ink text-paper font-semibold"
                  : "text-ink/70 hover:text-ink hover:bg-ink/5"}`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
