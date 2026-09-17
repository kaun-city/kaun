#!/usr/bin/env node
// blr-tenders-bids.mjs — Load Vonter's blr-tenders-bids dataset into
// procurement_tenders and procurement_tender_winners.
// Usage: node scripts/adapters/blr-tenders-bids.mjs [--dry-run] [--force] [--file=tenders.parquet]
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
//
// The dataset (https://github.com/Vonter/blr-tenders-bids) is published under
// the Open Database License 1.0: credit Vonter wherever it is used, and offer
// the loaded tables under the same licence. See
// wiki/docs/bengaluru/sources/blr-tenders-bids.md and migration
// 20260921_procurement_tenders.sql.
//
// Each run downloads the whole Parquet file (about 24 MB) and compares its
// generated_at with the loaded snapshot. A newer snapshot replaces both tables
// in one transaction; an unchanged or older one is left alone.
//
// Every run that is current also rematches Kaun's contractors to the awarded
// suppliers by company name (scripts/lib/tender-supplier-matches.mjs) and
// replaces contractor_supplier_matches, so new contractor profiles are picked
// up even when the dataset hasn't changed.

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parquetMetadataAsync, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"
import { indexWinners, matchContractors } from "../lib/tender-supplier-matches.mjs"

export const DATASET_URL = "https://raw.githubusercontent.com/Vonter/blr-tenders-bids/main/data/tenders.parquet"

/** The dataset columns Kaun loads. Contacts, documents and bid groups are left out. */
export const DATASET_COLUMNS = [
  "source", "tender_number", "title", "department", "category", "status", "status_label",
  "procurement_method", "location", "published_at", "closes_at", "awarded_at",
  "estimated_value", "tender_value", "award_amount", "awarded_bidders",
  "is_retendered", "call_number", "notice_id", "tender_id",
]

export const TABLE_COLUMNS = [
  "source", "tender_number", "title", "department", "category", "status", "status_label",
  "procurement_method", "location", "published_at", "closes_at", "awarded_at",
  "estimated_value_inr", "award_amount_inr", "awarded_bidders",
  "is_retendered", "call_number", "notice_id", "tender_id", "dataset_generated_at",
]

const SOURCES = new Set(["kppp", "eproc"])
const STAGING = "public.procurement_tenders_staging"
/** A snapshot with fewer rows than this share of the loaded one is refused without --force. */
export const MIN_ROW_SHARE = 0.9
const STAGE_CHUNK = 500

const text = value => (typeof value === "string" && value.trim() ? value : null)
const timestamp = value => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null)
const integer = value => (value == null ? null : Number(value))
const rupees = value => (Number.isFinite(value) ? Math.round(value * 100) / 100 : null)

/** One dataset record as a procurement_tenders row. */
export function toRow(record, generatedAt) {
  return {
    source: record.source,
    tender_number: record.tender_number,
    title: text(record.title),
    department: text(record.department),
    category: text(record.category),
    status: text(record.status),
    status_label: text(record.status_label),
    procurement_method: text(record.procurement_method),
    location: text(record.location),
    published_at: timestamp(record.published_at),
    closes_at: timestamp(record.closes_at),
    awarded_at: timestamp(record.awarded_at),
    estimated_value_inr: rupees(record.estimated_value ?? record.tender_value),
    award_amount_inr: rupees(record.award_amount),
    awarded_bidders: [...new Set((record.awarded_bidders ?? []).map(name => name?.trim()).filter(Boolean))],
    is_retendered: typeof record.is_retendered === "boolean" ? record.is_retendered : null,
    call_number: integer(record.call_number),
    notice_id: integer(record.notice_id),
    tender_id: integer(record.tender_id),
    dataset_generated_at: generatedAt,
  }
}

/**
 * Read the Parquet file: its generated_at and every row, mapped. Throws on
 * anything that would make a partial or ambiguous load.
 */
export async function readDataset(file) {
  const metadata = await parquetMetadataAsync(file)
  const generated = metadata.key_value_metadata?.find(entry => entry.key === "generated_at")?.value
  const generatedAt = generated ? new Date(generated) : null
  if (!generatedAt || Number.isNaN(generatedAt.getTime())) throw new Error("the dataset has no readable generated_at metadata")

  const records = await parquetReadObjects({ file, metadata, compressors, columns: DATASET_COLUMNS })
  if (records.length !== Number(metadata.num_rows)) {
    throw new Error(`read ${records.length} of ${metadata.num_rows} rows`)
  }
  return { generatedAt: generatedAt.toISOString(), rows: toRows(records, generatedAt.toISOString()) }
}

/** Map every record, refusing unknown sources, missing tender numbers and duplicate tenders. */
export function toRows(records, generatedAt) {
  const keys = new Set()
  return records.map(record => {
    if (!SOURCES.has(record.source)) throw new Error(`unknown source ${JSON.stringify(record.source)}`)
    if (!text(record.tender_number)) throw new Error(`a ${record.source} row has no tender_number`)
    const key = JSON.stringify([record.source, record.tender_number])
    if (keys.has(key)) throw new Error(`duplicate tender ${record.source} ${record.tender_number}`)
    keys.add(key)
    return toRow(record, generatedAt)
  })
}

