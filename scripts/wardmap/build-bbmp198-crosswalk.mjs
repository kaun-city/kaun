/**
 * Build the BBMP-198 (2010 delimitation) -> DataMeet-243 spatial crosswalk.
 *
 * ward_spend_category, ward_potholes and ward_committee_meetings are keyed on
 * BBMP's 198-ward map. Kaun's historical ward reference is the DataMeet-243
 * map, and the two numberings name different places (198 #25 is Horamavu,
 * 243 #25 is Rajeshwari Nagar), so these tables must never be joined on ward
 * number. This builder derives the correspondence from the two official
 * polygon layers: deterministic interior-point overlap, no name matching.
 *
 * Both share directions are retained for every overlapping pair:
 * - bbmp198_share: fraction of the 198 ward lying inside the 243 ward. This is
 *   the allocation weight for additive totals (spend, complaint counts); it
 *   plays the role legacy_share plays in the GBA-369 crosswalk.
 * - dm243_share: fraction of the 243 ward covered by the 198 ward. Together
 *   with bbmp198_share it decides whether a 198 ward's non-additive records
 *   (a ward committee's meeting count) may be named under a 243 ward.
 *
 * The share vector is complete: every sampled overlap is kept, so per 198
 * ward the bbmp198_share values plus outside_dm243_share sum to exactly 1.
 *
 * Output is a pure function of the pinned DataMeet commit and --generated-at,
 * so re-running with the same inputs is byte-stable.
 *
 * Run: node scripts/wardmap/build-bbmp198-crosswalk.mjs --generated-at 2026-09-16T12:00:00.000Z
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const VERSION = "bbmp198-dm243-2026.09"
const STEPS = 40
/** Kaun's material-overlap rule (apps/web/lib/gba-crosswalk.ts MATERIAL_OVERLAP). */
const MATERIAL_OVERLAP = 0.1
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")
const PUBLIC_PATH = resolve(ROOT, "apps/web/public/bengaluru-bbmp-198-to-datameet-243.json")
const DATA_DIR = resolve(ROOT, "data/ward-crosswalk")
const DATA_PATH = resolve(DATA_DIR, "bbmp2010_198_to_datameet_243.json")
const PAIRS_CSV_PATH = resolve(DATA_DIR, "bbmp2010_198_to_datameet_243_pairs.csv")
const METHODOLOGY_PATH = resolve(DATA_DIR, "METHODOLOGY.md")
const WIKI_DIR = resolve(ROOT, "wiki/docs/bengaluru/ward-crosswalk")
// Latest DataMeet commit touching Bangalore/ ("BBMP new wards (#51)",
// 2022-11-28), the same pin as build-gba-crosswalk.mjs. BBMP_oldWards.geojson
// ("Bangalore Ward Maps 2012", 198 wards) is unchanged since 2016 at this
// commit. Bump deliberately and regenerate; never fetch a moving branch.
const DATAMEET_COMMIT = "0c3a2e3dd2e87c514817378d6c73a9dd2ffb8f69"
const BBMP198_URL = `https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data/${DATAMEET_COMMIT}/Bangalore/BBMP_oldWards.geojson`
const DM243_URL = `https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data/${DATAMEET_COMMIT}/Bangalore/BBMP.geojson`

const METHODOLOGY_START = "<!-- bbmp198-crosswalk:start (written by scripts/wardmap/build-bbmp198-crosswalk.mjs) -->"
const METHODOLOGY_END = "<!-- bbmp198-crosswalk:end -->"

function generatedAtArg(argv) {
  const index = argv.findIndex(arg => arg === "--generated-at" || arg.startsWith("--generated-at="))
  const value = index === -1 ? null
    : argv[index].includes("=") ? argv[index].slice("--generated-at=".length) : argv[index + 1]
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error("Pass --generated-at <ISO-8601 timestamp> so the crosswalk output is reproducible.")
  }
  return date.toISOString()
}

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

/** Sample the source ward's interior and count which target ward holds each point. */
function classify(source, targets) {
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
    else hits.set(target.ward_no, (hits.get(target.ward_no) ?? 0) + 1)
  }
  return { samples, outside, hits }
}

const share = (count, samples) => samples ? +(count / samples).toFixed(5) : 0

