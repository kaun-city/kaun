"use client"

import dynamic from "next/dynamic"
import { useCallback, useState, useRef } from "react"
import type { PinResult } from "@/lib/types"
import { pinLookup } from "@/lib/api"
import WardCard from "@/components/WardCard"

// Leaflet requires window  must be loaded client-side only
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })

export default function HomePage() {
  const [pinResult, setPinResult]   = useState<PinResult | null>(null)
  const [pinLoading, setPinLoading] = useState(false)
  const [showCard, setShowCard]     = useState(false)
  const [geoDenied, setGeoDenied]   = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const mapViewRef = useRef<{ panTo: (lat: number, lng: number) => void } | null>(null)

  const handlePin = useCallback((result: PinResult | null, lat: number, lng: number) => {
    if (result === null && !pinLoading) {
      setPinLoading(true)
      setShowCard(true)
    } else {
      setPinResult(result ? { ...result, lat, lng } : null)
      setPinLoading(false)
    }
  }, [pinLoading])

  const handleClose = useCallback(() => {
    setShowCard(false)
    setPinResult(null)
    setPinLoading(false)
  }, [])

  const handleFindMyWard = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoDenied(true)
      return
    }
    setGeoLoading(true)

    // Safety net: if no callback fires in 12s, treat as denied
    const bail = setTimeout(() => {
      setGeoLoading(false)
      setGeoDenied(true)
    }, 12000)

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        clearTimeout(bail)
        const { latitude: lat, longitude: lng } = coords
        mapViewRef.current?.panTo(lat, lng)
        setPinLoading(true)
        setShowCard(true)
        setGeoLoading(false)
        const result = await pinLookup(lat, lng)
        setPinResult(result ? { ...result, lat, lng } : null)
        setPinLoading(false)
      },
      () => {
        clearTimeout(bail)
        setGeoLoading(false)
        setGeoDenied(true)
      },
      { timeout: 10000, maximumAge: 0 }
    )
  }, [])

  return (
    <main className="flex h-screen bg-[#0A0A0A] overflow-hidden">

      {/* Map  shrinks to make room for sidebar on desktop */}
      <div className={`relative flex-1 min-w-0 h-full transition-all duration-300`}>

        {/* Wordmark */}
        <div className="absolute top-4 left-4 z-[900] select-none pointer-events-none">
          <span className="text-white font-bold text-xl tracking-tight">
            KAUN<span className="text-[#FF9933]">?</span>
          </span>
        </div>

        {/* Onboarding CTA  hides once user has pinned */}
        {!showCard && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[900] flex flex-col items-center gap-3">

            {geoDenied ? (
              /* After denial: replace button with clear tap instruction */
              <div className="flex flex-col items-center gap-2">
                <div className="
                  px-5 py-3 rounded-full
                  bg-black/70 backdrop-blur-sm border border-white/20
                  text-white/70 text-sm font-medium tracking-wide
                  whitespace-nowrap
                ">
                  Tap anywhere on the map
                </div>
                <p className="text-white/30 text-xs">to find your ward</p>
              </div>
            ) : (
              /* Default: Find My Ward button */
              <>
                <button
                  onClick={handleFindMyWard}
                  disabled={geoLoading}
                  className="
                    flex items-center gap-2 px-5 py-3 rounded-full
                    bg-[#FF9933] hover:bg-[#FF9933]/90 active:scale-95
                    text-black font-semibold text-sm tracking-wide
                    shadow-lg shadow-[#FF9933]/20
                    transition-all duration-150 disabled:opacity-60
                  "
                >
                  {geoLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Locating...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="3" fill="black"/>
                        <circle cx="8" cy="8" r="6.5" stroke="black" strokeWidth="1.5"/>
                        <line x1="8" y1="0" x2="8" y2="3" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="8" y1="13" x2="8" y2="16" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="0" y1="8" x2="3" y2="8" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="13" y1="8" x2="16" y2="8" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Find My Ward
                    </>
                  )}
                </button>
                <p className="text-white/30 text-xs">or tap anywhere on the map</p>
              </>
            )}
          </div>
        )}

        <MapView onPin={handlePin} panRef={mapViewRef} resizeKey={showCard ? 1 : 0} />
      </div>

      {/* Ward card
          Mobile:  fixed bottom sheet overlaying the map
          Desktop: flex sidebar to the right of the map */}
      {showCard && (
        <WardCard result={pinResult} loading={pinLoading} onClose={handleClose} />
      )}
    </main>
  )
}
