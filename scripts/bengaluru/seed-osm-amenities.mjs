#!/usr/bin/env node
/**
 * seed-osm-amenities.mjs — Fetch ward-level amenity counts from OpenStreetMap via Overpass API.
 *
 * Queries the Overpass API for amenity/facility counts within each ward boundary,
 * expanding city coverage far beyond traditional opencity.in datasets.
 *
 * Amenities seeded:
 *   - hospitals & clinics (amenity=hospital|clinic)
 *   - pharmacies (amenity=pharmacy)
 *   - ATMs & banks (amenity=atm|bank)
 *   - public toilets (amenity=toilets)
 *   - EV charging stations (amenity=charging_station)
 *   - petrol pumps (amenity=fuel)
 *   - post offices (amenity=post_office)
 *   - libraries (amenity=library)
 *   - community halls (amenity=community_centre)
 *   - places of worship (amenity=place_of_worship)
 *   - restaurants & cafes (amenity=restaurant|cafe)
 *   - metro stations (station=subway | railway=station + subway)
 *
 * Source: OpenStreetMap (© OSM contributors, ODbL)
 * Run:    node scripts/seed-osm-amenities.mjs
 * Env:    SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 */

import { dbQuery, upsertRows, selectRows } from "./lib/db.mjs"

const OVERPASS_URL = "https://overpass-api.de/api/interpreter"

// Bengaluru bounding box (rough) for area queries
const BLR_BBOX = "12.7,77.35,13.25,77.85"

// Amenity categories to query — each entry becomes a column in ward_amenities
const AMENITY_CATEGORIES = [
  { key: "hospitals",         query: `node["amenity"="hospital"]({{bbox}});way["amenity"="hospital"]({{bbox}});`,       label: "Hospitals" },
  { key: "clinics",           query: `node["amenity"="clinic"]({{bbox}});way["amenity"="clinic"]({{bbox}});`,           label: "Clinics" },
  { key: "pharmacies",        query: `node["amenity"="pharmacy"]({{bbox}});`,                                           label: "Pharmacies" },
  { key: "atms",              query: `node["amenity"="atm"]({{bbox}});`,                                                label: "ATMs" },
  { key: "banks",             query: `node["amenity"="bank"]({{bbox}});way["amenity"="bank"]({{bbox}});`,               label: "Banks" },
  { key: "public_toilets",    query: `node["amenity"="toilets"]({{bbox}});`,                                            label: "Public Toilets" },
  { key: "ev_charging",       query: `node["amenity"="charging_station"]({{bbox}});`,                                   label: "EV Charging" },
  { key: "petrol_pumps",      query: `node["amenity"="fuel"]({{bbox}});way["amenity"="fuel"]({{bbox}});`,               label: "Petrol Pumps" },
  { key: "post_offices",      query: `node["amenity"="post_office"]({{bbox}});`,                                        label: "Post Offices" },
  { key: "libraries",         query: `node["amenity"="library"]({{bbox}});way["amenity"="library"]({{bbox}});`,         label: "Libraries" },
  { key: "community_halls",   query: `node["amenity"="community_centre"]({{bbox}});way["amenity"="community_centre"]({{bbox}});`, label: "Community Halls" },
  { key: "places_of_worship", query: `node["amenity"="place_of_worship"]({{bbox}});way["amenity"="place_of_worship"]({{bbox}});`, label: "Places of Worship" },
  { key: "restaurants",       query: `node["amenity"="restaurant"]({{bbox}});`,                                         label: "Restaurants" },
  { key: "cafes",             query: `node["amenity"="cafe"]({{bbox}});`,                                               label: "Cafes" },
  { key: "metro_stations",    query: `node["station"="subway"]({{bbox}});node["railway"="station"]["subway"="yes"]({{bbox}});`, label: "Metro Stations" },
]

/**
 * Query Overpass API and return array of {lat, lon} for all matching elements.
 * Uses out:center for ways/relations so we get a single point per feature.
 */
