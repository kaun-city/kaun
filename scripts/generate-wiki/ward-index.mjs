#!/usr/bin/env node
// ward-index.mjs — Generate the Bengaluru ward section of the wiki.
// Usage: node scripts/generate-wiki/ward-index.mjs
//
// Pulls ward list, elected reps, top contractors, and top work orders from
// kaun.city public APIs and writes:
//   wiki/docs/bengaluru/wards/index.md            (all 243 wards, one page)
//   wiki/docs/bengaluru/wards/<num>-<slug>.md     (one per ward, 243 files)

import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"

const API_BASE = process.env.KAUN_API_BASE ?? "https://kaun.city"
const WARDS_DIR = "wiki/docs/bengaluru/wards"
const INDEX_PATH = `${WARDS_DIR}/index.md`
const CITY_WORK_ORDERS_PATH = "wiki/docs/bengaluru/work-orders.md"
const TODAY = new Date().toISOString().slice(0, 10)

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function wardFilename(w) {
  return `${w.ward_no}-${slugify(w.ward_name)}.md`
}

function fmtMla(rep) {
  if (!rep) return "_vacant / not mapped_"
  const party = rep.party ? ` (${rep.party})` : ""
  const cases = rep.report_card?.criminal_cases ?? rep.criminal_cases
  const flag = cases && cases > 0 ? ` ⚠ ${cases} case${cases === 1 ? "" : "s"}` : ""
  return `${rep.name}${party}${flag}`
}

function fmtRupeesLakh(lakh) {
  if (lakh == null) return "—"
  if (lakh >= 100) return `Rs ${(lakh / 100).toFixed(2)} Cr`
  return `Rs ${lakh.toFixed(2)} L`
}

function fmtRupeesPaise(paise) {
  if (paise == null) return "—"
  const lakh = paise / 100000
  if (lakh >= 100) return `Rs ${(lakh / 100).toFixed(2)} Cr`
  if (lakh >= 1) return `Rs ${lakh.toFixed(2)} L`
  return `Rs ${paise.toLocaleString("en-IN")}`
}

