/**
 * Unit tests for the cities registry (apps/web/lib/cities/*.ts) and
 * tone-aware fallback-facts.
 *
 * Node's strip-types ESM loader needs explicit .ts extensions, so this test
 * imports the leaf city configs directly rather than via index.ts (which uses
 * extensionless imports for the Next.js module resolver). The tiny registry
 * helper logic is re-asserted inline below.
 *
 * Run: node --test --experimental-strip-types tests/cities-registry.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { bengaluru } from "../apps/web/lib/cities/bengaluru.ts"
import { visakhapatnam } from "../apps/web/lib/cities/visakhapatnam.ts"

const REGISTRY = { bengaluru, visakhapatnam }
const getCity = (id) => REGISTRY[id ?? "bengaluru"] ?? bengaluru
const allCities = () => Object.values(REGISTRY)

test("bengaluru config has the expected core fields", () => {
  assert.equal(bengaluru.id, "bengaluru")
  assert.equal(bengaluru.tone, "accountability")
  assert.equal(bengaluru.wardCount, 243)
  assert.equal(bengaluru.state, "Karnataka")
})

test("visakhapatnam config has the expected core fields", () => {
  assert.equal(visakhapatnam.id, "visakhapatnam")
  assert.equal(visakhapatnam.tone, "transparency")
  assert.equal(visakhapatnam.wardCount, 98)
  assert.equal(visakhapatnam.state, "Andhra Pradesh")
  assert.equal(visakhapatnam.localAgency.short, "GVMC")
})

test("getCity falls back to bengaluru for unknown ids", () => {
  assert.equal(getCity("hyderabad").id, "bengaluru")
  assert.equal(getCity(undefined).id, "bengaluru")
  assert.equal(getCity(null).id, "bengaluru")
})

test("allCities returns both registered cities", () => {
  const ids = allCities().map(c => c.id).sort()
  assert.deepEqual(ids, ["bengaluru", "visakhapatnam"])
})

test("city configs expose required fields", () => {
  for (const c of allCities()) {
    assert.ok(c.id, "id required")
    assert.ok(c.name, "name required")
    assert.ok(c.state, "state required")
    assert.ok(Array.isArray(c.center) && c.center.length === 2, "center should be [lat,lng]")
    assert.ok(typeof c.zoom === "number", "zoom should be number")
    assert.ok(c.tone === "accountability" || c.tone === "transparency", "tone must be set")
    assert.ok(c.localAgency?.short, "localAgency.short required")
    assert.ok(typeof c.wardCount === "number", "wardCount required")
    assert.ok(c.features && typeof c.features === "object", "features object required")
  }
})

test("Bengaluru center is in the right bbox", () => {
  const [lat, lng] = bengaluru.center
  assert.ok(lat > 12.7 && lat < 13.3, `Bengaluru lat ${lat} should be between 12.7 and 13.3`)
  assert.ok(lng > 77.3 && lng < 77.9, `Bengaluru lng ${lng} should be between 77.3 and 77.9`)
})

test("Visakhapatnam center is in the right bbox", () => {
  const [lat, lng] = visakhapatnam.center
  assert.ok(lat > 17.5 && lat < 17.9, `Vizag lat ${lat} should be between 17.5 and 17.9`)
  assert.ok(lng > 83.0 && lng < 83.5, `Vizag lng ${lng} should be between 83.0 and 83.5`)
})
