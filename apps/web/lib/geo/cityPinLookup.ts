/**
 * Client-side point-in-polygon ward lookup.
 * Used for cities where we have a GeoJSON boundary file but no PostGIS RPC.
 * (Hyderabad / GHMC — 150 wards from Datameet)
 */

import booleanPointInPolygon from "@turf/boolean-point-in-polygon"
import { point } from "@turf/helpers"
import type { Feature, Polygon, MultiPolygon, GeoJsonProperties } from "geojson"
import type { PinResult } from "@/lib/types"
import type { CityConfig } from "@/lib/cities"

// Cache loaded GeoJSON per city to avoid re-fetching on every pin drop
const geojsonCache: Record<string, Feature<Polygon | MultiPolygon, GeoJsonProperties>[]> = {}

// Cache ward -> AC mapping per city
const acMapCache: Record<string, Record<number, string>> = {}

async function loadAcMap(city: CityConfig): Promise<Record<number, string>> {
  if (acMapCache[city.id]) return acMapCache[city.id]
  if (!city.wardAcMapUrl) return {}
  try {
    const res = await fetch(city.wardAcMapUrl)
    const rows: { ward_no: number; assembly_constituency: string }[] = await res.json()
    const map: Record<number, string> = {}
    for (const r of rows) map[r.ward_no] = r.assembly_constituency
    acMapCache[city.id] = map
    return map
  } catch {
    return {}
  }
}

async function loadFeatures(geojsonUrl: string, cityId: string) {
  if (geojsonCache[cityId]) return geojsonCache[cityId]
  const res = await fetch(geojsonUrl)
  const data = await res.json()
  geojsonCache[cityId] = data.features ?? []
  return geojsonCache[cityId]
}

/**
 * Parse ward number and name from a GeoJSON feature.
 * Handles both BBMP-style (KGISWardNo / KGISWardName) and
 * GHMC-style (name = "Ward 91 Khairatabad").
 */
function parseWardFromFeature(feature: Feature<Polygon | MultiPolygon, GeoJsonProperties>): {
  ward_no: number | null
  ward_name: string | null
  zone: string | null
  assembly_constituency: string | null
} {
  const p = feature.properties ?? {}

  // BBMP style
  if (p.KGISWardNo != null) {
    return {
      ward_no: Number(p.KGISWardNo),
      ward_name: p.KGISWardName ?? null,
      zone: p.ZoneName ?? null,
      assembly_constituency: p.Assembly ?? null,
    }
  }

  // GHMC style: "Ward 91 Khairatabad"
  const name: string = p.name ?? ""
  const m = name.match(/^Ward (\d+)\s+(.+)$/)
  if (m) {
    return {
      ward_no: parseInt(m[1], 10),
      ward_name: m[2].trim(),
      zone: null,
      assembly_constituency: null,
    }
  }

  return { ward_no: null, ward_name: name || null, zone: null, assembly_constituency: null }
}

/**
 * Look up which ward a lat/lng falls in, using client-side GeoJSON.
 * Returns null if the point is outside all wards.
 */
export async function clientPinLookup(
  lat: number,
  lng: number,
  city: CityConfig
): Promise<PinResult | null> {
  try {
    const features = await loadFeatures(city.geojsonUrl, city.id)
    const pt = point([lng, lat]) // GeoJSON is [lng, lat]

    for (const feature of features) {
      if (
        feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon"
      ) continue

      if (booleanPointInPolygon(pt, feature as Feature<Polygon | MultiPolygon>)) {
        const { ward_no, ward_name, zone, assembly_constituency } = parseWardFromFeature(feature)
        const acMap = await loadAcMap(city)
        const resolvedAc = assembly_constituency ?? (ward_no ? (acMap[ward_no] ?? null) : null)
        return {
          found: true,
          city_id: city.id,
          ward_no: ward_no ?? 0,
          ward_name: ward_name ?? "",
          zone,
          assembly_constituency: resolvedAc,
          // GBA fields not applicable for non-Bengaluru cities
          gba_ward_no: null,
          gba_ward_name: null,
          gba_ward_name_kn: null,
          gba_corporation: null,
          gba_corporation_id: null,
          gba_ac: null,
          gba_ac_no: null,
          gba_zone: null,
          gba_zone_name: null,
          gba_population: null,
          lat,
          lng,
        }
      }
    }

    // Point not in any ward
    return { found: false } as PinResult
  } catch (e) {
    console.error("[cityPinLookup] failed:", e)
    return null
  }
}
