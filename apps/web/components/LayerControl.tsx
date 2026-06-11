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
  const wrapRef = useRef<HTMLDivElement>(null)

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
        <div className="mb-2 w-64 rounded-xl bg-[#0A0A0A]/95 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
            <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">Paint the city by</p>
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60 text-sm leading-none">&times;</button>
          </div>

          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5
              ${activeId === null ? "text-[#FF9933]" : "text-white/60"}`}
          >
            None — plain map
          </button>

          {MAP_LAYERS.map(layer => (
            <button
              key={layer.id}
              onClick={() => { onSelect(layer.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 transition-colors hover:bg-white/5 border-t border-white/5
                ${layer.id === activeId ? "text-[#FF9933]" : "text-white/70"}`}
            >
              <span className="block text-xs font-medium">{layer.label}</span>
              <span className="block text-[10px] text-white/35 mt-0.5 leading-snug">{layer.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Legend for the active layer */}
      {active && !open && (
        <div className="mb-2 w-60 rounded-xl bg-[#0A0A0A]/90 backdrop-blur-md border border-white/10 shadow-xl px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-white/80 text-xs font-semibold truncate">{active.label}</p>
            <button
              onClick={() => onSelect(null)}
              aria-label="Clear layer"
              className="text-white/30 hover:text-white/60 text-sm leading-none shrink-0"
            >
              &times;
            </button>
          </div>
          {loading ? (
            <p className="text-white/30 text-[10px] mt-1.5">Loading...</p>
          ) : legend && legend.wardCount > 0 ? (
            <>
              <div className="flex h-2 mt-2 rounded-full overflow-hidden">
                {active.ramp.map(c => (
                  <div key={c} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-white/40 text-[10px]">{formatValue(legend.min, active.format)}</span>
                <span className="text-white/40 text-[10px]">{formatValue(legend.max, active.format)}</span>
              </div>
              <p className="text-white/25 text-[9px] mt-1.5 leading-snug">
                {legend.wardCount} wards &middot; {active.source}
              </p>
            </>
          ) : (
            <p className="text-white/30 text-[10px] mt-1.5">No data yet for this city.</p>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full
          bg-[#111] border text-sm font-medium shadow-lg transition-all duration-150
          ${active
            ? "border-[#FF9933]/50 text-[#FF9933]"
            : "border-white/15 hover:border-white/30 text-white/70 hover:text-white"}`}
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
    </div>
  )
}
