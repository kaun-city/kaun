#!/usr/bin/env node
/**
 * merge-ocms-identities.mjs — collapse the duplicate project identities that a
 * truncated table read minted in in_central_projects.
 *
 * WHY THIS EXISTS
 * ---------------
 * load-mospi-historical.mjs joins a historical annexure row to an existing
 * project on ONE key: the OCMS code. A row whose code matches nothing gets its
 * own identity, `project_code = "ocms:<CODE>"`. That is the right rule — most
 * projects in a 2012 report completed years ago and have no modern row to
 * attach to.
 *
 * It went wrong because the read was short. PostgREST enforces its own row
 * ceiling (Supabase ships db-max-rows = 1000) and returns 200 OK without
 * saying it applied one, so an earlier run matched against 615 of the table's
 * legacy OCMS codes and minted a synthetic identity for every project it "did
 * not find" — including projects that were sitting in the table the whole time.
 * `selectRest` is paginated now (fixed in the branch this one is stacked on)
 * and no new identity is minted, but the duplicates it already created are
 * still there: 4,089 of the table's 6,122 rows are `ocms:` rows, and 720 of
 * them are a second copy of a project that also has a real MoSPI project_code.
 *
 * MERGING TWO IDENTITIES IS A REVIEWED DECISION, NOT LOADER BEHAVIOUR
 * -------------------------------------------------------------------
 * So this mirrors load-aliases.mjs and load-affidavit-review.mjs exactly: the
 * loader that could not decide reports the duplicates, a human reviews them,
 * the decided pairs are committed to data/india/ocms-identity-merges.csv, and
 * ONE script carries that file into the database. This script validates and
 * executes; it never decides which rows are a pair, and it never widens the
 * set. A pair that is not in the committed file is not merged, full stop.
 *
 * load-mospi-historical.mjs is deliberately NOT changed. It keeps writing to
 * the real project_code of each pair and keeps reporting the duplicates it
 * sees; it must not start rewriting identities on its own.
 *
 * WHAT A MERGE IS
 * ---------------
 *   1. the real MoSPI `project_code` survives; the `ocms:` twin is deleted
 *   2. the twin's snapshots move to the survivor
 *   3. the survivor's first_seen_month / last_seen_month widen to cover them
 *
 * THE SAME-MONTH RULE
 * -------------------
 * in_central_project_snapshots is keyed (project_code, report_month), so a
 * month held by BOTH rows cannot simply move — one of the two has to go, and
 * dropping either one silently would be exactly the wrong thing.
 *
 * The rule is: **the survivor's row is kept, and the twin's is dropped, only
 * when the two are the same row.** Not "newer wins", not "more complete wins",
 * not "the modern era wins" — those would all be inventing a preference where
 * none is needed. Both rows in a colliding month were written by the SAME
 * loader from the SAME committed snapshot CSV under the SAME parser_version,
 * for the same OCMS code and the same report month. The only reason there are
 * two of them is that one run resolved the identity against a truncated read
 * and one did not. They are not two competing observations of a project; they
 * are one observation stored twice under two names.
 *
 * That is asserted, never assumed. Every colliding month is compared column by
 * column at run time and each one records its own verdict:
 *
 *   identical  — equal on every column except `project_code` (the thing being
 *                merged) and `ingested_at` (WHEN the row was written, not what
 *                it says). Drop the twin's copy; the survivor already holds it.
 *   differs    — the premise is false and no rule here is entitled to pick.
 *                The whole run refuses before anything is written, and the
 *                disagreeing columns go to a review artifact for a human.
 *
 * At the time this was written all 1,939 colliding months were identical and
 * zero differed, from one parser era (flash-report-historical/v1) on both
 * sides. The comparison stays in anyway — it is the thing that makes the drop
 * safe, and a re-run years from now must re-earn it rather than inherit it.
 *
 * WHAT IS NOT MERGED, AND WHY
 * ---------------------------
 *   - an OCMS code held by one synthetic row and TWO OR MORE real project_codes
 *     (12 of them). There is no unique survivor and picking one would be a
 *     guess. Left intact, reported.
 *   - an OCMS code held by two or more REAL project_codes and no synthetic one
 *     (14 of them). MoSPI's own re-issue of a code across project rows; it has
 *     nothing to do with this bug and is not this script's to resolve.
 *   - the 3,369 `ocms:` rows whose code no real row carries. These are the rule
 *     working correctly: real historical projects that completed and left the
 *     ongoing list, with no modern row to attach to. They keep their identity.
 *
 * NOTHING ABOUT THE SURVIVOR'S OWN COLUMNS IS TAKEN FROM THE TWIN. In the 27
 * pairs where the twin has an st_code and the survivor does not, the survivor's
 * state_raw is MoSPI's `Multi-States (…)` and its NULL st_code is correct by
 * design; the twin's single-state pick is the older, less-informed attribution.
 * Only the sighting window moves, and only outwards.
 *
 * DELETES ARE IRREVERSIBLE, SO THE ORDER IS LOAD-BEARING
 * ------------------------------------------------------
 * in_central_project_snapshots references in_central_projects ON DELETE
 * CASCADE. Deleting the twin BEFORE its snapshots have moved would destroy
 * them. So per pair, in this order:
 *
 *   1. delete the twin's colliding snapshots (each verified identical)
 *   2. move the twin's remaining snapshots to the survivor
 *   3. widen the survivor's sighting window
 *   4. re-read the twin's snapshot count and REFUSE to continue unless it is 0
 *   5. delete the twin
 *
 * Step 4 is not paranoia: it is what makes step 5 unable to cascade away a row
 * that step 2 failed to move. Every delete in this script removes a row that is
 * provably present elsewhere at the moment it runs.
 *
 * Re-running is safe: a pair whose twin no longer exists plans nothing.
 *
 * Usage:
 *   node scripts/india/merge-ocms-identities.mjs                  # dry-run (default)
 *   node scripts/india/merge-ocms-identities.mjs --emit           # re-enumerate the pairs, rewrite the CSV
 *   node scripts/india/merge-ocms-identities.mjs --sign "name"    # fill in reviewed_by, writes the CSV only
 *   node scripts/india/merge-ocms-identities.mjs --apply          # execute (credential-gated + signed)
 * Env:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_KEY
 *   (or SUPABASE_SERVICE_ROLE_KEY), or KAUN_LOCAL_PG for a local test database.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { banner, flag, opt, run } from "./lib/cli.mjs"
import { openSink, SupabaseBackend, REPO_ROOT, ident, quote, sqlLiteral, toCsv } from "./lib/sink.mjs"

export const CSV_PATH = resolve(REPO_ROOT, "data/india/ocms-identity-merges.csv")
export const PROJECTS = "in_central_projects"
export const SNAPSHOTS = "in_central_project_snapshots"

export const COLUMNS = [
  "legacy_ocms_code", "synthetic_project_code", "surviving_project_code",
  "reviewed_by", "rationale",
]

/** The prefix load-mospi-historical.mjs mints. MoSPI's own project_code values
 *  are bare digits, so the two can never collide. */
