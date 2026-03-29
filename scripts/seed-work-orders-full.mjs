#!/usr/bin/env node
/**
 * seed-work-orders-full.mjs — Ingest the complete BBMP work order corpus.
 *
 * Downloads and consolidates work order data from multiple sources:
 *   1. BBMP Work Orders 2024-25 (243 wards, new delimitation) — single CSV
 *   2. BBMP Work Orders 2013-2022 (198 wards) — per-ward CSVs via CKAN API
 *   3. BBMP IFMS Public View — live upstream for freshest data (optional)
 *
 * After ingestion, runs contractor entity resolution:
 *   - Extracts phone numbers embedded in contractor names
 *   - Normalizes contractor names (strip phone, M/S prefix, trim)
 *   - Groups by phone number to link aliases of the same entity
 *   - Computes per-contractor aggregates (total value, ward spread, deduction rate)
 *
 * Source: opencity.in (CC BY 4.0) + BBMP IFMS (public records)
 * Run:    node scripts/seed-work-orders-full.mjs [--historical]
 * Env:    SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 */

import { dbQuery, upsertRows } from "./lib/db.mjs"

const HISTORICAL = process.argv.includes("--historical")

// ─── Data sources ─────────────────────────────────────────────
const SOURCES = {
  // Single CSV covering all wards under new delimitation (updated URL 2026-03)
  fy2024_25: "https://data.opencity.in/dataset/4e539082-aca3-4df0-b676-dc1655cf17d2/resource/67637545-30aa-4a6c-80fa-b46bc22bdc24/download",
  // CKAN package ID for per-ward historical CSVs (2013-2022)
  historical_package: "bbmp-work-orders-by-ward-2013-2022",
  ckan_api: "https://data.opencity.in/api/3/action",
}

// ─── CSV parser (handles quoted fields with commas) ───────────
function parseCsv(text) {
  const lines = text.trim().split("\n")
  if (!lines.length) return []
  const headers = parseRow(lines[0])
  return lines.slice(1).map(line => {
    const values = parseRow(line)
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? "").trim()]))
  }).filter(row => Object.values(row).some(v => v))
}

function parseRow(line) {
  const values = []
  let cur = "", inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === "," && !inQuote) { values.push(cur); cur = "" }
    else cur += ch
  }
  values.push(cur)
  return values
}

// ─── Contractor name/phone extraction ─────────────────────────
const PHONE_RE = /(\d{10})$/
const PREFIX_RE = /^(M\/[Ss]\.?\s*|Sri\.?\s*|Smt\.?\s*)/

function extractContractor(raw) {
  if (!raw) return { name: null, phone: null }
  let s = raw.trim()

  // Extract trailing 10-digit phone
  const phoneMatch = PHONE_RE.exec(s)
  const phone = phoneMatch ? phoneMatch[1] : null
  if (phone) s = s.slice(0, -10).trim()

  // Remove leading 6-digit ID if present
  s = s.replace(/^\d{6}\s*/, "")

  // Normalize name
  s = s.replace(PREFIX_RE, "").trim()
  // Remove trailing punctuation
  s = s.replace(/[.,/]+$/, "").trim()

  return { name: s || null, phone }
}

