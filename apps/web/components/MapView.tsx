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
import { bengaluru } from "@/lib/cities"

// Default to Bengaluru; future: accept city prop when multi-city map is needed
const DEFAULT_CITY = bengaluru
const BENGALURU_CENTER: [number, number] = DEFAULT_CITY.center
const BENGALURU_GEOJSON_URL = DEFAULT_CITY.geojsonUrl

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

interface Props {
  onPin: (result: PinResult | null, lat: number, lng: number) => void
  resizeKey?: number
  panRef?: MutableRefObject<{ panTo: (lat: number, lng: number) => void } | null>
  /** Increment to refresh report markers after a new submission */
  reportRefresh?: number
}

export default function MapView({ onPin, resizeKey = 0, panRef, reportRefresh = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const geojsonRef = useRef<LeafletGeoJSON | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportLayerRef = useRef<any>(null)
  const onPinRef = useRef(onPin)
  const [loading, setLoading] = useState(true)

  // Keep the ref current without re-running map setup
  useEffect(() => { onPinRef.current = onPin }, [onPin])

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

  // Refresh report markers on mount + whenever a new report is submitted
  useEffect(() => {
    if (!mapRef.current || loading) return
    import("leaflet").then((L) => {
      // Clear old report markers
      if (reportLayerRef.current) {
        reportLayerRef.current.clearLayers()
      } else {
        reportLayerRef.current = L.layerGroup().addTo(mapRef.current!)
      }

      const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
      const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

      fetch(`${SUPABASE_URL}/rest/v1/ward_reports?status=eq.approved&select=id,lat,lng,issue_type,description,ward_name,ai_person,reported_at&order=reported_at.desc&limit=200`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
      })
        .then(r => r.json())
        .then((reports: Array<{ id: number; lat: number; lng: number; issue_type: string; description: string; ward_name: string; ai_person: string; reported_at: string }>) => {
          reports.forEach((report) => {
            const dot = L.circleMarker([report.lat, report.lng], {
              radius: 6,
              color: "#FF9933",
              fillColor: "#FF9933",
              fillOpacity: 0.9,
              weight: 2,
            })
            const label = report.issue_type.charAt(0).toUpperCase() + report.issue_type.slice(1)
            dot.bindPopup(`
              <div style="font-family:sans-serif;min-width:160px">
                <strong style="color:#FF9933">${label}</strong>
                ${report.ward_name ? `<br><span style="color:#888;font-size:12px">${report.ward_name}</span>` : ""}
                ${report.ai_person ? `<br><span style="color:#fff;font-size:12px">${report.ai_person}</span>` : ""}
                ${report.description ? `<br><span style="font-size:12px;color:#aaa">${report.description}</span>` : ""}
              </div>
            `)
            reportLayerRef.current.addLayer(dot)
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
        center: BENGALURU_CENTER,
        zoom: 12,
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
      fetch(BENGALURU_GEOJSON_URL)
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

        // Move or place marker
        if (marker) {
          marker.setLatLng([lat, lng])
        } else {
          marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map)
        }

        onPinRef.current(null, lat, lng) // signal loading state

        const result = await pinLookup(lat, lng)
        onPinRef.current(result, lat, lng)
      })
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, []) // empty  map initialises once, onPin updates via ref

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-[#FF9933] text-sm tracking-widest uppercase">
          Loading ward boundaries...
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
