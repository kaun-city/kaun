#!/usr/bin/env node
/**
 * build-pc-geojson.mjs — builds the 543-seat parliamentary-constituency polygon
 * asset the india.kaun.city map renders.
 *
 * This is the PC analogue of the ward-map asset step: the Bengaluru map streams
 * DataMeet's ward GeoJSON straight from raw.githubusercontent.com, which is fine
 * for one 243-feature city file but not for a national layer — the raw national
 * inputs are ~10.7 MB across two repos and need a documented merge before they
 * are a single coherent 543-seat file at all. So the merge + simplification runs
 * once, here, and the result is committed to apps/web/public/ like
 * bengaluru-ward-crosswalk.json.
 *
 * SOURCES (both already pulled in india-recon/geo-roster/pc-boundaries/)
 *   1. DataMeet india_pc_2019_simplified.geojson — 543 features, CC0 (Arun
 *      Ganesh's simplified/attribute version), carries st_code / pc_no /
 *      pc_name / wikidata_qid. THE BASE.
 *   2. shijithpk/2024_maps_supplement — Unlicense. Corrected geometry for the
 *      three units DataMeet predates:
 *        Assam    2023 delimitation      14 seats
 *        J&K      2022 delimitation       6 -> 5 seats
 *        Ladakh   2019 reorganisation     its own UT, 1 seat
 *      DataMeet has no Ladakh entry at all (its 1 seat is still folded into
 *      old J&K's 6), while sansad.in's live roster correctly lists Ladakh as a
 *      separate UT. Recon confirmed this empirically — see
 *      india-recon/geo-roster/FINDINGS.md §2.
 *
 * KEYS. Every output feature carries pc_code = "<st_code>-<pc_no>" (unpadded),
 * produced by scripts/india/lib/pc-code.mjs — the same helper the loaders use
 * and the same string in_constituencies CHECK-enforces. Ladakh takes
 * LADAKH_ST_CODE (38), matching data/pc-crosswalk/.
 *
 * WHAT IS DELIBERATELY *NOT* IN THE OUTPUT
 *   reserved_for (SC/ST). Every boundary and roster source checked in recon
 *   under-reports it (DataMeet's pc_category says 45 ST, the correct figure is
 *   47). The authoritative source is the 2008 Delimitation Order, which
 *   seed-constituencies.mjs reads into in_constituencies.reserved_source. The
 *   map asset carries identity + geometry only; the constituency page reads
 *   reservation status from the database, where its provenance is recorded.
 *
 * SIMPLIFICATION. Ramer-Douglas-Peucker per ring + coordinate quantisation,
 * implemented here rather than shelled out to mapshaper/ogr2ogr, matching
 * scripts/wardmap/build-crosswalk.mjs which ships its own point-in-polygon
 * rather than taking a GIS dependency. Deterministic: same inputs, byte-identical
 * output, so a re-run in review produces no diff.
 *
 * Run:
 *   node scripts/india/build-pc-geojson.mjs \
 *     --src ~/Documents/Kaun/india-recon/geo-roster/pc-boundaries
 *
 * Writes:
 *   apps/web/public/india-pc.geojson        (committed — the map fetches this)
 *   data/india/pc-boundaries-manifest.json  (committed — provenance + counts)
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { pcCode, normalizeConstituencyName, LADAKH_ST_CODE } from "./lib/pc-code.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")

/** Bump on any change to the merge rules or simplification parameters. */
export const PC_GEOJSON_VERSION = "2024-2026.07"

const argSrc = process.argv.indexOf("--src")
const SRC = argSrc > -1
  ? resolve(process.argv[argSrc + 1])
  : resolve(process.env.HOME ?? "", "Documents/Kaun/india-recon/geo-roster/pc-boundaries")

const OUT_GEOJSON = resolve(ROOT, "apps/web/public/india-pc.geojson")
const OUT_MANIFEST = resolve(ROOT, "data/india/pc-boundaries-manifest.json")

/** ~550 m at Indian latitudes ≈ 1 screen pixel at zoom 8, which is as far in
 *  as this map goes (a PC is a district-sized object; street-level detail on a
 *  constituency outline is noise). The DataMeet base is already a simplified
 *  build, so this trims a further ~31% of vertices: 1.4 MB raw, ~245 KB over
 *  the wire once Vercel brotli-compresses it. */
