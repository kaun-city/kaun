/**
 * Unit tests for the India wiki generator (scripts/generate-wiki/india-index.mjs).
 *
 * Three things carry real risk here and each one is asserted:
 *
 *   1. The generator MUST read as `anon`. in_mp_affidavits is row-restricted by
 *      RLS to reviewed rows; a service-role key would bypass that and publish an
 *      unreviewed criminal-case join — attached, possibly, to the wrong person —
 *      onto a public wiki. assertAnonKey() is what makes that unavailable.
 *   2. Nothing may turn an absent value into a zero. A minister's attendance and
 *      an unloaded pipeline both render as prose, never as "0".
 *   3. The formatters here are a hand copy of apps/web/lib/india/format.ts,
 *      because the workflow runs plain node on a .mjs file and that module is
 *      TypeScript. Copies drift, so the two are compared directly.
 *
 * No network and no database: every test feeds the pure render functions.
 *
 * Run: node --test --experimental-strip-types tests/india-wiki.test.mjs
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import {
  jwtRole, assertAnonKey, slugify, seatFilename, cell, reservedLabel,
  districtsLabel, vacancyKind, foldTracked, renderSeat, renderProjects, renderIndex,
  groupIndian, formatRupees, formatCrore, formatCroreDelta, formatPct, formatMonth, formatSlip,
} from "../scripts/generate-wiki/india-index.mjs"
import * as ts from "../apps/web/lib/india/format.ts"

// ---------------------------------------------------------------------------
// 1. the anon-key guard
// ---------------------------------------------------------------------------

/** Payload-only JWTs; the signature is never verified, only the role read. */
function fakeJwt(role) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url")
  return `${b64({ alg: "HS256" })}.${b64({ iss: "supabase", role })}.sig`
}

test("jwtRole reads the role claim", () => {
  assert.equal(jwtRole(fakeJwt("anon")), "anon")
  assert.equal(jwtRole(fakeJwt("service_role")), "service_role")
  assert.equal(jwtRole("not-a-jwt"), null)
  assert.equal(jwtRole(null), null)
  assert.equal(jwtRole("a.b"), null)
})

test("assertAnonKey accepts anon and refuses everything else", () => {
  assert.equal(assertAnonKey(fakeJwt("anon")), "anon")
  // The one that matters: a service-role key bypasses the affidavit RLS policy.
  assert.throws(() => assertAnonKey(fakeJwt("service_role")), /service_role/)
  assert.throws(() => assertAnonKey(fakeJwt("authenticated")), /authenticated/)
  assert.throws(() => assertAnonKey("sb-secret-whatever"), /unrecognised/)
  assert.throws(() => assertAnonKey(undefined), /unrecognised/)
})

// ---------------------------------------------------------------------------
// 2. formatters must not drift from the TypeScript surface
// ---------------------------------------------------------------------------

const RUPEE_CASES = [null, undefined, 0, 1, 4103, 4103000, 410300000, -250000, 99999, 100000]
const CRORE_CASES = [null, undefined, 0, 4.5, 99.99, 100, 30695.1, 100000, 250000, -12]
const PCT_CASES = [null, undefined, 0, 66, 99.94, -3.5]
const MONTH_CASES = [null, undefined, "", "2026-05-01", "2026-12-01", "2026-13-01", "nonsense"]
const SLIP_CASES = [null, undefined, 0, 1, -1, 66, -18]

test("formatters match apps/web/lib/india/format.ts exactly", () => {
  for (const v of RUPEE_CASES) assert.equal(formatRupees(v), ts.formatRupees(v), `formatRupees(${v})`)
  for (const v of CRORE_CASES) assert.equal(formatCrore(v), ts.formatCrore(v), `formatCrore(${v})`)
  for (const v of CRORE_CASES) assert.equal(formatCroreDelta(v), ts.formatCroreDelta(v), `formatCroreDelta(${v})`)
  for (const v of PCT_CASES) assert.equal(formatPct(v), ts.formatPct(v), `formatPct(${v})`)
  for (const v of MONTH_CASES) assert.equal(formatMonth(v), ts.formatMonth(v), `formatMonth(${v})`)
  for (const v of SLIP_CASES) assert.equal(formatSlip(v), ts.formatSlip(v), `formatSlip(${v})`)
  for (const v of [0, 1, 4103, 12345678]) assert.equal(groupIndian(v), ts.groupIndian(v), `groupIndian(${v})`)
})

