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
  const [geoError, setGeoError]     = useState<string | null>(null)
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
      setGeoError("Location not supported on this device")
      return
    }
    setGeoLoading(true)
    setGeoError(null)

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords
        mapViewRef.current?.panTo(lat, lng)
        setPinLoading(true)
        setShowCard(true)
        setGeoLoading(false)
        const result = await pinLookup(lat, lng)
        setPinResult(result ? { ...result, lat, lng } : null)
        setPinLoading(false)
      },
      (err) => {
        setGeoLoading(false)
        if (err.code === 1) {
          setGeoError("Location access denied — tap the map instead")
        } else {
          setGeoError("Could not get location — tap the map instead")
        }
      },
      { timeout: 10000, maximumAge: 60000 }
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
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[900] flex flex-col items-center gap-3">

            {/* Primary: Find My Ward */}
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

            {/* Error or secondary hint */}
            {geoError ? (
              <p className="text-red-400/80 text-xs text-center px-4">{geoError}</p>
            ) : (
              <p className="text-white/30 text-xs">or tap anywhere on the map</p>
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