// ─── Work order row normalization ─────────────────────────────
function normalizeRow(raw, wardNo, fy) {
  const amount = parseFloat(raw.amount || raw.Amount || raw.sanctioned_amount || "0")
  const nett = parseFloat(raw.nett || raw.Nett || raw.net_paid || raw["Amount Paid"] || "0")
  const deduction = parseFloat(raw.deduction || raw.Deduction || raw.Balance || "0")
  const woId = raw["wo num"] || raw["Work Order Reference Number"] || raw.work_order_id || ""
  const desc = raw.wodetails || raw["Work Order Code & Description"] || raw.description || ""
  const contractorRaw = raw.contractor || raw["Contractor Name & Phone"] || ""
  const { name, phone } = extractContractor(contractorRaw)

  // Try to extract ward from work order number (format: WARD-YY-XXXXXX)
  const woWardMatch = woId.match(/^(\d+)-/)
  const resolvedWard = wardNo || (woWardMatch ? parseInt(woWardMatch[1], 10) : null)

  return {
    work_order_id: woId.trim(),
    ward_no: resolvedWard,
    description: desc.substring(0, 1000),
    contractor_raw: contractorRaw.trim().substring(0, 500),
    contractor_name: name?.substring(0, 300) || null,
    contractor_phone: phone,
    sanctioned_amount: amount || 0,
    net_paid: nett || 0,
    deduction: deduction || Math.max(0, amount - nett),
    fy: fy || "",
  }
}

