/**
 * contractor_profiles.blacklist_flags: right firm, neutral words, cited, ₹ … Cr.
 *
 * Pins the September 2026 findings:
 *   - "L" and "N" (one-contract firms whose parsed names were a single letter)
 *     were flagged as KRIDL because the old matcher accepted any substring;
 *   - the stored strings read "Rs 4,700 crore", "BBMP blacklisted (twice)"
 *     (the cited report says BBMP once, in 2010, and Social Welfare in 2018),
 *     "continued to receive" and "same as KRIDL", with no citation;
 *   - the reconcile only ever added flags, so a bad match was permanent.
 *
 * Run: node --test tests/contractor-flags.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  DOCUMENTED_CASES, checkFlag, citeDate, containsPhrase, desiredFlags, isDistinctive,
  nameDistance, normalizeFlag, normalizeMoney, normalizeName, planFlagChanges, FUZZY_THRESHOLD,
} from "../scripts/lib/contractor-flags.mjs"
import { createRest, restConfig } from "../scripts/lib/rest.mjs"

const kridl = DOCUMENTED_CASES.find(c => c.id === "kridl")
const documented = DOCUMENTED_CASES.map(c => ({ names: c.names, flags: c.flags, match: "phrase" }))

// The four profiles that carried flags in production on 2026-09-16.
const OLD_KRIDL = "BBMP blacklisted (2010) + Social Welfare Dept blacklisted (2018) — received Rs 4,700 crore via Section 4(g) tender exemption"
const PROD = [
  { entity_id: "ph_0000000000", canonical_name: "KRIDL BHUSIRI ACCOU", aliases: ["KRIDL BHUSIRI ACCOU"], blacklist_flags: [OLD_KRIDL] },
  { entity_id: "ph_8073912353", canonical_name: "KRIDL BHUSIRI ACCOU", aliases: ["KRIDL BHUSIRI ACCOU"], blacklist_flags: [OLD_KRIDL] },
  { entity_id: "ph_8792865545", canonical_name: "L", aliases: ["L"], blacklist_flags: [
    "BBMP blacklisted (twice) per BNP/RTI — continued to receive Rs 4,700 crore via Section 4(g) exemption",
    "BBMP blacklisted (twice) — same as KRIDL",
  ] },
  { entity_id: "ph_9901828068", canonical_name: "N", aliases: ["N"], blacklist_flags: ["BBMP blacklisted (twice) — same as KRIDL"] },
  { entity_id: "ph_9845866476", canonical_name: "STAR INFRATECH", aliases: ["STAR INFRATECH"], blacklist_flags: [] },
]

test("single-letter names never match a documented case", () => {
  const desired = desiredFlags(PROD, documented)
  assert.deepEqual(desired.get("ph_8792865545"), [])
  assert.deepEqual(desired.get("ph_9901828068"), [])
  assert.deepEqual(desired.get("ph_9845866476"), [])
})

test("KRIDL profiles get exactly the documented, cited flags", () => {
  const desired = desiredFlags(PROD, documented)
  assert.deepEqual(desired.get("ph_0000000000"), kridl.flags)
  assert.deepEqual(desired.get("ph_8073912353"), kridl.flags)
  const full = { entity_id: "x", canonical_name: "M/S. Karnataka Rural Infrastructure Development Ltd.", aliases: [] }
  assert.deepEqual(desiredFlags([full], documented).get("x"), kridl.flags)
})

test("the production backfill rewrites KRIDL twice and clears L and N", () => {
  const changes = planFlagChanges(PROD, desiredFlags(PROD, documented))
  assert.deepEqual(changes.map(c => [c.canonical_name, c.action]), [
    ["KRIDL BHUSIRI ACCOU", "rewrite"],
    ["KRIDL BHUSIRI ACCOU", "rewrite"],
    ["L", "clear"],
    ["N", "clear"],
  ])
  // Idempotent: a second run against the reconciled rows changes nothing.
  const after = PROD.map(p => ({ ...p, blacklist_flags: changes.find(c => c.entity_id === p.entity_id)?.after ?? p.blacklist_flags }))
  assert.deepEqual(planFlagChanges(after, desiredFlags(after, documented)), [])
})

test("every documented flag is publishable: neutral, cited, ₹ … Cr", () => {
  for (const c of DOCUMENTED_CASES) {
    assert.ok(c.sources.length > 0 && c.sources.every(u => u.startsWith("https://")), c.id)
    for (const f of c.flags) {
      assert.deepEqual(checkFlag(f), [], f)
      assert.equal(normalizeFlag(f), f, "documented flags are stored already normalised")
    }
  }
  assert.ok(kridl.flags.some(f => f.includes("₹4,721 Cr")))
  assert.ok(!kridl.flags.some(f => /twice/.test(f)), "the cited report names one BBMP blacklisting, not two")
})

test("checkFlag rejects every string production carried", () => {
  for (const p of PROD) for (const f of p.blacklist_flags) assert.ok(checkFlag(f).length > 0, f)
  assert.match(checkFlag(OLD_KRIDL).join(" "), /money/)
  assert.match(checkFlag("BBMP blacklisted (twice) — same as KRIDL").join(" "), /editorial/)
  assert.match(checkFlag("Blacklisted by BBMP in 2010").join(" "), /citation/)
})

test("money is normalised to ₹ … Cr and ₹ … L with Indian grouping", () => {
  assert.equal(normalizeMoney("received Rs 4,700 crore"), "received ₹4,700 Cr")
  assert.equal(normalizeMoney("Rs. 4700 Crores"), "₹4,700 Cr")
  assert.equal(normalizeMoney("INR 12943 cr."), "₹12,943 Cr")
  assert.equal(normalizeMoney("₹ 111234 crore"), "₹1,11,234 Cr")
  assert.equal(normalizeMoney("Rs 118.25 crore"), "₹118.25 Cr")
  assert.equal(normalizeMoney("Rs 18.46 lakh"), "₹18.46 L")
  assert.equal(normalizeMoney("Rs 4103"), "₹4,103")
  assert.equal(normalizeMoney("₹4,721 Cr"), "₹4,721 Cr")
  assert.equal(normalizeFlag("  Listed   by  X for Rs 5 lakhs "), "Listed by X for ₹5 L")
})

test("containment only counts on whole words, for distinctive names", () => {
  assert.equal(containsPhrase("KRIDL BHUSIRI ACCOU", "KRIDL"), true)
  assert.equal(containsPhrase("KRIDL", "L"), false)
  assert.equal(isDistinctive(normalizeName("N")), false)
  assert.equal(isDistinctive(normalizeName("Sai Enterprises")), false)
  assert.equal(isDistinctive(normalizeName("KRIDL")), true)

  assert.equal(nameDistance("KRIDL", "L"), 1)
  assert.equal(nameDistance("Karnataka Rural Infrastructure Development Limited", "N"), 1)
  assert.equal(nameDistance("KRIDL", "KRIDL BHUSIRI ACCOU"), 0.1)
  // A generic trade name must not flag every firm that shares it.
  assert.ok(nameDistance("ENTERPRISES", "RAMESH ENTERPRISES") > FUZZY_THRESHOLD)
  assert.ok(nameDistance("SAI ENTERPRISES", "SRI SAI ENTERPRISES") > FUZZY_THRESHOLD)
  assert.ok(nameDistance("Shree Balaji Constructions", "Balaji Traders") > FUZZY_THRESHOLD)
  assert.ok(nameDistance("M/s Ramaiah Infra Projects Pvt Ltd", "RAMAIAH INFRA PROJECTS") <= FUZZY_THRESHOLD)
})

test("citations use d Mon yyyy", () => {
  assert.equal(citeDate(new Date("2026-09-16T05:00:00Z")), "16 Sep 2026")
})

test("no other writer or copy of the old flag text is left", () => {
  const seed = readFileSync(new URL("../apps/web/app/api/seed-contractors/route.ts", import.meta.url), "utf8")
  assert.doesNotMatch(seed, /blacklist_flags:\s*\[/, "seed-contractors must not write flags")
  const spend = readFileSync(new URL("../apps/web/components/tabs/SpendTab.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(spend, /KPPP \/ BBMP official records/, "flags are not from KPPP or BBMP records")
  const script = readFileSync(new URL("../scripts/scrape-blacklists.mjs", import.meta.url), "utf8")
  assert.doesNotMatch(script, /Rs 4,700 crore|same as KRIDL/)
  assert.match(script, /checkFlag/)
})

test("the REST helper reads without a service key and refuses to write without one", async () => {
  const cfg = restConfig({})
  assert.equal(cfg.serviceKey, null)
  assert.match(cfg.anonKey, /^eyJ/)
  const calls = []
  const fakeFetch = async (url) => { calls.push(url); return new Response("[]", { status: 200 }) }
  const rest = createRest(cfg, fakeFetch)
  assert.equal(rest.canWrite, false)
  await rest.selectAll("contractor_profiles", { select: "entity_id", order: "entity_id.asc" })
  assert.equal(calls.length, 1)
  await assert.rejects(rest.patch("contractor_profiles", { entity_id: "eq.x" }, { blacklist_flags: [] }), /SUPABASE_SERVICE_KEY/)
  await assert.rejects(rest.selectAll("contractor_profiles", { select: "entity_id" }), /order/)
  assert.equal(calls.length, 1, "a refused write never reaches the network")
})

test("a write that touches the wrong number of rows fails loudly", async () => {
  const fakeFetch = async () => new Response("[]", { status: 200 })
  const rest = createRest({ url: "https://example.test", serviceKey: "service", anonKey: "anon" }, fakeFetch)
  await assert.rejects(rest.patch("contractor_profiles", { entity_id: "eq.missing" }, {}), /touched 0 row\(s\), expected 1/)
})
