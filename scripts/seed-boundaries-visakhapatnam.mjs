#!/usr/bin/env node
/**
 * seed-boundaries-visakhapatnam.mjs — Load GVMC's 98 ward boundaries into PostGIS.
 *
 * Source:
 *   OpenCity.in publishes a KML of GVMC's 98-ward delimitation (2024).
 *   Dataset: https://data.opencity.in/dataset/visakhapatnam-wards-map-2024
 *
 * This script:
 *   1. Downloads the KML
 *   2. Converts it to GeoJSON in-memory
 *   3. Writes a normalised GeoJSON to data/visakhapatnam-wards.geojson
 *      (so the frontend can render the boundary layer without running this)
 *   4. Inserts each ward into the wards table with city_id='visakhapatnam'
 *
 * The wards table is shared across cities — Bengaluru rows have
 * city_id='bengaluru', Vizag rows have city_id='visakhapatnam'. The frontend
 * pin_lookup RPC is already city-aware.
 *
 * Run:  node scripts/seed-boundaries-visakhapatnam.mjs
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 */

import { writeFile } from "node:fs/promises"
import { dbQuery } from "./lib/db.mjs"

// OpenCity dataset for Vizag wards (98-ward 2024 delimitation)
// The exact resource URL changes — fetch via CKAN API to be resilient.
const CKAN_API = "https://data.opencity.in/api/3/action"
const PACKAGE_ID = "visakhapatnam-wards-map-2024"

const OUTPUT_PATH = "data/visakhapatnam-wards.geojson"

// ─── KML → GeoJSON (minimal parser, no external deps) ─────────
//
// We parse a small subset of KML enough for ward boundaries:
//   - <Placemark> with <name> + <Polygon>/<MultiGeometry>
//   - <coordinates> as "lng,lat lng,lat ..." (KML is lng-lat-elev)
// Returns FeatureCollection in GeoJSON.

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function parseCoords(text) {
  // KML coords: "lng,lat[,alt] lng,lat[,alt] ..." — whitespace separated
  const points = []
  for (const triplet of text.trim().split(/\s+/)) {
    const parts = triplet.split(",")
    if (parts.length < 2) continue
    const lng = parseFloat(parts[0])
    const lat = parseFloat(parts[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    points.push([lng, lat])
  }
  return points
}

function extractFirst(block, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block)
  return m ? m[1].trim() : null
}

function extractAll(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi")
  const out = []
  let m
  while ((m = re.exec(block)) !== null) out.push(m[1])
  return out
}

function parsePlacemark(block) {
  const rawName = extractFirst(block, "name") || ""
  const name = decodeXmlEntities(rawName.replace(/<!\[CDATA\[(.*?)\]\]>/, "$1")).trim()

  // Extended data — OpenCity sometimes embeds ward_no in <Data name="WARD_NO">
  const ward_no = (() => {
    const m = /<Data\s+name="WARD_NO"[^>]*>\s*<value>([^<]+)<\/value>/i.exec(block)
    return m ? parseInt(m[1], 10) : null
  })()

  // Polygon
  const polygons = []
  for (const poly of extractAll(block, "Polygon")) {
    const outer = extractFirst(poly, "outerBoundaryIs")
    if (!outer) continue
    const coordsBlock = extractFirst(outer, "coordinates")
    if (!coordsBlock) continue
    const ring = parseCoords(coordsBlock)
    if (ring.length < 4) continue

    // Inner rings (holes)
    const inner = []
    for (const innerBoundary of extractAll(poly, "innerBoundaryIs")) {
      const cb = extractFirst(innerBoundary, "coordinates")
      if (!cb) continue
      const ringInner = parseCoords(cb)
      if (ringInner.length >= 4) inner.push(ringInner)
    }
    polygons.push([ring, ...inner])
  }

  if (polygons.length === 0) return null

  const geometry = polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons.map(p => p) }

  return {
    type: "Feature",
    properties: { name, ward_no },
    geometry,
  }
}

function kmlToGeoJSON(kmlText) {
  const features = []
  const re = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi
  let m
  while ((m = re.exec(kmlText)) !== null) {
    const f = parsePlacemark(m[1])
    if (f) features.push(f)
  }
  return { type: "FeatureCollection", features }
}

// ─── CKAN: find the KML resource URL ──────────────────────────

async function findKmlUrl() {
  const res = await fetch(`${CKAN_API}/package_show?id=${PACKAGE_ID}`, {
    headers: { "User-Agent": "kaun-civic/1.0 (civic-transparency-project)" },
  })
  if (!res.ok) throw new Error(`CKAN package_show failed: ${res.status}`)
  const pkg = await res.json()
  const resources = pkg.result?.resources ?? []
  // Prefer KML over Shapefile/CSV
  const kml = resources.find(r => /kml/i.test(r.format)) ?? resources.find(r => /\.kml(\?|$)/i.test(r.url ?? ""))
  if (!kml) throw new Error(`No KML resource found in package ${PACKAGE_ID}. Resources: ${resources.map(r => r.format).join(", ")}`)
  return kml.url
}

