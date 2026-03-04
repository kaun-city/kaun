#!/usr/bin/env node
// refresh-trade-licenses.mjs — Re-download BBMP trade license CSVs from opencity.in
// Usage: node scripts/refresh-trade-licenses.mjs
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN

import { upsertRows } from "./lib/db.mjs"

const DATASET_ID = "f13f0085-cb3c-4e1b-92c2-1e3134e770f0"

function parseCsvLine(line) {
  const fields = []; let cur = "", inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === "," && !inQ) { fields.push(cur.trim()); cur = "" }
    else cur += ch
  }
  fields.push(cur.trim())
  return fields
}

async function main() {
  console.log(`[${new Date().toISOString()}] Trade licenses refresh started`)

  // Get resource list
  const pkgRes = await fetch(`https://data.opencity.in/api/3/action/package_show?id=${DATASET_ID}`)
  const pkg = await pkgRes.json()
  const resources = pkg.result?.resources ?? []
  console.log(`  ${resources.length} constituency CSVs found`)

  let totalUpserted = 0

  for (const res of resources) {
    const acName = res.name.replace(" Constituency Trade Licenses", "").trim()
    console.log(`  ${acName}...`)

    try {
      const r = await fetch(res.url, { headers: { "User-Agent": "KaunBot/1.0" } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const text = await r.text()
      const lines = text.split("\n").slice(1).filter(l => l.trim().length > 5)

      // Aggregate by ward x year
      const agg = new Map()
      for (const line of lines) {
        const f = parseCsvLine(line)
        if (f.length < 13) continue
        const appType = f[0], dateStr = f[1], paidStr = f[10], ward = f[12]?.trim()
        const majorTrade = f[5]?.trim() ?? ""
        if (!ward || ward.length < 2) continue
        const yearMatch = dateStr.match(/(\d{4})/)
        if (!yearMatch) continue
        const year = parseInt(yearMatch[1], 10)
        if (year < 2015 || year > 2030) continue
        const paid = parseFloat(paidStr.replace(/[^\d.]/g, "")) || 0
        const key = `${ward}|||${year}`
        if (!agg.has(key)) agg.set(key, { ward, ac: acName, year, total: 0, newL: 0, renewal: 0, revenue: 0, trades: new Map() })
        const d = agg.get(key)
        d.total++
        if (appType === "New") d.newL++; else d.renewal++
        d.revenue += paid
        if (majorTrade && majorTrade !== "\\N" && majorTrade.length > 2) {
          const t = majorTrade.substring(0, 50)
          d.trades.set(t, (d.trades.get(t) ?? 0) + 1)
        }
      }

      // Build rows
      const rows = []
      for (const d of agg.values()) {
        let topTrade = null, maxCount = 0
        for (const [t, c] of d.trades) { if (c > maxCount) { maxCount = c; topTrade = t } }
        rows.push({
          city_id: "bengaluru",
          ward_name: d.ward,
          assembly_constituency: d.ac,
          year: d.year,
          total_licenses: d.total,
          new_licenses: d.newL,
          renewals: d.renewal,
          total_revenue: Math.round(d.revenue * 100) / 100,
          top_trade_type: topTrade,
          data_source: "data.opencity.in",
        })
      }

      // Batch upsert
      for (let i = 0; i < rows.length; i += 100) {
        await upsertRows("ward_trade_licenses", rows.slice(i, i + 100), "ward_name,year")
      }
      totalUpserted += rows.length
      console.log(`    ${rows.length} ward-year rows upserted`)
    } catch (e) {
      console.error(`    FAILED: ${e.message}`)
    }
  }

  console.log(`[${new Date().toISOString()}] Done. Total upserted: ${totalUpserted}`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
