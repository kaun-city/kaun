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
  url: string | null
}

// Hardcoded fallback — city-agnostic facts used when DB is empty or unreachable
const FALLBACK_FACTS: PulseFact[] = [
  { severity: "red",    category: "ELECTED REPS",   headline: "46% of Indian MPs have declared criminal charges against them.", source: "ADR / MyNeta 2024", url: null },
  { severity: "red",    category: "PUBLIC MONEY",   headline: "India loses an estimated Rs 1.76 lakh Cr annually to municipal corruption.", source: "Transparency International", url: null },
  { severity: "yellow", category: "ROAD SAFETY",    headline: "1.68 lakh road deaths in India in 2022 -- one every 3 minutes.", source: "MoRTH 2023", url: null },
  { severity: "yellow", category: "ENVIRONMENT",    headline: "Only 28% of India's urban sewage is treated before discharge.", source: "CPCB 2023", url: null },
  { severity: "red",    category: "CIVIC BUDGET",   headline: "Average Indian city spends less than Rs 1,000 per citizen per year on civic services.", source: "RBI Municipal Finance Report", url: null },
  { severity: "yellow", category: "ACCOUNTABILITY", headline: "Less than 5% of ward committee meetings are open to the public in most Indian cities.", source: "Janaagraha", url: null },
]

interface CityPulseProps {
  cityId?: string
}

export function CityPulse({ cityId = "bengaluru" }: CityPulseProps) {
  const [facts, setFacts] = useState<PulseFact[]>(FALLBACK_FACTS)
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Fetch from DB if available
  useEffect(() => {
    fetchCityPulseFacts(cityId).then(dbFacts => {
      if (dbFacts.length > 0) {
        setFacts(dbFacts.map(f => ({
          severity: (f.severity === "red" ? "red" : "yellow") as "red" | "yellow",
          category: f.category,
          headline: f.headline,
          source: f.source_name,
          url: f.source_url ?? null,
        })))
      }
    }).catch(() => {})
  }, [])

  // Auto-rotate every 5s (pause when expanded)
  useEffect(() => {
    if (expanded) return
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % facts.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [facts.length, expanded])

  const handleTap = useCallback(() => {
    setExpanded(e => !e)
  }, [])

  const handleNext = useCallback(() => {
    setExpanded(false)
    setIndex(i => (i + 1) % facts.length)
  }, [facts.length])

  if (dismissed) return null

  const fact = facts[index % facts.length]
  if (!fact) return null

  const isTwitter = fact.source.startsWith("X/") || fact.url?.includes("x.com")

  return (
    <div className="absolute top-12 left-4 right-16 md:right-auto md:max-w-[380px] z-[900] pointer-events-auto">
      <div
        onClick={handleTap}
        role="button"
        tabIndex={0}
        className={`w-full text-left rounded-xl backdrop-blur-xl px-4 py-2.5 shadow-lg border transition-all duration-300 cursor-pointer ${
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
            <p className={`text-white/80 text-xs leading-snug mt-0.5 ${expanded ? "" : "line-clamp-2"}`}>
              {fact.headline}
            </p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            className="text-white/20 hover:text-white/50 text-xs mt-0.5 shrink-0"
          >
            &times;
          </button>
        </div>

        {/* Expanded: source link + next */}
        {expanded && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
            {fact.url ? (
              <a
                href={fact.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={`text-[10px] font-medium ${
                  fact.severity === "red" ? "text-red-400/80" : "text-yellow-400/80"
                }`}
              >
                {isTwitter ? "View on X" : "Read article"} &rarr;
              </a>
            ) : (
              <span />
            )}
            <button
              onClick={e => { e.stopPropagation(); handleNext() }}
              className="text-white/30 hover:text-white/60 text-[10px]"
            >
              Next &rsaquo;
            </button>
          </div>
        )}

        {/* Progress dots */}
        {!expanded && (
          <div className="flex items-center justify-center gap-1 mt-2">
            {facts.slice(0, 20).map((_, i) => (
              <div
                key={i}
                className={`h-0.5 rounded-full transition-all duration-300 ${
                  i === index % facts.length ? "w-3 bg-white/40" : "w-1.5 bg-white/10"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
