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
        ? "absolute top-4 left-4 right-16 z-[900] flex flex-wrap items-center gap-x-3 gap-y-1.5 select-none pointer-events-none"
        : "flex items-center gap-3 flex-wrap"
    }>
      <a href={indiaHref("/")} className={`shrink-0 ${overlay ? "pointer-events-auto" : ""}`}>
        <span className="text-white font-bold text-xl tracking-tight">
          KAUN<span className="text-[#FF9933]">?</span>
        </span>
        <span className="text-white/30 font-normal ml-2 text-sm align-middle">India</span>
      </a>

      <SurfaceSwitcher current="india" host={host} variant={overlay ? "overlay" : "inline"} />

      <nav className={`flex items-center gap-3 text-xs ${overlay ? "pointer-events-auto" : ""}`}>
        <a href={indiaHref("/")} className="text-white/40 hover:text-white/80 transition-colors">Map</a>
        <span className="text-white/10">·</span>
        <a href={indiaHref("/projects")} className="text-white/40 hover:text-white/80 transition-colors">
          Project overruns
        </a>
      </nav>
    </header>
  )
}
