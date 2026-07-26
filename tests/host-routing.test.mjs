/**
 * Unit tests for apps/web/lib/host-routing.ts.
 *
 * These matter more than most tests in this repo, because the module decides
 * whether kaun.city's existing URLs keep working. Two properties are asserted
 * exhaustively rather than by example:
 *
 *   1. /api/* is never rewritten or redirected — on any host, in any mode.
 *      Crons authenticate to those paths with CRON_SECRET, the wiki generator
 *      reads them weekly, and the BNP partnership pulls file exports from them.
 *   2. With the cutover flag off, NOTHING on the root domain changes. That is
 *      what makes merging this PR safe before any DNS record exists.
 *
 * Run: node --test --experimental-strip-types tests/host-routing.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  resolveSurface, cityFromHost, rootDomain, cityUrl, indiaHref, surfaceLinks,
  CITY_UI_PATHS, CITY_UI_PARAMS, LEGACY_CITY_ID, LEGACY_CITY_LABEL, DATA_SURFACE_URL,
  PRODUCTION_ROOT_DOMAIN,
} from "../apps/web/lib/host-routing.ts"

const base = { search: "", indiaRoot: false, allowHostOverride: false }
const ctx = (over) => resolveSurface({ ...base, ...over })

const HOSTS = ["kaun.city", "www.kaun.city", "bengaluru.kaun.city", "localhost:3000", "bengaluru.localhost:3000"]
const MODES = [false, true]

// ---------------------------------------------------------------------------
// 1. the hard constraint
// ---------------------------------------------------------------------------

test("API routes are never touched, on any host, in any mode", () => {
  const apiPaths = [
    "/api/health", "/api/data/wards", "/api/data/contractors", "/api/export",
    "/api/ingest-signals", "/api/refresh-pulse", "/api/og", "/api/ask-kaun",
    "/api/submit-report", "/api/moderate-report", "/api",
  ]
  for (const host of HOSTS) {
    for (const indiaRoot of MODES) {
      for (const pathname of apiPaths) {
        const d = ctx({ host, pathname, indiaRoot, search: "?type=all" })
        assert.equal(d.action, "pass", `${host}${pathname} indiaRoot=${indiaRoot} -> ${d.action}`)
      }
    }
  }
})

test("Next internals and static assets are never touched", () => {
  const paths = [
    "/_next/static/chunk.js", "/_vercel/insights/script.js", "/favicon.ico",
    "/robots.txt", "/india-pc.geojson", "/bengaluru-ward-crosswalk.json", "/icon.png",
  ]
  for (const host of HOSTS) {
    for (const indiaRoot of MODES) {
      for (const pathname of paths) {
        assert.equal(ctx({ host, pathname, indiaRoot }).action, "pass", `${host}${pathname}`)
      }
    }
  }
})

// ---------------------------------------------------------------------------
// 2. flag off = today's behaviour, byte for byte
// ---------------------------------------------------------------------------

test("with the cutover flag off, the root domain is completely unchanged", () => {
  const paths = ["/", "/how-it-works", "/data", "/status", "/admin", "/anything"]
  for (const pathname of paths) {
    assert.equal(ctx({ host: "kaun.city", pathname }).action, "pass", pathname)
  }
  assert.equal(ctx({ host: "kaun.city", pathname: "/", search: "?ward=42" }).action, "pass")
  assert.equal(ctx({ host: "kaun.city", pathname: "/", search: "?report=118" }).action, "pass")
})

test("with the flag off, the India surface is still reachable at /india", () => {
  assert.equal(ctx({ host: "kaun.city", pathname: "/india" }).action, "pass")
  assert.equal(ctx({ host: "kaun.city", pathname: "/india/c/29-25" }).action, "pass")
  assert.equal(ctx({ host: "kaun.city", pathname: "/india/projects" }).action, "pass")
})

// ---------------------------------------------------------------------------
// 3. after the cutover
// ---------------------------------------------------------------------------

test("root serves the India map once the flag is on", () => {
  const d = ctx({ host: "kaun.city", pathname: "/", indiaRoot: true })
  assert.equal(d.action, "rewrite")
  assert.equal(d.path, "/india")
})

test("pretty national paths rewrite under /india", () => {
  for (const [from, to] of [
    ["/c/29-25", "/india/c/29-25"],
    ["/projects", "/india/projects"],
    ["/projects/702635", "/india/projects/702635"],
  ]) {
    const d = ctx({ host: "kaun.city", pathname: from, indiaRoot: true })
    assert.equal(d.action, "rewrite", from)
    assert.equal(d.path, to)
  }
})

test("/india/* keeps working after the cutover, so no internal link can die", () => {
  for (const p of ["/india", "/india/c/29-25", "/india/projects", "/india/projects/702635"]) {
    assert.equal(ctx({ host: "kaun.city", pathname: p, indiaRoot: true }).action, "pass", p)
  }
})

test("every viral city deep link 308s to the city subdomain, query intact", () => {
  for (const param of CITY_UI_PARAMS) {
    const search = `?${param}=42`
    const d = ctx({ host: "kaun.city", pathname: "/", search, indiaRoot: true })
    assert.equal(d.action, "redirect", param)
    assert.equal(d.status, 308)
    assert.equal(d.url, `https://${LEGACY_CITY_ID}.kaun.city/${search}`)
  }
})

test("a bare root with no city params is the India map, not a redirect", () => {
  assert.equal(ctx({ host: "kaun.city", pathname: "/", indiaRoot: true }).action, "rewrite")
})

test("city UI pages 308 to the city subdomain", () => {
  for (const pathname of CITY_UI_PATHS) {
    const d = ctx({ host: "kaun.city", pathname, indiaRoot: true })
    assert.equal(d.action, "redirect", pathname)
    assert.equal(d.url, `https://${LEGACY_CITY_ID}.kaun.city${pathname}`)
  }
})

test("/status stays on the root domain — it covers the whole platform", () => {
  assert.equal(ctx({ host: "kaun.city", pathname: "/status", indiaRoot: true }).action, "pass")
})

test("www is treated as the root domain and redirects to the bare city host", () => {
  const d = ctx({ host: "www.kaun.city", pathname: "/", search: "?ward=7", indiaRoot: true })
  assert.equal(d.action, "redirect")
  assert.equal(d.url, "https://bengaluru.kaun.city/?ward=7")
})

// ---------------------------------------------------------------------------
// 4. city subdomains
// ---------------------------------------------------------------------------

test("a city subdomain injects its own ?city= so the existing UI needs no change", () => {
  const d = ctx({ host: "bengaluru.kaun.city", pathname: "/" })
  assert.equal(d.action, "rewrite")
  assert.equal(d.path, "/")
  assert.equal(d.search, "?city=bengaluru")
})

test("a city subdomain preserves the visitor's own query params", () => {
  const d = ctx({ host: "bengaluru.kaun.city", pathname: "/", search: "?ward=42&layer=potholes" })
  assert.equal(d.action, "rewrite")
  const params = new URLSearchParams(d.search)
  assert.equal(params.get("ward"), "42")
  assert.equal(params.get("layer"), "potholes")
  assert.equal(params.get("city"), "bengaluru")
})

test("a city subdomain does not rewrite twice when ?city= is already right", () => {
  assert.equal(ctx({ host: "bengaluru.kaun.city", pathname: "/", search: "?city=bengaluru" }).action, "pass")
})

test("city subdomain pages other than / pass through untouched", () => {
  for (const p of ["/data", "/how-it-works", "/status", "/admin"]) {
    assert.equal(ctx({ host: "bengaluru.kaun.city", pathname: p }).action, "pass", p)
  }
})

test("a stray /india link on a city host goes to the root domain", () => {
  const d = ctx({ host: "bengaluru.kaun.city", pathname: "/india/c/29-25" })
  assert.equal(d.action, "redirect")
  assert.equal(d.url, "https://kaun.city/india/c/29-25")
})

test("city routing works on *.localhost with http and the port kept", () => {
  assert.equal(cityFromHost("bengaluru.localhost:3000"), "bengaluru")
  assert.equal(rootDomain("bengaluru.localhost:3000"), "localhost:3000")
  const d = ctx({ host: "bengaluru.localhost:3000", pathname: "/india" })
  assert.equal(d.action, "redirect")
  assert.equal(d.url, "http://localhost:3000/india")
})

// ---------------------------------------------------------------------------
// 5. helpers
// ---------------------------------------------------------------------------

test("cityFromHost only matches configured city subdomains", () => {
  assert.equal(cityFromHost("kaun.city"), null)
  assert.equal(cityFromHost("www.kaun.city"), null)
  assert.equal(cityFromHost("hyderabad.kaun.city"), null, "not configured until DNS exists")
  assert.equal(cityFromHost("BENGALURU.KAUN.CITY"), "bengaluru")
  assert.equal(cityFromHost("kaun-git-branch.vercel.app"), null)
})

test("rootDomain strips www and keeps the port", () => {
  assert.equal(rootDomain("kaun.city"), "kaun.city")
  assert.equal(rootDomain("www.kaun.city"), "kaun.city")
  assert.equal(rootDomain("localhost:3000"), "localhost:3000")
})

test("with no Host header at all, links resolve for production", () => {
  // The India object pages and the national map are prerendered under ISR, so
  // they have no request to read a Host header from and render the switcher
  // with host="". Before this fallback existed that produced the literal
  // "https://bengaluru./" — a dead link on every prerendered page.
  assert.equal(rootDomain(""), PRODUCTION_ROOT_DOMAIN)
  assert.equal(rootDomain("   "), PRODUCTION_ROOT_DOMAIN)
  assert.equal(cityUrl("", "/", ""), `https://${LEGACY_CITY_ID}.${PRODUCTION_ROOT_DOMAIN}/`)
  assert.equal(cityFromHost(""), null, "no host is not a city host")

  // Post-cutover — the only mode in which an absolute city URL is rendered.
  const post = Object.fromEntries(surfaceLinks("", true).map(l => [l.id, l]))
  assert.equal(post.india.href, "/")
  assert.equal(post.india.external, false)
  assert.equal(post.city.href, `https://${LEGACY_CITY_ID}.${PRODUCTION_ROOT_DOMAIN}/`)
  assert.equal(post.city.external, true)

  // Pre-cutover nothing absolute is emitted, so the fallback cannot be wrong.
  for (const { id, href, external } of surfaceLinks("", false)) {
    assert.equal(external, false, `${id} left the origin before the cutover: ${href}`)
    assert.ok(href.startsWith("/"), `${id}: ${href}`)
  }
})

test("cityUrl uses http only for localhost", () => {
  assert.equal(cityUrl("kaun.city", "/", "?ward=1"), "https://bengaluru.kaun.city/?ward=1")
  assert.equal(cityUrl("localhost:3000", "/", ""), "http://bengaluru.localhost:3000/")
})

test("indiaHref produces a URL that resolves in whichever mode it is built for", () => {
  assert.equal(indiaHref("/", false), "/india")
  assert.equal(indiaHref("/c/29-25", false), "/india/c/29-25")
  assert.equal(indiaHref("/", true), "/")
  assert.equal(indiaHref("/c/29-25", true), "/c/29-25")
  assert.equal(indiaHref("c/29-25", false), "/india/c/29-25", "leading slash optional")
})

// ---------------------------------------------------------------------------
// 5b. surfaceLinks — the cross-surface switcher's whole link matrix
//
// The switcher renders on the city UI and on every India page, so a wrong href
// here is wrong in two places at once. The matrix is asserted entry by entry
// for every host × mode, then two properties are asserted over the whole grid:
// no dead host before the cutover, and the wiki never moves.
// ---------------------------------------------------------------------------

/** {india,city,data} -> href, for terser assertions below. */
const linksOf = (host, indiaRoot) =>
  Object.fromEntries(surfaceLinks(host, indiaRoot).map(l => [l.id, l.href]))

