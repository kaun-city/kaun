#!/usr/bin/env node
/**
 * myneta-affidavits.mjs — SKELETON. Populates in_mp_affidavits.
 *
 * Usage: node scripts/india/myneta-affidavits.mjs [--state <id>] [--apply]
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Static per election (LS2024 does not change until LS2029 apart from
 * bypolls), so this runs on demand, not on a cron.
 *
 * THE JOIN IS THE WHOLE PROBLEM. MyNeta shares no identifier with sansad.in,
 * PRS or eSAKSHI. Its constituency_id is MyNeta-internal — Bangalore Central
 * is MyNeta 185 but ECI PC 25. The permitted resolution path, in order:
 *   1. in_pc_source_aliases (source='myneta', source_key=constituency_id).
 *   2. The structural constraint: for a WINNER, there is exactly one per seat
 *      on each side. Normalize (state, constituency name), require an exact
 *      match plus party agreement against the single sitting in_mps row, and
 *      accept only if exactly one candidate resolves on each side.
 *   3. A human, recorded with match_method='manual_reviewed'.
 * Anything else stays needs_review=true, which the RLS policy
 * in_mp_affidavits_anon_read_matched keeps out of public reads. The
 * one-winner-per-PC partial unique index makes a bad join fail at INSERT.
 * match_method's CHECK list has no fuzzy option — by design.
 *
 * SCRAPE TRAPS ALREADY PAID FOR
 *   - Scrape candidate.php DETAIL pages, never the show_candidates LIST page:
 *     on the list page the winner's assets/liabilities are rendered as an
 *     <img> (image_v2.php), which is anti-scraping, and only for the top row.
 *   - Zero criminal cases produces NO text at all — the whole Crime-O-Meter
 *     widget is omitted rather than showing "0". `extract(...) ?? null` would
 *     mark every clean candidate as unknown. Write an explicit 0 when the page
 *     parsed cleanly; the in_mp_affidavits_cases_explicit CHECK enforces this.
 *   - robots.txt only disallows ?printer=true / ?print=true. Stay off those,
 *     keep 2-3s between requests, send the Kaun UA.
 *
 * STEPS
 *   1. Walk the state index → constituency lists → winner candidate_ids.
 *   2. Fetch each candidate.php detail page; parse name, party, age,
 *      professions, education, assets (whole rupees, lossless), liabilities,
 *      criminal case count + per-case detail, and the "Other Elections" table
 *      → declared_assets_history.
 *   3. Resolve pc_code by the ordered path above; set match_method and
 *      needs_review honestly.
 *   4. Upsert on (myneta_candidate_id, election).
 *   5. Report the unresolved set as proposed alias rows. Do not guess.
 *
 * TODO: implement steps 1-5.
 * TODO: bypolls create new constituency entries on the same site — decide
 *       whether a bypoll winner supersedes the general-election affidavit row
 *       or coexists with it (the one-winner index is per election string).
 */
import { resolvePc } from "./lib/pc-code.mjs"

const APPLY = process.argv.includes("--apply")
const ELECTION = "LokSabha2024"
const BASE = "https://myneta.info/LokSabha2024"

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency; +https://kaun.city)",
}
const REQUEST_DELAY_MS = 2500

/** Permitted match methods, mirroring in_mp_affidavits_match_method_chk.
 *  There is deliberately no fuzzy/similarity option. */
const MATCH_METHODS = ["alias_table", "one_winner_per_pc", "manual_reviewed"]

async function main() {
  console.log("myneta-affidavits — SKELETON, no scrape implemented yet")
  console.log({ ELECTION, BASE, REQUEST_DELAY_MS, MATCH_METHODS })
  console.log("resolver loaded:", typeof resolvePc)
  if (APPLY) {
    console.error("\n--apply is not implemented yet; refusing to write.")
    process.exit(1)
  }
}

main().catch(e => { console.error("FAILED:", e); process.exit(1) })
