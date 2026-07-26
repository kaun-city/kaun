/**
 * Unit tests for the India share cards' editorial rules.
 *
 * A share card is read by more people than the page it points at, and it is
 * read out of context — no sources footer, no surrounding copy, no way to click
 * through and check. So the rules about what a card may assert are worth more
 * protection than the page's, not less. This file pins them:
 *
 *   - criminal_cases === null must never render as 0 or as "none";
 *   - a minister's excluded attendance must never become a number;
 *   - a seat with no matched affidavit must say so in words, not go quiet;
 *   - a vacant seat must not surface anybody;
 *   - a data failure must still produce a card, and must admit what it is.
 *
 * The inputs are the committed fixtures — real rows from the P0 recon captures
 * — so these assertions are about real members, not invented shapes.
 *
 * Run: node --test --experimental-strip-types tests/india-og.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  affidavitFacts, attendanceFact, buildConstituencyCard, fallbackConstituencyCard,
  mpSizeFor, OG_SIZE, titleSizeFor, truncate,
} from "../apps/web/lib/india/og.ts"
import {
  FIXTURE_ACTIVITY, FIXTURE_AFFIDAVITS, FIXTURE_CONSTITUENCIES, FIXTURE_MPS,
} from "../apps/web/lib/india/fixtures.ts"

const seat = code => FIXTURE_CONSTITUENCIES.find(c => c.pc_code === code)
const member = code => FIXTURE_MPS.find(m => m.pc_code === code) ?? null

/** The card as the image route builds it, for one fixture seat. */
function cardFor(code, { withActivity = true } = {}) {
  const mp = member(code)
  const affidavit = FIXTURE_AFFIDAVITS[code] ?? null
  return buildConstituencyCard({
    constituency: seat(code),
    mp,
    affidavit,
    // The route only spends the fourth round trip when there is no affidavit.
    activity: withActivity && mp && !affidavit ? FIXTURE_ACTIVITY[code] ?? [] : [],
  })
}

// ---------------------------------------------------------------------------
// the size every crawler caches
// ---------------------------------------------------------------------------

test("the card is 1200x630", () => {
  assert.deepEqual({ ...OG_SIZE }, { width: 1200, height: 630 })
})

// ---------------------------------------------------------------------------
// NULL is not zero
// ---------------------------------------------------------------------------

test("an unparsed criminal-case count reads as 'Not recorded', never as zero or none", () => {
  const [, cases] = affidavitFacts({ ...FIXTURE_AFFIDAVITS["29-25"], criminal_cases: null })
  assert.equal(cases.label, "Criminal cases")
  assert.equal(cases.value, "Not recorded")
  assert.match(cases.note, /not a declaration of zero/i)
  assert.doesNotMatch(cases.value, /\b0\b|none/i)
})

test("an explicit zero reads as a declaration, and is a different string from an unparsed one", () => {
  const zero = affidavitFacts({ ...FIXTURE_AFFIDAVITS["29-25"], criminal_cases: 0 })[1]
  const unparsed = affidavitFacts({ ...FIXTURE_AFFIDAVITS["29-25"], criminal_cases: null })[1]
  assert.equal(zero.value, "None declared")
  assert.notEqual(zero.value, unparsed.value)
  assert.match(zero.note, /affidavit/i)
})

test("a missing assets figure reads as 'Not stated', never as ₹0", () => {
  const [assets] = affidavitFacts({ ...FIXTURE_AFFIDAVITS["29-25"], total_assets_inr: null })
  assert.equal(assets.value, "Not stated")
  assert.doesNotMatch(assets.value, /₹\s*0/)
})

test("declared assets are formatted in the page's own units", () => {
  // P C Mohan, Bangalore Central: ₹81,30,65,207 declared in the 2024 affidavit.
  const [assets, cases] = affidavitFacts(FIXTURE_AFFIDAVITS["29-25"])
  assert.equal(assets.value, "₹81.31 Cr")
  assert.equal(cases.value, "2 declared")
  assert.match(assets.note, /LokSabha2024/)
})