const csv = rows => rows.map(row => row.map(cell => {
  const text = cell == null ? "" : String(cell)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}).join(",")).join("\n") + "\n"

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Boundary fetch failed (${response.status}): ${url}`)
  return response.json()
}

function methodologySection(artifact) {
  const s = artifact.summary
  return `${METHODOLOGY_START}
## BBMP-198 (2010 delimitation) → historical DataMeet-243

Three BBMP tables are keyed on the **198-ward** map in force for the 2010 and
2015 councils, not on the 243-ward map Kaun uses as its historical reference:
\`ward_spend_category\` (ward works spend 2018–23), \`ward_potholes\` (Fix My
Street complaints 2022) and \`ward_committee_meetings\` (2020–22). The two
maps number different places — 198 #25 is Horamavu, 243 #25 is Rajeshwari
Nagar — so a lookup by ward number shows another ward's figures. Kaun
verified all three tables against the source layer by ward number and name
(every mismatch is a spelling variant such as "HSLayout" for HSR Layout), then
derives the correspondence spatially.

### Sources (pinned)

| Set | Source | Carries |
|---|---|---|
| BBMP-198 | DataMeet \`Municipal_Spatial_Data/Bangalore/BBMP_oldWards.geojson\` ("Bangalore Ward Maps 2012") @ \`${DATAMEET_COMMIT.slice(0, 7)}\` | WARD_NO, WARD_NAME, assembly constituency, population, polygon |
| DataMeet-243 | DataMeet \`Municipal_Spatial_Data/Bangalore/BBMP.geojson\` @ \`${DATAMEET_COMMIT.slice(0, 7)}\` | KGISWardNo, KGISWardName, polygon |

### Method

\`scripts/wardmap/build-bbmp198-crosswalk.mjs\` samples each ward's interior on
a ${STEPS}×${STEPS} grid in **both** directions and classifies every point by the ward
of the other map that contains it. No names are matched. Every overlapping
pair keeps two shares:

- \`bbmp198_share\` — fraction of the 198 ward inside the 243 ward. **Additive
  totals** (spend, complaint counts) are allocated with this weight, the same
  role \`legacy_share\` plays for GBA-369. Per 198 ward the shares plus
  \`outside_dm243_share\` sum to 1, so allocation conserves the city total
  except for the ${(s.bbmp198_area_outside_dm243 * 100).toFixed(2)}% of 198-ward area outside the 243 map.
- \`dm243_share\` — fraction of the 243 ward covered by the 198 ward.

A current GBA ward reaches 198-ward figures in two steps: its 243-ward overlap
vector (\`legacy_share\`) and then this one (\`bbmp198_share\`), so an allocated
figure is \`Σ legacy_share × bbmp198_share × value\`. Allocated figures are
estimates and are labelled as such.

**Records that cannot be split by area.** A ward committee's meeting count
describes an institution, not a quantity spread over land: a 243 ward covering
30% of Horamavu did not hold 30% of Horamavu's meetings. Such records are never
summed or weighted. A 198 ward committee is named under a 243 ward only when
the overlap is material in both directions (\`bbmp198_share\` ≥ ${MATERIAL_OVERLAP} and
\`dm243_share\` ≥ ${MATERIAL_OVERLAP}) or it is that ward's largest overlap — the same rule
Kaun applies to GBA-369 → 243 record lists. Each committee keeps its own name
and count.

### Result (version \`${artifact.version}\`)

- ${s.bbmp198_wards} BBMP-198 wards and ${s.dm243_wards} DataMeet-243 wards; ${s.pairs} overlapping pairs, ${s.material_pairs} of them material.
- 243 wards by largest 198 overlap: ${s.clear_primary} clear primary (≥70%), ${s.split_primary} split primary (50–70%), ${s.ambiguous} ambiguous (<50%), ${s.outside} outside the 198 map.
- Only ${s.same_number_same_primary} of 198 ward numbers point at a 243 ward of the same number as their largest overlap — the reason number joins were wrong.

### Files

- \`apps/web/public/bengaluru-bbmp-198-to-datameet-243.json\` — runtime asset.
- \`data/ward-crosswalk/bbmp2010_198_to_datameet_243.json\` — byte-identical data copy.
- \`data/ward-crosswalk/bbmp2010_198_to_datameet_243_pairs.csv\` — one row per overlapping pair with both shares.
- \`wiki/docs/bengaluru/ward-crosswalk/bbmp2010_198_to_datameet_243{.json,_pairs.csv}\` — public download copies, written by the builder.

Corrections: open an issue at \`github.com/kaun-city/kaun\` with label
\`ward-crosswalk\`.
${METHODOLOGY_END}`
}