export const SYNTHETIC_PREFIX = "ocms:"
export const isSynthetic = code => String(code ?? "").startsWith(SYNTHETIC_PREFIX)

/**
 * Columns excluded from the same-month comparison, and why.
 *   project_code  the thing being merged — of course it differs
 *   ingested_at   when the row was written, not what it says about the project
 * Everything else — including `raw`, `source_page` and `parser_version` — must
 * match, or the two rows are not the same observation and the run refuses.
 */
export const NOT_COMPARED = new Set(["project_code", "ingested_at"])

/** Minimal CSV reader: no embedded newlines; quoted fields may hold commas.
 *  Identical to load-aliases.mjs — the committed decision files are read by
 *  hand, so the parser stays small enough to read in one sitting. */
export function readCsv(path) {
  const [header, ...lines] = readFileSync(path, "utf8").trim().split("\n")
  const cols = header.split(",")
  return lines.map((line, i) => {
    const cells = []
    let cur = "", inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === "," && !inQ) { cells.push(cur); cur = "" }
      else cur += ch
    }
    cells.push(cur)
    if (cells.length !== cols.length) {
      throw new Error(`${path}:${i + 2}: ${cells.length} cells, expected ${cols.length}`)
    }
    return Object.fromEntries(cols.map((c, j) => [c, cells[j].trim() || null]))
  })
}

