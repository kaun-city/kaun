#!/usr/bin/env node
/**
 * mp-activity.mjs — populates in_mp_activity (attendance / questions / debates).
 *
 * Usage:
 *   node scripts/india/mp-activity.mjs                     # live top-up + PRS term rows
 *   node scripts/india/mp-activity.mjs --session 7         # one session only
 *   node scripts/india/mp-activity.mjs --questions         # also count questions live
 *   node scripts/india/mp-activity.mjs --backfill          # Zenodo bulk backfill
 *   node scripts/india/mp-activity.mjs --backfill --zenodo-dir <dir>
 *   node scripts/india/mp-activity.mjs --apply
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   (or KAUN_LOCAL_PG for local testing)
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
 * in_mp_activity_excluded_is_null_not_zero rejects the row otherwise, and this
 * loader applies the rule in one place (applyMinisterRule) so no pass can
 * forget it.
 *
 * THREE SOURCES, THREE PASSES, EACH OWNING ITS OWN COLUMNS
 *   attendance  live sansad getMemberAttendanceMemberWise — one request per
 *               session, keyed by mpsno. Owns sittings_held, signed_days,
 *               attendance_pct, the session label/dates and data_source.
 *   questions   live qetFilteredQuestionsAns (--questions) or the Zenodo
 *               Loksabha_questions export (--backfill). Owns questions_asked.
 *   debates     Zenodo Loksabha_debates export (--backfill). Owns debates.
 *   term        PRS MP Track CSV → period_kind='term', session_no=0. Owns the
 *               whole row.
 * Each pass upserts with an explicit updateColumns list so a later pass cannot
 * blank a column an earlier one filled. data_source names the pass that owns
 * the session row's headline numbers (attendance); the per-column provenance is
 * in the dry-run artifact.
 *
 * QUESTIONS HAVE NO ID FILTER. api_ls/question/qetFilteredQuestionsAns ignores
 * mpNo/mpsno/member/memberName (all tested in recon). Per-MP counts require
 * pulling a whole session and matching the member name array against
 * api_ls/question/getMembers (name↔mpNo, 544 rows). Both sides come from the
 * same Sansad person record, so this is an exact same-system string match, not
 * cross-system fuzzy matching — and a name from here never reaches a MyNeta or
 * PRS row. Unmatched names are reported, never guessed.
 *
 * RAJYA SABHA is not covered: its attendance/questions endpoints were never
 * probed in recon. LS only, deliberately.
 */
import { readFileSync, existsSync } from "fs"
import { resolve } from "path"
import { openSink } from "./lib/sink.mjs"
import { politeFetch, fetchToFile, CACHE_DIR } from "./lib/http.mjs"
import { readXlsx } from "./lib/xlsx.mjs"
import { parseCsv } from "../lib/parsers.mjs"
import { flag, opt, intOpt, banner, run } from "./lib/cli.mjs"

const LOADER = "mp-activity"
const SANSAD = "https://sansad.in"
const SESSION_DATES = `${SANSAD}/api_ls/business/AllLoksabhaAndSessionDates`
const ATTENDANCE = `${SANSAD}/api_ls/member/getMemberAttendanceMemberWise`
const QUESTIONS = `${SANSAD}/api_ls/question/qetFilteredQuestionsAns`
const QUESTION_MEMBERS = `${SANSAD}/api_ls/question/getMembers`
const PRS_MP_TRACK =
  "https://prsindia.org/mptrack/download?file_path=files/mptrack/18-lok-sabha/Mp-Track/18%20LS%20MP%20Track.csv"

const ZENODO_RECORD = "https://zenodo.org/api/records/18146342"   // CC BY 4.0
const ZENODO_CUTOFF = "2025-12-31"
const ZENODO_FILES = { debates: "Loksabha_debates.xlsx", questions: "Loksabha_questions.xlsx" }

const LOK_SABHA_NO = 18
const TERM_LABEL = "LS18"
const HEADERS = { Accept: "application/json, */*", Referer: `${SANSAD}/` }

/** Written into metrics_excluded_reason. Both sources agree on the wording. */
export const MINISTER_EXCLUSION_REASON =
  "Minister/Speaker: does not sign the attendance register, ask questions, or introduce private member bills (PRS mp_note; sansad.in signedDaysCount)"

