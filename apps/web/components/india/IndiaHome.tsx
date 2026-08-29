"use client"

/**
 * The national map page.
 *
 * The map is an ENTRY POINT, not the home of anything: clicking a seat opens a
 * small preview and the preview's only job is to hand off to that seat's own
 * page, which is the canonical object with a stable URL. Nothing here is the
 * last place a fact lives.
 */

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { quantileBreaks, formatValue } from "@/lib/map-layers"
import { INDIA_LAYERS, getIndiaLayer, rampFor, type IndiaLayerId } from "@/lib/india/layers"
import { fetchIndiaLayerValues } from "@/lib/india/api"
import { decodeMapState, encodeMapState } from "@/lib/india/map-url-state"
import { markMapSeen, readMapView, saveMapView, type MapView } from "@/lib/india/map-view-store"
import { indiaHref } from "@/lib/host-routing"
import { LOK_SABHA_SEATS } from "@/lib/india/constants"
import { NO_DATA_FILL } from "@/lib/india/viz"
import { IndiaHeader } from "./IndiaHeader"
import type { PcFeatureProps } from "./IndiaMapView"

const IndiaMapView = dynamic(() => import("./IndiaMapView"), { ssr: false })

interface MpLite { pc_code: string; name: string; party_abbr: string | null; is_minister: boolean }

/**
 * Per-tab memo of the choropleth values, keyed by layer.
 *
 * Painting a layer reads every affidavit, or every MPLADS summary, or the
 * whole roster joined to activity — one to two full-table reads each. Toggling
 * between two layers to compare them is the obvious thing to do with this
 * control, and without this it re-ran those reads every time, so the second
 * look at a layer was as slow as the first and the map went grey in between.
 *
 * Promises are cached, not results, so a fast double-click on the same layer
 * makes one request rather than two racing ones. Module scope means it lives
 * as long as the tab: this file is "use client", so nothing here is shared
 * between visitors, and a page reload — the only way this data can have
 * changed under a visitor — clears it. A failed fetch is evicted so the next
 * click retries rather than caching the error.
 */
const layerValues = new Map<IndiaLayerId, Promise<Record<string, number>>>()

function layerValuesFor(layerId: IndiaLayerId): Promise<Record<string, number>> {
  const hit = layerValues.get(layerId)
  if (hit) return hit
  const p = fetchIndiaLayerValues(layerId)
  p.catch(() => layerValues.delete(layerId))
  layerValues.set(layerId, p)
  return p
}

