/**
 * The declarations timeline when one election appears more than once.
 *
 * 21 of 543 LS2024 winners' MyNeta histories repeat an election label, with
 * different figures and nothing to tell the rows apart: a declaration for each
 * seat contested, or a by-election in the same term. The timeline keyed rows
 * by the label (React: "two children with the same key") and showed readers
 * two identical labels.
 *
 * Fixtures are MyNeta HTML for Rahul Gandhi (LS2024 candidate 2195, fetched
 * 2026-09-16): his "Other Elections" table lists Lok Sabha 2019 twice (5 and
 * 6 cases) and his Rae Bareli nomination as another Lok Sabha 2024; the
 * compare page names Amethi for 2019 but omits the second 2019 declaration.
 *
 * Run: node --test --experimental-strip-types tests/india-nominations.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  annotateRepeatedNominations, compareProfileUrl, electionKey, parseCompareProfiles,
  parseOtherElections, repeatedElections,
} from "../scripts/india/myneta-affidavits.mjs"
import * as web from "../apps/web/lib/india/nominations.ts"

const fixture = name => readFileSync(new URL(`./fixtures/myneta/${name}`, import.meta.url), "utf8")
const OTHER = fixture("rahul-gandhi-ls2024-2195-other-elections.html")
const COMPARE = fixture("rahul-gandhi-compare-profile.html")
const OWN = "https://myneta.info/LokSabha2024/candidate.php?candidate_id=2195"
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

/** A compare-page row in MyNeta's markup. */
const compareRow = ({ href, election, seat, cases, assets }) =>
  `<tr><td><a href='${href}' target=_blank>X in ${election}</a></td><td>${seat}</td><td>50</td><td>BJP</td>` +
  `<td>${cases ? "Yes" : "No"}</td><td>${cases}</td><td>Graduate</td><td>${assets}<br><span>~</span></td><td>0</td><td>Y</td></tr>`
const compareTable = rows => `<table class='w3-table w3-bordered'><tbody>${rows.map(compareRow).join("")}</tbody></table>`

// ---------------------------------------------------------------------------
// loader: parsing and labelling
// ---------------------------------------------------------------------------

test("the compare page yields one row per declaration with its seat", () => {
  const rows = parseCompareProfiles(COMPARE)
  assert.deepEqual(rows.map(r => [r.election, r.constituency, r.declared_assets_inr, r.declared_cases]), [
    ["Lok Sabha 2024", "WAYANAD", 203961862, 18],
    ["Lok Sabha 2024", "RAE BARELI", 203961862, 18],
    ["Lok Sabha 2019", "AMETHI", 158877063, 6],
    ["Loksabha 2014", "AMETHI", 94006549, 0],
    ["Lok Sabha 2004", "Amethi", 5538123, 0],
  ])
  assert.equal(rows[1].profile_url, "https://myneta.info/LokSabha2024/candidate.php?candidate_id=7651")
  assert.equal(compareProfileUrl(OTHER), "https://myneta.info/compare_profile.php?group_id=rqohbcMW3xRXyaJDtuY")
  assert.deepEqual(parseCompareProfiles("<p>nothing</p>"), [])
})

test("by-elections filed under the parent election are recognised", () => {
  const rows = parseCompareProfiles(compareTable([
    { href: "/telangana2018/candidate.php?candidate_id=1", election: "Telangana 2018", seat: "HUZURABAD", cases: 3, assets: "42,41,42,866" },
    { href: "/telangana2018/candidate.php?candidate_id=2", election: "Telangana 2018", seat: "HUZURABAD : BYE ELECTION ON 30-10-2021", cases: 24, assets: "56,03,25,991" },
    { href: "/haryana/candidate.php?candidate_id=3", election: "Loksabha Bye Election", seat: "HISAR :BYE-ELECTION ON 13-10-2011", cases: 0, assets: "0" },
  ]))
  assert.deepEqual(rows.map(r => [r.constituency, r.by_election, r.declared_assets_inr]), [
    ["HUZURABAD", false, 424142866],
    ["HUZURABAD", true, 560325991],
    ["HISAR", true, 0],
  ])
})

