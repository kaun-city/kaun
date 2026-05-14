"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchCityPulseFacts } from "@/lib/api"
import { getFallbackFacts, type FallbackFact } from "@/lib/cities/fallback-facts"

/**
 * CityPulse — compact rotating ticker of city facts.
 * Sits below the wordmark, leaves room for map zoom controls on the right.
 * One fact at a time, auto-rotates every 5 seconds. Tap to expand.
 *
 * Tone-aware:
 *   - Bengaluru (accountability) → red/yellow scams + missing money
 *   - Visakhapatnam (transparency) → green/yellow open-data + scheme delivery
 *
 * Tone is read from the city config; fallbacks live in lib/cities/fallback-facts.
 */

interface PulseFact {
  severity: "red" | "yellow" | "green"
  category: string
  headline: string
  source: string
  url: string | null
}

interface Props {
  /** city_id from the active pin or the homepage default ('bengaluru' | 'visakhapatnam' | …) */
  cityId?: string
}

export function CityPulse({ cityId = "bengaluru" }: Props) {
  const initialFallback = getFallbackFacts(cityId) as FallbackFact[]
  const [facts, setFacts] = useState<PulseFact[]>(initialFallback as PulseFact[])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Reset facts when city changes (e.g., user pins in Vizag → tone flips)
  useEffect(() => {
    setFacts(getFallbackFacts(cityId) as PulseFact[])
    setIndex(0)
    setExpanded(false)
  }, [cityId])

  // Override fallback with live DB facts if available for this city
  useEffect(() => {
    fetchCityPulseFacts(cityId).then(dbFacts => {
      if (dbFacts && dbFacts.length > 0) {
        setFacts(dbFacts.map(f => ({
          severity: (f.severity === "red" ? "red"
                  : f.severity === "green" ? "green"
                  : "yellow") as "red" | "yellow" | "green",
          category: f.category,
          headline: f.headline,
          source: f.source_name,
          url: f.source_url ?? null,
        })))
      }
    }).catch(() => { /* fall back stays */ })
  }, [cityId])

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

  // Severity → background + accent classes
  const sev = (() => {
    switch (fact.severity) {
      case "red":
        return {
          bg: "bg-[#1a0505]/90 border-red-500/30",
          cat: "text-red-400/70",
          link: "text-red-400/80",
        }
      case "green":
        return {
          bg: "bg-[#051a0c]/90 border-emerald-500/30",
          cat: "text-emerald-400/80",
          link: "text-emerald-400/80",
        }
      default:
        return {
          bg: "bg-[#1a1505]/90 border-yellow-500/30",
          cat: "text-yellow-400/70",
          link: "text-yellow-400/80",
        }
    }
  })()

  return (
    <div className="absolute top-12 left-4 right-16 md:right-auto md:max-w-[380px] z-[900] pointer-events-auto">
      <div
        onClick={handleTap}
        role="button"
        tabIndex={0}
        className={`w-full text-left rounded-xl backdrop-blur-xl px-4 py-2.5 shadow-lg border transition-all duration-300 cursor-pointer ${sev.bg}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-bold uppercase tracking-wider ${sev.cat}`}>
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
            aria-label="Dismiss"
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
                className={`text-[10px] font-medium ${sev.link}`}
              >
                {isTwitter ? "View on X" : "Read source"} &rarr;
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
