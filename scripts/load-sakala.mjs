#!/usr/bin/env node
// load-sakala.mjs — Load committed Sakala JSON artifacts into Supabase.
//
// Companion to `refresh-sakala.mjs --fetch-only`: sakala.kar.nic.in blocks
// GitHub Actions IPs, so the scrape has to run from a residential connection
// and get committed as a data/sakala/*.json artifact. This script does the
// other half — it never talks to sakala.kar.nic.in, only to Supabase, so it
// runs fine in CI.
//
// Usage: node scripts/load-sakala.mjs [--apply] [file ...]
//   (no flags)   dry-run — reads every data/sakala/*.json, prints row
//                counts, does NOT write to Supabase
//   --apply      writes via upsertRows, same conflict key as refresh-sakala.mjs
//   file args    load only the given artifact path(s) instead of the whole
//                data/sakala/ directory
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY   (only required with --apply)

import { readFileSync, readdirSync } from "fs"
import { join } from "path"

const APPLY = process.argv.includes("--apply")
const FILE_ARGS = process.argv.slice(2).filter(a => !a.startsWith("--"))
const DATA_DIR = "data/sakala"
const CONFLICT_COLS = "assembly_name,year,month,department_code"

function artifactPaths() {
  if (FILE_ARGS.length) return FILE_ARGS
  let entries = []
  try {
    entries = readdirSync(DATA_DIR)
  } catch {
    return []
  }
  return entries.filter(f => f.endsWith(".json")).map(f => join(DATA_DIR, f)).sort()
}

function loadArtifact(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"))
  const rows = Array.isArray(raw) ? raw : raw.rows
  if (!Array.isArray(rows)) throw new Error(`${path}: expected a "rows" array`)
  return { path, fetched_at: raw.fetched_at ?? null, year: raw.year ?? null, month: raw.month ?? null, rows }
}

async function main() {
  const paths = artifactPaths()
  if (!paths.length) {
    console.log(`No artifacts found in ${DATA_DIR} (or none passed as args).`)
    return
  }

  const artifacts = paths.map(loadArtifact)
  let total = 0
  for (const a of artifacts) {
    console.log(`  ${a.path}: ${a.rows.length} rows (year=${a.year} month=${a.month} fetched_at=${a.fetched_at})`)
    total += a.rows.length
  }
  console.log(`Total rows across ${artifacts.length} artifact(s): ${total}`)

  if (!APPLY) {
    console.log("\n=== DRY RUN (no writes) === Run with --apply to upsert to Supabase.")
    return
  }

  const { upsertRows } = await import("./lib/db.mjs")
  console.log("\n=== APPLY ===")
  for (const a of artifacts) {
    if (!a.rows.length) continue
    await upsertRows("sakala_performance", a.rows, CONFLICT_COLS)
    console.log(`  Upserted ${a.rows.length} rows from ${a.path}`)
  }
  console.log(`[${new Date().toISOString()}] Sakala load complete. ${total} rows upserted.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
