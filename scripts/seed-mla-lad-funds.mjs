/**
 * seed-mla-lad-funds.mjs
 * Downloads all 28 MLA LAD fund CSVs from opencity.in,
 * aggregates by constituency + FY, seeds to Supabase.
 *
 * Table: mla_lad_funds
 * Columns: assembly_constituency, financial_year, total_lakh, project_count, term (2013-2018)
 *
 * Disk-first: writes raw + aggregated JSON to cache/ before seeding.
 */

import { createWriteStream, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const CACHE_DIR = join(REPO_ROOT, '..', '..', '.openclaw', 'workspace-kaun', 'cache')
const RAW_DIR = join(CACHE_DIR, 'mla-lad-raw')

mkdirSync(RAW_DIR, { recursive: true })

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xgygxfyfsvccqqmtboeu.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneWd4Znlmc3ZjY3FxbXRib2V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU0ODU3MiwiZXhwIjoyMDg4MTI0NTcyfQ.zCPcKcaQizydhiaCbzk67ron7zKax07Uxj5YkcZ5Dbo'
const MGMT_TOKEN = 'sbp_8226477e680b438942c021e7b534bd0ba53bf56b'
const PROJECT_ID = 'xgygxfyfsvccqqmtboeu'

const PACKAGE_ID = 'c4c0b7a1-a90c-438b-841e-e33d6cca8504'
const CKAN_API = `https://data.opencity.in/api/3/action/package_show?id=bengaluru-mla-local-area-development-funds`

// AC name normalisation - match our canonical names in elected_reps
const AC_NORMALISE = {
  'Yelahanka': 'Yelahanka',
  'KR Puram': 'K R Puram',
  'Byatarayanapura': 'Byatarayanapura',
  'Rajarajeshwari Nagar': 'Rajarajeshwari Nagar',
  'Dasarahalli': 'Dasarahalli',
  'Mahalakshmi Layout': 'Mahalakshmi Layout',
  'Malleshwaram': 'Malleshwaram',
  'Hebbal': 'Hebbal',
  'Pulakeshinagar': 'Pulakeshinagar',
  'Sarvajnanagar': 'Sarvajnanagar',
  'CV Raman Nagar': 'C V Raman Nagar',
  'Shivajinagar': 'Shivajinagar',
  'Shanti Nagar': 'Shanti Nagar',
  'Gandhi Nagar': 'Gandhi Nagar',
  'Rajajinagar': 'Rajajinagar',
  'Govindaraj Nagar': 'Govindaraja Nagar',
  'Vijayanagar': 'Vijayanagar',
  'Chamrajpet': 'Chamrajpet',
  'Chickpet': 'Chickpet',
  'Basavanagudi': 'Basavanagudi',
  'BTM Layout': 'BTM Layout',
  'Jayanagar': 'Jayanagar',
  'Bommanahalli': 'Bommanahalli',
  'Bangalore South': 'Bangalore South',
  'Padmanabhanagar': 'Padmanabhanagar',
  'Mahadevapura': 'Mahadevapura',
  'Anekal': 'Anekal',
  'Yeshvanthapura': 'Yeshvanthapura',
}

async function fetchJSON(url) {
  const res = await fetch(url)
  return res.json()
}

async function fetchCSV(url) {
  const res = await fetch(url)
  return res.text()
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  // header: Sl No.,Financial Year,Sl No,Work Name - Original,Work Name - English,Value (Rs. Lakhs)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // CSV with possible quoted fields
    const cols = parseCSVLine(line)
    if (cols.length < 6) continue
    const fy = cols[1]?.trim()
    const valueStr = cols[5]?.trim().replace(/,/g, '')
    const value = parseFloat(valueStr)
    if (!fy || isNaN(value)) continue
    rows.push({ fy, value_lakh: value })
  }
  return rows
}

function parseCSVLine(line) {
  const cols = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cols.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cols.push(current)
  return cols
}

function extractACFromName(resourceName) {
  // e.g. "Karnataka MLA LAD Funds - AC 150 Yelahanka (2013-2018)"
  const match = resourceName.match(/AC \d+ (.+?) \(/)
  if (!match) return null
  const raw = match[1].trim()
  return AC_NORMALISE[raw] || raw
}

async function supabaseQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data
}

