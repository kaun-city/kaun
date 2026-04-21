#!/usr/bin/env node
/**
 * scrape-ifms.mjs — Scrape BBMP IFMS PublicView for fresh work order data.
 *
 * Uses Playwright to navigate the BBMP IFMS Public View portal and
 * download ward-level work order data as XLSX, then parse and upsert.
 *
 * This is the upstream source that opencity.in scraped — going direct
 * gives us fresher data.
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   node scripts/scrape-ifms.mjs [--ward 42] [--all]
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { chromium } from "playwright"
import { upsertRows } from "./lib/db.mjs"

const BASE_URL = "https://accounts.bbmp.gov.in/PublicView/?l=1"
const WARD_ARG = process.argv.find(a => a.startsWith("--ward="))?.split("=")[1]
const ALL = process.argv.includes("--all")

const PHONE_RE = /(\d{10})$/

function extractContractor(raw) {
  if (!raw) return { name: null, phone: null }
  let s = raw.trim()
  const phoneMatch = PHONE_RE.exec(s)
  const phone = phoneMatch ? phoneMatch[1] : null
  if (phone) s = s.slice(0, -10).trim()
  s = s.replace(/^\d{6}\s*/, "").replace(/^(M\/[Ss]\.?\s*|Sri\.?\s*|Smt\.?\s*)/, "").replace(/[.,/]+$/, "").trim()
  return { name: s || null, phone }
}

async function scrapeWard(page, wardName) {
  console.log(`  Scraping ward: ${wardName}...`)

  try {
    // Navigate to PublicView
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 })

    // Find the ward search/select input and enter ward name
    // The PublicView UI varies — try common patterns
    const wardInput = await page.locator('input[placeholder*="Ward"], select[name*="ward"], input[name*="ward"]').first()
    if (await wardInput.count() === 0) {
      console.log(`  Could not find ward input field`)
      return []
    }

    await wardInput.fill(wardName)
    await page.waitForTimeout(1000)

    // Click search/submit
    const searchBtn = await page.locator('button:has-text("Search"), input[type="submit"], button:has-text("Go")').first()
    if (await searchBtn.count() > 0) {
      await searchBtn.click()
      await page.waitForTimeout(3000)
    }

    // Try to find and click XLSX download
    const downloadBtn = await page.locator('a:has-text("XLSX"), a:has-text("Excel"), button:has-text("Export")').first()
    if (await downloadBtn.count() > 0) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }),
        downloadBtn.click(),
      ])
      const path = await download.path()
      console.log(`  Downloaded: ${path}`)
      // TODO: Parse XLSX and return rows
      return []
    }

    // If no download button, try to scrape the table directly
    const tableRows = await page.locator("table tbody tr").all()
    const rows = []
    for (const row of tableRows) {
      const cells = await row.locator("td").allTextContents()
      if (cells.length >= 5) {
        const { name, phone } = extractContractor(cells[3] || "")
        rows.push({
          work_order_id: (cells[0] || "").trim(),
          description: (cells[1] || "").trim().substring(0, 1000),
          contractor_raw: (cells[3] || "").trim(),
          contractor_name: name,
          contractor_phone: phone,
          sanctioned_amount: parseFloat((cells[4] || "0").replace(/,/g, "")) || 0,
          net_paid: parseFloat((cells[5] || "0").replace(/,/g, "")) || 0,
          deduction: parseFloat((cells[6] || "0").replace(/,/g, "")) || 0,
        })
      }
    }
    console.log(`  Found ${rows.length} work orders in table`)
    return rows
  } catch (e) {
    console.error(`  Error scraping ${wardName}:`, e.message)
    return []
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] IFMS PublicView scraper started`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  })
  const page = await context.newPage()

  try {
    if (WARD_ARG) {
      // Single ward
      const rows = await scrapeWard(page, WARD_ARG)
      console.log(`Scraped ${rows.length} work orders for ward ${WARD_ARG}`)
    } else if (ALL) {
      // All wards — need ward list
      console.log("Scraping all wards... (this will take a while)")
      // TODO: Get ward list from Supabase or hardcode
      console.log("Not yet implemented. Use --ward=NAME for single ward.")
    } else {
      console.log("Usage:")
      console.log("  node scripts/scrape-ifms.mjs --ward=Koramangala")
      console.log("  node scripts/scrape-ifms.mjs --all")
      console.log("")
      console.log("Prerequisites:")
      console.log("  npm install playwright")
      console.log("  npx playwright install chromium")
    }
  } finally {
    await browser.close()
  }

  console.log(`[${new Date().toISOString()}] IFMS scraper done.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
