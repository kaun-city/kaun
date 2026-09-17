#!/usr/bin/env node
/**
 * annotate-nomination-history.mjs — label repeated elections in the stored
 * in_mp_affidavits.declared_assets_history with the seat MyNeta filed them
 * under, without re-scraping all 543 winners.
 *
 * Usage:
 *   node scripts/india/annotate-nomination-history.mjs           # dry run
 *   node scripts/india/annotate-nomination-history.mjs --apply   # writes
 * Env (only --apply needs credentials):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Only affidavits whose history repeats an election are touched (21 of 543 in
 * Sep 2026). For each: the candidate page (for its compare link) and the
 * compare page, two polite, disk-cached requests to MyNeta. Only the new
 * constituency / by_election / profile_url keys are added; stored figures and
 * order are kept exactly (see annotateRepeatedNominations).
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { flag, run } from "./lib/cli.mjs"
import { REPO_ROOT } from "./lib/sink.mjs"
import { politeFetch } from "./lib/http.mjs"
import { createRest } from "../lib/rest.mjs"
import {
  annotateRepeatedNominations, compareProfileUrl, electionKey, parseCompareProfiles, repeatedElections,
} from "./myneta-affidavits.mjs"

const ARTIFACT = resolve(REPO_ROOT, ".artifacts/india/annotate-nomination-history.dry-run.json")
const REQUEST_DELAY_MS = 2500

async function main() {
  const apply = flag("apply")
  console.log(`\nannotate-nomination-history — ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`)
  const rest = createRest()
  if (apply && !rest.canWrite) throw new Error("--apply needs SUPABASE_SERVICE_KEY")

  const affidavits = await rest.selectAll("in_mp_affidavits", {
    select: "id,pc_code,candidate_name,election,profile_url,declared_assets_history",
    order: "id.asc",
  })
  const targets = affidavits.filter(a => repeatedElections(a.election, a.declared_assets_history).size > 0)
  console.log(`  affidavits read: ${affidavits.length}; with a repeated election: ${targets.length}`)

  const changes = []
  const unlabelled = []
  for (const a of targets) {
    const page = await politeFetch(a.profile_url, { namespace: "myneta", json: false, delayMs: REQUEST_DELAY_MS })
    const compareUrl = compareProfileUrl(page)
    if (!compareUrl) { console.log(`  ! ${a.pc_code} ${a.candidate_name}: no compare link`); continue }
    const compare = await politeFetch(compareUrl, { namespace: "myneta", json: false, delayMs: REQUEST_DELAY_MS })
    const after = annotateRepeatedNominations(a.declared_assets_history, parseCompareProfiles(compare), {
      election: a.election, profileUrl: a.profile_url,
    })
    const repeated = repeatedElections(a.election, a.declared_assets_history)
    for (const h of after) {
      if (repeated.has(electionKey(h.election)) && !h.constituency) {
        unlabelled.push({ pc_code: a.pc_code, candidate_name: a.candidate_name, ...h })
      }
    }
    if (JSON.stringify(after) === JSON.stringify(a.declared_assets_history)) continue
    changes.push({ id: a.id, pc_code: a.pc_code, candidate_name: a.candidate_name, compare_url: compareUrl, before: a.declared_assets_history, after })
    console.log(`\n  ${a.pc_code} ${a.candidate_name}`)
    after.forEach(h => {
      if (!h.constituency) return
      console.log(`    ${h.election}: ₹${h.declared_assets_inr}, ${h.declared_cases} cases -> ${h.constituency}${h.by_election ? " (by-election)" : ""}`)
    })
  }

  console.log(`\n  histories that would change: ${changes.length}`)
  console.log(`  repeated-election rows left unlabelled (compare page does not settle them): ${unlabelled.length}`)
  for (const u of unlabelled) console.log(`    ${u.pc_code} ${u.candidate_name}: ${u.election} ₹${u.declared_assets_inr}, ${u.declared_cases} cases`)

  mkdirSync(resolve(REPO_ROOT, ".artifacts/india"), { recursive: true })
  writeFileSync(ARTIFACT, JSON.stringify({
    generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry-run",
    affidavits_read: affidavits.length, with_repeats: targets.length, changes, unlabelled,
  }, null, 2))
  console.log(`  artifact: ${ARTIFACT}`)

  if (!apply) return
  for (const c of changes) {
    await rest.patch("in_mp_affidavits", { id: `eq.${c.id}` },
      { declared_assets_history: c.after, updated_at: new Date().toISOString() })
  }
  console.log(`  wrote ${changes.length} row(s)`)
}

run(main, import.meta.url)
