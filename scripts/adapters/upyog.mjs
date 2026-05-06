#!/usr/bin/env node
/**
 * upyog.mjs — Adapter for AP's UPYOG/eMunicipal platform.
 *
 * One adapter, all 123 AP ULBs. Different ULBs share the same UPYOG
 * backend (eGov Foundation's DIGIT-Urban) — only the subdomain changes.
 *
 * Sources:
 *   - apcdmaopenportal.emunicipal.ap.gov.in     — analytics dashboards (no login)
 *   - {ulb}.emunicipal.ap.gov.in                — citizen portal (lookups, no login for read)
 *
 * What this adapter pulls:
 *   - Grievances per ward (open, closed, avg resolution time, top categories)
 *   - Property tax aggregates per ward (demand vs collection)
 *   - Trade licence activity per ward
 *   - Service request analytics (channel mix, SLA breaches)
 *
 * Strategy:
 *   1. The CDMA open portal renders dashboards as HTML with embedded
 *      <script>window.__INITIAL_STATE__ = {...}</script> blobs. Parse those.
 *   2. Where dashboards aren't structured, fall back to scraping HTML tables.
 *   3. All data lands in Supabase tables with city_id filter.
 *
 * Run:
 *   node scripts/adapters/upyog.mjs --ulb=visakhapatnam
 *   node scripts/adapters/upyog.mjs --ulb=vijayawada
 *   node scripts/adapters/upyog.mjs --all              # all 123 AP ULBs
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 */

import { dbQuery, upsertRows } from "../lib/db.mjs"

// ─── ULB → city_id mapping ───────────────────────────────────
//
// Every entry here must (a) match a row in the cities config registry
// (apps/web/lib/cities/*) and (b) match the {ulb} subdomain pattern at
// {ulb}.emunicipal.ap.gov.in.

const ULB_REGISTRY = {
  visakhapatnam: { city_id: "visakhapatnam", subdomain: "visakhapatnam", name: "Greater Visakhapatnam Municipal Corporation" },
  vijayawada:    { city_id: "vijayawada",    subdomain: "vijayawada",    name: "Vijayawada Municipal Corporation" },
  tirupati:      { city_id: "tirupati",      subdomain: "tirupati",      name: "Tirupati Municipal Corporation" },
  guntur:        { city_id: "guntur",        subdomain: "guntur",        name: "Guntur Municipal Corporation" },
  kakinada:      { city_id: "kakinada",      subdomain: "kakinada",      name: "Kakinada Municipal Corporation" },
  nellore:       { city_id: "nellore",       subdomain: "nellore",       name: "Nellore Municipal Corporation" },
  kurnool:       { city_id: "kurnool",       subdomain: "kurnool",       name: "Kurnool Municipal Corporation" },
  rajahmundry:   { city_id: "rajahmundry",   subdomain: "rajahmundry",   name: "Rajahmundry Municipal Corporation" },
  // ... 115 others. Add as we register cities.
}

// ─── CDMA Open Portal endpoints ──────────────────────────────

const CDMA_OPEN_PORTAL = "https://apcdmaopenportal.emunicipal.ap.gov.in"
const CDMA_BASE = "https://cdma.ap.gov.in"

// ─── HTTP helpers ────────────────────────────────────────────

const HEADERS = {
  "User-Agent": "kaun-civic/1.0 (+https://kaun.city) civic-transparency-project",
  "Accept": "text/html,application/json,*/*;q=0.9",
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30000),
    ...options,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.text()
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { ...HEADERS, "Accept": "application/json" },
    signal: AbortSignal.timeout(30000),
    ...options,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.json()
}

// ─── HTML/JSON extraction ────────────────────────────────────

/** Extract embedded JSON from a <script>window.__X = {...}</script> blob. */
function extractEmbeddedState(html, varName = "__INITIAL_STATE__") {
  const re = new RegExp(`window\\.${varName}\\s*=\\s*(\\{[\\s\\S]*?\\});`, "m")
  const m = re.exec(html)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

/** Parse HTML table into array of objects keyed by header text. */
function parseHtmlTable(html, tableSelectorRegex) {
  const tableMatch = tableSelectorRegex.exec(html)
  if (!tableMatch) return []
  const tableHtml = tableMatch[0]

  const headers = []
  const headerRe = /<th[^>]*>([\s\S]*?)<\/th>/gi
  let m
  while ((m = headerRe.exec(tableHtml)) !== null) {
    headers.push(m[1].replace(/<[^>]+>/g, "").trim())
  }

  const rows = []
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rm
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    const cells = []
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let cm
    while ((cm = cellRe.exec(rm[1])) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, "").trim())
    }
    if (cells.length === headers.length && cells.length > 0) {
      const row = {}
      for (let i = 0; i < headers.length; i++) row[headers[i]] = cells[i]
      rows.push(row)
    }
  }
  return rows
}

// ─── Domain extraction ───────────────────────────────────────

