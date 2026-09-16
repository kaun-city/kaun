/**
 * Regression tests for the national-layer UX review (2026-09-16).
 *
 * Two kinds of assertion. The formatters are pure and tested by value. The
 * layout fixes live in Tailwind classes that only a browser can measure, so
 * those are pinned at the source: each test names the specific construction
 * that caused the bug and fails if it comes back.
 *
 * Run: node --test --experimental-strip-types tests/india-ux-review.test.mjs
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  formatCrore, formatCroreDelta, formatProgress, localSeatName, HINDI_STATE_CODES,
} from "../apps/web/lib/india/format.ts"

const web = (p) => new URL(`../apps/web/${p}`, import.meta.url)

/** Source with comments blanked, so prose about a removed pattern cannot match. */
function code(p) {
  return readFileSync(web(p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, m => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, (_, indent) => indent)
}

// ---------------------------------------------------------------------------
// money and progress read as words a citizen can parse
// ---------------------------------------------------------------------------

test("crore above a lakh crore is grouped in full, never abbreviated to 'L Cr'", () => {
  assert.equal(formatCrore(111234.4), "₹1,11,234 Cr")
  assert.equal(formatCrore(100000), "₹1,00,000 Cr")
  assert.equal(formatCroreDelta(250000), "+₹2,50,000 Cr")
  assert.doesNotMatch(formatCrore(9_999_999), /L Cr/)
})

test("missing physical progress is said in words, not left as a dangling dash", () => {
  assert.equal(formatProgress(null), "progress not reported")
  assert.equal(formatProgress(undefined), "progress not reported")
  assert.equal(formatProgress(Number.NaN), "progress not reported")
  assert.equal(formatProgress(0), "0.0% complete", "a real zero is still a number")
  assert.equal(formatProgress(66), "66.0% complete")
  assert.doesNotMatch(code("components/india/ProjectTimeline.tsx"), /formatPct\([^)]*\)\}\s*complete/)
})

// ---------------------------------------------------------------------------
// a seat's local-script name is only shown in its state's own language
// ---------------------------------------------------------------------------

test("the Hindi name is shown for Hindi-speaking states only", () => {
  assert.equal(localSeatName(29, "बंगलौर सेंट्रल"), null, "Karnataka: Hindi is not the local language")
  assert.equal(localSeatName(33, "कन्याकुमारी"), null, "Tamil Nadu")
  assert.equal(localSeatName(19, "बीरभूम"), null, "West Bengal")
  assert.equal(localSeatName(27, "कोल्हापुर"), null, "Maharashtra: Devanagari, but Marathi, not Hindi")
  assert.equal(localSeatName(9, "रॉबर्ट्सगंज"), "रॉबर्ट्सगंज", "Uttar Pradesh")
  assert.equal(localSeatName(10, "जमुई"), "जमुई", "Bihar")
  assert.equal(localSeatName(9, null), null)
  assert.equal(localSeatName(null, "x"), null)
  for (const st of [2, 5, 6, 7, 8, 9, 10, 20, 22, 23]) assert.ok(HINDI_STATE_CODES.has(st), `st_code ${st}`)
})

test("the constituency page never prints pc_name_hi unfiltered", () => {
  const src = code("app/india/c/[pc_code]/page.tsx")
  assert.match(src, /localSeatName\(c\.st_code, c\.pc_name_hi\)/)
  assert.doesNotMatch(src, /\{c\.pc_name_hi\}/)
})

// ---------------------------------------------------------------------------
// no developer paths or flags on a citizen-facing page
// ---------------------------------------------------------------------------

