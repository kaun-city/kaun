#!/usr/bin/env node
// refresh-sakala.mjs — Scrape Sakala assembly-level performance rankings
// Usage: node scripts/refresh-sakala.mjs [--year=2025] [--month=13]
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
//
// sakala.kar.nic.in blocks GitHub Actions (and other cloud) IPs but answers
// residential IPs fine, so the scrape and the Supabase load are split:
//
//   --fetch-only --out=<path>   Scrape + parse only, write rows to a JSON
//                                artifact (e.g. data/sakala/sakala-2026.json).
//                                No Supabase env required. Run this locally
//                                from a residential connection, commit the
//                                artifact, then dispatch the `load-sakala`
//                                workflow (CI, no site access needed) to
//                                upsert it — see scripts/load-sakala.mjs.
//   (no flag)                   Original behaviour: scrape and upsert to
//                                Supabase directly, unchanged.
const SAKALA_BASE = "https://sakala.kar.nic.in/gsc_rpt/gsc_Reports/"
const YEAR  = parseInt(process.argv.find(a => a.startsWith("--year="))?.split("=")[1]  ?? new Date().getFullYear(), 10)
const MONTH = parseInt(process.argv.find(a => a.startsWith("--month="))?.split("=")[1] ?? "13", 10)  // 13 = all months
const FETCH_ONLY = process.argv.includes("--fetch-only")
const OUT_PATH = process.argv.find(a => a.startsWith("--out="))?.split("=")[1]

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

  // Step 1: Establish session.
  // sakala.kar.nic.in's landing page redirects several times
  // (MISReport_Eng.aspx -> gsc_rpt_menu.aspx -> ...) and mints a fresh
  // ASP.NET_SessionId on every hop that doesn't present a cookie back.
  // undici's fetch(redirect:"follow") does NOT resend Set-Cookie values
  // between its own internal redirect hops, so that chain used to loop
  // forever ("redirect count exceeded") — this is why the scraper broke,
  // independent of any cloud-IP block. Fix: follow redirects manually and
  // carry the cookie jar forward ourselves.
  const cookies = {}
  let hopUrl = "https://sakala.kar.nic.in/MISReport_Eng.aspx"
  for (let hop = 0; hop < 8; hop++) {
    const cookieStr0 = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ")
    const r0 = await fetch(hopUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0)",
        ...(cookieStr0 ? { Cookie: cookieStr0 } : {}),
      },
      redirect: "manual",
    })
    const setCookie = r0.headers.getSetCookie?.() ?? []
    setCookie.forEach(c => {
      const [kv] = c.split(";")
      const [k, v] = kv.split("=")
      if (k?.trim()) cookies[k.trim()] = v?.trim() ?? ""
    })
    if (![301, 302, 303, 307, 308].includes(r0.status)) break
    const loc = r0.headers.get("location")
    if (!loc) break
    hopUrl = new URL(loc, hopUrl).toString()
  }
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

  if (FETCH_ONLY) {
    if (!OUT_PATH) {
      console.error("--fetch-only requires --out=<path>")
      process.exit(1)
    }
    const { mkdirSync, writeFileSync } = await import("fs")
    const { dirname } = await import("path")
    mkdirSync(dirname(OUT_PATH), { recursive: true })
    const artifact = {
      fetched_at: new Date().toISOString(),
      source: "sakala.kar.nic.in",
      year: YEAR,
      month: MONTH,
      row_count: bengaluruRows.length,
      rows: bengaluruRows,
    }
    writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2) + "\n")
    console.log(`[${new Date().toISOString()}] Wrote ${bengaluruRows.length} rows to ${OUT_PATH} (fetch-only, no Supabase write).`)
    return
  }

  if (bengaluruRows.length > 0) {
    // Deferred import: lib/db.mjs exits at import time if Supabase env vars
    // are missing, which --fetch-only mode must not require.
    const { upsertRows } = await import("./lib/db.mjs")
    await upsertRows("sakala_performance", bengaluruRows, "assembly_name,year,month,department_code")
    console.log(`[${new Date().toISOString()}] Upserted ${bengaluruRows.length} Sakala records.`)
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
