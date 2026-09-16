"use client"

import dynamic from "next/dynamic"
import { useCallback, useState, useRef, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import type { PinResult } from "@/lib/types"
import { fetchWardByNumber, pinLookup } from "@/lib/api"
import WardCard from "@/components/WardCard"
import { CityPulse } from "@/components/CityPulse"
import { CitySwitcher } from "@/components/CitySwitcher"
import { LayerControl } from "@/components/LayerControl"
import { WardFinder } from "@/components/WardFinder"
import ReportSheet from "@/components/shared/ReportSheet"
import { SurfaceSwitcher } from "@/components/shared/SurfaceSwitcher"
import { getCity } from "@/lib/cities"
import { getLayer } from "@/lib/map-layers"
import type { ChoroplethData } from "@/components/MapView"
import { currentWardMeta, currentWardPinResult, featureContains, type CurrentWardMeta } from "@/lib/current-ward"
import { GBA_CROSSWALK_URL, gbaWardKey, indexGbaCrosswalk, type GbaCrosswalkArtifact } from "@/lib/gba-crosswalk"
import { publicSupabaseConfig } from "@/lib/supabase-config"
import { CorporatorVacancy } from "@/components/CorporatorVacancy"

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
        bg-paper text-ink border-t-2 border-ink md:border md:border-ink/55
        p-6 flex flex-col gap-4
      ">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-ink font-semibold text-base">Not in Bengaluru?</p>
            <p className="text-ink/60 text-sm mt-1">
              Kaun only covers Bengaluru right now.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close city coverage message"
            className="text-ink/60 hover:text-ink hover:bg-ink/5 text-xl leading-none w-11 h-11 flex items-center justify-center"
          >
            x
          </button>
        </div>

        <p className="text-ink/75 text-sm leading-relaxed">
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
            min-h-11 px-4 py-3
            bg-ink hover:bg-ink/85 active:scale-95
            text-paper font-mono text-[11px] font-semibold uppercase tracking-[0.08em]
            transition-all duration-150
          "
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
              .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
              -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
              .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
              .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
              0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              fill="currentColor"
            />
          </svg>
          Request my city on GitHub
        </a>

        <p className="text-ink/60 text-xs text-center">
          Already requested? Drop a thumbs up on the existing issue.
        </p>
      </div>
    </div>
  )
}

interface WardOption {
  ward_no: number
  ward_name: string
  ward_name_kn?: string
  corporation?: string
  corporation_id?: number
  assembly_constituency?: string
  assembly_no?: number
  zone?: string
  zone_name?: string
  population?: number
  lat: number
  lng: number
}

/**
 * @param host  Request Host header, threaded down from app/page.tsx so the
 *              cross-surface links are correct on the city subdomain and in
 *              local dev. Empty is safe: links then resolve for kaun.city.
 */
