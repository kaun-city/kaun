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
        className="flex min-h-9 items-center gap-1.5 border border-[#16130e]/55 px-3 py-1.5
          bg-[#F8F5EF] hover:bg-[#EFE9DE]
          text-[#16130e]/70 text-xs font-medium tracking-wide transition-colors"
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
          className="absolute left-0 top-full mt-2 min-w-[210px] py-1
            bg-[#F8F5EF]
            border border-[#16130e]/55 shadow-none"
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
                  ${isActive ? "bg-[#16130e] text-[#F8F5EF]" : "text-[#16130e]/70"}`}
              >
                <div>
                  <div className="text-xs font-medium">{city.name}</div>
                  <div className={`text-[10px] mt-0.5 ${isActive ? "text-[#F8F5EF]/55" : "text-[#16130e]/45"}`}>
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
          <div className="border-t border-[#16130e]/15 mt-1 pt-1">
            <a
              href="https://github.com/kaun-city/kaun/issues/new?template=city-request.yml&labels=city-request"
              target="_blank"
              rel="noopener noreferrer"
              className="block min-h-11 px-3 py-3 text-xs text-[#16130e]/55 hover:text-[#C25400]"
            >
              + Request another city
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
