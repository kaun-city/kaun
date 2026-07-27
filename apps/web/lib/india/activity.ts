/**
 * Which parliamentary-activity row a page may present as the member's record.
 *
 * TERM ROWS ONLY FOR A TERM CLAIM — NEVER activity[0].
 * in_mp_activity holds two kinds of row: one term-cumulative row from PRS MP
 * Track (period_kind='term', session_no=0) and one row per session from
 * sansad.in. fetchActivity() orders them "period_kind.asc,session_no.desc", so
 * activity[0] is the term row when there is one and THE NEWEST SESSION when
 * there is not — and the newest session is usually the one Parliament is
 * sitting in right now, with 20 sittings held, 0 signed so far and
 * attendance_pct 0.00.
 *
 * Reading that half-finished row as a term figure is how a named member of the
 * Lok Sabha ended up printed at "0.0%" attendance. Dadra & Nagar Haveli
 * (pc_code 26-2) has no term row from PRS; its member's completed sessions run
 * 78.57% to 100%. The zero was Parliament's register not yet being signed, not
 * an absence, and lib/india/og.ts already refuses it on share cards.
 *
 * So this module answers one question — what, if anything, is this member's
 * presentable record? — with four answers:
 *
 *   term         the PRS term-cumulative row. Say "this term".
 *   session      no term row, so the latest session that has ENDED, to be
 *                labelled with its own dates. Never a session still sitting.
 *   sitting-only no term row and no completed session: nothing to state yet.
 *   none         no rows at all.
 *
 * A zero in a session that has ended is a real recorded fact and is kept — 60
 * such rows exist across sessions 1-7, and suppressing them would be the
 * mirror-image lie. Only the unfinished session is withheld.
 *
 * `metrics_excluded` is the separate minister rule and is left to the caller:
 * ministers do not sign the register at all, the schema stores NULL plus a
 * reason, and the card prints "N/A (Minister)".
 *
 * Pure functions only — imported by server components and by the node:test
 * suite via --experimental-strip-types. No React, no Supabase.
 */
import type { MpActivity } from "./types.ts"

export type ActivityView =
  /** PRS's term-cumulative row. The only row that may be called "this term". */
  | { kind: "term"; row: MpActivity }
  /**
   * No term row. `row` is the newest session that has ended and must be
   * labelled with its own dates; `sitting` is the unfinished session withheld
   * from display, when there is one, so the card can say why it is absent.
   */
  | { kind: "session"; row: MpActivity; sitting: MpActivity | null }
  /** No term row and every session still open — nothing may be stated yet. */
  | { kind: "sitting-only"; sitting: MpActivity }
  | { kind: "none" }

/** dd/mm/yyyy -> "yyyy-mm-dd", or null. Rejects impossible dates. */
function toIso(d: string, m: string, y: string): string | null {
  const day = Number(d), month = Number(m), year = Number(y)
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1950)) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * The last calendar date named in a session label, as an ISO date.
 *
 * sansad.in writes a session's period as dd/mm/yyyy ranges joined by "; " —
 * "31/01/2025 to 13/02/2025; 10/03/2025 to 04/04/2025" for a session that
 * broke for the recess. The last date in the string is the session's end.
 * Returns null when the label is missing or is not in that shape (the PRS term
 * rows say "First Term"), which callers must treat as "cannot tell", never as
 * "over".
 */
export function sessionEndDate(label: string | null | undefined): string | null {
  if (!label) return null
  const dates = [...label.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)]
    .map(m => toIso(m[1], m[2], m[3]))
    .filter((d): d is string => d !== null)
  if (dates.length === 0) return null
  return dates.reduce((max, d) => (d > max ? d : max))
}

/**
 * Has this session finished sitting as of `todayIso` ("yyyy-mm-dd")?
 *
 * Deliberately conservative: an unparseable or absent label answers false. A
 * session Kaun cannot date is one Kaun cannot certify as complete, and the
 * cost of being wrong here is publishing a part-figure as a finished one.
 */
export function isSessionComplete(row: MpActivity, todayIso: string): boolean {
  const end = sessionEndDate(row.session_label)
  return end !== null && end < todayIso
}

/**
 * Pick the row a surface may present, given every row for one member.
 * `todayIso` is passed in rather than read from the clock so this stays pure
 * and testable.
 */
export function selectActivity(activity: MpActivity[], todayIso: string): ActivityView {
  const term = activity.find(a => a.period_kind === "term")
  if (term) return { kind: "term", row: term }

  const sessions = activity
    .filter(a => a.period_kind === "session")
    .sort((a, b) => (b.session_no ?? 0) - (a.session_no ?? 0))
  if (sessions.length === 0) return { kind: "none" }

  const open = sessions.filter(s => !isSessionComplete(s, todayIso))
  const done = sessions.filter(s => isSessionComplete(s, todayIso))
  if (done.length === 0) return { kind: "sitting-only", sitting: open[0] }
  return { kind: "session", row: done[0], sitting: open[0] ?? null }
}
