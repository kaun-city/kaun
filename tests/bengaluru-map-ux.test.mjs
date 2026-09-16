/**
 * Bengaluru map screen: the UX fixes from the hands-on review.
 *
 * The pure helpers live next to the components that use them (.tsx files the
 * strip-types loader cannot import because of their JSX), so each helper is
 * lifted out of its source by name, stripped of types with node:module, and
 * imported from a data: URL. The helpers are self-contained by design; if one
 * starts reaching for an import this harness fails loudly rather than lying.
 *
 * Run: node --test --experimental-strip-types tests/bengaluru-map-ux.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import { MAP_LAYERS, formatLegendValue, wardsWithoutData } from "../apps/web/lib/map-layers.ts"
import { MATERIAL_OVERLAP } from "../apps/web/lib/gba-crosswalk.ts"

const read = path => readFileSync(new URL(`../apps/web/${path}`, import.meta.url), "utf8")
const home = read("components/HomePage.tsx")
const pulse = read("components/CityPulse.tsx")
const finder = read("components/WardFinder.tsx")
const picker = read("components/shared/MapLayerPicker.tsx")
const vacancy = read("components/CorporatorVacancy.tsx")
const switcher = read("components/shared/SurfaceSwitcher.tsx")
const css = read("app/globals.css")
const gbaCrosswalk = JSON.parse(read("public/bengaluru-gba-369-to-datameet-243.json"))
const legacyCrosswalk = JSON.parse(read("public/bengaluru-ward-crosswalk.json"))

/** Top-level `function name(` or one-line `const name =` from a source file. */
function declaration(source, name) {
  const fn = new RegExp(`^(?:export )?function ${name}\\b`, "m").exec(source)
  if (fn) {
    const end = source.indexOf("\n}\n", fn.index)
    assert.ok(end > fn.index, `${name}: no closing brace at column 0`)
    return source.slice(fn.index, end + 2).replace(/^export /, "")
  }
  const constant = new RegExp(`^(?:export )?const ${name}\\b.*$`, "m").exec(source)
  assert.ok(constant, `${name} not found`)
  return constant[0].replace(/^export /, "")
}

async function load(parts) {
  const names = parts.flatMap(([, list]) => list)
  const code = parts.flatMap(([source, list]) => list.map(name => declaration(source, name))).join("\n\n")
  const js = `${stripTypeScriptTypes(code)}\nexport { ${names.join(", ")} }\n`
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)
}

const { pulseHeadline, pulseSource } = await load([[pulse, ["decodeEntities", "pulseHeadline", "pulseSource"]]])
const { formerWardMatches, wardUrlSearch, normalizeWardName, coveringCurrentWards, overlappedOldWards } = await load([
  [finder, ["coveringCurrentWards", "overlappedOldWards"]],
  [home, ["normalizeWardName", "formerWardMatches", "WARD_URL_PARAMS", "wardUrlSearch"]],
])

// 1 ─ zoom control and search results never sit under/over header controls