// ─── Fetch + parse a CSV URL ──────────────────────────────────
async function fetchCsv(url, label) {
  console.log(`  Fetching ${label}...`)
  const res = await fetch(url, {
    headers: { "User-Agent": "kaun-civic/1.0 (civic-transparency-project)" },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${label}`)
  const text = await res.text()
  const rows = parseCsv(text)
  console.log(`  ${label}: ${rows.length} rows`)
  return rows
}

// ─── Historical: fetch per-ward CSVs via CKAN ─────────────────
async function fetchHistoricalWards() {
  console.log("\nFetching historical ward CSVs via CKAN API...")
  let resources = []
  try {
    const pkgRes = await fetch(
      `${SOURCES.ckan_api}/package_show?id=${SOURCES.historical_package}`,
      { headers: { "User-Agent": "kaun-civic/1.0 (civic-transparency-project)" } }
    )
    if (!pkgRes.ok) throw new Error(`CKAN ${pkgRes.status}`)
    const pkg = await pkgRes.json()
    resources = pkg.result?.resources ?? []
    console.log(`Found ${resources.length} resource files in package`)
  } catch (e) {
    console.error("CKAN API failed, trying direct URLs:", e.message)
    return []
  }

  const allRows = []
  for (const res of resources) {
    if (!res.url || !res.format?.toLowerCase().includes("csv")) continue
    // Extract ward number from resource name (e.g., "Ward 001" or "ward-1")
    const wardMatch = res.name?.match(/ward[- _]?0*(\d+)/i)
    const wardNo = wardMatch ? parseInt(wardMatch[1], 10) : null

    try {
      const rows = await fetchCsv(res.url, res.name || `Ward ${wardNo}`)
      for (const row of rows) {
        allRows.push(normalizeRow(row, wardNo, "2013-2022"))
      }
      // Be polite
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      console.error(`  FAILED ${res.name}:`, e.message)
    }
  }
  return allRows
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] Full work order ingestion started`)

  // Step 1: Ensure table exists with contractor columns
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS bbmp_work_orders (
      id               SERIAL PRIMARY KEY,
      work_order_id    TEXT,
      ward_no          INTEGER,
      description      TEXT,
      contractor       TEXT,
      contractor_raw   TEXT,
      contractor_name  TEXT,
      contractor_phone TEXT,
      sanctioned_amount NUMERIC DEFAULT 0,
      net_paid         NUMERIC DEFAULT 0,
      deduction        NUMERIC DEFAULT 0,
      fy               TEXT,
      city_id          TEXT DEFAULT 'bengaluru',
      UNIQUE (work_order_id, ward_no)
    );
  `)

  // Add columns if they don't exist (for existing tables)
  for (const col of ["contractor_raw TEXT", "contractor_name TEXT", "contractor_phone TEXT"]) {
    const [name] = col.split(" ")
    await dbQuery(`ALTER TABLE bbmp_work_orders ADD COLUMN IF NOT EXISTS ${col};`).catch(() => {})
  }
  console.log("Table bbmp_work_orders ready.")

  // Step 2: Fetch 2024-25 data (primary — uses 243-ward numbering)
  console.log("\n── 2024-25 Work Orders (243 wards) ──")
  let rows2024 = []
  try {
    const raw = await fetchCsv(SOURCES.fy2024_25, "2024-25 all wards")
    rows2024 = raw.map(r => normalizeRow(r, null, "2024-25"))
    console.log(`Normalized ${rows2024.length} rows for 2024-25`)
  } catch (e) {
    console.error("Failed to fetch 2024-25 data:", e.message)
  }

  // Step 3: Fetch historical data (optional, slower)
  let rowsHistorical = []
  if (HISTORICAL) {
    console.log("\n── Historical Work Orders (2013-2022) ──")
    rowsHistorical = await fetchHistoricalWards()
    console.log(`Total historical rows: ${rowsHistorical.length}`)
  }

  // Step 4: Upsert all work orders
  const allRows = [...rows2024, ...rowsHistorical]
  console.log(`\nTotal rows to upsert: ${allRows.length}`)

  const dbRows = allRows
    .filter(r => r.work_order_id && r.ward_no)
    .map(r => ({
      work_order_id: r.work_order_id,
      ward_no: r.ward_no,
      description: r.description,
      contractor: r.contractor_raw,
      contractor_raw: r.contractor_raw,
      contractor_name: r.contractor_name,
      contractor_phone: r.contractor_phone,
      sanctioned_amount: r.sanctioned_amount,
      net_paid: r.net_paid,
      deduction: r.deduction,
      fy: r.fy,
      city_id: "bengaluru",
    }))

  for (let i = 0; i < dbRows.length; i += 200) {
    await upsertRows("bbmp_work_orders", dbRows.slice(i, i + 200), "work_order_id,ward_no")
  }
  console.log(`Upserted ${dbRows.length} work orders.`)

  // Step 5: Build contractor profiles
  console.log("\n── Building contractor profiles ──")
  await buildContractorProfiles()

  console.log(`\n[${new Date().toISOString()}] Full work order ingestion done.`)
}

// ─── Contractor profile aggregation ───────────────────────────
async function buildContractorProfiles() {
  // Create contractor_profiles table
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS contractor_profiles (
      id                SERIAL PRIMARY KEY,
      entity_id         TEXT UNIQUE NOT NULL,
      canonical_name    TEXT NOT NULL,
      aliases           TEXT[] DEFAULT '{}',
      phone             TEXT,
      total_contracts   INTEGER DEFAULT 0,
      total_value_lakh  NUMERIC DEFAULT 0,
      total_paid_lakh   NUMERIC DEFAULT 0,
      total_deduction_lakh NUMERIC DEFAULT 0,
      avg_deduction_pct NUMERIC DEFAULT 0,
      ward_count        INTEGER DEFAULT 0,
      wards             INTEGER[] DEFAULT '{}',
      first_seen        TEXT,
      last_seen         TEXT,
      is_govt_entity    BOOLEAN DEFAULT FALSE,
      blacklist_flags   TEXT[] DEFAULT '{}',
      city_id           TEXT DEFAULT 'bengaluru',
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Aggregate from work orders, grouping by phone (primary) or normalized name (fallback)
  const profileSql = `
    WITH contractor_agg AS (
      SELECT
        COALESCE(contractor_phone, LOWER(TRIM(contractor_name))) as entity_key,
        contractor_phone as phone,
        -- Pick the most common name variant as canonical
        MODE() WITHIN GROUP (ORDER BY contractor_name) as canonical_name,
        ARRAY_AGG(DISTINCT contractor_name) FILTER (WHERE contractor_name IS NOT NULL) as aliases,
        COUNT(*) as total_contracts,
        ROUND(SUM(sanctioned_amount)::numeric / 100000, 2) as total_value_lakh,
        ROUND(SUM(net_paid)::numeric / 100000, 2) as total_paid_lakh,
        ROUND(SUM(deduction)::numeric / 100000, 2) as total_deduction_lakh,
        ROUND(
          CASE WHEN SUM(sanctioned_amount) > 0
            THEN (SUM(deduction) * 100.0 / SUM(sanctioned_amount))::numeric
            ELSE 0 END, 2
        ) as avg_deduction_pct,
        COUNT(DISTINCT ward_no) as ward_count,
        ARRAY_AGG(DISTINCT ward_no) FILTER (WHERE ward_no IS NOT NULL) as wards,
        MIN(fy) as first_seen,
        MAX(fy) as last_seen,
        -- Flag known government entities
        BOOL_OR(
          UPPER(contractor_name) LIKE '%KRIDL%'
          OR UPPER(contractor_name) LIKE '%KARNATAKA RURAL INFRASTRUCTURE%'
          OR UPPER(contractor_name) LIKE '%BWSSB%'
          OR UPPER(contractor_name) LIKE '%BESCOM%'
        ) as is_govt_entity
      FROM bbmp_work_orders
      WHERE contractor_name IS NOT NULL
        AND city_id = 'bengaluru'
      GROUP BY entity_key, contractor_phone
      HAVING COUNT(*) >= 1
    )
    SELECT
      COALESCE('ph_' || phone, 'nm_' || entity_key) as entity_id,
      canonical_name,
      aliases,
      phone,
      total_contracts,
      total_value_lakh,
      total_paid_lakh,
      total_deduction_lakh,
      avg_deduction_pct,
      ward_count,
      wards,
      first_seen,
      last_seen,
      is_govt_entity
    FROM contractor_agg
    ORDER BY total_value_lakh DESC;
  `

  const profiles = await dbQuery(profileSql)
  console.log(`Generated ${profiles.length} contractor profiles`)

  if (profiles.length === 0) return

  // Upsert profiles
  const rows = profiles.map(p => ({
    entity_id: p.entity_id,
    canonical_name: p.canonical_name || "Unknown",
    aliases: p.aliases || [],
    phone: p.phone,
    total_contracts: parseInt(p.total_contracts, 10),
    total_value_lakh: parseFloat(p.total_value_lakh),
    total_paid_lakh: parseFloat(p.total_paid_lakh),
    total_deduction_lakh: parseFloat(p.total_deduction_lakh),
    avg_deduction_pct: parseFloat(p.avg_deduction_pct),
    ward_count: parseInt(p.ward_count, 10),
    wards: p.wards || [],
    first_seen: p.first_seen,
    last_seen: p.last_seen,
    is_govt_entity: p.is_govt_entity || false,
    blacklist_flags: [],
    city_id: "bengaluru",
    updated_at: new Date().toISOString(),
  }))

  for (let i = 0; i < rows.length; i += 100) {
    await upsertRows("contractor_profiles", rows.slice(i, i + 100), "entity_id")
  }

  // Print top 10 by value
  console.log("\nTop 10 contractors by total value:")
  for (const p of profiles.slice(0, 10)) {
    const aliases = (p.aliases || []).length > 1 ? ` (also: ${p.aliases.slice(1, 3).join(", ")})` : ""
    console.log(`  ${p.canonical_name}${aliases}: Rs ${p.total_value_lakh} lakh across ${p.ward_count} wards, ${p.total_contracts} contracts, deduction ${p.avg_deduction_pct}%`)
  }

  // Print suspicious patterns
  console.log("\nMulti-ward contractors (>10 wards):")
  for (const p of profiles.filter(p => p.ward_count > 10)) {
    console.log(`  ${p.canonical_name}: ${p.ward_count} wards, Rs ${p.total_value_lakh} lakh`)
  }

  console.log("\nHigh deduction rate (>15%, min 3 contracts):")
  for (const p of profiles.filter(p => p.avg_deduction_pct > 15 && p.total_contracts >= 3)) {
    console.log(`  ${p.canonical_name}: ${p.avg_deduction_pct}% deduction, ${p.total_contracts} contracts`)
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
