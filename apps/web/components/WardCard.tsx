"use client"

import type { PinResult } from "@/lib/types"

interface Props {
  result: PinResult | null
  loading: boolean
  onClose: () => void
}

export default function WardCard({ result, loading, onClose }: Props) {
  if (!loading && !result) return null

  return (
    // Slides up from bottom on mobile, fixed panel on right on desktop
    <div className="
      fixed bottom-0 left-0 right-0 z-[1000]
      md:bottom-6 md:right-6 md:left-auto md:w-96
      bg-[#111111] border border-white/10 rounded-t-2xl md:rounded-2xl
      shadow-2xl overflow-hidden
      animate-slide-up
    ">
      {/* Handle bar (mobile) */}
      <div className="flex justify-center pt-3 pb-1 md:hidden">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-white/10">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
            <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
          </div>
        ) : result?.found ? (
          <div>
            <h2 className="text-white font-semibold text-base leading-snug">
              {result.ward_name}
            </h2>
            <p className="text-white/40 text-xs mt-0.5">
              Ward {result.ward_no}
              {result.zone ? ` · ${result.zone}` : ""}
              {result.assembly_constituency ? ` · ${result.assembly_constituency}` : ""}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-white/60 font-medium text-base">Outside city boundary</h2>
            <p className="text-white/30 text-xs mt-0.5">No ward found at this location</p>
          </div>
        )}

        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-4 mt-0.5 text-white/30 hover:text-white/70 transition-colors text-lg leading-none"
        >
          x
        </button>
      </div>

      {/* Agencies */}
      {!loading && result?.found && result.agencies.length > 0 && (
        <div className="px-5 py-4 space-y-2">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Who&apos;s responsible</p>
          {result.agencies.map((agency) => (
            <div
              key={agency.short}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/5"
            >
              <div>
                {agency.website ? (
                  <a
                    href={agency.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white text-sm font-medium hover:text-[#FF9933] transition-colors"
                  >
                    {agency.short} &rarr;
                  </a>
                ) : (
                  <p className="text-white text-sm font-medium">{agency.short}</p>
                )}
                <p className="text-white/40 text-xs leading-snug">{agency.name}</p>
              </div>
              {agency.helpline && (
                <span
                  className="text-[#FF9933] text-sm font-mono font-semibold"
                  title="Helpline number"
                >
                  {agency.helpline}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* RTI CTA */}
      {!loading && result?.found && (
        <div className="px-5 pb-5">
          <button
            className="
              w-full py-3 rounded-xl
              border border-[#FF9933]/40 text-[#FF9933] text-sm font-medium
              hover:bg-[#FF9933]/10 transition-colors
            "
            onClick={() => alert("RTI Generator coming soon")}
          >
            Generate RTI Application
          </button>
        </div>
      )}
    </div>
  )
}