async function main() {
  console.log('=== MLA LAD Funds Seeder ===')

  // Step 1: Create table
  console.log('Creating table mla_lad_funds...')
  await supabaseQuery(`
    CREATE TABLE IF NOT EXISTS mla_lad_funds (
      id SERIAL PRIMARY KEY,
      assembly_constituency TEXT NOT NULL,
      financial_year TEXT NOT NULL,
      total_lakh NUMERIC(10,2),
      project_count INTEGER,
      term TEXT DEFAULT '2013-2018',
      data_source TEXT DEFAULT 'opencity.in',
      UNIQUE(assembly_constituency, financial_year, term)
    );
  `)
  console.log('Table ready.')

  // Step 2: Fetch resource list from CKAN
  console.log('Fetching resource list...')
  const pkg = await fetchJSON(CKAN_API)
  const resources = pkg.result.resources.filter(r => r.format === 'CSV')
  console.log(`Found ${resources.length} CSV resources`)

  // Write resource list to cache
  const resourceList = resources.map(r => ({
    id: r.id,
    name: r.name,
    url: r.url,
    ac: extractACFromName(r.name),
  }))
  writeFileSync(
    join(CACHE_DIR, 'mla-lad-resources.json'),
    JSON.stringify(resourceList, null, 2)
  )
  console.log('Resource list written to cache/mla-lad-resources.json')

  // Step 3: Download, parse, aggregate
  const aggregated = [] // { assembly_constituency, financial_year, total_lakh, project_count }

  for (const resource of resourceList) {
    if (!resource.ac) {
      console.warn(`Skipping (no AC name): ${resource.name}`)
      continue
    }

    const rawPath = join(RAW_DIR, `${resource.id}.csv`)

    let csvText
    if (existsSync(rawPath)) {
      console.log(`  Using cached: ${resource.ac}`)
      csvText = readFileSync(rawPath, 'utf8')
    } else {
      console.log(`  Downloading: ${resource.ac}...`)
      csvText = await fetchCSV(resource.url)
      writeFileSync(rawPath, csvText, 'utf8') // CACHE IMMEDIATELY
    }

    const rows = parseCSV(csvText)
    if (rows.length === 0) {
      console.warn(`  No rows parsed for ${resource.ac}`)
      continue
    }

    // Aggregate by FY
    const byFY = {}
    for (const row of rows) {
      if (!byFY[row.fy]) byFY[row.fy] = { total: 0, count: 0 }
      byFY[row.fy].total += row.value_lakh
      byFY[row.fy].count++
    }

    let totalAC = 0
    for (const [fy, agg] of Object.entries(byFY)) {
      aggregated.push({
        assembly_constituency: resource.ac,
        financial_year: fy.trim(),
        total_lakh: Math.round(agg.total * 100) / 100,
        project_count: agg.count,
      })
      totalAC += agg.total
    }
    // Also add term total row
    aggregated.push({
      assembly_constituency: resource.ac,
      financial_year: 'ALL',
      total_lakh: Math.round(totalAC * 100) / 100,
      project_count: rows.length,
    })

    console.log(`  ${resource.ac}: ${rows.length} projects, Rs.${Math.round(totalAC)} L total`)
  }

  // Write aggregated to cache
  writeFileSync(
    join(CACHE_DIR, 'mla-lad-aggregated.json'),
    JSON.stringify(aggregated, null, 2)
  )
  console.log(`\nAggregated ${aggregated.length} rows written to cache/mla-lad-aggregated.json`)

  // Step 4: Seed to Supabase
  console.log('\nSeeding to Supabase...')
  let seeded = 0
  const BATCH = 50

  for (let i = 0; i < aggregated.length; i += BATCH) {
    const batch = aggregated.slice(i, i + BATCH)
    const values = batch.map(r =>
      `('${r.assembly_constituency.replace(/'/g, "''")}', '${r.financial_year.replace(/'/g, "''")}', ${r.total_lakh}, ${r.project_count}, '2013-2018', 'opencity.in')`
    ).join(',\n')

    await supabaseQuery(`
      INSERT INTO mla_lad_funds (assembly_constituency, financial_year, total_lakh, project_count, term, data_source)
      VALUES ${values}
      ON CONFLICT (assembly_constituency, financial_year, term) DO UPDATE
        SET total_lakh = EXCLUDED.total_lakh,
            project_count = EXCLUDED.project_count;
    `)
    seeded += batch.length
    console.log(`  Seeded ${seeded}/${aggregated.length}`)
  }

  console.log('\n=== Done ===')
  console.log(`Table: mla_lad_funds | Rows seeded: ${aggregated.length}`)
  console.log('Cache files: cache/mla-lad-resources.json, cache/mla-lad-aggregated.json, cache/mla-lad-raw/*.csv')
}

main().catch(e => { console.error(e); process.exit(1) })