export default function IndiaHome({ mps }: { mps: MpLite[] }) {
  const [features, setFeatures] = useState<PcFeatureProps[]>([])
  const [selected, setSelected] = useState<PcFeatureProps | null>(null)
  const [stateFilter, setStateFilter] = useState<number | null>(null)
  const [layerId, setLayerId] = useState<IndiaLayerId | null>(null)
  const [values, setValues] = useState<Record<string, number> | null>(null)
  const [layerLoading, setLayerLoading] = useState(false)
  const [q, setQ] = useState("")
  const focusRef = useRef<{ focus: (pcCode: string) => void } | null>(null)

  /**
   * A seat named by the URL that has not been matched to a polygon yet.
   *
   * The selection is a whole feature — state name, seat number, centroid — and
   * those only exist once the 1.4 MB boundary file has landed. So restoring
   * ?seat= is two steps: hold the code here on mount, resolve it the moment the
   * features arrive.
   */
  const [pendingSeat, setPendingSeat] = useState<string | null>(null)

  /**
   * The tab's last viewport, read during the first render because
   * IndiaMapView builds its Leaflet instance in its own mount effect — which
   * runs BEFORE any effect here, children first. Reading it in an effect would
   * always be one beat too late. Safe to do during render only because the map
   * is ssr:false, so this value never reaches server HTML and cannot desync
   * hydration.
   */
  const [initialView] = useState<MapView | null>(() => readMapView())

  const layer = getIndiaLayer(layerId)
  const mpBySeat = useMemo(() => new Map(mps.map(m => [m.pc_code, m])), [mps])

  /**
   * Restore whatever the URL carries — a shared view, or the entry we wrote
   * before handing off to a seat page and have just come back to.
   *
   * In an effect rather than in useState initialisers: this page is prerendered
   * under ISR with no query string, so seeding state from the URL during render
   * would make the client's first render disagree with the server's HTML on the
   * layer buttons and the state <select>. One extra render is cheaper than a
   * hydration mismatch, and it is invisible behind the boundary download.
   *
   * The same pass marks the map as seen for this tab, which is what the seat
   * page's back control reads to decide between history.back() and a real
   * navigation. See lib/india/map-view-store.ts.
   */
  useEffect(() => {
    markMapSeen()
    const url = decodeMapState(window.location.search)
    if (url.layer) setLayerId(url.layer)
    if (url.stateFilter !== null) setStateFilter(url.stateFilter)
    if (url.seat) setPendingSeat(url.seat)
  }, [])

  // Resolve ?seat= once the polygons exist.
  useEffect(() => {
    if (!pendingSeat || features.length === 0) return
    const feature = features.find(f => f.pc_code === pendingSeat)
    setPendingSeat(null)
    if (!feature) return
    setSelected(feature)
    // Only fly to it when there is no viewport to honour. With one, the
    // visitor is already looking at the seat they left from, and re-fitting
    // would undo the very thing we restored.
    if (!initialView) focusRef.current?.focus(feature.pc_code)
  }, [pendingSeat, features, initialView])

  /**
   * Mirror the map's state into the address bar.
   *
   * replaceState, never push: this fires on every layer toggle and every seat
   * click, and pushing would bury the page the visitor actually came from under
   * a dozen entries, so their back button would stop working as a back button.
   * Replacing means the single history entry for the map always describes the
   * map as it is now — which is the whole trick that makes the round trip to a
   * seat page and back restore anything at all.
   *
   * The first run is skipped because the restore effect above has not been
   * applied yet at that point: writing then would encode the empty default
   * state straight over the parameters we were about to read.
   *
   * Next patches history.replaceState and copies its own router internals
   * across, so this is shallow routing, not a fight with the router.
   */
  const firstUrlWrite = useRef(true)
  useEffect(() => {
    if (firstUrlWrite.current) { firstUrlWrite.current = false; return }
    const search = encodeMapState(
      { seat: selected?.pc_code ?? null, layer: layerId, stateFilter },
      window.location.search,
    )
    const next = `${window.location.pathname}${search}${window.location.hash}`
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== current) window.history.replaceState(null, "", next)
  }, [selected?.pc_code, layerId, stateFilter])

  const rememberView = useCallback((view: MapView) => saveMapView(view), [])

  useEffect(() => {
    if (!layerId) { setValues(null); return }
    let cancelled = false
    setLayerLoading(true)
    layerValuesFor(layerId)
      .then(v => { if (!cancelled) { setValues(v); setLayerLoading(false) } })
      .catch(() => { if (!cancelled) { setValues({}); setLayerLoading(false) } })
    return () => { cancelled = true }
  }, [layerId])

  const breaks = useMemo(
    () => (values ? quantileBreaks(Object.values(values)) : []),
    [values])

  const states = useMemo(() => {
    const m = new Map<number, { st_code: number; name: string; seats: number }>()
    for (const f of features) {
      const cur = m.get(f.st_code)
      if (cur) cur.seats++
      else m.set(f.st_code, { st_code: f.st_code, name: f.state_name, seats: 1 })
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [features])

  /** Search matches seat name, seat code, or the sitting MP's name. */
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    return features.filter(f => {
      if (f.pc_name.toLowerCase().includes(needle)) return true
      if (f.pc_code === needle) return true
      const mp = mpBySeat.get(f.pc_code)
      return !!mp && mp.name.toLowerCase().includes(needle)
    }).slice(0, 8)
  }, [q, features, mpBySeat])

  const painted = values ? Object.keys(values).length : 0
  const legendNums = values ? Object.values(values) : []

  return (
    <main className="flex flex-col h-full bg-[#0A0A0A] overflow-hidden">
      <div className="relative flex-1 min-h-0">
        <IndiaHeader variant="overlay" />

        {/* Search — seat name, seat code, or MP name. Phones stack it above the
            state filter below the wrapped header; sm+ puts them side by side.
            z sits above the filter so the results list can drop over it. */}
        <div className="absolute top-[4.5rem] sm:top-16 left-4 right-4 z-[910] sm:right-auto sm:w-[min(22rem,calc(100vw-2rem))]">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search a constituency or MP…"
            className="w-full min-h-11 bg-black/80 backdrop-blur-xl border border-white/15 rounded-lg px-3 py-2
              text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#FF9933]/40"
          />
          {results.length > 0 && (
            <div className="mt-1 bg-[#111] border border-white/10 rounded-lg overflow-hidden shadow-xl max-h-72 overflow-y-auto">
              {results.map(f => {
                const mp = mpBySeat.get(f.pc_code)
                return (
                  <button
                    key={f.pc_code}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => {
                      e.stopPropagation()
                      setQ("")
                      setSelected(f)
                      setStateFilter(f.st_code)
                      focusRef.current?.focus(f.pc_code)
                    }}
                    className="w-full min-h-11 text-left px-3 py-2 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/85 text-xs">{f.pc_name}</span>
                      <span className="text-white/20 text-[10px] font-mono">{f.pc_code}</span>
                    </div>
                    <div className="text-white/30 text-[10px] mt-0.5">
                      {f.state_name}{mp ? ` · ${mp.name}` : ""}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* State filter — below the search on phones, beside it from sm up */}
        <div className="absolute top-[7.5rem] right-4 z-[900] sm:top-16 sm:right-4">
          <select
            value={stateFilter ?? ""}
            onChange={e => setStateFilter(e.target.value === "" ? null : Number(e.target.value))}
            aria-label="Filter constituencies by state"
            className="min-h-11 bg-black/80 backdrop-blur-xl border border-white/15 rounded-lg px-2.5 py-2
              text-xs text-white/80 focus:outline-none focus:border-[#FF9933]/40 max-w-[13rem]"
          >
            <option value="">All India · {features.length || LOK_SABHA_SEATS} seats</option>
            {states.map(s => (
              <option key={s.st_code} value={s.st_code}>{s.name} · {s.seats}</option>
            ))}
          </select>
        </div>

        <IndiaMapView
          values={values}
          breaks={breaks}
          layer={layer}
          stateFilter={stateFilter}
          onSelect={setSelected}
          focusRef={focusRef}
          onFeaturesLoaded={setFeatures}
          initialView={initialView}
          onViewChange={rememberView}
        />

        {/* Bottom rail — the layer panel and the seat preview.
            Below md they are a single bottom-anchored column, preview above the
            legend, because both panels are as wide as the viewport allows: put
            side by side they landed on top of each other and the preview (z-950)
            hid the legend — the colour ramp, the range, and the "no value for N
            of 543 seats" line — which is the honest part of a choropleth.
            The rail is pointer-events-none and only as tall as its content, so
            the map underneath still pans; the panels re-enable pointers.
            `pb-11` clears Leaflet's attribution bar, which is two lines tall at
            phone widths and sits at z-1000, above both panels.
            From md up the rail stops generating a box (`md:contents`) and each
            panel returns to its own corner, unchanged. md, not sm: at 640 two
            20rem panels still overlap by 2rem. */}
        <div className="absolute inset-x-0 bottom-0 z-[900] flex flex-col-reverse gap-2 p-4 pb-11
          pointer-events-none md:contents">

          {/* Layer switcher + legend */}
          <div className="pointer-events-auto w-full
            md:absolute md:bottom-4 md:left-4 md:z-[900] md:w-[min(20rem,calc(100vw-2rem))]
            bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-3">
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Color by</p>
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-1.5">
              <button
                onClick={() => setLayerId(null)}
                className={`min-h-11 md:min-h-0 text-[11px] px-2 py-1 rounded border transition-colors ${
                  layerId === null
                    ? "border-[#FF9933]/50 text-[#FF9933] bg-[#FF9933]/10"
                    : "border-white/10 text-white/40 hover:text-white/70"}`}
              >
                None
              </button>
              {INDIA_LAYERS.map(l => (
                <button
                  key={l.id}
                  onClick={() => setLayerId(l.id)}
                  className={`min-h-11 md:min-h-0 text-[11px] px-2 py-1 rounded border transition-colors ${
                    layerId === l.id
                      ? "border-[#FF9933]/50 text-[#FF9933] bg-[#FF9933]/10"
                      : "border-white/10 text-white/40 hover:text-white/70"}`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {layer && (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-white/40 text-[11px] leading-snug">{layer.description}</p>
                <div className="flex items-center gap-1">
                  {rampFor(layer).map((c, i) => (
                    <span key={i} className="h-2 flex-1 rounded-sm" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex items-center justify-between text-white/25 text-[10px]">
                  <span>{legendNums.length ? formatValue(Math.min(...legendNums), layer.format) : "—"}</span>
                  <span>{legendNums.length ? formatValue(Math.max(...legendNums), layer.format) : "—"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/25 text-[10px]">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: NO_DATA_FILL }} />
                  <span>
                    {layerLoading
                      ? "loading…"
                      : `no value for ${(features.length || LOK_SABHA_SEATS) - painted} of ${features.length || LOK_SABHA_SEATS} seats`}
                  </span>
                </div>
                {layer.absentNote && (
                  <p className="text-white/20 text-[10px] leading-snug">{layer.absentNote}</p>
                )}
                <p className="text-white/15 text-[10px]">Source: {layer.source}</p>
              </div>
            )}
          </div>

          {/* Seat preview — a doorway to the seat's own page, never a substitute */}
          {selected && (
            <div className="pointer-events-auto w-full
              md:absolute md:bottom-4 md:right-4 md:z-[950] md:w-[min(20rem,calc(100vw-2rem))]
              bg-[#111] border border-white/10 rounded-xl p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white/30 text-[10px] uppercase tracking-widest">
                    {selected.state_name} · seat {selected.pc_no}
                  </p>
                  <p className="text-white font-semibold text-base mt-0.5">{selected.pc_name}</p>
                  {(() => {
                    const mp = mpBySeat.get(selected.pc_code)
                    if (!mp) {
                      return <p className="text-white/30 text-xs mt-1">No sitting MP on record for this seat.</p>
                    }
                    return (
                      <p className="text-white/50 text-xs mt-1">
                        {mp.name}{mp.party_abbr ? ` · ${mp.party_abbr}` : ""}
                      </p>
                    )
                  })()}
                  {layer && (
                    <p className="text-white/40 text-xs mt-1.5">
                      {layer.label}:{" "}
                      {values && values[selected.pc_code] !== undefined
                        ? <span className="text-white/80">{formatValue(values[selected.pc_code], layer.format)}</span>
                        : <span className="text-white/25 italic">no value recorded</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-white/30 hover:text-white/70 text-lg leading-none w-7 h-7 flex items-center justify-center shrink-0"
                  aria-label="Close"
                >&times;</button>
              </div>
              {/* next/link, not an anchor: the seat page is this same app on
                  this same host in both cutover modes (indiaHref returns a path,
                  never a URL), and it is prerendered — so hovering this button
                  prefetches the whole page and the click is a paint. This is the
                  map's one job; it should not feel like leaving. */}
              <Link
                href={indiaHref(`/c/${selected.pc_code}`)}
                className="mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                  bg-[#FF9933] hover:bg-[#FF9933]/90 active:scale-95 text-black font-semibold text-sm
                  transition-all duration-150"
              >
                Open constituency page &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
