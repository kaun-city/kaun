#!/usr/bin/env node
/**
 * relink-affidavit-members.mjs — point in_mp_affidavits.mp_id at the member
 * who filed each affidavit, without re-scraping MyNeta.
 *
 * Usage:
 *   node scripts/india/relink-affidavit-members.mjs           # dry run
 *   node scripts/india/relink-affidavit-members.mjs --apply   # writes
 * Env (only --apply needs credentials):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * One-off backfill for the September 2026 fix (see lib/affidavit-member.mjs):
 * Wayanad and Nanded were linked to the by-election winners, and 15 rows that
 * were matched by hand had no mp_id at all. It only ever changes mp_id; the
 * affidavit's contents and review status are untouched. A dry run reads
 * public rows with the anon key; --apply reads every row with the service key.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { flag, run } from "./lib/cli.mjs"
import { REPO_ROOT } from "./lib/sink.mjs"
import { createRest } from "../lib/rest.mjs"
import { loadAffidavitOwners, planAffidavitRelinks } from "./lib/affidavit-member.mjs"
import { LS_TERM } from "./sansad-roster.mjs"

const ARTIFACT = resolve(REPO_ROOT, ".artifacts/india/relink-affidavit-members.dry-run.json")

async function main() {
  const apply = flag("apply")
  console.log(`\nrelink-affidavit-members — ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`)
  const rest = createRest()
  if (apply && !rest.canWrite) throw new Error("--apply needs SUPABASE_SERVICE_KEY")

  const lsRows = await rest.selectAll("in_mps", {
    select: "id,mpsno,pc_code,name,status",
    house: "eq.LS", term_label: `eq.${LS_TERM.term_label}`, order: "id.asc",
  })
  const affidavits = await rest.selectAll("in_mp_affidavits", {
    select: "id,pc_code,mp_id,candidate_name,is_winner,election",
    order: "id.asc",
  })
  console.log(`  roster rows (${LS_TERM.term_label}, any status): ${lsRows.length}`)
  console.log(`  affidavit rows readable: ${affidavits.length}${rest.canWrite ? "" : " (anon: public rows only)"}`)

  const { changes, unresolved } = planAffidavitRelinks(affidavits, lsRows, loadAffidavitOwners())
  console.log(`  changes: ${changes.length}`)
  for (const c of changes) {
    console.log(`    ${c.pc_code.padEnd(6)} ${c.candidate_name}: mp_id ${c.from_mp_id ?? "null"}` +
      `${c.from_member ? ` (${c.from_member})` : ""} -> ${c.to_mp_id} (${c.to_member}, ${c.to_member_status})` +
      ` · ${c.method}${c.shown_on_member_card ? "" : ` · hidden from ${c.sitting_member ? `${c.sitting_member}'s card` : "the vacant seat's card"}`}`)
  }
  for (const u of unresolved) console.log(`  ! ${u.pc_code} ${u.candidate_name}: ${u.reason}`)

  mkdirSync(resolve(REPO_ROOT, ".artifacts/india"), { recursive: true })
  writeFileSync(ARTIFACT, JSON.stringify({
    generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry-run",
    roster_rows: lsRows.length, affidavit_rows: affidavits.length, changes, unresolved,
  }, null, 2))
  console.log(`  artifact: ${ARTIFACT}`)

  if (!apply) return
  for (const c of changes) {
    await rest.patch("in_mp_affidavits", { id: `eq.${c.id}` }, { mp_id: c.to_mp_id, updated_at: new Date().toISOString() })
  }
  console.log(`  wrote ${changes.length} row(s)`)
}

run(main, import.meta.url)
