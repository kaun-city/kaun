#!/usr/bin/env node
/**
 * esakshi-mplads.mjs — SKELETON. Populates in_mplads_summary.
 *
 * Usage: node scripts/india/esakshi-mplads.mjs [--source esakshi|empoweredindian] [--apply]
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * TWO SOURCES, KEPT SEPARATE ON PURPOSE. in_mplads_summary.source is part of
 * the natural key, so both can coexist per MP and a read path always knows
 * which one it is citing:
 *   esakshi          — MOSPI's own system of record. Authoritative, live, but
 *                      the pre-login surface is AGGREGATE ONLY (allocated,
 *                      expenditure, work counts). No itemized per-work list.
 *   empoweredindian  — unofficial third party with genuine per-work
 *                      granularity. Good UX, no SLA, undocumented provenance.
 *                      Never present it as a primary-source citation.
 *
 * TRAPS ALREADY PAID FOR
 *   - Use https:// (443). Plain http:// on mplads.mospi.gov.in silently times
 *     out and looks exactly like a firewall block. It is not one — eSAKSHI is
 *     reachable from GitHub Actions runners over HTTPS, no proxy needed.
 *   - All endpoints are POST with a JSON body, even the ones that read like
 *     GETs.
 *   - eSAKSHI has its own numeric constituency IDs (166 = BANGALORE RURAL),
 *     unrelated to ECI PC numbers. Resolve through in_pc_source_aliases
 *     (source='esakshi'), never by name.
 *   - The API is undocumented and unversioned with no changelog. Parse
 *     defensively; a shape change will arrive without notice.
 *   - These hosts also expose WRITE endpoints (updateWorkReviewByCitizen,
 *     mailing-list/unsubscribe). This ETL must never call them.
 *
 * STEPS
 *   1. getStateData → states. getConstituencyData per state → constituency IDs.
 *   2. getTilesData per (state, constituency, mp, house) → allocated,
 *      expenditure, works recommended/sanctioned/completed. Amounts arrive as
 *      formatted Indian-grouped strings with paise ("1,15,55,39,16,595.93") —
 *      strip separators, keep the decimals, store as numeric rupees.
 *   3. Resolve pc_code via the alias table; resolve mp_id via in_mps.
 *   4. Upsert on (source, house, term_label, source_mp_key).
 *
 * TODO: implement steps 1-4.
 * TODO: rate limits were never stress-tested (under 10 calls in recon).
 *       Confirm a safe volume before scheduling this daily.
 * TODO: follow-up worth doing — get_fileNames/getfiles return 200 but empty
 *       for the params guessed so far. If MOSPI publishes bulk per-work
 *       reports there, that becomes the authoritative replacement for the
 *       Empowered Indian feed, and per-work rows get their own table.
 */
const APPLY = process.argv.includes("--apply")

const ESAKSHI = "https://mplads.mospi.gov.in/rest/PreLoginDashboardData"
const ENDPOINTS = {
  states: `${ESAKSHI}/getStateData`,
  constituencies: `${ESAKSHI}/getConstituencyData`,
  tiles: `${ESAKSHI}/getTilesData`,
  totals: `${ESAKSHI}/getTotalTilesData`,
  tenures: `${ESAKSHI}/getTenureData`,
}
const EMPOWERED_INDIAN = "https://api.empoweredindian.in"

/** House codes as eSAKSHI encodes them. Not the same as in_mps.house. */
const HOUSE_CODE = { RS: "1", LS: "2" }

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency; +https://kaun.city)",
}

/** Endpoints on these hosts that mutate state. Never call these. */
const FORBIDDEN = ["updateWorkReviewByCitizen", "mailing-list/unsubscribe"]

async function main() {
  console.log("esakshi-mplads — SKELETON, no extract implemented yet")
  console.log({ ENDPOINTS, EMPOWERED_INDIAN, HOUSE_CODE, HEADERS })
  console.log("never call:", FORBIDDEN.join(", "))
  if (APPLY) {
    console.error("\n--apply is not implemented yet; refusing to write.")
    process.exit(1)
  }
}

main().catch(e => { console.error("FAILED:", e); process.exit(1) })
