"use client"

import { useEffect, useRef, useState } from "react"
import { formatLegendValue, wardsWithoutData, type LayerFormat } from "@/lib/map-layers"

export interface PickerLayer {
  id: string
  label: string
  description: string
  /** Attribution line in the full legend. */
  source: string
  format: LayerFormat
  /** What the scale measures, in plain words, shown under its ends. */
  unit: string
  /** Why an area can legitimately have no value, shown in the full legend. */
  absentNote?: string
}

export interface PickerLegend {
  /** The ramp as the map paints it, low value → high value. */
  ramp: readonly string[]
  min: number
  max: number
  /** Areas with a value. */
  painted: number
  /** Every area on the map, painted or not. */
  total: number
}

/**
 * MapLayerPicker — the "Layers" control, the same one on every map.
 *
 * The city map and the India map each grew their own: a pill that opened a
 * described list with a separate legend card on one, a foldable panel of chips
 * on the other. Same job, two things to learn. This is the one control:
 *
 *   FOLDED    one 44px row naming the layer, and — when a layer is painted —
 *             the compact key under it: ramp with its two ends, the unit, and
 *             how many areas have no data. A painted map is never shown
 *             without its key.
 *   OPEN      every layer with its one-line description ("None" first), then
 *             the full legend: the key, why an area can be blank, and the
 *             source. The description is not repeated; it is on the row
 *             directly above.
 *
 * It starts folded at every width, so both maps open map-first. Picking a
 * layer folds it again on phones, where the open panel covers the map, and
 * leaves it open from md up so layers can be compared; on phones a tap
 * anywhere outside folds it too.
 *
 * No data is a fact, not a zero. The legend's no-data swatch must be drawn
 * exactly as the map draws an unpainted area — `noDataSwatch` picks between
 * the city map's stage-grey fill and the India map's dashed, unfilled edge —
 * and the line says in words that it is not a zero.
 *
 * The picker does not position itself; each map places it (bottom-left, and on
 * phones above a folded ward sheet or in the India map's bottom rail) and caps
 * its height through `className`. The open body scrolls inside that cap.
 *
 * State stays with the map: the active layer, its URL parameter and its values
 * are the caller's. This component owns only whether it is folded.
 */
