#!/usr/bin/env node
/**
 * ap-eproc.mjs — Adapter for AP e-Procurement awarded tenders.
 *
 * AP exposes awarded contract data publicly without login, unlike
 * Karnataka's KPPP and Telangana's tender portal. This adapter pulls
 * awarded tenders for Vizag-area entities.
 *
 * Source: tender.apeprocurement.gov.in
 *
 * Entities scraped (Vizag scope):
 *   - GVMC (Greater Visakhapatnam Municipal Corporation)
 *   - VMRDA (Vizag Metropolitan Region Development Authority)
 *   - Vizag Smart City (GVSCCL)
 *   - APIIC Visakhapatnam Zone (industrial parks)
 *   - APEPDCL (power distribution, HQ in Vizag)
 *
 * Run:  node scripts/adapters/ap-eproc.mjs --district=visakhapatnam
 *       node scripts/adapters/ap-eproc.mjs --department=GVMC
 *       node scripts/adapters/ap-eproc.mjs --since=2024-04-01
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 */

import { dbQuery, upsertRows } from "../lib/db.mjs"

const PORTAL = "https://tender.apeprocurement.gov.in"
const AWARDED_PATH = "/tenderAwardedDetails.html"

const VIZAG_DEPARTMENTS = [
  { code: "GVMC",     name: "Greater Visakhapatnam Municipal Corporation" },
  { code: "VMRDA",    name: "Visakhapatnam Metropolitan Region Development Authority" },
  { code: "GVSCCL",   name: "Vizag Smart City Corporation Ltd" },
  { code: "APIIC",    name: "AP Industrial Infrastructure Corp - Visakhapatnam Zone" },
  { code: "APEPDCL",  name: "AP Eastern Power Distribution Company" },
]

const HEADERS = {
  "User-Agent": "kaun-civic/1.0 (+https://kaun.city) civic-transparency-project",
  "Accept": "text/html,*/*;q=0.9",
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(45000),
    ...options,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.text()
}

// ─── HTML parsing ────────────────────────────────────────────

function extractTable(html, classRegex) {
  const tableRe = new RegExp(`<table[^>]*${classRegex.source}[^>]*>([\\s\\S]*?)<\\/table>`, "i")
  const tableMatch = tableRe.exec(html)
  if (!tableMatch) return []

  const tableBody = tableMatch[1]
  const rows = []
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rm
  let headers = null

  while ((rm = rowRe.exec(tableBody)) !== null) {
    const rowHtml = rm[1]
    if (!headers) {
      const heads = []
      const hRe = /<th[^>]*>([\s\S]*?)<\/th>/gi
      let hm
      while ((hm = hRe.exec(rowHtml)) !== null) {
        heads.push(hm[1].replace(/<[^>]+>/g, "").trim())
      }
      if (heads.length > 0) { headers = heads; continue }
    }
    const cells = []
    const cRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let cm
    while ((cm = cRe.exec(rowHtml)) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, "").trim())
    }
    if (headers && cells.length === headers.length) {
      const row = {}
      for (let i = 0; i < headers.length; i++) row[headers[i]] = cells[i]
      rows.push(row)
    }
  }
  return rows
}

// ─── Award scraping ──────────────────────────────────────────

/**
 * Fetch awarded tenders for a department.
 *
 * The portal uses ASP.NET-style postbacks for filtering. We submit a POST
 * to the awarded-tender details page with the right form fields.
 *
 * Returns: [{
 *   tender_id, title, department, district,
 *   ecv (estimated contract value), awarded_amount,
 *   awardee_name, published_date, awarded_date, status,
 *   source_url
 * }]
 */
async function fetchAwardedForDepartment(dept, sinceDate) {
  const url = `${PORTAL}${AWARDED_PATH}`
  const formBody = new URLSearchParams({
    department: dept.code,
    district: "Visakhapatnam",
    status: "AWARDED",
    fromDate: sinceDate,
    toDate: new Date().toISOString().slice(0, 10),
  })

  let html
  try {
    html = await fetchText(url, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    })
  } catch (e) {
    console.log(`  ${dept.code}: ${e.message} — falling back to GET landing page`)
    html = await fetchText(url).catch(() => null)
    if (!html) return []
  }

  // The awarded tenders table — class name varies; try a few patterns
  let rows = extractTable(html, /class="[^"]*awarded[^"]*"/i)
  if (rows.length === 0) rows = extractTable(html, /class="[^"]*tender-list[^"]*"/i)
  if (rows.length === 0) rows = extractTable(html, /class="[^"]*table-bordered[^"]*"/i)

  return rows.map(r => ({
    tender_id:       r["Tender ID"] ?? r["Tender Number"] ?? r["NIT Number"] ?? null,
    title:           r["Tender Title"] ?? r["Title"] ?? r["Description"] ?? null,
    department:      dept.code,
    district:        "Visakhapatnam",
    ecv:             parseFloat((r["ECV"] ?? r["Estimated Value"] ?? "0").replace(/[^0-9.]/g, "")) || null,
    awarded_amount:  parseFloat((r["Awarded Value"] ?? r["L1 Value"] ?? r["Awarded Amount"] ?? "0").replace(/[^0-9.]/g, "")) || null,
    awardee_name:    (r["Awardee"] ?? r["Bidder"] ?? r["L1 Bidder"] ?? r["Successful Bidder"] ?? "").trim() || null,
    published_date:  r["Published Date"] ?? r["Publish Date"] ?? null,
    awarded_date:    r["Awarded Date"] ?? r["Award Date"] ?? null,
    status:          "AWARDED",
    source_url:      url,
  })).filter(t => t.tender_id)
}

