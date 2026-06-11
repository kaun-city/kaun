/**
 * Unit tests for apps/web/lib/map-layers.ts — the choropleth registry and
 * its pure helpers (quantile breaks, color bucketing, value formatting).
 *
 * Run: node --test --experimental-strip-types tests/map-layers.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { MAP_LAYERS, getLayer, quantileBreaks, colorFor, formatValue } from "../apps/web/lib/map-layers.ts"

test("registry: ids are unique and every layer is fully specified", () => {
  const ids = MAP_LAYERS.map(l => l.id)
  assert.equal(new Set(ids).size, ids.length, "duplicate layer ids")
  for (const l of MAP_LAYERS) {
    assert.ok(l.label.length > 0, `${l.id}: label required`)
    assert.ok(l.description.length > 0, `${l.id}: description required`)
    assert.ok(l.source.length > 0, `${l.id}: source required`)
    assert.ok(["count", "pct", "inr_lakh"].includes(l.format), `${l.id}: bad format`)
    assert.equal(l.ramp.length, 5, `${l.id}: ramp must have 5 steps`)
    for (const c of l.ramp) assert.match(c, /^#[0-9a-f]{6}$/i, `${l.id}: bad color ${c}`)
  }
})

test("getLayer resolves ids and rejects unknowns", () => {
  assert.equal(getLayer("criminal_cases")?.id, "criminal_cases")
  assert.equal(getLayer("nope"), null)
  assert.equal(getLayer(null), null)
  assert.equal(getLayer(undefined), null)
})

test("quantileBreaks: uniform 1..100 gives ~quintile cut points", () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1)
  const breaks = quantileBreaks(values)
  assert.equal(breaks.length, 4)
  for (let i = 1; i < breaks.length; i++) {
    assert.ok(breaks[i] > breaks[i - 1], "breaks must ascend")
  }
  // Quintiles of 1..100 land near 21/41/61/81 (floor indexing)
  assert.ok(breaks[0] >= 20 && breaks[0] <= 21, `first break ${breaks[0]}`)
  assert.ok(breaks[3] >= 80 && breaks[3] <= 81, `last break ${breaks[3]}`)
})

test("quantileBreaks: heavy ties collapse without duplicates", () => {
  const values = [0, 0, 0, 0, 0, 0, 0, 0, 5, 10]
  const breaks = quantileBreaks(values)
  const unique = new Set(breaks)
  assert.equal(unique.size, breaks.length, "breaks must be deduplicated")
})

test("quantileBreaks: empty and single-value inputs", () => {
  assert.deepEqual(quantileBreaks([]), [])
  assert.equal(quantileBreaks([7, 7, 7]).length, 1)
})

test("colorFor buckets across the ramp", () => {
  const ramp = ["a", "b", "c", "d", "e"]
  const breaks = [10, 20, 30, 40]
  assert.equal(colorFor(5, breaks, ramp), "a")
  assert.equal(colorFor(10, breaks, ramp), "a") // boundary: not strictly greater
  assert.equal(colorFor(15, breaks, ramp), "b")
  assert.equal(colorFor(35, breaks, ramp), "d")
  assert.equal(colorFor(999, breaks, ramp), "e")
})

test("colorFor never exceeds the ramp with collapsed breaks", () => {
  const ramp = ["a", "b", "c", "d", "e"]
  assert.equal(colorFor(100, [0], ramp), "b")
  assert.equal(colorFor(100, [], ramp), "a")
})

test("formatValue: counts, percentages, rupees", () => {
  assert.equal(formatValue(12345, "count"), "12,345")
  assert.equal(formatValue(43, "pct"), "43%")
  assert.equal(formatValue(43.6, "pct"), "44%")
  assert.equal(formatValue(250, "inr_lakh"), "₹2.5 Cr")
  assert.equal(formatValue(80, "inr_lakh"), "₹80 L")
})