test("the switcher always offers the same two surfaces in the same order (Data hidden for now)", () => {
  for (const host of HOSTS) {
    for (const indiaRoot of MODES) {
      const links = surfaceLinks(host, indiaRoot)
      assert.deepEqual(links.map(l => l.id), ["india", "city"], `${host} ${indiaRoot}`)
      assert.deepEqual(links.map(l => l.label), ["India", LEGACY_CITY_LABEL])
      for (const l of links) {
        assert.ok(l.href, `${l.id} on ${host} has an href`)
        assert.equal(l.external, !l.href.startsWith("/"), `${l.id} external flag matches its href`)
      }
    }
  }
})

test("before the cutover, the root domain's switcher is entirely relative", () => {
  for (const host of ["kaun.city", "www.kaun.city", "localhost:3000"]) {
    const l = linksOf(host, false)
    assert.equal(l.india, "/india", host)
    assert.equal(l.city, "/", `${host}: the root IS the city UI until the flag flips`)
  }
})

test("after the cutover, the root domain's switcher sends the city to its subdomain", () => {
  const l = linksOf("kaun.city", true)
  assert.equal(l.india, "/", "the root is the national layer now")
  assert.equal(l.city, `https://${LEGACY_CITY_ID}.kaun.city/`)
  // www is the root domain wearing a hat: strip it, never link to www.bengaluru.
  assert.equal(linksOf("www.kaun.city", true).city, `https://${LEGACY_CITY_ID}.kaun.city/`)
})