// ─── Persistence ─────────────────────────────────────────────

async function persistTenders(cityId, tenders) {
  if (tenders.length === 0) return 0

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS ap_eproc_awarded_tenders (
      tender_id        TEXT NOT NULL,
      city_id          TEXT NOT NULL,
      title            TEXT,
      department       TEXT,
      district         TEXT,
      ecv              NUMERIC,
      awarded_amount   NUMERIC,
      awardee_name     TEXT,
      published_date   DATE,
      awarded_date     DATE,
      status           TEXT,
      source_url       TEXT,
      updated_at       TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (tender_id, city_id)
    );
    CREATE INDEX IF NOT EXISTS ap_eproc_awardee_idx ON ap_eproc_awarded_tenders (awardee_name);
    CREATE INDEX IF NOT EXISTS ap_eproc_awarded_date_idx ON ap_eproc_awarded_tenders (awarded_date);
  `)

  const safeDate = (s) => {
    if (!s) return null
    // Try DD-MM-YYYY → YYYY-MM-DD
    const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s)
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
    // Try YYYY-MM-DD already
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return null
  }

  const dbRows = tenders.map(t => ({
    tender_id:      t.tender_id,
    city_id:        cityId,
    title:          (t.title || "").substring(0, 1000),
    department:     t.department,
    district:       t.district,
    ecv:            t.ecv,
    awarded_amount: t.awarded_amount,
    awardee_name:   t.awardee_name,
    published_date: safeDate(t.published_date),
    awarded_date:   safeDate(t.awarded_date),
    status:         t.status,
    source_url:     t.source_url,
    updated_at:     new Date().toISOString(),
  }))

  for (let i = 0; i < dbRows.length; i += 100) {
    await upsertRows("ap_eproc_awarded_tenders", dbRows.slice(i, i + 100), "tender_id,city_id")
  }
  return dbRows.length
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log(`[${new Date().toISOString()}] AP eProc adapter started`)
  const args = process.argv.slice(2)
  const districtArg  = args.find(a => a.startsWith("--district="))?.split("=")[1] ?? "visakhapatnam"
  const departmentArg = args.find(a => a.startsWith("--department="))?.split("=")[1] ?? null
  const sinceArg     = args.find(a => a.startsWith("--since="))?.split("=")[1] ?? "2024-04-01"

  const cityId = districtArg.toLowerCase()
  const depts  = departmentArg
    ? VIZAG_DEPARTMENTS.filter(d => d.code === departmentArg.toUpperCase())
    : VIZAG_DEPARTMENTS

  if (depts.length === 0) {
    console.error(`Unknown department: ${departmentArg}`)
    process.exit(1)
  }

  let totalUpserted = 0
  for (const dept of depts) {
    console.log(`\n── ${dept.code} (${dept.name}) ──`)
    try {
      const tenders = await fetchAwardedForDepartment(dept, sinceArg)
      console.log(`  Fetched: ${tenders.length} awarded tenders since ${sinceArg}`)
      const n = await persistTenders(cityId, tenders)
      console.log(`  Persisted: ${n}`)
      totalUpserted += n
    } catch (e) {
      console.error(`  ${dept.code} FAILED: ${e.message}`)
    }
    // Be polite
    await new Promise(r => setTimeout(r, 2000))
  }

  // Quick sanity report
  const summary = await dbQuery(`
    SELECT department, COUNT(*) AS n, SUM(awarded_amount)::numeric AS total_value
    FROM ap_eproc_awarded_tenders
    WHERE city_id = '${cityId.replace(/'/g, "''")}'
    GROUP BY department
    ORDER BY n DESC;
  `).catch(() => [])
  if (summary.length > 0) {
    console.log("\n── Summary by department ──")
    for (const r of summary) {
      console.log(`  ${r.department.padEnd(10)} ${String(r.n).padStart(5)} tenders   total ₹${Number(r.total_value || 0).toLocaleString("en-IN")}`)
    }
  }

  console.log(`\n[${new Date().toISOString()}] Done. ${totalUpserted} tenders upserted.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
