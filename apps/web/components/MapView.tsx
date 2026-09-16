"use client"

/**
 * MapView  full-screen Leaflet map with Bengaluru ward overlay.
 *
 * Loaded dynamically (no SSR) because Leaflet requires `window`.
 * See: app/page.tsx -> `dynamic(() => import('./MapView'), { ssr: false })`
 */

import { useEffect, useRef, useState, MutableRefObject } from "react"
// Bundled statically so the map is never styled late: if this CSS arrives after
// the map mounts, the attribution control renders as a full-width in-flow strip
// whose CARTO/OSM links capture clicks anywhere on the map surface.
import "leaflet/dist/leaflet.css"
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON, PathOptions } from "leaflet"
import type { Feature } from "geojson"
import type { PinResult } from "@/lib/types"
import { pinLookup } from "@/lib/api"
import { bengaluru, type CityConfig } from "@/lib/cities"
import { BASE_TILE_OPTIONS, BASE_TILE_URL } from "@/lib/base-map"
import { colorFor } from "@/lib/map-layers"
import { currentWardMeta, currentWardPinResult, featureContains, type CurrentWardMeta } from "@/lib/current-ward"
import { GBA_CROSSWALK_URL, gbaWardKey, indexGbaCrosswalk, type GbaCrosswalkArtifact, type GbaCrosswalkRow } from "@/lib/gba-crosswalk"
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "@/lib/supabase-config"

/** Per-ward values + quantile breaks + ramp for choropleth painting */
export interface ChoroplethData {
  values: Record<string, number>
  breaks: number[]
  ramp: readonly string[]
}

/** Escape a value for interpolation into Leaflet popup/divIcon HTML. */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Only http(s) photo URLs may reach an <img src>; anything else is dropped. */
function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null
  } catch {
    return null
  }
}

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 1)  return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// Default to Bengaluru; the city prop overrides at mount time.
// Multi-city: each city has its own center, zoom, geojson URL and ward label key.
const DEFAULT_CITY = bengaluru

// Signal-on-paper: geography is ink; saffron is reserved for actions and pins.
const WARD_STYLE = {
  color: "#16130E",
  weight: 0.75,
  opacity: 0.46,
  fillColor: "#16130E",
  fillOpacity: 0.025,
}
const WARD_HOVER_STYLE = {
  fillOpacity: 0.11,
  weight: 1.5,
}

const LABEL_ZOOM_THRESHOLD = 14

interface Props {
  onPin: (result: PinResult | null, lat: number, lng: number) => void
  resizeKey?: number
  panRef?: MutableRefObject<{
    panTo: (lat: number, lng: number) => void
    selectAt: (lat: number, lng: number) => Promise<void>
  } | null>
  /** Increment to refresh report markers after a new submission */
  reportRefresh?: number
  /** When true, next tap captures a report location instead of a ward lookup */
  reportPickMode?: boolean
  /** Active city — controls map center, zoom, ward GeoJSON layer, and label property */
  city?: CityConfig
  /** When set, wards are painted by metric value instead of the flat style */
  choropleth?: ChoroplethData | null
  onReportPin?: (lat: number, lng: number, currentWard: CurrentWardMeta | null) => void
}

/** Ward number from a GeoJSON feature, across per-city property conventions */
function wardKeyOf(feature: Feature | undefined): string | null {
  const p = feature?.properties as Record<string, unknown> | undefined
  if (!p) return null
  if (p.boundary_system === "gba-369-2025") {
    const corporationId = Number(p.corporation_id)
    const wardNo = Number(p.ward_no)
    return Number.isFinite(corporationId) && Number.isFinite(wardNo) ? `${corporationId}:${wardNo}` : null
  }
  const raw = p.legacy_ward_no ?? p.KGISWardNo ?? p.ward_no ?? p.WARD_NO
  const n = parseInt(String(raw), 10)
  return Number.isFinite(n) ? String(n) : null
}

