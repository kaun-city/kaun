#!/usr/bin/env node
/**
 * Build the public Bengaluru ward layer from OpenCity's final GBA KML.
 *
 * Dry-run is the default. Pass --write to update the checked-in GeoJSON.
 */

import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { kmlToGeoJSON } from "./lib/kml.mjs"

export const SOURCE_URL = "https://data.opencity.in/dataset/863209cb-4ced-4f51-b5c5-156939c50922/resource/9013d656-8051-4e2d-9648-46efd0d86d3d/download/gba-369-wards-december-2025.kml"
const OUTPUT_URL = new URL("../apps/web/public/bengaluru-gba-369.geojson", import.meta.url)

const numberOrNull = value => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function ringArea(ring) {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return area / 2
}

function pointInRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function representativePoint(geometry) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]
  const polygon = polygons.toSorted((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0]
  const outer = polygon[0]
  const inside = point => pointInRing(point, outer) && polygon.slice(1).every(hole => !pointInRing(point, hole))
  const xs = outer.map(p => p[0])
  const ys = outer.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const candidates = [
    [(minX + maxX) / 2, (minY + maxY) / 2],
    [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length],
  ]
  for (let row = 1; row < 20; row++) {
    for (let col = 1; col < 20; col++) {
      candidates.push([minX + (maxX - minX) * col / 20, minY + (maxY - minY) * row / 20])
    }
  }
  const point = candidates.find(inside)
  if (!point) throw new Error("Could not find an interior label point")
  return point
}

export function normalizeFeature(feature) {
  const p = feature.properties
  const [centerLng, centerLat] = representativePoint(feature.geometry)
  return {
    type: "Feature",
    properties: {
      ward_no: numberOrNull(p.ward_id),
      ward_name: p.ward_name,
      ward_name_kn: p.ward_name_kn,
      boundary_system: "gba-369-2025",
      corporation: p.Corporation,
      corporation_kn: p.corporation_kn,
      corporation_id: numberOrNull(p.corporation_id),
      assembly_constituency: p.ac,
      assembly_constituency_kn: p.ac_kn,
      assembly_no: numberOrNull(p.ac_no),
      population: numberOrNull(p.TOT_P),
      division: p.RO_Division,
      subdivision: p["ARO_ Sub Division"],
      zone: p.zone,
      zone_name: p.zone_name,
      center_lat: centerLat,
      center_lng: centerLng,
    },
    geometry: feature.geometry,
  }
}

export function validate(collection) {
  const wards = new Set(collection.features.map(f => `${f.properties.corporation_id}:${f.properties.ward_no}`))
  const corporations = new Set(collection.features.map(f => f.properties.corporation))
  if (collection.features.length !== 369 || wards.size !== 369) {
    throw new Error(`Expected 369 unique corporation/ward pairs; got ${collection.features.length} features and ${wards.size} pairs`)
  }
  if (corporations.size !== 5 || corporations.has(undefined)) {
    throw new Error(`Expected five named corporations; got ${[...corporations].join(", ")}`)
  }
  for (const f of collection.features) {
    if (!f.properties.ward_name || !f.geometry) throw new Error(`Ward ${f.properties.ward_no} is incomplete`)
  }
}

async function loadKml() {
  const inputArg = process.argv.find(arg => arg.startsWith("--input="))
  if (inputArg) return readFile(inputArg.slice("--input=".length), "utf8")
  const response = await fetch(SOURCE_URL)
  if (!response.ok) throw new Error(`OpenCity returned ${response.status}`)
  return response.text()
}

async function main() {
  const parsed = kmlToGeoJSON(await loadKml())
  const collection = {
    type: "FeatureCollection",
    name: "GBA 369 wards — December 2025",
    source: SOURCE_URL,
    source_updated: "2025-12",
    features: parsed.features.map(normalizeFeature),
  }
  validate(collection)

  const corporations = [...new Set(collection.features.map(f => f.properties.corporation))].sort()
  console.log(`Validated ${collection.features.length} wards across ${corporations.join(", ")}`)
  if (!process.argv.includes("--write")) {
    console.log("Dry run complete. Pass --write to update apps/web/public/bengaluru-gba-369.geojson.")
    return
  }
  await writeFile(OUTPUT_URL, `${JSON.stringify(collection)}\n`)
  console.log(`Wrote ${fileURLToPath(OUTPUT_URL)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exit(1) })
}
