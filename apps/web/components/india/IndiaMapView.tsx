"use client"

/**
 * IndiaMapView — the 543-seat national map.
 *
 * Deliberately the same shape as components/MapView.tsx: dynamically imported
 * with ssr:false because Leaflet needs `window`, no-key OSM basemap, CSS
 * injected after mount, a styleFeature that reads a ref so Leaflet's
 * resetStyle stays valid across layer changes. Anyone who has read the ward
 * map can read this.
 *
 * The differences are the ones the data forces:
 *   - features are keyed by pc_code (string), not a ward number
 *   - clicking a seat NAVIGATES to its constituency page rather than opening a
 *     drawer. The seat page is the canonical object; the map is one way in.
 *   - a state filter, because 543 seats do not fit on one screen legibly
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react"
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON, PathOptions } from "leaflet"
import type { Feature } from "geojson"
import { BASE_TILE_OPTIONS, BASE_TILE_URL } from "@/lib/base-map"
import { colorFor } from "@/lib/map-layers"
import { INDIA_CENTER, INDIA_MAX_ZOOM, INDIA_MIN_ZOOM, INDIA_ZOOM, PC_GEOJSON_URL } from "@/lib/india/constants"
import { NO_DATA_FILL, NO_DATA_STROKE } from "@/lib/india/viz"
import { rampFor, type IndiaLayerMeta } from "@/lib/india/layers"
import type { MapView } from "@/lib/india/map-view-store"

export interface PcFeatureProps {
  pc_code: string
  st_code: number
  pc_no: number
  state_name: string
  pc_name: string
  pc_name_norm: string
  geom_source: string
  /** Representative point [lng, lat], precomputed by the builder. */
  c: [number, number] | null
}

/** Flat style when no layer is active — the ward map's saffron outline. */
const SEAT_STYLE: PathOptions = {
  color: "#FF9933",
  weight: 0.5,
  opacity: 0.55,
  fillColor: "#FF9933",
  fillOpacity: 0.06,
}
const SEAT_HOVER_STYLE: PathOptions = { fillOpacity: 0.22, weight: 1.4 }
const DIMMED_STYLE: PathOptions = {
  color: "#333", weight: 0.4, opacity: 0.3, fillColor: "#1a1a1a", fillOpacity: 0.25,
}

interface Props {
  /** Per-seat values keyed by pc_code. A seat absent here has NO value. */
  values: Record<string, number> | null
  breaks: number[]
  layer: IndiaLayerMeta | null
  /** st_code to zoom to and isolate, or null for all of India. */
  stateFilter: number | null
  onSelect: (pc: PcFeatureProps) => void
  /** Set by the parent so the search box can fly to a seat. */
  focusRef?: MutableRefObject<{ focus: (pcCode: string) => void } | null>
  onFeaturesLoaded?: (features: PcFeatureProps[]) => void
  /**
   * Where to open the map, when the visitor has been here before in this tab.
   * Read once, at map construction; changing it later does nothing.
   */
  initialView?: MapView | null
  /** Fired after every pan and zoom, so the parent can remember the viewport. */
  onViewChange?: (view: MapView) => void
}

