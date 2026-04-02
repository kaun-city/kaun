"use client"

import { useState, useEffect } from "react"
import type { ContractorProfile } from "@/lib/types"
import { fetchFlaggedContractors, fetchTopContractors } from "@/lib/api"

/**
 * CityPulse — city-wide accountability dashboard shown on the homepage
 * BEFORE any pin is dropped. This is the "front page" of Bengaluru's
 * civic health, visible without any interaction.
 *
 * Design principle: every card is a fact that makes you want to
 * drop a pin and check your ward.
 */

// City-wide facts sourced from verified reporting (Deccan Herald, ADR, OpenCity, CPCB, TNM)
// These are static editorial facts — updated periodically, not from live API
const CITY_FACTS = [
  {
    severity: "red" as const,
    category: "PUBLIC MONEY",
    headline: "Rs 934 Cr ghost worker scam",
    detail: "6,600 fake pourakarmika profiles used to siphon BBMP sanitation funds over 10 years. Exposed by Joint Commissioner Sarfaraz Khan.",
    source: "The News Minute",
  },
  {
    severity: "red" as const,
    category: "ROAD SAFETY",
    headline: "20 pothole deaths in 2023 — worst in India",
    detail: "Highest among 18 metro cities, 4th consecutive year. Zero families compensated despite BBMP's Rs 3L promise.",
    source: "Deccan Herald",
  },
  {
    severity: "red" as const,
    category: "ELECTED REPS",
    headline: "55% of MLAs face criminal charges",
    detail: "122 of 224 winning MLAs declared criminal cases. Average MLA assets: Rs 64 crore — highest in India.",
    source: "ADR / MyNeta",
  },
  {
    severity: "yellow" as const,
    category: "ENVIRONMENT",
    headline: "172 of 187 lakes fail water quality",
    detail: "550 MLD untreated sewage enters water bodies daily. 235 acres of lake land encroached — 131 acres by government agencies.",
    source: "CPCB / KSPCB",
  },
  {
    severity: "yellow" as const,
    category: "BUDGET",
    headline: "Rs 2,154 Cr unspent in 2024-25",
    detail: "Education: only 43.7% of budget spent. Social Welfare: 66.8%. No elected council since BBMP dissolution — zero accountability.",
    source: "OpenCity / BBMP",
  },
  {
    severity: "red" as const,
    category: "PEDESTRIANS",
    headline: "292 pedestrian deaths — highest in India",
    detail: "Bengaluru recorded the most pedestrian fatalities among 53 Indian cities in 2023. 915 total road deaths (19.5% rise).",
    source: "NCRB / TNM",
  },
]

interface CityStats {
  flaggedContractors: ContractorProfile[]
  topContractors: ContractorProfile[]
  loading: boolean
}

export function CityPulse() {
  const [stats, setStats] = useState<CityStats>({ flaggedContractors: [], topContractors: [], loading: true })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchFlaggedContractors().catch(() => []),
      fetchTopContractors(5).catch(() => []),
    ]).then(([flagged, top]) => {
      setStats({ flaggedContractors: flagged, topContractors: top, loading: false })
    })
  }, [])

  if (dismissed) return null

  const hasFlagged = stats.flaggedContractors.length > 0
  const totalFlaggedValue = stats.flaggedContractors.reduce((sum, c) => sum + c.total_value_lakh, 0)

  return (
    <div className="absolute inset-x-0 bottom-0 z-[900] pointer-events-auto
      md:inset-auto md:left-4 md:top-14 md:bottom-auto md:max-w-[360px]">

      {/* Mobile: bottom sheet style. Desktop: left sidebar overlay */}
      <div className="bg-[#0A0A0A]/95 backdrop-blur-xl border-t border-white/10
        md:border md:rounded-2xl md:border-white/10
        max-h-[70vh] md:max-h-[80vh] overflow-y-auto overscroll-contain
        shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-xl z-10 px-5 pt-4 pb-2 flex items-center justify-between border-b border-white/5">
          <div>
            <p className="text-white font-bold text-sm tracking-tight">
              Bengaluru Civic Pulse
            </p>
            <p className="text-white/30 text-[10px] mt-0.5">
              243 wards · What you should know
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-white/30 hover:text-white/60 text-xs px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            Dismiss
          </button>
        </div>

        <div className="px-5 py-3 space-y-3">

          {/* Contractor alert — live from DB if available */}
          {hasFlagged && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
              <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Contractor Alert</p>
              <p className="text-white text-sm font-semibold mt-1">
                Rs {totalFlaggedValue >= 100 ? `${(totalFlaggedValue / 100).toFixed(0)} Cr` : `${totalFlaggedValue.toFixed(0)} L`} to flagged contractors
              </p>
              <p className="text-white/40 text-[10px] mt-1">
                {stats.flaggedContractors.length} contractor{stats.flaggedContractors.length > 1 ? "s" : ""} on
                debarment lists still winning BBMP contracts
              </p>
              <div className="mt-2 space-y-1">
                {stats.flaggedContractors.slice(0, 3).map(c => (
                  <div key={c.entity_id} className="flex items-center justify-between gap-2">
                    <p className="text-red-300 text-[10px] truncate">{c.canonical_name}</p>
                    <p className="text-white/25 text-[10px] shrink-0">{c.ward_count} wards</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Static editorial facts — the city story */}
          {CITY_FACTS.map((fact, i) => (
            <div
              key={i}
              className={`rounded-xl px-4 py-3 ${
                fact.severity === "red"
                  ? "bg-red-500/5 border border-red-500/10"
                  : "bg-yellow-500/5 border border-yellow-500/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  fact.severity === "red" ? "text-red-400/70" : "text-yellow-400/70"
                }`}>
                  {fact.category}
                </span>
              </div>
              <p className="text-white text-sm font-semibold mt-1 leading-snug">{fact.headline}</p>
              <p className="text-white/40 text-[10px] mt-1 leading-relaxed">{fact.detail}</p>
              <p className="text-white/20 text-[10px] mt-1">{fact.source}</p>
            </div>
          ))}

          {/* Top contractors — if no flagged data, show top spenders */}
          {!hasFlagged && stats.topContractors.length > 0 && (
            <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
              <p className="text-[#FF9933] text-[10px] font-bold uppercase tracking-wider">Top Contractors</p>
              <div className="mt-2 space-y-1.5">
                {stats.topContractors.slice(0, 5).map(c => (
                  <div key={c.entity_id} className="flex items-center justify-between gap-2">
                    <p className="text-white/60 text-[10px] truncate">{c.canonical_name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-white/20 text-[10px]">{c.ward_count}w</span>
                      <span className="text-[#FF9933] text-[10px] font-semibold">
                        Rs {c.total_value_lakh >= 100 ? `${(c.total_value_lakh / 100).toFixed(0)} Cr` : `${c.total_value_lakh.toFixed(0)} L`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="text-center py-2">
            <p className="text-[#FF9933] text-xs font-medium">
              Drop a pin to check your ward
            </p>
            <p className="text-white/20 text-[10px] mt-0.5">
              Tap anywhere on the map
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
