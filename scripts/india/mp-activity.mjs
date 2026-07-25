#!/usr/bin/env node
/**
 * mp-activity.mjs — SKELETON. Populates in_mp_activity.
 *
 * Usage: node scripts/india/mp-activity.mjs [--backfill] [--session N] [--apply]
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * TWO-TIER INGEST
 *   --backfill : the Zenodo bulk export (CC BY 4.0, DOI 10.5281/zenodo.18146342),
 *                a pre-scraped mirror of sansad.in current to 2025-12-31. One
 *                download instead of thousands of paginated requests, and an
 *                explicit open licence. Debates and RS questions already carry
 *                mpCode; only the LS questions file lacks it, exactly like the
 *                live API. Run once, then re-check periodically in case the
 *                author publishes a later cutoff.
 *   default    : the live sansad.in endpoints for everything after the Zenodo
 *                cutoff. Sessions and sitting dates are enumerable via
 *                api_ls/business/AllLoksabhaAndSessionDates.
 *   PRS's MP Track CSV (CC BY 4.0, 544 rows, no auth) fills period_kind='term'
 *   rows — term-cumulative attendance/questions/debates/PMBs plus national and
 *   state averages. It is genuinely bulk-downloadable; the "PRS is protective"
 *   assumption was wrong.
 *
 * THE MINISTER RULE — the reason this table has the shape it has.
 * Ministers and the Speaker do not sign the attendance register, do not ask
 * questions and do not introduce private member bills. sansad.in reports
 * signedDaysCount: 0 for them and PRS says so in words in its mp_note field —
 * two independent confirmations that this is how Parliament's paper trail
 * works, not a scraping artifact. A raw "worst attendance" ranking built on
 * those zeros would be defamatory nonsense.
 * So: set metrics_excluded=true and metrics_excluded_reason, and write NULL —
 * never 0 — into signed_days, attendance_pct, questions_asked and
 * private_member_bills. The CHECK constraint
 * in_mp_activity_excluded_is_null_not_zero rejects the row otherwise.
 *
 * QUESTIONS HAVE NO ID FILTER. api_ls/question/qetFilteredQuestionsAns ignores
 * mpNo/mpsno/member/memberName (all tested). Per-MP counts require pulling a
 * whole session and matching the member name array against
 * api_ls/question/getMembers (name↔mpNo, 544 rows). Both sides come from the
 * same Sansad person record, so this is an exact same-system string match, not
 * cross-system fuzzy matching — but keep it inside this one source. Never let
 * a name from here reach a MyNeta or PRS row.
 *
 * STEPS
 *   1. Load in_mps into a Map keyed on (mpsno, house, term_label) → id.
 *   2. Backfill: read the Zenodo xlsx files, aggregate per (mp, session).
 *   3. Live: for each session after the cutoff, pull attendance
 *      (getMemberAttendanceMemberWise, keyed by mpsno) and questions.
 *   4. PRS: read the MP Track CSV into period_kind='term', session_no=0 rows.
 *   5. Apply the minister rule, then upsert on (mp_id, period_kind, session_no).
 *
 * TODO: implement steps 1-5.
 * TODO: cross-check Zenodo row counts against sansad.in's own session totals
 *       before trusting the backfill wholesale — it is one researcher's export.
 * TODO: RS attendance/questions endpoints are unprobed. LS only for now.
 */
const APPLY = process.argv.includes("--apply")
const BACKFILL = process.argv.includes("--backfill")

const ZENODO_RECORD = "https://zenodo.org/api/records/18146342"   // CC BY 4.0
const ZENODO_CUTOFF = "2025-12-31"
const SESSION_DATES = "https://sansad.in/api_ls/business/AllLoksabhaAndSessionDates"
const ATTENDANCE = "https://sansad.in/api_ls/member/getMemberAttendanceMemberWise?loksabha=18&session="
const QUESTIONS = "https://sansad.in/api_ls/question/qetFilteredQuestionsAns"
const QUESTION_MEMBERS = "https://sansad.in/api_ls/question/getMembers"
const PRS_MP_TRACK = "https://prsindia.org/mptrack/download?file_path=files/mptrack/18-lok-sabha/Mp-Track/18 LS MP Track.csv"

/** Written into metrics_excluded_reason. Both sources agree on the wording. */
const MINISTER_EXCLUSION_REASON =
  "Minister/Speaker: does not sign the attendance register, ask questions, or introduce private member bills (PRS mp_note; sansad.in signedDaysCount)"

async function main() {
  console.log("mp-activity — SKELETON, no extract implemented yet")
  console.log("mode:", BACKFILL ? "zenodo backfill" : "live top-up")
  console.log({ ZENODO_RECORD, ZENODO_CUTOFF, SESSION_DATES, ATTENDANCE, QUESTIONS, QUESTION_MEMBERS, PRS_MP_TRACK })
  console.log("minister rule:", MINISTER_EXCLUSION_REASON)
  if (APPLY) {
    console.error("\n--apply is not implemented yet; refusing to write.")
    process.exit(1)
  }
}

main().catch(e => { console.error("FAILED:", e); process.exit(1) })
