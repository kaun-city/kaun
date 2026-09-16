#!/usr/bin/env node
/**
 * load-ward-committee-meetings.mjs — ward_committee_meetings from opencity.in's
 * "BBMP Ward Committee Meetings Aggregate (2020-22)".
 *
 * Usage:
 *   node scripts/load-ward-committee-meetings.mjs            # dry run: diff against the table
 *   node scripts/load-ward-committee-meetings.mjs --apply    # writes the differences
 * Env (only --apply needs credentials):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * The table was first loaded by hand; this is the reproducible version, and
 * it exists because the source file is not safe to load naively.
 *
 * WHAT THE SOURCE FILE ACTUALLY CONTAINS (checked 2026-09-16)
 *   - Keys are BBMP's 198-ward numbers (2010 delimitation), not DataMeet-243.
 *     No surface may read them by a 243 number; see
 *     apps/web/lib/ward-data-quality.ts.
 *   - 198 rows but 196 wards. Two rows are misfiled copies: "181 Subhash
 *     Nagar, 0" and "145 Chalavadipalya, 0". Both wards also appear under
 *     their own numbers (95 with 15 meetings, 138 with 37), and 181 and 145
 *     belong to Kumaraswamy Layout and Hombegowda Nagar. A last-write-wins
 *     upsert would give those two wards 0 meetings, which the ward headline
 *     reads as "No ward committee meetings recorded".
 *   - Wards 64 (Rajamahal Guttahalli) and 104 (Govindaraja Nagar) have no row.
 *     They are not written: absent is unknown, never 0.
 *   - A second pair of columns holds per-constituency totals. They equal the
 *     sum of the ward rows, which makes them a checksum on the parse.
 *
 * NO DENOMINATOR
 *   The file gives a count per ward "between 2020 and 2022" and no dates, so
 *   there is no number of meetings a ward "could" have held. The Karnataka
 *   Municipal Corporations (Ward Committee) Rules, 2016, r.5 ask for a
 *   meeting every month and allow more on requisition or urgency — a floor,
 *   not a ceiling. The old "out of a possible ~48" line had no basis (and
 *   six wards recorded more than 48).
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseCsv } from "./lib/parsers.mjs"
import { createRest } from "./lib/rest.mjs"
import { flag, run } from "./india/lib/cli.mjs"

export const SOURCE_URL =
  "https://data.opencity.in/dataset/4bf0928b-ab6b-4a13-8d24-53b739e1cdc3/resource/18e0e8cd-54ec-4be7-9aa6-a40ed825e4b7/download/31537421-953a-484b-9d4c-8060ca87e923.csv"
export const PERIOD = "2020-2022"
export const DATA_SOURCE = "opencity.in"
export const BBMP_WARDS = 198

const ARTIFACT = resolve(dirname(fileURLToPath(import.meta.url)), "../.artifacts/ward-committee-meetings.dry-run.json")

/** "PULAKESHI NAGAR (SC)" -> "PULAKESHI NAGAR". Reservation labels are not carried (they are unreliable everywhere). */
export function normalizeConstituency(s) {
  return String(s ?? "").replace(/\s*\((?:SC|ST)\)\s*$/i, "").replace(/\s+/g, " ").trim()
}

const nameKey = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * Parse the opencity CSV into rows that are safe to load.
 * Returns { rows, dropped, missing, problems }; any problem means do not load.
 */
