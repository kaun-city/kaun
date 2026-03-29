"use client"

import { useState, useEffect } from "react"
import type { ContractorProfile, RepReportCard } from "@/lib/types"
import { fetchFlaggedContractors, fetchTopContractors } from "@/lib/api"

interface CityStats {
  flaggedContractors: ContractorProfile[]
  topContractors: ContractorProfile[]
  loading: boolean
}

export function CityPulse() {
  const [stats, setStats] = useState<CityStats>({ flaggedContractors: [], topContractors: [], loading: true })

  useEffect(() => {
    Promise.all([
      fetchFlaggedContractors().catch(() => []),
      fetchTopContractors(5).catch(() => []),
    ]).then(([flagged, top]) => {
      setStats({ flaggedContractors: flagged, topContractors: top, loading: false })
    })
  }, [])

  if (stats.loading) return null

  const hasFlagged = stats.flaggedContractors.length > 0
  const totalFlaggedValue = stats.flaggedContractors.reduce((sum, c) => sum + c.total_value_lakh, 0)

  // Don't show if we have no data at all
  if (!hasFlagged && stats.topContractors.length === 0) return null

  return (
    <div className="absolute top-14 left-4 z-[900] max-w-[320px] space-y-2 pointer-events-auto">

      {/* Headline alert — flagged contractors */}
      {hasFlagged && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 backdrop-blur-md px-4 py-3 shadow-lg">
          <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Accountability Alert</p>
          <p className="text-white text-sm font-semibold mt-1">
            Rs {totalFlaggedValue >= 100 ? `${(totalFlaggedValue / 100).toFixed(0)} Cr` : `${totalFlaggedValue.toFixed(0)} L`} to flagged contractors
          </p>
          <p className="text-white/40 text-xs mt-1 leading-relaxed">
            {stats.flaggedContractors.length} contractor{stats.flaggedContractors.length > 1 ? "s" : ""} active
            in Bengaluru {stats.flaggedContractors.length > 1 ? "are" : "is"} flagged on debarment lists.
            Drop a pin to see if they operate in your ward.
          </p>
          <div className="mt-2 space-y-1">
            {stats.flaggedContractors.slice(0, 3).map(c => (
              <div key={c.entity_id} className="flex items-center justify-between gap-2">
                <p className="text-red-300 text-xs truncate">{c.canonical_name}</p>
                <p className="text-white/30 text-[10px] shrink-0">{c.ward_count} wards</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top spenders — always show if data exists */}
      {stats.topContractors.length > 0 && !hasFlagged && (
        <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-md px-4 py-3 shadow-lg">
          <p className="text-[#FF9933] text-[10px] font-bold uppercase tracking-wider">Public Money</p>
          <p className="text-white/60 text-xs mt-1 leading-relaxed">
            Top contractors receiving BBMP funds across Bengaluru.
            Drop a pin to see who works in your ward.
          </p>
          <div className="mt-2 space-y-1">
            {stats.topContractors.slice(0, 3).map(c => (
              <div key={c.entity_id} className="flex items-center justify-between gap-2">
                <p className="text-white/70 text-xs truncate">{c.canonical_name}</p>
                <p className="text-[#FF9933] text-[10px] shrink-0">
                  Rs {c.total_value_lakh >= 100 ? `${(c.total_value_lakh / 100).toFixed(0)} Cr` : `${c.total_value_lakh.toFixed(0)} L`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
