"use client"

import dynamic from "next/dynamic"
import { useCallback, useState, useRef, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import type { PinResult } from "@/lib/types"
import { fetchWardByNumber, pinLookup } from "@/lib/api"
import WardCard from "@/components/WardCard"
import { CityPulse } from "@/components/CityPulse"
import { CitySwitcher } from "@/components/CitySwitcher"
import { OLD_WARD_NUMBERS_LABEL, WardFinder, coveringCurrentWards, type CoveringWard } from "@/components/WardFinder"
import ReportSheet from "@/components/shared/ReportSheet"
import { MapLayerPicker, type PickerLegend } from "@/components/shared/MapLayerPicker"
import { PageHeader } from "@/components/shared/PageHeader"
import { getCity } from "@/lib/cities"
import { MAP_LAYERS, getLayer } from "@/lib/map-layers"
import type { ChoroplethData } from "@/components/MapView"
import { currentWardMeta, currentWardPinResult, featureContains, type CurrentWardMeta } from "@/lib/current-ward"
import { GBA_CROSSWALK_URL, MATERIAL_OVERLAP, gbaWardKey, indexGbaCrosswalk, type GbaCrosswalkArtifact, type GbaCrosswalkRow } from "@/lib/gba-crosswalk"
import { publicSupabaseConfig } from "@/lib/supabase-config"
import Link from "next/link"
import { CIVIC_PROJECTS, searchCivicProjects } from "@/lib/civic-projects"

/** Why "My location" found no ward. */
export type LocationProblem = "blocked" | "dismissed" | "unavailable" | "timeout" | "unsupported"

/**
 * A browser that has location blocked (for the site, for the browser app, or
 * by its own auto-block after repeated dismissals) fails the request without
 * showing a prompt, and on Chrome that block carries into incognito. Only the
 * site-level block is visible to the Permissions API, so a refusal that comes
 * back faster than anyone could answer a prompt counts as blocked too.
 */
export function locationProblem(code: number, permission: string | null, elapsedMs: number): LocationProblem {
  if (code === 1) return permission === "denied" || elapsedMs < 600 ? "blocked" : "dismissed"
  if (code === 3) return "timeout"
  return "unavailable"
}

export function locationProblemCopy(problem: LocationProblem): string {
  switch (problem) {
    case "blocked": return "Location is blocked in your browser or phone settings. Allow it for this site."
    case "dismissed": return "Location wasn't shared."
    case "unavailable": return "Your device couldn't find a location. Check that location is on."
    case "timeout": return "Finding your location took too long."
    case "unsupported": return "This browser can't share location."
  }
}

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

interface WardCollection {
  features: GeoJSON.Feature[]
}

/** Search options (name, identity, centre) from the city's ward boundary file. */
function wardOptionsFrom(data: WardCollection): WardOption[] {
  const opts: WardOption[] = []
  for (const f of data.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, string | number | undefined>
    const name = p.KGISWardName ?? p.ward_name ?? p.WARD_NAME ?? p.name
    const no = parseInt(String(p.KGISWardNo ?? p.ward_no ?? p.WARD_NO), 10)
    if (!name || !no) continue
    const geometry = f.geometry as { type?: string; coordinates?: number[][][] | number[][][][] } | null
    const coords = (geometry?.type === "MultiPolygon"
      ? (geometry.coordinates as number[][][][])?.[0]?.[0]
      : (geometry?.coordinates as number[][][] | undefined)?.[0]) as number[][] | undefined
    if (!coords || coords.length === 0) continue
    let sLat = 0, sLng = 0
    for (const [lng, lat] of coords) { sLat += lat; sLng += lng }
    opts.push({
      ward_no: no,
      ward_name: String(name).replace(/ Ward$/i, ""),
      ward_name_kn: p.ward_name_kn as string | undefined,
      corporation: p.corporation as string | undefined,
      corporation_id: parseInt(String(p.corporation_id), 10) || undefined,
      assembly_constituency: p.assembly_constituency as string | undefined,
      assembly_no: Number(p.assembly_no) || undefined,
      zone: p.zone as string | undefined,
      zone_name: p.zone_name as string | undefined,
      population: Number(p.population) || undefined,
      lat: Number(p.center_lat) || sLat / coords.length,
      lng: Number(p.center_lng) || sLng / coords.length,
    })
  }
  return opts.sort((a, b) =>
    (a.corporation_id ?? 0) - (b.corporation_id ?? 0) || a.ward_no - b.ward_no
  )
}

function normalizeWardName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim().replace(/ ward$/, "")
}

