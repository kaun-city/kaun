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

  const handlePin = useCallback((result: PinResult | null, _lat: number, _lng: number) => {
    if (result === null && !pinLoading) {
      // First call  loading state
      setPinLoading(true)
      setShowCard(true)
    } else {
      // Second call  data arrived
      setPinResult(result)
      setPinLoading(false)
    }
  }, [pinLoading])

  const handleClose = useCallback(() => {
    setShowCard(false)
    setPinResult(null)
    setPinLoading(false)
  }, [])

  return (
    <main className="relative w-screen h-screen bg-[#0A0A0A] overflow-hidden">

      {/* Wordmark */}
      <div className="absolute top-4 left-4 z-[1000] select-none">
        <span className="text-white font-bold text-xl tracking-tight">
          KAUN<span className="text-[#FF9933]">?</span>
        </span>
      </div>

      {/* Hint  hides once user has pinned */}
      {!showCard && (
        <div className="
          absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]
          px-4 py-2 rounded-full
          bg-black/70 backdrop-blur-sm border border-white/10
          text-white/50 text-xs tracking-wide pointer-events-none
        ">
          Tap anywhere to find out who&apos;s responsible
        </div>
      )}

      {/* Map */}
      <MapView onPin={handlePin} />

      {/* Ward card */}
      {showCard && (
        <WardCard result={pinResult} loading={pinLoading} onClose={handleClose} />
      )}
    </main>
  )
}