test("on a city subdomain the national entry is an absolute link home, in both modes", () => {
  assert.equal(linksOf("bengaluru.kaun.city", false).india, "https://kaun.city/india")
  assert.equal(linksOf("bengaluru.kaun.city", true).india, "https://kaun.city/")
  // …and the city entry stays put, because you are already on it.
  for (const indiaRoot of MODES) {
    assert.equal(linksOf("bengaluru.kaun.city", indiaRoot).city, "/", `indiaRoot=${indiaRoot}`)
  }
})

test("localhost keeps http and its port, so the switcher works in dev", () => {
  assert.deepEqual(linksOf("localhost:3000", false), {
    india: "/india", city: "/",
  })
  assert.equal(linksOf("localhost:3000", true).city, "http://bengaluru.localhost:3000/")
  assert.equal(linksOf("bengaluru.localhost:3000", false).india, "http://localhost:3000/india")
  assert.equal(linksOf("bengaluru.localhost:3000", true).india, "http://localhost:3000/")
})

test("BEFORE THE CUTOVER, NO LINK NAMES A HOST THAT MAY NOT RESOLVE YET", () => {
  // This is what makes the switcher mergeable while bengaluru.kaun.city is
  // still a pending DNS record. The only absolute non-wiki URL allowed is the
  // one back to the root domain — and it is only ever rendered on a request
  // that arrived on the city subdomain, which proves that record exists.
  for (const host of HOSTS) {
    for (const { id, href } of surfaceLinks(host, false)) {
      if (id === "data") continue
      assert.ok(
        !href.includes(`${LEGACY_CITY_ID}.`),
        `${id} on ${host} points at the unresolved city subdomain: ${href}`)
    }
  }
  // And a root-domain visitor is given nothing absolute at all.
  for (const host of ["kaun.city", "www.kaun.city", "localhost:3000"]) {
    for (const { id, href, external } of surfaceLinks(host, false)) {
      if (id === "data") continue
      assert.equal(external, false, `${id} on ${host} left the origin: ${href}`)
    }
  }
})

