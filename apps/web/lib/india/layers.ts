/**
 * Choropleth layers for the national map.
 *
 * Bucketing reuses quantileBreaks/colorFor from lib/map-layers.ts — that module
 * is already pure and tested and its behaviour is what the Bengaluru map uses,
 * so both maps bucket identically. Only the ramps differ, and they come from
 * lib/india/viz.ts so every India surface shares one colour system.
 *
 * WHAT IS NOT A LAYER HERE, ON PURPOSE
 * ------------------------------------
 * No composite score. The city app grades a ward out of 100; grading a named
 * MP or a whole constituency on a single national number is an editorial call
 * that has not been made, and a v1 that quietly makes it for everyone would be
 * hard to walk back. Layers show one sourced component at a time.
 *
 * And no attendance value for ministers. sansad.in reports signedDaysCount: 0
 * for them and PRS states in words that they do not sign the register — a raw
 * national attendance choropleth would paint every cabinet seat as an
 * absentee. Their seats carry no value and render in the no-data grey, with
 * the legend saying why.
 */
import type { LayerFormat } from "../map-layers"
import { RAMP_SEQUENTIAL, type Ramp } from "./viz.ts"

export type IndiaLayerId = "criminal_cases" | "attendance" | "mplads_utilization"

export interface IndiaLayerMeta {
  id: IndiaLayerId
  label: string
  description: string
  source: string
  format: LayerFormat
  ramp: Ramp
  /**
   * When true the ramp is read high→low, i.e. the DIM end is the high value.
   * Used where low is the notable case (low attendance, low fund use) so the
   * eye still lands on what matters without a second colour scheme.
   */
  invert?: boolean
  /** Why a seat can legitimately have no value. Shown under the legend. */
  absentNote?: string
}

export const INDIA_LAYERS: IndiaLayerMeta[] = [
  {
    id: "criminal_cases",
    label: "Declared criminal cases",
    description: "Cases the sitting MP declared in their 2024 nomination affidavit",
    source: "ECI affidavits via MyNeta",
    format: "count",
    ramp: RAMP_SEQUENTIAL,
    absentNote: "A seat with no colour has no reviewed affidavit loaded — that is not a declaration of zero.",
  },
  {
    id: "attendance",
    label: "MP attendance",
    description: "Share of sittings attended this term",
    source: "PRS India MP Track",
    format: "pct",
    ramp: RAMP_SEQUENTIAL,
    invert: true,
    absentNote: "Ministers and the Speaker do not sign the attendance register, so their seats carry no value here.",
  },
  {
    id: "mplads_utilization",
    label: "MPLADS spent",
    description: "Share of the MP's local area development allocation actually spent",
    source: "eSAKSHI (MoSPI)",
    format: "pct",
    ramp: RAMP_SEQUENTIAL,
    invert: true,
  },
]

export function getIndiaLayer(id: string | null | undefined): IndiaLayerMeta | null {
  if (!id) return null
  return INDIA_LAYERS.find(l => l.id === id) ?? null
}

/** Ramp as the map should read it, honouring `invert`. */
export function rampFor(layer: IndiaLayerMeta): readonly string[] {
  return layer.invert ? [...layer.ramp].reverse() : layer.ramp
}