test("repeated elections are detected across MyNeta's spellings, including this affidavit's own", () => {
  const history = parseOtherElections(OTHER)
  assert.deepEqual([...repeatedElections("LokSabha2024", history)], ["loksabha2024", "loksabha2019"])
  assert.equal(electionKey("Loksabha 2014"), electionKey("Lok Sabha 2014"))
  assert.equal(repeatedElections("LokSabha2024", [{ election: "Lok Sabha 2019" }, { election: "Loksabha 2014" }]).size, 0)
  assert.equal(repeatedElections("LokSabha2024", null).size, 0)
})

test("Rahul Gandhi: the other 2024 seat and Amethi are named, the unlisted 2019 row is not guessed", () => {
  const history = parseOtherElections(OTHER)
  const out = annotateRepeatedNominations(history, parseCompareProfiles(COMPARE), { election: "LokSabha2024", profileUrl: OWN })
  assert.deepEqual(out.map(h => [h.election, h.declared_cases, h.constituency ?? null]), [
    ["Lok Sabha 2024", 18, "RAE BARELI"],
    ["Lok Sabha 2019", 5, null],
    ["Lok Sabha 2019", 6, "AMETHI"],
    ["Loksabha 2014", 0, null],
    ["Lok Sabha 2009", 0, null],
    ["Lok Sabha 2004", 0, null],
  ])
  // Figures and order are untouched; only labels are added.
  assert.deepEqual(out.map(({ election, declared_assets_inr, declared_cases }) => ({ election, declared_assets_inr, declared_cases })), history)
})

test("identical declarations are labelled only as far as the compare page lists them", () => {
  const history = [
    { election: "Karnataka 2023", declared_assets_inr: 482378620, declared_cases: 1 },
    { election: "Karnataka 2023", declared_assets_inr: 482378620, declared_cases: 1 },
  ]
  const one = compareTable([{ href: "/k2023/candidate.php?candidate_id=9", election: "Karnataka 2023", seat: "VARUNA", cases: 1, assets: "48,23,78,620" }])
  assert.deepEqual(annotateRepeatedNominations(history, parseCompareProfiles(one), { election: "LokSabha2024" })
    .map(h => h.constituency ?? null), ["VARUNA", null])

  const both = compareTable([
    { href: "/mp2013/candidate.php?candidate_id=1", election: "Madhya Pradesh 2013", seat: "BUDHNI", cases: 0, assets: "6,27,54,114" },
    { href: "/mp2013/candidate.php?candidate_id=2", election: "Madhya Pradesh 2013", seat: "VIDISHA", cases: 0, assets: "6,27,54,114" },
  ])
  const pair = [
    { election: "Madhya Pradesh 2013", declared_assets_inr: 62754114, declared_cases: 0 },
    { election: "Madhya Pradesh 2013", declared_assets_inr: 62754114, declared_cases: 0 },
  ]
  assert.deepEqual(annotateRepeatedNominations(pair, parseCompareProfiles(both), { election: "LokSabha2024" })
    .map(h => h.constituency), ["BUDHNI", "VIDISHA"])

  // More candidate seats than rows: the row could be either, so neither is used.
  const single = [pair[0], { election: "Madhya Pradesh 2013", declared_assets_inr: 1, declared_cases: 0 }]
  assert.deepEqual(annotateRepeatedNominations(single, parseCompareProfiles(both), { election: "LokSabha2024" })
    .map(h => h.constituency ?? null), [null, null])
})