interface FormerWardMatch {
  ward_no: number
  ward_name: string
  wards: CoveringWard[]
  smaller: number
}

/**
 * Former (243-map) ward names matching a search, each with the current wards
 * that now cover it. "Koramangala" is no current ward's name, but it is a
 * former ward split across several current ones, so a search for it should
 * lead there instead of to nothing. Former names that are also a current
 * ward's name are skipped (the current ward already answers the search), as
 * are number searches (old and new numbers would be confused).
 */
function formerWardMatches(
  query: string,
  rows: ReadonlyArray<{
    corporation_id: number
    ward_no: number
    ward_name: string
    historical_wards: ReadonlyArray<{ ward_no: number; ward_name: string; legacy_share: number }>
  }>,
  currentNames: ReadonlySet<string>,
  minShare: number,
  limit = 3,
): FormerWardMatch[] {
  const q = normalizeWardName(query)
  if (q.length < 2 || /^\d+$/.test(q)) return []
  const found = new Map<number, string>()
  for (const row of rows) {
    for (const ref of row.historical_wards) {
      const name = normalizeWardName(ref.ward_name)
      if (!found.has(ref.ward_no) && name.includes(q) && !currentNames.has(name)) found.set(ref.ward_no, ref.ward_name)
    }
  }
  const startsWith = (name: string) => (normalizeWardName(name).startsWith(q) ? 0 : 1)
  return [...found]
    .sort(([, a], [, b]) => startsWith(a) - startsWith(b) || a.localeCompare(b))
    .slice(0, limit)
    .map(([ward_no, ward_name]) => ({ ward_no, ward_name, ...coveringCurrentWards(ward_no, rows, minShare) }))
}

const WARD_URL_PARAMS = ["gba_corporation", "gba_ward", "ward", "report"]

/**
 * The query string with the open ward's identity in it: a current GBA ward as
 * ?gba_corporation=&gba_ward= (its number restarts per corporation), a legacy
 * ward as ?ward=. `null` removes them. Everything else (?layer=, ?city=)
 * stays. ?report= survives only while the open ward is that report's.
 */
