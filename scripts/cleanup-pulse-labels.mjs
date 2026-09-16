#!/usr/bin/env node
/**
 * cleanup-pulse-labels.mjs — one-off relabel of existing CityPulse rows.
 *
 * WHY: until this fix, refresh-pulse labelled every item with the search that
 * found it ("X/Pothole", "Google News BWSSB") instead of its publisher, so a
 * power-cut post showed under "X/POTHOLE" and news.google.com links were
 * presented as X posts. Its keyword classifier also filed rain stories under
 * ROAD SAFETY, and headlines kept emoji, HTML entities and outlet tags. The
 * route now labels items with apps/web/lib/pulse-ingest.mjs; this script runs
 * the SAME module over the rows already stored, so old and new rows agree.
 *
 * Scope: city_id = 'bengaluru', is_editorial = false (the rows refresh-pulse
 * wrote). Editorial rows and other cities are never touched. Nothing is
 * deleted. Per row it may change:
 *   - source_name        publisher, "via Google News" when the link goes there
 *   - headline           entities decoded; emoji and trailing outlet tag removed
 *   - category/severity  re-classified
 *   - dedup_key          recomputed from the new headline, unless another row
 *                        already holds (or would take) that key
 *   - is_active → false  for active rows the new rules would not have ingested
 * `detail` is left as stored: it is not displayed, and its Google News
 * publisher tag is what makes a re-run give the same answer (idempotent).
 *
 * The publisher of an old Google News row is recovered, in order, from:
 *   1. a source_name this script already wrote ("Deccan Herald via Google News")
 *   2. the `<font color="#6f6f6f">` publisher Google News puts in `detail`
 *   3. the X searches ("X/…"): those were site:x.com queries; every row whose
 *      publisher survives in `detail` is x.com, so the rest are X too
 *   4. the " - Publisher" tag Google News appends to every title
 * and otherwise stays "Google News", which is where the link goes.
 *
 *   node scripts/cleanup-pulse-labels.mjs                  # dry-run (read-only)
 *   node scripts/cleanup-pulse-labels.mjs --out plan.json  # + every row's before/after
 *   node scripts/cleanup-pulse-labels.mjs --apply          # writes
 *
 * --apply prints every change (with `before` values) as a JSON line before
 * writing it, and each PATCH only lands if the row's source_name and category
 * are still what was read. Revert: PATCH the `before` values back by id.
 */
import { readFileSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { dedupKey } from "../apps/web/lib/pulse-dedup.mjs"
import { buildPulseFact, decodeEntities, hostOf, labelPulseItem } from "../apps/web/lib/pulse-ingest.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes("--apply")
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null

// env: local dev reads apps/web/.env.local; CI has no such file and uses
// process.env (GH secrets). Accept both names (mirrors migrate-pulse-dedup).
let env = {}
try {
  env = Object.fromEntries(
    readFileSync(resolve(__dirname, "../apps/web/.env.local"), "utf8")
      .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
      .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
} catch { /* CI: no .env.local — fall through to process.env */ }
const SB = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SVC = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` }

const COLUMNS = "id,city_id,category,severity,headline,detail,source_name,source_url,is_active,is_editorial,dedup_key"

async function fetchRows() {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const qs = new URLSearchParams({ select: COLUMNS, city_id: "eq.bengaluru", is_editorial: "eq.false", order: "id.asc", offset: String(offset), limit: "1000" })
    const res = await fetch(`${SB}/rest/v1/city_pulse_facts?${qs}`, { headers: H })
    if (!res.ok) throw new Error(`read city_pulse_facts: HTTP ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

const words = s => s.trim().split(/\s+/).filter(Boolean).length

/** @returns {{ source: { name: string, url?: string } | null, how: string }} */
export function recoverPublisher(row) {
  if (hostOf(row.source_url) !== "news.google.com") return { source: null, how: "link-host" }

  const via = (row.source_name ?? "").match(/^(.+) via Google News$/)
  if (via) return { source: { name: via[1] }, how: "relabelled" }

  const font = decodeEntities(row.detail ?? "").match(/<font color="#6f6f6f">([\s\S]*?)<\/font>/)
  if (font) return { source: { name: decodeEntities(font[1]).trim() }, how: "detail" }

  if (/^X\//.test(row.source_name ?? "")) return { source: { name: "X", url: "https://x.com" }, how: "x-search" }

  const tag = row.headline.match(/^(.*\S)\s+-\s+([^-]+?)\s*$/)
  if (tag && words(tag[1]) >= 4 && words(tag[2]) <= 6) return { source: { name: tag[2] }, how: "headline-tag" }

  return { source: null, how: "unknown" }
}

/** What the new rules say this row should look like. Pure. */
export function planRow(row) {
  const { source, how } = recoverPublisher(row)
  const item = { title: row.headline, description: row.detail ?? "", link: row.source_url ?? "", source }
  const labels = labelPulseItem(item)

  const next = {}
  const set = (field, value) => { if (value !== row[field]) next[field] = value }
  set("source_name", labels.source_name)
  if (labels.headline) set("headline", labels.headline)
  if (labels.category) {
    set("category", labels.category)
    set("severity", labels.severity)
  }
  const { skip } = buildPulseFact(item)
  if (row.is_active && skip) next.is_active = false

  return { next, how, skip, key: dedupKey(labels.headline || row.headline) }
}

async function patchRow(row, next) {
  const qs = new URLSearchParams({ id: `eq.${row.id}`, source_name: `eq.${row.source_name}`, category: `eq.${row.category}` })
  const res = await fetch(`${SB}/rest/v1/city_pulse_facts?${qs}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(next),
  })
  if (!res.ok) return `HTTP ${res.status} ${await res.text()}`
  const updated = await res.json()
  return updated.length === 1 ? null : "row changed since it was read; skipped"
}

async function main() {
  if (!SB || !SVC) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY")
  const rows = await fetchRows()
  console.log(`${APPLY ? "APPLY" : "DRY-RUN (read-only)"} — ${rows.length} non-editorial bengaluru rows`)

  const planned = rows.map(row => ({ row, ...planRow(row) }))

  // dedup_key moves only to a key no other row holds now or would take.
  const holders = new Map()
  const claim = (key, id) => holders.set(key, [...(holders.get(key) ?? []), id])
  for (const p of planned) {
    claim(p.row.dedup_key, p.row.id)
    if (p.key !== p.row.dedup_key) claim(p.key, p.row.id)
  }
  const collisions = []
  for (const p of planned) {
    if (p.key === p.row.dedup_key) continue
    const others = holders.get(p.key).filter(id => id !== p.row.id)
    if (others.length) collisions.push({ id: p.row.id, key: p.key, held_by: others })
    else p.next.dedup_key = p.key
  }

  const changes = planned.filter(p => Object.keys(p.next).length)
  const count = f => changes.filter(p => f in p.next).length
  const tally = (list, fn) => Object.entries(list.reduce((acc, p) => { const k = fn(p); acc[k] = (acc[k] ?? 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1])

  console.log(`\nRows to change: ${changes.length}`)
  for (const f of ["source_name", "headline", "category", "severity", "dedup_key", "is_active"]) console.log(`  ${f.padEnd(12)} ${count(f)}`)
  console.log(`  of which currently active: ${changes.filter(p => p.row.is_active).length}`)

  console.log("\nPublisher recovered from (all rows):")
  for (const [k, n] of tally(planned, p => p.how)) console.log(`  ${String(n).padStart(5)}  ${k}`)

  console.log("\nsource_name, old → new:")
  for (const [k, n] of tally(changes.filter(p => p.next.source_name), p => `${p.row.source_name} → ${p.next.source_name}`).slice(0, 30)) console.log(`  ${String(n).padStart(5)}  ${k}`)

  console.log("\ncategory, old → new:")
  for (const [k, n] of tally(changes.filter(p => p.next.category), p => `${p.row.category} → ${p.next.category}`)) console.log(`  ${String(n).padStart(5)}  ${k}`)

  const deactivate = changes.filter(p => p.next.is_active === false)
  console.log(`\nActive rows the new rules would not ingest (→ is_active false): ${deactivate.length}`)
  for (const p of deactivate.slice(0, 25)) console.log(`  #${p.row.id} [${p.row.category}, ${p.skip}] ${p.row.headline.slice(0, 110)}`)

  console.log(`\ndedup_key left unchanged because another row holds the new key: ${collisions.length}`)
  for (const c of collisions.slice(0, 15)) console.log(`  #${c.id} ↔ #${c.held_by.join(", #")}  "${c.key}"`)

  const reclassified = changes.filter(p => p.next.category && p.row.is_active)
  console.log(`\nSample re-classified active rows (${reclassified.length}):`)
  for (const p of reclassified.slice(0, 25)) console.log(`  #${p.row.id} ${p.row.category} → ${p.next.category}: ${(p.next.headline ?? p.row.headline).slice(0, 100)}`)

  const record = p => ({ id: p.row.id, before: Object.fromEntries(Object.keys(p.next).map(f => [f, p.row[f]])), after: p.next })
  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run", collisions, changes: changes.map(record) }, null, 2))
    console.log(`\nFull plan written to ${OUT}`)
  }

  if (!APPLY) {
    console.log("\nDry-run only. Nothing was written. Re-run with --apply to write.")
    return
  }

  let ok = 0
  const failed = []
  const queue = [...changes]
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      console.log(JSON.stringify(record(p)))
      const error = await patchRow(p.row, p.next)
      if (error) failed.push({ id: p.row.id, error })
      else ok++
    }
  }))
  console.log(`\nApplied ${ok}/${changes.length}. Failed: ${failed.length}`)
  for (const f of failed) console.log(`  #${f.id}: ${f.error}`)
  if (failed.length) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1) })
}
