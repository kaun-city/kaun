/**
 * seed-boundaries.mjs
 * Converts bengawalk TopoJSON boundary data to GeoJSON and seeds into Supabase.
 * Source: https://cityofficials.bengawalk.com/boundaries.json (GPL-3)
 * Boundary types seeded: bescom_division, bescom_subdivision, bwssb_division,
 *   bwssb_service_station, police_city, police_traffic
 *
 * Run: node scripts/seed-boundaries.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as topojson from 'topojson-client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xgygxfyfsvccqqmtboeu.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

// Only seed these boundary types
const TYPES_TO_SEED = new Set([
  'bescom_division',
  'bescom_subdivision',
  'bwssb_division',
  'bwssb_service_station',
  'police_city',
  'police_traffic',
])

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY env var required')
  process.exit(1)
}

const topoPath = resolve(__dirname, '../data/bengawalk-boundaries.json')
console.log('Reading', topoPath)
const topology = JSON.parse(readFileSync(topoPath, 'utf8'))

// Convert entire topology to GeoJSON FeatureCollection
const geojson = topojson.feature(topology, topology.objects.boundaries)
console.log(`Total features: ${geojson.features.length}`)

// Filter to types we want
const features = geojson.features.filter(f => TYPES_TO_SEED.has(f.properties?.id))
console.log(`Filtered to ${features.length} features for seeding`)

// Group by type for reporting
const byType = {}
for (const f of features) {
  const t = f.properties.id
  byType[t] = (byType[t] || 0) + 1
}
console.log('By type:', byType)

// Clear existing and reseed
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/xgygxfyfsvccqqmtboeu/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_MANAGEMENT_TOKEN || SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`DB error ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function seed() {
  // Clear existing boundary data
  await query(`DELETE FROM boundary_lookup WHERE boundary_type IN (${[...TYPES_TO_SEED].map(t => `'${t}'`).join(',')})`)
  console.log('Cleared existing rows')

  let inserted = 0
  const BATCH = 50

  for (let i = 0; i < features.length; i += BATCH) {
    const batch = features.slice(i, i + BATCH)
    const values = batch
      .filter(f => f.geometry) // skip null geometries
      .map(f => {
        const name = (f.properties.namecol || '').replace(/'/g, "''")
        const type = f.properties.id
        const geom = JSON.stringify(f.geometry).replace(/'/g, "''")
        return `('${type}', '${name}', ST_SetSRID(ST_GeomFromGeoJSON('${geom}'), 4326))`
      })

    if (values.length === 0) continue

    const sql = `INSERT INTO boundary_lookup (boundary_type, name, geometry) VALUES ${values.join(',\n')}`
    await query(sql)
    inserted += values.length
    process.stdout.write(`\rInserted ${inserted}/${features.length}`)
  }

  console.log(`\nDone — seeded ${inserted} boundary features`)

  // Verify
  const result = await query(`SELECT boundary_type, COUNT(*) as cnt FROM boundary_lookup GROUP BY boundary_type ORDER BY boundary_type`)
  console.log('Final counts:', result)
}

seed().catch(err => { console.error(err); process.exit(1) })
