#!/usr/bin/env node
// refresh-kppp.mjs — Incrementally scrape KPPP tenders for BBMP
// Usage: node scripts/refresh-kppp.mjs [--full]
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN

import { dbQuery, upsertRows, selectRows } from "./lib/db.mjs"

const FULL = process.argv.includes("--full")
const KPPP_BASE = "https://kppp.karnataka.gov.in/supplier-registration-service/v1/api"
const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json, */*",
  "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)",
  "Origin": "https://kppp.karnataka.gov.in",
  "Referer": "https://kppp.karnataka.gov.in/",
}

const WARD_PATTERN = /ward\s*no\.?\s*(\d+)/i

function parseDate(s) {
  if (!s) return null
  try {
    // Format: "DD-MM-YYYY HH:mm:ss"
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

async function scrapeCategory(path, category, sinceDate) {
  const body = { category, status: "ALL", title: "BBMP" }
  let page = 0, all = [], total = 999

  while (all.length < total) {
    const { data, total: t } = await fetchPage(path, body, page)
    total = t
    if (!data.length) break

    // Filter by date (incremental mode)
    if (!FULL && sinceDate) {
      const filtered = data.filter(t => {
        const d = parseDate(t.publishedDate)
        return !d || d > sinceDate
      })
      all.push(...filtered)
      // If all items on this page are older, stop paginating
      if (filtered.length < data.length) break
    } else {
      all.push(...data)
    }
    page++
    // Small delay to be polite
    await new Promise(r => setTimeout(r, 300))
  }

  return all
}

function toRow(t) {
  const wardMatch = WARD_PATTERN.exec(t.title ?? "")
  return {
    city_id: "bengaluru",
    kppp_id: t.tenderNumber ?? t.id?.toString(),
    ward_no: wardMatch ? parseInt(wardMatch[1], 10) : null,
    title: (t.title ?? "").substring(0, 500),
    department: (t.deptName ?? "BBMP").substring(0, 200),
    value_lakh: t.ecv ? Math.round(t.ecv / 1000) / 100 : null,  // paise -> lakh
    status: t.status ?? "UNKNOWN",
    issued_date: parseDate(t.publishedDate),
    deadline: parseDate(t.tenderClosureDate),
    source_url: "https://kppp.karnataka.gov.in",
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] KPPP refresh started (${FULL ? "full" : "incremental"})`)

  // Get last inserted date for incremental mode
  let sinceDate = "2020-01-01"
  if (!FULL) {
    try {
      const rows = await dbQuery("SELECT MAX(issued_date)::text as last FROM tenders WHERE city_id='bengaluru';")
      if (rows[0]?.last) sinceDate = rows[0].last
    } catch (e) {
      console.warn("Could not get last date, using default:", e.message)
    }
  }
  console.log(`Fetching tenders published after: ${sinceDate}`)

  const sources = [
    { path: "portal-service/works/search-eproc-tenders",    category: "WORKS" },
    { path: "portal-service/search-eproc-tenders",          category: "GOODS" },
    { path: "portal-service/services/search-eproc-tenders", category: "SERVICES" },
  ]

  let totalUpserted = 0
  for (const { path, category } of sources) {
    try {
      const tenders = await scrapeCategory(path, category, sinceDate)
      console.log(`  ${category}: ${tenders.length} new/updated tenders`)
      if (!tenders.length) continue

      const rows = tenders.map(toRow).filter(r => r.kppp_id)
      // Batch upsert in chunks of 200
      for (let i = 0; i < rows.length; i += 200) {
        await upsertRows("tenders", rows.slice(i, i + 200), "kppp_id")
      }
      totalUpserted += rows.length
    } catch (e) {
      console.error(`  ${category} FAILED:`, e.message)
    }
  }

  console.log(`[${new Date().toISOString()}] Done. Upserted ${totalUpserted} tenders.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
