/**
 * Seed Hyderabad (GHMC) elected representatives into Supabase.
 * Inserts: 15 MLAs (Telangana 2023) + 150 corporators (GHMC 2020, historical)
 *
 * All rows have city_id='hyderabad' — zero impact on Bengaluru data.
 *
 * Prerequisites:
 *   data/hyderabad/hyderabad-mlas.json       (from seed-hyderabad-mlas.py)
 *   data/hyderabad/ghmc-corporators.json     (from scrape-ghmc-corporators.py)
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-ghmc-elected-reps.mjs
 *   Or with .env.local:
 *   node -r dotenv/config scripts/seed-ghmc-elected-reps.mjs dotenv_config_path=apps/web/.env.local
 */

import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, "..", "data", "hyderabad")

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("ERROR: Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars")
  process.exit(1)
}

const headers = {
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates",
}

async function upsert(table, rows) {
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=role,constituency,city_id`, {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`ERROR upserting to ${table} batch ${i}-${i+BATCH}:`, err)
      throw new Error(err)
    }
    inserted += batch.length
    process.stdout.write(`  ${table}: ${inserted}/${rows.length}\r`)
  }
  console.log(`  ${table}: ${inserted} rows upserted`)
}

async function main() {
  // ── Load data ─────────────────────────────────────────────────────────────
  const mlas = JSON.parse(readFileSync(join(DATA_DIR, "hyderabad-mlas.json"), "utf8"))
  const corporators = JSON.parse(readFileSync(join(DATA_DIR, "ghmc-corporators.json"), "utf8"))

  console.log(`Loaded: ${mlas.length} MLAs, ${corporators.length} corporators`)

  // ── Confirm city_id safety ────────────────────────────────────────────────
  const badMla = mlas.find(m => m.city_id !== "hyderabad")
  const badCorp = corporators.find(c => c.city_id !== "hyderabad")
  if (badMla || badCorp) {
    console.error("ERROR: Found non-hyderabad city_id — aborting for safety")
    process.exit(1)
  }

  // ── Clear existing Hyderabad elected_reps (to allow re-seeding) ───────────
  console.log("Clearing existing hyderabad elected_reps...")
  const delRes = await fetch(`${SUPABASE_URL}/rest/v1/elected_reps?city_id=eq.hyderabad`, {
    method: "DELETE",
    headers: { ...headers, "Prefer": "return=minimal" },
  })
  if (!delRes.ok) {
    const err = await delRes.text()
    console.error("ERROR deleting:", err)
    // Non-fatal if table doesn't have city_id — continue
  } else {
    console.log("  Cleared existing hyderabad rows")
  }

  // ── Build insert rows ─────────────────────────────────────────────────────
  const mlaRows = mlas.map(m => ({
    role:               "MLA",
    constituency:       m.constituency,
    city_id:            "hyderabad",
    name:               m.name,
    party:              m.party,
    criminal_cases:     m.criminal_cases ?? null,
    elected_since:      m.elected_since ?? null,
    phone:              m.phone ?? null,
    photo_url:          m.photo_url ?? null,
    profile_url:        m.profile_url ?? null,
    age:                m.age ?? null,
    profession:         m.profession ?? null,
    education:          m.education ?? null,
    data_source:        m.data_source ?? "eci-results-2023",
    notes:              m.notes ?? null,
  }))

  const corpRows = corporators.map(c => ({
    role:               "CORPORATOR",
    constituency:       c.constituency ?? `Ward ${c.ward_no} ${c.ward_name}`,
    city_id:            "hyderabad",
    name:               c.name,
    party:              c.party ?? null,
    criminal_cases:     null,
    elected_since:      "2020-12-01",
    phone:              null,
    photo_url:          null,
    profile_url:        null,
    age:                null,
    profession:         null,
    education:          null,
    data_source:        "wikipedia-2020-ghmc-election",
    notes:              c.notes ?? "2020 GHMC election result. No current corporator - GHMC under administrator rule since Feb 2026.",
  }))

  console.log(`\nInserting ${mlaRows.length} MLAs...`)
  await upsert("elected_reps", mlaRows)

  console.log(`Inserting ${corpRows.length} corporators...`)
  await upsert("elected_reps", corpRows)

  console.log("\nDone! Summary:")
  console.log(`  MLAs:        ${mlaRows.length}`)
  console.log(`  Corporators: ${corpRows.length}`)
  console.log(`  Total:       ${mlaRows.length + corpRows.length}`)
  console.log("\nVerify in Supabase:")
  console.log(`  SELECT role, COUNT(*) FROM elected_reps WHERE city_id='hyderabad' GROUP BY role;`)
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