test("a null amount never renders as zero", () => {
  assert.equal(formatRupees(null), "—")
  assert.equal(formatCrore(null), "—")
  assert.equal(formatPct(null), "—")
  assert.equal(formatSlip(null), "—")
  // and a real zero still renders as a zero, which is a different statement
  assert.equal(formatRupees(0), "₹0")
  assert.equal(formatPct(0), "0.0%")
})

// ---------------------------------------------------------------------------
// 3. page identity
// ---------------------------------------------------------------------------

test("seat filenames are unique across same-named seats in different states", () => {
  // Aurangabad exists in both Bihar (st 10) and Maharashtra (st 27).
  const a = seatFilename({ pc_code: "10-6", pc_name: "Aurangabad" })
  const b = seatFilename({ pc_code: "27-19", pc_name: "Aurangabad" })
  assert.notEqual(a, b)
  assert.equal(a, "10-6-aurangabad.md")
  assert.equal(b, "27-19-aurangabad.md")
})

test("slugify strips diacritics, punctuation and case", () => {
  assert.equal(slugify("Andaman & Nicobar"), "andaman-nicobar")
  assert.equal(slugify("Jammu & Kashmir"), "jammu-kashmir")
  assert.equal(slugify("C.V. Raman Nagar"), "c-v-raman-nagar")
  assert.equal(slugify("Dadra and Nagar Haveli and Daman and Diu"), "dadra-and-nagar-haveli-and-daman-and-diu")
})

test("cell escapes pipes so a value cannot break a table", () => {
  assert.equal(cell("Ministry of A | B"), "Ministry of A \\| B")
  assert.equal(cell(null), "—")
  assert.equal(cell(""), "—")
  assert.equal(cell(0), "0")
})

// ---------------------------------------------------------------------------
// 4. reservation, districts, vacancy
// ---------------------------------------------------------------------------

test("reservation: a NULL in the database plus GEN in the order means General, not unknown", () => {
  assert.equal(reservedLabel(null, "GEN"), "General")
  assert.equal(reservedLabel("SC", "SC"), "SC")
  assert.equal(reservedLabel("ST", "ST"), "ST")
  // the order is the authority when the roster/boundary files disagree
  assert.equal(reservedLabel(null, "ST"), "ST")
})

test("districts name every district in the seat, not only the largest", () => {
  const fromOrder = districtsLabel({ districts_order: "Bangalore" })
  assert.deepEqual(fromOrder, { text: "Bangalore", fromOrder: true })

  // J&K / Assam: no district headings were transcribed, so the share vector is
  // the only source. Naming only Anantnag for a four-district seat is the bug.
  const fromShares = districtsLabel({
    district_primary_spatial: "Anantnag",
    district_shares_vector: [
      { district: "Anantnag", share: 0.4 },
      { district: "Rajouri", share: 0.3 },
      { district: "Poonch", share: 0.2 },
      { district: "Kulgam", share: 0.1 },
    ],
  })
  assert.equal(fromShares.fromOrder, false)
  for (const d of ["Anantnag", "Rajouri", "Poonch", "Kulgam"]) assert.match(fromShares.text, new RegExp(d))
  assert.equal(districtsLabel(null), null)
})

test("a seat with a former member is vacant; one with none is unmatched", () => {
  assert.equal(vacancyKind([{ name: "X", status: "Died" }]), "vacant")
  assert.equal(vacancyKind([]), "unmatched")
  assert.equal(vacancyKind(undefined), "unmatched")
})

// ---------------------------------------------------------------------------
// 5. seat page empty states — the whole point of the generator
// ---------------------------------------------------------------------------

const SEAT = {
  pc_code: "29-25", st_code: 29, pc_no: 25, state_name: "Karnataka",
  pc_name: "Bangalore Central", pc_name_hi: "बंगलौर केन्द्रीय",
  reserved_for: null, reserved_source: null, wikidata_qid: "Q4855038", geom_source: "datameet",
}
const CROSSWALK = { version: "test-1", byPc: new Map(), missing: false }

