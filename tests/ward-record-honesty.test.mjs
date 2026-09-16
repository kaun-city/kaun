/**
 * Every number on the ward record must mean exactly what its words say.
 *
 * These pin the fixes from the September 2026 record-sheet review:
 *   - a flagged contractor's city-wide total is never presented as this
 *     ward's money (KRIDL: ₹207 Cr across 111 wards);
 *   - the headline waits for everything it ranks, so it never swaps;
 *   - BBMP-198-keyed tables (spend, potholes, committee meetings) are not
 *     looked up with DataMeet-243 ward numbers, which name other places;
 *     they reach a ward only through the spatial 198 -> 243 crosswalk;
 *   - bus stops are shown once, from the deduplicated source;
 *   - no impossible "56 of ~48" ratio, no wrong RTI portal, helplines dial;
 *   - no browser call to reddit.com, and a refused clipboard is handled.
 *
 * The headline logic is exercised for real: pickHeadline() is lifted out of
 * WardHeadline.tsx (it is plain TypeScript above the JSX) and run with type
 * stripping, so no build step or web dependencies are needed in CI.
 *
 * Run: node --test --experimental-strip-types tests/ward-record-honesty.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"

import { formatLakh } from "../apps/web/lib/ward-utils.ts"
import { DOCUMENTED_CASES } from "../scripts/lib/contractor-flags.mjs"

const read = path => readFileSync(new URL(`../apps/web/${path}`, import.meta.url), "utf8")

const headlineSource = read("components/WardHeadline.tsx")
const grade = read("components/WardGrade.tsx")
const card = read("components/WardCard.tsx")
const hook = read("hooks/useWardData.ts")
const who = read("components/tabs/WhoTab.tsx")
const spend = read("components/tabs/SpendTab.tsx")
const citizen = read("components/tabs/CitizenTab.tsx")
const reach = read("components/tabs/ReachTab.tsx")
const api = read("lib/api.ts")

/** pickHeadline() and its helpers, without the JSX component below them. */
function loadPickHeadline() {
  const start = headlineSource.indexOf("function yearRange")
  const end = headlineSource.indexOf("export function WardHeadline(")
  assert.ok(start > 0 && end > start, "WardHeadline.tsx layout changed; update this loader")
  const body = stripTypeScriptTypes(headlineSource.slice(start, end)).replace(/^export /gm, "")
  const getCity = () => ({ state: "Karnataka" })
  return new Function("getCity", "formatLakh", `${body}\nreturn pickHeadline`)(getCity, formatLakh)
}
const pickHeadline = loadPickHeadline()

// Real contractor_profiles rows (hosted Supabase, read 2026-09-16), trimmed.
const KRIDL = {
  entity_id: "ph_0000000000", canonical_name: "KRIDL BHUSIRI ACCOU", aliases: [], phone: null,
  total_contracts: 335, total_value_lakh: 20715.13, total_paid_lakh: 0, total_deduction_lakh: 0,
  avg_deduction_pct: 0, ward_count: 111, wards: [5, 7, 8], first_seen: "2024-25", last_seen: "2024-25",
  is_govt_entity: false,
  blacklist_flags: DOCUMENTED_CASES.find(c => c.id === "kridl").flags,
}
const KRIDL_SECOND_PHONE = { ...KRIDL, entity_id: "ph_8073912353", total_contracts: 10, total_value_lakh: 437.54, ward_count: 7 }
// A second, smaller flagged firm (synthetic: the one-contract "N" profile once carried a false KRIDL match).
const SMALL_FLAGGED = { ...KRIDL, entity_id: "ph_test_small", canonical_name: "SMALL FLAGGED WORKS", total_contracts: 1, total_value_lakh: 9.68, ward_count: 1 }
const CLEAN = { ...KRIDL, entity_id: "ph_1", canonical_name: "CLEAN WORKS", blacklist_flags: [], total_value_lakh: 99999 }

const base = { reportCard: null, committeeMeetings: [], infraStats: null, wardContractors: [], cityId: "bengaluru" }