/**
 * Pull grievance aggregates for a given ULB from the CDMA Open Portal.
 *
 * The portal has a /pgr or /grievances dashboard page that exposes filters
 * by ULB, date range, and ward. The first request resolves the ULB code,
 * subsequent requests fetch the dashboard data.
 *
 * Returns: [{ ward_no, open, closed, in_progress, avg_resolution_days,
 *             top_category, period }]
 */
async function fetchGrievances(ulb) {
  // Step 1: get the dashboard page for this ULB
  const url = `${CDMA_OPEN_PORTAL}/grievances?ulb=${encodeURIComponent(ulb.name)}`
  const html = await fetchText(url).catch(() => null)
  if (!html) {
    console.log(`  ${ulb.city_id}: grievance dashboard not reachable; skipping (likely renamed endpoint)`)
    return []
  }

  // Step 2: prefer embedded state JSON; fall back to table scraping
  const state = extractEmbeddedState(html)
  if (state?.grievances?.byWard) {
    return state.grievances.byWard.map(w => ({
      ward_no:                w.wardNo ?? null,
      open:                   w.open ?? 0,
      closed:                 w.closed ?? 0,
      in_progress:            w.inProgress ?? 0,
      avg_resolution_days:    w.avgResolutionDays ?? null,
      top_category:           w.topCategory ?? null,
      period:                 state.grievances.period ?? "current",
    }))
  }

  // Fallback: HTML table
  const tableRe = /<table[^>]*class="[^"]*ward-grievances[^"]*"[\s\S]*?<\/table>/i
  const rows = parseHtmlTable(html, tableRe)
  return rows.map(r => ({
    ward_no:             parseInt(r["Ward"] ?? r["Ward No"] ?? "0", 10) || null,
    open:                parseInt(r["Open"] ?? "0", 10) || 0,
    closed:              parseInt(r["Closed"] ?? "0", 10) || 0,
    in_progress:         parseInt(r["In Progress"] ?? "0", 10) || 0,
    avg_resolution_days: parseFloat(r["Avg Resolution (days)"] ?? "0") || null,
    top_category:        r["Top Category"] ?? null,
    period:              "current",
  }))
}

/**
 * Pull property-tax aggregates for a given ULB.
 *
 * Returns: [{ ward_no, demand, collection, balance, fy }]
 */
async function fetchPropertyTax(ulb) {
  const url = `${CDMA_OPEN_PORTAL}/revenue?ulb=${encodeURIComponent(ulb.name)}&head=property-tax`
  const html = await fetchText(url).catch(() => null)
  if (!html) {
    console.log(`  ${ulb.city_id}: revenue dashboard not reachable; skipping`)
    return []
  }

  const state = extractEmbeddedState(html)
  if (state?.revenue?.propertyTax?.byWard) {
    return state.revenue.propertyTax.byWard.map(w => ({
      ward_no:    w.wardNo ?? null,
      demand:     parseFloat(w.demand ?? 0) || 0,
      collection: parseFloat(w.collection ?? 0) || 0,
      balance:    parseFloat(w.balance ?? 0) || 0,
      fy:         state.revenue.fy ?? "2025-26",
    }))
  }

  const tableRe = /<table[^>]*class="[^"]*property-tax[^"]*"[\s\S]*?<\/table>/i
  const rows = parseHtmlTable(html, tableRe)
  return rows.map(r => ({
    ward_no:    parseInt(r["Ward"] ?? "0", 10) || null,
    demand:     parseFloat((r["Demand"] ?? "0").replace(/,/g, "")) || 0,
    collection: parseFloat((r["Collection"] ?? "0").replace(/,/g, "")) || 0,
    balance:    parseFloat((r["Balance"] ?? "0").replace(/,/g, "")) || 0,
    fy:         "2025-26",
  }))
}

/**
 * Pull trade-licence activity for a given ULB.
 *
 * Returns: [{ ward_no, new, renewals, cancelled, total_revenue, fy }]
 */
async function fetchTradeLicences(ulb) {
  const url = `${CDMA_OPEN_PORTAL}/revenue?ulb=${encodeURIComponent(ulb.name)}&head=trade-licence`
  const html = await fetchText(url).catch(() => null)
  if (!html) return []

  const state = extractEmbeddedState(html)
  if (state?.revenue?.tradeLicence?.byWard) {
    return state.revenue.tradeLicence.byWard.map(w => ({
      ward_no:       w.wardNo ?? null,
      new_licences:  parseInt(w.new ?? 0, 10) || 0,
      renewals:      parseInt(w.renewals ?? 0, 10) || 0,
      cancelled:     parseInt(w.cancelled ?? 0, 10) || 0,
      total_revenue: parseFloat(w.totalRevenue ?? 0) || 0,
      fy:            state.revenue.fy ?? "2025-26",
    }))
  }
  return []
}

// ─── Persistence ─────────────────────────────────────────────