function wardUrlSearch(
  search: string,
  ward: { gba_corporation_id?: number | null; gba_ward_no?: number | null; ward_no?: number | null } | null,
  keepReport = false,
): string {
  const params = new URLSearchParams(search)
  for (const key of WARD_URL_PARAMS) {
    if (key !== "report" || !keepReport) params.delete(key)
  }
  if (ward?.gba_corporation_id != null && ward.gba_ward_no != null) {
    params.set("gba_corporation", String(ward.gba_corporation_id))
    params.set("gba_ward", String(ward.gba_ward_no))
  } else if (ward?.ward_no != null) {
    params.set("ward", String(ward.ward_no))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ""
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
  const [geoProblem, setGeoProblem]   = useState<LocationProblem | null>(null)
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
  const mapRootRef = useRef<HTMLElement>(null)
  // The ward the ?report= deep link opened; ?report= stays in the URL only
  // while that ward is the one on screen.
  const reportResultRef = useRef<PinResult | null>(null)
  const wardInUrlRef = useRef(false)

  // Ward search state
  const [searchOpen, setSearchOpen]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState("")
  const [wardOptions, setWardOptions]   = useState<WardOption[]>([])
  const [wardOptionsState, setWardOptionsState] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [gbaRows, setGbaRows]           = useState<GbaCrosswalkRow[]>([])
  const [gbaRowsState, setGbaRowsState] = useState<"idle" | "loading" | "done">("idle")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  // One boundary download per visit for everything on this page that needs it
  // (search, the "Old ward numbers" links, the ward deep links). MapView makes
  // its own request when the map mounts; search loads only when it is opened,
  // so a plain visit fetches the 3.7 MB file once, not twice.
  const wardCollectionRef = useRef<Promise<WardCollection> | null>(null)
  const loadWardCollection = useCallback((): Promise<WardCollection> => {
    if (!activeCity.geojsonUrl) return Promise.reject(new Error("no ward boundaries for this city"))
    if (!wardCollectionRef.current) {
      wardCollectionRef.current = fetch(activeCity.geojsonUrl)
        .then(r => {
          if (!r.ok) throw new Error(`ward boundaries ${r.status}`)
          return r.json() as Promise<WardCollection>
        })
        .catch(error => {
          wardCollectionRef.current = null
          throw error
        })
    }
    return wardCollectionRef.current
  }, [activeCity.geojsonUrl])

  // Immutable versioned asset: the map already has it, so this is a cache hit.
  const crosswalkRef = useRef<Promise<GbaCrosswalkArtifact> | null>(null)
  const loadGbaCrosswalk = useCallback((): Promise<GbaCrosswalkArtifact> => {
    if (!crosswalkRef.current) {
      crosswalkRef.current = fetch(GBA_CROSSWALK_URL)
        .then(r => {
          if (!r.ok) throw new Error(`GBA crosswalk ${r.status}`)
          return r.json() as Promise<GbaCrosswalkArtifact>
        })
        .catch(error => {
          crosswalkRef.current = null
          throw error
        })
    }
    return crosswalkRef.current
  }, [])

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

  // The legend keys every ward the layer leaves unpainted, so the total is
  // the city's ward count (never fewer than the wards that have a value).
  const layerLegend = useMemo((): PickerLegend | null => {
    const meta = getLayer(activeLayer)
    if (!meta || !layerValues) return null
    const nums = Object.values(layerValues.values)
    return {
      ramp: meta.ramp,
      min: nums.length ? Math.min(...nums) : 0,
      max: nums.length ? Math.max(...nums) : 0,
      painted: nums.length,
      total: Math.max(activeCity.wardCount ?? 0, nums.length),
    }
  }, [activeLayer, layerValues, activeCity.wardCount])

  // Ward centroids for search (and names for "Old ward numbers"), loaded the
  // first time either is opened rather than on every visit.
  useEffect(() => {
    if (!searchOpen && !wardFinderOpen) {
      // A failed load is retried the next time search opens, not in a loop.
      if (wardOptionsState === "failed") setWardOptionsState("idle")
      return
    }
    if (wardOptionsState === "idle") {
      setWardOptionsState("loading")
      loadWardCollection()
        .then(data => {
          setWardOptions(wardOptionsFrom(data))
          setWardOptionsState("ready")
        })
        .catch(() => setWardOptionsState("failed"))
    }
    // Former-ward suggestions are optional: if the overlap file fails, search
    // still answers with current wards.
    if (searchOpen && activeCity.id === "bengaluru" && gbaRowsState === "idle") {
      setGbaRowsState("loading")
      loadGbaCrosswalk()
        .then(data => setGbaRows(data.rows ?? []))
        .catch(() => {})
        .finally(() => setGbaRowsState("done"))
    }
  }, [searchOpen, wardFinderOpen, wardOptionsState, gbaRowsState, activeCity.id, loadWardCollection, loadGbaCrosswalk])

  const trimmedQuery = searchQuery.trim()
  const searchResults = trimmedQuery.length >= 2
    ? wardOptions.filter(w =>
        w.ward_name.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
        String(w.ward_no) === trimmedQuery ||
        (w.corporation?.toLowerCase().includes(trimmedQuery.toLowerCase()) ?? false)
      ).slice(0, 8)
    : []

  const currentWardNames = new Set(wardOptions.map(w => normalizeWardName(w.ward_name)))
  // Former-ward hits, joined to the loaded search options so each current ward
  // they point at opens exactly as a normal search pick does.
  // Plain computation: the React compiler memoizes it.
  const formerResults = (() => {
    if (trimmedQuery.length < 2 || gbaRows.length === 0 || wardOptions.length === 0) return []
    const byKey = new Map(wardOptions.map(w => [gbaWardKey(w.corporation_id ?? 0, w.ward_no), w]))
    return formerWardMatches(trimmedQuery, gbaRows, currentWardNames, MATERIAL_OVERLAP)
      .map(former => ({
        ...former,
        parts: former.wards.flatMap(part => {
          const option = byKey.get(gbaWardKey(part.corporation_id, part.ward_no))
          return option ? [{ part, option }] : []
        }),
      }))
      .filter(former => former.parts.length > 0)
  })()

  const projectResults = trimmedQuery.length >= 2 ? searchCivicProjects(trimmedQuery, activeCity.id) : []
  const hasProjects = CIVIC_PROJECTS.some(project => project.cityId === activeCity.id)
  const searchHasResults = searchResults.length > 0 || projectResults.length > 0 || formerResults.length > 0

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery("")
  }

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

  // "Old ward numbers" and former-ward search hits open a current ward exactly
  // as picking it in search does (its published centre, then the map lookup).
  const selectCurrentWard = async (corporationId: number, wardNo: number) => {
    const options = wardOptions.length > 0
      ? wardOptions
      : wardOptionsFrom(await loadWardCollection().catch(() => ({ features: [] })))
    const option = options.find(w => w.corporation_id === corporationId && w.ward_no === wardNo)
    if (!option) return
    setWardFinderOpen(false)
    await handleSearchSelect(option)
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
            loadWardCollection(),
            loadGbaCrosswalk(),
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
            const reportWard = { ...result, lat, lng }
            reportResultRef.current = reportWard
            setPinResult(reportWard)
            setPinLoading(false)
          } else {
            setPinLoading(false)
            setShowCard(false)
          }
        })
        .catch(() => {
          // A missing boundary or crosswalk file must not leave a skeleton up.
          setPinLoading(false)
          setShowCard(false)
        })
    } else if (Number.isInteger(gbaCorporationParam) && Number.isInteger(gbaWardParam)) {
      // The static boundary layer holds the published centre for each current
      // ward. Resolve that point through the server-backed lookup so a shared
      // GBA link works even when the visitor cannot reach Supabase directly.
      Promise.all([loadWardCollection(), loadGbaCrosswalk()])
        .then(async ([collection, crosswalk]) => {
          const feature = collection.features?.find(f =>
            Number(f.properties?.corporation_id) === gbaCorporationParam &&
            Number(f.properties?.ward_no) === gbaWardParam
          )
          const lat = Number(feature?.properties?.center_lat)
          const lng = Number(feature?.properties?.center_lng)
          if (!feature || !Number.isFinite(lat) || !Number.isFinite(lng)) return
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
  }, [activeCity.center, activeCity.id, searchParams, loadWardCollection, loadGbaCrosswalk])

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

  const replaceSearch = useCallback((search: string) => {
    if (search === window.location.search) return
    window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`)
  }, [])

  // The URL names the open ward, so a reload or a copied address reopens it.
  // replaceState, not push: stepping through wards should not fill history.
  useEffect(() => {
    if (showCard && pinResult?.found && !pinLoading) {
      replaceSearch(wardUrlSearch(window.location.search, pinResult, pinResult === reportResultRef.current))
      wardInUrlRef.current = true
    } else if (!showCard && wardInUrlRef.current) {
      replaceSearch(wardUrlSearch(window.location.search, null))
      wardInUrlRef.current = false
    }
  }, [showCard, pinResult, pinLoading, replaceSearch])

  const handleClose = useCallback(() => {
    setShowCard(false)
    setPinResult(null)
    setPinLoading(false)
    setOutOfBounds(false)
    // Closing is explicit: drop the ward (and a deep-linked report) from the
    // URL even if it never finished loading, so a reload does not reopen it.
    reportResultRef.current = null
    wardInUrlRef.current = false
    replaceSearch(wardUrlSearch(window.location.search, null))
  }, [replaceSearch])

  // Phones: publish the ward sheet's height so map controls (the layer legend)
  // can sit above the folded sheet instead of behind it.
  useEffect(() => {
    const root = mapRootRef.current
    if (!root || !showCard || typeof ResizeObserver === "undefined") return
    let observed: Element | null = null
    const sizes = new ResizeObserver(entries => {
      const sheet = entries[entries.length - 1]?.target as HTMLElement | undefined
      if (sheet) root.style.setProperty("--ward-sheet-h", `${sheet.offsetHeight}px`)
    })
    const attach = () => {
      const sheet = root.querySelector(":scope > .ward-sheet")
      if (sheet === observed) return
      if (observed) sizes.unobserve(observed)
      observed = sheet
      if (sheet) sizes.observe(sheet)
    }
    attach()
    const mounts = new MutationObserver(attach)
    mounts.observe(root, { childList: true })
    return () => {
      sizes.disconnect()
      mounts.disconnect()
      root.style.removeProperty("--ward-sheet-h")
    }
  }, [showCard])

  const handleFindMyWard = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoProblem("unsupported")
      return
    }
    setGeoLoading(true)
    setGeoProblem(null)
    const requestedAt = Date.now()

    const bail = setTimeout(() => {
      setGeoLoading(false)
      setGeoProblem("timeout")
    }, 12000)

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        clearTimeout(bail)
        setGeoProblem(null)
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
      async error => {
        clearTimeout(bail)
        const elapsed = Date.now() - requestedAt
        const permission = await navigator.permissions
          ?.query({ name: "geolocation" })
          .then(status => status.state)
          .catch(() => null)
        setGeoLoading(false)
        setGeoProblem(locationProblem(error.code, permission ?? null, elapsed))
      },
      { timeout: 10000, maximumAge: 0 }
    )
  }, [])

  return (
    <main ref={mapRootRef} className="signal-map city-map flex h-screen bg-paper-canvas text-ink overflow-hidden">

      <div className="relative flex-1 min-w-0 h-full transition-all duration-300">

        {/* The shared page header, floating over the map. Leaflet's controls sit
            at z-index 1000 in this same stacking context, so the header stays
            above them (1010), and above the phone ward sheet (1050) while
            search is open, so its results are never drawn under a map control.
            Dialogs sit higher. Search replaces the header row while it is open:
            on a phone the input needs the whole width. */}
        <div className={`city-map-header absolute top-3.5 left-3.5 right-3.5 pointer-events-none ${searchOpen ? "z-[1060]" : "z-[1010]"}`}>
          {searchOpen ? (
            <div className="relative z-[1000] w-full pointer-events-auto">
              <div className="flex items-center w-full md:w-auto">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") closeSearch()
                  }}
                  onBlur={() => setTimeout(closeSearch, 200)}
                  placeholder={hasProjects ? "Search a ward or project..." : "Search ward..."}
                  aria-label={hasProjects ? "Search wards and projects" : "Search wards"}
                  autoFocus
                  className="w-full md:w-64 min-w-0 h-11 bg-paper-bright border border-ink/55 px-3 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink"
                />
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={closeSearch}
                  aria-label="Close search"
                  className="signal-map-control -ml-px w-11 h-11 shrink-0 flex items-center justify-center bg-paper border border-ink/55 text-ink/70 hover:bg-paper-muted hover:text-ink text-lg leading-none"
                >
                  &times;
                </button>
                {trimmedQuery.length >= 2 && (
                  <div className="absolute top-full mt-1 left-0 right-0 md:right-auto md:w-[22rem] bg-paper border border-ink/55 overflow-hidden max-h-72 overflow-y-auto z-[1000]">
                    {projectResults.map(project => (
                      <Link
                        key={project.slug}
                        href={`/${project.cityId}/projects/${project.slug}`}
                        onMouseDown={e => e.preventDefault()}
                        className="flex w-full min-h-11 flex-col justify-center px-3 py-2 text-left hover:bg-ink/5 border-b border-ink/10 bg-paper-muted transition-colors"
                      >
                        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/60">Project record · {project.status}</span>
                        <span className="text-sm font-semibold text-ink">{project.shortTitle}</span>
                      </Link>
                    ))}
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
                    {formerResults.map(former => {
                      const split = former.wards.length > 1 || former.smaller > 0
                      return (
                        <div key={`former:${former.ward_no}`} className="border-b border-ink/10 last:border-b-0">
                          <p className="px-3 pt-2 pb-1 text-sm text-ink">
                            <span className="font-semibold">{former.ward_name}</span>
                            <span className="text-ink/60"> (former ward) &rarr; now in:</span>
                          </p>
                          {former.parts.map(({ part, option }) => (
                            <button
                              key={`${part.corporation_id}:${part.ward_no}`}
                              onMouseDown={e => e.preventDefault()}
                              onClick={e => {
                                e.stopPropagation()
                                void handleSearchSelect(option)
                              }}
                              aria-label={`${option.ward_name}, ${option.corporation ?? ""} ward ${option.ward_no}${split ? `, holds ${Math.round(part.share * 100)}% of former ${former.ward_name}` : ""}`}
                              className="w-full min-h-11 text-left pl-6 pr-3 py-2 hover:bg-ink/5 transition-colors flex items-center justify-between gap-3"
                            >
                              <span className="text-ink text-sm">{option.ward_name}</span>
                              <span className="font-mono text-ink/60 text-[11px] text-right">
                                {option.corporation ? `${option.corporation} · ` : ""}#{option.ward_no}
                                {split ? ` · ${Math.round(part.share * 100)}% of it` : ""}
                              </span>
                            </button>
                          ))}
                          {former.smaller > 0 && (
                            <p className="pl-6 pr-3 pb-2 text-[11px] text-ink/60">
                              and {former.smaller} smaller {former.smaller === 1 ? "part" : "parts"}
                            </p>
                          )}
                        </div>
                      )
                    })}
                    {!searchHasResults && (
                      <div role="status" className="px-3 py-3">
                        {wardOptionsState === "loading" || wardOptionsState === "idle" || gbaRowsState === "loading" ? (
                          <p className="text-sm text-ink/60">Loading wards...</p>
                        ) : wardOptionsState === "failed" ? (
                          <p className="text-sm text-ink/75">Could not load wards. Close search and try again.</p>
                        ) : (
                          <>
                            <p className="text-sm text-ink">
                              {/^\d+$/.test(trimmedQuery)
                                ? <>No current ward numbered {trimmedQuery}</>
                                : <>No current ward named &ldquo;{trimmedQuery}&rdquo;</>}
                            </p>
                            <p className="mt-0.5 text-xs text-ink/60">
                              Try a ward, area or corporation name, or tap the map.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <PageHeader
              surface="city"
              variant="overlay"
              host={host}
              context={activeCity.name}
              actions={
                <>
                  <div className="hidden sm:block">
                    <CitySwitcher activeCityId={activeCity.id} />
                  </div>
                  <a
                    href="/how-it-works"
                    className="flex items-center justify-center w-11 h-11 bg-paper border border-ink/55 text-ink hover:bg-paper-muted font-mono text-xs font-bold shrink-0"
                    aria-label="How Kaun works and where its data comes from"
                    title="How it works & data sources"
                  >
                    i
                  </a>
                  <button
                    onClick={() => setSearchOpen(true)}
                    className="flex items-center justify-center w-11 h-11 bg-paper border border-ink/55 text-ink hover:bg-paper-muted transition-colors"
                    aria-label={hasProjects ? "Search wards and projects" : "Search wards"}
                    title={hasProjects ? "Search wards and projects" : "Search wards"}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-ink/70" aria-hidden="true">
                      <circle cx="10.5" cy="10.5" r="7" />
                      <line x1="15.5" y1="15.5" x2="21" y2="21" />
                    </svg>
                  </button>
                </>
              }
            />
          )}
        </div>

        {/* The lower map: headlines, then one line to find a ward. The top of
            the map is left to the header. On phones the layer legend takes
            this space, so the stack steps aside while a layer is painted. The
            location line stays clear of the phone "…" button (bottom-right,
            60px in), so a failed location can always be retried. Picking a
            report spot shows its own banner here instead. */}
        {!showCard && !outOfBounds && !reportPickMode && (
          <div className={`absolute bottom-20 inset-x-0 z-[900] pointer-events-none flex-col items-center gap-2 ${activeLayer ? "hidden sm:flex" : "flex"}`}>
            {!searchOpen && (
              <CityPulse
                cityId={activeCity.id}
                className="pointer-events-auto w-[min(420px,calc(100vw-1.75rem))] sm:w-[min(420px,calc(100vw-26rem))]"
              />
            )}
            <p role="status" className={geoProblem ? "pointer-events-auto max-w-[calc(100vw-7.5rem)] bg-paper border border-ink/55 px-3 py-2 text-xs leading-snug text-ink/85" : "sr-only"}>
              {geoProblem ? locationProblemCopy(geoProblem) : ""}
            </p>
            <div className="pointer-events-auto flex max-w-[calc(100vw-7.5rem)] items-stretch border border-ink bg-paper">
              <button
                onClick={handleFindMyWard}
                disabled={geoLoading}
                className="
                  signal-primary-action flex shrink-0 items-center gap-2 min-h-11 px-3
                  bg-ink text-paper hover:bg-ink/85
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
                    {geoProblem ? "Try again" : "My location"}
                  </>
                )}
              </button>
              <span className="flex items-center px-3 text-xs text-ink/70 whitespace-nowrap">or tap the map</span>
            </div>
          </div>
        )}

        {/* Floating action buttons */}
        {!reportPickMode && (
          <div className="absolute bottom-16 right-4 z-[900] items-end max-lg:[.signal-map:has(.ward-sheet[data-sheet=collapsed])_&]:bottom-[calc(var(--ward-sheet-h,10rem)+0.75rem)]">
            <div className="hidden sm:flex flex-col gap-2 items-end">
              {activeCity.id === "bengaluru" && (
                <button
                  onClick={() => setWardFinderOpen(true)}
                  className="flex items-center gap-2 min-h-11 px-4 bg-paper border border-ink/55 hover:bg-paper-muted font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors duration-150"
                >
                  {OLD_WARD_NUMBERS_LABEL}
                </button>
              )}
              {hasProjects && (
                <Link
                  href={`/${activeCity.id}/projects`}
                  className="flex items-center gap-2 min-h-11 px-4 bg-paper border border-ink/55 hover:bg-paper-muted font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors duration-150"
                >
                  Project records
                </Link>
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
                      {OLD_WARD_NUMBERS_LABEL}
                    </button>
                  )}
                  {hasProjects && (
                    <Link
                      role="menuitem"
                      href={`/${activeCity.id}/projects`}
                      onClick={() => setActionsOpen(false)}
                      className="flex w-full min-h-11 items-center px-3 text-left text-sm text-ink hover:bg-ink/5 border-t border-ink/15"
                    >
                      Project records
                    </Link>
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

        {/* Layer picker — the same control as the India map's, bottom-left.
            Hidden while picking a report spot. It stops short of the phone
            "…" button on the right, and on phones HomePage publishes the ward
            sheet's measured height as --ward-sheet-h on the map root, so a
            folded sheet (10rem is its usual height) never covers it: it rises
            above the sheet and its height cap shrinks to match. */}
        {!reportPickMode && (
          <MapLayerPicker
            id="city-layer-panel"
            layers={MAP_LAYERS}
            activeId={activeLayer}
            onSelect={setActiveLayer}
            legend={layerLegend}
            loading={layerLoading}
            noun={{ one: "ward", other: "wards" }}
            noDataSwatch="fill"
            className="absolute bottom-4 left-4 z-[900] w-[min(20rem,calc(100vw-5.5rem))] max-h-[calc(100%-7rem)]
              max-lg:[.signal-map:has(.ward-sheet[data-sheet=collapsed])_&]:bottom-[calc(var(--ward-sheet-h,10rem)+0.75rem)]
              max-lg:[.signal-map:has(.ward-sheet[data-sheet=collapsed])_&]:max-h-[calc(100%-var(--ward-sheet-h,10rem)-7.75rem)]"
          />
        )}
      </div>

      {showCard && (
        <WardCard result={pinResult} loading={pinLoading} onClose={handleClose} />
      )}

      {outOfBounds && (
        <OutOfBoundsCard onClose={handleClose} />
      )}

      <WardFinder
        open={wardFinderOpen}
        onClose={() => setWardFinderOpen(false)}
        onSelectCurrentWard={(corporationId, wardNo) => { void selectCurrentWard(corporationId, wardNo) }}
        currentWards={wardOptions}
      />

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
