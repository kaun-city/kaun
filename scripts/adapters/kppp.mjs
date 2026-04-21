#!/usr/bin/env node
// kppp.mjs — Incrementally scrape KPPP tenders across multiple BBMP-area agencies.
// Usage: node scripts/adapters/kppp.mjs [--full] [--dry-run]
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN

import { dbQuery, upsertRows } from "../lib/db.mjs"

const FULL = process.argv.includes("--full")
const DRY_RUN = process.argv.includes("--dry-run")
const KPPP_BASE = "https://kppp.karnataka.gov.in/supplier-registration-service/v1/api"
const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json, */*",
  "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)",
  "Origin": "https://kppp.karnataka.gov.in",
  "Referer": "https://kppp.karnataka.gov.in/",
}

const AGENCIES = ["BBMP", "BWSSB", "BDA", "BESCOM"]
const CATEGORIES = [
  { path: "portal-service/works/search-eproc-tenders",    category: "WORKS" },
  { path: "portal-service/search-eproc-tenders",          category: "GOODS" },
  { path: "portal-service/services/search-eproc-tenders", category: "SERVICES" },
]

const WARD_PATTERN = /ward\s*no\.?\s*(\d+)/i

function parseDate(s) {
  if (!s) return null
  try {
    const [datePart] = s.split(" ")
    const [d, m, y] = datePart.split("-")
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  } catch { return null }
}

async function fetchPage(path, body, page) {
  const url = `${KPPP_BASE}/${path}?page=${page}&size=100&order-by-tender-publish=true`
  const res = await fetch(url, { method: "POST", headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`KPPP ${path} page ${page}: ${res.status}`)
  const total = parseInt(res.headers.get("X-Total-Count") || "0", 10)
  const data = await res.json()
  return { data, total }
}

async function scrapeCategory(path, category, agency, sinceDate) {
  const body = { category, status: "ALL", title: agency }
  let page = 0, all = [], total = 999

  while (all.length < total) {
    const { data, total: t } = await fetchPage(path, body, page)
    total = t
    if (!data.length) break

    if (!FULL && sinceDate) {
      const filtered = data.filter(x => {
        const d = parseDate(x.publishedDate)
        return !d || d > sinceDate
      })
      all.push(...filtered)
      if (filtered.length < data.length) break
    } else {
      all.push(...data)
    }
    page++
    await new Promise(r => setTimeout(r, 300))
  }

  return all
}

function toRow(t, agency) {
  const wardMatch = WARD_PATTERN.exec(t.title ?? "")
  return {
    city_id: "bengaluru",
    kppp_id: t.tenderNumber ?? t.id?.toString(),
    agency,
    ward_no: wardMatch ? parseInt(wardMatch[1], 10) : null,
    title: (t.title ?? "").substring(0, 500),
    department: (t.deptName ?? agency).substring(0, 200),
    value_lakh: t.ecv ? Math.round(t.ecv / 1000) / 100 : null,
    status: t.status ?? "UNKNOWN",
    issued_date: parseDate(t.publishedDate),
    deadline: parseDate(t.tenderClosureDate),
    source_url: "https://kppp.karnataka.gov.in",
  }
}

async function ensureAgencyColumn() {
  if (DRY_RUN) return
  try {
    await dbQuery("ALTER TABLE tenders ADD COLUMN IF NOT EXISTS agency text;")
  } catch (e) {
    console.warn("Could not ensure agency column (continuing):", e.message)
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  console.log(`[${startedAt}] KPPP refresh started (${FULL ? "full" : "incremental"}${DRY_RUN ? ", dry-run" : ""})`)
  console.log(`  Agencies: ${AGENCIES.join(", ")}`)

  await ensureAgencyColumn()

  let sinceDate = "2020-01-01"
  if (!FULL && !DRY_RUN) {
    try {
      const rows = await dbQuery("SELECT MAX(issued_date)::text as last FROM tenders WHERE city_id='bengaluru';")
      if (rows[0]?.last) sinceDate = rows[0].last
    } catch (e) {
      console.warn("Could not get last date, using default:", e.message)
    }
  }
  console.log(`  Fetching tenders published after: ${sinceDate}`)

  // Collect across all (agency, category) combinations.
  // De-dupe by kppp_id with first-agency-wins since cross-agency overlap is rare.
  const byId = new Map()
  const perAgency = {}

  for (const agency of AGENCIES) {
    perAgency[agency] = { fetched: 0, kept: 0 }
    for (const { path, category } of CATEGORIES) {
      try {
        const tenders = await scrapeCategory(path, category, agency, sinceDate)
        perAgency[agency].fetched += tenders.length

        for (const t of tenders) {
          const row = toRow(t, agency)
          if (!row.kppp_id) continue
          if (!byId.has(row.kppp_id)) {
            byId.set(row.kppp_id, row)
            perAgency[agency].kept++
          }
        }
        console.log(`  ${agency}/${category}: ${tenders.length} fetched`)
      } catch (e) {
        console.error(`  ${agency}/${category} FAILED:`, e.message)
      }
    }
  }

  const rows = Array.from(byId.values())
  console.log(`  Unique tenders to upsert: ${rows.length}`)
  for (const a of AGENCIES) {
    console.log(`    ${a}: ${perAgency[a].kept} unique (${perAgency[a].fetched} fetched across categories)`)
  }

  if (DRY_RUN) {
    console.log(`[${new Date().toISOString()}] Dry run complete. No writes performed.`)
    console.log("  Sample row:", JSON.stringify(rows[0] ?? {}, null, 2))
    return
  }

  for (let i = 0; i < rows.length; i += 200) {
    await upsertRows("tenders", rows.slice(i, i + 200), "kppp_id")
  }

  console.log(`[${new Date().toISOString()}] Done. Upserted ${rows.length} tenders across ${AGENCIES.length} agencies.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