/**
 * Whether to replace the loaded snapshot. `current` says whether the dataset
 * is, or after this run will be, the loaded snapshot: contractor matches are
 * only rebuilt from a current one.
 * @param dataset {generatedAt: ISO string, count}
 * @param live    {generatedAt: ISO string | null, count}
 */
export function planLoad(dataset, live, { force = false } = {}) {
  if (dataset.count === 0) throw new Error("the dataset is empty")
  if (force) return { load: true, current: true, reason: `forced load of the ${dataset.generatedAt} snapshot` }
  if (!live.generatedAt) return { load: true, current: true, reason: `first load: the ${dataset.generatedAt} snapshot` }

  const datasetTime = Date.parse(dataset.generatedAt)
  const liveTime = Date.parse(live.generatedAt)
  if (datasetTime < liveTime) {
    return { load: false, current: false, reason: `the dataset (${dataset.generatedAt}) is older than the loaded snapshot (${live.generatedAt}); nothing to do` }
  }
  if (datasetTime === liveTime && dataset.count === live.count) {
    return { load: false, current: true, reason: `unchanged since the ${live.generatedAt} snapshot; nothing to do` }
  }
  if (dataset.count < live.count * MIN_ROW_SHARE) {
    throw new Error(`the dataset has ${dataset.count} rows, fewer than ${MIN_ROW_SHARE * 100}% of the ${live.count} loaded; not replacing them (use --force if this is expected)`)
  }
  return { load: true, current: true, reason: `replacing the ${live.generatedAt} snapshot with ${dataset.generatedAt}` }
}

/** Dollar-quote a SQL literal with a tag the text cannot contain. */
export function dollarQuote(value) {
  let tag = "tenders"
  while (value.includes(`$${tag}$`)) tag += "x"
  return `$${tag}$${value}$${tag}$`
}

export function stageSql(rows) {
  return `INSERT INTO ${STAGING} (row) SELECT jsonb_array_elements(${dollarQuote(JSON.stringify(rows))}::jsonb);`
}

/**
 * Replace both tables from the staged rows in one transaction, so a failure
 * leaves the previous snapshot in place.
 */
export function swapSql() {
  const cols = TABLE_COLUMNS.map(column => `"${column}"`)
  return [
    "BEGIN;",
    "DELETE FROM public.procurement_tender_winners;",
    "DELETE FROM public.procurement_tenders;",
    `INSERT INTO public.procurement_tenders (${cols.join(", ")})`,
    `  SELECT ${cols.map(col => `r.${col}`).join(", ")}`,
    `  FROM ${STAGING} s, jsonb_populate_record(NULL::public.procurement_tenders, s.row) r;`,
    "INSERT INTO public.procurement_tender_winners (source, tender_number, position, supplier_name, supplier_key)",
    "  SELECT t.source, t.tender_number, w.position, w.supplier_name,",
    "         lower(regexp_replace(w.supplier_name, '[^[:alnum:]]+', '', 'g'))",
    "  FROM public.procurement_tenders t",
    "  CROSS JOIN LATERAL unnest(t.awarded_bidders) WITH ORDINALITY AS w(supplier_name, position);",
    "COMMIT;",
  ].join("\n")
}

const countOf = async (query, sql) => Number((await query(sql))[0]?.n)

/**
 * Replace every contractor match in one transaction.
 * matches: contractor_supplier_matches rows from matchContractors().
 */
export function matchesSql(matches) {
  return [
    "BEGIN;",
    "DELETE FROM public.contractor_supplier_matches;",
    "INSERT INTO public.contractor_supplier_matches (contractor_profile_id, supplier_key, matched_name, match_kind)",
    "  SELECT m.contractor_profile_id, m.supplier_key, m.matched_name, m.match_kind",
    `  FROM jsonb_to_recordset(${dollarQuote(JSON.stringify(matches))}::jsonb)`,
    "    AS m(contractor_profile_id integer, supplier_key text, matched_name text, match_kind text);",
    "COMMIT;",
  ].join("\n")
}

/** Kaun's contractors, matched against the dataset's winners, and the matches written. */
export async function rematchContractors(query, rows, { dryRun = false } = {}) {
  const [ready] = await query("SELECT to_regclass('public.contractor_supplier_matches') IS NOT NULL AS ready;")
  if (!ready?.ready) throw new Error("public.contractor_supplier_matches does not exist; apply migration 20260922_contractor_tender_wins.sql first")
  const profiles = await query("SELECT id, canonical_name, aliases FROM public.contractor_profiles WHERE city_id = 'bengaluru';")
  const matches = matchContractors(profiles, indexWinners(rows))
  const contractors = new Set(matches.map(match => match.contractor_profile_id)).size
  console.log(`Contractor matches: ${contractors} of ${profiles.length} contractors, through ${matches.length} supplier names.`)
  if (dryRun) return matches
  // Matching nothing at all means a broken input, not a week without matches.
  if (profiles.length && !matches.length) throw new Error("no contractor matched any awarded supplier; contractor matches left unchanged")

  await query(matchesSql(matches))
  const live = await countOf(query, "SELECT count(*)::int AS n FROM public.contractor_supplier_matches;")
  if (live !== matches.length) throw new Error(`expected ${matches.length} contractor matches after the swap, found ${live}`)
  return matches
}

