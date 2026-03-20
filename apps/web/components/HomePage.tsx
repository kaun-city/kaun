"use client"

import dynamic from "next/dynamic"
import { useCallback, useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import type { PinResult } from "@/lib/types"
import { pinLookup } from "@/lib/api"
import WardCard from "@/components/WardCard"
import ReportSheet from "@/components/shared/ReportSheet"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })

const CITY_REQUEST_URL =
  "https://github.com/kaun-city/kaun/issues/new?template=city-request.yml&labels=city-request"

function OutOfBoundsCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="
      fixed inset-x-0 bottom-0 z-[1000]
      md:fixed md:inset-auto md:right-4 md:top-1/2 md:-translate-y-1/2
      md:w-[400px]
    ">
      <div className="
        bg-[#111] border border-white/10 rounded-t-2xl md:rounded-2xl
        p-6 flex flex-col gap-4
      ">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white font-semibold text-base">Not in Bengaluru?</p>
            <p className="text-white/50 text-sm mt-1">
              Kaun only covers Bengaluru right now.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 text-xl leading-none w-8 h-8 flex items-center justify-center"
          >
            x
          </button>
        </div>

        <p className="text-white/60 text-sm leading-relaxed">
          We want to expand to every Indian city. If you want Kaun in your city,
          open a request on GitHub -- others can vote on it and it helps us
          prioritise where to go next.
        </p>

        <a
          href={CITY_REQUEST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="
            flex items-center justify-center gap-2
            px-4 py-3 rounded-xl
            bg-[#2dd4bf] hover:bg-[#2dd4bf]/90 active:scale-95
            text-black font-semibold text-sm
            transition-all duration-150
          "
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
              .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
              -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
              .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
              .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
              0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              fill="black"
            />
          </svg>
          Request my city on GitHub
        </a>

        <p className="text-white/30 text-xs text-center">
          Already requested? Drop a thumbs up on the existing issue.
        </p>
      </div>
    </div>
  )
}

export default function HomePage() {
  const searchParams = useSearchParams()
  const [pinResult, setPinResult]     = useState<PinResult | null>(null)
  const [pinLoading, setPinLoading]   = useState(false)
  const [showCard, setShowCard]       = useState(false)
  const [outOfBounds, setOutOfBounds] = useState(false)
  const [geoDenied, setGeoDenied]     = useState(false)
  const [geoLoading, setGeoLoading]   = useState(false)
  const [showReport, setShowReport]     = useState(false)
  const [reportPickMode, setReportPickMode] = useState(false)
  const [reportLat, setReportLat]       = useState<number | null>(null)
  const [reportLng, setReportLng]       = useState<number | null>(null)
  const [reportRefresh, setReportRefresh] = useState(0)
  const mapViewRef = useRef<{ panTo: (lat: number, lng: number) => void } | null>(null)
  const deepLinkHandled = useRef(false)

  // Handle ?ward=X or ?report=X deep links
  useEffect(() => {
    if (deepLinkHandled.current) return
    deepLinkHandled.current = true

    const wardParam   = searchParams.get("ward")
    const reportParam = searchParams.get("report")

    if (reportParam) {
      // Fetch report location and pan to it
      const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      fetch(
        `${SUPABASE_URL}/rest/v1/ward_reports?id=eq.${reportParam}&status=eq.approved&select=lat,lng,ward_no,ward_name,issue_type,ai_label,ai_person&limit=1`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
      )
        .then(r => r.json())
        .then(async (rows) => {
          const report = Array.isArray(rows) ? rows[0] : null
          if (!report) return
          const { lat, lng } = report
          // Pan map to report location
          setTimeout(() => mapViewRef.current?.panTo(lat, lng), 500)
          // Also look up the ward
          setPinLoading(true)
          setShowCard(true)
          const result = await pinLookup(lat, lng)
          if (result) {
            setPinResult({ ...result, lat, lng })
            setPinLoading(false)
          } else {
            setPinLoading(false)
            setShowCard(false)
          }
        })
        .catch(() => {})
    } else if (wardParam) {
      // Direct ward deep link — fetch ward row and open card without reverse geocoding
      const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      fetch(
        `${SUPABASE_URL}/rest/v1/wards?ward_no=eq.${wardParam}&select=ward_no,ward_name,assembly_constituency,zone&limit=1`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
      )
        .then(r => r.json())
        .then((rows) => {
          const ward = Array.isArray(rows) ? rows[0] : null
          if (!ward) return
          setOutOfBounds(false)
          setShowCard(true)
          setPinResult({
            ward_no: ward.ward_no,
            ward_name: ward.ward_name,
            assembly_constituency: ward.assembly_constituency ?? "",
            zone: ward.zone ?? "",
            city_id: "bengaluru",
            found: true,
            lat: 12.9716,
            lng: 77.5946,
          } as PinResult)
        })
        .catch(() => {})
    }
  }, [searchParams])

  const handlePin = useCallback((result: PinResult | null, lat: number, lng: number) => {
    if (result === null && !pinLoading) {
      setPinLoading(true)
      setShowCard(true)
      setOutOfBounds(false)
    } else {
      if (!result) {
        setPinLoading(false)
        setShowCard(false)
        setOutOfBounds(true)
      } else {
        setPinResult({ ...result, lat, lng })
        setPinLoading(false)
        setOutOfBounds(false)
      }
    }
  }, [pinLoading])

  const handleClose = useCallback(() => {
    setShowCard(false)
    setPinResult(null)
    setPinLoading(false)
    setOutOfBounds(false)
  }, [])

  const handleFindMyWard = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoDenied(true)
      return
    }
    setGeoLoading(true)

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
        setOutOfBounds(false)
        setGeoLoading(false)
        const result = await pinLookup(lat, lng)
        if (!result) {
          setPinLoading(false)
          setShowCard(false)
          setOutOfBounds(true)
        } else {
          setPinResult({ ...result, lat, lng })
          setPinLoading(false)
        }
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

      <div className="relative flex-1 min-w-0 h-full transition-all duration-300">

        {/* Wordmark */}
        <div className="absolute top-4 left-4 z-[900] select-none pointer-events-none">
          <span className="text-white font-bold text-xl tracking-tight">
            KAUN<span className="text-[#2dd4bf]">?</span>
          </span>
        </div>

        {/* Onboarding CTA */}
        {!showCard && !outOfBounds && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[900]">
            {geoDenied ? (
              <p className="text-white/30 text-xs tracking-wide">Tap anywhere on the map</p>
            ) : (
              <button
                onClick={handleFindMyWard}
                disabled={geoLoading}
                className="
                  flex items-center gap-1.5 px-4 py-2 rounded-full
                  bg-[#2dd4bf]/15 hover:bg-[#2dd4bf]/25 active:scale-95
                  border border-[#2dd4bf]/40
                  text-[#2dd4bf] font-medium text-xs tracking-wide
                  backdrop-blur-sm
                  transition-all duration-150 disabled:opacity-50
                "
              >
                {geoLoading ? (
                  <>
                    <span className="w-3 h-3 border border-[#2dd4bf]/40 border-t-[#2dd4bf] rounded-full animate-spin" />
                    Locating...
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="3" fill="#2dd4bf"/>
                      <circle cx="8" cy="8" r="6.5" stroke="#2dd4bf" strokeWidth="1.5"/>
                      <line x1="8" y1="0" x2="8" y2="3" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="8" y1="13" x2="8" y2="16" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="0" y1="8" x2="3" y2="8" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="13" y1="8" x2="16" y2="8" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Find my ward
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Floating Report button — enters pick mode */}
        {!reportPickMode && (
          <button
            onClick={() => setReportPickMode(true)}
            className="
              absolute bottom-16 right-4 z-[900]
              flex items-center gap-2 px-4 py-2.5 rounded-full
              bg-[#111] border border-white/15 hover:border-white/30
              text-white/70 hover:text-white text-sm font-medium
              shadow-lg transition-all duration-150
            "
          >
            <span className="text-[#2dd4bf] text-base font-bold">+</span>
            Report
          </button>
        )}

        {/* Report pick mode banner */}
        {reportPickMode && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[900] flex items-center gap-3
            px-4 py-2.5 rounded-full bg-[#2dd4bf] text-black text-sm font-semibold shadow-xl whitespace-nowrap">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" fill="black"/>
              <circle cx="8" cy="8" r="6.5" stroke="black" strokeWidth="1.5"/>
              <line x1="8" y1="0" x2="8" y2="3" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="13" x2="8" y2="16" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="0" y1="8" x2="3" y2="8" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="13" y1="8" x2="16" y2="8" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Tap on the map where the issue is
            <button
              onClick={() => setReportPickMode(false)}
              className="ml-1 text-black/50 hover:text-black font-bold text-base leading-none"
            >x</button>
          </div>
        )}

        <MapView
          onPin={handlePin}
          panRef={mapViewRef}
          resizeKey={showCard ? 1 : 0}
          reportRefresh={reportRefresh}
          reportPickMode={reportPickMode}
          onReportPin={(lat, lng) => {
            setReportLat(lat)
            setReportLng(lng)
            setReportPickMode(false)
            setShowReport(true)
          }}
        />
      </div>

      {showCard && (
        <WardCard result={pinResult} loading={pinLoading} onClose={handleClose} />
      )}

      {outOfBounds && (
        <OutOfBoundsCard onClose={handleClose} />
      )}

      {showReport && reportLat !== null && reportLng !== null && (
        <ReportSheet
          lat={reportLat}
          lng={reportLng}
          wardNo={pinResult?.ward_no ?? undefined}
          wardName={pinResult?.ward_name ?? undefined}
          onClose={() => { setShowReport(false); setReportLat(null); setReportLng(null) }}
          onSubmitted={() => {
            setShowReport(false)
            setReportLat(null)
            setReportLng(null)
            setReportRefresh(r => r + 1)
          }}
        />
      )}
    </main>
  )
}
