/**
 * Map layers — the "paint the city" choropleth registry.
 *
 * Pure data + pure functions only: this module is imported by both the
 * /api/map-layers route (server) and MapView/LayerControl (client), and by
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

export const MAP_LAYERS: MapLayerMeta[] = [
  {
    id: "criminal_cases",
    label: "MLA criminal cases",
    description: "Cases declared by each ward's MLA in their election affidavit",
    source: "ECI affidavits via MyNeta",
    format: "count",
    ramp: RED_ASC,
  },
  {
    id: "lad_utilization",
    label: "MLA fund utilisation",
    description: "% of Local Area Development funds the MLA has actually spent",
    source: "Karnataka assembly records via OpenCity",
    format: "pct",
    ramp: RED_DESC, // low utilisation = dark red
  },
  {
    id: "attendance",
    label: "MLA attendance",
    description: "% of assembly sessions attended by each ward's MLA",
    source: "Karnataka assembly records",
    format: "pct",
    ramp: RED_DESC, // low attendance = dark red
  },
  {
    id: "potholes",
    label: "Pothole complaints",
    description: "Complaints filed per ward on BBMP's Fix My Street (2022)",
    source: "BBMP Fix My Street",
    format: "count",
    ramp: RED_ASC,
  },
  {
    id: "flagged_contractors",
    label: "Flagged contractors",
    description: "Contractors with debarment-list flags active in each ward",
    source: "KPPP tenders × GeM / World Bank / CPPP / KPCL blacklists",
    format: "count",
    ramp: RED_ASC,
  },
  {
    id: "ward_spend",
    label: "Ward works spend",
    description: "Total recorded spend on ward-level works",
    source: "BBMP work orders via OpenCity",
    format: "inr_lakh",
    ramp: SAFFRON,
  },
  {
    id: "hospitals",
    label: "Hospitals",
    description: "Hospitals mapped within each ward",
    source: "OpenStreetMap",
    format: "count",
    ramp: GREEN,
  },
]

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

/** Human formatting for legend min/max and tooltips. */
export function formatValue(v: number, format: LayerFormat): string {
  if (format === "pct") return `${Math.round(v)}%`
  if (format === "inr_lakh") {
    if (v >= 100) return `₹${(v / 100).toFixed(1)} Cr`
    return `₹${Math.round(v)} L`
  }
  return v.toLocaleString("en-IN")
}
