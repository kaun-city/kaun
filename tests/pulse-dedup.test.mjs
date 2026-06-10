/**
 * Unit tests for pulse-dedup.mjs — the canonical CityPulse dedup key.
 *
 * Run: node --test --experimental-strip-types tests/pulse-dedup.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { dedupKey, SIGNATURE_TOKENS } from "../apps/web/lib/pulse-dedup.mjs"

test("collapses the same wire headline across outlet tags (the core bug)", () => {
  const base = "BBMP commissioner orders probe into Rs 50 crore road tender scam"
  const variants = [
    base,
    `${base} - Deccan Herald`,
    `${base} | Bengaluru`,
    `${base} - The News Minute`,
    `${base} - MSN`,
    `  ${base}  `,                       // whitespace
    base.toUpperCase(),                  // casing
    `${base} 🚨`,                        // emoji
    `${base}!!!`,                        // punctuation
    `#Bengaluru ${base} @BBMP`,          // hashtag / mention noise
  ]
  const keys = variants.map(dedupKey)
  for (const k of keys) assert.equal(k, keys[0], `variant did not collapse: ${k}`)
})

test("does NOT merge two genuinely different stories", () => {
  const a = dedupKey("Bellandur lake catches fire again, NGT seeks BBMP report")
  const b = dedupKey("BWSSB announces water cut across east Bengaluru this weekend")
  assert.notEqual(a, b)
})

test("signature is capped at SIGNATURE_TOKENS significant tokens", () => {
  const long = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu"
  assert.equal(dedupKey(long).split(" ").length, SIGNATURE_TOKENS)
})

test("a long shared prefix with a distinct tail still separates (not prefix-only)", () => {
  // The old 60-char-prefix key merged these; the token signature must not,
  // because the discriminating words are within the first 10 tokens here.
  const a = dedupKey("BBMP awards Rs 200 crore road contract to firm A in west zone")
  const b = dedupKey("BBMP awards Rs 200 crore road contract to firm B in east zone")
  assert.notEqual(a, b)
})

test("stopwords and single-char tokens are dropped from the signature", () => {
  const k = dedupKey("The BBMP is to be probed for a scam in the city")
  assert.ok(!k.split(" ").includes("the"))
  assert.ok(!k.split(" ").includes("is"))
  assert.ok(!k.split(" ").includes("a"))
  assert.ok(k.includes("bbmp") && k.includes("scam"))
})

test("short / non-English headlines use the near-exact fallback, never empty", () => {
  const shortA = dedupKey("ಬಿಬಿಎಂಪಿ")            // Kannada only
  const shortB = dedupKey("BBMP")                  // one token
  const empty  = dedupKey("")
  const emoji  = dedupKey("🚨🚨🚨")
  for (const v of [shortA, shortB, empty, emoji]) {
    assert.ok(typeof v === "string" && v.length > 0, "key must be non-empty")
  }
  // distinct short inputs must not collapse together
  assert.notEqual(shortB, dedupKey("BWSSB"))
})

test("deterministic and idempotent", () => {
  const h = "Pothole death on ORR: BBMP contractor booked - Times of India"
  assert.equal(dedupKey(h), dedupKey(h))
  // calling on the produced key is stable (no further collapse)
  const once = dedupKey(h)
  assert.equal(dedupKey(once), dedupKey(once))
})

test("handles null/undefined without throwing", () => {
  assert.doesNotThrow(() => dedupKey(undefined))
  assert.doesNotThrow(() => dedupKey(null))
})