test("one declared case is not pluralised into many", () => {
  const one = affidavitFacts({ ...FIXTURE_AFFIDAVITS["29-25"], criminal_cases: 1 })[1]
  assert.equal(one.value, "1 declared")
})

// ---------------------------------------------------------------------------
// ministers have no attendance, and the card must not invent one
// ---------------------------------------------------------------------------

test("a minister's excluded attendance yields no attendance fact at all", () => {
  assert.equal(attendanceFact(FIXTURE_ACTIVITY["29-24"]), null)
})

test("attendance is offered when it is a real recorded figure", () => {
  const fact = attendanceFact(FIXTURE_ACTIVITY["29-23"])
  assert.equal(fact.label, "Lok Sabha attendance")
  assert.equal(fact.value, "93.3%")
  assert.match(fact.note, /PRS India/)
})

test("no activity row at all yields no fact rather than a zero", () => {
  assert.equal(attendanceFact([]), null)
})

/**
 * The regression this rule exists for. Dadra & Nagar Haveli's member has no
 * term-cumulative row in PRS's data — only per-session rows — and the newest
 * of those covers a session that is still sitting: 20 sittings held, 0 signed
 * so far. Taking activity[0] rendered "LOK SABHA ATTENDANCE 0.0%" on a card
 * under that member's name. These are their real rows.
 */
const SESSIONS_ONLY = [
  {
    id: 1, period_kind: "session", session_no: 8, session_label: "20/07/2026 to 13/08/2026",
    sittings_held: 20, signed_days: 0, attendance_pct: 0, questions_asked: null,
    debates: null, private_member_bills: null, committees: null,
    metrics_excluded: false, metrics_excluded_reason: null, data_source: "PRS India MP Track",
  },
  {
    id: 2, period_kind: "session", session_no: 7, session_label: "28/01/2026 to 02/04/2026",
    sittings_held: 28, signed_days: 22, attendance_pct: 78.57, questions_asked: null,
    debates: null, private_member_bills: null, committees: null,
    metrics_excluded: false, metrics_excluded_reason: null, data_source: "PRS India MP Track",
  },
]

test("a session still sitting is never read as a term attendance figure", () => {
  assert.equal(attendanceFact(SESSIONS_ONLY), null)
})

test("a member with only session rows gets no attendance fact on the card at all", () => {
  const card = buildConstituencyCard({
    constituency: seat("29-23"),
    mp: member("29-23"),
    affidavit: null,
    activity: SESSIONS_ONLY,
  })
  assert.deepEqual(card.facts, [])
  assert.match(card.note, /No affidavit matched/)
  assert.doesNotMatch(JSON.stringify(card), /0\.0%/)
})

// ---------------------------------------------------------------------------
// whole cards, seat by seat
// ---------------------------------------------------------------------------

test("a seat with an affidavit shows exactly two component facts and no score", () => {
  const card = cardFor("29-25")
  assert.equal(card.title, "Bangalore Central")
  assert.equal(card.hindi, "बंगलौर सेंट्रल")
  assert.equal(card.eyebrow, "Karnataka · Lok Sabha seat 25")
  assert.equal(card.mpName, "P C Mohan")
  assert.equal(card.party, "BJP")
  assert.match(card.mpMeta, /4 terms/)
  assert.deepEqual(card.facts.map(f => f.label), ["Declared assets", "Criminal cases"])
  assert.equal(card.note, null)
  // No composite: nothing on the card is a grade, rank or "out of".
  const text = JSON.stringify(card)
  assert.doesNotMatch(text, /\bscore\b|\bgrade\b|out of 100|\brank(ed|ing)?\b/i)
})

test("a seat with no matched affidavit says so, and falls back to attendance", () => {
  const card = cardFor("29-23")
  assert.equal(card.title, "Bangalore Rural")
  assert.equal(card.mpName, "C N Manjunath")
  assert.deepEqual(card.facts.map(f => f.label), ["Lok Sabha attendance"])
  assert.match(card.note, /No affidavit matched to this seat yet/)
  assert.match(card.note, /rather than a guess/)
})

