"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { GBA_CROSSWALK_URL, WARD_CROSSWALK_URL } from "@/lib/constants"
import { MATERIAL_OVERLAP, type GbaCrosswalkRow } from "@/lib/gba-crosswalk"

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
  shares: Array<{ datameet243_no: number; share: number }>
}

/** A current GBA ward as HomePage's search knows it (for corporation names). */
export interface CurrentWardLabel {
  corporation_id?: number
  corporation?: string
  ward_no: number
  ward_name: string
}

export const OLD_WARD_NUMBERS_LABEL = "Old ward numbers"

interface Props {
  open: boolean
  onClose: () => void
  onPanTo?: (lat: number, lng: number) => void
  /** Open a current GBA ward on the map (corporation-qualified identity). */
  onSelectCurrentWard?: (corporationId: number, wardNo: number) => void
  /** Current wards with corporation names, when HomePage has them loaded. */
  currentWards?: readonly CurrentWardLabel[]
}

export interface CoveringWard {
  corporation_id: number
  ward_no: number
  ward_name: string
  /** Fraction of the former 243-map ward that lies in this current ward. */
  share: number
}

/**
 * Current GBA wards that hold part of a former 243-map ward, largest part
 * first. Parts under `minShare` of the former ward fold into `smaller`; the
 * largest part always shows so no former ward reads as nowhere.
 */
export function coveringCurrentWards(
  legacyWardNo: number,
  rows: ReadonlyArray<{
    corporation_id: number
    ward_no: number
    ward_name: string
    historical_wards: ReadonlyArray<{ ward_no: number; legacy_share: number }>
  }>,
  minShare: number,
  limit = 4,
): { wards: CoveringWard[]; smaller: number } {
  const parts: CoveringWard[] = []
  for (const row of rows) {
    const ref = row.historical_wards.find(candidate => candidate.ward_no === legacyWardNo)
    if (ref && ref.legacy_share > 0) {
      parts.push({ corporation_id: row.corporation_id, ward_no: row.ward_no, ward_name: row.ward_name, share: ref.legacy_share })
    }
  }
  parts.sort((a, b) => b.share - a.share)
  const wards = parts.filter((part, index) => index === 0 || part.share >= minShare).slice(0, limit)
  return { wards, smaller: parts.length - wards.length }
}

/**
 * The 243-map wards a 225-map ward materially overlaps, largest first (the
 * primary match always included). Same material-overlap rule as the records.
 */
export function overlappedOldWards(
  row: { datameet243_no: number; overlap_confidence: number; shares?: ReadonlyArray<{ datameet243_no: number; share: number }> },
  minShare: number,
  limit = 2,
): Array<{ ward_no: number; share: number }> {
  const shares = row.shares?.length
    ? [...row.shares].sort((a, b) => b.share - a.share)
    : [{ datameet243_no: row.datameet243_no, share: row.overlap_confidence }]
  return shares
    .filter((share, index) => share.datameet243_no === row.datameet243_no || index === 0 || share.share >= minShare)
    .slice(0, limit)
    .map(share => ({ ward_no: share.datameet243_no, share: share.share }))
}

const pct = (share: number) => `${Math.round(share * 100)}%`

/**
 * WardFinder — "Old ward numbers": look up a ward from older records and see
 * which current wards cover it now.
 *
 * Older records use two earlier ward maps: BBMP's 2023 final 225-ward map
 * (work orders) and the 243-ward map (DataMeet/KGIS) that most historical
 * datasets are keyed to. This reference joins them by area overlap
 * (bengaluru-ward-crosswalk.json). Opening a row follows its 243-map wards
 * through the current-ward overlap (bengaluru-gba-369-to-datameet-243.json)
 * and lists the current GBA wards that cover them; each opens on the map.
 *
 * It never presents an old number as a current ward ID, and it does not claim
 * one current ward per old ward: an old ward is usually split, so it lists
 * the parts with their share of the old ward's area.
 */
