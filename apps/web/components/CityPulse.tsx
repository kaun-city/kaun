"use client"

import { useState, useEffect, useCallback } from "react"
import type { ContractorProfile } from "@/lib/types"
import { fetchFlaggedContractors } from "@/lib/api"

/**
 * CityPulse — compact rotating ticker of city-wide accountability facts.
 * Sits below the wordmark, never blocks the map or "Find my ward" button.
 * One fact at a time, auto-rotates every 5 seconds. Tap to cycle.
 */

// Verified editorial facts — update quarterly or fetch from city_pulse_facts table
const CITY_FACTS: { severity: "red" | "yellow"; category: string; headline: string; source: string }[] = [
  { severity: "red",    category: "PUBLIC MONEY",   headline: "Rs 934 Cr siphoned via 6,600 ghost sanitation workers over 10 years", source: "The News Minute" },
  { severity: "red",    category: "ROAD SAFETY",    headline: "20 pothole deaths in 2023 — worst among 18 metro cities. Zero compensated.", source: "Deccan Herald" },
  { severity: "red",    category: "ELECTED REPS",   headline: "55% of Karnataka MLAs face criminal charges. Avg assets: Rs 64 Cr.", source: "ADR / MyNeta" },
  { severity: "yellow", category: "ENVIRONMENT",    headline: "172 of 187 Bengaluru lakes fail water quality. 550 MLD untreated sewage daily.", source: "CPCB" },
  { severity: "yellow", category: "BUDGET",         headline: "Rs 2,154 Cr unspent in 2024-25. Education: only 43.7% spent.", source: "OpenCity / BBMP" },
  { severity: "red",    category: "PEDESTRIANS",    headline: "292 pedestrian deaths in 2023 — highest among 53 Indian cities.", source: "NCRB" },
]

export function CityPulse() {
  const [index, setIndex] = useState(0)
  const [flaggedLine, setFlaggedLine] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Fetch live contractor alert
  useEffect(() => {
    fetchFlaggedContractors().then(flagged => {
      if (flagged.length > 0) {
        const total = flagged.reduce((s, c) => s + c.total_value_lakh, 0)
        const amt = total >= 100 ? `Rs ${(total / 100).toFixed(0)} Cr` : `Rs ${total.toFixed(0)} L`
        setFlaggedLine(`${amt} in public contracts to ${flagged.length} debarment-flagged contractor${flagged.length > 1 ? "s" : ""}`)
      }
    }).catch(() => {})
  }, [])

  // Build full fact list (contractor alert first if exists, then editorial)
  const allFacts = [
    ...(flaggedLine ? [{ severity: "red" as const, category: "CONTRACTORS", headline: flaggedLine, source: "kaun.city" }] : []),
    ...CITY_FACTS,
  ]

  // Auto-rotate every 5s
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % allFacts.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [allFacts.length])

  const handleTap = useCallback(() => {
    setIndex(i => (i + 1) % allFacts.length)
  }, [allFacts.length])

  if (dismissed) return null

  const fact = allFacts[index % allFacts.length]
  if (!fact) return null

  return (
    <div className="absolute top-12 inset-x-4 md:inset-x-auto md:left-4 md:right-auto md:max-w-[380px] z-[900] pointer-events-auto">
      <button
        onClick={handleTap}
        className={`w-full text-left rounded-xl backdrop-blur-md px-4 py-2.5 shadow-lg border transition-all duration-300 ${
          fact.severity === "red"
            ? "bg-red-500/8 border-red-500/15"
            : "bg-yellow-500/8 border-yellow-500/15"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-bold uppercase tracking-wider ${
                fact.severity === "red" ? "text-red-400/70" : "text-yellow-400/70"
              }`}>
                {fact.category}
              </span>
              <span className="text-white/15 text-[9px]">{fact.source}</span>
            </div>
            <p className="text-white/80 text-xs leading-snug mt-0.5 line-clamp-2">{fact.headline}</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            className="text-white/20 hover:text-white/50 text-xs mt-0.5 shrink-0"
          >
            &times;
          </button>
        </div>
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1 mt-2">
          {allFacts.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 rounded-full transition-all duration-300 ${
                i === index % allFacts.length ? "w-3 bg-white/40" : "w-1.5 bg-white/10"
              }`}
            />
          ))}
        </div>
      </button>
    </div>
  )
}