/* -------------------------------------------------------------------------- */
/* pure helpers — exported for tests                                          */
/* -------------------------------------------------------------------------- */

/** "24/06/2024" → "2024-06-24". */
export function parseDmy(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? "").trim())
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null
}

/**
 * THE minister rule, in one place. Excluded rows carry NULL, never 0, in every
 * column in_mp_activity_excluded_is_null_not_zero names.
 */
export function applyMinisterRule(row, isMinister) {
  if (!isMinister) return { ...row, metrics_excluded: false, metrics_excluded_reason: null }
  return {
    ...row,
    signed_days: null,
    attendance_pct: null,
    questions_asked: null,
    private_member_bills: null,
    metrics_excluded: true,
    metrics_excluded_reason: MINISTER_EXCLUSION_REASON,
  }
}

/** signed / held → percentage, 2dp, or null when the denominator is unusable. */
export function attendancePct(signed, held) {
  if (signed == null || !held) return null
  const pct = (Number(signed) / Number(held)) * 100
  if (!Number.isFinite(pct)) return null
  return Math.round(Math.min(100, Math.max(0, pct)) * 100) / 100
}

/** PRS publishes "83%" / "0.83" / "NA". Return a 0-100 number or null. */
export function parsePrsAttendance(v) {
  const s = String(v ?? "").trim()
  if (!s || /^NA$/i.test(s)) return null
  const n = Number(s.replace("%", ""))
  if (!Number.isFinite(n)) return null
  const pct = s.includes("%") || n > 1 ? n : n * 100
  return Math.round(Math.min(100, Math.max(0, pct)) * 100) / 100
}

export function parsePrsInt(v) {
  const s = String(v ?? "").trim()
  if (!s || /^NA$/i.test(s)) return null
  const n = Number.parseInt(s.replace(/,/g, ""), 10)
  return Number.isFinite(n) ? n : null
}

/** The Zenodo list columns are Python reprs: "[{'mpName': 'X', 'mpCode': 5814}]". */
export function parseMpCodes(repr) {
  return [...String(repr ?? "").matchAll(/'mpCode'\s*:\s*(\d+)/g)].map(m => Number(m[1]))
}

/** "['Shri Mani A', 'Shri X']" → ["Shri Mani A", "Shri X"]. */
export function parseNameList(repr) {
  const s = String(repr ?? "")
  const out = [...s.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\(.)/g, "$1").trim())
  return out.filter(Boolean)
}

/** sansad names are the same underlying person record on both endpoints, so an
 *  exact match after whitespace collapsing is safe. Nothing looser. */
export function nameKey(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase()
}

/* -------------------------------------------------------------------------- */

async function fetchSessions() {
  const all = await politeFetch(SESSION_DATES, {
    namespace: "sansad", headers: HEADERS, maxAgeMs: 24 * 3600e3,
  })
  const term = (Array.isArray(all) ? all : []).find(t => Number(t.loksabha) === LOK_SABHA_NO)
  return (term?.sessions ?? []).map(s => ({
    session_no: Number(s.sessionNo),
    session_label: Array.isArray(s.sessionPeriod) ? s.sessionPeriod.join("; ") : null,
    dates: (s.dates ?? []).map(parseDmy).filter(Boolean).sort(),
  })).filter(s => Number.isFinite(s.session_no) && s.session_no > 0)
}

async function fetchAttendance(sessionNo) {
  return politeFetch(
    `${ATTENDANCE}?loksabha=${LOK_SABHA_NO}&session=${sessionNo}&locale=en`,
    { namespace: "sansad", headers: HEADERS, maxAgeMs: 12 * 3600e3 })
}

/** name → mpNo, straight off the Questions page's own member dropdown. */
async function fetchQuestionMembers() {
  const list = await politeFetch(`${QUESTION_MEMBERS}?lkNo=${LOK_SABHA_NO}`, {
    namespace: "sansad", headers: HEADERS, maxAgeMs: 24 * 3600e3,
  })
  const m = new Map()
  for (const r of Array.isArray(list) ? list : []) {
    const k = nameKey(r.mpName)
    if (k) m.set(k, Number(r.mpNo))
  }
  return m
}

