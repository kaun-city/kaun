import { cityHref, LEGACY_CITY_ID } from "@/lib/host-routing"
import { indiaHref } from "@/lib/host-routing"

/**
 * Shared chrome for every India page. Same wordmark, same accent, same voice
 * as kaun.city — a visitor arriving from a constituency link should not have
 * to work out whether this is the same site.
 *
 * `variant="overlay"` floats it over the map, matching how HomePage places the
 * wordmark; `variant="page"` is the in-flow version the object pages use.
 */
export function IndiaHeader({ variant = "page" }: { variant?: "page" | "overlay" }) {
  const overlay = variant === "overlay"
  return (
    <header className={
      overlay
        ? "absolute top-4 left-4 right-16 z-[900] flex items-center gap-3 select-none pointer-events-none"
        : "flex items-center gap-3 flex-wrap"
    }>
      <a href={indiaHref("/")} className={`shrink-0 ${overlay ? "pointer-events-auto" : ""}`}>
        <span className="text-white font-bold text-xl tracking-tight">
          KAUN<span className="text-[#FF9933]">?</span>
        </span>
        <span className="text-white/30 font-normal ml-2 text-sm align-middle">India</span>
      </a>

      <nav className={`flex items-center gap-3 text-xs ${overlay ? "pointer-events-auto" : ""}`}>
        <a href={indiaHref("/")} className="text-white/40 hover:text-white/80 transition-colors">Map</a>
        <span className="text-white/10">·</span>
        <a href={indiaHref("/projects")} className="text-white/40 hover:text-white/80 transition-colors">
          Project overruns
        </a>
        <span className="text-white/10">·</span>
        <a href={cityHref("/")} className="text-white/40 hover:text-white/80 transition-colors capitalize">
          {LEGACY_CITY_ID}
        </a>
      </nav>
    </header>
  )
}