test("sources footer and preview banner show publishers, not repo paths or env flags", () => {
  for (const p of ["components/india/SourcesFooter.tsx", "components/india/FixtureBanner.tsx"]) {
    const src = code(p).replace(/href=\{?["'`][^"'`]*["'`]\}?/g, "").replace(/const \w+_URL = "[^"]*"/g, "")
    assert.doesNotMatch(src, /scripts\/|data\/india|\.mjs|\.json|NEXT_PUBLIC_/, p)
  }
})

// ---------------------------------------------------------------------------
// mobile layout: nothing overlaps, every target is 44px
// ---------------------------------------------------------------------------

test("the map header is not absolutely positioned on its own guessed offset", () => {
  const header = code("components/shared/PageHeader.tsx")
  assert.doesNotMatch(header, /signal-map-header[^"`]*\babsolute\b/)
  const home = code("components/india/IndiaHome.tsx")
  // the old magic offsets that put the search box on top of the nav
  assert.doesNotMatch(home, /top-\[4\.5rem\]|top-\[7\.5rem\]/)
  // header, search and filter share one flow column
  const stack = home.indexOf('<PageHeader surface="india" variant="overlay"')
  const search = home.indexOf("<input")
  const filter = home.indexOf('aria-label="Filter constituencies by state"')
  assert.ok(stack > 0 && stack < search && search < filter, "header, then search, then state filter")
})

test("map overlays sit above Leaflet's controls (z-1000)", () => {
  const home = code("components/india/IndiaHome.tsx")
  const zs = [...home.matchAll(/\bz-\[(\d+)\]/g)].map(m => Number(m[1]))
  // the top stack and the phone bottom rail
  assert.ok(home.includes("z-[1010]"), "top stack above zoom control and rail")
  assert.ok(/absolute inset-x-0 top-56 bottom-0 z-\[1005\]/.test(home), "phone rail above zoom control, below the top stack")
  assert.ok(zs.some(z => z > 1000))
})

test("the nav marks the current page and every nav item is at least 44px", () => {
  const header = code("components/shared/PageHeader.tsx")
  assert.match(header, /aria-current=\{active \? \(nav\.currentIsPage \? "page" : "true"\) : undefined\}/)
  assert.match(header, /min-h-11 min-w-11/)
  assert.match(code("components/india/IndiaHome.tsx"), /<PageHeader surface="india" variant="overlay" nav=\{indiaSectionNav\("map"\)\}/)
  assert.match(code("app/india/projects/(tracker)/page.tsx"), /<PageHeader surface="india" host=\{host\} nav=\{indiaSectionNav\("projects"\)\}/)
})

test("the back-to-map control is in flow, not floating over the page text", () => {
  const back = code("components/india/BackToMap.tsx")
  assert.doesNotMatch(back, /\bfixed\b/)
  assert.match(back, /<BackLink href=\{href\} label="Map"/)
  const backLink = code("components/shared/PageHeader.tsx").match(/export function BackLink[\s\S]*$/)?.[0] ?? ""
  assert.doesNotMatch(backLink, /\bfixed\b/)
  assert.match(backLink, /min-h-11/)
})

test("source links are 44px tall", () => {
  const footer = code("components/india/SourcesFooter.tsx")
  const anchors = [...footer.matchAll(/<a\b[\s\S]*?>/g)].map(m => m[0])
  assert.ok(anchors.length >= 3)
  for (const a of anchors) assert.match(a, /min-h-11/, a)
})

// ---------------------------------------------------------------------------
// project counts say what they count
// ---------------------------------------------------------------------------

test("tracker counts are labelled, and the state filter prints no undercounted totals", () => {
  const tracker = code("app/india/projects/(tracker)/page.tsx")
  assert.doesNotMatch(tracker, /showing the top/)
  assert.match(tracker, /ongoing project/)
  assert.match(tracker, /not in that report/)
  assert.doesNotMatch(code("components/india/TrackerControls.tsx"), /s\.count/)
  // the map's state filter counts seats and says so
  assert.match(code("components/india/IndiaHome.tsx"), /\{s\.seats\} seat\{s\.seats === 1 \? "" : "s"\}/)
})

test("the map opens fitted to India's bounds, not a fixed zoom", () => {
  const view = code("components/india/IndiaMapView.tsx")
  assert.match(view, /fitBounds\(INDIA_BOUNDS/)
  assert.match(view, /ResizeObserver/)
  assert.doesNotMatch(view, /setView\(INDIA_CENTER, INDIA_ZOOM/)
})
