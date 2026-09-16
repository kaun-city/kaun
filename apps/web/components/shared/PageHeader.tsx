import Link from "next/link"
import type { MouseEventHandler, ReactNode } from "react"
import { indiaHref, type SurfaceId } from "@/lib/host-routing"
import { SurfaceSwitcher } from "./SurfaceSwitcher"

/**
 * PageHeader — the one header every Kaun page wears.
 *
 * The map screens and the reading pages used to carry five different headers:
 * a wordmark chip with an "i" button on the city map, an India-only header with
 * its own nav, a sticky bar on the project records, a bare "← Back" on How it
 * works and a wordmark heading on /data. A visitor crossing between them had to
 * re-learn where the way back and the surface switcher were. Now every page has
 * the same pieces in the same order:
 *
 *   [back] KAUN? <surface> [IN | BLR]  ·······  [section nav] [actions]
 *
 * - The wordmark links to the surface's home and names the surface beside it
 *   ("India", "Bengaluru") from sm up. On a phone the switcher's filled
 *   segment already says which surface this is, and the row needs the room.
 * - SurfaceSwitcher marks the current surface as text, never a link.
 * - The section nav is optional: only a surface with sections of its own
 *   (India: the map and the project tracker) passes one. On a phone it takes
 *   its own row.
 * - The back link leads the row, so it sits in the same place on every page.
 *   It is a slot, not an href, because the India seat page's back control has
 *   behaviour of its own (BackToMap restores the map from history). Every
 *   caller renders it with BackLink, so it looks the same everywhere.
 * - `actions` is for controls that belong to the page's chrome: the map's
 *   search and "how it works" buttons, a record's reference number.
 *
 * `variant="overlay"` floats over a map and does NOT position itself — the map
 * page stacks it in its own flow column, because separately positioned rows
 * guessing each other's heights is what once put the India search box on top
 * of the nav. It is pointer-events-none so the map still pans through the
 * gaps; the controls turn pointers back on. `variant="page"` is a full-width
 * paper bar at the top of a scrolling page, sticky from sm up where it is one
 * row; on phones it scrolls away rather than keep two rows of chrome on screen.
 *
 * Every control in it is at least 44px tall at every width.
 */

export interface SectionNavItem {
  id: string
  label: string
  href: string
}

export interface SectionNav {
  /** Accessible name for the nav landmark. */
  label: string
  items: SectionNavItem[]
  /** The section the reader is in. */
  current?: string
  /**
   * True when this page IS the section's page (aria-current="page"). An object
   * page inside a section — a seat on the map, a project in the tracker —
   * marks its section with aria-current="true" instead.
   */
  currentIsPage?: boolean
}

/** Where each surface's wordmark goes, and what it is called. */
const SURFACE_HOME: Record<Exclude<SurfaceId, "data">, { href: () => string; label: string }> = {
  india: { href: () => indiaHref("/"), label: "India" },
  city: { href: () => "/", label: "Bengaluru" },
}

export type IndiaSection = "map" | "seat" | "projects" | "project"

/**
 * The India layer's sections. A seat page belongs to the map and a project
 * page to the tracker, so those mark their section rather than claiming to be
 * the page. Every path is on this same app and host in both cutover modes.
 */
export function indiaSectionNav(current: IndiaSection): SectionNav {
  return {
    label: "India pages",
    items: [
      { id: "map", label: "Map", href: indiaHref("/") },
      { id: "projects", label: "Project overruns", href: indiaHref("/projects") },
    ],
    current: current === "seat" ? "map" : current === "project" ? "projects" : current,
    currentIsPage: current === "map" || current === "projects",
  }
}

const WIDTH = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
} as const

export type PageWidth = keyof typeof WIDTH

const FOCUS_INSET = "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"

export function PageHeader({
  surface,
  host = "",
  variant = "page",
  context,
  nav,
  back,
  actions,
  width = "4xl",
}: {
  surface: Exclude<SurfaceId, "data">
  /** Request Host header, threaded from the page so switcher links are host-aware. */
  host?: string
  variant?: "page" | "overlay"
  /** Overrides the surface name beside the wordmark (e.g. another city). */
  context?: string
  nav?: SectionNav
  /** A BackLink (or BackToMap), leading the row. */
  back?: ReactNode
  actions?: ReactNode
  /** Page variant: match the page's content column so the edges line up. */
  width?: PageWidth
}) {
  const overlay = variant === "overlay"
  const home = SURFACE_HOME[surface]

  const row = (
    <>
      {back}
      <Link
        href={home.href()}
        className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-ink bg-paper px-3 leading-none
          ${overlay ? "pointer-events-auto" : ""} ${FOCUS_INSET}`}
      >
        <span className="text-[17px] font-bold leading-none tracking-[-0.02em] text-ink">
          KAUN<span className="text-accent">?</span>
        </span>
        <span className="hidden text-sm font-normal text-ink/70 sm:inline">{context ?? home.label}</span>
      </Link>

      <SurfaceSwitcher current={surface} host={host} variant={overlay ? "overlay" : "inline"} />

      {nav && (
        <nav
          aria-label={nav.label}
          className={`inline-flex shrink-0 items-stretch divide-x divide-ink/15 border border-ink/55 bg-paper
            font-mono text-[11px] uppercase tracking-[0.08em]
            ${overlay ? "pointer-events-auto" : "w-full sm:ml-auto sm:w-auto"}`}
        >
          {nav.items.map(item => {
            const active = item.id === nav.current
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? (nav.currentIsPage ? "page" : "true") : undefined}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap px-3 transition-colors
                  ${overlay ? "" : "flex-1 sm:flex-none"} ${FOCUS_INSET} ${
                  active
                    ? "bg-ink font-semibold text-paper"
                    : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      )}

      {actions && (
        <div className={`ml-auto flex shrink-0 items-center gap-2 ${overlay ? "pointer-events-auto" : ""}`}>
          {actions}
        </div>
      )}
    </>
  )

  if (overlay) {
    return (
      <header className="signal-map-header flex w-full flex-wrap items-center gap-2 select-none pointer-events-none">
        {row}
      </header>
    )
  }

  return (
    <header className="signal-page-header border-b-2 border-ink bg-paper sm:sticky sm:top-0 sm:z-20">
      <div className={`mx-auto flex ${WIDTH[width]} flex-wrap items-center gap-2 px-4 py-2 sm:px-6`}>
        {row}
      </div>
    </header>
  )
}

/**
 * The back link, one look for every page. A real link, so cmd-click, "copy
 * link" and keyboard navigation behave; `onClick` lets BackToMap swap in
 * history.back() when there is a map to return to. Labelled rather than a bare
 * chevron: a lone "<" next to a record's name reads as "previous record".
 */
export function BackLink({
  href,
  label,
  ariaLabel,
  onClick,
  testId,
}: {
  href: string
  label: string
  ariaLabel?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
  testId?: string
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 border border-ink/55 bg-paper px-3
        font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink
        transition-colors hover:bg-paper-muted ${FOCUS_INSET}`}
    >
      <span aria-hidden="true" className="text-accent">&larr;</span>
      {label}
    </Link>
  )
}
