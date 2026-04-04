"use client"

/**
 * MapView  full-screen Leaflet map with Bengaluru ward overlay.
 *
 * Loaded dynamically (no SSR) because Leaflet requires `window`.
 * See: app/page.tsx -> `dynamic(() => import('./MapView'), { ssr: false })`
 */

import { useEffect, useRef, useState, MutableRefObject } from "react"
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON } from "leaflet"
import type { PinResult } from "@/lib/types"
import { pinLookup } from "@/lib/api"
import { clientPinLookup } from "@/lib/geo/cityPinLookup"
import { bengaluru, getCity } from "@/lib/cities"
import type { CityConfig } from "@/lib/cities"

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

// City-aware: uses bengaluru as default, overridable via cityId prop

// Saffron palette
const WARD_STYLE = {
  color: "#FF9933",
  weight: 0.8,
  opacity: 0.6,
  fillColor: "#FF9933",
  fillOpacity: 0.05,
}
const WARD_HOVER_STYLE = {
  fillOpacity: 0.18,
  weight: 1.5,
}

const LABEL_ZOOM_THRESHOLD = 14

interface Props {
  onPin: (result: PinResult | null, lat: number, lng: number) => void
  resizeKey?: number
  panRef?: MutableRefObject<{ panTo: (lat: number, lng: number) => void } | null>
  /** Increment to refresh report markers after a new submission */
  reportRefresh?: number
  /** City to display — defaults to bengaluru */
  cityId?: string
  /** When true, next tap captures a report location instead of a ward lookup */
  reportPickMode?: boolean
  onReportPin?: (lat: number, lng: number) => void
}

