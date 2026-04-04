#!/usr/bin/env node
// refresh-grievances.mjs — Pull latest BBMP grievances from data.opencity.in
// Usage: node scripts/refresh-grievances.mjs [--year 2025]
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN

import { dbQuery, upsertRows } from "./lib/db.mjs"
import { createReadStream } from "fs"
import { writeFile, unlink } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

const TARGET_YEAR = process.argv.find(a => a.startsWith("--year="))?.split("=")[1]

const DATASET_ID = "bbmp-grievances-data"

// Parse CSV text into objects (handles quoted fields)
function parseCsv(text) {
  const lines = text.trim().split("\n")
  if (!lines.length) return []
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim())
  return lines.slice(1).map(line => {
    // Simple CSV parse (handles basic quoting)
    const values = []
    let cur = "", inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === "," && !inQuote) { values.push(cur.trim()); cur = "" }
      else cur += ch
    }
    values.push(cur.trim())
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]))
  })
}

function aggregate(rows) {
  const wards = {}
  for (const row of rows) {
    const ward = (row["Ward Name"] ?? "").trim()
    if (!ward || ward.length < 2) continue
    if (!wards[ward]) wards[ward] = { total: 0, closed: 0, in_progress: 0, registered: 0, reopened: 0 }
    wards[ward].total++
    const status = (row["Grievance Status"] ?? "").trim()
    if (status === "Closed")      wards[ward].closed++
    if (status === "In Progress") wards[ward].in_progress++
    if (status === "Registered")  wards[ward].registered++
    if (status === "ReOpen")      wards[ward].reopened++
  }
  return wards
}

async function main() {
  console.log(`[${new Date().toISOString()}] Grievances refresh started`)

  // Get available datasets from CKAN
  const pkgRes = await fetch(`https://data.opencity.in/api/3/action/package_show?id=${DATASET_ID}`)
  const pkg = await pkgRes.json()
  const resources = pkg.result?.resources ?? []

  for (const res of resources) {
    const yearMatch = res.name?.match(/\b(202\d)\b/)
    if (!yearMatch) continue
    const year = parseInt(yearMatch[1], 10)
    if (TARGET_YEAR && year !== parseInt(TARGET_YEAR, 10)) continue
    if (year < new Date().getFullYear() - 1) { console.log(`  Skipping ${year} (too old)`); continue }

    // Check current count in DB
    let existingCount = 0
    try {
      const rows = await dbQuery(
        `SELECT COALESCE(SUM(total_complaints),0) as total FROM ward_grievances WHERE year=${year} AND category='ALL';`
      )
      existingCount = parseInt(rows[0]?.total ?? "0", 10)
    } catch {}

    console.log(`  ${year}: DB has ${existingCount} complaints; downloading CSV...`)

    try {
      const csvRes = await fetch(res.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)" },
      })
      if (!csvRes.ok) throw new Error(`HTTP ${csvRes.status}`)

      const csvText = await csvRes.text()
      const allRows = parseCsv(csvText)
      console.log(`  ${year}: ${allRows.length} rows in source`)

      if (allRows.length <= existingCount && existingCount > 0) {
        console.log(`  ${year}: no new data, skipping`)
        continue
      }

      // Aggregate by ward
      const wardMap = aggregate(allRows)
      const upsertRows_ = Object.entries(wardMap).map(([ward, stats]) => ({
        city_id: "bengaluru",
        ward_name: ward,
        year,
        category: "ALL",
        total_complaints: stats.total,
        closed: stats.closed,
        in_progress: stats.in_progress,
        registered: stats.registered,
        reopened: stats.reopened,
        data_source: "data.opencity.in",
      }))

      // Batch upsert
      for (let i = 0; i < upsertRows_.length; i += 100) {
        await upsertRows("ward_grievances", upsertRows_.slice(i, i + 100), "ward_name,year,category")
      }
      console.log(`  ${year}: upserted ${upsertRows_.length} ward rows`)

    } catch (e) {
      console.error(`  ${year} FAILED:`, e.message)
    }
  }

  console.log(`[${new Date().toISOString()}] Grievances refresh done.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
