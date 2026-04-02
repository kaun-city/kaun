"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchCityPulseFacts } from "@/lib/api"

/**
 * CityPulse — compact rotating ticker of city-wide accountability facts.
 * Sits below the wordmark, leaves room for map zoom controls on the right.
 * One fact at a time, auto-rotates every 5 seconds. Tap to cycle.
 */

interface PulseFact {
  severity: "red" | "yellow"
  category: string
  headline: string
  source: string
}

// Hardcoded fallback — used when DB is empty or unreachable
const FALLBACK_FACTS: PulseFact[] = [
  { severity: "red",    category: "PUBLIC MONEY",   headline: "Rs 934 Cr siphoned via 6,600 ghost sanitation workers over 10 years", source: "The News Minute" },
  { severity: "red",    category: "ROAD SAFETY",    headline: "20 pothole deaths in 2023 — worst among 18 metro cities. Zero compensated.", source: "Deccan Herald" },
  { severity: "red",    category: "ELECTED REPS",   headline: "55% of Karnataka MLAs face criminal charges. Avg assets: Rs 64 Cr.", source: "ADR / MyNeta" },
  { severity: "yellow", category: "ENVIRONMENT",    headline: "172 of 187 Bengaluru lakes fail water quality. 550 MLD untreated sewage daily.", source: "CPCB" },
  { severity: "yellow", category: "BUDGET",         headline: "Rs 2,154 Cr unspent in 2024-25. Education: only 43.7% spent.", source: "OpenCity / BBMP" },
  { severity: "red",    category: "PEDESTRIANS",    headline: "292 pedestrian deaths in 2023 — highest among 53 Indian cities.", source: "NCRB" },
]

export function CityPulse() {
  const [facts, setFacts] = useState<PulseFact[]>(FALLBACK_FACTS)
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  // Fetch from DB if available
  useEffect(() => {
    fetchCityPulseFacts().then(dbFacts => {
      if (dbFacts.length > 0) {
        setFacts(dbFacts.map(f => ({
          severity: (f.severity === "red" ? "red" : "yellow") as "red" | "yellow",
          category: f.category,
          headline: f.headline,
          source: f.source_name,
        })))
      }
    }).catch(() => {})
  }, [])

  // Auto-rotate every 5s
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % facts.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [facts.length])

  const handleTap = useCallback(() => {
    setIndex(i => (i + 1) % facts.length)
  }, [facts.length])

  if (dismissed) return null

  const fact = facts[index % facts.length]
  if (!fact) return null

  return (
    <div className="absolute top-12 left-4 right-16 md:right-auto md:max-w-[380px] z-[900] pointer-events-auto">
      <button
        onClick={handleTap}
        className={`w-full text-left rounded-xl backdrop-blur-xl px-4 py-2.5 shadow-lg border transition-all duration-300 ${
          fact.severity === "red"
            ? "bg-[#1a0505]/90 border-red-500/30"
            : "bg-[#1a1505]/90 border-yellow-500/30"
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
          {facts.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 rounded-full transition-all duration-300 ${
                i === index % facts.length ? "w-3 bg-white/40" : "w-1.5 bg-white/10"
              }`}
            />
          ))}
        </div>
      </button>
    </div>
  )
}
