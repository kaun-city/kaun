/**
 * host-routing.ts — which surface does this request belong to?
 *
 * Kaun is one Next app serving two kinds of surface:
 *
 *   NATIONAL  the India layer — 543-seat map, constituency pages, the central
 *             project overrun tracker. Lives under /india/* in the app router.
 *   CITY      the existing ward-level UI — map, ward card, /data, /how-it-works.
 *             Lives at / and reads its city from ?city=<id>.
 *
 * Until now the root domain served CITY and there were no subdomains. The plan
 * is for kaun.city to become NATIONAL and each city to move to its own
 * subdomain (bengaluru.kaun.city, hyderabad.kaun.city, …).
 *
 * THE CUTOVER IS A SINGLE ENV VAR, AND IT IS OFF BY DEFAULT.
 * ---------------------------------------------------------
 * With NEXT_PUBLIC_INDIA_ROOT unset (or "0") this module changes NOTHING that a
 * visitor to kaun.city can see. The root keeps serving Bengaluru exactly as it
 * does today; the India surface is reachable at kaun.city/india/* and nowhere
 * else. So merging this PR is safe before any DNS record exists.
 *
 * Setting NEXT_PUBLIC_INDIA_ROOT=1 flips the root to the India layer and starts
 * permanently redirecting the city UI's entry URLs to bengaluru.kaun.city.
 * Bharat flips it AFTER the subdomain resolves — see the PR body's rollout
 * section. Flipping it early would 308 real traffic at a host that does not
 * exist yet, which is why the order matters and why the flag exists at all.
 *
 * WHAT THIS MODULE MUST NEVER TOUCH
 * ---------------------------------
 * /api/* on ANY host, ever. Those routes are load-bearing outside the browser:
 * the weekly wiki generator, the cron workflows that authenticate with
 * CRON_SECRET, and the stable file exports the BNP partnership pulls all call
 * kaun.city/api/... . They are passed through before any other rule runs, and
 * tests/host-routing.test.mjs asserts that for every mode and every host.
 *
 * Pure functions only — no next/server import — so the node:test suite can
 * exercise every branch. middleware.ts is the thin adapter.
 */

/**
 * Cities that have (or are being given) their own subdomain.
 *
 * Deliberately NOT derived from lib/cities' registry: being in the UI registry
 * and having a DNS record are different facts. A city joins this list only when
 * its subdomain is real, because an entry here makes the root domain redirect
 * traffic to it.
 */
export const CITY_HOSTS = ["bengaluru"] as const

/** The city whose URLs are already in the wild and must never break. */
export const LEGACY_CITY_ID = "bengaluru"

/** How that city is written in the UI. */
export const LEGACY_CITY_LABEL = "Bengaluru"

/**
 * The open-data wiki. A separate MkDocs deploy on its own host, so it is the one
 * surface whose URL is the same absolute string in every mode.
 */
export const DATA_SURFACE_URL = "https://data.kaun.city"

/**
 * Root-domain paths that belong to the CITY surface, not the national one.
 * Once the root is the India layer these 308 to the city subdomain, carrying
 * their query string. `/` is handled separately because it is only a city URL
 * when it carries city UI parameters.
 */
export const CITY_UI_PATHS = ["/how-it-works", "/data", "/admin"] as const

/**
 * Query parameters that make a bare "/" a city deep link. `?ward=` and
 * `?report=` are the two that went viral and are shared in screenshots and
 * WhatsApp forwards; `?city=` and `?layer=` are the switcher and choropleth.
 */
export const CITY_UI_PARAMS = ["ward", "report", "city", "layer"] as const

/** Root-domain paths the India surface owns once the cutover happens. */
const NATIONAL_ROOT_PREFIXES = ["/c/", "/projects"] as const

/** Never rewritten or redirected, on any host, in any mode. */
function isInfrastructurePath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/_vercel/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    // any request for a file with an extension: /india-pc.geojson, /*.png, …
    /\.[a-z0-9]+$/i.test(pathname)
  )
}

export type SurfaceDecision =
  | { action: "pass" }
  | { action: "rewrite"; path: string; search?: string }
  | { action: "redirect"; url: string; status: 308 }