test("zoom buttons sit below the city map header at every width", () => {
  assert.match(home, /<main[^>]*className="signal-map city-map /)
  const rule = css.match(/\.city-map \.leaflet-top\.leaflet-right\s*\{([^}]*)\}/)
  assert.ok(rule, "missing .city-map zoom rule")
  const top = Number(rule[1].match(/top:\s*(\d+)px/)?.[1])
  // header: 14px offset + 46px control row (44px targets in a 1px border);
  // Leaflet adds a 10px margin
  assert.ok(top + 10 >= 14 + 46, `zoom starts at ${top + 10}px, inside the header`)
  assert.doesNotMatch(css.slice(0, css.indexOf(".city-map .leaflet-top")), /@media[^{]*\{\s*\.city-map \.leaflet-top/, "rule must not be width-scoped")
  // the phone ward sheet still hides zoom while expanded
  assert.match(css, /\.signal-map:has\(\.ward-sheet\[data-sheet="expanded"\]\) \.leaflet-control-zoom/)
})

test("the header stacks above Leaflet controls, and above the phone sheet while searching", () => {
  const header = home.match(/city-map-header[^\n]*/)?.[0] ?? ""
  const z = [...header.matchAll(/z-\[(\d+)\]/g)].map(m => Number(m[1]))
  assert.ok(z.length === 2 && Math.min(...z) > 1000, `header z-indexes ${z}`)
  assert.match(header, /searchOpen \? "z-\[(\d+)\]"/)
  assert.ok(Number(header.match(/searchOpen \? "z-\[(\d+)\]"/)[1]) > 1050, "search must clear the ward sheet (1050)")
  assert.ok(Number(header.match(/searchOpen \? "z-\[(\d+)\]"/)[1]) < 1100, "search must stay under report/dialog sheets")
})

// 2 ─ find my ward after a denied location

test("a denied location keeps a retry and a message that wraps clear of the … button", () => {
  assert.doesNotMatch(home, /\{!geoDenied && \(/)
  assert.match(home, /geoDenied \? "Retry location" : "Find my ward"/)
  const message = home.match(/<p[^>]*>\s*\{geoDenied \?[^\n]*/)?.[0] ?? ""
  assert.doesNotMatch(message, /whitespace-nowrap/)
  assert.match(message, /max-w-\[calc\(100vw-7\.5rem\)\]/)
  assert.match(home, /setGeoDenied\(false\)/)
})

// 3 ─ the URL names the open ward

test("wardUrlSearch writes the corporation-qualified identity and keeps ?layer=", () => {
  assert.equal(
    wardUrlSearch("?layer=potholes", { gba_corporation_id: 4, gba_ward_no: 28, ward_no: 186 }),
    "?layer=potholes&gba_corporation=4&gba_ward=28",
  )
  assert.equal(wardUrlSearch("?ward=12&layer=attendance", { ward_no: 150 }), "?layer=attendance&ward=150")
  assert.equal(wardUrlSearch("?ward=12", { gba_corporation_id: 1, gba_ward_no: 3 }), "?gba_corporation=1&gba_ward=3")
  assert.equal(wardUrlSearch("?city=visakhapatnam", { ward_no: 7 }), "?city=visakhapatnam&ward=7")
})

test("wardUrlSearch removes the ward on close, and ?report= unless it is the open ward", () => {
  assert.equal(wardUrlSearch("?gba_corporation=1&gba_ward=52", null), "")
  assert.equal(wardUrlSearch("?gba_corporation=1&gba_ward=52&layer=hospitals", null), "?layer=hospitals")
  assert.equal(wardUrlSearch("?report=42&layer=x", { gba_corporation_id: 2, gba_ward_no: 9 }), "?layer=x&gba_corporation=2&gba_ward=9")
  assert.equal(wardUrlSearch("?report=42", { gba_corporation_id: 2, gba_ward_no: 9 }, true), "?report=42&gba_corporation=2&gba_ward=9")
})

test("HomePage syncs the URL with replaceState and keeps every deep-link handler", () => {
  assert.match(home, /replaceState\(null, "", `\$\{window\.location\.pathname\}\$\{search\}/)
  assert.match(home, /const handleClose = useCallback\(\(\) => \{[\s\S]*?replaceSearch\(wardUrlSearch\(window\.location\.search, null\)\)/)
  for (const param of ['"report"', '"ward"', '"gba_corporation"', '"gba_ward"']) {
    assert.match(home, new RegExp(`searchParams\\.get\\(${param}\\)`))
  }
})

// 4 ─ search dead ends

test("former ward names lead to the current wards that cover them", () => {
  const currentNames = new Set(["kormangala east", "kormangala west", "national games village", "ramaswamy palya"])
  for (const query of ["Kora", "Koramangala", "  koramangala "]) {
    const [match] = formerWardMatches(query, gbaCrosswalk.rows, currentNames, MATERIAL_OVERLAP)
    assert.equal(match?.ward_name, "Koramangala", query)
    assert.equal(match.ward_no, 186)
    assert.deepEqual([match.wards[0].corporation_id, match.wards[0].ward_no], [4, 28], "largest part first")
    assert.ok(match.wards.some(w => w.ward_name === "National Games Village"))
    assert.ok(match.wards.every((w, i) => i === 0 || w.share >= MATERIAL_OVERLAP))
    assert.equal(match.wards.length + match.smaller, 6, "every covering ward is either shown or counted")
  }
  assert.deepEqual(formerWardMatches("186", gbaCrosswalk.rows, currentNames, MATERIAL_OVERLAP), [], "numbers are not names")
  assert.deepEqual(formerWardMatches("k", gbaCrosswalk.rows, currentNames, MATERIAL_OVERLAP), [])
  assert.ok(
    !formerWardMatches("Ramaswamy Palya", gbaCrosswalk.rows, currentNames, MATERIAL_OVERLAP).some(m => m.ward_name === "Ramaswamy Palya"),
    "a former name that is also a current ward's name is answered by the current ward",
  )
  assert.equal(normalizeWardName("  Kempegowda  Ward "), "kempegowda")
})

test("search has an empty state, former-ward suggestions, a close control, and keeps projects", () => {
  assert.match(home, /No current ward named &ldquo;\{trimmedQuery\}&rdquo;/)
  assert.match(home, /\(former ward\) &rarr; now in:/)
  assert.match(home, /aria-label="Close search"/)
  assert.match(home, /searchCivicProjects\(trimmedQuery, activeCity\.id\)/)
  assert.match(home, /projectResults\.map\(project =>/)
})

// 5 ─ old ward numbers

test("one plain label for the old-ward finder, and no jargon or promises", () => {
  assert.match(finder, /export const OLD_WARD_NUMBERS_LABEL = "Old ward numbers"/)
  assert.equal(home.match(/\{OLD_WARD_NUMBERS_LABEL\}/g)?.length, 2, "desktop button and phone menu")
  assert.match(finder, /\{OLD_WARD_NUMBERS_LABEL\}<\/h2>/)
  for (const source of [home, finder]) {
    assert.doesNotMatch(source, /New ward crosswalk|New ward\?|Older-record crosswalk/)
  }
  assert.doesNotMatch(finder, /\{r\.tier\}/, "tier codes are not user copy")
  assert.doesNotMatch(finder, /text-danger/, "a low overlap is not an alarm")
})

test("an old ward row shows the current wards covering it, largest part first", () => {
  const row = legacyCrosswalk.rows.find(r => r.tier === "true-split")
  const old = overlappedOldWards(row, MATERIAL_OVERLAP)
  assert.ok(old.length >= 1 && old.length <= 2)
  assert.equal(old[0].ward_no, [...row.shares].sort((a, b) => b.share - a.share)[0].datameet243_no)
  const { wards, smaller } = coveringCurrentWards(old[0].ward_no, gbaCrosswalk.rows, MATERIAL_OVERLAP)
  assert.ok(wards.length > 0)
  for (let i = 1; i < wards.length; i++) assert.ok(wards[i - 1].share >= wards[i].share)
  const all = gbaCrosswalk.rows.filter(r => r.historical_wards.some(h => h.ward_no === old[0].ward_no && h.legacy_share > 0))
  assert.equal(wards.length + smaller, all.length)
  assert.match(finder, /aria-expanded=\{expanded\}/)
  assert.match(home, /onSelectCurrentWard=/)
})

// 6 ─ pulse ticker

test("pulse headlines drop emoji but keep text symbols", () => {
  assert.equal(
    pulseHeadline("🚨 BENGALURU LAUNCHES ₹2-CRORE ‘JET PATCHER’ PILOT TO FIX POTHOLES! 🚧 🔹 Machine designed"),
    "BENGALURU LAUNCHES ₹2-CRORE ‘JET PATCHER’ PILOT TO FIX POTHOLES! Machine designed",
  )
  assert.equal(pulseHeadline("🛣️ Pothole Filling &amp; Road Restoration 📍 Ward 19"), "Pothole Filling & Road Restoration Ward 19")
  assert.equal(pulseHeadline("Hebbal ↔ Silk Board © BMRCL"), "Hebbal ↔ Silk Board © BMRCL")
  assert.equal(pulseHeadline("🚨Bengaluru pilot"), "Bengaluru pilot")
})

test("pulse source labels come from the link, never from the feed's search label", () => {
  const google = "https://news.google.com/rss/articles/CBMiVEFV?oc=5"
  assert.deepEqual(pulseSource("X/Pothole", google), { label: "Google News", linkLabel: "Read source" })
  assert.deepEqual(pulseSource("Google News BWSSB", google), { label: "Google News", linkLabel: "Read source" })
  assert.deepEqual(pulseSource("X/BESCOM", "https://x.com/bescom/status/1"), { label: "X", linkLabel: "View on X" })
  assert.deepEqual(pulseSource("X/BBMP", "https://twitter.com/bbmp/status/1"), { label: "X", linkLabel: "View on X" })
  assert.deepEqual(pulseSource("Deccan Herald", null), { label: "Deccan Herald", linkLabel: "Read source" })
  assert.deepEqual(pulseSource("The Hindu", "https://www.thehindu.com/a"), { label: "The Hindu", linkLabel: "Read source" })
  assert.deepEqual(pulseSource("X/Pothole", null), { label: null, linkLabel: "Read source" })
  assert.deepEqual(pulseSource("", "https://www.deccanherald.com/a"), { label: "deccanherald.com", linkLabel: "Read source" })
  // Publisher names written by lib/pulse-ingest pass through unchanged
  assert.deepEqual(pulseSource("X via Google News", google), { label: "X via Google News", linkLabel: "Read source" })
  assert.deepEqual(pulseSource("Google News", google), { label: "Google News", linkLabel: "Read source" })
})

test("the ticker keeps red to its severity marker", () => {
  assert.doesNotMatch(pulse, /text-danger|decoration-danger/)
  assert.match(pulse, /\{ red: "bg-danger", green: "bg-success", yellow: "bg-warning" \}/)
  assert.match(pulse, /text-accent underline decoration-accent\/40/)
  assert.doesNotMatch(pulse, /isTwitter/)
})

// 7 ─ vacancy counter

test("the days-without-corporator number is ink", () => {
  assert.doesNotMatch(vacancy, /text-danger/)
  assert.match(vacancy, /tabular-nums text-ink">/)
})

// 8 ─ legends

test("legend ends read as whole counts, percentages and rupees", () => {
  assert.equal(formatLegendValue(539.27, "count"), "539")
  assert.equal(formatLegendValue(1234567.4, "count"), "12,34,567")
  assert.equal(formatLegendValue(0, "count"), "0")
  assert.equal(formatLegendValue(43.6, "pct"), "44%")
  assert.equal(formatLegendValue(0, "inr_lakh"), "₹0")
  assert.equal(formatLegendValue(0.4, "inr_lakh"), "<₹1 L")
  assert.equal(formatLegendValue(80.4, "inr_lakh"), "₹80 L")
  assert.equal(formatLegendValue(30180, "inr_lakh"), "₹301.8 Cr")
  assert.equal(formatLegendValue(429000, "inr_lakh"), "₹4,290 Cr")
  for (const layer of MAP_LAYERS) assert.ok(layer.unit?.length > 0, `${layer.id}: legend unit`)
})

test("the legend keys unpainted wards and rises above a folded ward sheet", () => {
  assert.equal(wardsWithoutData(369, 309), 60)
  assert.equal(wardsWithoutData(369, 400), 0)
  assert.match(picker, /wardsWithoutData\(legend\.total, legend\.painted\)/)
  assert.match(picker, /No data \(not zero\) &middot;/)
  assert.match(picker, /formatLegendValue\(legend\.min, layer\.format\)/)
  assert.match(picker, /\{layer\.unit\}/)
  assert.match(home, /max-lg:\[\.signal-map:has\(\.ward-sheet\[data-sheet=collapsed\]\)_&\]:bottom-\[calc\(var\(--ward-sheet-h,10rem\)\+0\.75rem\)\]/)
  assert.match(home, /setProperty\("--ward-sheet-h"/)
  assert.match(home, /total: Math\.max\(activeCity\.wardCount \?\? 0, nums\.length\)/)
})

// 9 ─ network

test("cross-surface links do not prefetch (the /india page preloads 1.4 MB)", () => {
  assert.match(switcher, /<Link key=\{link\.id\} href=\{link\.href\} prefetch=\{false\}/)
})

test("HomePage requests the ward boundary file from one shared loader, on demand", () => {
  assert.equal(home.match(/fetch\(activeCity\.geojsonUrl/g)?.length, 1)
  assert.equal(home.match(/fetch\(GBA_CROSSWALK_URL/g)?.length, 1)
  assert.match(home, /if \(!searchOpen && !wardFinderOpen\)/)
})

// 10 ─ touch targets

test("switcher segments and the ticker's Next button are at least 44px", () => {
  assert.match(switcher, /const cls = "min-h-11 min-w-11 /)
  assert.doesNotMatch(switcher, /sm:min-h-9|sm:min-w-9/, "44px at every width")
  assert.match(pulse, /min-h-11 min-w-11[^"]*"\s*>\s*Next/)
})