test("a flagged contractor's money is named as city-wide, never as this ward's", () => {
  const headline = pickHeadline({ ...base, wardContractors: [CLEAN, KRIDL], formerWards: ["Kodandarampura"] })
  assert.equal(headline.severity, "red")
  assert.equal(headline.text, "A contractor on a debarment list has work orders in this area")
  assert.match(headline.detail, /KRIDL BHUSIRI ACCOU: ₹207 Cr in 335 contracts across 111 wards city-wide/)
  assert.doesNotMatch(`${headline.text} ${headline.detail}`, /in public money to entities|this ward's/i)
  // The clean contractor's value must not leak into the flagged figure.
  assert.doesNotMatch(headline.detail, /₹1,000 Cr|₹1,207 Cr/)
  assert.match(headline.source, /BBMP work orders 2024-25 · former ward Kodandarampura/)
})

test("one firm under two phone numbers counts once; other firms are counted, not summed", () => {
  const one = pickHeadline({ ...base, wardContractors: [KRIDL_SECOND_PHONE, KRIDL] })
  assert.equal(one.text, "A contractor on a debarment list has work orders in this ward")
  assert.match(one.detail, /₹207 Cr in 335 contracts across 111 wards city-wide$/)

  const two = pickHeadline({ ...base, wardContractors: [SMALL_FLAGGED, KRIDL, KRIDL_SECOND_PHONE] })
  assert.equal(two.text, "2 contractors on debarment lists have work orders in this ward")
  assert.match(two.detail, /^KRIDL BHUSIRI ACCOU: ₹207 Cr .* and 1 other flagged firm$/)
})

test("a single-ward contractor is not described as spread across the city", () => {
  const headline = pickHeadline({ ...base, wardContractors: [SMALL_FLAGGED] })
  assert.equal(headline.detail, "SMALL FLAGGED WORKS: ₹9.7 L in 1 contract city-wide, in 1 ward")
})

const committee = (ward_no, ward_name, meetings_count) => ({ ward_no, ward_name, assembly_constituency: null, meetings_count, period: "2020-2022" })

test("no committee finding claims a denominator the data does not have", () => {
  const headline = pickHeadline({ ...base, committeeMeetings: [committee(25, "Horamavu", 0)] })
  assert.equal(headline.text, "No ward committee meetings recorded in 2020-2022")
  assert.match(headline.detail, /^Horamavu ward committee/)
  assert.match(headline.source, /198-ward map/)
  assert.doesNotMatch(`${headline.text} ${headline.detail}`, /of 56|mandated meetings|never met/)
})

test("former ward committees are judged one by one, never pooled", () => {
  // One silent committee does not make the whole area silent.
  assert.equal(pickHeadline({ ...base, committeeMeetings: [committee(25, "Horamavu", 0), committee(26, "Ramamurthy Nagar", 12)] }), null)
  const both = pickHeadline({ ...base, committeeMeetings: [committee(25, "Horamavu", 0), committee(26, "Ramamurthy Nagar", 0)] })
  assert.match(both.detail, /^Horamavu and Ramamurthy Nagar ward committees/)
  // Counts are shown per committee: the snapshot shows the largest overlap's own count.
  assert.match(grade, /const \[largestCommittee\] = committeeMeetings/)
  assert.doesNotMatch(`${grade}\n${who}\n${hook}`, /meetings_count\)?\s*\+|reduce\([^)]*meetings_count/)
  assert.match(who, /committeeMeetings\.map\(committee =>/)
})

test("the headline waits for every input it ranks, then renders once", () => {
  assert.match(headlineSource, /settled === false/)
  assert.match(card, /<WardHeadline\s+settled=\{ward\.headlineReady\}/)
  assert.match(card, /<WardGrade\s+settled=\{ward\.snapshotReady\}/)
  assert.match(hook, /headlineReady: settledIdentity === wardIdentity && reportCardSettled && committeeSettled && infraSettled && contractorsSettled/)
  // Each settled flag is reset when the ward changes.
  for (const flag of ["ReportCard", "Committee", "Infra", "Contractors", "Potholes"]) {
    assert.match(hook, new RegExp(`set${flag}Settled\\(false\\)`), flag)
    assert.match(hook, new RegExp(`set${flag}Settled\\(true\\)`), flag)
  }
})

test("the evidence snapshot leaves red to the headline", () => {
  assert.doesNotMatch(grade, /text-danger|alarm/)
})

test("BBMP-198-keyed tables are not looked up with 243-ward numbers", () => {
  // One switch, shared by the sheet, map layers and AI routes. It is on only
  // because every surface below goes through the spatial crosswalk.
  assert.match(read("lib/ward-data-quality.ts"), /export const BBMP_198_RECORDS_ATTRIBUTABLE = true/)
  assert.match(hook, /import \{ BBMP_198_RECORDS_ATTRIBUTABLE \} from "@\/lib\/ward-data-quality"/)
  const layers = read("lib/map-layers.ts")
  assert.match(layers, /BBMP_198_LAYER_IDS = new Set\(\["potholes", "ward_spend"\]\)/)
  const ask = read("app/api/ask-kaun/route.ts")
  assert.doesNotMatch(ask, /\/56`/)
  for (const fetcher of ["fetchWardSpendByBbmp198", "fetchWardPotholesByBbmp198", "fetchWardCommitteeMeetingsByBbmp198"]) {
    const call = hook.indexOf(`${fetcher}(`)
    assert.ok(call > 0, fetcher)
    const guard = hook.lastIndexOf("BBMP_198_RECORDS_ATTRIBUTABLE", call)
    assert.ok(guard > 0 && call - guard < 700, `${fetcher} must sit behind BBMP_198_RECORDS_ATTRIBUTABLE`)
    // Fed 198 numbers from the crosswalk, never a historical 243 ref's number.
    assert.doesNotMatch(hook, new RegExp(`${fetcher}\\(ref\\.ward_no`))
  }
  assert.match(hook, /fetchWardSpendByBbmp198\(weights\.keys\(\)\)/)
  assert.match(hook, /fetchWardPotholesByBbmp198\(weights\.keys\(\)\)/)
  assert.match(hook, /fetchWardCommitteeMeetingsByBbmp198\(committees\.map\(committee => committee\.ward_no\)\)/)
  // The old single-ward fetchers that took a 243 number are gone.
  assert.doesNotMatch(api, /export async function (fetchWardSpend|fetchWardPotholes|fetchWardCommitteeMeetings)\(/)

  // Server surfaces: no ward-number or ward-name joins onto the 198 tables.
  const wards = read("app/api/data/wards/route.ts")
  const spending = read("app/api/data/spending/route.ts")
  const exporter = read("app/api/export/route.ts")
  const mapRoute = read("app/api/map-layers/route.ts")
  for (const [name, source] of [["wards", wards], ["spending", spending], ["export", exporter], ["ask-kaun", ask]]) {
    assert.doesNotMatch(source, /from\("(ward_spend_category|ward_potholes|ward_committee_meetings)"\)(?:\s*\.\w+\((?:[^()]|\([^()]*\))*\))*?\s*\.eq\("ward_no"/, name)
  }
  // The CSV export joined 198 rows to 243 wards by number, then by name.
  assert.doesNotMatch(exporter, /spendByName|new Map\(\(spending \?\? \[\]\)\.map/)
  assert.match(exporter, /spendBy243\(/)
  assert.match(exporter, /estimateDatameet243FromBbmp198\(BBMP198_INDEX, wardNo, potholeRows/)
  assert.match(mapRoute, /currentizeBbmp198Values\(values\)[\s\S]*currentizeBbmp198Values\(values\)/)
  assert.match(spend, /198-ward/)
})

test("bus stops appear once, from the deduplicated source, with honest trip wording", () => {
  assert.doesNotMatch(citizen, /infraStats\.(bus_stop_count|daily_trips)/)
  assert.doesNotMatch(citizen, /total_bus_stops/)
  assert.doesNotMatch(citizen, /trips through this ward/)
  assert.doesNotMatch(citizen, /CITY_AVG_STOPS\s*=\s*155/)
  assert.match(citizen, /wardBusStats\.stop_count/)
  assert.doesNotMatch(card, /bus_stop_count: ward\.infraStats/)
})

test("public API, CSV export and Ask Kaun take bus figures from ward_bus_stops only", () => {
  // Until migration 20260917 runs, ward_infra_stats' bus columns count
  // duplicate bmtc_stops rows; the BNP partner pipeline reads the API and
  // export, so they must not use them. The migration makes ward_bus_stops a
  // view over the fixed ward_infra_stats, so one read path stays right before
  // and after it, and a BMTC reload cannot leave these surfaces stale.
  const migration = readFileSync(new URL("../supabase/migrations/20260917_bmtc_stops_dedup.sql", import.meta.url), "utf8")
  assert.match(migration, /CREATE OR REPLACE VIEW public\.ward_bus_stops\b[\s\S]*?FROM public\.ward_infra_stats\b/)
  const routes = {
    wards: read("app/api/data/wards/route.ts"),
    export: read("app/api/export/route.ts"),
    ask: read("app/api/ask-kaun/route.ts"),
  }
  for (const [name, source] of Object.entries(routes)) {
    for (const call of source.matchAll(/from\("ward_infra_stats"\)\.select\("([^"]*)"\)/g)) {
      assert.doesNotMatch(call[1], /bus_stop_count|daily_trips/, `${name} reads bus figures from ward_infra_stats`)
    }
    assert.match(source, /from\("ward_bus_stops"\)/, name)
    assert.doesNotMatch(source, /INFRA_BUS_COUNTS_RELIABLE|\binfra\.(bus_stop_count|daily_trips)/, name)
  }
  assert.doesNotMatch(read("lib/ward-data-quality.ts"), /INFRA_BUS_COUNTS_RELIABLE/)
  assert.match(routes.export, /bus stopping at two of them counts twice/)
})

test("ward committee copy has no impossible ratio or loaded RTI question", () => {
  assert.doesNotMatch(who, /out of a possible|~48|Meets regularly/)
  // The RTI route appends "out of a possible 56" when a count is passed.
  assert.doesNotMatch(who, /issue_type: "committee_meetings", committee_meetings:/)
  assert.doesNotMatch(reach, /Why hasn't your ward committee met/)
})

test("tenders are labelled for their real scope and capped", () => {
  assert.doesNotMatch(spend, /more tender/)
  assert.match(spend, /not specific to this ward/)
  assert.match(spend, /CORPORATION_TENDERS_SHOWN = 3/)
})

test("ward spend distinguishes loading from empty", () => {
  assert.match(spend, /!wardSpendSettled \? \(\s*<div aria-busy="true"/)
})

test("helplines dial and no one is sent to the central RTI portal", () => {
  assert.doesNotMatch(reach, /rtionline\.gov\.in"/)
  assert.doesNotMatch(reach, /File online \(Central Govt\)/)
  assert.match(reach, /href=\{telHref\(number\)\}/)
  // The whole row is no longer one link to the complaint site.
  assert.doesNotMatch(reach, /href=\{dept\.complaint_url \|\| dept\.website/)
})

test("copy says what the rows are", () => {
  assert.doesNotMatch(who, /label="Current term" source="GBA"/)
  assert.doesNotMatch(who, /label="Dec 2025" source="BBMP"/)
  assert.doesNotMatch(citizen, /be the first/)
})

test("no browser call to reddit.com, and a refused clipboard is caught", () => {
  assert.doesNotMatch(api, /reddit\.com/)
  assert.doesNotMatch(hook, /fetchBuzz/)
  const share = card.slice(card.indexOf("const handleShare"), card.indexOf("const selectTab"))
  assert.match(share, /try \{\s*if \(!navigator\.clipboard\)[\s\S]*writeText[\s\S]*\} catch \{[\s\S]*setShareState\("failed"\)/)
  assert.match(card, /Couldn't copy link/)
})

test("contractor lists are not silently truncated to a top 10", () => {
  const fn = api.slice(api.indexOf("export async function fetchWardContractors"), api.indexOf("export async function fetchWardPotholes"))
  assert.doesNotMatch(fn, /'limit': '10'/)
})
