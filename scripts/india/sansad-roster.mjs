#!/usr/bin/env node
/**
 * sansad-roster.mjs — SKELETON. Populates in_mps from sansad.in.
 *
 * Usage: node scripts/india/sansad-roster.mjs [--full] [--apply]
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * mpsno is Kaun's canonical MP id. It is the ONE strong numeric identifier in
 * the whole India recon, and it is the same value as the Zenodo bulk export's
 * mpCode (cross-checked: 5814 = "Shri Mani A" in both).
 *
 * ENDPOINT TRAPS ALREADY PAID FOR
 *   - Pagination is 1-INDEXED. page=0 returns a 500 with an opaque
 *     {"errorCode":1004}. Start at page=1.
 *   - sansad.in HTML pages return an empty reply to curl's default UA; the
 *     JSON APIs need a realistic browser User-Agent + Referer. The repo's
 *     adapter convention (KaunBot UA) must be extended, not replaced — send a
 *     browser UA string that still identifies Kaun.
 *   - The payload has NO PC number, only constName. That is what the alias
 *     table exists for.
 *   - 544 records for 543 seats: Nanded has both a deceased and a bypoll MP.
 *     3 seats (Nagaon, Basirhat, Shillong) currently have no sitting MP.
 *     The in_mps_one_sitting_per_pc partial index expects exactly this shape.
 *   - categoryCode (reserved status) is badly under-populated. Do not write it
 *     anywhere; in_constituencies.reserved_for owns that fact.
 *
 * STEPS
 *   1. GET api_ls/member?loksabha=18&page=1&size=600  → 544 LS rows.
 *      GET api_rs/member/sitting-members?...&size=300 → 244 RS rows.
 *   2. For each row resolve pc_code with resolvePc() — alias table first, then
 *      exact normalized name within the state. LS only; RS rows keep pc_code
 *      NULL (the in_mps_pc_only_for_ls CHECK enforces that).
 *   3. Report every unresolved row as a proposed in_pc_source_aliases entry
 *      (source='sansad', source_key=mpsno) for human review. ~32 of 544 are
 *      expected: real spelling variants like Mahbubnagar/Mahabubnagar,
 *      Firozpur/Ferozepur, Hardwar/Haridwar. NEVER auto-resolve these.
 *   4. Set is_minister + minister_note. Source: PRS's mp_note field, which
 *      states it explicitly per minister. Needed so in_mp_activity can flag
 *      rather than zero.
 *   5. Upsert on (mpsno, house, term_label).
 *
 * TODO: implement steps 1-5.
 * TODO: confirm whether mpsno is reused across Lok Sabhas. If it is,
 *       term_label is what keeps the 18th LS record intact in 2029; if it is
 *       not, term_label is harmless. Either way it stays. See the design doc.
 * TODO: RS attendance/questions endpoints were never probed — a follow-up
 *       pass is needed before in_mp_activity covers Rajya Sabha.
 */
import { resolvePc, normalizeConstituencyName } from "./lib/pc-code.mjs"

const APPLY = process.argv.includes("--apply")
const FULL = process.argv.includes("--full")

const LS_MEMBERS = "https://sansad.in/api_ls/member?loksabha=18&page=1&size=600"
const RS_MEMBERS = "https://sansad.in/api_rs/member/sitting-members?page=1&size=300"

const HEADERS = {
  Accept: "application/json, */*",
  // sansad.in drops connections from non-browser UAs; keep Kaun identifiable.
  "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency; +https://kaun.city)",
  Referer: "https://sansad.in/",
}

/** Terms Kaun tracks. term_label is part of in_mps' natural key. */
const TERMS = { LS: { lok_sabha_no: 18, term_label: "LS18" } }

async function main() {
  console.log("sansad-roster — SKELETON, no extract implemented yet")
  console.log("endpoints:", { LS_MEMBERS, RS_MEMBERS })
  console.log("headers:", HEADERS, "| full refresh:", FULL, "| terms:", TERMS)
  console.log("resolution helpers loaded:",
    typeof resolvePc, typeof normalizeConstituencyName)
  if (APPLY) {
    console.error("\n--apply is not implemented yet; refusing to write.")
    process.exit(1)
  }
}

main().catch(e => { console.error("FAILED:", e); process.exit(1) })
