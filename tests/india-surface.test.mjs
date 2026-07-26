/**
 * Unit tests for the India surface's pure modules.
 *
 * The two that carry real risk:
 *   - the pc-code MIRROR in apps/web/lib/india/pc-code.ts must not drift from
 *     the canonical scripts/india/lib/pc-code.mjs, which is itself mirrored by
 *     a CHECK constraint. Three copies of one rule is two too many unless
 *     something asserts they agree, so this file imports both and compares
 *     across every real (st_code, pc_no) pair.
 *   - nothing in the surface may turn a NULL into a zero. The formatters and
 *     the snapshot fold are where that would happen.
 *
 * Run: node --test --experimental-strip-types tests/india-surface.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import * as canonical from "../scripts/india/lib/pc-code.mjs"
import * as mirror from "../apps/web/lib/india/pc-code.ts"
import {
  formatRupees, formatCrore, formatCroreDelta, formatPct, formatMonth,
  monthsBetween, formatSlip, groupIndian,
} from "../apps/web/lib/india/format.ts"
import { INDIA_LAYERS, getIndiaLayer, rampFor } from "../apps/web/lib/india/layers.ts"
import { RAMP_DIVERGING, RAMP_SEQUENTIAL, divergingColor, barFraction } from "../apps/web/lib/india/viz.ts"
import { PC_GEOJSON_VERSION, PC_GEOJSON_URL, LOK_SABHA_SEATS, INDIA_REVALIDATE_SECONDS } from "../apps/web/lib/india/constants.ts"

// ---------------------------------------------------------------------------
// pc-code mirror
// ---------------------------------------------------------------------------

/** Seats per state/UT in the DataMeet-extended scheme, Ladakh included. */
const SEATS = {
  1: 5, 2: 4, 3: 13, 4: 1, 5: 5, 6: 10, 7: 7, 8: 25, 9: 80, 10: 40, 11: 1,
  12: 2, 13: 1, 14: 2, 15: 1, 16: 2, 17: 2, 18: 14, 19: 42, 20: 14, 21: 21,
  22: 11, 23: 29, 24: 26, 25: 1, 26: 1, 27: 48, 29: 28, 30: 2, 31: 1, 32: 20,
  33: 39, 34: 1, 35: 1, 36: 17, 37: 25, 38: 1,
}

test("the browser mirror of pcCode agrees with the canonical helper on all 543 seats", () => {
  let n = 0
  for (const [st, seats] of Object.entries(SEATS)) {
    for (let pc = 1; pc <= seats; pc++) {
      const a = canonical.pcCode(Number(st), pc)
      const b = mirror.pcCode(Number(st), pc)
      assert.equal(a, b, `st=${st} pc=${pc}`)
      assert.deepEqual(canonical.parsePcCode(a), mirror.parsePcCode(b))
      n++
    }
  }
  assert.equal(n, LOK_SABHA_SEATS, "the seat table itself must total 543")
})

test("the mirror rejects exactly what the canonical helper rejects", () => {
  const bad = ["", "29", "29-", "-25", "029-25", "29-025", "29-0", "0-25", "29-25-1", "a-b", null, undefined]
  for (const v of bad) {
    assert.throws(() => canonical.parsePcCode(v), `canonical accepted ${v}`)
    assert.throws(() => mirror.parsePcCode(v), `mirror accepted ${v}`)
    assert.equal(mirror.isPcCode(v), false, `isPcCode accepted ${v}`)
  }
  for (const [st, pc] of [[0, 1], [1, 0], [-1, 5], [1.5, 2]]) {
    assert.throws(() => canonical.pcCode(st, pc))
    assert.throws(() => mirror.pcCode(st, pc))
  }
})

test("Ladakh's state code is the same integer in both copies", () => {
  assert.equal(canonical.LADAKH_ST_CODE, mirror.LADAKH_ST_CODE)
  assert.equal(mirror.LADAKH_ST_CODE, 38)
})

test("pc_codes sort on the integer pair, never as strings", () => {
  const codes = ["29-9", "29-10", "29-2", "2-1", "38-1"]
  assert.deepEqual(codes.slice().sort(mirror.comparePcCode), ["2-1", "29-2", "29-9", "29-10", "38-1"])
  // the bug this guards against:
  assert.notDeepEqual(codes.slice().sort(), codes.slice().sort(mirror.comparePcCode))
})

// ---------------------------------------------------------------------------
// the boundary asset
// ---------------------------------------------------------------------------

