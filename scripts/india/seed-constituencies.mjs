#!/usr/bin/env node
/**
 * seed-constituencies.mjs — populates in_constituencies (543 Lok Sabha seats).
 *
 * Usage:
 *   node scripts/india/seed-constituencies.mjs                      # dry run
 *   node scripts/india/seed-constituencies.mjs --geo-dir <dir>      # local geojson
 *   node scripts/india/seed-constituencies.mjs --apply              # writes
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 *   KAUN_LOCAL_PG                                (local integration testing)
 *
 * Runs once per delimitation, not on a cron. Everything downstream FKs to
 * in_constituencies.pc_code, so this is the first pipeline to land.
 *
 * TWO INPUTS, JOINED ON IDs — NEVER ON NAMES
 * ------------------------------------------
 *   IDENTITY  data/pc-crosswalk/india_pc_crosswalk.csv (PR #64). 543 rows with
 *             pc_code, st_code, pc_no, names, and — crucially — reserved_for
 *             sourced from the Delimitation Orders themselves rather than from
 *             a boundary file's stale attribute join. It also carries the two
 *             foreign keys this seeder needs:
 *               pc_id            ECI-style "S03_13" — identical to shijithpk's
 *                                unique_id, 543/543 exact
 *               pc_code_datameet DataMeet's own "<st_code>-<pc_no>", 541/543
 *
 *   GEOMETRY  DataMeet india_pc_2019_simplified.geojson (CC0) as the base, with
 *             shijithpk's 2024 supplement (Unlicense) for the three
 *             re-delimited states DataMeet predates: Assam (2023),
 *             Jammu & Kashmir (2022) and Ladakh (which DataMeet does not
 *             contain at all — it still folds those areas into old J&K).
 *
 * Because both geometry files join by ID, this seeder does zero name matching.
 * That is the point: the crosswalk already did the hard, reviewed work of
 * deciding which seat is which, and its output is a stable key.
 *
 * TRAPS ALREADY PAID FOR
 *   - pc_no is NOT nationally unique. Key on pc_code (lib/pc-code.mjs).
 *   - shijithpk marks areas that belong to no seat with ls_seat_code 999
 *     ("Rest of J&K", "Rest of Ladakh"). Those are not constituencies; the
 *     543-feature file already merges them away, and they are filtered anyway.
 *   - eci.gov.in serves a hard Akamai 403 to non-browser clients — nothing here
 *     touches it; the Delimitation Order provenance lives in the crosswalk.
 *   - DataMeet's AC shapefile carries a PC_NO column that is simply wrong.
 *     It is not read here or anywhere.
 *   - reserved_for is written ONLY with its source attached; the CHECK
 *     constraint in_constituencies_reserved_has_source enforces that, and
 *     DataMeet's pc_category (which undercounts ST by 2) is never a fallback.
 *
 * ORDER OF OPERATIONS: this must run before every other India loader.
 */
import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { pcCode, LADAKH_ST_CODE } from "./lib/pc-code.mjs"
import { referenceFromCrosswalk, CROSSWALK_CSV } from "./lib/pc-reference.mjs"
import { openSink } from "./lib/sink.mjs"
import { politeFetch } from "./lib/http.mjs"
import { opt, banner, run } from "./lib/cli.mjs"

const LOADER = "seed-constituencies"

const DATAMEET_URL =
  "https://raw.githubusercontent.com/datameet/maps/master/parliamentary-constituencies/india_pc_2019_simplified.geojson"
const SHIJITHPK_URL =
  "https://raw.githubusercontent.com/shijithpk/2024_maps_supplement/main/india_ls_seats_543.geojson"

const GEO_FILES = {
  datameet: { url: DATAMEET_URL, local: "datameet_india_pc_2019_simplified.geojson" },
  shijithpk: { url: SHIJITHPK_URL, local: "shijithpk_india_ls_seats_543.geojson" },
}

