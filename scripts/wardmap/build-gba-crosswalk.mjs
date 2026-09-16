/**
 * Build the current GBA-369 -> historical DataMeet-243 spatial crosswalk.
 *
 * Both share directions are retained:
 * - current_share: fraction of the current GBA ward covered by a legacy ward
 * - legacy_share: fraction of that legacy ward covered by the current ward
 *
 * The former explains identity ambiguity; the latter is the defensible weight
 * for allocating additive historical totals into current wards.
 *
 * Run: node scripts/wardmap/build-gba-crosswalk.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const VERSION = "gba369-dm243-2026.09"
const STEPS = 40
const MIN_SHARE = 0.005
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")
const CURRENT_PATH = resolve(ROOT, "apps/web/public/bengaluru-gba-369.geojson")
const PUBLIC_PATH = resolve(ROOT, "apps/web/public/bengaluru-gba-369-to-datameet-243.json")
const DATA_DIR = resolve(ROOT, "data/ward-crosswalk")
const DATA_PATH = resolve(DATA_DIR, "gba2025_369_to_datameet_243.json")
const LEGACY_URL = "https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data/master/Bangalore/BBMP.geojson"

function polygons(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
}

function bbox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const polygon of polygons(geometry)) for (const [x, y] of polygon[0]) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

function ringContains(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function contains(geometry, x, y) {
  return polygons(geometry).some(polygon =>
    ringContains(polygon[0], x, y) && polygon.slice(1).every(hole => !ringContains(hole, x, y)))
}

function classify(source, targets, targetKey) {
  const [minX, minY, maxX, maxY] = source.bbox
  const hits = new Map()
  let samples = 0
  let outside = 0
  for (let i = 0; i < STEPS; i++) for (let j = 0; j < STEPS; j++) {
    const x = minX + (i + 0.5) * (maxX - minX) / STEPS
    const y = minY + (j + 0.5) * (maxY - minY) / STEPS
    if (!contains(source.geometry, x, y)) continue
    samples++
    const target = targets.find(candidate =>
      x >= candidate.bbox[0] && x <= candidate.bbox[2] &&
      y >= candidate.bbox[1] && y <= candidate.bbox[3] &&
      contains(candidate.geometry, x, y))
    if (!target) outside++
    else hits.set(targetKey(target), (hits.get(targetKey(target)) ?? 0) + 1)
  }
  return {
    samples,
    outside_share: samples ? +(outside / samples).toFixed(5) : 1,
    shares: [...hits].map(([key, count]) => ({ key, share: +(count / samples).toFixed(5) }))
      .sort((a, b) => b.share - a.share),
  }
}

async function main() {
  const currentCollection = JSON.parse(readFileSync(CURRENT_PATH, "utf8"))
  const legacyCollection = await fetch(LEGACY_URL).then(response => {
    if (!response.ok) throw new Error(`DataMeet boundary fetch failed: ${response.status}`)
    return response.json()
  })

  const current = currentCollection.features.map(feature => ({
    key: `${feature.properties.corporation_id}:${feature.properties.ward_no}`,
    corporation_id: Number(feature.properties.corporation_id),
    ward_no: Number(feature.properties.ward_no),
    ward_name: String(feature.properties.ward_name),
    geometry: feature.geometry,
    bbox: bbox(feature.geometry),
  }))
  const legacy = legacyCollection.features.map(feature => ({
    ward_no: Number(feature.properties.KGISWardNo),
    ward_name: String(feature.properties.KGISWardName),
    geometry: feature.geometry,
    bbox: bbox(feature.geometry),
  }))

  if (current.length !== 369 || legacy.length !== 243) {
    throw new Error(`Expected 369 current and 243 legacy wards; got ${current.length} and ${legacy.length}`)
  }

  const currentClassifications = new Map(current.map(ward => [ward.key, classify(ward, legacy, x => x.ward_no)]))
  const legacyClassifications = new Map(legacy.map(ward => [ward.ward_no, classify(ward, current, x => x.key)]))
  const legacyNames = new Map(legacy.map(ward => [ward.ward_no, ward.ward_name]))

  const rows = current.map(ward => {
    const classification = currentClassifications.get(ward.key)
    const refs = classification.shares
      .map(({ key: legacyWardNo, share: currentShare }) => {
        const reciprocal = legacyClassifications.get(legacyWardNo)?.shares.find(item => item.key === ward.key)
        return {
          ward_no: legacyWardNo,
          ward_name: legacyNames.get(legacyWardNo),
          current_share: currentShare,
          legacy_share: reciprocal?.share ?? 0,
        }
      })
      .filter(ref => ref.current_share >= MIN_SHARE || ref.legacy_share >= MIN_SHARE)
      .sort((a, b) => b.current_share - a.current_share)
    return {
      corporation_id: ward.corporation_id,
      ward_no: ward.ward_no,
      ward_name: ward.ward_name,
      primary_legacy_ward_no: refs[0]?.ward_no ?? null,
      primary_current_share: refs[0]?.current_share ?? 0,
      outside_legacy_share: classification.outside_share,
      tier: refs.length === 0 ? "outside" : refs[0].current_share >= 0.7 ? "clear-primary" : refs[0].current_share >= 0.5 ? "split-primary" : "ambiguous",
      historical_wards: refs,
      samples: classification.samples,
    }
  }).sort((a, b) => a.corporation_id - b.corporation_id || a.ward_no - b.ward_no)

  const artifact = {
    crosswalk: "gba-369-2025 → datameet-243",
    version: VERSION,
    generated_at: new Date().toISOString(),
    method: `bidirectional deterministic interior-point overlap (${STEPS}x${STEPS} grids; no name matching)`,
    sources: {
      current: currentCollection.source,
      historical: LEGACY_URL,
    },
    caveats: [
      "Ward-tagged historical records are not current GBA ward records.",
      "current_share describes how a current ward overlaps historical geography.",
      "legacy_share is the allocation weight for additive historical totals.",
      "Point datasets should be reclassified from their coordinates whenever coordinates are available.",
    ],
    summary: {
      current_wards: rows.length,
      outside: rows.filter(row => row.tier === "outside").length,
      multi_legacy: rows.filter(row => row.historical_wards.length > 1).length,
      three_plus_legacy: rows.filter(row => row.historical_wards.length >= 3).length,
      ambiguous: rows.filter(row => row.tier === "ambiguous").length,
    },
    rows,
  }

  mkdirSync(DATA_DIR, { recursive: true })
  const output = JSON.stringify(artifact, null, 2) + "\n"
  writeFileSync(PUBLIC_PATH, output)
  writeFileSync(DATA_PATH, output)
  console.log(JSON.stringify(artifact.summary, null, 2))
  console.log(`Wrote ${PUBLIC_PATH}`)
  console.log(`Wrote ${DATA_PATH}`)
}

await main()
