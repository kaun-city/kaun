"use client"

import { useState } from "react"
import type { ContractorProfile, RepReportCard, WardCommitteeMeetings, WardInfraStats, WardPotholes } from "@/lib/types"

interface Props {
  reportCard: RepReportCard | null
  committeeMeetings: WardCommitteeMeetings | null
  infraStats: WardInfraStats | null
  potholes: WardPotholes | null
  wardContractors: ContractorProfile[]
}

interface Dimension {
  label: string
  score: number       // 0-100
  weight: number
  note: string | null // shown in breakdown
}

/**
 * Compute an accountability score (0-100) from available data.
 * Returns null if fewer than 2 dimensions are available.
 *
 * Dimensions:
 *   - MLA attendance %            weight 2  (source: Myneta / assembly records)
 *   - LAD fund utilization %      weight 2  (source: assembly records)
 *   - Criminal cases (inverse)    weight 1.5 (source: Myneta affidavits)
 *   - Flagged contractors         weight 1.5 (source: KPPP tender records)
 */
function computeScore(props: Props): { score: number; dimensions: Dimension[]; dataPoints: number } | null {
  const { reportCard, wardContractors } = props
  const dimensions: Dimension[] = []

  // MLA attendance (0-100)
  if (reportCard?.attendance_pct != null) {
    const v = Math.min(reportCard.attendance_pct, 100)
    dimensions.push({
      label: "MLA attendance",
      score: v,
      weight: 2,
      note: `${reportCard.attendance_pct}% sessions attended`,
    })
  }

  // LAD utilization (0-100)
  if (reportCard?.lad_utilization_pct != null) {
    const v = Math.min(Number(reportCard.lad_utilization_pct), 100)
    dimensions.push({
      label: "LAD fund use",
      score: v,
      weight: 2,
      note: `${reportCard.lad_utilization_pct}% of constituency development funds utilised`,
    })
  }

  // Criminal cases (inverse: 0 = 100, 5+ = 0)
  if (reportCard?.criminal_cases != null) {
    const v = Math.max(0, 100 - reportCard.criminal_cases * 20)
    dimensions.push({
      label: "Criminal cases",
      score: v,
      weight: 1.5,
      note: reportCard.criminal_cases === 0
        ? "No declared criminal cases"
        : `${reportCard.criminal_cases} declared criminal case${reportCard.criminal_cases > 1 ? "s" : ""}`,
    })
  }

  // Flagged contractors (any = penalty; 0 flagged = 100)
  const flaggedCount = wardContractors.filter(c => c.blacklist_flags.length > 0).length
  if (wardContractors.length > 0) {
    const v = Math.max(0, 100 - flaggedCount * 40)
    dimensions.push({
      label: "Contractor flags",
      score: v,
      weight: 1.5,
      note: flaggedCount === 0
        ? "No flagged contractors on ward tenders"
        : `${flaggedCount} contractor${flaggedCount > 1 ? "s" : ""} with blacklist flags`,
    })
  }

  if (dimensions.length < 2) return null

  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0)
  const weighted = dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight

  return { score: Math.round(weighted), dimensions, dataPoints: dimensions.length }
}

function scoreColor(score: number) {
  if (score >= 70) return { bar: "bg-green-400", text: "text-green-400" }
  if (score >= 50) return { bar: "bg-yellow-400", text: "text-yellow-400" }
  if (score >= 30) return { bar: "bg-orange-400", text: "text-orange-400" }
  return { bar: "bg-red-400", text: "text-red-400" }
}

export function WardGrade(props: Props) {
  const [open, setOpen] = useState(false)
  const result = computeScore(props)
  if (!result) return null

  const { score, dimensions, dataPoints } = result
  const { bar, text } = scoreColor(score)

  return (
    <div className="mt-1">
      {/* Compact bar — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 group w-full text-left"
        title="Tap to see accountability score breakdown"
      >
        <div className="h-1.5 w-20 rounded-full bg-white/10 overflow-hidden shrink-0">
          <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-[11px] font-semibold ${text}`}>{score}<span className="text-white/30 font-normal">/100</span></span>
        <span className="text-white/20 text-[10px] group-hover:text-white/40 transition-colors">
          accountability {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded breakdown */}
      {open && (
        <div className="mt-2 rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
          <p className="text-white/40 text-[10px] uppercase tracking-wide font-medium mb-1">
            Score breakdown &middot; {dataPoints} data point{dataPoints > 1 ? "s" : ""}
          </p>
          {dimensions.map((d) => {
            const dc = scoreColor(d.score)
            return (
              <div key={d.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-white/60 text-[11px]">{d.label}</span>
                  <span className={`text-[11px] font-semibold ${dc.text}`}>{d.score}/100</span>
                </div>
                <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${dc.bar}`} style={{ width: `${d.score}%` }} />
                </div>
                {d.note && <p className="text-white/30 text-[10px] mt-0.5">{d.note}</p>}
              </div>
            )
          })}
          <p className="text-white/20 text-[10px] pt-1 border-t border-white/10">
            Sources: Myneta affidavits, assembly records, KPPP tender data.{" "}
            <span className="text-white/30">Score reflects available data only — not a comprehensive ward assessment.</span>
          </p>
        </div>
      )}
    </div>
  )
}