async function persistGrievances(cityId, rows) {
  if (rows.length === 0) return 0
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS upyog_grievances (
      city_id              TEXT NOT NULL,
      ward_no              INTEGER NOT NULL,
      open_count           INTEGER DEFAULT 0,
      closed_count         INTEGER DEFAULT 0,
      in_progress_count    INTEGER DEFAULT 0,
      avg_resolution_days  NUMERIC,
      top_category         TEXT,
      period               TEXT,
      updated_at           TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (city_id, ward_no, period)
    );
  `)
  const dbRows = rows
    .filter(r => r.ward_no != null)
    .map(r => ({
      city_id:             cityId,
      ward_no:             r.ward_no,
      open_count:          r.open,
      closed_count:        r.closed,
      in_progress_count:   r.in_progress,
      avg_resolution_days: r.avg_resolution_days,
      top_category:        r.top_category,
      period:              r.period,
      updated_at:          new Date().toISOString(),
    }))
  for (let i = 0; i < dbRows.length; i += 100) {
    await upsertRows("upyog_grievances", dbRows.slice(i, i + 100), "city_id,ward_no,period")
  }
  return dbRows.length
}

async function persistPropertyTax(cityId, rows) {
  if (rows.length === 0) return 0
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS upyog_property_tax (
      city_id     TEXT NOT NULL,
      ward_no     INTEGER NOT NULL,
      demand      NUMERIC DEFAULT 0,
      collection  NUMERIC DEFAULT 0,
      balance     NUMERIC DEFAULT 0,
      fy          TEXT NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (city_id, ward_no, fy)
    );
  `)
  const dbRows = rows
    .filter(r => r.ward_no != null)
    .map(r => ({ ...r, city_id: cityId, updated_at: new Date().toISOString() }))
  for (let i = 0; i < dbRows.length; i += 100) {
    await upsertRows("upyog_property_tax", dbRows.slice(i, i + 100), "city_id,ward_no,fy")
  }
  return dbRows.length
}

async function persistTradeLicences(cityId, rows) {
  if (rows.length === 0) return 0
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS upyog_trade_licences (
      city_id        TEXT NOT NULL,
      ward_no        INTEGER NOT NULL,
      new_licences   INTEGER DEFAULT 0,
      renewals       INTEGER DEFAULT 0,
      cancelled      INTEGER DEFAULT 0,
      total_revenue  NUMERIC DEFAULT 0,
      fy             TEXT NOT NULL,
      updated_at     TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (city_id, ward_no, fy)
    );
  `)
  const dbRows = rows
    .filter(r => r.ward_no != null)
    .map(r => ({ ...r, city_id: cityId, updated_at: new Date().toISOString() }))
  for (let i = 0; i < dbRows.length; i += 100) {
    await upsertRows("upyog_trade_licences", dbRows.slice(i, i + 100), "city_id,ward_no,fy")
  }
  return dbRows.length
}

// ─── Per-ULB run ─────────────────────────────────────────────

async function runForUlb(ulbKey) {
  const ulb = ULB_REGISTRY[ulbKey]
  if (!ulb) {
    console.error(`Unknown ULB: ${ulbKey}. Add it to ULB_REGISTRY first.`)
    return
  }
  console.log(`\n── ${ulb.city_id} (${ulb.name}) ──`)

  try {
    const [grievances, propertyTax, tradeLicences] = await Promise.all([
      fetchGrievances(ulb),
      fetchPropertyTax(ulb),
      fetchTradeLicences(ulb),
    ])

    const [g, p, t] = await Promise.all([
      persistGrievances(ulb.city_id, grievances),
      persistPropertyTax(ulb.city_id, propertyTax),
      persistTradeLicences(ulb.city_id, tradeLicences),
    ])
    console.log(`  Grievances: ${g} ward rows`)
    console.log(`  Property tax: ${p} ward rows`)
    console.log(`  Trade licences: ${t} ward rows`)
  } catch (e) {
    console.error(`  ${ulb.city_id} FAILED: ${e.message}`)
  }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log(`[${new Date().toISOString()}] UPYOG adapter started`)
  const args = process.argv.slice(2)
  const ulbArg = args.find(a => a.startsWith("--ulb="))?.split("=")[1]
  const all = args.includes("--all")

  if (ulbArg) {
    await runForUlb(ulbArg)
  } else if (all) {
    for (const key of Object.keys(ULB_REGISTRY)) {
      await runForUlb(key)
      // Be polite — pause between ULBs
      await new Promise(r => setTimeout(r, 1500))
    }
  } else {
    console.log("Usage:")
    console.log("  node scripts/adapters/upyog.mjs --ulb=visakhapatnam")
    console.log("  node scripts/adapters/upyog.mjs --all")
    console.log("")
    console.log("Available ULBs:")
    for (const [k, v] of Object.entries(ULB_REGISTRY)) {
      console.log(`  ${k.padEnd(15)} ${v.name}`)
    }
  }

  console.log(`\n[${new Date().toISOString()}] Done.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
