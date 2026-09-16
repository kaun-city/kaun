"use client"

import { useEffect, useRef, useState } from "react"
import { MAP_LAYERS, formatValue, type MapLayerMeta } from "@/lib/map-layers"

interface Props {
  activeId: string | null
  onSelect: (id: string | null) => void
  /** Legend inputs for the active layer (null while loading / no layer) */
  legend: { breaks: number[]; min: number; max: number; wardCount: number } | null
  loading: boolean
}

/**
 * LayerControl — the "paint the city" switcher, bottom-left of the map.
 *
 * Collapsed: a single pill. Expanded: the layer list; picking one colors
 * every ward by that metric and shows a quantile legend with attribution.
 * The active layer is shareable via the ?layer= URL param (HomePage owns
 * the URL sync).
 */
export function LayerControl({ activeId, onSelect, legend, loading }: Props) {
  const [open, setOpen] = useState(false)
  // The legend folds away without clearing the layer, so the painted map can
  // be read full-size; a new layer always opens its legend.
  const [legendOpen, setLegendOpen] = useState(true)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLegendOpen(true)
  }, [activeId])

  const active: MapLayerMeta | null = MAP_LAYERS.find(l => l.id === activeId) ?? null

  // Close on outside tap
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="absolute bottom-4 left-4 z-[900] select-none">
      {open && (
        <div className="mb-2 w-64 bg-paper border border-ink/55 overflow-hidden">
          <div className="px-3 py-2 border-b border-ink/15 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Paint the city by</p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close layers"
              className="w-11 h-11 -my-2 -mr-2 flex items-center justify-center text-ink/60 hover:text-ink hover:bg-ink/5 text-sm leading-none"
            >
              &times;
            </button>
          </div>

          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`w-full min-h-11 text-left px-3 py-2 text-xs transition-colors
              ${activeId === null ? "bg-ink text-paper" : "text-ink/75 hover:bg-ink/5 hover:text-ink"}`}
          >
            None — plain map
          </button>

          {MAP_LAYERS.map(layer => (
            <button
              key={layer.id}
              onClick={() => { onSelect(layer.id); setOpen(false) }}
              className={`w-full min-h-11 text-left px-3 py-2 transition-colors border-t border-ink/10
                ${layer.id === activeId ? "bg-ink text-paper" : "text-ink hover:bg-ink/5"}`}
            >
              <span className="block text-xs font-medium">{layer.label}</span>
              <span className={`block text-[11px] mt-0.5 leading-snug ${layer.id === activeId ? "text-paper/75" : "text-ink/60"}`}>{layer.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Legend for the active layer */}
      {active && !open && legendOpen && (
        <div id="city-layer-legend" className="mb-2 w-60 bg-paper border border-ink/55 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-ink text-xs font-semibold truncate">{active.label}</p>
            <div className="flex shrink-0 items-center -my-2 -mr-2">
              <button
                onClick={() => setLegendOpen(false)}
                aria-label="Hide legend"
                aria-controls="city-layer-legend"
                aria-expanded="true"
                className="w-11 h-11 flex items-center justify-center text-ink/60 hover:text-ink hover:bg-ink/5"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={() => onSelect(null)}
                aria-label="Clear layer"
                className="w-11 h-11 flex items-center justify-center text-ink/60 hover:text-ink hover:bg-ink/5 text-sm leading-none"
              >
                &times;
              </button>
            </div>
          </div>
          {loading ? (
            <p className="text-ink/60 text-[11px] mt-1.5">Loading...</p>
          ) : legend && legend.wardCount > 0 ? (
            <>
              <div className="flex h-2 mt-2 overflow-hidden border border-ink/15">
                {active.ramp.map(c => (
                  <div key={c} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-mono tabular-nums text-ink/75 text-[11px]">{formatValue(legend.min, active.format)}</span>
                <span className="font-mono tabular-nums text-ink/75 text-[11px]">{formatValue(legend.max, active.format)}</span>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60 mt-1.5 leading-snug">
                {legend.wardCount} wards &middot; {active.source}
              </p>
            </>
          ) : (
            <p className="text-ink/60 text-[11px] mt-1.5">No data yet for this city.</p>
          )}
        </div>
      )}

      <div className="flex items-stretch">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex min-h-11 items-center gap-2 px-4 py-2.5
          bg-paper hover:bg-paper-muted border font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-150
          ${active
            ? "border-accent text-accent"
            : "border-ink/55 text-ink"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1.5 14.5 5 8 8.5 1.5 5 8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          <path d="m1.5 8.5 6.5 3.5 6.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity="0.55"/>
          <path d="m1.5 11.5 6.5 3.5 6.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity="0.3"/>
        </svg>
        {active ? active.label : "Layers"}
      </button>
      {active && !open && !legendOpen && (
        <button
          onClick={() => setLegendOpen(true)}
          aria-label="Show legend"
          aria-controls="city-layer-legend"
          aria-expanded="false"
          className="-ml-px flex w-11 min-h-11 items-center justify-center border border-accent bg-paper text-accent hover:bg-paper-muted"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="rotate-180">
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      </div>
    </div>
  )
}