async function queryOverpass(overpassQuery) {
  const fullQuery = `[out:json][timeout:120][bbox:${BLR_BBOX}];(${overpassQuery});out center;`
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(fullQuery)}`,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Overpass API ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.elements || []).map(el => ({
    lat: el.lat ?? el.center?.lat,
    lon: el.lon ?? el.center?.lon,
  })).filter(p => p.lat && p.lon)
}

/**
 * Use PostGIS spatial query to count how many points fall within each ward boundary.
 * Inserts points into a temp table, then joins against ward geometries.
 */
async function countPointsPerWard(points, columnName) {
  if (!points.length) {
    console.log(`  ${columnName}: 0 points from OSM, skipping`)
    return {}
  }

  // Build a VALUES clause for all points
  // Batch into chunks to avoid SQL length limits
  const BATCH = 500
  const allCounts = {}

  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH)
    const valuesList = batch
      .map(p => `(ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326))`)
      .join(",")

    const sql = `
      WITH pts AS (
        SELECT geom FROM (VALUES ${valuesList}) AS t(geom)
      )
      SELECT w.ward_no, COUNT(*) as cnt
      FROM wards w
      JOIN pts ON ST_Contains(w.geom, pts.geom)
      WHERE w.city_id = 'bengaluru'
      GROUP BY w.ward_no;
    `
    const rows = await dbQuery(sql)
    for (const row of rows) {
      const wn = parseInt(row.ward_no, 10)
      allCounts[wn] = (allCounts[wn] || 0) + parseInt(row.cnt, 10)
    }
  }

  const totalWards = Object.keys(allCounts).length
  const totalCount = Object.values(allCounts).reduce((a, b) => a + b, 0)
  console.log(`  ${columnName}: ${points.length} OSM features → ${totalCount} matched across ${totalWards} wards`)
  return allCounts
}

/**
 * Sleep helper to respect Overpass API rate limits.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log(`[${new Date().toISOString()}] OSM amenities seed started`)
  console.log(`Querying ${AMENITY_CATEGORIES.length} categories from Overpass API...`)

  // Step 1: Create ward_amenities table if it doesn't exist
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS ward_amenities (
      ward_no       INTEGER NOT NULL,
      city_id       TEXT NOT NULL DEFAULT 'bengaluru',
      hospitals     INTEGER DEFAULT 0,
      clinics       INTEGER DEFAULT 0,
      pharmacies    INTEGER DEFAULT 0,
      atms          INTEGER DEFAULT 0,
      banks         INTEGER DEFAULT 0,
      public_toilets INTEGER DEFAULT 0,
      ev_charging   INTEGER DEFAULT 0,
      petrol_pumps  INTEGER DEFAULT 0,
      post_offices  INTEGER DEFAULT 0,
      libraries     INTEGER DEFAULT 0,
      community_halls INTEGER DEFAULT 0,
      places_of_worship INTEGER DEFAULT 0,
      restaurants   INTEGER DEFAULT 0,
      cafes         INTEGER DEFAULT 0,
      metro_stations INTEGER DEFAULT 0,
      data_source   TEXT DEFAULT 'openstreetmap',
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (ward_no, city_id)
    );
  `)
  console.log("Table ward_amenities ready.")

  // Step 2: Query each amenity category from Overpass and count per ward
  const wardData = {} // { wardNo: { hospitals: N, pharmacies: N, ... } }

  for (const cat of AMENITY_CATEGORIES) {
    console.log(`\nFetching ${cat.label}...`)
    try {
      const resolvedQuery = cat.query.replace(/\{\{bbox\}\}/g, BLR_BBOX)
      const points = await queryOverpass(resolvedQuery)
      const counts = await countPointsPerWard(points, cat.key)

      for (const [wardNo, count] of Object.entries(counts)) {
        if (!wardData[wardNo]) wardData[wardNo] = {}
        wardData[wardNo][cat.key] = count
      }

      // Be polite to the Overpass API
      await sleep(2000)
    } catch (err) {
      console.error(`  ERROR fetching ${cat.label}:`, err.message)
      // Continue with other categories
    }
  }

  // Step 3: Upsert into ward_amenities
  console.log("\nUpserting ward amenities data...")
  const rows = Object.entries(wardData).map(([wardNo, data]) => ({
    ward_no: parseInt(wardNo, 10),
    city_id: "bengaluru",
    hospitals: data.hospitals || 0,
    clinics: data.clinics || 0,
    pharmacies: data.pharmacies || 0,
    atms: data.atms || 0,
    banks: data.banks || 0,
    public_toilets: data.public_toilets || 0,
    ev_charging: data.ev_charging || 0,
    petrol_pumps: data.petrol_pumps || 0,
    post_offices: data.post_offices || 0,
    libraries: data.libraries || 0,
    community_halls: data.community_halls || 0,
    places_of_worship: data.places_of_worship || 0,
    restaurants: data.restaurants || 0,
    cafes: data.cafes || 0,
    metro_stations: data.metro_stations || 0,
    data_source: "openstreetmap",
    updated_at: new Date().toISOString(),
  }))

  // Batch upsert
  for (let i = 0; i < rows.length; i += 50) {
    await upsertRows("ward_amenities", rows.slice(i, i + 50), "ward_no,city_id")
  }
  console.log(`Upserted ${rows.length} ward records.`)

  // Step 4: Verify
  const check = await dbQuery(`
    SELECT
      COUNT(*) as ward_count,
      SUM(hospitals) as total_hospitals,
      SUM(pharmacies) as total_pharmacies,
      SUM(atms) as total_atms,
      SUM(public_toilets) as total_toilets,
      SUM(ev_charging) as total_ev,
      SUM(metro_stations) as total_metro,
      SUM(restaurants) as total_restaurants
    FROM ward_amenities
    WHERE city_id = 'bengaluru';
  `)
  console.log("\nFinal summary:", check[0])
  console.log(`[${new Date().toISOString()}] OSM amenities seed done.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
