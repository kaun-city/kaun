#!/usr/bin/env node
// refresh-sakala.mjs — Scrape Sakala assembly-level performance rankings
// Usage: node scripts/refresh-sakala.mjs [--year 2025] [--month 13]
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN

import { upsertRows } from "./lib/db.mjs"

const SAKALA_BASE = "https://sakala.kar.nic.in/gsc_rpt/gsc_Reports/"
const YEAR  = parseInt(process.argv.find(a => a.startsWith("--year="))?.split("=")[1]  ?? new Date().getFullYear(), 10)
const MONTH = parseInt(process.argv.find(a => a.startsWith("--month="))?.split("=")[1] ?? "13", 10)  // 13 = all months

// Bengaluru Urban assembly constituencies (28 in BBMP)
const BENGALURU_ACS = new Set([
  "Malleshwaram","Gandhinagar","Jayanagar","Padmanabanagar","Bommanahalli",
  "Byatarayanapura","Chickpet","Hebbal","Vijayanagar","Mahadevapura",
  "Basavanagudi","Dasarahalli","Govindarajanagar","K.R. Pura","Yeshwanthapura",
  "Rajarajeshwarinagar","Chamrajapet","Pulakeshinagar","Shivajinagar","Rajajinagar",
  "C.V. Raman Nagar","Sarvagnanagar","Mahalakshmi Layout","Yelahanka","B.T.M Layout",
  "Shantinagar","Bangalore South","Nelamangala",
])

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").trim()
}

async function main() {
  console.log(`[${new Date().toISOString()}] Sakala refresh: year=${YEAR} month=${MONTH}`)

  // Step 1: Establish session
  const cookies = {}
  const r0 = await fetch("https://sakala.kar.nic.in/MISReport_Eng.aspx", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0)" },
    redirect: "follow",
  })
  const setCookie = r0.headers.getSetCookie?.() ?? []
  setCookie.forEach(c => {
    const [kv] = c.split(";")
    const [k, v] = kv.split("=")
    if (k?.trim()) cookies[k.trim()] = v?.trim() ?? ""
  })
  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ")

  // Step 2: GET the report page for viewstate
  const pageUrl = `${SAKALA_BASE}AssemblyPerformanceIntimeReport.aspx`
  const r1 = await fetch(pageUrl, {
    headers: { "User-Agent": "Mozilla/5.0", "Cookie": cookieStr },
  })
  const html1 = await r1.text()

  const vs  = html1.match(/id="__VIEWSTATE" value="([^"]+)"/)?.[1] ?? ""
  const vsg = html1.match(/id="__VIEWSTATEGENERATOR" value="([^"]+)"/)?.[1] ?? ""

  // Step 3: POST for BBMP dept
  const formData = new URLSearchParams({
    "__VIEWSTATE": vs,
    "__VIEWSTATEGENERATOR": vsg,
    "ctl00$gsc_Contentmaster$ddlDepartment": "BB",
    "ctl00$gsc_Contentmaster$ddlMonth": String(MONTH),
    "ctl00$gsc_Contentmaster$ddlYear": String(YEAR),
    "ctl00$gsc_Contentmaster$btnProcess": "Process",
  })

  const r2 = await fetch(pageUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      "Cookie": cookieStr,
    },
    body: formData.toString(),
  })
  const html2 = await r2.text()

  // Step 4: Parse rows
  const rowMatches = [...html2.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
  const rows = []

  for (const rm of rowMatches) {
    const cells = [...rm[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(c => stripTags(c[1]))
    if (cells.length < 5 || !/^\d+$/.test(cells[0])) continue

    const acName = cells[1].trim()
    rows.push({
      city_id: "bengaluru",
      assembly_name: acName,
      year: YEAR,
      month: MONTH,
      department_code: "BB",
      rank_intime: parseInt(cells[2], 10) || null,
      rank_receipts_per_lakh: parseInt(cells[3], 10) || null,
      rank_overall: parseInt(cells[4], 10) || null,
      data_source: "sakala.kar.nic.in",
      scraped_at: new Date().toISOString(),
    })
  }

  console.log(`  Parsed ${rows.length} rows`)

  // Filter to Bengaluru ACs (fuzzy match)
  const bengaluruRows = rows.filter(r => {
    for (const ac of BENGALURU_ACS) {
      if (r.assembly_name.toLowerCase().includes(ac.toLowerCase().split(" ")[0])) return true
    }
    return false
  })
  console.log(`  Bengaluru rows: ${bengaluruRows.length}`)

  if (bengaluruRows.length > 0) {
    await upsertRows("sakala_performance", bengaluruRows, "assembly_name,year,month,department_code")
    console.log(`[${new Date().toISOString()}] Upserted ${bengaluruRows.length} Sakala records.`)
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
