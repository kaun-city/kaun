#!/usr/bin/env node
/**
 * load-affidavit-review.mjs — apply the human-reviewed affidavit decisions in
 * data/india/affidavit-review.csv to in_mp_affidavits.
 *
 * WHY THIS EXISTS
 * ---------------
 * myneta-affidavits.mjs writes every winner it cannot fully corroborate with
 * needs_review=true, and the RLS policy in_mp_affidavits_anon_read_matched
 * keeps those rows out of every public read. That is the right default: an
 * unreviewed criminal-case row must never reach a constituency page. It is
 * also a dead end — nothing in the pipeline can clear the flag, because the
 * loader has already tried and failed. A human has to look.
 *
 * So this mirrors load-aliases.mjs exactly: the loader that could not decide
 * writes candidates to .artifacts/, a human fills in the decision, the row is
 * committed to data/india/, and ONE loader carries that file into the
 * database. This loader validates; it never decides.
 *
 * WHAT THE CONFLICTS ACTUALLY ARE
 * -------------------------------
 * Almost all of them are label disagreements, not factual ones — the same
 * party written two ways by two publishers:
 *   - faction naming (sansad's generic "Shiv Sena" for seats the candidate
 *     contested as Shiv Sena (UBT));
 *   - abbreviation vs expansion ("YSRCP" vs "YSR Congress Party");
 *   - transliteration ("Aazad" vs "Azad", "Thackeray" vs "Thackrey").
 * Two more classes show up: a seat whose pc_code only resolves through the
 * committed alias table, and a seat whose roster row is not status='Sitting'
 * (died / resigned), so the loader's corroboration had nothing to compare.
 *
 * RESOLUTIONS
 *   accept          the conflict is cosmetic — clear needs_review, keep the
 *                   affidavit's own party labels untouched
 *   map_to:<abbr>   as accept, and additionally rewrite party_abbr to <abbr>
 *                   (MyNeta sometimes puts a full party NAME in the
 *                   abbreviation field, which reads badly on a seat page)
 *   reject          the row is wrong or unsafe — leave needs_review=true, so
 *                   it stays private. Never written.
 *   UNRESOLVED      nobody could decide yet. Never written; reported loudly so
 *                   the open questions stay visible instead of rotting.
 *
 * Validation before any write:
 *   - the header is exactly the expected column set
 *   - myneta_candidate_id is an integer, election is non-empty
 *   - pc_code parses AND exists in the 543-seat reference (the FK would
 *     reject it anyway; the pre-check turns a batch failure into a named row)
 *   - no duplicate pc_code and no duplicate (myneta_candidate_id, election)
 *   - resolution is one of the four forms above; map_to carries an abbr
 *   - rationale is non-empty — a decision with no evidence is not a decision
 *   - --apply ONLY: every actionable row carries reviewed_by. The committed
 *     file ships with reviewed_by blank on purpose; filling it in is the human
 *     sign-off, and this loader will not write a row without it.
 *   - --apply ONLY: the row exists in in_mp_affidavits, and assigning its
 *     pc_code cannot collide with another winner on the same seat
 *     (in_mp_affidavits_one_winner_per_pc would reject the batch).
 *
 * The write is a whole-row upsert of the CURRENT database row with the review
 * decision merged on top, not a partial one: in_mp_affidavits has NOT NULL
 * columns with no default (candidate_name), and PostgREST's upsert is an
 * INSERT ... ON CONFLICT, so a partial payload fails on a NOT NULL check
 * before it ever reaches the conflict. Reading first also means the loader can
 * refuse a row that is not actually in the table.
 *
 * NOTE ON RE-RUNS: re-running myneta-affidavits.mjs re-derives needs_review
 * from the roster and will flag these seats again, because the disagreement is
 * in the published labels and this loader does not edit in_mps. Re-run this
 * loader after that one. The CSV is the durable record of the decision.
 *
 * Usage: node scripts/india/load-affidavit-review.mjs [--apply] [--csv <path>]
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY   (or KAUN_LOCAL_PG for local testing)
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { banner, opt, run } from "./lib/cli.mjs"
import { openSink, REPO_ROOT } from "./lib/sink.mjs"
import { parsePcCode } from "./lib/pc-code.mjs"
import { loadPcReference } from "./lib/pc-reference.mjs"

export const CSV_PATH = resolve(REPO_ROOT, "data/india/affidavit-review.csv")
export const TABLE = "in_mp_affidavits"

export const COLUMNS = [
  "election", "pc_code", "myneta_candidate_id", "state", "constituency",
  "mp_name_source", "mp_name_roster", "source_party", "roster_party",
  "resolution", "rationale", "reviewed_by",
]

/** Resolutions that clear needs_review. `reject` and `UNRESOLVED` do not. */
const APPLIED = new Set(["accept", "map_to"])