/* -------------------------------------------------------------------------- */
/* enumeration — pure                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Every OCMS code held by more than one in_central_projects row, split by what
 * kind of duplicate it is. Exact string equality on the upper-cased code and
 * nothing else: there is no fuzzy matching anywhere in this repo and there is
 * none here.
 */
export function enumerateDuplicates(projects) {
  const byCode = new Map()
  for (const p of projects) {
    if (!p.legacy_ocms_code) continue
    const code = String(p.legacy_ocms_code).toUpperCase()
    if (!byCode.has(code)) byCode.set(code, [])
    byCode.get(code).push(p)
  }

  const mergeable = [], ambiguous = [], realOnly = []
  for (const [code, owners] of byCode) {
    if (owners.length < 2) continue
    const synthetic = owners.filter(o => isSynthetic(o.project_code))
    const real = owners.filter(o => !isSynthetic(o.project_code))
    if (synthetic.length === 1 && real.length === 1) {
      mergeable.push({ code, synthetic: synthetic[0], surviving: real[0] })
    } else if (synthetic.length >= 1 && real.length >= 1) {
      // No unique survivor (or more than one twin). Picking would be a guess.
      ambiguous.push({ code, synthetic, real })
    } else {
      // Two or more real project_codes on one OCMS code, no synthetic row at
      // all. MoSPI's own doing; nothing here created it and nothing here fixes
      // it.
      realOnly.push({ code, real })
    }
  }
  const unpairedSynthetic = projects.filter(p =>
    isSynthetic(p.project_code) &&
    !(byCode.get(String(p.legacy_ocms_code ?? "").toUpperCase()) ?? [])
      .some(o => !isSynthetic(o.project_code))).length

  return { mergeable, ambiguous, realOnly, unpairedSynthetic }
}

/** The committed decision row for one enumerated pair. */
export function decisionRow({ code, synthetic, surviving }) {
  return {
    legacy_ocms_code: code,
    synthetic_project_code: synthetic.project_code,
    surviving_project_code: surviving.project_code,
    reviewed_by: "",
    rationale:
      `${synthetic.project_code} was minted by the truncated-read run of ` +
      `load-mospi-historical; ${surviving.project_code} is the MoSPI project_code ` +
      `that already carried legacy_ocms_code ${code}`,
  }
}

/* -------------------------------------------------------------------------- */
/* validation — pure                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every committed decision row that would block a merge, keyed to the reason.
 *
 * `apply` turns on the checks that only matter when something is about to be
 * deleted — chiefly the reviewed_by sign-off, which the committed file ships
 * without on purpose.
 *
 * `projects` is the live table. A decision row that does not describe the
 * database is a hard failure, not something to skip: the review file must
 * describe reality. The one exception is a pair whose twin is already gone —
 * that is a completed merge, and re-running must be a no-op rather than an
 * error.
 */
