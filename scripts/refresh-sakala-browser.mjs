#!/usr/bin/env node
// refresh-sakala-browser.mjs — Sakala scraper using Playwright (headless browser)
// The Sakala site blocks raw HTTP requests with redirect loops.
// This version uses a real browser to handle ASP.NET session/ViewState.
//
// Usage: node scripts/refresh-sakala-browser.mjs [--year 2026] [--month 13]
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
// Deps:  npx playwright install chromium

import { chromium } from "playwright"
import { upsertRows } from "./lib/db.mjs"

const YEAR  = parseInt(process.argv.find(a => a.startsWith("--year="))?.split("=")[1]  ?? new Date().getFullYear(), 10)
const MONTH = parseInt(process.argv.find(a => a.startsWith("--month="))?.split("=")[1] ?? "13", 10)

const BENGALURU_ACS = new Set([
  "Malleshwaram","Gandhinagar","Jayanagar","Padmanabanagar","Bommanahalli",
  "Byatarayanapura","Chickpet","Hebbal","Vijayanagar","Mahadevapura",
  "Basavanagudi","Dasarahalli","Govindarajanagar","K.R. Pura","Yeshwanthapura",
  "Rajarajeshwarinagar","Chamrajapet","Pulakeshinagar","Shivajinagar","Rajajinagar",
  "C.V. Raman Nagar","Sarvagnanagar","Mahalakshmi Layout","Yelahanka","B.T.M Layout",
  "Shantinagar","Bangalore South","Nelamangala",
])

async function main() {
  console.log(`[${new Date().toISOString()}] Sakala browser refresh: year=${YEAR} month=${MONTH}`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    // Navigate to the report page
    const reportUrl = "https://sakala.kar.nic.in/gsc_rpt/gsc_Reports/AssemblyPerformanceIntimeReport.aspx"
    console.log("  Navigating to Sakala report page...")
    await page.goto(reportUrl, { waitUntil: "networkidle", timeout: 30000 })

    // The site redirects to a menu page — click through to Assembly report
    if (!page.url().includes("AssemblyPerformance")) {
      console.log(`  Landed on menu: ${page.url()}`)
      // The link is in a dropdown menu — hover parent first, then click
      console.log("  Hovering 'Performance Reports' menu...")
      await page.hover("a:has-text('Performance Reports')")
      await page.waitForTimeout(500)
      console.log("  Clicking 'Assembly wise Performance Report'...")
      await page.click("a:has-text('Assembly wise Performance Report')", { force: true })
      await page.waitForLoadState("networkidle", { timeout: 15000 })
      console.log(`  Now on: ${page.url()}`)
    }

    // Select BBMP department
    console.log("  Selecting BBMP department...")
    await page.waitForSelector("#ctl00_gsc_Contentmaster_ddlDepartment", { timeout: 10000 })
    await page.selectOption("#ctl00_gsc_Contentmaster_ddlDepartment", "BB")
    await page.waitForTimeout(1000)

    // Select year
    console.log(`  Selecting year=${YEAR}...`)
    await page.selectOption("#ctl00_gsc_Contentmaster_ddlYear", String(YEAR))
    await page.waitForTimeout(500)

    // Select month
    console.log(`  Selecting month=${MONTH}...`)
    await page.selectOption("#ctl00_gsc_Contentmaster_ddlMonth", String(MONTH))
    await page.waitForTimeout(500)

    // Click Process
    console.log("  Clicking Process...")
    await page.click("#ctl00_gsc_Contentmaster_btnProcess")
    await page.waitForTimeout(3000)

    // Wait for table to appear
    await page.waitForSelector("table", { timeout: 15000 }).catch(() => {})

    // Extract table rows
    const rows = await page.evaluate(() => {
      const results = []
      const tables = document.querySelectorAll("table")
      for (const table of tables) {
        const trs = table.querySelectorAll("tr")
        for (const tr of trs) {
          const cells = [...tr.querySelectorAll("td, th")].map(c => c.textContent?.trim() ?? "")
          if (cells.length >= 5 && /^\d+$/.test(cells[0])) {
            results.push(cells)
          }
        }
      }
      return results
    })

    console.log(`  Parsed ${rows.length} rows from page`)

    const dbRows = rows.map(cells => ({
      city_id: "bengaluru",
      assembly_name: cells[1],
      year: YEAR,
      month: MONTH,
      department_code: "BB",
      rank_intime: parseInt(cells[2], 10) || null,
      rank_receipts_per_lakh: parseInt(cells[3], 10) || null,
      rank_overall: parseInt(cells[4], 10) || null,
      data_source: "sakala.kar.nic.in",
      scraped_at: new Date().toISOString(),
    }))

    // Filter to Bengaluru ACs
    const bengaluruRows = dbRows.filter(r => {
      for (const ac of BENGALURU_ACS) {
        if (r.assembly_name.toLowerCase().includes(ac.toLowerCase().split(" ")[0])) return true
      }
      return false
    })
    console.log(`  Bengaluru rows: ${bengaluruRows.length}`)

    // Deduplicate by assembly_name (keep first match)
    const seen = new Set()
    const dedupedRows = bengaluruRows.filter(r => {
      const key = `${r.assembly_name}|${r.year}|${r.month}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    console.log(`  After dedup: ${dedupedRows.length}`)

    if (dedupedRows.length > 0) {
      await upsertRows("sakala_performance", dedupedRows, "assembly_name,year,month,department_code")
      console.log(`[${new Date().toISOString()}] Upserted ${dedupedRows.length} Sakala records.`)
    } else {
      console.log("  No Bengaluru rows found. Page may have changed or returned empty.")
      // Save page HTML for debugging
      const html = await page.content()
      console.log(`  Page title: ${await page.title()}`)
      console.log(`  Page HTML length: ${html.length}`)
      console.log(`  First 500 chars: ${html.substring(0, 500)}`)
    }
  } finally {
    await browser.close()
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