// ─── Ward number resolution ───────────────────────────────────

function resolveWardNo(feature, idx) {
  if (Number.isFinite(feature.properties.ward_no)) return feature.properties.ward_no
  // Try parsing from name (e.g., "Ward 42 — Asilmetta", "Ward-42")
  const m = /(?:^|ward[\s-]*)(\d+)/i.exec(feature.properties.name || "")
  if (m) return parseInt(m[1], 10)
  // Fall back to 1-indexed sequence
  return idx + 1
}

function resolveWardName(feature) {
  const raw = feature.properties.name || ""
  // Strip "Ward 42 — " or "Ward-42 " prefix to get just the locality name
  return raw
    .replace(/^ward[\s-]*\d+\s*[—:-]\s*/i, "")
    .replace(/^ward[\s-]*\d+\s*/i, "")
    .trim() || raw
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`[${new Date().toISOString()}] Vizag ward boundaries seed started`)

  // Step 1: find + download KML
  console.log("Resolving KML URL via CKAN...")
  const kmlUrl = await findKmlUrl()
  console.log(`  KML URL: ${kmlUrl}`)

  console.log("Downloading KML...")
  const kmlRes = await fetch(kmlUrl, {
    headers: { "User-Agent": "kaun-civic/1.0 (civic-transparency-project)" },
  })
  if (!kmlRes.ok) throw new Error(`KML download failed: ${kmlRes.status}`)
  const kmlText = await kmlRes.text()
  console.log(`  Downloaded ${kmlText.length} bytes`)

  // Step 2: convert to GeoJSON
  const geojson = kmlToGeoJSON(kmlText)
  console.log(`  Parsed ${geojson.features.length} features`)
  if (geojson.features.length < 50) {
    throw new Error(`Expected ~98 wards but only parsed ${geojson.features.length}. KML format may have changed.`)
  }

  // Normalise properties so the GeoJSON file the frontend loads is clean
  const normalised = {
    type: "FeatureCollection",
    name: "Visakhapatnam Wards 2024",
    features: geojson.features.map((f, i) => ({
      type: "Feature",
      properties: {
        ward_no: resolveWardNo(f, i),
        ward_name: resolveWardName(f),
        city_id: "visakhapatnam",
      },
      geometry: f.geometry,
    })),
  }

  // Step 3: write GeoJSON file (this is what the frontend fetches)
  await writeFile(OUTPUT_PATH, JSON.stringify(normalised))
  console.log(`  Wrote ${OUTPUT_PATH}`)

  // Step 4: ensure the wards table has Vizag's 98 wards in PostGIS
  console.log("Ensuring wards table is ready (city_id-aware)...")
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS wards (
      ward_no  INTEGER NOT NULL,
      city_id  TEXT NOT NULL DEFAULT 'bengaluru',
      ward_name TEXT,
      assembly_constituency TEXT,
      zone     TEXT,
      geom     GEOMETRY(MULTIPOLYGON, 4326),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (city_id, ward_no)
    );
    CREATE INDEX IF NOT EXISTS wards_geom_idx ON wards USING GIST (geom);
    CREATE INDEX IF NOT EXISTS wards_city_idx ON wards (city_id);
  `)

  // Step 5: clear and re-seed Vizag rows
  await dbQuery(`DELETE FROM wards WHERE city_id = 'visakhapatnam';`)

  let inserted = 0
  for (const f of normalised.features) {
    const wardNo = f.properties.ward_no
    const wardName = (f.properties.ward_name || "").replace(/'/g, "''")
    const geomJson = JSON.stringify(f.geometry).replace(/'/g, "''")

    // ST_Multi ensures Polygon → MultiPolygon for the column type
    const sql = `
      INSERT INTO wards (ward_no, city_id, ward_name, geom)
      VALUES (
        ${wardNo},
        'visakhapatnam',
        '${wardName}',
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('${geomJson}'), 4326))
      )
      ON CONFLICT (city_id, ward_no) DO UPDATE
        SET ward_name = EXCLUDED.ward_name,
            geom = EXCLUDED.geom;
    `
    try {
      await dbQuery(sql)
      inserted++
    } catch (e) {
      console.error(`  Ward ${wardNo} (${wardName}) failed: ${e.message}`)
    }
  }

  // Step 6: verify
  const summary = await dbQuery(`
    SELECT COUNT(*) as ward_count,
           ST_AsText(ST_Centroid(ST_Union(geom))) as city_centroid
    FROM wards
    WHERE city_id = 'visakhapatnam';
  `)
  console.log(`\nInserted ${inserted} of ${normalised.features.length} wards.`)
  console.log("Summary:", summary[0])
  console.log(`[${new Date().toISOString()}] Done.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