function seat(overrides = {}) {
  return renderSeat({
    c: SEAT, cw: null, mp: null, former: [], affidavit: null, activity: [], mplads: [],
    projects: [], reportMonth: null, crosswalk: CROSSWALK, staleByCode: new Map(),
    ...overrides,
  })
}

test("every seat page links to its live counterpart, near the top", () => {
  const md = seat()
  assert.match(md, /https:\/\/kaun\.city\/india\/c\/29-25/)
  // "near the top" is load-bearing: it is how a wiki reader reaches the app.
  const lineNo = md.split("\n").findIndex(l => l.includes("kaun.city/india/c/29-25"))
  assert.ok(lineNo >= 0 && lineNo < 8, `live link should be in the first few lines, was line ${lineNo}`)
})

test("an unloaded pipeline says so, and never renders a zero", () => {
  const md = seat()
  assert.match(md, /Parliamentary activity has not been loaded/)
  assert.match(md, /MPLADS figures have not been loaded/)
  assert.match(md, /No central projects loaded for Karnataka yet/)
  assert.match(md, /Affidavit not published yet/)
  // no bare "0" presented as a metric anywhere in an empty page
  assert.doesNotMatch(md, /\|\s*0\s*\|/)
})

test("a minister's metrics are 'not recorded', never zero", () => {
  const md = seat({
    mp: {
      id: 1, name: "A Minister", party_abbr: "XYZ", term_label: "LS18", status: "Sitting",
      is_minister: true, minister_note: "Union Minister of State",
    },
    activity: [{
      mp_id: 1, period_kind: "term", metrics_excluded: true,
      metrics_excluded_reason: "Minister — does not sign the attendance register",
      attendance_pct: null, questions_asked: null,
    }],
  })
  assert.match(md, /Not recorded for ministers/)
  assert.match(md, /never as zero/)
  assert.doesNotMatch(md, /Attendance \| 0/)
})

test("a vacant seat names the predecessor without presenting them as current", () => {
  const md = seat({ former: [{ name: "Late Member", party_abbr: "ABC", status: "Died", term_label: "LS18" }] })
  assert.match(md, /This seat is vacant/)
  assert.match(md, /Late Member/)
  assert.match(md, /Previous member/)
  assert.doesNotMatch(md, /Late Member\*\* \(.*\) holds this seat/)
})

test("an unmatched seat explains the alias mechanism instead of implying no MP exists", () => {
  const md = seat({ unresolvedCount: 4 })
  assert.match(md, /No MP is linked to this seat/)
  assert.match(md, /reviewed alias/)
  assert.match(md, /never by similarity/)
})

test("a published affidavit carries the accusation-not-conviction caveat", () => {
  const md = seat({
    affidavit: {
      election: "LokSabha2024", candidate_name: "Someone", criminal_cases: 3,
      total_assets_inr: 15600000, liabilities_inr: 1443000,
    },
  })
  assert.match(md, /⚠ 3/)
  assert.match(md, /accusation, not a conviction/)
  assert.match(md, /₹1\.56 Cr/)
})

