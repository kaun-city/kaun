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
  resolveSurface, cityFromHost, rootDomain, cityUrl, indiaHref, cityHref,
  CITY_UI_PATHS, CITY_UI_PARAMS, LEGACY_CITY_ID,
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

test("cityHref stays relative before the cutover and absolute after", () => {
  assert.equal(cityHref("/", false), "/")
  assert.equal(cityHref("/data", false), "/data")
  assert.equal(cityHref("/", true), "https://bengaluru.kaun.city/")
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