export default function IndiaMapView({
  values, breaks, layer, stateFilter, onSelect, focusRef, onFeaturesLoaded,
  initialView = null, onViewChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const geojsonRef = useRef<LeafletGeoJSON | null>(null)
  const valuesRef = useRef(values)
  const breaksRef = useRef(breaks)
  const layerRef = useRef(layer)
  const filterRef = useRef(stateFilter)
  const onSelectRef = useRef(onSelect)
  const onViewChangeRef = useRef(onViewChange)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const [loading, setLoading] = useState(true)

  /**
   * A restored viewport is the visitor's own last view, and it must survive the
   * one automatic fit that would otherwise run over it: the state-filter effect
   * fires as soon as the boundaries land, and a restored filter would make it
   * re-fit the whole state, throwing away exactly the pan and zoom we came back
   * for. So the first effective run of that effect is skipped — once — when the
   * map opened on a restored view. Every later filter change fits normally.
   */
  const restoredViewRef = useRef(initialView !== null)
  const initialViewRef = useRef(initialView)

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onViewChangeRef.current = onViewChange }, [onViewChange])

  function propsOf(feature?: Feature): PcFeatureProps | null {
    return (feature?.properties as PcFeatureProps | undefined) ?? null
  }

  function styleFeature(feature?: Feature): PathOptions {
    const p = propsOf(feature)
    if (!p) return SEAT_STYLE
    if (filterRef.current !== null && p.st_code !== filterRef.current) return DIMMED_STYLE

    const activeLayer = layerRef.current
    if (!activeLayer || !valuesRef.current) return SEAT_STYLE

    const value = valuesRef.current[p.pc_code]
    if (value === undefined) {
      // No value is a fact, not a zero. Grey, and the legend explains why a
      // seat can legitimately be grey for this particular layer.
      return { color: NO_DATA_STROKE, weight: 0.4, opacity: 0.3, fillColor: NO_DATA_FILL, fillOpacity: 0.18 }
    }
    return {
      color: "#0A0A0A",
      weight: 0.4,
      opacity: 0.85,
      fillColor: colorFor(value, breaksRef.current, rampFor(activeLayer)),
      fillOpacity: 0.62,
    }
  }

  // Repaint when the layer, its values or the state filter change.
  useEffect(() => {
    valuesRef.current = values
    breaksRef.current = breaks
    layerRef.current = layer
    filterRef.current = stateFilter
    geojsonRef.current?.setStyle(styleFeature)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, breaks, layer, stateFilter, loading])

  // Zoom to the filtered state, or back out to the whole country.
  useEffect(() => {
    const map = mapRef.current
    const gj = geojsonRef.current
    if (!map || !gj) return
    if (restoredViewRef.current) { restoredViewRef.current = false; return }
    if (stateFilter === null) {
      map.setView(INDIA_CENTER, INDIA_ZOOM, { animate: true })
      return
    }
    let bounds: ReturnType<LeafletGeoJSON["getBounds"]> | null = null
    gj.eachLayer((l) => {
      const p = propsOf((l as unknown as { feature?: Feature }).feature)
      if (!p || p.st_code !== stateFilter) return
      const b = (l as unknown as { getBounds: () => ReturnType<LeafletGeoJSON["getBounds"]> }).getBounds()
      bounds = bounds ? bounds.extend(b) : b
    })
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], animate: true })
  }, [stateFilter, loading])

  // Let the search box fly to a seat and select it.
  useEffect(() => {
    if (!focusRef) return
    focusRef.current = {
      focus: (pcCode: string) => {
        const gj = geojsonRef.current
        const map = mapRef.current
        if (!gj || !map) return
        gj.eachLayer((l) => {
          const p = propsOf((l as unknown as { feature?: Feature }).feature)
          if (p?.pc_code !== pcCode) return
          const b = (l as unknown as { getBounds: () => ReturnType<LeafletGeoJSON["getBounds"]> }).getBounds()
          map.fitBounds(b, { padding: [60, 60], animate: true })
        })
      },
    }
  }, [focusRef])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // The map is built inside an async import, so this effect can be cleaned
    // up before the map exists — StrictMode does exactly that in development.
    // Each run gets its own flag; a cancelled run must never touch the
    // container, or two maps end up initialized on the same node.
    let cancelled = false

    const cssHref = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = cssHref
      document.head.appendChild(link)
    }

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const restored = initialViewRef.current
      const map = L.map(containerRef.current!, {
        // Coming back from a seat page: open where the visitor left off rather
        // than snapping to the whole country and making them find it again.
        center: restored ? restored.center : INDIA_CENTER,
        zoom: restored ? restored.zoom : INDIA_ZOOM,
        minZoom: INDIA_MIN_ZOOM,
        maxZoom: INDIA_MAX_ZOOM,
        // India needs a fractional default zoom to fit Kashmir and Kanyakumari
        // on one laptop screen. Leaflet only honours fractional zoom when
        // zoomSnap is loosened; left at its default of 1 it rounds, and the
        // country either overflows or sits tiny in the middle.
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        zoomControl: false,
        attributionControl: true,
      })
      mapRef.current = map

      // The map mounts inside a flex column that is still settling, so Leaflet
      // can measure a container that has not reached its final height and then
      // request tiles for the wrong viewport. Re-measure once after paint, and
      // again whenever the window changes size.
      const remeasure = () => map.invalidateSize()
      const t = setTimeout(remeasure, 60)
      window.addEventListener("resize", remeasure)

      // Report the viewport after it settles, never during the gesture — this
      // writes to sessionStorage and Leaflet fires `move` on every frame.
      const reportView = () => {
        const c = map.getCenter()
        onViewChangeRef.current?.({ center: [c.lat, c.lng], zoom: map.getZoom() })
      }
      map.on("moveend", reportView)
      map.on("zoomend", reportView)

      resizeCleanupRef.current = () => {
        clearTimeout(t)
        window.removeEventListener("resize", remeasure)
        map.off("moveend", reportView)
        map.off("zoomend", reportView)
      }
      L.control.zoom({ position: "topright" }).addTo(map)

      L.tileLayer(BASE_TILE_URL, {
        ...BASE_TILE_OPTIONS,
        attribution: `${BASE_TILE_OPTIONS.attribution} · boundaries: DataMeet + shijithpk`,
      }).addTo(map)

      fetch(PC_GEOJSON_URL)
        .then(r => r.json())
        .then((data) => {
          if (cancelled) return
          geojsonRef.current = L.geoJSON(data, {
            style: styleFeature,
            onEachFeature(feature, lyr) {
              const p = propsOf(feature)
              if (!p) return
              lyr.bindTooltip(p.pc_name, { sticky: true, direction: "top", className: "kaun-pc-tooltip" })
              lyr.on({
                mouseover(e) {
                  if (filterRef.current !== null && p.st_code !== filterRef.current) return
                  e.target.setStyle(layerRef.current ? { weight: 1.4, fillOpacity: 0.8 } : SEAT_HOVER_STYLE)
                },
                mouseout() { geojsonRef.current?.resetStyle(lyr) },
                click() { onSelectRef.current(p) },
              })
            },
          }).addTo(map)

          onFeaturesLoaded?.(
            (data.features as Array<{ properties: PcFeatureProps }>).map(f => f.properties))
          setLoading(false)
        })
        .catch(() => setLoading(false)) // show the basemap even if boundaries fail

    })

    return () => {
      cancelled = true
      resizeCleanupRef.current?.()
      resizeCleanupRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      geojsonRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-[#FF9933] text-sm tracking-widest uppercase">
          Loading 543 constituencies...
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" style={{ background: "#0A0A0A" }} />
    </div>
  )
}
