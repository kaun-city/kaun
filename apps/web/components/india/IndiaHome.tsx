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
import { useEffect, useMemo, useRef, useState } from "react"
import { quantileBreaks, formatValue } from "@/lib/map-layers"
import { INDIA_LAYERS, getIndiaLayer, rampFor, type IndiaLayerId } from "@/lib/india/layers"
import { fetchIndiaLayerValues } from "@/lib/india/api"
import { indiaHref } from "@/lib/host-routing"
import { LOK_SABHA_SEATS } from "@/lib/india/constants"
import { NO_DATA_FILL } from "@/lib/india/viz"
import { IndiaHeader } from "./IndiaHeader"
import type { PcFeatureProps } from "./IndiaMapView"

const IndiaMapView = dynamic(() => import("./IndiaMapView"), { ssr: false })

interface MpLite { pc_code: string; name: string; party_abbr: string | null; is_minister: boolean }

export default function IndiaHome({ mps, host = "" }: { mps: MpLite[]; host?: string }) {
  const [features, setFeatures] = useState<PcFeatureProps[]>([])
  const [selected, setSelected] = useState<PcFeatureProps | null>(null)
  const [stateFilter, setStateFilter] = useState<number | null>(null)
  const [layerId, setLayerId] = useState<IndiaLayerId | null>(null)
  const [values, setValues] = useState<Record<string, number> | null>(null)
  const [layerLoading, setLayerLoading] = useState(false)
  const [q, setQ] = useState("")
  const focusRef = useRef<{ focus: (pcCode: string) => void } | null>(null)

  const layer = getIndiaLayer(layerId)
  const mpBySeat = useMemo(() => new Map(mps.map(m => [m.pc_code, m])), [mps])

  useEffect(() => {
    if (!layerId) { setValues(null); return }
    let cancelled = false
    setLayerLoading(true)
    fetchIndiaLayerValues(layerId)
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
        <IndiaHeader variant="overlay" host={host} />

        {/* Search — seat name, seat code, or MP name. Phones stack it above the
            state filter (below the wrapped two-line header) and keep clear of
            the zoom control pinned to the right edge; sm+ puts them side by
            side. z sits above the filter so the results list can drop over it. */}
        <div className="absolute top-[4.5rem] sm:top-16 left-4 right-14 z-[910] sm:right-auto sm:w-[min(22rem,calc(100vw-2rem))]">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search a constituency or MP…"
            className="w-full bg-black/80 backdrop-blur-xl border border-white/15 rounded-lg px-3 py-2
              text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#FF9933]/40"
          />
          {results.length > 0 && (
            <div className="mt-1 bg-[#111] border border-white/10 rounded-lg overflow-hidden shadow-xl max-h-72 overflow-y-auto">
              {results.map(f => {
                const mp = mpBySeat.get(f.pc_code)
                return (
                  <button
                    key={f.pc_code}
                    onMouseDown={() => {
                      setQ("")
                      setSelected(f)
                      setStateFilter(f.st_code)
                      focusRef.current?.focus(f.pc_code)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors"
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
        <div className="absolute top-[7.5rem] right-14 z-[900] sm:top-16 sm:right-4">
          <select
            value={stateFilter ?? ""}
            onChange={e => setStateFilter(e.target.value === "" ? null : Number(e.target.value))}
            className="bg-black/80 backdrop-blur-xl border border-white/15 rounded-lg px-2.5 py-2
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
        />

        {/* Layer switcher + legend */}
        <div className="absolute bottom-4 left-4 z-[900] w-[min(20rem,calc(100vw-2rem))]
          bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-3">
          <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Paint the map</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setLayerId(null)}
              className={`text-[11px] px-2 py-1 rounded border transition-colors ${
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
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
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
          <div className="absolute bottom-4 right-4 z-[950] w-[min(20rem,calc(100vw-2rem))]
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
            <a
              href={indiaHref(`/c/${selected.pc_code}`)}
              className="mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                bg-[#FF9933] hover:bg-[#FF9933]/90 active:scale-95 text-black font-semibold text-sm
                transition-all duration-150"
            >
              Open constituency page &rarr;
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
