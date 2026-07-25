/**
 * Unit tests for scripts/india/lib/pc-code.mjs — the canonical India PC key
 * and the deliberately-conservative constituency-name normalizer.
 *
 * The point of most of these tests is what the code must NOT do: it must not
 * key on pc_no alone (not nationally unique), and it must not fuzzy-fold
 * near-miss spellings (those belong in in_pc_source_aliases, reviewed).
 *
 * Run: node --test --experimental-strip-types tests/india-pc-code.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  pcCode, parsePcCode, normalizeConstituencyName, reservationFromName, resolvePc,
} from "../scripts/india/lib/pc-code.mjs"

test("pc_code is unpadded (matches data/pc-crosswalk/) and round-trips", () => {
  assert.equal(pcCode(2, 1), "2-1")        // Kangra, Himachal Pradesh
  assert.equal(pcCode(33, 10), "33-10")    // Dharmapuri, Tamil Nadu
  assert.equal(pcCode(9, 80), "9-80")      // Uttar Pradesh's 80th seat
  assert.deepEqual(parsePcCode("2-1"), { st_code: 2, pc_no: 1 })
  assert.deepEqual(parsePcCode(pcCode(33, 10)), { st_code: 33, pc_no: 10 })
  // Leading zeros are NOT canonical — reject rather than silently accept a
  // second spelling of the same key.
  assert.throws(() => parsePcCode("02-01"), /not a pc_code/)
})

test("pc_no alone would collide across states — pc_code does not", () => {
  // Every state/UT has a pc_no=1. Keyed on pc_no these are one row; keyed on
  // pc_code they are 3 distinct seats.
  const seats = [pcCode(2, 1), pcCode(29, 1), pcCode(33, 1)]
  assert.equal(new Set(seats).size, 3)
})

test("pcCode rejects junk rather than producing a plausible-looking key", () => {
  for (const bad of [[null, 1], [1, null], ["x", 1], [0, 1], [1, 0], [1.5, 2]]) {
    assert.throws(() => pcCode(bad[0], bad[1]), /pcCode: bad/)
  }
  assert.throws(() => parsePcCode("2-1"), /not a pc_code/)
  assert.throws(() => parsePcCode(undefined), /not a pc_code/)
})

test("normalizer strips case, punctuation and the (SC)/(ST) reservation suffix", () => {
  assert.equal(normalizeConstituencyName("BANGALORE CENTRAL"), "bangalore central")
  assert.equal(normalizeConstituencyName("Bangalore  Central "), "bangalore central")
  assert.equal(normalizeConstituencyName("BELLARY(ST)"), "bellary")
  assert.equal(normalizeConstituencyName("GULBARGA(SC)"), "gulbarga")
  assert.equal(normalizeConstituencyName("Peddapalle (SC)"), "peddapalle")
  assert.equal(normalizeConstituencyName("Dadra & Nagar Haveli"), "dadra nagar haveli")
  assert.equal(normalizeConstituencyName("Puducherry"), "puducherry")
})

test("normalizer never eats a real name that merely ends in st/sc", () => {
  assert.equal(normalizeConstituencyName("North West Delhi"), "north west delhi")
  assert.equal(normalizeConstituencyName("West"), "west")
})

test("normalizer is total: null/undefined/blank give the empty key", () => {
  for (const v of [null, undefined, "", "   ", "()"]) {
    assert.equal(normalizeConstituencyName(v), "")
  }
})

test("normalizer is deterministic and idempotent", () => {
  const s = "  MAHBUBNAGAR (SC) "
  const once = normalizeConstituencyName(s)
  assert.equal(once, normalizeConstituencyName(s))
  assert.equal(once, normalizeConstituencyName(once))
})

test("normalizer does NOT fuzzy-fold near-miss spellings (that is the alias table's job)", () => {
  // These are the real sansad-vs-DataMeet variants from recon. If any pair
  // ever collapses here, the alias table has been silently bypassed.
  const pairs = [
    ["Mahbubnagar", "Mahabubnagar"],
    ["Firozpur", "Ferozepur"],
    ["Hardwar", "Haridwar"],
  ]
  for (const [a, b] of pairs) {
    assert.notEqual(normalizeConstituencyName(a), normalizeConstituencyName(b))
  }
})

test("reservationFromName reads the suffix but is only a hint", () => {
  assert.equal(reservationFromName("BELLARY(ST)"), "ST")
  assert.equal(reservationFromName("GULBARGA(SC)"), "SC")
  assert.equal(reservationFromName("Bangalore Central"), null)
  assert.equal(reservationFromName(null), null)
})

test("resolvePc: alias table wins, then exact normalized match, else null", () => {
  const byState = new Map([[29, new Map([
    ["bangalore central", "29-25"],
    ["mahabubnagar", "29-11"],
  ])]])
  const aliases = new Map([["myneta:185", "29-25"]])

  assert.deepEqual(
    resolvePc({ source: "myneta", sourceKey: "185", stCode: 29, name: "WHATEVER", byState, aliases }),
    { pc_code: "29-25", method: "alias_table" })

  assert.deepEqual(
    resolvePc({ source: "sansad", sourceKey: "x", stCode: 29, name: "Bangalore Central", byState, aliases }),
    { pc_code: "29-25", method: "exact_normalized" })

  // the classic near-miss: resolves to nothing, never to the closest string
  assert.deepEqual(
    resolvePc({ source: "sansad", sourceKey: "y", stCode: 29, name: "Mahbubnagar", byState, aliases }),
    { pc_code: null, reason: "no_exact_match" })

  assert.deepEqual(
    resolvePc({ source: "sansad", sourceKey: "z", stCode: 99, name: "Anything", byState, aliases }),
    { pc_code: null, reason: "unknown_state" })

  assert.deepEqual(
    resolvePc({ source: "sansad", sourceKey: "w", stCode: 29, name: "", byState, aliases }),
    { pc_code: null, reason: "empty_name" })
})