export default function MapView({ onPin, resizeKey = 0, panRef, reportRefresh = 0, reportPickMode = false, onReportPin, cityId }: Props) {
  const city = getCity(cityId)
  const CITY_CENTER: [number, number] = city.center
  const CITY_GEOJSON_URL = city.geojsonUrl
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const geojsonRef = useRef<LeafletGeoJSON | null>(null)
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

  // Expose panTo for geolocation button
  useEffect(() => {
    if (!panRef) return
    panRef.current = {
      panTo: (lat: number, lng: number) => {
        mapRef.current?.setView([lat, lng], 15, { animate: true })
      },
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

      const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
      const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

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
            const isPending   = report.status === "pending"
            const label       = ISSUE_LABELS[report.issue_type] ?? report.issue_type
            const upvotes     = report.upvotes ?? 0
            const alreadyDone = confirmed.includes(report.id)
            const photoHtml   = report.photo_url
              ? `<img src="${report.photo_url}" style="width:100%;height:90px;object-fit:cover;border-radius:6px;margin:6px 0 4px;display:block" />`
              : ""
            const summaryText = report.ai_label || report.description || ""

            if (isPending) {
              // Yellow pulsing marker for unverified reports
              const icon = L.divIcon({
                html: `<div style="
                  width:13px;height:13px;
                  background:#facc15;
                  border:2px solid rgba(255,255,255,0.8);
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
                : `<button id="confirm-${report.id}" style="
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
                    <span style="color:#555;font-size:10px">${relativeTime(report.reported_at)}</span>
                  </div>
                  ${photoHtml}
                  <div style="font-size:12px;font-weight:600;color:#eee;margin-bottom:2px">${label}</div>
                  ${report.ward_name ? `<div style="color:#888;font-size:11px;margin-bottom:3px">${report.ward_name}</div>` : ""}
                  ${summaryText ? `<div style="font-size:11px;color:#aaa;line-height:1.4">${summaryText}</div>` : ""}
                </div>
              `)
              marker.on("popupopen", () => {
                const btn = document.getElementById(`confirm-${report.id}`)
                if (!btn || alreadyDone) return
                btn.onclick = async () => {
                  btn.textContent = "Confirming..."
                  btn.style.opacity = "0.6"
                  try {
                    const res = await fetch("/api/confirm-report", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: report.id }),
                    })
                    const data = await res.json()
                    const newUpvotes = data.upvotes ?? upvotes + 1
                    // Save to localStorage
                    const stored: number[] = JSON.parse(localStorage.getItem("kaun_confirmed") ?? "[]")
                    localStorage.setItem("kaun_confirmed", JSON.stringify([...stored, report.id]))
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
                color: "#FF9933",
                fillColor: "#FF9933",
                fillOpacity: 0.9,
                weight: 2,
              })
              dot.bindPopup(`
                <div style="font-family:sans-serif;width:200px">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                    <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;background:rgba(255,153,51,0.1);border:1px solid rgba(255,153,51,0.3);border-radius:20px">
                      <span style="width:6px;height:6px;background:#FF9933;border-radius:50%;display:inline-block"></span>
                      <span style="color:#FF9933;font-size:10px;font-weight:600;letter-spacing:0.05em">VERIFIED</span>
                    </div>
                    <span style="color:#555;font-size:10px">${relativeTime(report.reported_at)}</span>
                  </div>
                  ${photoHtml}
                  <div style="font-size:12px;font-weight:600;color:#eee;margin-bottom:2px">${label}</div>
                  ${report.ward_name ? `<div style="color:#888;font-size:11px;margin-bottom:3px">${report.ward_name}</div>` : ""}
                  ${report.ai_person ? `<div style="color:#FF9933;font-size:11px;margin-bottom:3px">${report.ai_person}</div>` : ""}
                  ${summaryText ? `<div style="font-size:11px;color:#aaa;line-height:1.4">${summaryText}</div>` : ""}
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

    // Guard against hot-reload leaving a stale Leaflet instance on the DOM node
    const container = containerRef.current as HTMLDivElement & { _leaflet_id?: number }
    if (container._leaflet_id) {
      delete container._leaflet_id
    }

    // Leaflet CSS  must load after mount
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    document.head.appendChild(link)

    import("leaflet").then((L) => {
      const map = L.map(containerRef.current!, {
        center: CITY_CENTER,
        zoom: city.zoom,
        zoomControl: false,
        attributionControl: true,
      })
      mapRef.current = map

      // Move zoom controls to bottom-right so they don't overlap the wordmark
      L.control.zoom({ position: "topright" }).addTo(map)

      // CartoDB dark tiles  free, no API key, dark theme
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(map)

      // Load ward GeoJSON overlay
      fetch(CITY_GEOJSON_URL)
        .then((r) => r.json())
        .then((data) => {
          geojsonRef.current = L.geoJSON(data, {
            style: () => WARD_STYLE,
            onEachFeature(feature, layer) {
              layer.on({
                mouseover(e) {
                  e.target.setStyle(WARD_HOVER_STYLE)
                },
                mouseout() {
                  geojsonRef.current?.resetStyle(layer)
                },
              })
            },
          }).addTo(map)

          // Ward name labels — visible only when zoomed in
          labelLayerRef.current = L.layerGroup()
          for (const feature of data.features) {
            const name = feature.properties?.KGISWardName
            if (!name) continue
            // Calculate centroid from polygon coordinates
            const coords = feature.geometry?.coordinates
            if (!coords) continue
            let ring = coords[0]
            // Handle MultiPolygon
            if (feature.geometry.type === "MultiPolygon") ring = coords[0][0]
            if (!ring || ring.length === 0) continue
            let sumLat = 0, sumLng = 0
            for (const [lng, lat] of ring) { sumLat += lat; sumLng += lng }
            const centroid: [number, number] = [sumLat / ring.length, sumLng / ring.length]

            const label = L.marker(centroid, {
              icon: L.divIcon({
                html: `<span style="
                  font-size:9px;
                  color:rgba(255,255,255,0.45);
                  text-shadow:0 1px 3px rgba(0,0,0,0.8);
                  white-space:nowrap;
                  pointer-events:none;
                  font-family:system-ui,sans-serif;
                  letter-spacing:0.02em;
                ">${name.replace(/ Ward$/i, "")}</span>`,
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
        .catch(() => setLoading(false)) // show map even if GeoJSON fails

      // Custom pin icon
      const pinIcon = L.divIcon({
        html: `<div style="
          width:14px;height:14px;
          background:#FF9933;
          border:2px solid #fff;
          border-radius:50%;
          box-shadow:0 0 0 3px rgba(255,153,51,0.35)
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        className: "",
      })

      let marker: ReturnType<typeof L.marker> | null = null

      map.on("click", async (e) => {
        const { lat, lng } = e.latlng

        // Report pick mode: capture coords and hand off — no ward lookup
        if (reportPickRef.current) {
          onReportPinRef.current?.(lat, lng)
          return
        }

        // Normal mode: ward lookup
        if (marker) {
          marker.setLatLng([lat, lng])
        } else {
          marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map)
        }

        onPinRef.current(null, lat, lng) // signal loading state

        // Route to client-side or PostGIS lookup based on city config
        const result = city.clientSidePinLookup
          ? await clientPinLookup(lat, lng, city)
          : await pinLookup(lat, lng)
        onPinRef.current(result, lat, lng)
      })
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, []) // empty  map initialises once, onPin updates via ref

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