export function parseWardCommitteeCsv(text) {
  const problems = []
  const table = parseCsv(String(text).replace(/^﻿/, ""))
  const [header = [], ...body] = table
  const expected = [/^ward\s*#$/i, /^ward name$/i, /^constituency$/i, /^meeting count$/i]
  if (!expected.every((re, i) => re.test(header[i] ?? ""))) {
    return { rows: [], dropped: [], missing: [], problems: [`unexpected header: ${header.join(",")}`] }
  }

  const parsed = []
  const totals = new Map()
  for (const [i, r] of body.entries()) {
    const line = i + 2
    if (r[4]) {
      if (!/^\d+$/.test(r[5] ?? "")) problems.push(`line ${line}: constituency total "${r[5]}" is not a count`)
      else totals.set(normalizeConstituency(r[4]), Number(r[5]))
    }
    if (!r[0]) continue
    const ward_no = /^\d+$/.test(r[0]) ? Number(r[0]) : NaN
    if (!(ward_no >= 1 && ward_no <= BBMP_WARDS)) { problems.push(`line ${line}: ward "${r[0]}" is not 1-${BBMP_WARDS}`); continue }
    // A blank count is missing data, not zero.
    if (!/^\d+$/.test(r[3] ?? "")) { problems.push(`line ${line}: ward ${ward_no} count "${r[3] ?? ""}" is not a whole number`); continue }
    if (!r[1]) { problems.push(`line ${line}: ward ${ward_no} has no name`); continue }
    parsed.push({
      line,
      ward_no,
      ward_name: r[1],
      assembly_constituency: normalizeConstituency(r[2]) || null,
      meetings_count: Number(r[3]),
    })
  }

  // Checksum: the file's own constituency totals against its ward rows.
  const sums = new Map()
  for (const p of parsed) sums.set(p.assembly_constituency, (sums.get(p.assembly_constituency) ?? 0) + p.meetings_count)
  for (const [ac, total] of totals) {
    if (sums.get(ac) !== total) problems.push(`constituency ${ac}: file total ${total}, ward rows sum to ${sums.get(ac) ?? 0}`)
  }

  // Duplicate ward numbers. A row whose ward name also sits alone under a
  // different number is a misfiled copy; drop it. Anything else is ambiguous.
  const byNo = Map.groupBy(parsed, p => p.ward_no)
  const soleNumberOf = new Map()
  for (const [no, group] of byNo) if (group.length === 1) soleNumberOf.set(nameKey(group[0].ward_name), no)

  const rows = []
  const dropped = []
  for (const [no, group] of [...byNo].sort((a, b) => a[0] - b[0])) {
    if (group.length === 1) { rows.push(group[0]); continue }
    const misfiled = group.filter(p => {
      const home = soleNumberOf.get(nameKey(p.ward_name))
      return home !== undefined && home !== no
    })
    const kept = group.filter(p => !misfiled.includes(p))
    if (kept.length !== 1) {
      problems.push(`ward ${no}: ${group.length} rows (${group.map(p => p.ward_name).join(" / ")}) and no way to tell which is right`)
      continue
    }
    rows.push(kept[0])
    for (const p of misfiled) {
      dropped.push({ ...p, reason: `misfiled copy of ward ${soleNumberOf.get(nameKey(p.ward_name))} (${p.ward_name}); ward ${no} is ${kept[0].ward_name}` })
    }
  }

  const present = new Set(rows.map(r => r.ward_no))
  const missing = Array.from({ length: BBMP_WARDS }, (_, i) => i + 1).filter(n => !present.has(n))
  return { rows: rows.map(({ line, ...r }) => r), dropped, missing, problems }
}

/** Differences between the parsed file and the table. Rows the file does not support are reported, never deleted silently. */
export function planCommitteeChanges(rows, current, period = PERIOD) {
  const have = new Map(current.filter(c => c.period === period).map(c => [c.ward_no, c]))
  const upserts = []
  for (const r of rows) {
    const c = have.get(r.ward_no)
    const next = { ...r, period, data_source: DATA_SOURCE }
    if (!c) { upserts.push({ action: "insert", ...next }); continue }
    const changed = ["ward_name", "assembly_constituency", "meetings_count"].filter(k => c[k] !== r[k])
    if (changed.length) upserts.push({ action: "update", changed, before: Object.fromEntries(changed.map(k => [k, c[k]])), ...next })
  }
  const inFile = new Set(rows.map(r => r.ward_no))
  const unsupported = [...have.values()].filter(c => !inFile.has(c.ward_no))
  return { upserts, unsupported }
}

async function main() {
  const apply = flag("apply")
  console.log(`\nload-ward-committee-meetings — ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`)
  const rest = createRest()
  if (apply && !rest.canWrite) throw new Error("--apply needs SUPABASE_SERVICE_KEY")

  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`source download failed: HTTP ${res.status}`)
  const { rows, dropped, missing, problems } = parseWardCommitteeCsv(await res.text())

  console.log(`  source rows kept: ${rows.length}`)
  for (const d of dropped) console.log(`  dropped line ${d.line}: ${d.reason}`)
  console.log(`  wards with no row in the source (not written): ${missing.join(", ") || "none"}`)
  if (problems.length) {
    for (const p of problems) console.log(`  ! ${p}`)
    throw new Error(`${problems.length} problem(s) in the source file; nothing planned`)
  }

  const current = await rest.selectAll("ward_committee_meetings", {
    select: "ward_no,ward_name,assembly_constituency,meetings_count,period",
    order: "ward_no.asc,period.asc",
  })
  const { upserts, unsupported } = planCommitteeChanges(rows, current)
  console.log(`  table rows read: ${current.length}`)
  console.log(`  changes: ${upserts.length}`)
  for (const u of upserts) {
    console.log(`    ${u.action} ward ${u.ward_no} ${u.ward_name}: ${u.meetings_count}` +
      (u.before ? ` (was ${JSON.stringify(u.before)})` : ""))
  }
  for (const u of unsupported) console.log(`  ! table has ward ${u.ward_no} (${u.ward_name}) that the source does not support`)

  mkdirSync(dirname(ARTIFACT), { recursive: true })
  writeFileSync(ARTIFACT, JSON.stringify({
    generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry-run", source: SOURCE_URL,
    kept: rows.length, dropped, missing, table_rows: current.length, upserts, unsupported,
  }, null, 2))
  console.log(`  artifact: ${ARTIFACT}`)

  if (!apply || !upserts.length) return
  if (unsupported.length) throw new Error("the table holds rows the source does not support; resolve them by hand first")
  const payload = upserts.map(({ action, changed, before, ...row }) => row)
  await rest.upsert("ward_committee_meetings", payload, "ward_no,period")
  console.log(`  wrote ${payload.length} row(s)`)
}

run(main, import.meta.url)
