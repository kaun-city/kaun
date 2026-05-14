import type { CityTone } from "./types"

export interface FallbackFact {
  severity: "red" | "yellow" | "green"
  category: string
  headline: string
  source: string
  url: string | null
}

/**
 * Hardcoded fallback facts shown when the city_pulse_facts table has no
 * fresh entries for a city. Every city tone has a different starter set.
 *
 * Bengaluru (accountability): leads with documented scams, missing money,
 * elected-rep failures. Red/yellow severity, source attribution to
 * Deccan Herald / TNM / ADR / NCRB.
 *
 * Transparency-tone cities will get their own fallback arrays when their
 * per-city branches land.
 */

const BENGALURU_FALLBACK: FallbackFact[] = [
  { severity: "red",    category: "PUBLIC MONEY",   headline: "Rs 934 Cr siphoned via 6,600 ghost sanitation workers over 10 years", source: "The News Minute", url: null },
  { severity: "red",    category: "ROAD SAFETY",    headline: "20 pothole deaths in 2023 — worst among 18 metro cities. Zero compensated.", source: "Deccan Herald", url: null },
  { severity: "red",    category: "ELECTED REPS",   headline: "55% of Karnataka MLAs face criminal charges. Avg assets: Rs 64 Cr.", source: "ADR / MyNeta", url: null },
  { severity: "yellow", category: "ENVIRONMENT",    headline: "172 of 187 Bengaluru lakes fail water quality. 550 MLD untreated sewage daily.", source: "CPCB", url: null },
  { severity: "yellow", category: "BUDGET",         headline: "Rs 2,154 Cr unspent in 2024-25. Education: only 43.7% spent.", source: "OpenCity / BBMP", url: null },
  { severity: "red",    category: "PEDESTRIANS",    headline: "292 pedestrian deaths in 2023 — highest among 53 Indian cities.", source: "NCRB", url: null },
]

export function getFallbackFacts(cityId: string, tone?: CityTone): FallbackFact[] {
  if (cityId === "bengaluru") return BENGALURU_FALLBACK
  // Transparency-tone cities will get their own fallback arrays in per-city
  // branches. Until then, fall back to Bengaluru's accountability facts.
  if (tone === "transparency") return BENGALURU_FALLBACK
  return BENGALURU_FALLBACK
}