export interface HostContext {
  /** Request Host header, e.g. "bengaluru.kaun.city" or "localhost:3000". */
  host: string
  pathname: string
  /** Raw query string including "?" , or "". */
  search: string
  /** NEXT_PUBLIC_INDIA_ROOT === "1" */
  indiaRoot: boolean
  /**
   * Allow ?host= to stand in for the Host header. Local dev and preview only —
   * on production this stays false so a link cannot steer a visitor's routing.
   */
  allowHostOverride: boolean
}

/** Strip the port; lowercase. */
function hostname(host: string): string {
  return host.toLowerCase().split(":")[0]
}

/** The port suffix (":3000") or "". Preserved when building redirect URLs. */
function portSuffix(host: string): string {
  const i = host.indexOf(":")
  return i === -1 ? "" : host.slice(i)
}

/**
 * The city whose subdomain this is, or null.
 * Matches bengaluru.kaun.city and bengaluru.localhost:3000 alike — browsers
 * resolve *.localhost to the loopback address, so a developer can hit the city
 * surface locally without editing /etc/hosts.
 */
export function cityFromHost(host: string): string | null {
  const h = hostname(host)
  const label = h.split(".")[0]
  return (CITY_HOSTS as readonly string[]).includes(label) ? label : null
}

/**
 * The domain the city subdomains hang off, derived from the current host so
 * production, preview and localhost all build correct absolute URLs.
 *
 *   kaun.city                -> kaun.city
 *   www.kaun.city            -> kaun.city
 *   bengaluru.kaun.city      -> kaun.city
 *   bengaluru.localhost:3000 -> localhost:3000
 *
 * Stripping a city label matters: a "go to the national layer" link rendered on
 * bengaluru.kaun.city has to point at kaun.city, not at bengaluru.kaun.city.
 */
export function rootDomain(host: string): string {
  const h = hostname(host)
  const label = h.split(".")[0]
  const base = (label === "www" || (CITY_HOSTS as readonly string[]).includes(label)) && h.includes(".")
    ? h.slice(label.length + 1)
    : h
  return base + portSuffix(host)
}

/** https:// everywhere except localhost, which has no certificate in dev. */
function schemeFor(host: string): string {
  const h = hostname(host)
  return h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" ? "http" : "https"
}

/** Absolute URL on the legacy city's subdomain, preserving path and query. */
export function cityUrl(host: string, pathname: string, search: string): string {
  return `${schemeFor(host)}://${LEGACY_CITY_ID}.${rootDomain(host)}${pathname}${search}`
}

function hasCityUiParam(search: string): boolean {
  if (!search) return false
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  return (CITY_UI_PARAMS as readonly string[]).some(p => params.has(p))
}

/**
 * The whole routing decision, as one pure function.
 *
 * Order is load-bearing: infrastructure paths are answered before anything
 * else can look at the host.
 */
export function resolveSurface(ctx: HostContext): SurfaceDecision {
  const { pathname, search } = ctx
  if (isInfrastructurePath(pathname)) return { action: "pass" }

  const host = ctx.host
  const city = cityFromHost(host)

  // ---- city subdomain -----------------------------------------------------
  if (city) {
    // The national layer belongs to the root domain. A stray /india link on a
    // city host goes home rather than rendering a second copy of it.
    if (pathname === "/india" || pathname.startsWith("/india/")) {
      return {
        action: "redirect",
        url: `${schemeFor(host)}://${rootDomain(host)}${pathname}${search}`,
        status: 308,
      }
    }
    // The city UI reads its city from ?city=. On a city subdomain that is
    // implied by the host, so inject it — visitors never see or need the param.
    if (pathname === "/") {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      if (params.get("city") === city) return { action: "pass" }
      params.set("city", city)
      return { action: "rewrite", path: "/", search: `?${params.toString()}` }
    }
    return { action: "pass" }
  }

  // ---- root domain, pre-cutover ------------------------------------------
  // Byte-for-byte today's behaviour. /india/* still resolves natively, which is
  // how this surface is reviewed and staged before the flag is ever set.
  if (!ctx.indiaRoot) return { action: "pass" }

  // ---- root domain, post-cutover -----------------------------------------
  if (pathname === "/india" || pathname.startsWith("/india/")) return { action: "pass" }

  // Viral deep links: /?ward=42, /?report=118, /?city=…, /?layer=… . These are
  // in screenshots and forwards; they must land on the ward they name.
  if (pathname === "/" && hasCityUiParam(search)) {
    return { action: "redirect", url: cityUrl(host, "/", search), status: 308 }
  }
  if ((CITY_UI_PATHS as readonly string[]).includes(pathname)) {
    return { action: "redirect", url: cityUrl(host, pathname, search), status: 308 }
  }

  if (pathname === "/") return { action: "rewrite", path: "/india", search }
  if (NATIONAL_ROOT_PREFIXES.some(p => pathname === p || pathname.startsWith(p))) {
    return { action: "rewrite", path: `/india${pathname}`, search }
  }

  // /status and anything else stays where it is.
  return { action: "pass" }
}