test("the committed PC asset has 543 unique seats and matches the declared version", () => {
  const fc = JSON.parse(readFileSync(new URL("../apps/web/public/india-pc.geojson", import.meta.url), "utf8"))
  assert.equal(fc.features.length, LOK_SABHA_SEATS)
  assert.equal(fc.version, PC_GEOJSON_VERSION, "asset version and lib/india/constants must agree")

  const codes = new Set()
  for (const f of fc.features) {
    const p = f.properties
    assert.equal(p.pc_code, mirror.pcCode(p.st_code, p.pc_no), `${p.pc_name} carries a derived pc_code`)
    assert.ok(!codes.has(p.pc_code), `duplicate ${p.pc_code}`)
    codes.add(p.pc_code)
    assert.ok(p.pc_name && p.state_name, `${p.pc_code} has identity`)
    assert.ok(Array.isArray(p.c) && p.c.length === 2, `${p.pc_code} has a representative point`)
    assert.equal(f.geometry.type, "MultiPolygon")
  }
})

test("the asset carries the re-delimited units, sourced to the 2024 supplement", () => {
  const fc = JSON.parse(readFileSync(new URL("../apps/web/public/india-pc.geojson", import.meta.url), "utf8"))
  const byCode = new Map(fc.features.map(f => [f.properties.pc_code, f.properties]))
  // Ladakh exists as its own UT — DataMeet alone does not have it at all.
  assert.equal(byCode.get("38-1")?.state_name, "Ladakh")
  assert.equal(byCode.get("38-1")?.geom_source, "shijithpk-2024")
  // J&K is 5 seats post-2022, not the 6 DataMeet still carries.
  assert.equal(fc.features.filter(f => f.properties.st_code === 1).length, 5)
  assert.equal(fc.features.filter(f => f.properties.st_code === 18).length, 14, "Assam")
  for (const st of [1, 18, 38]) {
    for (const f of fc.features.filter(f => f.properties.st_code === st)) {
      assert.equal(f.properties.geom_source, "shijithpk-2024", f.properties.pc_code)
    }
  }
})

// ---------------------------------------------------------------------------
// formatters: null is never zero
// ---------------------------------------------------------------------------

test("every formatter renders null as an em dash, never as a number", () => {
  for (const fn of [formatRupees, formatCrore, formatCroreDelta, formatPct, formatSlip]) {
    assert.equal(fn(null), "—", fn.name)
    assert.equal(fn(undefined), "—", fn.name)
    assert.equal(fn(Number.NaN), "—", fn.name)
  }
  assert.equal(formatMonth(null), "—")
  assert.equal(monthsBetween(null, "2026-05-01"), null)
  assert.equal(monthsBetween("2026-05-01", null), null)
})

test("rupee amounts step through crore and lakh at the right thresholds", () => {
  assert.equal(formatRupees(813065207), "₹81.31 Cr")
  assert.equal(formatRupees(41030489), "₹4.10 Cr")
  assert.equal(formatRupees(4103000), "₹41.03 L")
  assert.equal(formatRupees(4103), "₹4,103")
  assert.equal(formatRupees(0), "₹0", "an explicit zero is a real value and prints")
})

test("crore amounts keep MoSPI's unit and group Indian-style", () => {
  assert.equal(formatCrore(30695.1), "₹30,695 Cr")
  assert.equal(formatCrore(4.5), "₹4.50 Cr")
  assert.equal(formatCrore(150000), "₹1.50 L Cr")
})

test("a cost delta names its direction, and zero says so in words", () => {
  assert.equal(formatCroreDelta(4289.96), "+₹4,290 Cr")
  assert.equal(formatCroreDelta(-12), "−₹12.00 Cr")
  assert.equal(formatCroreDelta(0), "no change")
})

test("schedule slip distinguishes later, earlier and on time", () => {
  assert.equal(formatSlip(66), "66 months later")
  assert.equal(formatSlip(1), "1 month later")
  assert.equal(formatSlip(-12), "12 months earlier")
  assert.equal(formatSlip(0), "on original schedule")
})

test("monthsBetween counts whole months across year boundaries", () => {
  assert.equal(monthsBetween("2021-03-01", "2026-09-01"), 66)  // Bangalore Metro Phase 2
  assert.equal(monthsBetween("2028-04-01", "2027-04-01"), -12) // revised earlier
  assert.equal(monthsBetween("2026-05-01", "2026-05-01"), 0)
})

test("month labels are human and pass through anything unparseable", () => {
  assert.equal(formatMonth("2026-05-01"), "May 2026")
  assert.equal(formatMonth("2026-13-01"), "2026-13-01")
  assert.equal(groupIndian(12345678), "1,23,45,678")
})

// ---------------------------------------------------------------------------
// the colour system
// ---------------------------------------------------------------------------

