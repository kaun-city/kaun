#!/usr/bin/env node
/**
 * scrape-blacklists.mjs — reconcile contractor_profiles.blacklist_flags with
 * documented debarments, and optionally with scraped debarment lists.
 *
 * Usage:
 *   node scripts/scrape-blacklists.mjs                  # dry run: documented cases only
 *   node scripts/scrape-blacklists.mjs --lists          # dry run: + GeM, World Bank, CPPP, KPCL
 *   node scripts/scrape-blacklists.mjs --apply          # writes
 * Env (only --apply needs credentials):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * RECONCILE, NOT APPEND
 *   The run computes the complete flag list for every Bengaluru profile and
 *   writes only the differences — including removing flags nothing supports
 *   any more. The old version only ever added, so a flag attached by a bad
 *   match stayed on a firm forever.
 *
 * LISTS ARE OPT-IN
 *   The list scrapers read table cells, not firm records, and none of these
 *   pages is reliably reachable (Sep 2026: GeM redirects, KPCL returns 500).
 *   A list that fails to load would make the reconcile strip every flag it
 *   supports, so --apply refuses to run while any requested list failed.
 *
 * Wording, citation and money format come from scripts/lib/contractor-flags.mjs;
 * a flag that fails checkFlag() is never written.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { flag, run } from "./india/lib/cli.mjs"
import { createRest } from "./lib/rest.mjs"
import {
  DOCUMENTED_CASES, checkFlag, citeDate, desiredFlags, planFlagChanges,
} from "./lib/contractor-flags.mjs"

const ARTIFACT = resolve(dirname(fileURLToPath(import.meta.url)), "../.artifacts/contractor-flags.dry-run.json")
const UA = { "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)" }

// ─── Sources ──────────────────────────────────────────────────
// Each returns { id, ok, entries }. A list entry's flag names the list, who
// published the listing and when Kaun read it; it claims nothing more.

function documentedCases() {
  return {
    id: "documented",
    ok: true,
    entries: DOCUMENTED_CASES.map(c => ({ names: c.names, flags: c.flags, match: "phrase" })),
  }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: UA, redirect: "manual", signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const cells = html => [...html.matchAll(/<td[^>]*>([^<]+)<\/td>/g)].map(m => m[1].trim())

async function scrapeList(id, loader) {
  try {
    const entries = await loader()
    console.log(`  ${id}: ${entries.length} name(s)`)
    return { id, ok: true, entries }
  } catch (e) {
    console.log(`  ${id}: FAILED (${e.message})`)
    return { id, ok: false, entries: [] }
  }
}

function listSources(retrieved) {
  return [
    scrapeList("gem", async () => {
      const html = await fetchText("https://gem.gov.in/suspendedSellers")
      return cells(html)
        .filter(t => t.length > 5 && !/^\d/.test(t) && !t.includes("@"))
        .map(name => ({
          names: [name], match: "fuzzy",
          flags: [`Listed as a suspended seller on Government e-Marketplace (gem.gov.in, retrieved ${retrieved})`],
        }))
    }),
    scrapeList("world-bank", async () => {
      const html = await fetchText("https://www.worldbank.org/en/projects-operations/procurement/debarred-firms")
      return [...html.matchAll(/India[^<]*<\/td>\s*<td[^>]*>([^<]+)/g)].map(m => ({
        names: [m[1].trim()], match: "fuzzy",
        flags: [`Listed on the World Bank's debarred firms list (worldbank.org, retrieved ${retrieved})`],
      }))
    }),
    scrapeList("cppp", async () => {
      const html = await fetchText("https://eprocure.gov.in/eprocure/app?page=FrontEndDebarmentList&service=page")
      const rows = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)/g)]
      return rows
        .filter(m => m[3].trim().length > 3)
        .map(m => ({
          names: [m[3].trim()], match: "fuzzy",
          flags: [`Listed as debarred by ${m[2].trim()} on the Central Public Procurement Portal (eprocure.gov.in, retrieved ${retrieved})`],
        }))
    }),
    scrapeList("kpcl", async () => {
      const html = await fetchText("https://kpcl.karnataka.gov.in/info-4/Blacklisted+Firms/en")
      return cells(html)
        .filter(t => t.length > 5 && !/^\d+$/.test(t) && !/^Sl/.test(t) && !t.includes("Period"))
        .map(name => ({
          names: [name], match: "fuzzy",
          flags: [`Listed as blacklisted by Karnataka Power Corporation (kpcl.karnataka.gov.in, retrieved ${retrieved})`],
        }))
    }),
  ]
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const apply = flag("apply")
  const withLists = flag("lists")
  console.log(`\nscrape-blacklists — ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}${withLists ? " · with lists" : ""}`)

  const rest = createRest()
  if (apply && !rest.canWrite) throw new Error("--apply needs SUPABASE_SERVICE_KEY")

  const profiles = await rest.selectAll("contractor_profiles", {
    select: "entity_id,canonical_name,aliases,total_contracts,blacklist_flags",
    city_id: "eq.bengaluru",
    order: "entity_id.asc",
  })
  console.log(`  profiles read: ${profiles.length}`)

  const sources = [documentedCases()]
  if (withLists) sources.push(...await Promise.all(listSources(citeDate(new Date()))))
  const failed = sources.filter(s => !s.ok).map(s => s.id)

  const desired = desiredFlags(profiles, sources.filter(s => s.ok).flatMap(s => s.entries))
  const changes = planFlagChanges(profiles, desired)

  const unpublishable = changes.flatMap(c => c.after.map(f => ({ flag: f, problems: checkFlag(f) })))
    .filter(x => x.problems.length)
  if (unpublishable.length) {
    for (const u of unpublishable) console.log(`  ! ${u.flag}\n      ${u.problems.join("; ")}`)
    throw new Error(`${unpublishable.length} flag(s) fail checkFlag(); nothing written`)
  }

  const flagged = [...desired.values()].filter(f => f.length).length
  console.log(`  profiles flagged after this run: ${flagged}`)
  console.log(`  changes: ${changes.length}`)
  for (const c of changes) {
    console.log(`\n  ${c.action.toUpperCase()} ${c.canonical_name} (${c.entity_id}, ${c.total_contracts ?? "?"} contracts)`)
    for (const f of c.before) console.log(`    - ${f}`)
    for (const f of c.after) console.log(`    + ${f}`)
  }

  mkdirSync(dirname(ARTIFACT), { recursive: true })
  writeFileSync(ARTIFACT, JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    sources: sources.map(s => ({ id: s.id, ok: s.ok, entries: s.entries.length })),
    profiles_read: profiles.length,
    profiles_flagged_after: flagged,
    changes,
  }, null, 2))
  console.log(`\n  artifact: ${ARTIFACT}`)

  if (!apply) return
  if (failed.length) {
    throw new Error(`list(s) failed to load: ${failed.join(", ")}. Reconciling now would strip the flags they support; nothing written`)
  }
  const now = new Date().toISOString()
  for (const c of changes) {
    await rest.patch("contractor_profiles", { entity_id: `eq.${c.entity_id}` },
      { blacklist_flags: c.after, updated_at: now })
  }
  console.log(`  wrote ${changes.length} profile(s)`)
}

run(main, import.meta.url)
