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
import { kmlToGeoJSON, resolveWardNo, resolveWardName } from "./lib/kml.mjs"

// OpenCity dataset for Vizag wards (98-ward 2024 delimitation)
// The exact resource URL changes — fetch via CKAN API to be resilient.
const CKAN_API = "https://data.opencity.in/api/3/action"
const PACKAGE_ID = "visakhapatnam-wards-map-2024"

const OUTPUT_PATH = "data/visakhapatnam-wards.geojson"

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
