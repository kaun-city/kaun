/**
 * Tenders won by Kaun's contractors: contractor_profiles matched by company
 * name to the awarded suppliers in blr-tenders-bids (Vonter, ODbL), and shown
 * on the ward card's contractor list.
 *
 * Run: node --test --experimental-strip-types tests/contractor-tender-wins.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  RARE_WORD_MAX, compactName, indexWinners, isCompanyName, matchContractors, personAndCompany, supplierKey,
} from "../scripts/lib/tender-supplier-matches.mjs"
import { matchesSql, planLoad, rematchContractors } from "../scripts/adapters/blr-tenders-bids.mjs"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const tenders = (...winners) => winners.map(name => ({ awarded_bidders: [name] }))
const profile = (id, canonical_name, aliases = [canonical_name]) => ({ id, canonical_name, aliases })
const matched = (profiles, rows) => matchContractors(profiles, indexWinners(rows))

// ── What counts as a firm name ──────────────────────────────

test("personal names never match; firm names do, even when BBMP's export cut them at 20 characters", () => {
  for (const name of ["ANANDA KUMAR", "GOPI REDDY", "LOKESH R", "Mr SATISH S", "RAMESH CON"]) {
    assert.equal(isCompanyName(name), false, name)
  }
  for (const name of ["SAMRUDHI CONSTRUCTIONS", "CK ANAND CONSTRUCTIONS LLP", "TEJUS CONSULTANTS", "BMRG PROJECTS INDIA PVT LTD"]) {
    assert.equal(isCompanyName(name), true, name)
  }
  assert.equal(isCompanyName("SAMRUDHI CONSTRUCTIO"), true, "cut mid-word at 20 characters")
  assert.equal(isCompanyName("SRI CHOWDESHWARI ENT"), true)
})

test("names compare without case, spacing, punctuation, M/S or legal forms, but keep SRI", () => {
  assert.equal(compactName("M/S Tejus Consultants Pvt. Ltd."), "TEJUSCONSULTANTS")
  assert.equal(compactName("SAHYADRICONSTRUCTION"), compactName("Sahyadri Construction"))
  assert.notEqual(compactName("SRI BALAJI CONSTRUCTIONS"), compactName("BALAJI CONSTRUCTIONS"), "SRI is part of many firm names")
  assert.deepEqual(personAndCompany("S NAGARAJAPPA( SHREE GANAPATHI ENGINEERS )"), { person: "S NAGARAJAPPA", company: "SHREE GANAPATHI ENGINEERS" })
  assert.equal(personAndCompany("SRI CHOWDESHWARI CONCRETE (INDIA) PRIVATE LIMITED"), null)
  assert.equal(supplierKey("S NAGARAJAPPA( SHREE GANAPATHI ENGINEERS )"), "snagarajappashreeganapathiengineers", "same as the loader's SQL")
})

// ── Which firm names identify one firm ──────────────────────

test("a firm name made only of common words matches nothing", () => {
  const common = Array.from({ length: RARE_WORD_MAX + 1 }, (_, i) => `BALAJI ${["CONSTRUCTIONS", "ENTERPRISES", "ELECTRICALS", "INFRA", "TRADERS", "ASSOCIATES"][i]}`)
  const rows = tenders(...common, "SAMRUDHI CONSTRUCTIONS")
  assert.deepEqual(matched([profile(1, "BALAJI CONSTRUCTIONS"), profile(2, "SAMRUDHI CONSTRUCTIONS")], rows).map(m => m.contractor_profile_id), [2])
})

test("a company KPPP shows for two different people matches nothing", () => {
  const rows = tenders("RAVI K( SHAMBHAVI CONSTRUCTIONS )", "MANJU S( SHAMBHAVI CONSTRUCTIONS )", "VISHWAS J P( TEJUS CONSULTANTS )", "TEJUS CONSULTANTS")
  const matches = matched([profile(1, "SHAMBHAVI CONSTRUCTIONS"), profile(2, "TEJUS CONSULTANTS")], rows)
  assert.deepEqual(matches, [
    { contractor_profile_id: 2, supplier_key: "tejusconsultants", matched_name: "TEJUS CONSULTANTS", match_kind: "exact" },
    { contractor_profile_id: 2, supplier_key: "vishwasjptejusconsultants", matched_name: "TEJUS CONSULTANTS", match_kind: "exact" },
  ])
})

test("the person in PERSON( COMPANY ) is never matched, the company is", () => {
  const rows = tenders("S NAGARAJAPPA( SHREE GANAPATHI ENGINEERS )")
  assert.deepEqual(matched([profile(1, "S NAGARAJAPPA")], rows), [])
  assert.deepEqual(matched([profile(2, "SHREE GANAPATHI ENGINEERS")], rows).map(m => m.supplier_key), ["snagarajappashreeganapathiengineers"])
  assert.deepEqual(matched([profile(3, "RAMACHANDRAPPA GOWDA")], tenders("RAMACHANDRAPPA GOWDA ENTERPRISES")), [],
    "a personal name is not matched even where it begins a firm's name")
})

// ── Names cut at 20 characters ──────────────────────────────

test("a cut-off name matches only the one firm it begins", () => {
  const cut = profile(1, "NIKSHEP INFRA PROJEC")
  assert.deepEqual(matched([cut], tenders("NIKSHEP INFRA PROJECTS", "DHANANJAYA B S( NIKSHEP INFRA PROJECTS )")).map(m => [m.supplier_key, m.match_kind]), [
    ["dhananjayabsnikshepinfraprojects", "truncated"],
    ["nikshepinfraprojects", "truncated"],
  ])
  assert.deepEqual(matched([cut], tenders("NIKSHEP INFRA PROJECTS", "NIKSHEP INFRA PROJECTIONS")), [], "two firms begin that way")
  assert.equal(matched([profile(2, "SAMRUDHI CONSTRUCTIO")], tenders("SAMRUDHI CONSTRUCTION", "SAMRUDHI CONSTRUCTIONS")).length, 2,
    "…CONSTRUCTION and …CONSTRUCTIONS are one firm")
  assert.deepEqual(matched([profile(3, "NIKSHEP INFRA")], tenders("NIKSHEP INFRA PROJECTS")), [], "a short name is not cut off")
})

test("a cut-off name that begins a common firm name doesn't fall through to a longer rare one", () => {
  const common = Array.from({ length: RARE_WORD_MAX }, (_, i) => `SRINIVASA ${["ENTERPRISES", "TRADERS", "ASSOCIATES", "INFRA", "WORKS"][i]}`)
  const rows = tenders(...common, "SRINIVASA ELECTRICALS", "SRINIVASA ELECTRICALS SRINIVASA CONCRETE PRODUCTS")
  assert.deepEqual(matched([profile(1, "SRINIVASA ELECTRICAL")], rows), [])
  assert.deepEqual(matched([profile(1, "SRINIVASA ELECTRICAL")], tenders(...common, "SRINIVASA ELECTRICALS")), [],
    "the only firm it begins is too common to identify")
})

test("an alias can match, an exact match beats a cut-off one, and every match names the name that matched", () => {
  const rows = tenders("CK ANAND CONSTRUCTIONS LLP", "Shwetha R( NIHAL CONSTRUCTIONS )")
  const matches = matched([profile(1, "CK ANAND CONSTRUCTIO", ["CK ANAND CONSTRUCTIO", "NIHAL CONSTRUCTIONS", "CK ANAND CONSTRUCTIONS"])], rows)
  assert.deepEqual(matches, [
    { contractor_profile_id: 1, supplier_key: "ckanandconstructionsllp", matched_name: "CK ANAND CONSTRUCTIONS", match_kind: "exact" },
    { contractor_profile_id: 1, supplier_key: "shwetharnihalconstructions", matched_name: "NIHAL CONSTRUCTIONS", match_kind: "exact" },
  ])
})

// ── The weekly job ──────────────────────────────────────────

test("contractor matches are rebuilt only from a current snapshot, and replaced in one transaction", async () => {
  const aug = { generatedAt: "2026-08-21T16:32:42.350Z", count: 100 }
  const sep = { generatedAt: "2026-09-14T10:00:00.000Z", count: 100 }
  assert.equal(planLoad(aug, aug).current, true, "unchanged: rematch against it")
  assert.equal(planLoad(sep, aug).current, true)
  assert.equal(planLoad(aug, sep).current, false, "older than the loaded snapshot: leave the matches alone")

  const sql = matchesSql([{ contractor_profile_id: 1, supplier_key: "x", matched_name: "O'NEIL WORKS", match_kind: "exact" }])
  assert.match(sql, /^BEGIN;\nDELETE FROM public\.contractor_supplier_matches;\nINSERT INTO public\.contractor_supplier_matches/)
  assert.ok(sql.includes(`"matched_name":"O'NEIL WORKS"`))
  assert.ok(sql.trim().endsWith("COMMIT;"))

  const rows = tenders("TEJUS CONSULTANTS")
  const quiet = console.log
  console.log = () => {}
  try {
    const writes = []
    const query = profiles => async sql => {
      if (/to_regclass/.test(sql)) return [{ ready: true }]
      if (/FROM public\.contractor_profiles/.test(sql)) return profiles
      if (/count\(\*\)/.test(sql)) return [{ n: 1 }]
      writes.push(sql)
      return []
    }
    await rematchContractors(query([profile(7, "TEJUS CONSULTANTS")]), rows, { dryRun: true })
    assert.equal(writes.length, 0, "a dry run writes nothing")
    await rematchContractors(query([profile(7, "TEJUS CONSULTANTS")]), rows)
    assert.equal(writes.length, 1)
    await assert.rejects(rematchContractors(query([profile(8, "ANANDA KUMAR")]), rows), /no contractor matched any awarded supplier/)
    await assert.rejects(rematchContractors(async () => [{ ready: false }], rows), /apply migration 20260922_contractor_tender_wins\.sql/)
  } finally {
    console.log = quiet
  }
})

// ── Schema and card ─────────────────────────────────────────

test("the migration keeps matches public-read, and the function is read-only and grouped per contractor", () => {
  const migration = read("supabase/migrations/20260922_contractor_tender_wins.sql")
  assert.match(migration, /contractor_profile_id\s+integer NOT NULL REFERENCES public\.contractor_profiles \(id\) ON DELETE CASCADE/)
  assert.match(migration, /match_kind\s+text NOT NULL CHECK \(match_kind IN \('exact', 'truncated'\)\)/)
  assert.match(migration, /ALTER TABLE public\.contractor_supplier_matches ENABLE ROW LEVEL SECURITY;/)
  assert.match(migration, /REVOKE ALL ON public\.contractor_supplier_matches FROM anon, authenticated;\nGRANT SELECT ON public\.contractor_supplier_matches TO anon, authenticated;/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.contractor_tender_wins\(p_entity_ids text\[\]\)[\s\S]*?LANGUAGE sql\nSTABLE\nSET search_path = public/)
  assert.match(migration, /SELECT DISTINCT ON \(p\.entity_id, t\.source, t\.tender_number\)/, "a tender won under two names counts once")
  assert.match(migration, /count\(won\.award_amount_inr\)::integer/, "amounts are counted, never assumed for KPPP")
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.contractor_tender_wins\(text\[\]\) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public\.contractor_tender_wins\(text\[\]\) TO anon, authenticated, service_role;/)
  assert.match(migration, /Open Database License 1\.0/)
})

test("the card says it's a name match, shows missing amounts as missing, and credits the dataset", () => {
  const spend = read("apps/web/components/tabs/SpendTab.tsx")
  assert.match(spend, /tender\{wins\.wins !== 1 \? "s" : ""\} won under this company name/)
  assert.match(spend, /awarded across the \{wins\.with_amount\.toLocaleString\("en-IN"\)\} with a published amount/)
  assert.match(spend, /: "amount not published"/)
  assert.match(spend, /Matched by company name\{otherNames\.length \? `, through \$\{otherNames\.join\(", "\)\} \(listed with this contractor\)` : ""\}/)
  assert.match(spend, /Neither record has a registration number, so this is not confirmation that it is the same firm\./)
  assert.match(spend, /href="https:\/\/github\.com\/Vonter\/blr-tenders-bids"[\s\S]*?by Vonter[\s\S]*?href="https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0\/"/)
  assert.match(spend, /\{winsByContractor\.has\(c\.entity_id\) && <TenderWins/)
  assert.match(spend, /\["propertyTax", "tradeLicenses", "contractors", "tenderWins"\] as const\)\.some\(loadFailed\)/)
  assert.doesNotMatch(spend.slice(spend.indexOf("function TenderWins"), spend.indexOf("interface Props")), /phone/)
  assert.match(read("apps/web/components/WardCard.tsx"), /contractorTenderWins=\{ward\.contractorTenderWins\}/)
})