/** Every question in a session, paginated. Heavy — hence opt-in. */
async function fetchSessionQuestions(sessionNo, sink) {
  const pageSize = 500
  const out = []
  for (let pageNo = 1; pageNo <= 60; pageNo++) {
    const url = `${QUESTIONS}?loksabhaNo=${LOK_SABHA_NO}&sessionNumber=${sessionNo}` +
      `&pageNo=${pageNo}&pageSize=${pageSize}&locale=en`
    let body
    try {
      body = await politeFetch(url, { namespace: "sansad", headers: HEADERS, maxAgeMs: 12 * 3600e3 })
    } catch (e) {
      sink.warn(`questions session ${sessionNo} page ${pageNo}: ${e.message.slice(0, 100)}`)
      break
    }
    const list = body?.records ?? body?.questions ?? (Array.isArray(body) ? body : [])
    if (!list.length) break
    out.push(...list)
    if (list.length < pageSize) break
  }
  return out
}

async function zenodoFile(which, dir, sink) {
  const name = ZENODO_FILES[which]
  if (dir) {
    // The recon copies are suffixed "_sample"; accept either name.
    for (const cand of [name, name.replace(/\.xlsx$/, "_sample.xlsx")]) {
      const p = resolve(dir, cand)
      if (existsSync(p)) return p
    }
    throw new Error(`--zenodo-dir given but neither ${name} nor its _sample variant is in ${dir}`)
  }
  const record = await politeFetch(ZENODO_RECORD, { namespace: "zenodo", maxAgeMs: 7 * 24 * 3600e3 })
  const entry = (record?.files ?? []).find(f => f.key === name)
  if (!entry) throw new Error(`Zenodo record has no file named ${name}`)
  const url = entry.links?.self ?? entry.links?.download
  const dest = resolve(CACHE_DIR, "zenodo", name)
  const { cached } = await fetchToFile(url, dest)
  sink.note(`zenodo ${name}: ${cached ? "cached" : "downloaded"} → ${dest}`)
  return dest
}

/* -------------------------------------------------------------------------- */