function renderIndex(wards, mlaByConstituency) {
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
  lines.push(`_Auto-generated from [kaun.city](https://kaun.city) public APIs on ${TODAY}. Each ward links to its own page in this wiki, and also to the interactive kaun.city view._`)
  lines.push("")
  lines.push("Bengaluru has been under administrator rule since September 2020, so corporator seats are vacant. The MLA listed is the state-assembly representative whose constituency the ward falls under. A ⚠ marker means the MLA has declared pending criminal cases in their nomination affidavit (source: [MyNeta](https://myneta.info)).")
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## All 243 wards")
  lines.push("")
  lines.push("| Ward # | Ward name | Assembly constituency | MLA | Wiki page | Interactive |")
  lines.push("|---:|---|---|---|---|---|")

  const sorted = [...wards].sort((a, b) => a.ward_no - b.ward_no)
  for (const w of sorted) {
    const mla = mlaByConstituency.get(w.assembly_constituency)
    const wikiUrl = wardFilename(w)
    const liveUrl = `https://kaun.city/?ward=${w.ward_no}`
    lines.push(`| ${w.ward_no} | [${w.ward_name}](${wikiUrl}) | ${w.assembly_constituency ?? "—"} | ${fmtMla(mla)} | [Deep page](${wikiUrl}) | [Open →](${liveUrl}) |`)
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
      lines.push(`- [Ward ${w.ward_no} — ${w.ward_name}](${wardFilename(w)})`)
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("")
  lines.push("## Missing or out of date?")
  lines.push("")
  lines.push("This page is generated from the live Supabase-backed APIs at `kaun.city/api/data/*`. If a ward name, MLA, or assembly constituency looks wrong, it's wrong at the source — please [open an issue](https://github.com/kaun-city/kaun/issues/new) with the ward number and what's incorrect. GBA's 2025 restructuring into 369 wards across 5 corporations will be added as those lists are officially published.")
  lines.push("")

  return lines.join("\n")
}

function renderWardPage(w, mla, contractorsHere, workOrdersHere) {
  const lines = []
  lines.push(`# Ward ${w.ward_no} — ${w.ward_name}`)
  lines.push("")
  lines.push(`_Part of **${w.assembly_constituency ?? "—"}** assembly constituency · BBMP 243-ward delimitation_`)
  lines.push("")
  lines.push(`**[Open Ward ${w.ward_no} on kaun.city →](https://kaun.city/?ward=${w.ward_no})** for the full interactive view — spending, amenities, water and air quality, grievance data, contractor profiles, and the Ward Grade (A–F) composite score.`)
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## Elected representative")
  lines.push("")

  if (mla) {
    const rc = mla.report_card
    lines.push(`Your MLA is **${mla.name}**${mla.party ? ` (${mla.party})` : ""}.`)
    lines.push("")

    const rows = []
    if (rc?.attendance_pct != null) rows.push(["Assembly attendance", `${rc.attendance_pct}%`])
    if (rc?.lad_utilization_pct != null) rows.push(["LAD fund utilization", `${rc.lad_utilization_pct}%`])
    if (rc?.questions_asked != null) rows.push(["Questions asked in house", String(rc.questions_asked)])
    if (rc?.bills_introduced != null) rows.push(["Bills introduced", String(rc.bills_introduced)])
    if (rc?.committees != null) rows.push(["Committee memberships", String(rc.committees)])
    if (rc?.net_worth_growth_pct != null) rows.push(["Net-worth growth (term)", `${rc.net_worth_growth_pct}%`])
    const cases = rc?.criminal_cases ?? mla.criminal_cases
    if (cases != null) rows.push(["Declared criminal cases", cases > 0 ? `⚠ ${cases}` : "None declared"])
    if (rc?.term) rows.push(["Current term", rc.term])
    if (mla.phone) rows.push(["Contact (public)", mla.phone])

    if (rows.length) {
      lines.push("| Metric | Value |")
      lines.push("|---|---|")
      for (const [k, v] of rows) lines.push(`| ${k} | ${v} |`)
      lines.push("")
    }
    lines.push("_Source: Election Commission nomination affidavits via [MyNeta](https://myneta.info); attendance and LAD utilization from CIVIC Bengaluru via [opencity.in](https://opencity.in)._")
  } else {
    lines.push(`No MLA record matched this ward's constituency (\`${w.assembly_constituency ?? "—"}\`) in our current dataset.`)
  }
  lines.push("")
  lines.push("**Corporator seat:** vacant since BBMP administrator rule began in September 2020. Elections for the new GBA ward structure are pending.")
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## Contractors operating in this ward")
  lines.push("")

  if (contractorsHere.length === 0) {
    lines.push("No contractor from the city-wide top 100 shows work orders in this ward. The [kaun.city interactive view](https://kaun.city/?ward=" + w.ward_no + ") includes the full contractor list from BBMP work orders, not only the top 100 by value.")
  } else {
    lines.push(`${contractorsHere.length} contractor${contractorsHere.length === 1 ? "" : "s"} from the city-wide top 100 have ${contractorsHere.length === 1 ? "run" : "run"} contracts in this ward. Listed here by total city-wide value.`)
    lines.push("")
    lines.push("| Contractor | Total contracts (city) | Total value (city) | Wards worked | Flags |")
    lines.push("|---|---:|---:|---:|---|")
    for (const c of contractorsHere) {
      const flags = (c.blacklist_flags ?? []).length
        ? `⚠ ${c.blacklist_flags.length} flag${c.blacklist_flags.length === 1 ? "" : "s"}`
        : ""
      lines.push(`| ${c.canonical_name} | ${c.total_contracts} | ${fmtRupeesLakh(c.total_value_lakh)} | ${c.ward_count} | ${flags} |`)
    }
    const flagged = contractorsHere.filter(c => (c.blacklist_flags ?? []).length > 0)
    if (flagged.length) {
      lines.push("")
      lines.push("**Flagged contractors with ward activity:**")
      lines.push("")
      for (const c of flagged) {
        lines.push(`- **${c.canonical_name}** — ${c.blacklist_flags.join("; ")}`)
      }
    }
  }
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## Notable work orders in this ward")
  lines.push("")

  if (workOrdersHere.length === 0) {
    lines.push("No work orders from the city-wide top 200 (by sanctioned amount) are recorded against this ward. This does not mean no work has been ordered — smaller contracts are still visible on the [kaun.city interactive view](https://kaun.city/?ward=" + w.ward_no + ").")
  } else {
    const liveCount = workOrdersHere.filter(wo => wo.data_source === "ifms_direct").length
    const liveNote = liveCount > 0 ? ` **${liveCount} are live from BBMP IFMS** (with current bill-stage status);` : ""
    lines.push(`${workOrdersHere.length} work order${workOrdersHere.length === 1 ? "" : "s"} from the city-wide top 200 (by sanctioned amount) ${workOrdersHere.length === 1 ? "is" : "are"} recorded against this ward.${liveNote} the remainder come from the BBMP FY 2024-25 opencity mirror.`)
    lines.push("")
    lines.push("| Work order | FY | Contractor | Division | Sanctioned | Net paid | Bill stage |")
    lines.push("|---|---|---|---|---:|---:|---|")
    for (const wo of workOrdersHere) {
      const desc = (wo.description ?? "").replace(/<[^>]+>/g, "").substring(0, 80).trim()
      const contractor = wo.contractor_name ?? "—"
      const division = wo.division ? wo.division.substring(0, 40) : "—"
      const paymentStatus = wo.payment_status ?? (wo.data_source === "ifms_direct" ? "—" : "paid (legacy)")
      lines.push(`| ${wo.work_order_id} — ${desc} | ${wo.fy ?? "—"} | ${contractor} | ${division} | ${fmtRupeesPaise(wo.sanctioned_amount)} | ${fmtRupeesPaise(wo.net_paid)} | ${paymentStatus} |`)
    }
    lines.push("")
    lines.push("_**Bill stage** shows where an IFMS-sourced work order currently sits in the BBMP approval chain (13 internal levels). Opencity-mirrored rows are historical and marked *paid (legacy)*._")
  }
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## What the interactive view adds")
  lines.push("")
  lines.push("The [kaun.city view for Ward " + w.ward_no + "](https://kaun.city/?ward=" + w.ward_no + ") covers everything on this page plus:")
  lines.push("")
  lines.push("- **Spend tab** — ward-level spending by category (roads, drainage, water, waste), every work order with contractor phone and deduction rate, property tax collections, trade licences")
  lines.push("- **Citizen tab** — demographics, OSM amenities (hospitals, ATMs, toilets, EV charging, metro stations), water body pH/BOD/DO/coliform, road crashes, air quality, pothole complaints, Reddit community buzz")
  lines.push("- **Reach tab** — civic agency helplines, local office addresses (BESCOM division, police station, SRO), RTI draft generator, Sakala service-delivery rankings, grievance trends")
  lines.push("- **Who tab** — full MLA profile with assets, education, profession, age; ward committee meeting count; community-submitted facts")
  lines.push("- **Ask Kaun** — ask natural-language questions about this ward or compare against others")
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push(`_Auto-generated from the kaun.city public APIs. If anything looks wrong, the source of truth is the kaun.city Supabase database — please [open an issue](https://github.com/kaun-city/kaun/issues/new) with the ward number and the correction._`)
  lines.push("")

  return lines.join("\n")
}

function renderCityWorkOrders(workOrders, wardsByNo) {
  const lines = []
  lines.push("# BBMP Work Orders — Bengaluru (city-wide)")
  lines.push("")
  lines.push(`_Top ${workOrders.length} work orders across all 243 BBMP wards, ordered by sanctioned amount. Mixes **live IFMS data** (contractor code, division, budget head, current bill-stage approval status) with the **opencity.in mirror** (FY 2024-25 with net_paid / deduction values). Auto-generated from [kaun.city](https://kaun.city) public APIs._`)
  lines.push("")
  lines.push("---")
  lines.push("")

  // Summary section
  const live = workOrders.filter(w => w.data_source === "ifms_direct")
  const legacy = workOrders.filter(w => w.data_source !== "ifms_direct")
  const totalSanctioned = workOrders.reduce((s, w) => s + (w.sanctioned_amount ?? 0), 0)
  const fys = [...new Set(workOrders.map(w => w.fy).filter(Boolean))].sort()

  lines.push("## Summary")
  lines.push("")
  lines.push(`- **Shown:** ${workOrders.length} work orders · ${live.length} live (IFMS) · ${legacy.length} legacy (opencity)`)
  lines.push(`- **Total sanctioned value:** ${fmtRupeesPaise(totalSanctioned)}`)
  lines.push(`- **Financial years represented:** ${fys.length ? fys.join(", ") : "—"}`)

  // Top contractor by total value in this view
  const byContractor = new Map()
  for (const w of workOrders) {
    if (!w.contractor_name) continue
    byContractor.set(w.contractor_name, (byContractor.get(w.contractor_name) ?? 0) + (w.sanctioned_amount ?? 0))
  }
  const topContractor = [...byContractor.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topContractor) {
    lines.push(`- **Top contractor in this view:** ${topContractor[0]} — ${fmtRupeesPaise(topContractor[1])}`)
  }

  // Top division (IFMS rows only have this)
  const byDivision = new Map()
  for (const w of live) {
    if (!w.division) continue
    byDivision.set(w.division, (byDivision.get(w.division) ?? 0) + 1)
  }
  const topDivision = [...byDivision.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topDivision) {
    lines.push(`- **Most-active BBMP division (IFMS rows):** ${topDivision[0]} — ${topDivision[1]} work orders`)
  }
  lines.push("")

  // Bill-stage distribution (IFMS only)
  if (live.length) {
    const byStage = new Map()
    for (const w of live) {
      const stage = w.payment_status || "—"
      if (!byStage.has(stage)) byStage.set(stage, { count: 0, value: 0 })
      const entry = byStage.get(stage)
      entry.count++
      entry.value += w.sanctioned_amount ?? 0
    }
    const stages = [...byStage.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10)

    lines.push("### Where bills are stuck")
    lines.push("")
    lines.push("Live IFMS work orders by current approval-chain position. Payment references (e.g. \"000030 / 16-Apr-2026 RTGS\") indicate bills that have already been paid; named roles (e.g. *Addl. Commr. Finance*) indicate pending approvals.")
    lines.push("")
    lines.push("| Bill stage | Work orders | Total sanctioned |")
    lines.push("|---|---:|---:|")
    for (const [stage, { count, value }] of stages) {
      lines.push(`| ${stage} | ${count} | ${fmtRupeesPaise(value)} |`)
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("")
  lines.push(`## All ${workOrders.length} work orders (by sanctioned amount)`)
  lines.push("")
  lines.push("| # | Work order | FY | Ward | Contractor | Division | Sanctioned | Bill stage |")
  lines.push("|---:|---|---|---:|---|---|---:|---|")
  const sorted = [...workOrders].sort((a, b) => (b.sanctioned_amount ?? 0) - (a.sanctioned_amount ?? 0))
  sorted.forEach((w, i) => {
    const desc = (w.description ?? "").replace(/<[^>]+>/g, "").substring(0, 60).trim()
    // Only link the ward number if that ward has a wiki page (i.e. is in the
    // 243-ward BBMP list). GBA-structure wards 244+ land in IFMS data but
    // don't have per-ward wiki pages yet — render them as plain text to
    // avoid broken links.
    const ward = wardsByNo.get(w.ward_no)
    const wardLabel = w.ward_no
      ? (ward ? `[${w.ward_no}](wards/${w.ward_no}-${slugify(ward.ward_name)}.md)` : `${w.ward_no}`)
      : "—"
    const contractor = w.contractor_name ?? "—"
    const division = w.division ? w.division.substring(0, 32) : "—"
    const stage = w.payment_status ?? (w.data_source === "ifms_direct" ? "—" : "paid (legacy)")
    lines.push(`| ${i + 1} | ${w.work_order_id} — ${desc} | ${w.fy ?? "—"} | ${wardLabel} | ${contractor} | ${division} | ${fmtRupeesPaise(w.sanctioned_amount)} | ${stage} |`)
  })
  lines.push("")

  lines.push("---")
  lines.push("")
  lines.push("## Sources")
  lines.push("")
  lines.push("- **Live rows** come from the BBMP IFMS PublicView portal at [accounts.bbmp.gov.in/PublicView](https://accounts.bbmp.gov.in/PublicView/?l=1) via the [`ifms` adapter](https://github.com/kaun-city/kaun/blob/master/scripts/adapters/ifms.mjs), refreshed Sundays 02:00 UTC.")
  lines.push("- **Legacy rows** come from the [opencity.in](https://opencity.in) mirror of BBMP's FY 2024-25 work orders, loaded once via `seed-work-orders-full.mjs`.")
  lines.push("- For the interactive per-ward view (including tabs for amenities, water/air quality, grievances, service delivery, elected reps), see the [kaun.city map](https://kaun.city).")
  lines.push("- For the full dataset (bulk download as CSV/XLSX/JSON), the static exporter at `data.kaun.city/datasets/bbmp-work-orders.csv` is pending.")
  lines.push("")
  lines.push(`_Auto-generated from the kaun.city public APIs. If a row looks wrong, the source of truth is the kaun.city Supabase database — please [open an issue](https://github.com/kaun-city/kaun/issues/new) with the work order id._`)
  lines.push("")

  return lines.join("\n")
}

async function main() {
  console.log(`Fetching from ${API_BASE}...`)
  const [{ data: wards }, { data: reps }, { data: contractors }, spending] = await Promise.all([
    fetchJson("/api/data/wards"),
    fetchJson("/api/data/reps"),
    fetchJson("/api/data/contractors"),
    fetchJson("/api/data/spending"),
  ])
  const workOrders = spending.work_orders ?? []
  console.log(`  wards: ${wards.length}, reps: ${reps.length}, contractors: ${contractors.length}, work orders: ${workOrders.length}`)

  const mlaByConstituency = new Map()
  for (const r of reps) {
    if (r.role !== "MLA") continue
    mlaByConstituency.set(r.constituency, r)
  }

  const contractorsByWard = new Map()
  for (const c of contractors) {
    for (const wn of c.wards ?? []) {
      if (!contractorsByWard.has(wn)) contractorsByWard.set(wn, [])
      contractorsByWard.get(wn).push(c)
    }
  }
  for (const arr of contractorsByWard.values()) {
    arr.sort((a, b) => (b.total_value_lakh ?? 0) - (a.total_value_lakh ?? 0))
  }

  const workOrdersByWard = new Map()
  for (const wo of workOrders) {
    const wn = wo.ward_no
    if (wn == null) continue
    if (!workOrdersByWard.has(wn)) workOrdersByWard.set(wn, [])
    workOrdersByWard.get(wn).push(wo)
  }
  for (const arr of workOrdersByWard.values()) {
    arr.sort((a, b) => (b.sanctioned_amount ?? 0) - (a.sanctioned_amount ?? 0))
  }

  mkdirSync(WARDS_DIR, { recursive: true })

  for (const name of readdirSync(WARDS_DIR)) {
    if (name === "index.md" || name === "_template.md") continue
    if (name.endsWith(".md")) unlinkSync(join(WARDS_DIR, name))
  }

  const indexMd = renderIndex(wards, mlaByConstituency)
  writeFileSync(INDEX_PATH, indexMd)
  console.log(`  wrote ${INDEX_PATH}`)

  let pageCount = 0
  let wardsWithContractors = 0
  let wardsWithWorkOrders = 0
  for (const w of wards) {
    const mla = mlaByConstituency.get(w.assembly_constituency)
    const contractorsHere = contractorsByWard.get(w.ward_no) ?? []
    const workOrdersHere = (workOrdersByWard.get(w.ward_no) ?? []).slice(0, 10)
    if (contractorsHere.length) wardsWithContractors++
    if (workOrdersHere.length) wardsWithWorkOrders++
    const md = renderWardPage(w, mla, contractorsHere, workOrdersHere)
    writeFileSync(join(WARDS_DIR, wardFilename(w)), md)
    pageCount++
  }

  console.log(`  wrote ${pageCount} per-ward pages`)
  console.log(`    ${wardsWithContractors} wards have contractors from top-100 list`)
  console.log(`    ${wardsWithWorkOrders} wards have work orders from top-200 list`)

  const wardsByNo = new Map(wards.map(w => [w.ward_no, w]))
  const cityMd = renderCityWorkOrders(workOrders, wardsByNo)
  writeFileSync(CITY_WORK_ORDERS_PATH, cityMd)
  console.log(`  wrote ${CITY_WORK_ORDERS_PATH} (${workOrders.length} work orders)`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