export function validateDecisions(rows, projects, { apply }) {
  const byCode = new Map(projects.map(p => [p.project_code, p]))
  const pairs = [], done = [], bad = []
  const seenSynthetic = new Map()

  for (const [i, r] of rows.entries()) {
    const at = `row ${i + 2}`
    const reject = problem => bad.push({ ...r, at, problem })

    if (!r.legacy_ocms_code) { reject("missing legacy_ocms_code"); continue }
    if (!r.synthetic_project_code) { reject("missing synthetic_project_code"); continue }
    if (!r.surviving_project_code) { reject("missing surviving_project_code"); continue }
    if (!r.rationale) { reject("no rationale — a decision with no evidence is not a decision"); continue }
    if (!isSynthetic(r.synthetic_project_code)) {
      reject(`synthetic_project_code '${r.synthetic_project_code}' does not start with "${SYNTHETIC_PREFIX}" — ` +
        "this script only ever deletes a synthetic identity")
      continue
    }
    if (isSynthetic(r.surviving_project_code)) {
      reject(`surviving_project_code '${r.surviving_project_code}' is itself synthetic`)
      continue
    }
    if (r.synthetic_project_code !== SYNTHETIC_PREFIX + r.legacy_ocms_code) {
      reject(`synthetic_project_code '${r.synthetic_project_code}' is not ` +
        `"${SYNTHETIC_PREFIX}${r.legacy_ocms_code}"`)
      continue
    }
    if (seenSynthetic.has(r.synthetic_project_code)) {
      reject(`duplicate synthetic_project_code — also ${seenSynthetic.get(r.synthetic_project_code)}`)
      continue
    }
    seenSynthetic.set(r.synthetic_project_code, at)

    // The sign-off. The committed file ships with reviewed_by blank; filling it
    // in is the human act, and nothing is deleted without it.
    if (apply && !r.reviewed_by) {
      reject("no reviewed_by — refusing to delete a row on an unsigned decision")
      continue
    }

    const synthetic = byCode.get(r.synthetic_project_code)
    const surviving = byCode.get(r.surviving_project_code)
    if (!surviving) {
      reject(`no ${PROJECTS} row for surviving_project_code ${r.surviving_project_code}`)
      continue
    }
    if (!synthetic) {
      // Already merged by an earlier run. Idempotent by design.
      done.push({ ...r, surviving })
      continue
    }
    const heldByTwin = String(synthetic.legacy_ocms_code ?? "").toUpperCase()
    const heldBySurvivor = String(surviving.legacy_ocms_code ?? "").toUpperCase()
    if (heldByTwin !== r.legacy_ocms_code || heldBySurvivor !== r.legacy_ocms_code) {
      reject(`the table disagrees: ${r.synthetic_project_code} carries '${heldByTwin || "NULL"}' and ` +
        `${r.surviving_project_code} carries '${heldBySurvivor || "NULL"}', not ${r.legacy_ocms_code}`)
      continue
    }
    pairs.push({ ...r, synthetic, surviving })
  }
  return { pairs, done, bad }
}

/* -------------------------------------------------------------------------- */
/* the same-month rule — pure                                                 */
/* -------------------------------------------------------------------------- */

/** Columns on which two snapshot rows for the same month actually disagree. */
export function snapshotDiff(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !NOT_COMPARED.has(k))
  return keys.filter(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).sort()
}

/**
 * What happens to one pair's snapshots.
 *
 * Returns the months that move, the months that collide (each with its own
 * recorded verdict and reason), and the widened sighting window. Nothing here
 * touches a database; the whole decision is visible in the dry run.
 */
export function planPair(pair, synSnapshots, survivorSnapshots) {
  const survivorByMonth = new Map(survivorSnapshots.map(s => [s.report_month, s]))
  const move = [], collisions = []

  for (const s of synSnapshots) {
    const held = survivorByMonth.get(s.report_month)
    if (!held) { move.push(s.report_month); continue }
    const diff = snapshotDiff(s, held)
    collisions.push(diff.length === 0
      ? {
        legacy_ocms_code: pair.legacy_ocms_code,
        report_month: s.report_month,
        dropped: pair.synthetic_project_code,
        kept: pair.surviving_project_code,
        verdict: "identical",
        differing_columns: "",
        reason: "same OCMS code, same report month, same parser_version, equal on every " +
          "column except project_code and ingested_at — one observation stored twice",
      }
      : {
        legacy_ocms_code: pair.legacy_ocms_code,
        report_month: s.report_month,
        dropped: "",
        kept: "",
        verdict: "differs",
        differing_columns: diff.join(" "),
        reason: "the two rows are not the same observation; no rule here is entitled to " +
          "pick one, so the whole run refuses",
      })
  }

  const months = synSnapshots.map(s => s.report_month).sort()
  const first = months[0] ?? null
  const last = months[months.length - 1] ?? null
  const window = {}
  if (first && first < pair.surviving.first_seen_month) window.first_seen_month = first
  if (last && last > pair.surviving.last_seen_month) window.last_seen_month = last

  return {
    legacy_ocms_code: pair.legacy_ocms_code,
    synthetic: pair.synthetic_project_code,
    surviving: pair.surviving_project_code,
    move,
    collisions,
    drop: collisions.filter(c => c.verdict === "identical").map(c => c.report_month),
    window,
  }
}

