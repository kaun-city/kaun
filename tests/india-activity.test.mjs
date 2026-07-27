/**
 * Unit tests for the parliamentary-activity row selection.
 *
 * These pin one rule: a session that Parliament is still sitting in is not a
 * record of anything yet, and must never be presented as a member's figures.
 *
 * The inputs are the real in_mp_activity rows for Dadra & Nagar Haveli
 * (pc_code 26-2, mp_id 268), the seat that exposed the bug. That member has no
 * PRS term-cumulative row, so the constituency page fell through to
 * activity[0] — the newest session, ordered session_no.desc — and printed its
 * 0 signed days of 20 held as "0.0%" under the heading "This term". Their
 * completed sessions run 78.57% to 100%.
 *
 * Run: node --test --experimental-strip-types tests/india-activity.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  isSessionComplete, selectActivity, sessionEndDate,
} from "../apps/web/lib/india/activity.ts"

const SRC = "sansad.in attendance (18th Lok Sabha)"

/** One session row, with the columns selection actually reads. */
function session(session_no, session_label, sittings_held, signed_days, attendance_pct) {
  return {
    id: session_no, period_kind: "session", session_no, session_label,
    sittings_held, signed_days, attendance_pct,
    questions_asked: null, debates: null, private_member_bills: null, committees: null,
    metrics_excluded: false, metrics_excluded_reason: null, data_source: SRC,
  }
}

/**
 * mp_id 268, exactly as prod holds it on 2026-07-26: sessions 1-7 complete,
 * session 8 sitting from 20/07/2026 with the register unsigned.
 */
const DNH = [
  session(1, "24/06/2024 to 02/07/2024", 7, 7, 100.0),
  session(2, "22/07/2024 to 09/08/2024", 15, 14, 93.33),
  session(3, "25/11/2024 to 20/12/2024", 20, 18, 90.0),
  session(4, "31/01/2025 to 13/02/2025; 10/03/2025 to 04/04/2025", 27, 26, 96.3),
  session(5, "21/07/2025 to 21/08/2025", 21, 20, 95.24),
  session(6, "01/12/2025 to 19/12/2025", 15, 12, 80.0),
  session(7, "28/01/2026 to 02/04/2026; 16/04/2026 to 18/04/2026", 28, 22, 78.57),
  session(8, "20/07/2026 to 13/08/2026", 20, 0, 0.0),
]

/** fetchActivity's order: "period_kind.asc,session_no.desc". */
const asFetched = rows => [...rows].sort((a, b) =>
  a.period_kind === b.period_kind
    ? (b.session_no ?? 0) - (a.session_no ?? 0)
    : a.period_kind.localeCompare(b.period_kind))

const TERM_ROW = {
  id: 900, period_kind: "term", session_no: 0, session_label: "First Term",
  sittings_held: null, signed_days: null, attendance_pct: 93.33,
  questions_asked: 19, debates: 13, private_member_bills: 0, committees: null,
  metrics_excluded: false, metrics_excluded_reason: null,
  data_source: "PRS India MP Track (18th Lok Sabha, to 18-04-2026)",
}

// ---------------------------------------------------------------------------
// session dates
// ---------------------------------------------------------------------------

test("sessionEndDate takes the last date of a split session, not the first", () => {
  assert.equal(sessionEndDate("20/07/2026 to 13/08/2026"), "2026-08-13")
  assert.equal(
    sessionEndDate("31/01/2025 to 13/02/2025; 10/03/2025 to 04/04/2025"),
    "2025-04-04")
})

test("sessionEndDate returns null for a label with no dates in it", () => {
  // PRS's term rows are labelled "First Term", "Second Term", ...
  assert.equal(sessionEndDate("First Term"), null)
  assert.equal(sessionEndDate(null), null)
  assert.equal(sessionEndDate(""), null)
})

test("an undatable session is never treated as complete", () => {
  // Cannot certify it ended => cannot publish its figures as final.
  assert.equal(isSessionComplete(session(9, null, 10, 0, 0.0), "2026-07-26"), false)
  assert.equal(isSessionComplete(session(9, "sitting", 10, 0, 0.0), "2026-07-26"), false)
})

test("a session is complete only after its last sitting day has passed", () => {
  const s8 = DNH[7]
  assert.equal(isSessionComplete(s8, "2026-07-26"), false)  // mid-session
  assert.equal(isSessionComplete(s8, "2026-08-13"), false)  // last day, still sitting
  assert.equal(isSessionComplete(s8, "2026-08-14"), true)   // over
})

// ---------------------------------------------------------------------------
// the regression: 0.0% for a named sitting member
// ---------------------------------------------------------------------------

test("no term row: the sitting session is never the presented row", () => {
  const view = selectActivity(asFetched(DNH), "2026-07-26")
  assert.equal(view.kind, "session")
  assert.equal(view.row.session_no, 7)
  assert.equal(view.row.attendance_pct, 78.57)
  // and the withheld session is named, so the card can say why it is absent
  assert.equal(view.sitting.session_no, 8)
})

test("no term row: 0.0% is never what the page would render", () => {
  const view = selectActivity(asFetched(DNH), "2026-07-26")
  assert.notEqual(view.row.attendance_pct, 0)
  assert.equal(view.row.signed_days > 0, true)
})

test("once the sitting session ends, its real figures are presented", () => {
  const closed = asFetched([...DNH.slice(0, 7), session(8, "20/07/2026 to 13/08/2026", 20, 17, 85.0)])
  const view = selectActivity(closed, "2026-08-20")
  assert.equal(view.kind, "session")
  assert.equal(view.row.session_no, 8)
  assert.equal(view.row.attendance_pct, 85.0)
  assert.equal(view.sitting, null)
})

test("a genuine zero in a session that ENDED is still published", () => {
  // 60 such rows exist across sessions 1-7. Suppressing them would be the
  // mirror-image falsehood: an absence reported as no data.
  const absent = asFetched([session(6, "01/12/2025 to 19/12/2025", 15, 0, 0.0)])
  const view = selectActivity(absent, "2026-07-26")
  assert.equal(view.kind, "session")
  assert.equal(view.row.attendance_pct, 0)
})

// ---------------------------------------------------------------------------
// the other branches
// ---------------------------------------------------------------------------

test("a term row wins over every session row", () => {
  const view = selectActivity(asFetched([TERM_ROW, ...DNH]), "2026-07-26")
  assert.equal(view.kind, "term")
  assert.equal(view.row.attendance_pct, 93.33)
})

test("a term row is used even when it is a minister's excluded row", () => {
  // The minister rule is the card's to apply: NULL metrics plus a reason, not
  // a fallback to some session's numbers.
  const minister = { ...TERM_ROW, attendance_pct: null, questions_asked: null, debates: null,
    private_member_bills: null, metrics_excluded: true,
    metrics_excluded_reason: "This MP is a minister." }
  const view = selectActivity(asFetched([minister, ...DNH]), "2026-07-26")
  assert.equal(view.kind, "term")
  assert.equal(view.row.metrics_excluded, true)
  assert.equal(view.row.attendance_pct, null)
})

test("only a sitting session on record: nothing is presented", () => {
  const view = selectActivity([DNH[7]], "2026-07-26")
  assert.equal(view.kind, "sitting-only")
  assert.equal(view.sitting.session_no, 8)
})

test("no rows at all is its own case", () => {
  assert.equal(selectActivity([], "2026-07-26").kind, "none")
})