const RDP_TOLERANCE_DEG = 0.005
/** 4 dp ≈ 11 m. Any more is noise at every zoom this map supports. */
const COORD_DP = 4
/** Drop islands smaller than this (deg²) unless a seat has nothing bigger.
 *  ~1.2 km² at Indian latitudes — below one rendered pixel until z12. */
const MIN_PART_AREA_DEG2 = 1e-4

const SOURCES = {
  datameet: {
    file: "datameet_india_pc_2019_simplified.geojson",
    url: "https://github.com/datameet/maps/tree/master/parliamentary-constituencies",
    license: "CC0 1.0 (simplified/attribute version); underlying india_pc_2019.shp is CC-BY-SA 2.5 IN, DataMeet Trust",
  },
  shijithpk: {
    files: ["shijithpk_assam_ls_new_borders.geojson", "shijithpk_j_and_k_ls_new_borders.geojson", "shijithpk_ladakh_ls_new_borders.geojson"],
    url: "https://github.com/shijithpk/2024_maps_supplement",
    license: "Unlicense (public domain)",
    caveat: "Assam / J&K / Ladakh boundaries were re-georeferenced from ECI press-note PDFs in QGIS by the author, who states they are not survey-grade.",
  },
}

/** The three units whose DataMeet geometry is superseded.
 *  st_code stays Census-2011/DataMeet-extended, per docs/design-india-schema.md. */
const OVERRIDES = [
  { st_code: 18, state_name: "Assam", file: "shijithpk_assam_ls_new_borders.geojson", seats: 14 },
  { st_code: 1, state_name: "Jammu & Kashmir", file: "shijithpk_j_and_k_ls_new_borders.geojson", seats: 5 },
  { st_code: LADAKH_ST_CODE, state_name: "Ladakh", file: "shijithpk_ladakh_ls_new_borders.geojson", seats: 1 },
]

/** shijithpk pads each state file with a filler "Rest of X" polygon carrying
 *  seat code 999. It is not a seat and must not become one. */
const FILLER_SEAT_CODE = "999"

// ---------------------------------------------------------------------------
// geometry — self-contained, no GIS dependency
// ---------------------------------------------------------------------------

/** Perpendicular distance from p to the segment a–b, in degrees. */
function perpDistance(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
  const cl = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + cl * dx), p[1] - (a[1] + cl * dy))
}

/** Ramer-Douglas-Peucker, iterative (Indian coastline rings run to 10k+ points
 *  and the recursive form blows the stack on the worst of them). */
function rdp(points, tolerance) {
  if (points.length < 3) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    let maxDist = 0
    let idx = -1
    for (let i = first + 1; i < last; i++) {
      const d = perpDistance(points[i], points[first], points[last])
      if (d > maxDist) { maxDist = d; idx = i }
    }
    if (idx !== -1 && maxDist > tolerance) {
      keep[idx] = 1
      stack.push([first, idx], [idx, last])
    }
  }
  const out = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out
}

const round = (v) => Number(v.toFixed(COORD_DP))

/** Shoelace area (signed magnitude), deg². Only used for size comparison. */
function ringArea(ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1])
  }
  return Math.abs(a / 2)
}

/**
 * Simplify one linear ring: RDP, quantise, drop consecutive duplicates,
 * re-close. Returns null when the ring collapses below a valid triangle.
 */
function simplifyRing(ring, tolerance) {
  const simplified = rdp(ring, tolerance)
  const out = []
  for (const [x, y] of simplified) {
    const p = [round(x), round(y)]
    const prev = out[out.length - 1]
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue
    out.push(p)
  }
  // Re-close: quantisation can pull the last point onto the first.
  if (out.length > 1) {
    const a = out[0]
    const z = out[out.length - 1]
    if (a[0] !== z[0] || a[1] !== z[1]) out.push([a[0], a[1]])
  }
  return out.length >= 4 ? out : null
}

/**
 * Simplify a MultiPolygon (Polygon is promoted first). Holes smaller than the
 * island threshold are dropped with their parent's outer ring kept — a hole
 * too small to render is worse than no hole (it leaves a stray outline).
 * Never returns an empty geometry: if every part falls below the threshold the
 * largest one is kept regardless.
 */