test("both ramps are 5 valid hex steps", () => {
  for (const ramp of [RAMP_SEQUENTIAL, RAMP_DIVERGING]) {
    assert.equal(ramp.length, 5)
    for (const c of ramp) assert.match(c, /^#[0-9a-f]{6}$/i)
  }
})

test("the diverging ramp puts zero at its neutral middle and saturates at the ends", () => {
  assert.equal(divergingColor(0, 500), RAMP_DIVERGING[2])
  assert.equal(divergingColor(5000, 500), RAMP_DIVERGING[4], "beyond scale saturates")
  assert.equal(divergingColor(-5000, 500), RAMP_DIVERGING[0])
  assert.equal(divergingColor(100, 500), RAMP_DIVERGING[3], "mildly over")
  assert.equal(divergingColor(-100, 500), RAMP_DIVERGING[1], "mildly under")
})

test("no value gets a ramp colour or a bar", () => {
  assert.notEqual(divergingColor(null, 500), RAMP_DIVERGING[2], "null is not 'no change'")
  assert.equal(barFraction(null, 100), null)
  assert.equal(barFraction(undefined, 100), null)
  assert.equal(barFraction(50, 0), null, "a zero maximum has no meaningful bar")
  assert.equal(barFraction(150, 100), 1, "clamped")
})

test("layer registry is complete, unique, and cites a source for every layer", () => {
  const ids = INDIA_LAYERS.map(l => l.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const l of INDIA_LAYERS) {
    assert.ok(l.label && l.description && l.source, l.id)
    assert.equal(l.ramp.length, 5, l.id)
    assert.equal(getIndiaLayer(l.id)?.id, l.id)
    assert.equal(rampFor(l).length, 5)
  }
  assert.equal(getIndiaLayer("nope"), null)
  assert.equal(getIndiaLayer(null), null)
})

test("inverted layers read their ramp the other way round", () => {
  const attendance = getIndiaLayer("attendance")
  assert.ok(attendance?.invert, "low attendance is the notable end")
  assert.deepEqual(rampFor(attendance), [...attendance.ramp].reverse())
})

test("the attendance layer explains why a seat can legitimately have no value", () => {
  const attendance = getIndiaLayer("attendance")
  assert.match(attendance.absentNote ?? "", /minister/i,
    "a blank cabinet seat must be explained, not left looking like missing data")
})

// ---------------------------------------------------------------------------
// caching posture
//
// Next requires a route's `revalidate` to be a literal, so the three India
// pages that are incrementally regenerated cannot import the constant the Data
// Cache uses — they carry the number instead. That is two places for one
// decision, so this asserts they still agree, and that the pages that must
// stay per-request have not quietly been made static.
// ---------------------------------------------------------------------------

const pageSource = (p) =>
  readFileSync(new URL(`../apps/web/app/india/${p}`, import.meta.url), "utf8")

test("the boundary asset is fetched by a versioned URL, because it is served immutable", () => {
  // next.config.ts freezes /india-pc.geojson for a year. That is only correct
  // while the URL carries the version the test above pins to the file itself —
  // otherwise a re-delimitation would never reach a browser that had already
  // loaded the map.
  assert.equal(PC_GEOJSON_URL, `/india-pc.geojson?v=${PC_GEOJSON_VERSION}`)
  const config = readFileSync(new URL("../apps/web/next.config.ts", import.meta.url), "utf8")
  assert.match(config, /\/india-pc\.geojson/, "the asset must still be listed as immutable")
  assert.match(config, /immutable/)
})

test("the incrementally regenerated India pages use the documented revalidate period", () => {
  const ISR_PAGES = ["page.tsx", "c/[pc_code]/page.tsx", "projects/[project_code]/page.tsx"]
  for (const p of ISR_PAGES) {
    const src = pageSource(p)
    const m = src.match(/^export const revalidate = (\d+)/m)
    assert.ok(m, `${p} declares no revalidate — it would fall back to per-request rendering`)
    assert.equal(Number(m[1]), INDIA_REVALIDATE_SECONDS,
      `${p} disagrees with INDIA_REVALIDATE_SECONDS in lib/india/constants.ts`)
    assert.doesNotMatch(src, /^export const dynamic\s*=/m, `${p} is both ISR and force-dynamic`)
  }

  // A dynamic segment is only cacheable when it declares generateStaticParams,
  // even with revalidate set. Both object routes rely on that.
  for (const p of ["c/[pc_code]/page.tsx", "projects/[project_code]/page.tsx"]) {
    assert.match(pageSource(p), /export function generateStaticParams/,
      `${p} needs generateStaticParams (may return []) for revalidate to apply`)
  }
})

test("no India page reads headers() except the one that is per-request anyway", () => {
  // headers() forces per-request rendering. The tracker is already dynamic on
  // its search params so it may read one; anything else doing so has silently
  // opted itself out of the caching this surface depends on.
  for (const p of ["page.tsx", "c/[pc_code]/page.tsx", "projects/[project_code]/page.tsx"]) {
    assert.doesNotMatch(pageSource(p), /next\/headers/,
      `${p} reads headers() and can no longer be prerendered`)
  }
  assert.match(pageSource("projects/page.tsx"), /^export const dynamic = "force-dynamic"$/m,
    "the tracker renders from searchParams and must stay per-request")
})