/**
 * The whole merge as SQL, in the order the header describes.
 *
 * The Supabase path executes this through PostgREST rather than as SQL (no
 * management token is needed for a service-key DELETE/PATCH), but the SQL is
 * what the dry-run artifact prints, what a local Postgres run executes, and
 * what a reviewer reads. One representation, so the two can never drift.
 */
export function mergeSql(plan) {
  const syn = quote(plan.synthetic)
  const sql = []
  if (plan.drop.length) {
    sql.push(`DELETE FROM ${ident(SNAPSHOTS)} WHERE project_code = ${syn}\n` +
      `  AND report_month IN (${plan.drop.map(m => quote(m)).join(", ")});`)
  }
  if (plan.move.length) {
    sql.push(`UPDATE ${ident(SNAPSHOTS)} SET project_code = ${quote(plan.surviving)}\n` +
      ` WHERE project_code = ${syn};`)
  }
  const set = Object.entries(plan.window)
    .map(([c, v]) => `${ident(c)} = ${sqlLiteral(v)}`)
  if (set.length) {
    sql.push(`UPDATE ${ident(PROJECTS)} SET ${set.join(", ")}\n` +
      ` WHERE project_code = ${quote(plan.surviving)};`)
  }
  // The twin only goes once nothing references it. The FK is ON DELETE
  // CASCADE, so this guard is the difference between a merge and a data loss.
  sql.push(`DELETE FROM ${ident(PROJECTS)} WHERE project_code = ${syn}\n` +
    `  AND NOT EXISTS (SELECT 1 FROM ${ident(SNAPSHOTS)} WHERE project_code = ${syn});`)
  return sql
}

/* -------------------------------------------------------------------------- */
/* execution                                                                  */
/* -------------------------------------------------------------------------- */

/** PostgREST verbs the shared sink has no need for. Service key only; no
 *  management token, so this works with the credentials the site already has. */
