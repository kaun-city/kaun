"use client"

/**
 * MapView  full-screen Leaflet map with Bengaluru ward overlay.
 *
 * Loaded dynamically (no SSR) because Leaflet requires `window`.
 * See: app/page.tsx -> `dynamic(() => import('./MapView'), { ssr: false })`
 */

import { useEffect, useRef, useState } from "react"
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
  /** Increment to trigger Leaflet invalidateSize() after a layout shift (e.g. sidebar open) */
  resizeKey?: number
}

export default function MapView({ onPin, resizeKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const geojsonRef = useRef<LeafletGeoJSON | null>(null)
  const onPinRef = useRef(onPin)
  const [loading, setLoading] = useState(true)

  // Keep the ref current without re-running map setup
  useEffect(() => { onPinRef.current = onPin }, [onPin])

  // Re-fit map when sidebar open/closes (layout shift changes container width)
  useEffect(() => {
    if (!mapRef.current) return
    // Small delay so CSS transition has finished before we measure
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 320)
    return () => clearTimeout(t)
  }, [resizeKey])

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