test("the loader reads the compare page only for histories that repeat an election", () => {
  const loader = read("scripts/india/myneta-affidavits.mjs")
  assert.match(loader, /if \(repeatedElections\(ELECTION, d\.declared_assets_history\)\.size\) \{\s*const compareUrl = compareProfileUrl\(detailHtml\)/)
})

// ---------------------------------------------------------------------------
// web: timeline rows
// ---------------------------------------------------------------------------

test("the web and loader agree on what counts as the same election", () => {
  for (const label of ["LokSabha2024", "Lok Sabha 2024", "Loksabha 2014", "Maharashtra Election 2014", "Rajya Sabha Affidavits", ""]) {
    assert.equal(web.electionKey(label), electionKey(label), label)
  }
})

const RAHUL_WAYANAD = {
  election: "LokSabha2024",
  constituency_label: "WAYANAD",
  total_assets_inr: 203961862,
  criminal_cases: 18,
  declared_assets_history: annotateRepeatedNominations(parseOtherElections(OTHER), parseCompareProfiles(COMPARE), { election: "LokSabha2024", profileUrl: OWN }),
}

test("every timeline row has a unique key, and repeated elections say which seat or that it is separate", () => {
  const { rows, hasRepeats } = web.nominationRows(RAHUL_WAYANAD)
  assert.equal(hasRepeats, true)
  assert.equal(new Set(rows.map(r => r.key)).size, rows.length)
  assert.deepEqual(rows.map(r => [r.election, r.qualifier, r.current]), [
    ["Lok Sabha 2024", "Wayanad", true],
    ["Lok Sabha 2024", "Rae Bareli", false],
    ["Lok Sabha 2019", "separate nomination", false],
    ["Lok Sabha 2019", "Amethi", false],
    ["Loksabha 2014", null, false],
    ["Lok Sabha 2009", null, false],
    ["Lok Sabha 2004", null, false],
  ])
})

test("by-elections read as such; a history with no repeats is unchanged", () => {
  const eatala = web.nominationRows({
    election: "LokSabha2024", constituency_label: "MALKAJGIRI", total_assets_inr: 540178712, criminal_cases: 45,
    declared_assets_history: [
      { election: "Telangana 2018", declared_assets_inr: 424142866, declared_cases: 3, constituency: "HUZURABAD", by_election: false },
      { election: "Telangana 2018", declared_assets_inr: 560325991, declared_cases: 24, constituency: "HUZURABAD", by_election: true },
    ],
  })
  assert.deepEqual(eatala.rows.map(r => r.qualifier), [null, "Huzurabad", "Huzurabad by-election"])

  const plain = web.nominationRows({
    election: "LokSabha2024", constituency_label: "BANGALORE CENTRAL", total_assets_inr: 1, criminal_cases: 0,
    declared_assets_history: [{ election: "Lok Sabha 2019", declared_assets_inr: 2, declared_cases: 0 }],
  })
  assert.equal(plain.hasRepeats, false)
  assert.deepEqual(plain.rows.map(r => r.qualifier), [null, null])
})

test("seat names are tidied without inventing capitalisation", () => {
  assert.equal(web.seatName("RAE BARELI"), "Rae Bareli")
  assert.equal(web.seatName("BHADAUR (SC)"), "Bhadaur (SC)")
  assert.equal(web.seatName("C.V. RAMAN NAGAR"), "C.V. Raman Nagar")
  assert.equal(web.seatName("MAH 3"), "MAH 3")
  assert.equal(web.seatName("Huzurabad"), "Huzurabad")
  assert.equal(web.seatName("  "), null)
})

test("the timeline keys rows by position and explains repeats; the wiki does not render history", () => {
  const timeline = read("apps/web/components/india/AffidavitTimeline.tsx")
  assert.doesNotMatch(timeline, /key=\{r\.election\}/)
  assert.match(timeline, /key=\{r\.key\}/)
  assert.match(timeline, /hasRepeats &&/)
  // If the wiki ever renders declared_assets_history, it must reuse these labels.
  assert.doesNotMatch(read("scripts/generate-wiki/india-index.mjs"), /declared_assets_history/)
})