test("central projects are labelled state-level on every seat page that shows them", () => {
  const md = seat({
    projects: [{
      project_code: "P1", project_name: "A Project", ministry: "Railways",
      revised_cost_cr: 1200, cost_overrun_cr: 200, original_cost_cr: 1000,
      schedule_slip_months: 24, physical_progress_pct: 40,
    }],
    reportMonth: "2026-05-01",
  })
  assert.match(md, /by state only/)
  assert.match(md, /not this\s+constituency's/)
})

// ---------------------------------------------------------------------------
// 6. projects page
// ---------------------------------------------------------------------------

test("an empty projects table renders a deliberate pending state, not a broken page", () => {
  const md = renderProjects({
    tracked: [], reportMonth: null, totalOngoing: 0, staleRows: [], staleMissing: true,
    changesMissing: false, stateNameByCode: new Map(),
  })
  assert.match(md, /First monthly load pending/)
  assert.match(md, /Kaun holds no MoSPI Flash Report data yet/)
  // it must not print an empty ranking table
  assert.doesNotMatch(md, /\| # \| Project \|/)
  assert.match(md, /kaun\.city\/india\/projects/)
})

test("without the staleness view the page falls back and says which question it is answering", () => {
  const md = renderProjects({
    tracked: [{
      project_code: "P1", project_name: "Late Project", ministry: "Railways", st_code: 29,
      revised_cost_cr: 1200, cost_overrun_cr: 200, original_cost_cr: 1000,
      schedule_slip_months: 66, physical_progress_pct: 40, cost_revised: true, schedule_changed: false,
      revised_doc_month: "2029-03-01",
    }],
    reportMonth: "2026-05-01", totalOngoing: 1, staleRows: [], staleMissing: true,
    changesMissing: false, stateNameByCode: new Map([[29, "Karnataka"]]),
  })
  assert.match(md, /v_in_central_project_staleness` view is not present/)
  assert.match(md, /not the same question/)
  assert.match(md, /66 months later/)
  assert.match(md, /Karnataka/)
})

test("multi-state projects are labelled, never filed under a guessed state", () => {
  const md = renderProjects({
    tracked: [{
      project_code: "P2", project_name: "Corridor", ministry: "Roads", st_code: null, is_multi_state: true,
      revised_cost_cr: 5000, cost_overrun_cr: 500, original_cost_cr: 4500,
      schedule_slip_months: null, physical_progress_pct: null,
    }],
    reportMonth: "2026-05-01", totalOngoing: 1, staleRows: [], staleMissing: false,
    changesMissing: false, stateNameByCode: new Map(),
  })
  assert.match(md, /multi-state/)
})

test("foldTracked derives the original cost and drops changes with no identity row", () => {
  const rows = foldTracked(
    [{ project_code: "P1", project_name: "X" }],
    [
      { project_code: "P1", revised_cost_cr: 1200, cost_overrun_cr: 200 },
      { project_code: "GHOST", revised_cost_cr: 5, cost_overrun_cr: 1 },
    ],
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].original_cost_cr, 1000)
  // a missing overrun must not silently become an original cost of the revised
  const noOverrun = foldTracked(
    [{ project_code: "P1", project_name: "X" }],
    [{ project_code: "P1", revised_cost_cr: 1200, cost_overrun_cr: null }],
  )
  assert.equal(noOverrun[0].original_cost_cr, null)
})

// ---------------------------------------------------------------------------
// 7. index page
// ---------------------------------------------------------------------------

test("the index states what is loaded rather than leaving blanks to be guessed at", () => {
  const md = renderIndex({
    constituencies: [SEAT],
    mpByPc: new Map(),
    formerByPc: new Map(),
    affidavitByPc: new Map(),
    crosswalk: CROSSWALK,
    unresolvedMps: [],
    coverage: [
      { label: "Sitting MPs", table: "in_mps", count: 0, status: "**not loaded yet**" },
      { label: "Central projects", table: "in_central_projects", count: 0, status: "**first monthly load pending**" },
    ],
  })
  assert.match(md, /What is loaded right now/)
  assert.match(md, /not loaded yet/)
  assert.match(md, /https:\/\/kaun\.city\/india/)
  // every seat row links to both the wiki page and the live page
  assert.match(md, /\[Bangalore Central\]\(29-25-bangalore-central\.md\)/)
  assert.match(md, /https:\/\/kaun\.city\/india\/c\/29-25/)
})

test("the index distinguishes a vacant seat from an unmatched one", () => {
  const md = renderIndex({
    constituencies: [SEAT, { ...SEAT, pc_code: "29-26", pc_no: 26, pc_name: "Bangalore South" }],
    mpByPc: new Map(),
    formerByPc: new Map([["29-25", [{ name: "Late Member", status: "Died" }]]]),
    affidavitByPc: new Map(),
    crosswalk: CROSSWALK,
    unresolvedMps: [{ name: "Unmatched MP", constituency_label: "Somewhere" }],
    coverage: [{ label: "Sitting MPs", table: "in_mps", count: 1, status: "1 seat" }],
  })
  assert.match(md, /vacant — bypoll pending/)
  assert.match(md, /not matched/)
  assert.match(md, /Unmatched MP/)
})
