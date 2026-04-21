#!/usr/bin/env node
// ward-index.mjs — Generate wiki/docs/bengaluru/wards/index.md from the live public APIs.
// Usage: node scripts/generate-wiki/ward-index.mjs
//
// Pulls ward list + elected reps from kaun.city public endpoints and writes a sortable
// markdown table of all 243 BBMP wards with their assembly constituency and MLA.

import { writeFileSync } from "node:fs"

const API_BASE = process.env.KAUN_API_BASE ?? "https://kaun.city"
const OUT_PATH = "wiki/docs/bengaluru/wards/index.md"

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function fmtMla(rep) {
  if (!rep) return "_vacant / not mapped_"
  const party = rep.party ? ` (${rep.party})` : ""
  const cases = rep.report_card?.criminal_cases ?? rep.criminal_cases
  const flag = cases && cases > 0 ? ` ⚠ ${cases} case${cases === 1 ? "" : "s"}` : ""
  return `${rep.name}${party}${flag}`
}

async function main() {
  console.log(`Fetching from ${API_BASE}...`)
  const [{ data: wards }, { data: reps }] = await Promise.all([
    fetchJson("/api/data/wards"),
    fetchJson("/api/data/reps"),
  ])
  console.log(`  wards: ${wards.length}, reps: ${reps.length}`)

  const mlaByConstituency = new Map()
  for (const r of reps) {
    if (r.role !== "MLA") continue
    mlaByConstituency.set(r.constituency, r)
  }

  const byConstituency = new Map()
  for (const w of wards) {
    const ac = w.assembly_constituency ?? "Unassigned"
    if (!byConstituency.has(ac)) byConstituency.set(ac, [])
    byConstituency.get(ac).push(w)
  }
  for (const arr of byConstituency.values()) arr.sort((a, b) => a.ward_no - b.ward_no)

  const lines = []
  lines.push("# Wards — Bengaluru (BBMP, 243)")
  lines.push("")
  lines.push(`_Auto-generated from [kaun.city](https://kaun.city) public APIs on ${new Date().toISOString().slice(0, 10)}. For each ward, the link opens the full interactive view — MLA attendance, LAD fund use, ward-level spending by category, contractors operating there, water/air quality, OSM amenities, and more._`)
  lines.push("")
  lines.push("Bengaluru has been under administrator rule since September 2020, so corporator seats are vacant. The MLA listed is the state-assembly representative whose constituency the ward falls under. A ⚠ marker means the MLA has declared pending criminal cases in their nomination affidavit (source: [MyNeta](https://myneta.info)).")
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## All 243 wards")
  lines.push("")
  lines.push("| Ward # | Ward name | Assembly constituency | MLA | View |")
  lines.push("|---:|---|---|---|---|")

  const sorted = [...wards].sort((a, b) => a.ward_no - b.ward_no)
  for (const w of sorted) {
    const mla = mlaByConstituency.get(w.assembly_constituency)
    const url = `https://kaun.city/?ward=${w.ward_no}`
    lines.push(`| ${w.ward_no} | ${w.ward_name} | ${w.assembly_constituency ?? "—"} | ${fmtMla(mla)} | [Open →](${url}) |`)
  }

  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## Grouped by assembly constituency")
  lines.push("")

  const constituencies = [...byConstituency.keys()].sort()
  for (const ac of constituencies) {
    const mla = mlaByConstituency.get(ac)
    const wardsInAc = byConstituency.get(ac)
    lines.push(`### ${ac}`)
    lines.push("")
    lines.push(`**MLA:** ${fmtMla(mla)} · **Wards:** ${wardsInAc.length}`)
    lines.push("")
    for (const w of wardsInAc) {
      lines.push(`- [Ward ${w.ward_no} — ${w.ward_name}](https://kaun.city/?ward=${w.ward_no})`)
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("")
  lines.push("## Missing or out of date?")
  lines.push("")
  lines.push("This page is generated from the live Supabase-backed APIs at `kaun.city/api/data/*`. If a ward name, MLA, or assembly constituency looks wrong, it's wrong at the source — please [open an issue](https://github.com/kaun-city/kaun/issues/new) with the ward number and what's incorrect. GBA's 2025 restructuring into 369 wards across 5 corporations will be added as those lists are officially published.")
  lines.push("")

  writeFileSync(OUT_PATH, lines.join("\n"))
  console.log(`  wrote ${OUT_PATH}: ${lines.length} lines, ${sorted.length} wards, ${constituencies.length} assembly constituencies`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
