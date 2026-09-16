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
 * WardFinder — historical boundary reference for older records.
 *
 * Uses the 225→243 crosswalk (bbmp2023_225_to_datameet_243.json) embedded
 * in the wiki/ data layer. Search by name (English or Kannada) or ward
 * number in either scheme. Shows the crosswalk with overlap confidence,
 * AC, population, and a "show on map" action.
 *
 * The live map uses the current GBA-369 boundary. This separate reference is
 * retained only to explain how 2023 BBMP work-order wards relate to the older
 * DataMeet-243 data layer; neither number is presented as a current ward ID.
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

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [open, onClose])

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
    <div className="signal-backdrop fixed inset-0 z-[2000] flex items-end md:items-center justify-center bg-ink/45" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="ward-finder-title">
      <div
        className="signal-panel
          w-full md:w-[520px] max-h-[85vh] bg-paper text-ink border-t-2 border-ink
          md:border md:border-ink/55 flex flex-col overflow-hidden
        "
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-ink/15 shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 id="ward-finder-title" className="text-ink font-semibold text-base">Older-record crosswalk</h2>
              <p className="text-ink/60 text-xs mt-0.5">
                BBMP 2023 (225) ↔ KGIS/DataMeet (243). Current map: GBA 369.
              </p>
            </div>
            <button onClick={onClose} aria-label="Close ward crosswalk" className="text-ink/60 hover:text-ink hover:bg-ink/5 text-xl leading-none w-11 h-11 flex items-center justify-center shrink-0">&times;</button>
          </div>
          <label htmlFor="ward-crosswalk-search" className="sr-only">Search ward name, number, or constituency</label>
          <input
            id="ward-crosswalk-search"
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search ward name, number, or constituency..."
            className="w-full min-h-11 bg-paper-bright border border-ink/25 px-3 py-2 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink/60"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {rows.length === 0 ? (
            <p className="text-ink/60 text-sm text-center py-8">Loading crosswalk data...</p>
          ) : results.length === 0 ? (
            <p className="text-ink/60 text-sm text-center py-8">No matching ward found</p>
          ) : (
            results.map(r => (
              <div
                key={`${r.bbmp225_no}-${r.datameet243_no}`}
                className="px-3 py-2.5 border-b border-ink/10 last:border-b-0 hover:bg-ink/5 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-ink text-xs font-semibold">{r.bbmp225_name_en}</span>
                      {r.bbmp225_name_ka && <span className="text-ink/60 text-[11px]">{r.bbmp225_name_ka}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 font-mono text-[11px]">
                      <span className="text-ink/80">BBMP 225 #{r.bbmp225_no}</span>
                      <span className="text-ink/60">&rarr;</span>
                      <span className="text-ink/70">Historical 243 #{r.datameet243_no} {r.datameet243_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-ink/60">
                      <span>{r.assembly_constituency}</span>
                      <span>Pop {r.population.toLocaleString("en-IN")}</span>
                      <span className={`${r.overlap_confidence > 0.7 ? "text-success" : r.overlap_confidence > 0.4 ? "text-warning" : "text-danger"}`}>
                        {Math.round(r.overlap_confidence * 100)}% overlap
                      </span>
                      {r.tier !== "clean" && <span className="text-warning">{r.tier}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink/15 shrink-0">
          <p className="text-ink/60 text-xs leading-snug">
            Source: BBMP 2023 Final 225-ward KML ↔ DataMeet 243-ward GeoJSON, spatial overlap method.
            Confidence is the area fraction of the 225 ward that falls within the mapped 243 ward.
          </p>
        </div>
      </div>
    </div>
  )
}