export function MapLayerPicker({
  id,
  layers,
  activeId,
  onSelect,
  legend,
  loading,
  noun,
  noDataSwatch,
  className = "",
}: {
  /** DOM id for the foldable body. */
  id: string
  layers: readonly PickerLayer[]
  activeId: string | null
  onSelect: (id: string | null) => void
  /** Null while nothing is painted yet. */
  legend: PickerLegend | null
  loading: boolean
  /** What one area is called: ward, seat. */
  noun: { one: string; other: string }
  noDataSwatch: "fill" | "dashed"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = layers.find(layer => layer.id === activeId) ?? null

  // Phones: a tap anywhere else — the map, search, a seat — folds the panel.
  // Capture phase, because Leaflet stops propagation on its own panes.
  useEffect(() => {
    if (!open) return
    function onDown(event: PointerEvent) {
      if (!isNarrowViewport()) return
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [open])

  function choose(next: string | null) {
    onSelect(next)
    if (isNarrowViewport()) setOpen(false)
  }

  const bodyId = `${id}-body`

  return (
    <div
      ref={rootRef}
      data-layer-picker={open ? "open" : "folded"}
      className={`pointer-events-auto flex min-h-0 flex-col border border-ink/55 bg-paper select-none ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={`flex min-h-11 w-full shrink-0 items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors hover:bg-ink/5 ${FOCUS_INSET}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <LayersIcon className={active ? "text-accent" : "text-ink/70"} />
          <span className="min-w-0">
            <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Layers</span>
            <span className={`block truncate font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ${active ? "text-accent" : "text-ink"}`}>
              {active ? active.label : "None"}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60">
          {open ? "Hide" : "Show"}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={open ? "" : "rotate-180"}>
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {active && !open && (
        <div className="border-t border-ink/15 px-3 py-2">
          <LegendKey layer={active} legend={legend} loading={loading} noun={noun} noDataSwatch={noDataSwatch} full={false} />
        </div>
      )}

      <div id={bodyId} hidden={!open} className="min-h-0 overflow-y-auto overscroll-contain border-t border-ink/15">
        <div role="group" aria-label="Map layers">
          <button
            type="button"
            onClick={() => choose(null)}
            aria-pressed={activeId === null}
            className={`flex min-h-11 w-full items-center px-3 py-2 text-left text-xs transition-colors ${FOCUS_INSET} ${
              activeId === null ? "bg-ink text-paper" : "text-ink/75 hover:bg-ink/5 hover:text-ink"}`}
          >
            None &mdash; plain map
          </button>
          {layers.map(layer => {
            const selected = layer.id === activeId
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => choose(layer.id)}
                aria-pressed={selected}
                className={`block min-h-11 w-full border-t border-ink/10 px-3 py-2 text-left transition-colors ${FOCUS_INSET} ${
                  selected ? "bg-ink text-paper" : "text-ink hover:bg-ink/5"}`}
              >
                <span className="block text-xs font-medium">{layer.label}</span>
                <span className={`mt-0.5 block text-[11px] leading-snug ${selected ? "text-paper/75" : "text-ink/60"}`}>
                  {layer.description}
                </span>
              </button>
            )
          })}
        </div>

        {active && (
          <div className="border-t border-ink/55 px-3 py-2.5">
            <LegendKey layer={active} legend={legend} loading={loading} noun={noun} noDataSwatch={noDataSwatch} full />
          </div>
        )}
      </div>
    </div>
  )
}

function LegendKey({
  layer,
  legend,
  loading,
  noun,
  noDataSwatch,
  full,
}: {
  layer: PickerLayer
  legend: PickerLegend | null
  loading: boolean
  noun: { one: string; other: string }
  noDataSwatch: "fill" | "dashed"
  full: boolean
}) {
  if (loading) return <p role="status" className="text-[11px] text-ink/60">Loading&hellip;</p>
  if (!legend || legend.painted === 0) {
    return <p className="text-[11px] leading-snug text-ink/60">No data loaded for this layer yet.</p>
  }

  const blank = wardsWithoutData(legend.total, legend.painted)

  return (
    <div className={full ? "space-y-1.5" : "space-y-1"}>
      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-ink/75">
        <span>{formatLegendValue(legend.min, layer.format)}</span>
        <span aria-hidden="true" className="flex h-2.5 flex-1 border border-ink/15">
          {legend.ramp.map((color, index) => (
            <span key={index} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </span>
        <span>{formatLegendValue(legend.max, layer.format)}</span>
      </div>
      <p className="text-[11px] leading-snug text-ink/70">{layer.unit}</p>
      {blank > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] leading-snug text-ink/70">
          <span
            aria-hidden="true"
            className={`h-2.5 w-4 shrink-0 ${noDataSwatch === "dashed" ? "border border-dashed border-ink/60" : "border border-ink/25 bg-paper-stage"}`}
          />
          <span>
            No data (not zero) &middot; {blank.toLocaleString("en-IN")} of {legend.total.toLocaleString("en-IN")} {legend.total === 1 ? noun.one : noun.other}
          </span>
        </p>
      )}
      {full && layer.absentNote && <p className="text-xs leading-snug text-ink/60">{layer.absentNote}</p>}
      {full && (
        <p className="font-mono text-[11px] uppercase leading-snug tracking-[0.06em] text-ink/60">Source: {layer.source}</p>
      )}
    </div>
  )
}

function LayersIcon({ className }: { className: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M8 1.5 14.5 5 8 8.5 1.5 5 8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="m1.5 8.5 6.5 3.5 6.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity="0.55" />
      <path d="m1.5 11.5 6.5 3.5 6.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity="0.3" />
    </svg>
  )
}

/** Below Tailwind's md breakpoint the open panel covers the map. */
function isNarrowViewport(): boolean {
  return typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches
}

const FOCUS_INSET = "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