function rest(backend) {
  const call = async (method, path, body) => {
    const r = await fetch(`${backend.url}/rest/v1/${path}`, {
      method,
      headers: {
        ...backend.restHeaders,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 400)}`)
  }
  return {
    del: (table, filter) => call("DELETE", `${table}?${filter}`),
    patch: (table, filter, patch) => call("PATCH", `${table}?${filter}`, patch),
    async count(table, filter) {
      const r = await fetch(`${backend.url}/rest/v1/${table}?${filter}&select=project_code&limit=1`,
        { headers: { ...backend.restHeaders, Prefer: "count=exact" } })
      if (!r.ok) throw new Error(`count ${table} → ${r.status}`)
      return Number(r.headers.get("content-range").split("/")[1])
    },
  }
}

const eqList = ms => `in.(${ms.join(",")})`

/**
 * Every snapshot row belonging to the project_codes in play.
 *
 * NOT sink.select: that orders a PostgREST read by the first requested column,
 * and project_code is not unique in this table, so paging it could skip or
 * repeat a row between requests — the same class of silent truncation this
 * whole migration exists to clean up after. The order here is the table's full
 * primary key, and the read is filtered to the codes actually being merged
 * rather than pulling all 43,000 rows to use 9,000 of them.
 */
export async function readSnapshots(backend, codes, { pageSize = 1000, chunk = 60 } = {}) {
  const list = [...codes]
  if (!(backend instanceof SupabaseBackend)) {
    return await backend.selectJson(
      `SELECT * FROM ${ident(SNAPSHOTS)} WHERE project_code IN (${list.map(quote).join(", ")})` +
      " ORDER BY project_code, report_month")
  }
  const out = []
  for (let i = 0; i < list.length; i += chunk) {
    const filter = `in.(${list.slice(i, i + chunk).map(c => `"${c}"`).join(",")})`
    for (let offset = 0; ; offset += pageSize) {
      const params = new URLSearchParams({
        select: "*", project_code: filter, order: "project_code.asc,report_month.asc",
        limit: String(pageSize), offset: String(offset),
      })
      const r = await fetch(`${backend.url}/rest/v1/${SNAPSHOTS}?${params}`,
        { headers: backend.restHeaders })
      if (!r.ok) throw new Error(`select ${SNAPSHOTS} → ${r.status} ${(await r.text()).slice(0, 300)}`)
      const page = await r.json()
      out.push(...page)
      if (page.length < pageSize) break
    }
  }
  return out
}

/** One pair, in the order the header describes, with the step-4 guard. */
async function executePair(backend, plan) {
  if (!(backend instanceof SupabaseBackend)) {
    for (const stmt of mergeSql(plan)) await backend.runSql(stmt)
    return
  }
  const api = rest(backend)
  const syn = `project_code=eq.${encodeURIComponent(plan.synthetic)}`
  if (plan.drop.length) {
    await api.del(SNAPSHOTS, `${syn}&report_month=${eqList(plan.drop)}`)
  }
  if (plan.move.length) {
    await api.patch(SNAPSHOTS, syn, { project_code: plan.surviving })
  }
  if (Object.keys(plan.window).length) {
    await api.patch(PROJECTS, `project_code=eq.${encodeURIComponent(plan.surviving)}`, plan.window)
  }
  const left = await api.count(SNAPSHOTS, syn)
  if (left !== 0) {
    throw new Error(`${plan.synthetic} still has ${left} snapshot row(s) after the move; ` +
      "refusing to delete it (the FK cascades)")
  }
  await api.del(PROJECTS, syn)
}

/* -------------------------------------------------------------------------- */

async function main() {
  const emit = flag("emit")
  const sign = opt("sign")
  // `--sign` with nothing after it would otherwise parse as "no sign-off" and
  // run as a plain dry-run, which reads as a signature that silently did not
  // happen. Same shape as the flag("--apply") trap.
  if (flag("sign") && !sign) throw new Error('--sign needs a name: --sign "bharatnyusta"')
  const apply = banner("merge-ocms-identities", { decisions: CSV_PATH, table: PROJECTS })
  const sink = openSink({ loader: "merge-ocms-identities", apply })

  const projects = await sink.select(PROJECTS, {
    columns: "project_code,legacy_ocms_code,project_name,state_raw,st_code,is_ongoing,first_seen_month,last_seen_month",
  })
  if (!projects.length) {
    throw new Error(`could not read ${PROJECTS}; there is nothing to merge against`)
  }
  sink.count(`${PROJECTS} rows`, projects.length)
  sink.count("synthetic (ocms:) rows", projects.filter(p => isSynthetic(p.project_code)).length)

  const found = enumerateDuplicates(projects)
  sink.count("OCMS codes held by more than one row",
    found.mergeable.length + found.ambiguous.length + found.realOnly.length)
  sink.count("  mergeable (1 synthetic + 1 real)", found.mergeable.length)
  sink.count("  ambiguous (1 synthetic, several real)", found.ambiguous.length)
  sink.count("  real-only (several real, no synthetic)", found.realOnly.length)
  sink.count("standalone synthetic rows (correct, untouched)", found.unpairedSynthetic)

  if (found.ambiguous.length) {
    sink.review("ambiguous-no-unique-survivor", found.ambiguous.map(a => ({
      legacy_ocms_code: a.code,
      synthetic_project_codes: a.synthetic.map(s => s.project_code).join(" "),
      real_project_codes: a.real.map(s => s.project_code).join(" "),
      reason: "no unique surviving project_code; merging would be a guess",
    })))
    sink.warn(`${found.ambiguous.length} OCMS code(s) have no unique survivor and are left intact`)
  }
  if (found.realOnly.length) {
    sink.review("shared-code-across-real-rows", found.realOnly.map(a => ({
      legacy_ocms_code: a.code,
      real_project_codes: a.real.map(s => s.project_code).join(" "),
      reason: "MoSPI reissued one OCMS code across several project_code rows; not this bug, not this script's to fix",
    })))
    sink.warn(`${found.realOnly.length} OCMS code(s) are shared by real project rows only — out of scope`)
  }

  if (emit) {
    writeFileSync(CSV_PATH, toCsv(found.mergeable.map(decisionRow)))
    sink.note(`wrote ${found.mergeable.length} enumerated pair(s) → ${CSV_PATH}`)
    sink.finish({ mode: "emit", decisions: CSV_PATH })
    return
  }

  const rows = readCsv(CSV_PATH)
  sink.note(`${rows.length} committed merge decision(s)`)

  if (sign) {
    // A local file write, never a database one: this is the human sign-off
    // being recorded so it can be committed and reviewed as a diff.
    writeFileSync(CSV_PATH, toCsv(rows.map(r => ({ ...r, reviewed_by: sign }))))
    sink.note(`signed ${rows.length} decision(s) as "${sign}" → ${CSV_PATH}; commit this, then --apply`)
    sink.finish({ mode: "sign", decisions: CSV_PATH })
    return
  }

  const { pairs, done, bad } = validateDecisions(rows, projects, { apply })
  if (bad.length) {
    sink.review("rejected-merge-decisions", bad)
    for (const b of bad) sink.warn(`${b.at} (${b.legacy_ocms_code ?? "?"}) — ${b.problem}`)
    throw new Error(`${bad.length} decision row(s) failed validation; nothing written`)
  }
  if (done.length) sink.count("already merged by an earlier run", done.length)
  if (!pairs.length) {
    sink.note("nothing left to merge")
    sink.finish({ decisions: CSV_PATH, merged: 0 })
    return
  }
  const unsigned = rows.filter(r => !r.reviewed_by).length
  if (unsigned) {
    sink.warn(`${unsigned} decision(s) have an empty reviewed_by — --apply will refuse ` +
      `until a human signs them off (--sign "<name>")`)
  }

  /* ---- snapshots -------------------------------------------------------- */
  const codes = new Set(pairs.flatMap(p => [p.synthetic_project_code, p.surviving_project_code]))
  const snapshots = await readSnapshots(sink.backend, codes)
  sink.count(`${SNAPSHOTS} rows read for those pairs`, snapshots.length)
  const byProject = new Map()
  for (const s of snapshots) {
    if (!byProject.has(s.project_code)) byProject.set(s.project_code, [])
    byProject.get(s.project_code).push(s)
  }

  const plans = pairs.map(p => planPair(p,
    byProject.get(p.synthetic_project_code) ?? [],
    byProject.get(p.surviving_project_code) ?? []))

  const allCollisions = plans.flatMap(p => p.collisions)
  const differ = allCollisions.filter(c => c.verdict === "differs")
  sink.review("snapshot-month-collisions", allCollisions)
  sink.count("pairs to merge", plans.length)
  sink.count("snapshots that move to the surviving project_code",
    plans.reduce((n, p) => n + p.move.length, 0))
  sink.count("same-month collisions", allCollisions.length)
  sink.count("  verdict=identical (twin's copy dropped)", allCollisions.length - differ.length)
  sink.count("  verdict=differs (blocks the run)", differ.length)
  sink.count("surviving rows whose sighting window widens",
    plans.filter(p => Object.keys(p.window).length).length)
  sink.count("synthetic project rows that would be deleted", plans.length)

  if (differ.length) {
    for (const c of differ.slice(0, 20)) {
      sink.warn(`${c.legacy_ocms_code} ${c.report_month} — disagrees on ${c.differing_columns}`)
    }
    throw new Error(`${differ.length} colliding month(s) are not the same observation; ` +
      "nothing written. See the snapshot-month-collisions review artifact.")
  }

  // The dry run prints exactly what would be deleted and what would move, as
  // the SQL that says it. Deletes are irreversible; there is no version of this
  // where a reviewer has to infer them.
  const statements = plans.flatMap(mergeSql)
  sink.review("merge-plan-sql", statements.map((sql, i) => ({ step: i + 1, sql })))
  if (!apply) {
    for (const p of plans.slice(0, 3)) {
      console.log(`  ${p.synthetic} → ${p.surviving}: ${p.move.length} snapshot(s) move, ` +
        `${p.drop.length} duplicate month(s) dropped, then the row is deleted`)
    }
    console.log(`  … ${statements.length} statement(s) in total; full plan in the review artifact`)
    sink.finish({ decisions: CSV_PATH, merged: 0, would_merge: plans.length })
    return
  }

  let n = 0
  for (const plan of plans) {
    await executePair(sink.backend, plan)
    if (++n % 25 === 0) console.log(`  merged ${n}/${plans.length}`)
  }
  console.log(`  merged ${n}/${plans.length}`)
  sink.finish({ decisions: CSV_PATH, merged: n })
}

run(main, import.meta.url)
