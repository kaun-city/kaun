"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { WARD_CROSSWALK_URL } from "@/lib/constants"

interface CrosswalkRow {
  bbmp225_no: number
  bbmp225_name_en: string
  bbmp225_name_ka: string
  assembly_constituency: string
  population: number
  datameet243_no: number
  datameet243_name: string
  overlap_confidence: number
  tier: string
}

interface Props {
  open: boolean
  onClose: () => void
  onPanTo?: (lat: number, lng: number) => void
}

/**
 * WardFinder — modal that answers "Which new ward am I in?"
 *
 * Uses the 225→243 crosswalk (bbmp2023_225_to_datameet_243.json) embedded
 * in the wiki/ data layer. Search by name (English or Kannada) or ward
 * number in either scheme. Shows the crosswalk with overlap confidence,
 * AC, population, and a "show on map" action.
 *
 * Why this matters: the 243-ward delimitation is what the site uses, but
 * the GBA election (whenever it's announced) will use the 225-ward scheme.
 * Millions of voters will search "which ward am I in now" — this feature
 * answers that before the question goes mainstream.
 */
export function WardFinder({ open, onClose, onPanTo }: Props) {
  const [rows, setRows] = useState<CrosswalkRow[]>([])
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || rows.length > 0) return
    fetch(WARD_CROSSWALK_URL)
      .then(r => r.json())
      .then(data => {
        setRows(
          (data.rows ?? []).map((r: CrosswalkRow) => ({
            bbmp225_no: r.bbmp225_no,
            bbmp225_name_en: r.bbmp225_name_en ?? "",
            bbmp225_name_ka: r.bbmp225_name_ka ?? "",
            assembly_constituency: r.assembly_constituency ?? "",
            population: r.population ?? 0,
            datameet243_no: r.datameet243_no,
            datameet243_name: r.datameet243_name ?? "",
            overlap_confidence: r.overlap_confidence ?? 0,
            tier: r.tier ?? "",
          }))
        )
      })
      .catch(() => {})
  }, [open, rows.length])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const results = useMemo(() => {
    if (!query || query.length < 2) return rows.slice(0, 20)
    const q = query.toLowerCase().trim()
    const numQ = parseInt(q, 10)
    return rows.filter(r =>
      r.bbmp225_name_en.toLowerCase().includes(q) ||
      r.bbmp225_name_ka.includes(q) ||
      r.datameet243_name.toLowerCase().includes(q) ||
      r.assembly_constituency.toLowerCase().includes(q) ||
      (Number.isFinite(numQ) && (r.bbmp225_no === numQ || r.datameet243_no === numQ))
    ).slice(0, 30)
  }, [query, rows])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="
          w-full md:w-[520px] max-h-[85vh] bg-[#111] border border-white/10
          rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden
        "
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-white font-semibold text-base">Find your new ward</h2>
              <p className="text-white/40 text-xs mt-0.5">
                GBA 225 wards ↔ current 243 wards — search by name, number, or constituency
              </p>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white/80 text-xl leading-none w-8 h-8 flex items-center justify-center shrink-0">&times;</button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search ward name, number, or constituency..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#FF9933]/40"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {rows.length === 0 ? (
            <p className="text-white/20 text-sm text-center py-8">Loading crosswalk data...</p>
          ) : results.length === 0 ? (
            <p className="text-white/20 text-sm text-center py-8">No matching ward found</p>
          ) : (
            results.map(r => (
              <div
                key={`${r.bbmp225_no}-${r.datameet243_no}`}
                className="px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white/80 text-xs font-semibold">{r.bbmp225_name_en}</span>
                      {r.bbmp225_name_ka && <span className="text-white/30 text-[10px]">{r.bbmp225_name_ka}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px]">
                      <span className="text-[#FF9933]/70">GBA #{r.bbmp225_no}</span>
                      <span className="text-white/20">&rarr;</span>
                      <span className="text-white/50">Current #{r.datameet243_no} {r.datameet243_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-white/30">
                      <span>{r.assembly_constituency}</span>
                      <span>Pop {r.population.toLocaleString("en-IN")}</span>
                      <span className={`${r.overlap_confidence > 0.7 ? "text-green-400/60" : r.overlap_confidence > 0.4 ? "text-yellow-400/60" : "text-red-400/60"}`}>
                        {Math.round(r.overlap_confidence * 100)}% overlap
                      </span>
                      {r.tier !== "clean" && <span className="text-yellow-400/50">{r.tier}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 shrink-0">
          <p className="text-white/15 text-[10px] leading-snug">
            Source: BBMP 2023 Final 225-ward KML ↔ DataMeet 243-ward GeoJSON, spatial overlap method.
            Confidence is the area fraction of the GBA ward that falls within the mapped current ward.
          </p>
        </div>
      </div>
    </div>
  )
}