test("the Data chip stays hidden until deliberately restored", () => {
  // Bharat's 2026-07-26 call: two chips at cutover. If someone re-adds the
  // entry, this test forces them to restore the full wiki-URL assertions too.
  for (const host of HOSTS) {
    for (const indiaRoot of MODES) {
      assert.equal(surfaceLinks(host, indiaRoot).find(l => l.id === "data"), undefined, `${host} ${indiaRoot}`)
    }
  }
})

test("every switcher href is a URL the routing layer resolves rather than bounces", () => {
  // A relative href is served by the host that rendered it, so run it back
  // through resolveSurface() and assert it is not answered with a redirect —
  // a switcher that costs an extra hop is a switcher pointing at the wrong URL.
  for (const host of HOSTS) {
    for (const indiaRoot of MODES) {
      for (const { id, href, external } of surfaceLinks(host, indiaRoot)) {
        if (external) continue
        const d = resolveSurface({ ...base, host, pathname: href, indiaRoot })
        assert.notEqual(d.action, "redirect", `${id} on ${host} indiaRoot=${indiaRoot} -> 308 ${d.url}`)
      }
    }
  }
})

// ---------------------------------------------------------------------------
// 6. no decision is ever undefined
// ---------------------------------------------------------------------------

test("every host × mode × path combination returns a valid decision", () => {
  const paths = [
    "/", "/india", "/india/c/29-25", "/c/29-25", "/projects", "/projects/702635",
    "/data", "/how-it-works", "/status", "/admin", "/api/health", "/nonsense",
  ]
  for (const host of HOSTS) {
    for (const indiaRoot of MODES) {
      for (const pathname of paths) {
        const d = ctx({ host, pathname, indiaRoot })
        assert.ok(["pass", "rewrite", "redirect"].includes(d.action), `${host}${pathname}`)
        if (d.action === "redirect") {
          assert.equal(d.status, 308)
          assert.ok(/^https?:\/\//.test(d.url), d.url)
        }
        if (d.action === "rewrite") assert.ok(d.path.startsWith("/"), d.path)
      }
    }
  }
})
