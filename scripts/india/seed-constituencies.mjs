#!/usr/bin/env node
/**
 * seed-constituencies.mjs — SKELETON. Populates in_constituencies (543 seats).
 *
 * Usage: node scripts/india/seed-constituencies.mjs [--apply]
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 *
 * Runs once per delimitation, not on a cron. Everything downstream FKs to
 * in_constituencies.pc_code, so this is the first pipeline to land.
 *
 * SOURCES (all already downloaded in india-recon/geo-roster/)
 *   1. DataMeet india_pc_2019_simplified.geojson — 543 features, CC0, the
 *      richest attributes: pc_id, st_code, st_name, pc_no, pc_name,
 *      pc_name_hi, pc_category, wikidata_qid. THE BASE.
 *   2. shijithpk 2024 supplement (Unlicense) — corrected geometry for Assam
 *      (2023 delimitation) and J&K/Ladakh (2022). DataMeet predates both and
 *      has no Ladakh entry at all, while sansad.in's roster does.
 *   3. Delimitation Order 2008 (archive.org mirror) — the ONLY trustworthy
 *      source for reserved_for. DataMeet's pc_category undercounts ST by 2
 *      (45 vs the correct 47) and sansad's categoryCode is worse.
 *
 * TRAPS ALREADY PAID FOR
 *   - pc_no is NOT nationally unique. Key on pc_code (see lib/pc-code.mjs).
 *   - eci.gov.in serves a hard Akamai 403 to non-browser clients; use the
 *     archive.org mirror.
 *   - DataMeet's AC shapefile carries a PC_NO column that is simply wrong.
 *     Do not ingest it here or anywhere.
 *
 * STEPS
 *   1. Read the DataMeet GeoJSON; build one row per feature with
 *      pc_code = pcCode(st_code, pc_no) and pc_name_norm =
 *      normalizeConstituencyName(pc_name).
 *   2. Swap in shijithpk geometry for Assam / J&K / Ladakh, matching on
 *      (state, pc_no) AFTER normalizing state names ("Jammu & Kashmir" vs
 *      "Jammu and Kashmir"). Set geom_source per row so the provenance of a
 *      swapped boundary is visible.
 *   3. Set reserved_for + reserved_source from the Delimitation Order.
 *      Leave both NULL rather than falling back to pc_category — the CHECK
 *      constraint in_constituencies_reserved_has_source enforces that a value
 *      always names its source.
 *   4. Upsert on pc_code. Never TRUNCATE: downstream FKs reference these rows.
 *   5. Assert exactly 543 rows and 36 distinct st_codes before finishing.
 *
 * TODO: implement steps 1-5.
 * TODO: decide where the source files live in-repo (data/india/... mirroring
 *       data/ward-crosswalk/) vs. fetched at run time. See the design doc's
 *       open questions.
 * TODO: publish the resulting 543-row table as an open artifact
 *       (data/india/constituencies.csv + METHODOLOGY.md), same as the ward
 *       crosswalk.
 */
import { pcCode, normalizeConstituencyName } from "./lib/pc-code.mjs"

const APPLY = process.argv.includes("--apply")

const SOURCES = {
  pcBase: "https://raw.githubusercontent.com/datameet/maps/master/parliamentary-constituencies/india_pc_2019_simplified.geojson",
  pc2024: "https://github.com/shijithpk/2024_maps_supplement",
  delimitation: "https://archive.org/details/delimitation-2008",
}

/** States whose geometry must come from the 2024 supplement, not DataMeet. */
const REDELIMITED_STATES = ["Assam", "Jammu and Kashmir", "Ladakh"]

async function main() {
  console.log("seed-constituencies — SKELETON, no extract implemented yet")
  console.log("sources:", SOURCES)
  console.log("geometry overrides required for:", REDELIMITED_STATES.join(", "))
  console.log("key helper check:", pcCode(29, 25), normalizeConstituencyName("BANGALORE CENTRAL"))
  if (APPLY) {
    console.error("\n--apply is not implemented yet; refusing to write.")
    process.exit(1)
  }
}

main().catch(e => { console.error("FAILED:", e); process.exit(1) })