export default function HomePage({ host = "" }: { host?: string }) {
  const searchParams = useSearchParams()
  // Active city — driven by ?city=X query param. Defaults to Bengaluru.
  // Pin drops in another city update this implicitly via pinResult.city_id.
  const cityParam = searchParams.get("city") ?? "bengaluru"
  const activeCity = getCity(cityParam)
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
  const [reportWard, setReportWard]     = useState<CurrentWardMeta | null>(null)
  const [reportRefresh, setReportRefresh] = useState(0)
  const [wardFinderOpen, setWardFinderOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const mapViewRef = useRef<{
    panTo: (lat: number, lng: number) => void
    selectAt: (lat: number, lng: number) => Promise<void>
  } | null>(null)
  const deepLinkHandled = useRef(false)

  // Ward search state
  const [searchOpen, setSearchOpen]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState("")
  const [wardOptions, setWardOptions]   = useState<WardOption[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!actionsOpen) return
    const closeActions = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false)
    }
    document.addEventListener("pointerdown", closeActions)
    return () => document.removeEventListener("pointerdown", closeActions)
  }, [actionsOpen])

  // Choropleth layer state — shareable via ?layer= URL param
  const [activeLayer, setActiveLayer] = useState<string | null>(
    () => getLayer(searchParams.get("layer"))?.id ?? null
  )
  const [layerValues, setLayerValues] = useState<{ values: Record<string, number>; breaks: number[] } | null>(null)
  const [layerLoading, setLayerLoading] = useState(false)

  // Fetch per-ward values when a layer is picked; keep the URL shareable
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (activeLayer) params.set("layer", activeLayer)
    else params.delete("layer")
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)

    if (!activeLayer) {
      setLayerValues(null)
      return
    }
    let cancelled = false
    setLayerLoading(true)
    fetch(`/api/map-layers?layer=${activeLayer}&city=${activeCity.id}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setLayerValues({ values: data.values ?? {}, breaks: data.breaks ?? [] })
        setLayerLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLayerValues({ values: {}, breaks: [] })
        setLayerLoading(false)
      })
    return () => { cancelled = true }
  }, [activeLayer, activeCity.id])

  const choropleth: ChoroplethData | null = useMemo(() => {
    const meta = getLayer(activeLayer)
    if (!meta || !layerValues) return null
    return { values: layerValues.values, breaks: layerValues.breaks, ramp: meta.ramp }
  }, [activeLayer, layerValues])

  const layerLegend = useMemo(() => {
    if (!layerValues) return null
    const nums = Object.values(layerValues.values)
    if (nums.length === 0) return { breaks: [], min: 0, max: 0, wardCount: 0 }
    return {
      breaks: layerValues.breaks,
      min: Math.min(...nums),
      max: Math.max(...nums),
      wardCount: nums.length,
    }
  }, [layerValues])

  // Load ward centroids for search — uses the active city's GeoJSON
  useEffect(() => {
    if (!activeCity.geojsonUrl) return
    fetch(activeCity.geojsonUrl)
      .then(r => r.json())
      .then(data => {
        const opts: WardOption[] = []
        for (const f of data.features) {
          const name = f.properties?.KGISWardName ?? f.properties?.ward_name ?? f.properties?.WARD_NAME ?? f.properties?.name
          const no = parseInt(f.properties?.KGISWardNo ?? f.properties?.ward_no ?? f.properties?.WARD_NO, 10)
          if (!name || !no) continue
          const coords = f.geometry?.type === "MultiPolygon" ? f.geometry.coordinates[0][0] : f.geometry?.coordinates?.[0]
          if (!coords || coords.length === 0) continue
          let sLat = 0, sLng = 0
          for (const [lng, lat] of coords) { sLat += lat; sLng += lng }
          opts.push({
            ward_no: no,
            ward_name: name.replace(/ Ward$/i, ""),
            ward_name_kn: f.properties?.ward_name_kn,
            corporation: f.properties?.corporation,
            corporation_id: parseInt(f.properties?.corporation_id, 10) || undefined,
            assembly_constituency: f.properties?.assembly_constituency,
            assembly_no: Number(f.properties?.assembly_no) || undefined,
            zone: f.properties?.zone,
            zone_name: f.properties?.zone_name,
            population: Number(f.properties?.population) || undefined,
            lat: Number(f.properties?.center_lat) || sLat / coords.length,
            lng: Number(f.properties?.center_lng) || sLng / coords.length,
          })
        }
        setWardOptions(opts.sort((a, b) =>
          (a.corporation_id ?? 0) - (b.corporation_id ?? 0) || a.ward_no - b.ward_no
        ))
      })
      .catch(() => {})
  }, [activeCity.geojsonUrl])

  const searchResults = searchQuery.length >= 2
    ? wardOptions.filter(w =>
        w.ward_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(w.ward_no) === searchQuery.trim() ||
        (w.corporation?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      ).slice(0, 8)
    : []

  const handleSearchSelect = async (ward: WardOption) => {
    setSearchOpen(false)
    setSearchQuery("")
    mapViewRef.current?.panTo(ward.lat, ward.lng)
    if (mapViewRef.current) {
      await mapViewRef.current.selectAt(ward.lat, ward.lng)
      return
    }
    setPinLoading(true)
    setShowCard(true)
    setOutOfBounds(false)
    // Current GBA ward numbers restart within each corporation, while most
    // historical datasets still use the old 243-ward BBMP keys. Location is
    // therefore authoritative; never join the two systems on ward_no alone.
    let result = await pinLookup(ward.lat, ward.lng)
    if (!result?.found && !ward.corporation) {
      result = await fetchWardByNumber(ward.ward_no, activeCity.id, { lat: ward.lat, lng: ward.lng })
    }
    if (!result?.found) {
      setShowCard(false)
      setOutOfBounds(true)
      setPinLoading(false)
      return
    }
    if (ward.corporation) {
      Object.assign(result, {
        gba_ward_no: ward.ward_no,
        gba_ward_name: ward.ward_name,
        gba_ward_name_kn: ward.ward_name_kn ?? null,
        gba_corporation: ward.corporation,
        gba_corporation_id: ward.corporation_id ?? null,
        gba_ac: ward.assembly_constituency ?? null,
        gba_ac_no: ward.assembly_no ?? null,
        gba_zone: ward.zone ?? null,
        gba_zone_name: ward.zone_name ?? null,
        gba_population: ward.population ?? null,
      })
    }
    setPinResult(result)
    setPinLoading(false)
  }

  // Handle ?gba_corporation=X&gba_ward=Y, ?ward=X, or ?report=X deep links.
  // GBA ward numbers restart in each corporation, so both fields are needed.
  useEffect(() => {
    if (deepLinkHandled.current) return
    deepLinkHandled.current = true

    const wardParam   = searchParams.get("ward")
    const reportParam = searchParams.get("report")
    const gbaCorporationParam = Number.parseInt(searchParams.get("gba_corporation") ?? "", 10)
    const gbaWardParam = Number.parseInt(searchParams.get("gba_ward") ?? "", 10)

    if (reportParam) {
      // Fetch report location and pan to it
      const { url: supabaseUrl, anonKey: supabaseAnon } = publicSupabaseConfig()
      fetch(
        `${supabaseUrl}/rest/v1/ward_reports?id=eq.${reportParam}&status=eq.approved&select=lat,lng,ward_no,ward_name,issue_type,ai_label,ai_person&limit=1`,
        { headers: { apikey: supabaseAnon, Authorization: `Bearer ${supabaseAnon}` } }
      )
        .then(r => r.json())
        .then(async (rows) => {
          const report = Array.isArray(rows) ? rows[0] : null
          if (!report) return
          const { lat, lng } = report
          // Pan map to report location
          setTimeout(() => mapViewRef.current?.panTo(lat, lng), 500)
          // Resolve the report against the authoritative current boundary.
          // The old point endpoint is enrichment only and must not replace the
          // GBA identity with whichever historical polygon contains the point.
          setPinLoading(true)
          setShowCard(true)
          const [collection, crosswalk, remoteResult] = await Promise.all([
            fetch(activeCity.geojsonUrl).then(r => r.json()),
            fetch(GBA_CROSSWALK_URL).then(r => r.json() as Promise<GbaCrosswalkArtifact>),
            pinLookup(lat, lng),
          ])
          const feature = collection.features?.find((candidate: GeoJSON.Feature) => featureContains(candidate, lat, lng))
          const properties = feature?.properties as Record<string, unknown> | null | undefined
          const corporationId = Number(properties?.corporation_id)
          const wardNo = Number(properties?.ward_no)
          const row = Number.isFinite(corporationId) && Number.isFinite(wardNo)
            ? indexGbaCrosswalk(crosswalk).get(gbaWardKey(corporationId, wardNo))
            : undefined
          const meta = feature ? currentWardMeta(feature, row, crosswalk.version) : null
          const result = meta ? currentWardPinResult(meta, remoteResult, activeCity.id) : remoteResult
          if (result?.found) {
            setPinResult({ ...result, lat, lng })
            setPinLoading(false)
          } else {
            setPinLoading(false)
            setShowCard(false)
          }
        })
        .catch(() => {})
    } else if (Number.isInteger(gbaCorporationParam) && Number.isInteger(gbaWardParam)) {
      // The static boundary layer holds the published centre for each current
      // ward. Resolve that point through the server-backed lookup so a shared
      // GBA link works even when the visitor cannot reach Supabase directly.
      Promise.all([
        fetch(activeCity.geojsonUrl).then(r => r.json()),
        fetch(GBA_CROSSWALK_URL).then(r => r.json() as Promise<GbaCrosswalkArtifact>),
      ])
        .then(async ([collection, crosswalk]) => {
          const feature = collection.features?.find((f: { properties?: Record<string, unknown> }) =>
            Number(f.properties?.corporation_id) === gbaCorporationParam &&
            Number(f.properties?.ward_no) === gbaWardParam
          )
          const lat = Number(feature?.properties?.center_lat)
          const lng = Number(feature?.properties?.center_lng)
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
          mapViewRef.current?.panTo(lat, lng)
          setPinLoading(true)
          setShowCard(true)
          const row = indexGbaCrosswalk(crosswalk).get(gbaWardKey(gbaCorporationParam, gbaWardParam))
          const meta = currentWardMeta(feature, row, crosswalk.version)
          if (!meta) {
            setPinLoading(false)
            setShowCard(false)
            setOutOfBounds(true)
            return
          }
          setPinResult({ ...currentWardPinResult(meta, null, activeCity.id), lat, lng })
          setPinLoading(false)
        })
        .catch(() => {})
    } else if (wardParam) {
      // Direct ward deep link — fetch ward row and open card without reverse geocoding.
      const wardNo = Number.parseInt(wardParam, 10)
      if (Number.isFinite(wardNo)) {
        fetchWardByNumber(wardNo, activeCity.id, {
          lat: activeCity.center[0],
          lng: activeCity.center[1],
        }).then((ward) => {
          if (!ward) return
          setOutOfBounds(false)
          setShowCard(true)
          setPinResult(ward)
        })
        .catch(() => {})
      }
    }
  }, [activeCity.center, activeCity.geojsonUrl, activeCity.id, searchParams])

  const handlePin = useCallback((result: PinResult | null, lat: number, lng: number) => {
    if (result === null && !pinLoading) {
      setPinLoading(true)
      setShowCard(true)
      setOutOfBounds(false)
    } else {
      if (!result?.found) {
        setPinLoading(false)
        setShowCard(false)
        setOutOfBounds(true)
      } else {
        setPinResult({ ...result, lat, lng })
        setPinLoading(false)
        setOutOfBounds(false)
        // Track pin drop
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "pin_drop",
            // ward_no stays the legacy 243 number (null for current GBA wards,
            // whose numbers restart per corporation); the status page groups
            // by name, and the GBA identity travels in meta.
            ward_no: result.ward_no,
            ward_name: result.gba_ward_name ?? result.ward_name,
            meta: result.gba_ward_no != null
              ? { boundary_system: "gba-369-2025", gba_corporation_id: result.gba_corporation_id, gba_ward_no: result.gba_ward_no }
              : null,
          }),
        }).catch(() => {})
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
        if (mapViewRef.current) {
          await mapViewRef.current.selectAt(lat, lng)
          return
        }
        const result = await pinLookup(lat, lng)
        if (!result?.found) {
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
    <main className="signal-map flex h-screen bg-paper-canvas text-ink overflow-hidden">

      <div className="relative flex-1 min-w-0 h-full transition-all duration-300">

        {/* Wordmark + Search */}
        <div className="signal-map-header absolute top-3.5 left-3.5 right-3.5 z-[900] select-none flex items-center gap-2">
          {!searchOpen && (
            <>
              <span className="signal-wordmark bg-paper border-b-2 border-ink/55 px-[0.7rem] py-[0.45rem] leading-none text-ink font-bold text-base tracking-tight pointer-events-none shrink-0">
                KAUN<span className="text-accent">?</span>
              </span>
              <a
                href="/how-it-works"
                className="signal-map-control flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 bg-paper border border-ink/55 text-ink hover:bg-paper-muted text-xs font-bold shrink-0"
                aria-label="How Kaun works and where its data comes from"
                title="How it works & data sources"
              >
                i
              </a>

              <SurfaceSwitcher current="city" host={host} variant="overlay" />
              <div className="hidden sm:block">
                <CitySwitcher activeCityId={activeCity.id} />
              </div>
            </>
          )}

          {/* Ward search */}
          <div className={`relative z-[1000] ${searchOpen ? "w-full" : "ml-auto"}`} style={{ pointerEvents: "auto" }}>
            {searchOpen ? (
              <div className="flex items-center w-full">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") {
                      setSearchOpen(false)
                      setSearchQuery("")
                    }
                  }}
                  onBlur={() => setTimeout(() => { setSearchOpen(false); setSearchQuery("") }, 200)}
                  placeholder="Search ward..."
                  autoFocus
                  className="w-full md:w-64 h-11 bg-paper-bright border border-ink/55 px-3 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink"
                />
                {searchResults.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-paper border border-ink/55 overflow-hidden max-h-60 overflow-y-auto z-[1000]">
                    {searchResults.map(w => (
                      <button
                        key={`${w.corporation_id ?? "legacy"}:${w.ward_no}`}
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => {
                          e.stopPropagation()
                          void handleSearchSelect(w)
                        }}
                        className="w-full min-h-11 text-left px-3 py-2 hover:bg-ink/5 border-b border-ink/10 last:border-b-0 transition-colors flex items-center justify-between gap-3"
                      >
                        <span className="text-ink text-sm">{w.ward_name}</span>
                        <span className="font-mono text-ink/60 text-[11px] text-right">
                          {w.corporation ? `${w.corporation} · ` : ""}#{w.ward_no}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="signal-map-control flex items-center justify-center w-11 h-11 md:w-9 md:h-9 bg-paper border border-ink/55 text-ink hover:bg-paper-muted transition-colors"
                aria-label="Search wards"
                title="Search wards"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-ink/70" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="7" />
                  <line x1="15.5" y1="15.5" x2="21" y2="21" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* City Pulse — accountability headlines before pin drop */}
        {!showCard && !outOfBounds && !searchOpen && <CityPulse cityId={activeCity.id} />}
        {/* On phones the layer legend occupies the lower map, so the onboarding
            stack steps aside while a layer is painted (closing the legend restores it). */}
        {!showCard && !outOfBounds && !reportPickMode && (
          <div className={activeLayer ? "hidden sm:block" : undefined}>
            <CorporatorVacancy cityId={activeCity.id} />
          </div>
        )}

        {/* Onboarding CTA */}
        {!showCard && !outOfBounds && (
          <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-[900] flex-col items-center gap-2 ${activeLayer ? "hidden sm:flex" : "flex"}`}>
            <p className="pointer-events-none whitespace-nowrap bg-paper-canvas/85 px-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink/60">
              {geoDenied ? "Location unavailable · tap anywhere on the map" : "Tap anywhere on the map"}
            </p>
            {!geoDenied && (
              <button
                onClick={handleFindMyWard}
                disabled={geoLoading}
                className="
                  signal-primary-action flex items-center gap-2 min-h-11 px-4
                  bg-ink text-paper border border-ink hover:bg-ink/85
                  font-mono text-[11px] font-semibold uppercase tracking-[0.08em]
                  active:scale-95 transition-all duration-150 disabled:opacity-60
                "
              >
                {geoLoading ? (
                  <>
                    <span className="w-3 h-3 border border-paper/40 border-t-paper rounded-full animate-spin" />
                    Locating...
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="3" fill="currentColor"/>
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="8" y1="0" x2="8" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="8" y1="13" x2="8" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="0" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="13" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Find my ward
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Floating action buttons */}
        {!reportPickMode && (
          <div className="absolute bottom-16 right-4 z-[900] items-end">
            <div className="hidden sm:flex flex-col gap-2 items-end">
              {activeCity.id === "bengaluru" && (
                <button
                  onClick={() => setWardFinderOpen(true)}
                  className="flex items-center gap-2 min-h-11 px-4 bg-paper border border-ink/55 hover:bg-paper-muted font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors duration-150"
                >
                  New ward?
                </button>
              )}
              <button
                onClick={() => setReportPickMode(true)}
                className="flex items-center gap-2 min-h-11 px-4 bg-paper border border-ink/55 hover:bg-paper-muted font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors duration-150"
              >
                <span aria-hidden="true">+</span>
                Report
              </button>
            </div>

            <div ref={actionsRef} className="relative sm:hidden">
              {actionsOpen && (
                <div role="menu" className="absolute bottom-14 right-0 w-48 overflow-hidden bg-paper border border-ink/55">
                  {activeCity.id === "bengaluru" && (
                    <button
                      role="menuitem"
                      onClick={() => { setActionsOpen(false); setWardFinderOpen(true) }}
                      className="w-full min-h-11 px-3 text-left text-sm text-ink hover:bg-ink/5"
                    >
                      New ward crosswalk
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => { setActionsOpen(false); setReportPickMode(true) }}
                    className="w-full min-h-11 px-3 text-left text-sm text-ink hover:bg-ink/5 border-t border-ink/15"
                  >
                    Report an issue
                  </button>
                </div>
              )}
              <button
                onClick={() => setActionsOpen(open => !open)}
                aria-label="More map actions"
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
                className="w-11 h-11 flex items-center justify-center bg-paper border border-ink/55 text-ink hover:bg-paper-muted"
              >
                <svg width="16" height="4" viewBox="0 0 16 4" aria-hidden="true" fill="currentColor">
                  <rect x="0" y="0" width="3" height="3" /><rect x="6.5" y="0" width="3" height="3" /><rect x="13" y="0" width="3" height="3" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Report pick mode banner */}
        {reportPickMode && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[900] flex items-center gap-2
            pl-4 pr-1 bg-ink text-paper text-sm font-semibold whitespace-nowrap">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="3" fill="currentColor"/>
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            Tap on the map where the issue is
            <button
              onClick={() => setReportPickMode(false)}
              aria-label="Cancel report location selection"
              className="w-11 h-11 flex items-center justify-center text-paper/75 hover:text-paper text-base leading-none"
            >&times;</button>
          </div>
        )}

        <MapView
          city={activeCity}
          onPin={handlePin}
          panRef={mapViewRef}
          resizeKey={showCard ? 1 : 0}
          reportRefresh={reportRefresh}
          reportPickMode={reportPickMode}
          choropleth={choropleth}
          onReportPin={(lat, lng, currentWard) => {
            setReportLat(lat)
            setReportLng(lng)
            setReportWard(currentWard)
            setReportPickMode(false)
            setShowReport(true)
          }}
        />

        {/* Choropleth layer switcher — hidden while picking a report spot */}
        {!reportPickMode && (
          <LayerControl
            activeId={activeLayer}
            onSelect={setActiveLayer}
            legend={layerLegend}
            loading={layerLoading}
          />
        )}
      </div>

      {showCard && (
        <WardCard result={pinResult} loading={pinLoading} onClose={handleClose} />
      )}

      {outOfBounds && (
        <OutOfBoundsCard onClose={handleClose} />
      )}

      <WardFinder open={wardFinderOpen} onClose={() => setWardFinderOpen(false)} />

      {showReport && reportLat !== null && reportLng !== null && (
        <ReportSheet
          lat={reportLat}
          lng={reportLng}
          wardNo={reportWard?.historical_wards[0]?.ward_no ?? undefined}
          wardName={reportWard?.gba_ward_name ?? undefined}
          boundarySystem={reportWard ? "gba-369-2025" : undefined}
          corporationId={reportWard?.gba_corporation_id ?? undefined}
          gbaWardNo={reportWard?.gba_ward_no ?? undefined}
          historicalWards={reportWard?.historical_wards ?? []}
          onClose={() => { setShowReport(false); setReportLat(null); setReportLng(null); setReportWard(null) }}
          onSubmitted={() => setReportRefresh(r => r + 1)}
        />
      )}
    </main>
  )
}
