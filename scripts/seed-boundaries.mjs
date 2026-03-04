/**
 * Original data sources on opencity.in:
 *   BESCOM boundaries:          095be44d-3f74-4e5d-b06e-304a14716cff
 *   BWSSB boundaries:           52a5d05b-0b8a-4511-a9b0-9123ad9c0113
 *   Traffic Police jurisdictions: ba9be930-e313-4f16-b4e2-39a5d8d7eb3f
 *   Pincode maps:               d71a695c-1d72-4d3e-bb33-a252a27d3a89
 *   (bengawalk converted + merged these KMLs into a single TopoJSON)
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as topojson from 'topojson-client'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TYPES_TO_SEED = new Set([
  'bescom_division', 'bescom_subdivision',
  'bwssb_division', 'bwssb_service_station',
  'police_city', 'police_traffic',
  'pincode', 'stamps_sro', 'stamps_dro', 'admin_taluk',
])

const MGMT = 'https://api.supabase.com/v1/projects/xgygxfyfsvccqqmtboeu/database/query'
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN

async function dbq(sql) {
  const res = await fetch(MGMT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`DB ${res.status}: ${text.slice(0,200)}`)
  return JSON.parse(text)
}

const topoPath = resolve(__dirname, '../data/bengawalk-boundaries.json')
const topology = JSON.parse(readFileSync(topoPath, 'utf8'))
const geojson = topojson.feature(topology, topology.objects.boundaries)
const features = geojson.features.filter(f => TYPES_TO_SEED.has(f.properties?.id))
console.log(`Seeding ${features.length} features:`, Object.fromEntries([...TYPES_TO_SEED].map(t => [t, features.filter(f=>f.properties.id===t).length])))

await dbq(`DELETE FROM boundary_lookup WHERE boundary_type IN (${[...TYPES_TO_SEED].map(t=>`'${t}'`).join(',')})`)
console.log('Cleared')

let inserted = 0
const BATCH = 10
for (let i = 0; i < features.length; i += BATCH) {
  const vals = features.slice(i, i+BATCH).filter(f => f.geometry).map(f => {
    const name = (f.properties.namecol||'').replace(/'/g,"''")
    const type = f.properties.id
    const geom = JSON.stringify(f.geometry).replace(/'/g,"''")
    return `('${type}','${name}',ST_SetSRID(ST_GeomFromGeoJSON('${geom}'),4326))`
  })
  if (!vals.length) continue
  await dbq(`INSERT INTO boundary_lookup(boundary_type,name,geometry) VALUES ${vals.join(',')}`)
  inserted += vals.length
  process.stdout.write(`\r${inserted}/${features.length}`)
}
console.log(`\nDone`)
const counts = await dbq(`SELECT boundary_type, COUNT(*) cnt FROM boundary_lookup GROUP BY boundary_type ORDER BY boundary_type`)
console.table(counts)
