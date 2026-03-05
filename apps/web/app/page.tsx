"use client"

import dynamic from "next/dynamic"
import { useCallback, useState } from "react"
import type { PinResult } from "@/lib/types"
import WardCard from "@/components/WardCard"

// Leaflet requires window  must be loaded client-side only
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })

export default function HomePage() {
  const [pinResult, setPinResult] = useState<PinResult | null>(null)
  const [pinLoading, setPinLoading] = useState(false)
  const [showCard, setShowCard] = useState(false)

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

        {/* Tap hint  hides once user has pinned */}
        {!showCard && (
          <div className="
            absolute bottom-6 left-1/2 -translate-x-1/2 z-[900]
            px-4 py-2 rounded-full
            bg-black/70 backdrop-blur-sm border border-white/10
            text-white/50 text-xs tracking-wide pointer-events-none
            whitespace-nowrap
          ">
            Tap anywhere to find out who&apos;s responsible
          </div>
        )}

        <MapView onPin={handlePin} resizeKey={showCard ? 1 : 0} />
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
