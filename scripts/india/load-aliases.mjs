#!/usr/bin/env node
/**
 * load-aliases.mjs — load the human-reviewed constituency alias rows into
 * in_pc_source_aliases from the committed data/india/pc-source-aliases.csv.
 *
 * The review flow: a loader that cannot resolve a source's constituency writes
 * a proposed alias row (blank pc_code/method/reviewed_by) to
 * .artifacts/india/<loader>.review-alias-candidates.csv. A human fills the
 * blanks, the row is committed to data/india/pc-source-aliases.csv, and this
 * loader is the only path from that file into the database. Every committed
 * row must therefore already carry a decision — this loader validates, it
 * never decides.
 *
 * Validation before any write:
 *   - method is one of the table's allowed values (the schema also enforces
 *     this; failing here keeps a bad row out of the batch entirely)
 *   - manual_reviewed rows carry reviewed_by (mirrors the CHECK)
 *   - pc_code exists in the crosswalk artifact AND, when a database is
 *     configured, in in_constituencies (the FK would reject it anyway; the
 *     pre-check turns a batch failure into a named row failure)
 *
 * Usage: node scripts/india/load-aliases.mjs [--apply]
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { banner, run } from "./lib/cli.mjs"
import { openSink, REPO_ROOT } from "./lib/sink.mjs"
import { parsePcCode } from "./lib/pc-code.mjs"
import { loadPcReference } from "./lib/pc-reference.mjs"

export const CSV_PATH = resolve(REPO_ROOT, "data/india/pc-source-aliases.csv")
export const METHODS = new Set(["official_lookup", "exact_normalized", "manual_reviewed"])

/** Minimal CSV reader: no embedded newlines; quoted fields may hold commas. */
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

/** Every row that would block a write, keyed to the reason. Pure — no I/O. */
export function validate(rows, ref) {
  const bad = []
  for (const r of rows) {
    if (!r.source || !r.source_key) bad.push({ ...r, problem: "missing source/source_key" })
    else if (!METHODS.has(r.method)) bad.push({ ...r, problem: `bad method '${r.method}'` })
    else if (r.method === "manual_reviewed" && !r.reviewed_by) bad.push({ ...r, problem: "manual_reviewed without reviewed_by" })
    else {
      try {
        parsePcCode(r.pc_code)
        if (!ref.byCode.has(r.pc_code)) bad.push({ ...r, problem: `pc_code ${r.pc_code} not in the 543-seat reference` })
      } catch { bad.push({ ...r, problem: `malformed pc_code '${r.pc_code}'` }) }
    }
  }
  return bad
}

async function main() {
  // banner() parses --apply itself (cli's flag() prepends the dashes — a
  // hand-rolled flag("--apply") here once matched "----apply", ran dry, and
  // exited green while writing nothing; tests/india-loaders.test.mjs now
  // pins the parse).
  const apply = banner("load-aliases", { source: CSV_PATH })
  const sink = openSink({ loader: "load-aliases", apply })

  const rows = readCsv(CSV_PATH)
  sink.note(`${rows.length} committed alias row(s)`)

  const ref = await loadPcReference(sink)
  if (!ref) throw new Error("no 543-seat reference available; cannot validate pc_codes")
  const bad = validate(rows, ref)
  if (bad.length) {
    sink.review("rejected-alias-rows", bad)
    for (const b of bad) sink.warn(`${b.source}:${b.source_key} — ${b.problem}`)
    throw new Error(`${bad.length} row(s) failed validation; nothing written`)
  }

  await sink.upsert("in_pc_source_aliases", rows.map(r => ({
    source: r.source,
    source_key: r.source_key,
    source_label: r.source_label,
    st_code: r.st_code ? Number(r.st_code) : null,
    pc_code: r.pc_code,
    method: r.method,
    note: r.note,
    reviewed_by: r.reviewed_by,
  })), { conflict: ["source", "source_key"] })

  sink.finish({ source: CSV_PATH })
}

run(main, import.meta.url)
