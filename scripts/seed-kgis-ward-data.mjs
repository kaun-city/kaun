/**
 * seed-kgis-ward-data.mjs
 * Fetches per-ward counts from KGIS ArcGIS REST API and adds to ward_stats:
 *   - trees (BBMP Tree Census, WardNumber field)
 *   - namma_clinics (BBMP Namma Clinics, KGISWardID field)
 *   - dwcc_count (Dry Waste Collection Centers, KGISWardID field)
 *
 * Source: kgis.ksrsac.in/kgismaps2/rest/services/BBMP/BBMP/MapServer
 * Run: node scripts/seed-kgis-ward-data.mjs
 */

const MGMT = 'https://api.supabase.com/v1/projects/xgygxfyfsvccqqmtboeu/database/query'
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN
const KGIS = 'https://kgis.ksrsac.in/kgismaps2/rest/services/BBMP/BBMP/MapServer'

async function dbq(sql) {
  const res = await fetch(MGMT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`DB ${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

async function kgisGroupCount(layerId, groupField, label) {
  // Use statistics query to get count per ward
  const params = new URLSearchParams({
    where: '1=1',
    outFields: groupField,
    groupByFieldsForStatistics: groupField,
    outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'cnt' }]),
    f: 'json',
  })
  const url = `${KGIS}/${layerId}/query?${params}`
  const data = await fetch(url).then(r => r.json())
  if (!data.features) throw new Error(`KGIS error for layer ${layerId}: ${JSON.stringify(data).slice(0, 200)}`)
  const result = {}
  for (const f of data.features) {
    const ward = f.attributes[groupField]
    const cnt = f.attributes.cnt
    if (ward && cnt) result[String(ward)] = cnt
  }
  console.log(`${label}: ${Object.keys(result).length} wards, total=${Object.values(result).reduce((a,b)=>a+b,0)}`)
  return result
}

// Add columns
await dbq(`ALTER TABLE ward_stats ADD COLUMN IF NOT EXISTS trees INTEGER;`)
await dbq(`ALTER TABLE ward_stats ADD COLUMN IF NOT EXISTS namma_clinics INTEGER;`)
await dbq(`ALTER TABLE ward_stats ADD COLUMN IF NOT EXISTS dwcc_count INTEGER;`)
console.log('Added columns: trees, namma_clinics, dwcc_count')

// Layer 18: Trees (WardNumber field = 1-198 matching ward_no_old)
const trees = await kgisGroupCount(18, 'WardNumber', 'Trees')
let treeUpdates = Object.entries(trees)
  .filter(([w]) => /^\d+$/.test(w))
  .map(([w, cnt]) => `UPDATE ward_stats SET trees = ${cnt} WHERE ward_no_old = ${w};`)
  .join('\n')
if (treeUpdates) {
  await dbq(treeUpdates)
  console.log(`Updated trees for ${Object.keys(trees).length} wards`)
}

// For Namma Clinics + DWCC: KGISWardID doesn't directly map to ward_no_old
// Need the ward mapping table — query BBMP_Ward to get KGISWardID -> ward_no mapping
// Actually KGISWardID in these layers uses a different internal ID system
// Instead, fetch individual records and use spatial or name matching
// Simple approach: get counts with KGISWardID, then map via BBMP_Ward layer

// Fetch BBMP_Ward layer to get KGISWardID -> Ward_No mapping
const wardMapUrl = `https://kgis.ksrsac.in/kgismaps2/rest/services/BBMP/BBMP_Ward/MapServer/0/query?where=1%3D1&outFields=OBJECTID,Ward_No&resultRecordCount=1000&f=json`
const wardMapData = await fetch(wardMapUrl).then(r => r.json())
const kgisToWardNo = {}
for (const f of wardMapData.features || []) {
  kgisToWardNo[f.attributes.OBJECTID] = f.attributes.Ward_No
}
console.log(`Ward mapping: ${Object.keys(kgisToWardNo).length} entries`)

// Layer 25: Namma Clinics + Layer 3: DWCC
// WardCode field uses format 2003NNN where NNN = ward_no_old (zero-padded 3 digits)
async function fetchWardCodeCounts(layerId, label) {
  const url = `${KGIS}/${layerId}/query?where=1%3D1&outFields=WardCode&resultRecordCount=1000&f=json`
  const data = await fetch(url).then(r => r.json())
  const byWard = {}
  for (const f of data.features || []) {
    const wc = f.attributes.WardCode
    if (wc && /^\d+$/.test(String(wc))) {
      const wardNo = Number(wc) % 1000
      if (wardNo > 0 && wardNo <= 200) byWard[wardNo] = (byWard[wardNo] || 0) + 1
    }
  }
  const total = Object.values(byWard).reduce((a, b) => a + b, 0)
  console.log(`${label}: ${Object.keys(byWard).length} wards, total=${total}`)
  return byWard
}

const clinics = await fetchWardCodeCounts(25, 'Namma Clinics')
const dwcc = await fetchWardCodeCounts(3, 'DWCC')

const clinicUpdates = Object.entries(clinics)
  .map(([w, cnt]) => `UPDATE ward_stats SET namma_clinics = ${cnt} WHERE ward_no_old = ${w};`)
  .join('\n')
const dwccUpdates = Object.entries(dwcc)
  .map(([w, cnt]) => `UPDATE ward_stats SET dwcc_count = ${cnt} WHERE ward_no_old = ${w};`)
  .join('\n')

if (clinicUpdates) await dbq(clinicUpdates)
if (dwccUpdates) await dbq(dwccUpdates)

// Verify
const check = await dbq(`SELECT 
  COUNT(*) FILTER (WHERE trees IS NOT NULL) as trees_wards,
  SUM(trees) as total_trees,
  COUNT(*) FILTER (WHERE namma_clinics IS NOT NULL) as clinic_wards,
  SUM(namma_clinics) as total_clinics,
  COUNT(*) FILTER (WHERE dwcc_count IS NOT NULL) as dwcc_wards,
  SUM(dwcc_count) as total_dwcc
FROM ward_stats;`)
console.log('Final counts:', check[0])