/** The loaded snapshot: row count and generated_at. */
export async function liveState(query) {
  const [ready] = await query("SELECT to_regclass('public.procurement_tenders') IS NOT NULL AS ready;")
  if (!ready?.ready) throw new Error("public.procurement_tenders does not exist; apply migration 20260921_procurement_tenders.sql first")
  const [state] = await query("SELECT count(*)::int AS n, extract(epoch FROM max(dataset_generated_at))::float8 AS generated_epoch FROM public.procurement_tenders;")
  const epoch = state?.generated_epoch
  return {
    count: Number(state?.n ?? 0),
    generatedAt: epoch == null ? null : new Date(Math.round(Number(epoch) * 1000)).toISOString(),
  }
}

async function queryWithRetry(query, sql) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await query(sql)
    } catch (error) {
      // Only a rate-limited request is known not to have run; anything else
      // could have staged rows, so it fails the run instead.
      if (attempt >= 5 || !/failed: 429\b/.test(String(error?.message))) throw error
      await new Promise(resolve => setTimeout(resolve, attempt * 5000))
    }
  }
}

/** Stage every row, swap them in, and check the counts. */
export async function replaceRows(query, rows) {
  await query(`TRUNCATE ${STAGING};`)
  for (let i = 0; i < rows.length; i += STAGE_CHUNK) {
    await queryWithRetry(query, stageSql(rows.slice(i, i + STAGE_CHUNK)))
    if ((i / STAGE_CHUNK) % 20 === 0) console.log(`  staged ${Math.min(i + STAGE_CHUNK, rows.length)} of ${rows.length}`)
  }
  const staged = await countOf(query, `SELECT count(*)::int AS n FROM ${STAGING};`)
  if (staged !== rows.length) throw new Error(`staged ${staged} of ${rows.length} rows; the loaded snapshot is unchanged`)

  console.log(`  swapping ${rows.length} rows in one transaction...`)
  await query(swapSql())
  const winners = rows.reduce((sum, row) => sum + row.awarded_bidders.length, 0)
  const liveTenders = await countOf(query, "SELECT count(*)::int AS n FROM public.procurement_tenders;")
  const liveWinners = await countOf(query, "SELECT count(*)::int AS n FROM public.procurement_tender_winners;")
  if (liveTenders !== rows.length || liveWinners !== winners) {
    throw new Error(`expected ${rows.length} tenders and ${winners} winners after the swap, found ${liveTenders} and ${liveWinners}`)
  }
  await query(`TRUNCATE ${STAGING};`)
}

function summarize({ generatedAt, rows }) {
  console.log(`blr-tenders-bids snapshot generated ${generatedAt}: ${rows.length} tenders`)
  for (const source of SOURCES) {
    const of = rows.filter(row => row.source === source)
    const dates = of.map(row => row.published_at).filter(Boolean).sort()
    const winners = of.filter(row => row.awarded_bidders.length).length
    const amounts = of.filter(row => row.award_amount_inr != null).length
    console.log(`  ${source.padEnd(5)} ${String(of.length).padStart(7)} tenders, ${dates[0]?.slice(0, 10)} to ${dates.at(-1)?.slice(0, 10)}; ${winners} with awarded suppliers, ${amounts} with an award amount`)
  }
}

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`)
  const buffer = await res.arrayBuffer()
  const expected = Number(res.headers.get("content-length"))
  if (expected && buffer.byteLength !== expected) throw new Error(`downloaded ${buffer.byteLength} of ${expected} bytes`)
  return buffer
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const force = args.includes("--force")
  const path = args.find(arg => arg.startsWith("--file="))?.slice(7)

  const file = path
    ? await readFile(path).then(buffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
    : await download(DATASET_URL)
  const dataset = await readDataset(file)
  summarize(dataset)

  if (dryRun && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)) {
    console.log("Dry run without a database: not compared with the loaded snapshot.")
    return
  }
  // db.mjs exits at import when its env is missing, so it loads only when needed.
  const { dbQuery } = await import("../lib/db.mjs")
  const live = await liveState(dbQuery)
  const plan = planLoad({ generatedAt: dataset.generatedAt, count: dataset.rows.length }, live, { force })
  console.log(`Loaded: ${live.count} tenders${live.generatedAt ? ` from the ${live.generatedAt} snapshot` : ""}. ${plan.reason}`)
  if (!plan.current) return
  if (dryRun) {
    await rematchContractors(dbQuery, dataset.rows, { dryRun })
    console.log("Dry run: nothing written.")
    return
  }
  if (plan.load) {
    await replaceRows(dbQuery, dataset.rows)
    console.log(`Loaded ${dataset.rows.length} tenders from the ${dataset.generatedAt} snapshot.`)
  }
  await rematchContractors(dbQuery, dataset.rows)
  console.log("Done.")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("Fatal:", error); process.exit(1) })
}
