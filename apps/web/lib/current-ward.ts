import type { Feature } from "geojson"

type Ring = number[][]
type PolygonCoordinates = Ring[]

export interface CurrentWardMeta {
  gba_ward_no: number | null
  gba_ward_name: string | null
  gba_ward_name_kn: string | null
  gba_corporation: string | null
  gba_corporation_id: number | null
  gba_ac: string | null
  gba_ac_no: number | null
  gba_zone: string | null
  gba_zone_name: string | null
  gba_population: number | null
}

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function pointInPolygon(lng: number, lat: number, polygon: PolygonCoordinates): boolean {
  return pointInRing(lng, lat, polygon[0]) && polygon.slice(1).every(hole => !pointInRing(lng, lat, hole))
}

export function featureContains(feature: Feature, lat: number, lng: number): boolean {
  if (feature.geometry.type === "Polygon") {
    return pointInPolygon(lng, lat, feature.geometry.coordinates as PolygonCoordinates)
  }
  if (feature.geometry.type === "MultiPolygon") {
    return (feature.geometry.coordinates as PolygonCoordinates[]).some(polygon => pointInPolygon(lng, lat, polygon))
  }
  return false
}

export function currentWardMeta(feature: Feature): CurrentWardMeta | null {
  const p = feature.properties as Record<string, unknown> | null
  if (!p || p.boundary_system !== "gba-369-2025") return null
  const number = (value: unknown) => value == null ? null : Number(value)
  const string = (value: unknown) => value == null ? null : String(value)
  return {
    gba_ward_no: number(p.ward_no),
    gba_ward_name: string(p.ward_name),
    gba_ward_name_kn: string(p.ward_name_kn),
    gba_corporation: string(p.corporation),
    gba_corporation_id: number(p.corporation_id),
    gba_ac: string(p.assembly_constituency),
    gba_ac_no: number(p.assembly_no),
    gba_zone: string(p.zone),
    gba_zone_name: string(p.zone_name),
    gba_population: number(p.population),
  }
}