function simplifyGeometry(geom, tolerance) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates
  const scored = []
  for (const poly of polys) {
    const outer = simplifyRing(poly[0], tolerance)
    if (!outer) continue
    const holes = []
    for (const hole of poly.slice(1)) {
      const h = simplifyRing(hole, tolerance)
      if (h && ringArea(h) >= MIN_PART_AREA_DEG2) holes.push(h)
    }
    scored.push({ rings: [outer, ...holes], area: ringArea(outer) })
  }
  if (scored.length === 0) return null
  scored.sort((a, b) => b.area - a.area)
  const kept = scored.filter((s, i) => i === 0 || s.area >= MIN_PART_AREA_DEG2)
  return { type: "MultiPolygon", coordinates: kept.map(s => s.rings) }
}

/** Representative point: centroid of the largest outer ring. Used by the map
 *  for labels and by search to pan — computing it here keeps 543 multipolygon
 *  centroid scans off the client. */
function representativePoint(geom) {
  let best = null
  let bestArea = -1
  for (const poly of geom.coordinates) {
    const a = ringArea(poly[0])
    if (a > bestArea) { bestArea = a; best = poly[0] }
  }
  if (!best) return null
  let sx = 0, sy = 0
  // Skip the duplicated closing vertex so it does not double-weight.
  const n = best.length - 1
  for (let i = 0; i < n; i++) { sx += best[i][0]; sy += best[i][1] }
  return [Number((sx / n).toFixed(COORD_DP)), Number((sy / n).toFixed(COORD_DP))]
}