/** Minimal CSV reader: no embedded newlines; quoted fields may hold commas.
 *  Identical to load-aliases.mjs — the committed review files are written by
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

/**
 * "accept" | "reject" | "UNRESOLVED" | "map_to:SHSUBT" → a structured decision,
 * or null when the string is not a permitted resolution. `map_to` with no
 * abbreviation is not a decision, so it is rejected here rather than silently
 * clearing needs_review and changing nothing.
 */
export function parseResolution(s) {
  const raw = String(s ?? "").trim()
  if (raw === "accept") return { kind: "accept", party_abbr: null }
  if (raw === "reject") return { kind: "reject", party_abbr: null }
  if (raw === "UNRESOLVED") return { kind: "UNRESOLVED", party_abbr: null }
  if (raw.startsWith("map_to:")) {
    const abbr = raw.slice("map_to:".length).trim()
    return abbr ? { kind: "map_to", party_abbr: abbr } : null
  }
  return null
}

/** Everything a resolution changes on the stored row, and nothing else. */
export function decisionPatch(decision, now) {
  if (!APPLIED.has(decision.kind)) return null
  const patch = { needs_review: false, match_method: "manual_reviewed", updated_at: now }
  if (decision.party_abbr) patch.party_abbr = decision.party_abbr
  return patch
}

/**
 * Row-level validation that needs no database. `apply` turns on the checks
 * that only matter when something is about to be written — chiefly the
 * reviewed_by sign-off, which the committed file deliberately ships without.
 *
 * Returns { rows, bad } where rows carry their parsed decision.
 */
export function validate(rows, { ref, apply }) {
  const bad = []
  const ok = []
  const seenPc = new Map()
  const seenKey = new Map()

  for (const [i, r] of rows.entries()) {
    const at = `row ${i + 2}`
    const label = `${r.pc_code ?? "?"} ${r.mp_name_source ?? ""}`.trim()
    const reject = problem => bad.push({ ...r, at, problem })

    if (!r.election) { reject("missing election"); continue }
    if (!/^\d+$/.test(String(r.myneta_candidate_id ?? ""))) {
      reject(`myneta_candidate_id '${r.myneta_candidate_id}' is not an integer`); continue
    }
    if (!r.rationale) { reject("no rationale — a decision with no evidence is not a decision"); continue }

    const decision = parseResolution(r.resolution)
    if (!decision) { reject(`bad resolution '${r.resolution}'`); continue }

    try {
      parsePcCode(r.pc_code)
    } catch {
      reject(`malformed pc_code '${r.pc_code}'`); continue
    }
    if (!ref.byCode.has(r.pc_code)) {
      reject(`pc_code ${r.pc_code} not in the 543-seat reference`); continue
    }

    const key = `${r.myneta_candidate_id}${r.election}`
    if (seenKey.has(key)) { reject(`duplicate (myneta_candidate_id, election) — also ${seenKey.get(key)}`); continue }
    seenKey.set(key, at)
    if (seenPc.has(r.pc_code)) { reject(`duplicate pc_code ${r.pc_code} — also ${seenPc.get(r.pc_code)}`); continue }
    seenPc.set(r.pc_code, at)

    // The sign-off. Only blocks the rows that would actually be written, so a
    // file that still has open UNRESOLVED questions can carry the decided rows.
    if (apply && APPLIED.has(decision.kind) && !r.reviewed_by) {
      reject(`resolution '${r.resolution}' without reviewed_by — refusing to apply an unsigned decision`)
      continue
    }

    ok.push({ ...r, decision, label, myneta_candidate_id: Number(r.myneta_candidate_id) })
  }
  return { rows: ok, bad }
}

/**
 * Merge the decided rows onto the rows currently in the table.
 *
 * Whole-row payloads (see the header note), `id` dropped so the bigserial is
 * never rewritten. Rows the CSV names but the table does not have are a hard
 * error: the review file must describe reality.
 */