/**
 * States whose geometry must come from the 2024 supplement, by st_code:
 * Jammu & Kashmir (1), Assam (18), Ladakh (38). DataMeet predates the 2022 and
 * 2023 delimitations and has no Ladakh feature at all.
 */
export const REDELIMITED_ST_CODES = new Set([1, 18, LADAKH_ST_CODE])

const DATA_SOURCE =
  "pc-crosswalk (Delimitation Orders 2008/2022-J&K/2023-Assam) + DataMeet PC 2019 + shijithpk 2024 supplement"

/** Normalise Polygon → MultiPolygon before it ever reaches SQL, the way the
 *  wards pipeline does. The column is geometry(MultiPolygon, 4326). */
export function toMultiPolygon(geometry) {
  if (!geometry) return null
  if (geometry.type === "MultiPolygon") return geometry
  if (geometry.type === "Polygon") {
    return { type: "MultiPolygon", coordinates: [geometry.coordinates] }
  }
  throw new Error(`unsupported geometry type ${geometry.type}`)
}

/** Shoelace area of a linear ring, in square degrees. Sign-free: only used to
 *  decide whether a ring encloses anything at all. */
export function ringArea(ring) {
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return Math.abs(s) / 2
}

/**
 * Drop degenerate rings before the geometry reaches PostGIS.
 *
 * WHY THIS IS NOT OPTIONAL. DataMeet's Bharatpur feature (8-9) is a
 * MultiPolygon with 602 parts, some of which are rings with fewer than four
 * positions. PostGIS parses that happily, but ST_MakeValid returns NULL on it
 * ("Too few points in geometry component") — so the row lands with a NULL geom
 * and NOTHING reports an error. One silently boundary-less constituency is
 * exactly the class of bug this pipeline exists to avoid.
 *
 * A GeoJSON linear ring needs ≥4 positions and must be closed. Rings that fail
 * that, or that enclose zero area, are dropped; a polygon whose exterior ring
 * is dropped goes with it. Every drop is counted and reported.
 */
export function sanitizeMultiPolygon(geometry) {
  const mp = toMultiPolygon(geometry)
  if (!mp) return { geometry: null, droppedRings: 0, droppedPolygons: 0 }
  let droppedRings = 0
  let droppedPolygons = 0
  const polygons = []
  for (const poly of mp.coordinates) {
    const rings = []
    for (const ring of poly) {
      const closed = ring.length >= 2 &&
        ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring : [...ring, ring[0]]
      if (!ring.length || closed.length < 4 || ringArea(closed) === 0) { droppedRings++; continue }
      rings.push(closed)
    }
    if (!rings.length) { droppedPolygons++; continue }
    polygons.push(rings)
  }
  return {
    geometry: polygons.length ? { type: "MultiPolygon", coordinates: polygons } : null,
    droppedRings, droppedPolygons,
  }
}

/**
 * SQL expression for the geom column.
 *
 * ST_MakeValid is a deliberate addition to the wards pattern
 * (scripts/seed-boundaries.mjs writes a bare ST_SetSRID(ST_GeomFromGeoJSON(…))):
 * BBMP ward polygons were clean; national PC polygons merged from two different
 * georeferencing efforts are not. ST_MakeValid can return a GeometryCollection,
 * so ST_CollectionExtract(…, 3) keeps only the polygonal parts before ST_Multi
 * casts back to MultiPolygon.
 */