/**
 * Prefix for links INTO the India surface.
 *
 * Both forms always resolve — /india/c/29-25 works in either mode, and after
 * the cutover /c/29-25 works too via the rewrite above — so flipping the flag
 * can never produce a dead internal link, in either direction.
 */
export function indiaHref(path: string, indiaRoot = process.env.NEXT_PUBLIC_INDIA_ROOT === "1"): string {
  const p = path.startsWith("/") ? path : `/${path}`
  if (indiaRoot) return p === "/" ? "/" : p
  return p === "/" ? "/india" : `/india${p}`
}

/**
 * The three surfaces a visitor can switch between, in a fixed order.
 * `data` is the MkDocs wiki, which is a separate deploy entirely.
 */
export type SurfaceId = "india" | "city" | "data"

export interface SurfaceLink {
  id: SurfaceId
  label: string
  /** Relative when the surface is served by this same host, absolute otherwise. */
  href: string
  /** True when following it leaves the current origin. */
  external: boolean
}

/**
 * Where each surface lives, as seen from `host` in the current mode.
 *
 * This is the whole cross-surface link matrix in one pure function, because the
 * switcher renders on both surfaces and the two must never disagree about where
 * the third one is. components/shared/SurfaceSwitcher.tsx is the only caller.
 *
 * THE RULE THAT MAKES THIS MERGEABLE TODAY
 * ----------------------------------------
 * No href may name a host that is not already serving. Before the cutover the
 * city subdomain may have no DNS record yet, so:
 *
 *   - the city entry is relative ("/") — pre-cutover the root domain IS the city
 *     UI, so "/" is exactly right and names no new host;
 *   - the India entry is "/india", which resolves on the root domain today.
 *
 * The only absolute non-wiki URL that can appear before the cutover is the link
 * back to the root domain from a city subdomain — and a request arriving from
 * that subdomain is itself proof the record exists.
 *
 * After the cutover the pair swaps: the root domain is the national layer, so
 * India is "/" and the city entry becomes an absolute subdomain URL, derived
 * from the request host so localhost and preview deploys stay coherent.
 */
export function surfaceLinks(
  host: string,
  indiaRoot = process.env.NEXT_PUBLIC_INDIA_ROOT === "1",
): SurfaceLink[] {
  const onCityHost = cityFromHost(host) !== null
  // Post-cutover the national layer is the root; before it, it is /india.
  const nationalPath = indiaRoot ? "/" : "/india"

  const india: Pick<SurfaceLink, "href" | "external"> = onCityHost
    // The national layer never lives on a city subdomain — resolveSurface()
    // 308s /india/* off it — so from here it is always the root domain.
    ? { href: `${schemeFor(host)}://${rootDomain(host)}${nationalPath}`, external: true }
    : { href: nationalPath, external: false }

  const city: Pick<SurfaceLink, "href" | "external"> =
    onCityHost || !indiaRoot
      ? { href: "/", external: false }
      : { href: cityUrl(host, "/", ""), external: true }

  return [
    { id: "india", label: "India", ...india },
    { id: "city", label: LEGACY_CITY_LABEL, ...city },
    { id: "data", label: "Data", href: DATA_SURFACE_URL, external: true },
  ]
}
