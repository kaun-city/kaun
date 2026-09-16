import { BBMP_198_RECORDS_ATTRIBUTABLE } from "./ward-data-quality.ts"
/**
 * Map layers — the "paint the city" choropleth registry.
 *
 * Pure data + pure functions only: this module is imported by both the
 * /api/map-layers route (server) and MapView/MapLayerPicker (client), and by
 * the node:test suite via --experimental-strip-types. Keep it free of React,
 * Leaflet, and Supabase imports.
 */

export type LayerFormat = "count" | "pct" | "inr_lakh"

export interface MapLayerMeta {
  id: string
  /** Full label shown in the layer panel */
  label: string
  /** One-line explanation under the label */
  description: string
  /** Attribution line shown in the legend */
  source: string
  format: LayerFormat
  /** What the legend scale measures, in plain words, shown under its ends */
  unit: string
  /**
   * Color ramp, low value → high value, always 5 steps.
   * Orientation already encodes polarity: for "bad when high" metrics the
   * ramp ends dark red; for "bad when low" metrics it starts dark red.
   */
  ramp: [string, string, string, string, string]
}

// Ramps tuned for the dark CARTO basemap at fillOpacity ~0.55
const RED_ASC: MapLayerMeta["ramp"]  = ["#facc15", "#fb923c", "#ef4444", "#b91c1c", "#7f1d1d"]
const RED_DESC: MapLayerMeta["ramp"] = ["#7f1d1d", "#b91c1c", "#ef4444", "#fb923c", "#facc15"]
const SAFFRON: MapLayerMeta["ramp"]  = ["#fed7aa", "#fdba74", "#fb923c", "#ea580c", "#9a3412"]
const GREEN: MapLayerMeta["ramp"]    = ["#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#15803d"]

const ALL_MAP_LAYERS: MapLayerMeta[] = [
  {
    id: "criminal_cases",
    label: "MLA criminal cases",
    description: "Cases declared by each ward's MLA in their election affidavit",
    source: "ECI affidavits via MyNeta",
    format: "count",
    unit: "Criminal cases declared by the MLA",
    ramp: RED_ASC,
  },
  {
    id: "lad_utilization",
    label: "MLA fund utilisation",
    description: "% of Local Area Development funds the MLA has actually spent",
    source: "Karnataka assembly records via OpenCity",
    format: "pct",
    unit: "% of MLA development funds spent",
    ramp: RED_DESC, // low utilisation = dark red
  },
  {
    id: "attendance",
    label: "MLA attendance",
    description: "% of assembly sessions attended by each ward's MLA",
    source: "Karnataka assembly records",
    format: "pct",
    unit: "% of assembly sessions attended",
    ramp: RED_DESC, // low attendance = dark red
  },
  {
    id: "potholes",
    label: "Pothole complaints",
    description: "Estimated from historical ward overlaps · Fix My Street (2022)",
    source: "BBMP Fix My Street",
    format: "count",
    unit: "Pothole complaints per ward, estimated",
    ramp: RED_ASC,
  },
  {
    id: "flagged_contractors",
    label: "Flagged contractors",
    description: "Estimated from crosswalked historical work-order wards",
    source: "KPPP tenders × GeM / World Bank / CPPP / KPCL blacklists",
    format: "count",
    unit: "Flagged contractors per ward",
    ramp: RED_ASC,
  },
  {
    id: "ward_spend",
    label: "Ward works spend",
    description: "Historical ward spend allocated by geographic overlap",
    source: "BBMP work orders via OpenCity",
    format: "inr_lakh",
    unit: "Works spend per ward, estimated",
    ramp: SAFFRON,
  },
  {
    id: "hospitals",
    label: "Hospitals",
    description: "Historical OSM ward counts allocated by geographic overlap",
    source: "OpenStreetMap",
    format: "count",
    unit: "Hospitals per ward, estimated",
    ramp: GREEN,
  },
]

/** Layers read from BBMP 198-ward tables, withdrawn while those can't be attributed (see lib/ward-data-quality.ts). */
const BBMP_198_LAYER_IDS = new Set(["potholes", "ward_spend"])

export const MAP_LAYERS: MapLayerMeta[] = ALL_MAP_LAYERS.filter(
  layer => BBMP_198_RECORDS_ATTRIBUTABLE || !BBMP_198_LAYER_IDS.has(layer.id),
)

export function getLayer(id: string | null | undefined): MapLayerMeta | null {
  if (!id) return null
  return MAP_LAYERS.find(l => l.id === id) ?? null
}

/**
 * Quantile break points for a 5-bucket choropleth.
 * Returns up to `buckets - 1` ascending, deduplicated inner breaks.
 * With heavily-tied data (e.g. most wards at 0) breaks collapse — colorFor
 * handles short break arrays gracefully.
 */
export function quantileBreaks(values: number[], buckets = 5): number[] {
  const sorted = [...values].filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const breaks: number[] = []
  for (let i = 1; i < buckets; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor((i / buckets) * sorted.length))
    breaks.push(sorted[idx])
  }
  // Dedupe while preserving order
  return breaks.filter((b, i) => i === 0 || b !== breaks[i - 1])
}

/** Bucket a value into the ramp using the given breaks (strictly-greater). */
export function colorFor(value: number, breaks: number[], ramp: readonly string[]): string {
  let idx = 0
  for (const b of breaks) {
    if (value > b) idx++
  }
  return ramp[Math.min(idx, ramp.length - 1)]
}

/** Human formatting for tooltips and the India legends. */
export function formatValue(v: number, format: LayerFormat): string {
  if (format === "pct") return `${Math.round(v)}%`
  if (format === "inr_lakh") {
    if (v >= 100) return `₹${(v / 100).toFixed(1)} Cr`
    return `₹${Math.round(v)} L`
  }
  return v.toLocaleString("en-IN")
}

/**
 * Legend scale ends for the city map. Counts are whole things (the overlap
 * estimates arrive fractional: 539.27 complaints reads as false precision),
 * rupees drop the unit on zero, and the unit itself lives in `unit`.
 */
export function formatLegendValue(v: number, format: LayerFormat): string {
  if (!Number.isFinite(v)) return "—"
  if (format === "pct") return `${Math.round(v)}%`
  if (format === "inr_lakh") {
    if (v <= 0) return "₹0"
    if (v >= 100) return `₹${(v / 100).toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr`
    if (v < 1) return "<₹1 L"
    return `₹${Math.round(v)} L`
  }
  return Math.round(v).toLocaleString("en-IN")
}

/** Wards the layer leaves unpainted (grey on the map), never negative. */
export function wardsWithoutData(totalWards: number, wardsWithData: number): number {
  return Math.max(0, Math.round(totalWards) - Math.round(wardsWithData))
}