export function planWrites(decided, existing, now) {
  const byKey = new Map(existing.map(e => [`${e.myneta_candidate_id}${e.election}`, e]))
  const holder = new Map()   // electionpc_code → myneta_candidate_id already on that seat
  for (const e of existing) {
    if (e.pc_code) holder.set(`${e.election}${e.pc_code}`, e.myneta_candidate_id)
  }

  const writes = []
  const problems = []
  for (const r of decided) {
    const patch = decisionPatch(r.decision, now)
    if (!patch) continue
    const cur = byKey.get(`${r.myneta_candidate_id}${r.election}`)
    if (!cur) {
      problems.push({ ...r, problem: `no ${TABLE} row for myneta_candidate_id ${r.myneta_candidate_id} / ${r.election}` })
      continue
    }
    // in_mp_affidavits_one_winner_per_pc: one winner per (election, pc_code).
    const occupant = holder.get(`${r.election}${r.pc_code}`)
    if (occupant != null && occupant !== r.myneta_candidate_id) {
      problems.push({ ...r, problem: `pc_code ${r.pc_code} already held by myneta_candidate_id ${occupant} for ${r.election}` })
      continue
    }
    if (cur.pc_code && cur.pc_code !== r.pc_code) {
      problems.push({ ...r, problem: `stored pc_code ${cur.pc_code} disagrees with the review file's ${r.pc_code}` })
      continue
    }
    const { id: _drop, ...row } = cur
    writes.push({ ...row, pc_code: r.pc_code, ...patch })
  }
  return { writes, problems }
}

async function main() {
  const csvPath = opt("csv") ? resolve(process.cwd(), opt("csv")) : CSV_PATH
  const apply = banner("load-affidavit-review", { source: csvPath, table: TABLE })
  const sink = openSink({ loader: "load-affidavit-review", apply })

  const rows = readCsv(csvPath)
  sink.note(`${rows.length} committed review decision(s)`)

  const ref = await loadPcReference(sink)
  if (!ref) throw new Error("no 543-seat reference available; cannot validate pc_codes")

  const { rows: decided, bad } = validate(rows, { ref, apply })
  if (bad.length) {
    sink.review("rejected-review-rows", bad)
    for (const b of bad) sink.warn(`${b.at} (${b.pc_code ?? "?"}) — ${b.problem}`)
    throw new Error(`${bad.length} row(s) failed validation; nothing written`)
  }

  for (const kind of ["accept", "map_to", "reject", "UNRESOLVED"]) {
    const n = decided.filter(r => r.decision.kind === kind).length
    if (n) sink.count(`resolution=${kind}`, n)
  }
  const unsigned = decided.filter(r => APPLIED.has(r.decision.kind) && !r.reviewed_by)
  if (unsigned.length) {
    sink.warn(`${unsigned.length} decided row(s) still have an empty reviewed_by — ` +
      `--apply will refuse until a human signs them off`)
  }
  const open = decided.filter(r => r.decision.kind === "UNRESOLVED")
  if (open.length) {
    sink.review("still-unresolved", open.map(r => ({ pc_code: r.pc_code, mp: r.mp_name_source, rationale: r.rationale })))
    sink.warn(`${open.length} row(s) are UNRESOLVED and stay private`)
  }

  const existing = await sink.select(TABLE, { columns: "*" })
  if (!existing.length) {
    sink.warn(`could not read ${TABLE} — reporting the decisions only, nothing to merge onto`)
    sink.review("would-clear-needs-review", decided
      .filter(r => APPLIED.has(r.decision.kind))
      .map(r => ({
        pc_code: r.pc_code, myneta_candidate_id: r.myneta_candidate_id,
        mp: r.mp_name_source, resolution: r.resolution, reviewed_by: r.reviewed_by ?? "",
      })))
    sink.finish({ source: csvPath, merged: false })
    return
  }

  const now = new Date().toISOString()
  const { writes, problems } = planWrites(decided, existing, now)
  if (problems.length) {
    sink.review("unwritable-review-rows", problems)
    for (const p of problems) sink.warn(`${p.pc_code} — ${p.problem}`)
    throw new Error(`${problems.length} row(s) cannot be applied safely; nothing written`)
  }

  sink.count("rows whose needs_review would be cleared",
    writes.filter(w => existing.find(e => e.myneta_candidate_id === w.myneta_candidate_id)?.needs_review).length)
  sink.count("rows whose party_abbr would be rewritten",
    decided.filter(r => r.decision.party_abbr).length)
  sink.count(`${TABLE} rows still needs_review after this run`,
    existing.filter(e => e.needs_review).length - writes.length)

  await sink.upsert(TABLE, writes, { conflict: ["myneta_candidate_id", "election"], batch: 100 })
  sink.finish({ source: csvPath, merged: true })
}

run(main, import.meta.url)
