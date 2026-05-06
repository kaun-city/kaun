/**
 * Unit tests for fallback-facts.ts — tone-aware fallback PulseFacts.
 *
 * Imports via explicit .ts extension to satisfy Node's strip-types ESM loader.
 *
 * Run: node --test --experimental-strip-types tests/fallback-facts.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { getFallbackFacts } from "../apps/web/lib/cities/fallback-facts.ts"

test("getFallbackFacts returns transparency facts for vizag", () => {
  const facts = getFallbackFacts("visakhapatnam")
  assert.ok(facts.length > 0)
  assert.ok(facts.some(f => f.severity === "green"), "should include green facts")
  assert.ok(facts.some(f => /UPYOG|RTGS|GSWS|e-Proc|Open|Sachivalayam/i.test(f.headline)),
    "should mention an AP transparency programme")
})

test("getFallbackFacts returns accountability facts for bengaluru", () => {
  const facts = getFallbackFacts("bengaluru")
  assert.ok(facts.length > 0)
  assert.ok(facts.some(f => f.severity === "red"), "should include red facts")
  assert.equal(facts.filter(f => f.severity === "green").length, 0,
    "accountability tone should not include green entries")
})

test("getFallbackFacts uses tone fallback for unknown city", () => {
  const transparency = getFallbackFacts("kakinada", "transparency")
  assert.ok(transparency.some(f => f.severity === "green"))
  const accountability = getFallbackFacts("hyderabad", "accountability")
  assert.equal(accountability.filter(f => f.severity === "green").length, 0)
})

test("getFallbackFacts defaults to bengaluru when no tone given", () => {
  const facts = getFallbackFacts("unknown-city")
  assert.equal(facts.filter(f => f.severity === "green").length, 0)
})

test("every fallback fact has the required shape", () => {
  for (const cityId of ["bengaluru", "visakhapatnam"]) {
    const facts = getFallbackFacts(cityId)
    assert.ok(facts.length > 0, `${cityId} should have facts`)
    for (const f of facts) {
      assert.ok(["red", "yellow", "green"].includes(f.severity), `bad severity in ${cityId}`)
      assert.ok(typeof f.headline === "string" && f.headline.length > 0)
      assert.ok(typeof f.category === "string" && f.category.length > 0)
      assert.ok(typeof f.source === "string" && f.source.length > 0)
    }
  }
})