export default function MapView({ onPin, resizeKey = 0, panRef, reportRefresh = 0, reportPickMode = false, onReportPin, city = DEFAULT_CITY, choropleth = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const geojsonRef = useRef<LeafletGeoJSON | null>(null)
  const choroplethRef = useRef<ChoroplethData | null>(choropleth)
  const currentWardAtRef = useRef<(lat: number, lng: number) => CurrentWardMeta | null>(() => null)
  const crosswalkReadyRef = useRef<Promise<void>>(Promise.resolve())
  const selectAtRef = useRef<(lat: number, lng: number) => Promise<void>>(async () => {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportLayerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelLayerRef = useRef<any>(null)
  const onPinRef = useRef(onPin)
  const reportPickRef = useRef(reportPickMode)
  const onReportPinRef = useRef(onReportPin)
  const [loading, setLoading] = useState(true)

  // Keep refs current without re-running map setup
  useEffect(() => { onPinRef.current = onPin }, [onPin])
  useEffect(() => { reportPickRef.current = reportPickMode }, [reportPickMode])
  useEffect(() => { onReportPinRef.current = onReportPin }, [onReportPin])

  /**
   * Ward polygon style — flat saffron by default; when a choropleth layer
   * is active, fill each ward by its metric bucket. Reads the ref so the
   * same function stays valid for Leaflet's resetStyle across layer changes.
   */
  function styleFeature(feature?: Feature): PathOptions {
    const data = choroplethRef.current
    if (!data) return WARD_STYLE
    const wardKey = wardKeyOf(feature)
    const value = wardKey != null ? data.values[wardKey] : undefined
    if (value === undefined) {
      // No data for this ward — recede so painted wards stand out
      return { color: "#8f887d", weight: 0.5, opacity: 0.45, fillColor: "#d6d0c5", fillOpacity: 0.18 }
    }
    return {
      color: "#16130E",
      weight: 0.6,
      opacity: 0.8,
      fillColor: colorFor(value, data.breaks, data.ramp),
      fillOpacity: 0.55,
    }
  }

  // Repaint wards when the active layer changes
  useEffect(() => {
    choroplethRef.current = choropleth
    geojsonRef.current?.setStyle(styleFeature)
  }, [choropleth, loading])

  // Expose panTo for geolocation button
  useEffect(() => {
    if (!panRef) return
    panRef.current = {
      panTo: (lat: number, lng: number) => {
        mapRef.current?.setView([lat, lng], 15, { animate: true })
      },
      selectAt: (lat: number, lng: number) => selectAtRef.current(lat, lng),
    }
  }, [panRef])

  // Re-fit map when sidebar open/closes
  useEffect(() => {
    if (!mapRef.current) return
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 320)
    return () => clearTimeout(t)
  }, [resizeKey])

  // Refresh report markers: both pending (yellow, confirmable) + approved (orange)
  useEffect(() => {
    if (!mapRef.current || loading) return
    import("leaflet").then((L) => {
      if (reportLayerRef.current) {
        reportLayerRef.current.clearLayers()
      } else {
        reportLayerRef.current = L.layerGroup().addTo(mapRef.current!)
      }

      const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL
      const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY

      const ISSUE_LABELS: Record<string, string> = {
        hoarding: "Illegal banner / hoarding",
        pothole: "Pothole / broken road",
        flooding: "Waterlogging / flooding",
        construction: "Unauthorized construction",
        encroachment: "Encroachment / no parking",
        garbage: "Garbage dump / open waste",
        signal: "Broken traffic signal",
        other: "Civic issue",
      }

      // Fetch both pending and approved
      fetch(`${SUPABASE_URL}/rest/v1/ward_reports?status=in.(pending,approved)&select=id,lat,lng,issue_type,description,ward_name,ai_person,ai_label,upvotes,status,photo_url,reported_at&order=reported_at.desc&limit=300`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
      })
        .then(r => r.json())
        .then((reports: Array<{ id: number; lat: number; lng: number; issue_type: string; description: string; ward_name: string; ai_person: string; ai_label: string; upvotes: number; status: string; photo_url: string | null; reported_at: string }>) => {
          // Track confirmed report IDs in localStorage to prevent double-confirm
          const confirmed: number[] = JSON.parse(localStorage.getItem("kaun_confirmed") ?? "[]")

          reports.forEach((report) => {
            // Every report field is user- or model-supplied: escape before it
            // reaches popup HTML (stored XSS on the admin-secret origin).
            const reportId    = Number(report.id)
            if (!Number.isFinite(reportId)) return
            const isPending   = report.status === "pending"
            const label       = escapeHtml(ISSUE_LABELS[report.issue_type] ?? report.issue_type)
            const upvotes     = Number(report.upvotes) || 0
            const alreadyDone = confirmed.includes(reportId)
            const photoUrl    = safeImageUrl(report.photo_url)
            const photoHtml   = photoUrl
              ? `<img src="${escapeHtml(photoUrl)}" style="width:100%;height:90px;object-fit:cover;border-radius:6px;margin:6px 0 4px;display:block" />`
              : ""
            const wardName    = escapeHtml(report.ward_name)
            const aiPerson    = escapeHtml(report.ai_person)
            const summaryText = escapeHtml(report.ai_label || report.description || "")
            const reportedAgo = escapeHtml(relativeTime(report.reported_at))

            if (isPending) {
              // Yellow pulsing marker for unverified reports
              const icon = L.divIcon({
                html: `<div style="
                  width:13px;height:13px;
                  background:#facc15;
                  border:2px solid rgba(248,245,239,0.92);
                  border-radius:50%;
                  box-shadow:0 0 0 4px rgba(250,204,21,0.3);
                  animation:kaun-pulse 1.5s ease-in-out infinite;
                "></div>`,
                iconSize: [13, 13],
                iconAnchor: [6, 6],
                className: "",
              })
              const marker = L.marker([report.lat, report.lng], { icon })
              const statusBtn = alreadyDone
                ? `<div style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3);border-radius:20px">
                    <span style="width:6px;height:6px;background:#facc15;border-radius:50%;display:inline-block"></span>
                    <span style="color:#facc15;font-size:10px;font-weight:600;letter-spacing:0.05em">UNVERIFIED &middot; you confirmed</span>
                   </div>`
                : `<button id="confirm-${reportId}" style="
                    display:inline-flex;align-items:center;gap:5px;
                    padding:3px 8px;border-radius:20px;
                    background:rgba(250,204,21,0.15);border:1px solid rgba(250,204,21,0.4);
                    cursor:pointer;
                  ">
                    <span style="width:6px;height:6px;background:#facc15;border-radius:50%;display:inline-block;animation:kaun-pulse 1.5s ease-in-out infinite"></span>
                    <span style="color:#facc15;font-size:10px;font-weight:600;letter-spacing:0.05em">UNVERIFIED &middot; Confirm ${upvotes}/2</span>
                   </button>`
              marker.bindPopup(`
                <div style="font-family:sans-serif;width:200px">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                    ${statusBtn}
                    <span style="color:rgba(22,19,14,.45);font-size:10px">${reportedAgo}</span>
                  </div>
                  ${photoHtml}
                  <div style="font-size:12px;font-weight:600;color:#16130e;margin-bottom:2px">${label}</div>
                  ${wardName ? `<div style="color:rgba(22,19,14,.55);font-size:11px;margin-bottom:3px">${wardName}</div>` : ""}
                  ${summaryText ? `<div style="font-size:11px;color:rgba(22,19,14,.70);line-height:1.4">${summaryText}</div>` : ""}
                </div>
              `)
              marker.on("popupopen", () => {
                const btn = document.getElementById(`confirm-${reportId}`)
                if (!btn || alreadyDone) return
                btn.onclick = async () => {
                  btn.textContent = "Confirming..."
                  btn.style.opacity = "0.6"
                  try {
                    const res = await fetch("/api/confirm-report", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: reportId }),
                    })
                    const data = await res.json()
                    const newUpvotes = data.upvotes ?? upvotes + 1
                    // Save to localStorage
                    const stored: number[] = JSON.parse(localStorage.getItem("kaun_confirmed") ?? "[]")
                    localStorage.setItem("kaun_confirmed", JSON.stringify([...stored, reportId]))
                    if (data.status === "approved") {
                      btn.textContent = "Approved!"
                      btn.style.background = "#FF9933"
                    } else {
                      btn.textContent = `Confirmed (${newUpvotes}/2)`
                      btn.style.background = "#86efac"
                    }
                  } catch {
                    btn.textContent = "Try again"
                    btn.style.opacity = "1"
                  }
                }
              })
              reportLayerRef.current.addLayer(marker)
            } else {
              // Orange solid dot for approved reports
              const dot = L.circleMarker([report.lat, report.lng], {
                radius: 6,
                color: "#C25400",
                fillColor: "#FF9933",
                fillOpacity: 0.9,
                weight: 2,
              })
              dot.bindPopup(`
                <div style="font-family:sans-serif;width:200px">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                    <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;background:rgba(194,84,0,0.08);border:1px solid rgba(194,84,0,0.28);border-radius:0">
                      <span style="width:6px;height:6px;background:#C25400;display:inline-block"></span>
                      <span style="color:#C25400;font-size:10px;font-weight:600;letter-spacing:0.05em">VERIFIED</span>
                    </div>
                    <span style="color:rgba(22,19,14,.45);font-size:10px">${reportedAgo}</span>
                  </div>
                  ${photoHtml}
                  <div style="font-size:12px;font-weight:600;color:#16130e;margin-bottom:2px">${label}</div>
                  ${wardName ? `<div style="color:rgba(22,19,14,.55);font-size:11px;margin-bottom:3px">${wardName}</div>` : ""}
                  ${aiPerson ? `<div style="color:#C25400;font-size:11px;margin-bottom:3px">${aiPerson}</div>` : ""}
                  ${summaryText ? `<div style="font-size:11px;color:rgba(22,19,14,.70);line-height:1.4">${summaryText}</div>` : ""}
                </div>
              `)
              reportLayerRef.current.addLayer(dot)
            }
          })
        })
        .catch(() => {})
    })
  }, [reportRefresh, loading])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let active = true
    const controller = new AbortController()
    setLoading(true)

    // Guard against hot-reload leaving a stale Leaflet instance on the DOM node
    const container = containerRef.current as HTMLDivElement & { _leaflet_id?: number }
    if (container._leaflet_id) {
      delete container._leaflet_id
    }

    import("leaflet").then((L) => {
      if (!active || !containerRef.current) return
      const map = L.map(containerRef.current, {
        center: city.center,
        zoom: city.zoom,
        zoomControl: false,
        attributionControl: true,
      })
      mapRef.current = map

      // Move zoom controls to bottom-right so they don't overlap the wordmark
      L.control.zoom({ position: "topright" }).addTo(map)

      L.tileLayer(BASE_TILE_URL, BASE_TILE_OPTIONS).addTo(map)
      if (city.wardBoundarySource) {
        const source = city.wardBoundarySource
        map.attributionControl.addAttribution(
          `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`
        )
      }

      // The historical crosswalk only enriches current wards with former-ward
      // data. It loads independently: if it fails, boundaries still draw and
      // clicks still resolve the current ward (with no historical vector).
      let crosswalkIndex = new Map<string, GbaCrosswalkRow>()
      let crosswalkVersion: string | undefined
      const crosswalkReady: Promise<void> = city.id === "bengaluru"
        ? fetch(GBA_CROSSWALK_URL, { signal: controller.signal })
          .then((r) => {
            if (!r.ok) throw new Error(`GBA crosswalk ${r.status}`)
            return r.json() as Promise<GbaCrosswalkArtifact>
          })
          .then((crosswalk) => {
            crosswalkIndex = indexGbaCrosswalk(crosswalk)
            crosswalkVersion = crosswalk.version
          })
          .catch(() => {})
        : Promise.resolve()
      crosswalkReadyRef.current = crosswalkReady

      // Load ward GeoJSON overlay (per-city)
      fetch(city.geojsonUrl, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          if (!active) return
          const wardFeatures = data.features as Feature[]
          currentWardAtRef.current = (lat, lng) => {
            const feature = wardFeatures.find(candidate => featureContains(candidate, lat, lng))
            if (!feature) return null
            const p = feature.properties as Record<string, unknown> | null
            const row = p
              ? crosswalkIndex.get(gbaWardKey(Number(p.corporation_id), Number(p.ward_no)))
              : undefined
            return currentWardMeta(feature, row, crosswalkVersion)
          }
          geojsonRef.current = L.geoJSON(data, {
            style: styleFeature,
            onEachFeature(feature, layer) {
              layer.on({
                mouseover(e) {
                  e.target.setStyle(
                    choroplethRef.current
                      ? { weight: 1.5, fillOpacity: 0.78 }
                      : WARD_HOVER_STYLE
                  )
                },
                mouseout() {
                  geojsonRef.current?.resetStyle(layer)
                },
              })
            },
          }).addTo(map)

          // Ward name labels — visible only when zoomed in.
          // Property name varies by city: Bengaluru's datameet GeoJSON uses
          // KGISWardName; the kaun-generated Vizag GeoJSON uses ward_name.
          // Fall back through common variants.
          labelLayerRef.current = L.layerGroup()
          for (const feature of data.features) {
            const p = feature.properties ?? {}
            const name = p.KGISWardName ?? p.ward_name ?? p.WARD_NAME ?? p.name ?? null
            if (!name) continue
            const displayName = p.corporation && p.ward_no
              ? `${name} · ${p.corporation} ${p.ward_no}`
              : name
            // Calculate centroid from polygon coordinates
            const coords = feature.geometry?.coordinates
            if (!coords) continue
            let ring = coords[0]
            // Handle MultiPolygon
            if (feature.geometry.type === "MultiPolygon") ring = coords[0][0]
            if (!ring || ring.length === 0) continue
            let sumLat = 0, sumLng = 0
            for (const [lng, lat] of ring) { sumLat += lat; sumLng += lng }
            const centroid: [number, number] = [
              Number(p.center_lat) || sumLat / ring.length,
              Number(p.center_lng) || sumLng / ring.length,
            ]

            const label = L.marker(centroid, {
              icon: L.divIcon({
                html: `<span style="
                  font-size:9px;
                  color:rgba(22,19,14,0.48);
                  text-shadow:0 1px 0 rgba(248,245,239,0.9);
                  white-space:nowrap;
                  pointer-events:none;
                  font-family:system-ui,sans-serif;
                  letter-spacing:0.02em;
                ">${escapeHtml(String(displayName).replace(/ Ward$/i, ""))}</span>`,
                className: "",
                iconAnchor: [0, 0],
              }),
              interactive: false,
            })
            labelLayerRef.current.addLayer(label)
          }

          // Show/hide labels based on zoom
          function updateLabels() {
            if (!mapRef.current || !labelLayerRef.current) return
            if (mapRef.current.getZoom() >= LABEL_ZOOM_THRESHOLD) {
              if (!mapRef.current.hasLayer(labelLayerRef.current)) {
                labelLayerRef.current.addTo(mapRef.current)
              }
            } else {
              if (mapRef.current.hasLayer(labelLayerRef.current)) {
                mapRef.current.removeLayer(labelLayerRef.current)
              }
            }
          }
          map.on("zoomend", updateLabels)
          updateLabels()

          setLoading(false)
        })
        .catch(error => {
          if (active && error instanceof Error && error.name !== "AbortError") setLoading(false)
        }) // show map even if GeoJSON fails

      // Custom pin icon
      const pinIcon = L.divIcon({
        html: `<div style="
          width:14px;height:14px;
          background:#C25400;
          border:2px solid #F8F5EF;
          border-radius:50%;
          box-shadow:0 0 0 3px rgba(194,84,0,0.28)
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        className: "",
      })

      let marker: ReturnType<typeof L.marker> | null = null

      const selectAt = async (lat: number, lng: number) => {
        // Never resolve a click against a half-loaded crosswalk (a click
        // during load would otherwise lose its historical vector). The
        // promise always settles, success or failure.
        await crosswalkReadyRef.current
        if (!active) return
        const currentWard = currentWardAtRef.current(lat, lng)
        // Report pick mode: capture coords and hand off — no ward lookup
        if (reportPickRef.current) {
          onReportPinRef.current?.(lat, lng, currentWard)
          return
        }

        // Normal mode: ward lookup
        if (marker) {
          marker.setLatLng([lat, lng])
        } else {
          marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map)
        }

        onPinRef.current(null, lat, lng) // signal loading state

        const remoteResult = await pinLookup(lat, lng)
        // The current GBA boundary file is already loaded in the browser and is
        // authoritative for whether a click is inside Bengaluru. Do not turn a
        // valid ward click into "Not in Bengaluru" merely because the optional
        // server-side enrichment lookup is unavailable.
        const result: PinResult | null = currentWard
          ? currentWardPinResult(currentWard, remoteResult, city.id)
          : remoteResult
        onPinRef.current(result, lat, lng)
      }
      selectAtRef.current = selectAt

      map.on("click", (e) => {
        void selectAt(e.latlng.lat, e.latlng.lng)
      })
    })

    return () => {
      active = false
      controller.abort()
      mapRef.current?.remove()
      mapRef.current = null
      geojsonRef.current = null
      labelLayerRef.current = null
      currentWardAtRef.current = () => null
      crosswalkReadyRef.current = Promise.resolve()
      selectAtRef.current = async () => {}
    }
  }, [city.center, city.geojsonUrl, city.zoom])

  return (
    <div className={`relative w-full h-full${reportPickMode ? " [&_.leaflet-container]:cursor-crosshair" : ""}`}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-[#FF9933] text-sm tracking-widest uppercase">
          Loading ward boundaries...
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