export function WardFinder({ open, onClose, onSelectCurrentWard, currentWards }: Props) {
  const [rows, setRows] = useState<CrosswalkRow[]>([])
  const [gbaRows, setGbaRows] = useState<GbaCrosswalkRow[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState("")
  const [openRow, setOpenRow] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || rows.length > 0) return
    setLoadFailed(false)
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
            shares: Array.isArray(r.shares) ? r.shares : [],
          }))
        )
      })
      .catch(() => setLoadFailed(true))
  }, [open, rows.length])

  // The current-ward overlap is the same immutable asset the map loads, so
  // this is a cache hit rather than a second download.
  useEffect(() => {
    if (!open || gbaRows.length > 0) return
    fetch(GBA_CROSSWALK_URL)
      .then(r => r.json())
      .then(data => setGbaRows(Array.isArray(data.rows) ? data.rows : []))
      .catch(() => {})
  }, [open, gbaRows.length])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
    else setOpenRow(null)
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

  const oldWardNames = useMemo(() => {
    const names = new Map<number, string>()
    for (const row of gbaRows) for (const ref of row.historical_wards) names.set(ref.ward_no, ref.ward_name)
    return names
  }, [gbaRows])

  const corporationOf = useMemo(() => {
    const names = new Map<string, string>()
    for (const ward of currentWards ?? []) {
      if (ward.corporation_id != null && ward.corporation) names.set(`${ward.corporation_id}:${ward.ward_no}`, ward.corporation)
    }
    return names
  }, [currentWards])

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
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 id="ward-finder-title" className="text-ink font-semibold text-base">{OLD_WARD_NUMBERS_LABEL}</h2>
              <p className="text-ink/60 text-xs mt-0.5 leading-snug">
                Find a ward from older records and see which current wards cover it now.
              </p>
            </div>
            <button onClick={onClose} aria-label={`Close ${OLD_WARD_NUMBERS_LABEL.toLowerCase()}`} className="text-ink/60 hover:text-ink hover:bg-ink/5 text-xl leading-none w-11 h-11 flex items-center justify-center shrink-0">&times;</button>
          </div>
          <label htmlFor="ward-crosswalk-search" className="sr-only">Search an old ward name, number, or constituency</label>
          <input
            id="ward-crosswalk-search"
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpenRow(null) }}
            placeholder="Old ward name, number, or constituency..."
            className="w-full min-h-11 bg-paper-bright border border-ink/25 px-3 py-2 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink/60"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {rows.length === 0 ? (
            <p className="text-ink/60 text-sm text-center py-8">
              {loadFailed ? "Could not load old ward data. Try again later." : "Loading old ward data..."}
            </p>
          ) : results.length === 0 ? (
            <p className="text-ink/60 text-sm text-center py-8">No old ward matches &ldquo;{query.trim()}&rdquo;</p>
          ) : (
            results.map(r => {
              const expanded = openRow === r.bbmp225_no
              const detailId = `old-ward-${r.bbmp225_no}`
              return (
                <div key={`${r.bbmp225_no}-${r.datameet243_no}`} className="border-b border-ink/10 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenRow(expanded ? null : r.bbmp225_no)}
                    title="Show the current wards that cover it"
                    aria-expanded={expanded}
                    aria-controls={detailId}
                    className={`w-full min-h-11 px-3 py-2.5 text-left transition-colors hover:bg-ink/5 ${expanded ? "bg-ink/5" : ""}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-ink text-sm font-semibold">{r.bbmp225_name_en}</span>
                          {r.bbmp225_name_ka && <span className="text-ink/60 text-[11px]">{r.bbmp225_name_ka}</span>}
                        </span>
                        <span className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-1 font-mono text-[11px] text-ink/75">
                          <span>225-ward map #{r.bbmp225_no}</span>
                          <span className="text-ink/60" aria-hidden="true">&rarr;</span>
                          <span>243-ward map #{r.datameet243_no} {r.datameet243_name}</span>
                        </span>
                        <span className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5 text-[11px] text-ink/60">
                          {r.assembly_constituency && <span>{r.assembly_constituency}</span>}
                          <span>Population {r.population.toLocaleString("en-IN")}</span>
                          <span>{pct(r.overlap_confidence)} of it in #{r.datameet243_no}</span>
                          {r.tier !== "clean" && r.tier && <span>Split across old wards</span>}
                        </span>
                      </span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={`mt-1 shrink-0 text-ink/60 ${expanded ? "rotate-180" : ""}`}>
                        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>

                  {expanded && (
                    <div id={detailId} className="px-3 pb-3">
                      {gbaRows.length === 0 ? (
                        <p className="text-ink/60 text-xs py-1">Loading current wards...</p>
                      ) : (
                        overlappedOldWards(r, MATERIAL_OVERLAP).map(old => {
                          const { wards, smaller } = coveringCurrentWards(old.ward_no, gbaRows, MATERIAL_OVERLAP)
                          return (
                            <div key={old.ward_no} className="mt-1.5 border-l-2 border-ink/20 pl-3">
                              <p className="text-xs text-ink/75 leading-snug">
                                {pct(old.share)} of this ward lies in 243-ward map #{old.ward_no} {oldWardNames.get(old.ward_no) ?? ""}.
                                {" "}Current wards covering #{old.ward_no}, with their share of its area:
                              </p>
                              {wards.length === 0 ? (
                                <p className="text-xs text-ink/60 mt-1">No current ward (outside the GBA boundary)</p>
                              ) : (
                                <ul className="mt-1 divide-y divide-ink/10 border-y border-ink/10">
                                  {wards.map(ward => {
                                    const corporation = corporationOf.get(`${ward.corporation_id}:${ward.ward_no}`)
                                    const place = corporation ? `${corporation} #${ward.ward_no}` : `#${ward.ward_no}`
                                    const content = (
                                      <>
                                        <span className="text-sm text-ink">{ward.ward_name}</span>
                                        <span className="font-mono text-[11px] text-ink/60 text-right">{place} &middot; {pct(ward.share)}</span>
                                      </>
                                    )
                                    return (
                                      <li key={`${ward.corporation_id}:${ward.ward_no}`}>
                                        {onSelectCurrentWard ? (
                                          <button
                                            type="button"
                                            onClick={() => onSelectCurrentWard(ward.corporation_id, ward.ward_no)}
                                            aria-label={`Open ${ward.ward_name}, ${place}, on the map (${pct(ward.share)} of old ward ${old.ward_no})`}
                                            className="w-full min-h-11 px-2 flex items-center justify-between gap-3 text-left hover:bg-ink/5"
                                          >
                                            {content}
                                          </button>
                                        ) : (
                                          <div className="min-h-11 px-2 flex items-center justify-between gap-3">{content}</div>
                                        )}
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                              {smaller > 0 && (
                                <p className="text-[11px] text-ink/60 mt-1">
                                  and {smaller} smaller {smaller === 1 ? "part" : "parts"} under {pct(MATERIAL_OVERLAP)} each
                                </p>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink/15 shrink-0">
          <p className="text-ink/60 text-xs leading-snug">
            Source: BBMP 2023 final 225-ward map (OpenCity), DataMeet 243-ward map, and GBA 369 wards (OpenCity, Dec 2025),
            matched by area overlap. Percentages are shares of the old ward&apos;s area, not of its records.
          </p>
        </div>
      </div>
    </div>
  )
}
