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
 * Visakhapatnam (transparency): leads with what AP has built — UPYOG
 * adoption, RTGS, GSWS reach, scheme delivery. Green severity for
 * positive facts, yellow for cautionary, red reserved for genuinely
 * bad incidents.
 */

const BENGALURU_FALLBACK: FallbackFact[] = [
  { severity: "red",    category: "PUBLIC MONEY",   headline: "Rs 934 Cr siphoned via 6,600 ghost sanitation workers over 10 years", source: "The News Minute", url: null },
  { severity: "red",    category: "ROAD SAFETY",    headline: "20 pothole deaths in 2023 — worst among 18 metro cities. Zero compensated.", source: "Deccan Herald", url: null },
  { severity: "red",    category: "ELECTED REPS",   headline: "55% of Karnataka MLAs face criminal charges. Avg assets: Rs 64 Cr.", source: "ADR / MyNeta", url: null },
  { severity: "yellow", category: "ENVIRONMENT",    headline: "172 of 187 Bengaluru lakes fail water quality. 550 MLD untreated sewage daily.", source: "CPCB", url: null },
  { severity: "yellow", category: "BUDGET",         headline: "Rs 2,154 Cr unspent in 2024-25. Education: only 43.7% spent.", source: "OpenCity / BBMP", url: null },
  { severity: "red",    category: "PEDESTRIANS",    headline: "292 pedestrian deaths in 2023 — highest among 53 Indian cities.", source: "NCRB", url: null },
]

const VISAKHAPATNAM_FALLBACK: FallbackFact[] = [
  { severity: "green",  category: "OPEN DATA",         headline: "AP runs all 123 ULBs on UPYOG — service request data is publicly visible per ward.", source: "CDMA Open Portal", url: "https://apcdmaopenportal.emunicipal.ap.gov.in/" },
  { severity: "green",  category: "REAL-TIME GOVERNANCE", headline: "RTGS aggregates 193 services across 45 departments — first dashboard of its kind in India.", source: "core.ap.gov.in", url: "https://www.core.ap.gov.in/cmdashboard/Index.aspx" },
  { severity: "green",  category: "WARD SECRETARIATS", headline: "15,000+ Grama-Ward Sachivalayams deliver 500+ services at the household level.", source: "GSWS", url: "https://gramawardsachivalayam.ap.gov.in/" },
  { severity: "green",  category: "PROCUREMENT",       headline: "AP e-Procurement publishes awarded contract data without login — Rs 6.18 lakh crore processed since 2015.", source: "tender.apeprocurement.gov.in", url: "https://tender.apeprocurement.gov.in/" },
  { severity: "yellow", category: "AIR QUALITY",       headline: "Vizag CAAQMS stations report PM2.5 above WHO guidelines on most days. Industrial cluster + port traffic the main drivers.", source: "CPCB / APPCB", url: "https://airquality.cpcb.gov.in/AQI_India/" },
  { severity: "yellow", category: "CYCLONE PREP",      headline: "Vizag is among India's most cyclone-prone cities. APSDMA GIS dashboard tracks storms in real time.", source: "APSDMA", url: "https://apsdmagis.ap.gov.in/" },
  { severity: "green",  category: "REGISTRATIONS",     headline: "AP property registrations up 27% YoY — Rs 9,331 Cr revenue in FY25-26.", source: "IGRS AP", url: "https://registration.ap.gov.in/" },
]

export function getFallbackFacts(cityId: string, tone?: CityTone): FallbackFact[] {
  if (cityId === "visakhapatnam") return VISAKHAPATNAM_FALLBACK
  if (tone === "transparency") return VISAKHAPATNAM_FALLBACK // safe default for new transparency cities
  return BENGALURU_FALLBACK
}
