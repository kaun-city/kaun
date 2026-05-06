#!/usr/bin/env node
/**
 * seed-mla-contacts-ap.mjs — Seed AP Legislative Assembly MLA records into elected_reps.
 *
 * Reads data/ap-mla-2024.json (2024 election results) and upserts each row.
 * Designed to be re-run safely; uses (role, constituency) as the conflict key.
 *
 * The 2024 AP wave (TDP-JSP-BJP NDA alliance) replaced the entire prior YSRCP
 * cohort, so this is the canonical post-2024 dataset for any AP city we add.
 *
 * Source: ECI 2024 AP Vidhan Sabha results + MyNeta affidavits.
 *
 * Run:    node scripts/seed-mla-contacts-ap.mjs
 *         node scripts/seed-mla-contacts-ap.mjs --city=visakhapatnam
 * Env:    SUPABASE_MANAGEMENT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { dbQuery, upsertRows } from "./lib/db.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = join(__dirname, "..", "data", "ap-mla-2024.json")

const args = process.argv.slice(2)
const CITY_FILTER = args.find(a => a.startsWith("--city="))?.split("=")[1] ?? null

const payload = JSON.parse(readFileSync(DATA_PATH, "utf8"))
const allMlas = payload.mlas
const mlas = CITY_FILTER ? allMlas.filter(m => m.city_id === CITY_FILTER) : allMlas

console.log(`AP MLA seed: loaded ${allMlas.length} records, processing ${mlas.length}` +
  (CITY_FILTER ? ` (filtered to city=${CITY_FILTER})` : ""))

if (!mlas.length) {
  console.error("No MLA rows to process — check --city filter or data file.")
  process.exit(1)
}

// Make sure the supporting columns exist (idempotent).
await dbQuery(`ALTER TABLE elected_reps ADD COLUMN IF NOT EXISTS phone TEXT;`)
await dbQuery(`ALTER TABLE elected_reps ADD COLUMN IF NOT EXISTS email TEXT;`)
await dbQuery(`ALTER TABLE elected_reps ADD COLUMN IF NOT EXISTS city_id TEXT;`)
await dbQuery(`ALTER TABLE elected_reps ADD COLUMN IF NOT EXISTS data_source TEXT;`)
// Composite uniqueness so upsert by (role, constituency) is well-defined.
await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS elected_reps_role_constituency_idx
               ON elected_reps (role, constituency);`)

const rows = mlas.map(m => ({
  role: "MLA",
  constituency: m.constituency,
  name: m.name,
  party: m.party,
  elected_since: m.elected_since,
  phone: m.phone ?? null,
  email: m.email ?? null,
  city_id: m.city_id,
  data_source: payload._meta.source,
}))

await upsertRows("elected_reps", rows, "role,constituency")
console.log(`Upserted ${rows.length} MLA rows into elected_reps.`)

const seen = await dbQuery(`
  SELECT city_id, COUNT(*)::int AS n
  FROM elected_reps
  WHERE role = 'MLA' AND city_id IS NOT NULL
  GROUP BY city_id
  ORDER BY city_id;
`)
console.log("MLA counts by city:", seen)