async function main() {
  const backfill = flag("backfill")
  const withQuestions = flag("questions")
  const onlySession = intOpt("session", null)
  const zenodoDir = opt("zenodo-dir")
  const apply = banner(LOADER, {
    mode: backfill ? "zenodo backfill" : "live top-up",
    questions: backfill ? "from zenodo" : (withQuestions ? "live (heavy)" : "skipped (pass --questions)"),
    session: onlySession ?? "all",
  })
  const sink = openSink({ loader: LOADER, apply })

  /* ---- the roster is the prerequisite ---------------------------------- */
  const mps = await sink.select("in_mps", {
    columns: "id,mpsno,house,term_label,is_minister,status,name",
  })
  const ls = mps.filter(m => m.house === "LS" && m.term_label === TERM_LABEL)
  if (!ls.length) {
    sink.warn("in_mps has no LS18 rows — run sansad-roster.mjs first. " +
      "in_mp_activity.mp_id is a NOT NULL foreign key, so there is nothing to write.")
    sink.finish({ blocked_on: "sansad-roster" })
    if (apply) process.exit(1)
    return
  }
  const byMpsno = new Map(ls.map(m => [Number(m.mpsno), m]))
  sink.count("LS18 MPs in roster", ls.length)
  sink.count("of which flagged minister", ls.filter(m => m.is_minister).length)

  const base = m => ({
    mp_id: m.id, mpsno: Number(m.mpsno), house: "LS", term_label: TERM_LABEL,
  })

  /* ---- pass 1: attendance (live) --------------------------------------- */
  const sessions = (await fetchSessions())
    .filter(s => onlySession == null || s.session_no === onlySession)
  sink.count("LS18 sessions", sessions.length)

  const attendanceRows = []
  const unknownMpsno = new Set()
  for (const s of sessions) {
    const list = await fetchAttendance(s.session_no)
    if (!Array.isArray(list) || !list.length) {
      sink.warn(`session ${s.session_no}: attendance endpoint returned nothing`)
      continue
    }
    const held = s.dates.length || null
    for (const a of list) {
      const m = byMpsno.get(Number(a.mpsno))
      if (!m) { unknownMpsno.add(Number(a.mpsno)); continue }
      const signed = Number.isFinite(a.signedDaysCount) ? Number(a.signedDaysCount) : null
      attendanceRows.push(applyMinisterRule({
        ...base(m),
        period_kind: "session",
        session_no: s.session_no,
        session_label: s.session_label,
        session_start: s.dates[0] ?? null,
        session_end: s.dates[s.dates.length - 1] ?? null,
        sittings_held: held,
        signed_days: signed,
        attendance_pct: attendancePct(signed, held),
        data_source: "sansad.in",
      }, m.is_minister))
    }
    sink.count(`session ${s.session_no} attendance rows`, list.length)
  }
  if (unknownMpsno.size) {
    sink.warn(`${unknownMpsno.size} mpsno value(s) in attendance data are not in in_mps ` +
      `(roster is stale — re-run sansad-roster.mjs)`)
    sink.review("unknown-mpsno", [...unknownMpsno].map(mpsno => ({ mpsno })))
  }

  /* ---- pass 2: questions ------------------------------------------------ */
  const questionCounts = new Map()   // `${session}:${mpsno}` → count
  const unmatchedNames = new Map()

  if (backfill) {
    const path = await zenodoFile("questions", zenodoDir, sink)
    const { rows } = readXlsx(path)
    const nameToMpNo = await fetchQuestionMembers()
    let considered = 0
    for (const r of rows) {
      if (String(r.lokNo ?? "") !== String(LOK_SABHA_NO)) continue
      const session = Number(r.sessionNo)
      if (!Number.isFinite(session)) continue
      if (onlySession != null && session !== onlySession) continue
      considered++
      for (const nm of parseNameList(r.member)) {
        const mpNo = nameToMpNo.get(nameKey(nm))
        if (!mpNo) { unmatchedNames.set(nm, (unmatchedNames.get(nm) ?? 0) + 1); continue }
        const k = `${session}:${mpNo}`
        questionCounts.set(k, (questionCounts.get(k) ?? 0) + 1)
      }
    }
    sink.count("zenodo question rows considered", considered)
    sink.note(`zenodo questions cover up to ${ZENODO_CUTOFF}; later sessions need --questions`)
  } else if (withQuestions) {
    const nameToMpNo = await fetchQuestionMembers()
    for (const s of sessions) {
      const qs = await fetchSessionQuestions(s.session_no, sink)
      sink.count(`session ${s.session_no} questions`, qs.length)
      for (const q of qs) {
        const members = Array.isArray(q.member) ? q.member : parseNameList(q.member)
        for (const nm of members) {
          const mpNo = nameToMpNo.get(nameKey(nm))
          if (!mpNo) { unmatchedNames.set(nm, (unmatchedNames.get(nm) ?? 0) + 1); continue }
          const k = `${s.session_no}:${mpNo}`
          questionCounts.set(k, (questionCounts.get(k) ?? 0) + 1)
        }
      }
    }
  }
  if (unmatchedNames.size) {
    sink.warn(`${unmatchedNames.size} question author name(s) did not match getMembers exactly — ` +
      `reported, not guessed`)
    sink.review("unmatched-question-authors",
      [...unmatchedNames].map(([name, n]) => ({ name, questions: n })))
  }

  const questionRows = []
  for (const [k, count] of questionCounts) {
    const [session, mpsno] = k.split(":").map(Number)
    const m = byMpsno.get(mpsno)
    if (!m) continue
    questionRows.push(applyMinisterRule({
      ...base(m), period_kind: "session", session_no: session,
      questions_asked: count, data_source: "sansad.in",
    }, m.is_minister))
  }

  /* ---- pass 3: debates (Zenodo only) ------------------------------------ */
  const debateRows = []
  if (backfill) {
    const path = await zenodoFile("debates", zenodoDir, sink)
    const { rows } = readXlsx(path)
    const counts = new Map()
    for (const r of rows) {
      if (String(r.loksabha ?? "") !== String(LOK_SABHA_NO)) continue
      const session = Number(r.session)
      if (!Number.isFinite(session)) continue
      if (onlySession != null && session !== onlySession) continue
      for (const mpCode of new Set(parseMpCodes(r.mpPartDetailList))) {
        const k = `${session}:${mpCode}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
    for (const [k, count] of counts) {
      const [session, mpsno] = k.split(":").map(Number)
      const m = byMpsno.get(mpsno)
      if (!m) continue
      debateRows.push({
        ...base(m), period_kind: "session", session_no: session,
        debates: count, data_source: `zenodo:10.5281/zenodo.18146342`,
      })
    }
    sink.count("zenodo debate participations", debateRows.length)
  }

  /* ---- pass 4: PRS term-cumulative rows --------------------------------- */
  const termRows = []
  try {
    const csv = await politeFetch(PRS_MP_TRACK, { namespace: "prs", json: false, maxAgeMs: 7 * 24 * 3600e3 })
    const parsed = parseCsv(csv)
    const head = parsed[0].map(h => h.trim())
    const idx = Object.fromEntries(head.map((h, i) => [h, i]))
    // PRS has no mpsno. It is joined through pc_code, which in_mps already
    // carries — the same structural bridge sansad-roster uses for the minister
    // flag, not a name match.
    const mpsWithPc = await sink.select("in_mps", { columns: "id,mpsno,pc_code,house,term_label,is_minister,status" })
    const byPc = new Map(mpsWithPc
      .filter(m => m.house === "LS" && m.status === "Sitting" && m.pc_code)
      .map(m => [m.pc_code, m]))
    const { loadPcReference, loadAliases } = await import("./lib/pc-reference.mjs")
    const reference = await loadPcReference(sink)
    const aliases = await loadAliases(sink, ["prs"])

    let matched = 0
    for (const r of parsed.slice(1)) {
      if (r.length <= idx.mp_house) continue
      if (!/lok/i.test(r[idx.mp_house] ?? "")) continue
      const res = reference?.resolve({
        source: "prs", sourceKey: `${r[idx.state]}|${r[idx.pc_name]}`,
        stateName: r[idx.state], name: r[idx.pc_name], aliases,
      }) ?? { pc_code: null }
      const m = res.pc_code ? byPc.get(res.pc_code) : null
      if (!m) continue
      matched++
      termRows.push(applyMinisterRule({
        ...base(m), period_kind: "term", session_no: 0,
        session_label: r[idx.term] ?? null,
        session_start: null, session_end: null,
        attendance_pct: parsePrsAttendance(r[idx.attendance]),
        questions_asked: parsePrsInt(r[idx.questions]),
        debates: parsePrsInt(r[idx.debates]),
        private_member_bills: parsePrsInt(r[idx.private_member_bills]),
        data_source: "prsindia.org",
      }, m.is_minister))
    }
    sink.count("PRS term rows matched to an MP", matched)
  } catch (e) {
    sink.warn(`PRS MP Track unavailable (${e.message.slice(0, 120)}) — no period_kind='term' rows this run`)
  }

  /* ---- write ------------------------------------------------------------ */
  const KEY = ["mp_id", "period_kind", "session_no"]
  sink.count("session attendance rows", attendanceRows.length)
  sink.count("session question rows", questionRows.length)
  sink.count("session debate rows", debateRows.length)
  sink.count("term rows", termRows.length)
  sink.count("rows excluded by the minister rule",
    [...attendanceRows, ...questionRows, ...termRows].filter(r => r.metrics_excluded).length)

  // Each pass updates only what it owns, so a questions run cannot blank the
  // attendance a previous run wrote (and vice versa).
  await sink.upsert("in_mp_activity", attendanceRows, {
    conflict: KEY, batch: 400,
    updateColumns: ["mpsno", "house", "term_label", "session_label", "session_start",
      "session_end", "sittings_held", "signed_days", "attendance_pct",
      "metrics_excluded", "metrics_excluded_reason", "data_source"],
  })
  await sink.upsert("in_mp_activity", questionRows, {
    conflict: KEY, batch: 400,
    updateColumns: ["questions_asked", "metrics_excluded", "metrics_excluded_reason"],
  })
  await sink.upsert("in_mp_activity", debateRows, {
    conflict: KEY, batch: 400, updateColumns: ["debates"],
  })
  await sink.upsert("in_mp_activity", termRows, {
    conflict: KEY, batch: 400,
    updateColumns: ["mpsno", "house", "term_label", "session_label", "attendance_pct",
      "questions_asked", "debates", "private_member_bills",
      "metrics_excluded", "metrics_excluded_reason", "data_source"],
  })

  sink.finish({
    mode: backfill ? "backfill" : "live",
    sessions: sessions.map(s => s.session_no),
    zenodo_cutoff: backfill ? ZENODO_CUTOFF : null,
  })
}

run(main, import.meta.url)