test("a minister with no affidavit gets the empty state plus the reason attendance is absent", () => {
  // Bangalore North has an affidavit in the fixtures; strip it to reach the
  // branch a real minister-without-affidavit seat would take.
  const card = buildConstituencyCard({
    constituency: seat("29-24"),
    mp: member("29-24"),
    affidavit: null,
    activity: FIXTURE_ACTIVITY["29-24"],
  })
  assert.deepEqual(card.facts, [])
  assert.match(card.note, /No affidavit matched/)
  assert.match(card.note, /not recorded for ministers/i)
  assert.match(card.mpMeta, /Minister/)
})

test("a vacant seat surfaces nobody and explains the vacancy", () => {
  const card = buildConstituencyCard({
    constituency: seat("29-26"),
    mp: null,
    affidavit: FIXTURE_AFFIDAVITS["29-26"],
    activity: FIXTURE_ACTIVITY["29-26"],
  })
  assert.equal(card.mpName, null)
  assert.equal(card.party, null)
  assert.deepEqual(card.facts, [])
  assert.match(card.note, /No sitting MP on record/)
  // The predecessor's affidavit must not leak onto a vacant seat's card.
  assert.doesNotMatch(JSON.stringify(card), /TEJASVI|41030489|₹4\.10 Cr/i)
})

test("every fixture seat produces a card whose identity is never empty", () => {
  for (const c of FIXTURE_CONSTITUENCIES) {
    const card = cardFor(c.pc_code)
    assert.ok(card.title.length > 0, c.pc_code)
    assert.ok(card.eyebrow.includes(c.state_name), c.pc_code)
    assert.ok(card.titleSize >= 38 && card.titleSize <= 86, c.pc_code)
    // Either there is something to show, or there is a sentence saying why not.
    assert.ok(card.facts.length > 0 || card.note !== null, c.pc_code)
  }
})

// ---------------------------------------------------------------------------
// the failure card
// ---------------------------------------------------------------------------

test("the fallback card names the seat it could not load and admits the gap", () => {
  const card = fallbackConstituencyCard("29-25")
  assert.equal(card.eyebrow, "Seat 29-25 · Lok Sabha")
  assert.equal(card.mpName, null)
  assert.deepEqual(card.facts, [])
  assert.match(card.note, /could not reach/i)
  // It must not imply anything about the member or the seat's record.
  assert.doesNotMatch(JSON.stringify(card), /criminal|assets|attendance/i)
})

test("the fallback card survives a junk pc_code without echoing it as a seat", () => {
  const card = fallbackConstituencyCard("<script>")
  assert.equal(card.eyebrow, "Lok Sabha")
  assert.ok(card.title.length > 0)
})

// ---------------------------------------------------------------------------
// text fitting
// ---------------------------------------------------------------------------

test("titles step down in size and never exceed the truncation ceiling", () => {
  assert.ok(titleSizeFor("Bangalore Central") < titleSizeFor("Mandya"))
  assert.ok(titleSizeFor("Dadra and Nagar Haveli and Daman and Diu") <= titleSizeFor("Bangalore Central"))
  const long = truncate("Dadra and Nagar Haveli and Daman and Diu constituency", 40)
  assert.ok(long.length <= 40, long)
  assert.ok(long.endsWith("…"))
})

test("truncation leaves short strings completely alone", () => {
  assert.equal(truncate("Bangalore Central", 40), "Bangalore Central")
  assert.equal(truncate("  Mandya  ", 40), "Mandya")
})

test("truncation prefers a word boundary but never leaves a trailing space", () => {
  const t = truncate("Andaman and Nicobar Islands and more words", 24)
  assert.ok(t.length <= 24, t)
  assert.doesNotMatch(t, / …$/)
})

test("long member names get a smaller type size", () => {
  assert.ok(mpSizeFor("Dr Shashi Tharoor Kumar Menon") < mpSizeFor("P C Mohan"))
})
