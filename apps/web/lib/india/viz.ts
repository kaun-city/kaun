/**
 * viz.ts — the India layer's data-colour system. Defined once, used by the
 * choropleth, the tracker's magnitude bars, the project timeline and every
 * legend.
 *
 * WHY A SYSTEM AND NOT PER-CHART COLOURS
 * --------------------------------------
 * The city UI has effectively one data colour: an amber ward outline. That
 * scales to 243 wards of one metric. It does not scale to 543 seats × several
 * metrics plus a signed cost-overrun scale, and picking colours per chart is
 * how a product stops looking like one product.
 *
 * TWO RAMPS, AND ONLY TWO.
 *
 *   SEQUENTIAL (magnitude) — money, counts, percentages. Dim → bright amber,
 *   because the basemap is near-black: on dark, luminance IS the magnitude
 *   channel, so the ramp climbs monotonically in lightness and a reader can
 *   order it without reading the legend.
 *
 *   DIVERGING (signed) — cost overrun and schedule slip, which have a real
 *   zero: on budget, on schedule. Teal below zero, neutral grey at zero, amber
 *   → deep orange above.
 *
 * COLOURBLIND SAFETY. The diverging ramp is teal↔orange, not red↔green: the
 * two hues stay distinguishable under deuteranopia and protanopia, which
 * red/green does not, and the ends also differ in lightness so the ramp still
 * reads in full monochrome. Both ramps are 5 steps, matching
 * lib/map-layers.ts's quantileBreaks/colorFor, which this module reuses rather
 * than reimplementing.
 *
 * Pure data + pure functions. No React, no Leaflet.
 */

/** Brand accent. The bright end of the sequential ramp is this colour. */
export const KAUN_SAFFRON = "#FF9933"

/** Value absent — never a colour on either ramp, always this grey. */
export const NO_DATA_FILL = "#3a3a3a"
export const NO_DATA_STROKE = "#5a5a5a"

/** Magnitude, low → high. Monotonic in lightness on a near-black basemap. */
export const RAMP_SEQUENTIAL = ["#4a2c0b", "#7d4a0e", "#b06c12", "#e08d1f", "#ffb454"] as const

/**
 * Signed, most-negative → most-positive.
 * teal (under / earlier) · neutral (no change) · amber → deep orange (over / later)
 */
export const RAMP_DIVERGING = ["#0e7490", "#5aa9bd", "#7a7a7a", "#e0912a", "#c2410c"] as const

export type Ramp = readonly [string, string, string, string, string]

/**
 * Bucket a signed value on the diverging ramp around a true zero.
 * `scale` is the magnitude at which a value is considered extreme; anything
 * beyond it saturates rather than compressing the middle of the ramp.
 */
export function divergingColor(value: number | null | undefined, scale: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_FILL
  if (value === 0) return RAMP_DIVERGING[2]
  const t = Math.max(-1, Math.min(1, value / (scale || 1)))
  if (t <= -0.5) return RAMP_DIVERGING[0]
  if (t < 0) return RAMP_DIVERGING[1]
  if (t < 0.5) return RAMP_DIVERGING[3]
  return RAMP_DIVERGING[4]
}

/** 0–1 share of a bar's full width, clamped. Null renders no bar at all. */
export function barFraction(value: number | null | undefined, max: number): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || max <= 0) return null
  return Math.max(0, Math.min(1, Math.abs(value) / max))
}