async function main() {
  const generatedAt = generatedAtArg(process.argv.slice(2))
  const [oldCollection, dmCollection] = await Promise.all([fetchJson(BBMP198_URL), fetchJson(DM243_URL)])

  const bbmp198 = oldCollection.features.map(feature => ({
    ward_no: Number(feature.properties.WARD_NO),
    ward_name: String(feature.properties.WARD_NAME).trim(),
    assembly_constituency: String(feature.properties.ASS_CONST1 ?? "").trim() || null,
    geometry: feature.geometry,
    bbox: bbox(feature.geometry),
  })).sort((a, b) => a.ward_no - b.ward_no)
  const dm243 = dmCollection.features.map(feature => ({
    ward_no: Number(feature.properties.KGISWardNo),
    ward_name: String(feature.properties.KGISWardName).trim(),
    geometry: feature.geometry,
    bbox: bbox(feature.geometry),
  })).sort((a, b) => a.ward_no - b.ward_no)

  if (bbmp198.length !== 198 || new Set(bbmp198.map(w => w.ward_no)).size !== 198) {
    throw new Error(`Expected 198 distinct BBMP-198 wards; got ${bbmp198.length}`)
  }
  if (dm243.length !== 243 || new Set(dm243.map(w => w.ward_no)).size !== 243) {
    throw new Error(`Expected 243 distinct DataMeet wards; got ${dm243.length}`)
  }

  const from198 = new Map(bbmp198.map(ward => [ward.ward_no, classify(ward, dm243)]))
  const from243 = new Map(dm243.map(ward => [ward.ward_no, classify(ward, bbmp198)]))
  const name198 = new Map(bbmp198.map(ward => [ward.ward_no, ward.ward_name]))

  const rows = dm243.map(ward => {
    const own = from243.get(ward.ward_no)
    const sourceNos = new Set(own.hits.keys())
    for (const [oldNo, result] of from198) if (result.hits.has(ward.ward_no)) sourceNos.add(oldNo)
    const refs = [...sourceNos].map(oldNo => ({
      ward_no: oldNo,
      ward_name: name198.get(oldNo),
      dm243_share: share(own.hits.get(oldNo) ?? 0, own.samples),
      bbmp198_share: share(from198.get(oldNo).hits.get(ward.ward_no) ?? 0, from198.get(oldNo).samples),
    })).sort((a, b) => b.dm243_share - a.dm243_share || b.bbmp198_share - a.bbmp198_share || a.ward_no - b.ward_no)
    const primary = refs[0] ?? null
    return {
      datameet243_no: ward.ward_no,
      datameet243_name: ward.ward_name,
      primary_bbmp198_no: primary?.ward_no ?? null,
      primary_dm243_share: primary?.dm243_share ?? 0,
      outside_bbmp198_share: share(own.outside, own.samples),
      tier: !primary || primary.dm243_share === 0 ? "outside"
        : primary.dm243_share >= 0.7 ? "clear-primary"
        : primary.dm243_share >= 0.5 ? "split-primary" : "ambiguous",
      bbmp198_wards: refs,
      samples: own.samples,
    }
  })

  const bbmp198Rows = bbmp198.map(ward => {
    const result = from198.get(ward.ward_no)
    return {
      ward_no: ward.ward_no,
      ward_name: ward.ward_name,
      assembly_constituency: ward.assembly_constituency,
      outside_dm243_share: share(result.outside, result.samples),
      samples: result.samples,
    }
  })

  const pairs = rows.flatMap(row => row.bbmp198_wards.map(ref => ({ row, ref })))
  const material = ({ row, ref }) =>
    ref.ward_no === row.primary_bbmp198_no ||
    (ref.bbmp198_share >= MATERIAL_OVERLAP && ref.dm243_share >= MATERIAL_OVERLAP)
  const primaryOf198 = new Map([...from198].map(([oldNo, result]) => {
    const [top] = [...result.hits].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    return [oldNo, top?.[0] ?? null]
  }))
  const totalSamples = [...from198.values()].reduce((sum, r) => sum + r.samples, 0)
  const totalOutside = [...from198.values()].reduce((sum, r) => sum + r.outside, 0)

  const artifact = {
    crosswalk: "bbmp-198-2010 → datameet-243",
    version: VERSION,
    generated_at: generatedAt,
    method: `bidirectional deterministic interior-point overlap (${STEPS}x${STEPS} grids; no name matching)`,
    sources: {
      bbmp_198: BBMP198_URL,
      datameet_243: DM243_URL,
    },
    material_overlap: MATERIAL_OVERLAP,
    caveats: [
      "Keys ward_spend_category, ward_potholes and ward_committee_meetings (BBMP 198-ward numbers) to DataMeet-243 wards. Never join the two maps on ward number.",
      "bbmp198_share (fraction of the 198 ward inside the 243 ward) is the allocation weight for additive totals. Allocated figures are estimates.",
      "dm243_share is the fraction of the 243 ward covered by the 198 ward.",
      "Non-additive records (a ward committee's meeting count) are never split or summed: a 198 ward is named under a 243 ward only when both shares are >= material_overlap, or it is the 243 ward's largest overlap.",
      "Per 198 ward, bbmp198_share values plus outside_dm243_share sum to 1 (up to rounding).",
    ],
    summary: {
      bbmp198_wards: bbmp198Rows.length,
      dm243_wards: rows.length,
      pairs: pairs.length,
      material_pairs: pairs.filter(material).length,
      clear_primary: rows.filter(row => row.tier === "clear-primary").length,
      split_primary: rows.filter(row => row.tier === "split-primary").length,
      ambiguous: rows.filter(row => row.tier === "ambiguous").length,
      outside: rows.filter(row => row.tier === "outside").length,
      same_number_same_primary: [...primaryOf198].filter(([oldNo, top]) => oldNo === top).length,
      bbmp198_area_outside_dm243: totalSamples ? +(totalOutside / totalSamples).toFixed(5) : 0,
    },
    rows,
    bbmp198_wards: bbmp198Rows,
  }

  const json = JSON.stringify(artifact, null, 2) + "\n"
  const pairsCsv = csv([
    ["bbmp198_no", "bbmp198_name", "datameet243_no", "datameet243_name", "bbmp198_share", "dm243_share", "material", "is_primary_for_243"],
    ...pairs
      .sort((a, b) => a.ref.ward_no - b.ref.ward_no || b.ref.bbmp198_share - a.ref.bbmp198_share || a.row.datameet243_no - b.row.datameet243_no)
      .map(pair => [
        pair.ref.ward_no, pair.ref.ward_name, pair.row.datameet243_no, pair.row.datameet243_name,
        pair.ref.bbmp198_share, pair.ref.dm243_share, material(pair), pair.ref.ward_no === pair.row.primary_bbmp198_no,
      ]),
  ])

  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(WIKI_DIR, { recursive: true })
  writeFileSync(PUBLIC_PATH, json)
  writeFileSync(DATA_PATH, json)
  writeFileSync(PAIRS_CSV_PATH, pairsCsv)
  writeFileSync(resolve(WIKI_DIR, "bbmp2010_198_to_datameet_243.json"), json)
  writeFileSync(resolve(WIKI_DIR, "bbmp2010_198_to_datameet_243_pairs.csv"), pairsCsv)

  // Replace only this builder's section so the 225 and GBA sections survive.
  const methodology = readFileSync(METHODOLOGY_PATH, "utf8")
  const section = methodologySection(artifact)
  const start = methodology.indexOf(METHODOLOGY_START)
  const end = methodology.indexOf(METHODOLOGY_END)
  const next = start === -1
    ? `${methodology.trimEnd()}\n\n${section}\n`
    : `${methodology.slice(0, start)}${section}${methodology.slice(end + METHODOLOGY_END.length)}`
  writeFileSync(METHODOLOGY_PATH, next)

  console.log(JSON.stringify(artifact.summary, null, 2))
  for (const path of [PUBLIC_PATH, DATA_PATH, PAIRS_CSV_PATH, METHODOLOGY_PATH]) console.log(`Wrote ${path}`)
}

await main()