function countPoints(geom) {
  let n = 0
  for (const poly of geom.coordinates) for (const ring of poly) n += ring.length
  return n
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

const readJson = (name) => JSON.parse(readFileSync(resolve(SRC, name), "utf8"))

function main() {
  const base = readJson(SOURCES.datameet.file)
  if (base.features.length !== 543) {
    throw new Error(`DataMeet base: expected 543 features, got ${base.features.length}`)
  }

  const overrideStCodes = new Set(OVERRIDES.map(o => o.st_code))
  /** Old names keyed by normalized name, per state — used to carry the
   *  wikidata_qid across a geometry swap where the seat identity is unchanged
   *  (Srinagar is Srinagar before and after the 2022 delimitation). Seats that
   *  were renamed or newly created simply carry no qid. No fuzzy fallback. */
  const oldByState = new Map()
  for (const f of base.features) {
    const p = f.properties
    if (!overrideStCodes.has(p.st_code) && p.st_code !== 1) continue
    if (!oldByState.has(p.st_code)) oldByState.set(p.st_code, new Map())
    oldByState.get(p.st_code).set(normalizeConstituencyName(p.pc_name), p)
  }

  const rows = []

  // 1. base states, untouched geometry
  for (const f of base.features) {
    const p = f.properties
    if (overrideStCodes.has(p.st_code)) continue
    rows.push({
      st_code: p.st_code,
      pc_no: p.pc_no,
      state_name: p.st_name,
      pc_name: p.pc_name,
      pc_name_hi: p.pc_name_hi ?? null,
      wikidata_qid: p.wikidata_qid ?? null,
      geom_source: "datameet",
      geometry: f.geometry,
    })
  }

  // 2. re-delimited units, geometry from the 2024 supplement
  for (const ov of OVERRIDES) {
    const supp = readJson(ov.file)
    const seats = supp.features.filter(f => String(f.properties.ls_seat_code) !== FILLER_SEAT_CODE)
    if (seats.length !== ov.seats) {
      throw new Error(`${ov.file}: expected ${ov.seats} seats, got ${seats.length}`)
    }
    const olds = oldByState.get(ov.st_code === LADAKH_ST_CODE ? 1 : ov.st_code) ?? new Map()
    for (const f of seats) {
      const pcNo = Number(f.properties.ls_seat_code)
      // shijithpk annotates renamed seats as "New Name (ex Old Name)".
      const rawName = String(f.properties.ls_seat_name)
      const m = /^(.*?)\s*\(ex\s+(.*?)\)\s*$/i.exec(rawName)
      const name = (m ? m[1] : rawName).trim()
      const formerName = m ? m[2].trim() : null
      const prior = olds.get(normalizeConstituencyName(name))
        ?? (formerName ? olds.get(normalizeConstituencyName(formerName)) : null)
      rows.push({
        st_code: ov.st_code,
        pc_no: pcNo,
        state_name: ov.state_name,
        pc_name: name,
        former_name: formerName,
        pc_name_hi: prior?.pc_name_hi ?? null,
        wikidata_qid: prior?.wikidata_qid ?? null,
        geom_source: "shijithpk-2024",
        geometry: f.geometry,
      })
    }
  }

  if (rows.length !== 543) throw new Error(`merged set: expected 543 seats, got ${rows.length}`)

  // 3. simplify + emit
  rows.sort((a, b) => a.st_code - b.st_code || a.pc_no - b.pc_no)

  let pointsBefore = 0
  let pointsAfter = 0
  const features = []
  const seen = new Set()

  for (const r of rows) {
    const code = pcCode(r.st_code, r.pc_no)
    if (seen.has(code)) throw new Error(`duplicate pc_code ${code} (${r.pc_name})`)
    seen.add(code)

    const asMulti = r.geometry.type === "Polygon"
      ? { type: "MultiPolygon", coordinates: [r.geometry.coordinates] }
      : r.geometry
    pointsBefore += countPoints(asMulti)

    const geom = simplifyGeometry(r.geometry, RDP_TOLERANCE_DEG)
    if (!geom) throw new Error(`${code} ${r.pc_name}: geometry collapsed entirely`)
    pointsAfter += countPoints(geom)

    const props = {
      pc_code: code,
      st_code: r.st_code,
      pc_no: r.pc_no,
      state_name: r.state_name,
      pc_name: r.pc_name,
      pc_name_norm: normalizeConstituencyName(r.pc_name),
      geom_source: r.geom_source,
      c: representativePoint(geom),
    }
    if (r.former_name) props.former_name = r.former_name
    if (r.pc_name_hi) props.pc_name_hi = r.pc_name_hi
    if (r.wikidata_qid) props.wikidata_qid = r.wikidata_qid

    features.push({ type: "Feature", properties: props, geometry: geom })
  }

  const fc = {
    type: "FeatureCollection",
    name: "kaun_india_pc_543",
    version: PC_GEOJSON_VERSION,
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3/CRS84" } },
    features,
  }
  writeFileSync(OUT_GEOJSON, JSON.stringify(fc) + "\n")

  const byState = {}
  for (const f of features) {
    const k = f.properties.state_name
    byState[k] = (byState[k] ?? 0) + 1
  }
  const bytes = Buffer.byteLength(JSON.stringify(fc) + "\n")

  mkdirSync(dirname(OUT_MANIFEST), { recursive: true })
  writeFileSync(OUT_MANIFEST, JSON.stringify({
    version: PC_GEOJSON_VERSION,
    built_by: "scripts/india/build-pc-geojson.mjs",
    output: "apps/web/public/india-pc.geojson",
    seats: features.length,
    states: Object.keys(byState).length,
    seats_by_state: byState,
    geometry_overrides: OVERRIDES.map(o => ({
      state_name: o.state_name, st_code: o.st_code, seats: o.seats, source: "shijithpk-2024",
    })),
    simplification: {
      method: "Ramer-Douglas-Peucker per ring, then coordinate quantisation",
      rdp_tolerance_deg: RDP_TOLERANCE_DEG,
      coordinate_decimals: COORD_DP,
      min_part_area_deg2: MIN_PART_AREA_DEG2,
      vertices_before: pointsBefore,
      vertices_after: pointsAfter,
      output_bytes: bytes,
    },
    sources: SOURCES,
    notes: [
      "pc_code = <st_code>-<pc_no> unpadded, per scripts/india/lib/pc-code.mjs and the in_constituencies_pc_code_derived CHECK.",
      "Ladakh uses st_code 38 (Census 2011 predates the 2019 bifurcation); matches data/pc-crosswalk/.",
      "Reserved (SC/ST) status is deliberately absent — every boundary source under-reports it. It is read from in_constituencies, whose value names its source.",
      "Assam / J&K / Ladakh geometry is re-georeferenced from ECI press-note PDFs by shijithpk and is explicitly not survey-grade.",
    ],
  }, null, 2) + "\n")

  const pct = (100 * (1 - pointsAfter / pointsBefore)).toFixed(1)
  console.log(`seats            ${features.length} across ${Object.keys(byState).length} states/UTs`)
  console.log(`vertices         ${pointsBefore.toLocaleString()} -> ${pointsAfter.toLocaleString()} (-${pct}%)`)
  console.log(`output           ${(bytes / 1024 / 1024).toFixed(2)} MB  ${OUT_GEOJSON}`)
  console.log(`manifest         ${OUT_MANIFEST}`)
}

main()
