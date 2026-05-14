"use client"

import { useEffect, useRef, useState } from "react"
import { allCities, type CityConfig } from "@/lib/cities"

interface Props {
  /** The currently active city. Determines which row is checked. */
  activeCityId: string
}

/**
 * CitySwitcher — small dropdown in the top-left below the wordmark.
 * Lets a visitor jump between cities (Bengaluru, Visakhapatnam, …).
 *
 * Switching navigates to /?city=<id> rather than re-instantiating the
 * Leaflet map. Full page load is fine — it's rare and clean.
 */
export function CitySwitcher({ activeCityId }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const cities = allCities()
  const active = cities.find(c => c.id === activeCityId) ?? cities[0]

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  // Don't render if there's only one city — no point in a switcher
  if (cities.length < 2) return null

  function navigate(city: CityConfig) {
    if (city.id === activeCityId) {
      setOpen(false)
      return
    }
    if (typeof window !== "undefined") {
      window.location.href = city.id === "bengaluru" ? "/" : `/?city=${city.id}`
    }
  }

  return (
    <div ref={wrapRef} className="relative shrink-0 pointer-events-auto">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
          bg-black/60 hover:bg-black/80 backdrop-blur-md
          border border-white/15 hover:border-white/25
          text-white/80 text-xs font-medium tracking-wide
          shadow-lg transition-all"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 14s5-4 5-8a5 5 0 1 0-10 0c0 4 5 8 5 8z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="8" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
        <span>{active.name}</span>
        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch city"
          className="absolute left-0 top-full mt-2 min-w-[200px] py-1
            bg-[#0A0A0A]/95 backdrop-blur-md
            border border-white/10 rounded-lg shadow-2xl"
        >
          {cities.map(city => {
            const isActive = city.id === activeCityId
            return (
              <button
                key={city.id}
                role="option"
                aria-selected={isActive}
                onClick={() => navigate(city)}
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2
                  hover:bg-white/5 transition-colors
                  ${isActive ? "text-[#FF9933]" : "text-white/70"}`}
              >
                <div>
                  <div className="text-xs font-medium">{city.name}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">
                    {city.state} &middot; {city.wardCount ?? "?"} wards
                  </div>
                </div>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            )
          })}
          <div className="border-t border-white/5 mt-1 pt-1">
            <a
              href="https://github.com/kaun-city/kaun/issues/new?template=city-request.yml&labels=city-request"
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 text-[10px] text-white/40 hover:text-white/60"
            >
              + Request another city
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
