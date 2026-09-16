/**
 * One member, one education value, and never someone else's affidavit.
 *
 * Pins the September 2026 findings on the India surface and wiki:
 *   - the MP card printed sansad.in's qualification label next to the
 *     affidavit's education, and they disagree: sansad.in says "Doctorate" for
 *     Mallu Ravi (Nagarkurnool, affidavit: MBBS, DLO — "Graduate Professional")
 *     and for members who declare Class 10 or 12. Only the affidavit is shown;
 *   - affidavits were linked to whoever sat in the seat when the loader ran,
 *     so Priyanka Gandhi Vadra's card (Wayanad) carried Rahul Gandhi's
 *     declaration, and Ravindra Chavan's (Nanded) his late father's.
 *
 * Run: node --test --experimental-strip-types tests/india-affidavit-owner.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  affidavitOwner, loadAffidavitOwners, planAffidavitRelinks,
} from "../scripts/india/lib/affidavit-member.mjs"
import { affidavitOfSittingMember } from "../apps/web/lib/india/affidavit.ts"
import { renderSeat, seatAffidavit } from "../scripts/generate-wiki/india-index.mjs"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

// in_mps rows as read from production on 2026-09-16 (trimmed).
const ROSTER = [
  { id: 129, mpsno: 4074, pc_code: "9-36", name: "Rahul Gandhi", status: "Sitting" },
  { id: 1308, mpsno: 5836, pc_code: "32-4", name: "Priyanka Gandhi Vadra", status: "Sitting" },
  { id: 29, mpsno: 5739, pc_code: "27-16", name: "Chavan Vasantrao Balwantrao", status: "Died" },
  { id: 1315, mpsno: 5835, pc_code: "27-16", name: "Chavan Ravindra Vasantrao", status: "Sitting" },
  { id: 154, mpsno: 4490, pc_code: "19-18", name: "Nurul Islam", status: "Died" },
  { id: 55, mpsno: 5003, pc_code: "5-4", name: "Ajay Bhatt", status: "Sitting" },
  { id: 366, mpsno: 3534, pc_code: "36-12", name: "Mallu Ravi", status: "Sitting" },
]
const OWNERS = loadAffidavitOwners()

test("the reviewed exceptions file names Wayanad's filer, with a source", () => {
  const wayanad = OWNERS.get("32-4")
  assert.equal(wayanad.owner_mpsno, 4074)
  assert.match(wayanad.source_url, /^https:\/\//)
  assert.equal(OWNERS.size, 1, "exceptions are for what the roster cannot answer; Nanded needs none")
})

test("the filer is found from the roster, not from whoever sits there now", () => {
  assert.equal(affidavitOwner("32-4", ROSTER, OWNERS).member.name, "Rahul Gandhi")
  assert.equal(affidavitOwner("27-16", ROSTER, OWNERS).member.name, "Chavan Vasantrao Balwantrao")
  assert.equal(affidavitOwner("27-16", ROSTER, OWNERS).method, "member_before_by_election")
  assert.equal(affidavitOwner("19-18", ROSTER, OWNERS).member.name, "Nurul Islam")
  assert.equal(affidavitOwner("36-12", ROSTER, OWNERS).member.name, "Mallu Ravi")
  // Without the reviewed exception Wayanad has one roster row, the by-election winner:
  // exactly the case the exceptions file exists for.
  assert.equal(affidavitOwner("32-4", ROSTER).member.name, "Priyanka Gandhi Vadra")
})

test("seats the roster cannot answer are left unlinked with a reason", () => {
  const none = affidavitOwner("1-1", ROSTER, OWNERS)
  assert.equal(none.member, null)
  assert.match(none.reason, /no roster row/)
  const three = [...ROSTER, { id: 9999, mpsno: 9999, pc_code: "27-16", name: "Third", status: "Resigned" }]
  assert.equal(affidavitOwner("27-16", three, OWNERS).member, null)
  assert.match(affidavitOwner("27-16", three, OWNERS).reason, /3 roster rows/)
  const bad = new Map([["5-4", { owner_mpsno: 1, rationale: "x" }]])
  assert.match(affidavitOwner("5-4", ROSTER, bad).reason, /not in the roster/)
})

test("the backfill plan relinks Wayanad and Nanded and fills unlinked rows", () => {
  const affidavits = [
    { id: 212, pc_code: "32-4", mp_id: 1308, candidate_name: "Rahul Gandhi", is_winner: true },
    { id: 273, pc_code: "27-16", mp_id: 1315, candidate_name: "Vasantrao Balwantrao Chavan", is_winner: true },
    { id: 5, pc_code: "5-4", mp_id: null, candidate_name: "Ajay Bhatt", is_winner: true },
    { id: 6, pc_code: "19-18", mp_id: null, candidate_name: "Sk Nurul Islam", is_winner: true },
    { id: 7, pc_code: "36-12", mp_id: 366, candidate_name: "Dr.Mallu Ravi", is_winner: true },
  ]
  const { changes, unresolved } = planAffidavitRelinks(affidavits, ROSTER, OWNERS)
  assert.deepEqual(unresolved, [])
  assert.deepEqual(changes.map(c => [c.pc_code, c.from_mp_id, c.to_mp_id, c.shown_on_member_card]), [
    ["32-4", 1308, 129, false],
    ["27-16", 1315, 29, false],
    ["5-4", null, 55, true],
    ["19-18", null, 154, false],
  ])
})

test("surfaces show an affidavit only on the card of the member who filed it", () => {
  const rahul = { id: 212, mp_id: 129 }
  assert.equal(affidavitOfSittingMember(rahul, { id: 1308 }), null)
  assert.equal(affidavitOfSittingMember(rahul, { id: 129 }), rahul)
  assert.equal(affidavitOfSittingMember({ id: 1, mp_id: null }, { id: 129 }), null)
  assert.equal(affidavitOfSittingMember(rahul, null), null)
  assert.equal(affidavitOfSittingMember(null, { id: 129 }), null)
})

test("every web read path goes through the member check", () => {
  const api = read("apps/web/lib/india/api.ts")
  assert.match(api, /const AFF_COLS = "id,mp_id,/)
  assert.match(api, /const affidavit = affidavitOfSittingMember\(seatAffidavit, mp\)/)
  assert.match(api, /select: "pc_code,mp_id,criminal_cases"/)
  assert.match(api, /affidavitOfSittingMember\(r, sittingAt\.get\(r\.pc_code\)/)
  const og = read("apps/web/app/india/c/[pc_code]/opengraph-image.tsx")
  assert.match(og, /const affidavit = affidavitOfSittingMember\(seatAffidavit, mp\)/)
})

test("the MP card and wiki carry one education value, from the affidavit", () => {
  const card = read("apps/web/components/india/MpCard.tsx")
  assert.doesNotMatch(card, /mp\.qualification/)
  assert.match(card, /affidavit\.education_category/)
  assert.doesNotMatch(read("apps/web/lib/india/api.ts"), /qualification/)
  assert.doesNotMatch(read("apps/web/lib/india/types.ts"), /qualification: string/)
  const wiki = read("scripts/generate-wiki/india-index.mjs")
  assert.doesNotMatch(wiki, /\| Qualification \|/)
  assert.doesNotMatch(wiki, /MP_COLS = "[^"]*qualification/)
})

test("the loader links each affidavit to its filer, not the sitting member", () => {
  const loader = read("scripts/india/myneta-affidavits.mjs")
  assert.doesNotMatch(loader, /sittingByPc/)
  assert.match(loader, /affidavitOwner\(res\.pc_code, lsRows, owners\)/)
  assert.match(loader, /mp_id: owner\?\.id \?\? null/)
})

// ---------------------------------------------------------------------------
// wiki seat pages
// ---------------------------------------------------------------------------

const SEAT = {
  pc_code: "32-4", st_code: 32, pc_no: 4, state_name: "Kerala", pc_name: "Wayanad", pc_name_hi: null,
  reserved_for: null, reserved_source: null, wikidata_qid: null, geom_source: "datameet",
}
const PRIYANKA = {
  id: 1308, mpsno: 5836, house: "LS", term_label: "LS18", pc_code: "32-4", name: "Priyanka Gandhi Vadra",
  party_abbr: "INC", party_full: "Indian National Congress", status: "Sitting", is_minister: false,
}
// in_mp_affidavits id 212 as stored in production on 2026-09-16, with mp_id as the relink sets it (prod: 1308).
const RAHUL_AFFIDAVIT = {
  id: 212, pc_code: "32-4", mp_id: 129, election: "LokSabha2024", candidate_name: "Rahul Gandhi",
  criminal_cases: 18, total_assets_inr: 203961862, liabilities_inr: 4979184,
  education_category: "Post Graduate", education_detail: "M.Phil. (Development Studies) from Trinity College, University of Cambridge in 1995",
}
const page = overrides => renderSeat({
  c: SEAT, cw: null, mp: PRIYANKA, former: [], affidavit: null, activity: [], mplads: [], projects: [],
  reportMonth: null, crosswalk: { version: "t", byPc: new Map(), missing: false }, staleByCode: new Map(),
  ...overrides,
})

test("a by-election winner's wiki page does not reproduce the previous member's affidavit", () => {
  const picked = seatAffidavit(RAHUL_AFFIDAVIT, PRIYANKA)
  assert.deepEqual(picked, { affidavit: null, filedByPredecessor: true })
  const md = page({ affidavit: picked.affidavit, affidavitFiledByPredecessor: picked.filedByPredecessor })
  assert.match(md, /won the seat at a by-election/)
  assert.doesNotMatch(md, /Rahul Gandhi|M\.Phil|⚠ 18/)
})

test("a member's own affidavit is published; an unlinked one waits; a vacant seat keeps the named candidate's", () => {
  const own = { ...RAHUL_AFFIDAVIT, mp_id: 1308 }
  assert.equal(seatAffidavit(own, PRIYANKA).affidavit, own)
  assert.deepEqual(seatAffidavit({ ...RAHUL_AFFIDAVIT, mp_id: null }, PRIYANKA), { affidavit: null, filedByPredecessor: false })
  assert.equal(seatAffidavit(RAHUL_AFFIDAVIT, null).affidavit, RAHUL_AFFIDAVIT)
  assert.doesNotMatch(page({ affidavit: own }), /\| Qualification \|/)
})
