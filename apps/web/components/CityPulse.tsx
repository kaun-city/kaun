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

/** Pulse headlines arrive from feeds with HTML entities still encoded. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
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

  // Severity carries the alarm through a small square marker and a dark,
  // paper-safe label colour; the strip itself stays neutral paper.
  const sev = {
    red: { mark: "bg-danger", cat: "text-danger", link: "text-danger decoration-danger/40" },
    green: { mark: "bg-success", cat: "text-success", link: "text-success decoration-success/40" },
    yellow: { mark: "bg-warning", cat: "text-warning", link: "text-warning decoration-warning/40" },
  }[fact.severity]
  const headline = decodeEntities(fact.headline)
  const source = decodeEntities(fact.source)

  return (
    <div className="absolute top-[4.25rem] sm:top-14 left-3.5 right-16 md:right-auto md:max-w-[420px] z-[900] pointer-events-auto">
      <div
        onClick={handleTap}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleTap()
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${fact.category}: ${headline}`}
        className="signal-ticker w-full text-left pl-3 pr-1 py-1.5 cursor-pointer bg-paper border-y border-ink/55 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className={`mt-[0.4rem] h-2 w-2 shrink-0 ${sev.mark}`} />
          <div className="flex-1 min-w-0 py-0.5">
            <p className={`text-[13px] leading-snug text-ink/85 ${expanded ? "" : "line-clamp-2 sm:line-clamp-1"}`}>
              <span className={`mr-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${sev.cat}`}>
                {fact.category}
              </span>
              {headline}
            </p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            className="w-11 h-11 -my-2 flex items-center justify-center text-ink/60 hover:bg-ink/5 hover:text-ink text-sm shrink-0"
            aria-label="Dismiss headlines"
          >
            &times;
          </button>
        </div>

        {/* Expanded: source link + next */}
        {expanded && (
          <div className="flex items-center justify-between gap-3 mt-1.5 mb-0.5 pt-1.5 pr-2 border-t border-ink/15">
            <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60">
              {source} · {(index % facts.length) + 1}/{facts.length}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {fact.url && (
                <a
                  href={fact.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className={`min-h-11 flex items-center text-xs font-medium underline underline-offset-2 ${sev.link}`}
                >
                  {isTwitter ? "View on X" : "Read source"} &rarr;
                </a>
              )}
              <button
                onClick={e => { e.stopPropagation(); handleNext() }}
                className="min-h-11 px-1 text-xs text-ink/60 hover:text-ink"
              >
                Next &rsaquo;
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