export function geomSql(geometry) {
  const g = JSON.stringify(toMultiPolygon(geometry)).replace(/'/g, "''")
  return `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON('${g}'), 4326)), 3))`
}

/** Read a geojson from --geo-dir if present, else fetch it from source. */
async function loadGeojson(which, geoDir) {
  const spec = GEO_FILES[which]
  if (geoDir) {
    const p = resolve(geoDir, spec.local)
    if (!existsSync(p)) throw new Error(`--geo-dir given but ${p} does not exist`)
    return { data: JSON.parse(readFileSync(p, "utf8")), origin: p }
  }
  const data = await politeFetch(spec.url, { namespace: "geo", json: true, delayMs: 500 })
  return { data, origin: spec.url }
}

/** DataMeet features keyed by its own "<st_code>-<pc_no>". */
export function indexDatameet(geojson) {
  const m = new Map()
  for (const f of geojson.features ?? []) {
    const p = f.properties ?? {}
    if (p.st_code == null || p.pc_no == null) continue
    m.set(`${Number(p.st_code)}-${Number(p.pc_no)}`, f)
  }
  return m
}

/** shijithpk features keyed by unique_id ("S03_13"), skipping the non-seat
 *  filler polygons the author codes as ls_seat_code 999. */
export function indexShijithpk(geojson) {
  const m = new Map()
  for (const f of geojson.features ?? []) {
    const p = f.properties ?? {}
    if (String(p.ls_seat_code) === "999") continue
    if (!p.unique_id) continue
    m.set(String(p.unique_id), f)
  }
  return m
}

/**
 * Pure join: crosswalk rows + the two geometry indexes → in_constituencies rows.
 * Exported so tests can exercise it against fixtures with no network and no DB.
 */
export function buildRows(crosswalkRows, { datameet, shijithpk }) {
  const rows = []
  const problems = []
  for (const r of crosswalkRows) {
    const code = pcCode(r.st_code, r.pc_no)
    const useSupplement = REDELIMITED_ST_CODES.has(r.st_code)

    let feature = null
    let geomSource = null
    if (!useSupplement && r.pc_code_datameet && datameet.has(r.pc_code_datameet)) {
      feature = datameet.get(r.pc_code_datameet)
      geomSource = "datameet"
    } else if (r.pc_id && shijithpk.has(r.pc_id)) {
      feature = shijithpk.get(r.pc_id)
      geomSource = "shijithpk-2024"
    } else if (!useSupplement && datameet.has(code)) {
      // Last resort: DataMeet's own numbering happens to agree with ours.
      feature = datameet.get(code)
      geomSource = "datameet"
    }

    if (!feature) {
      problems.push({ pc_code: code, pc_name: r.pc_name, reason: "no_geometry_match",
                      pc_id: r.pc_id, pc_code_datameet: r.pc_code_datameet })
    }

    const dmProps = (!useSupplement && r.pc_code_datameet
      && datameet.get(r.pc_code_datameet)?.properties) || null

    const clean = sanitizeMultiPolygon(feature?.geometry ?? null)
    if (feature && !clean.geometry) {
      problems.push({ pc_code: code, pc_name: r.pc_name, reason: "geometry_degenerate_after_cleanup",
                      geom_source: geomSource })
    }

    rows.push({
      row: {
        pc_code: code,
        st_code: r.st_code,
        pc_no: r.pc_no,
        state_name: r.state_name,
        pc_name: r.pc_name,
        pc_name_norm: r.pc_name_norm,
        pc_name_hi: r.pc_name_hi || dmProps?.pc_name_hi || null,
        reserved_for: r.reserved_for,
        // The CHECK constraint refuses a reservation without its provenance,
        // so an unsourced value is dropped rather than smuggled in.
        reserved_source: r.reserved_for ? (r.reserved_source || null) : null,
        wikidata_qid: r.wikidata_qid || dmProps?.wikidata_qid || null,
        pc_id_datameet: dmProps?.pc_id != null ? Number(dmProps.pc_id) : null,
        geom_source: geomSource,
        data_source: DATA_SOURCE,
        updated_at: new Date().toISOString(),
      },
      geometry: clean.geometry,
      dropped_rings: clean.droppedRings,
      dropped_polygons: clean.droppedPolygons,
    })
  }
  return { rows, problems }
}

async function main() {
  const crosswalkPath = opt("crosswalk", CROSSWALK_CSV)
  const apply = banner(LOADER, { crosswalk: crosswalkPath })
  const geoDir = opt("geo-dir")
  const sink = openSink({ loader: LOADER, apply })

  const reference = referenceFromCrosswalk(crosswalkPath)
  if (!reference) {
    sink.warn(
      `pc-crosswalk artifact not found at ${crosswalkPath}. It lands with PR #64 ` +
      `(branch feat/india-pc-crosswalk); that has to merge first. Nothing to seed.`)
    sink.finish({ blocked_on: "PR #64 — data/pc-crosswalk/" })
    if (apply) { console.error("\nRefusing to --apply without the crosswalk artifact."); process.exit(1) }
    return
  }
  sink.note(`crosswalk: ${reference.size} rows from ${reference.origin}`)

  const dm = await loadGeojson("datameet", geoDir)
  const sh = await loadGeojson("shijithpk", geoDir)
  sink.note(`geometry: DataMeet ${dm.data.features.length} features (${dm.origin})`)
  sink.note(`geometry: shijithpk ${sh.data.features.length} features (${sh.origin})`)

  const { rows, problems } = buildRows(reference.rows, {
    datameet: indexDatameet(dm.data),
    shijithpk: indexShijithpk(sh.data),
  })

  const bySource = {}
  for (const r of rows) {
    const k = r.row.geom_source ?? "none"
    bySource[k] = (bySource[k] ?? 0) + 1
  }
  sink.count("constituencies", rows.length)
  sink.count("with geometry", rows.filter(r => r.geometry).length)
  for (const [k, v] of Object.entries(bySource)) sink.count(`geom_source=${k}`, v)
  sink.count("reserved SC", rows.filter(r => r.row.reserved_for === "SC").length)
  sink.count("reserved ST", rows.filter(r => r.row.reserved_for === "ST").length)
  sink.count("distinct st_code", new Set(rows.map(r => r.row.st_code)).size)
  sink.count("distinct state_name", new Set(rows.map(r => r.row.state_name)).size)
  const droppedRings = rows.reduce((a, r) => a + r.dropped_rings, 0)
  const droppedPolys = rows.reduce((a, r) => a + r.dropped_polygons, 0)
  if (droppedRings || droppedPolys) {
    sink.count("degenerate rings dropped", droppedRings)
    sink.count("degenerate polygons dropped", droppedPolys)
    sink.review("geometry-cleanup", rows
      .filter(r => r.dropped_rings || r.dropped_polygons)
      .map(r => ({ pc_code: r.row.pc_code, pc_name: r.row.pc_name,
                   geom_source: r.row.geom_source,
                   dropped_rings: r.dropped_rings, dropped_polygons: r.dropped_polygons })))
  }

  // ---- gates. Never write a partial seed: everything downstream FKs here. ---
  const fatal = []
  if (rows.length !== 543) fatal.push(`expected 543 seats, built ${rows.length}`)
  if (new Set(rows.map(r => r.row.pc_code)).size !== rows.length) fatal.push("duplicate pc_code")
  if (problems.length) {
    sink.review("missing-geometry", problems)
    fatal.push(`${problems.length} seat(s) have no geometry match`)
  }
  if (fatal.length) {
    for (const f of fatal) sink.warn(f)
    sink.finish({ gate: "failed", fatal })
    console.error(`\nSanity gate failed:\n  - ${fatal.join("\n  - ")}`)
    process.exit(1)
  }

  const geomByCode = new Map(rows.map(r => [r.row.pc_code, r.geometry]))
  await sink.upsert("in_constituencies", rows.map(r => r.row), {
    conflict: ["pc_code"],
    // geom is a PostGIS expression, not a value — see geomSql().
    raw: { geom: row => geomSql(geomByCode.get(row.pc_code)) },
    // Small batches: PC polygons are far larger than the ward polygons
    // seed-boundaries.mjs sends 10 at a time, and both the Management API and
    // psql are happier with modest statement sizes.
    batch: 5,
    preview: row => ({
      ...row,
      geom: `<MultiPolygon, ${JSON.stringify(geomByCode.get(row.pc_code)).length} bytes>`,
    }),
  })

  sink.finish({
    geometry_sources: bySource,
    crosswalk_origin: reference.origin,
    datameet_origin: dm.origin,
    shijithpk_origin: sh.origin,
  })
}

run(main, import.meta.url)
