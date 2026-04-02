"use client"

import type { ContractorProfile, RepReportCard, WardCommitteeMeetings, WardInfraStats, WardPotholes } from "@/lib/types"

interface Props {
  reportCard: RepReportCard | null
  committeeMeetings: WardCommitteeMeetings | null
  infraStats: WardInfraStats | null
  potholes: WardPotholes | null
  wardContractors: ContractorProfile[]
}

/**
 * Compute a composite ward grade (A-F) from available data.
 * Each dimension contributes a 0-100 score, weighted and averaged.
 */
function computeGrade(props: Props): { grade: string; score: number; color: string; factors: string[] } | null {
  const { reportCard, committeeMeetings, infraStats, potholes, wardContractors } = props
  const scores: { value: number; weight: number }[] = []
  const factors: string[] = []

  // MLA attendance (0-100)
  if (reportCard?.attendance_pct != null) {
    scores.push({ value: Math.min(reportCard.attendance_pct, 100), weight: 2 })
    if (reportCard.attendance_pct < 50) factors.push(`MLA attendance ${reportCard.attendance_pct}%`)
  }

  // LAD utilization (0-100)
  if (reportCard?.lad_utilization_pct != null) {
    scores.push({ value: Math.min(Number(reportCard.lad_utilization_pct), 100), weight: 2 })
    if (Number(reportCard.lad_utilization_pct) < 30) factors.push(`LAD fund ${reportCard.lad_utilization_pct}% used`)
  }

  // Criminal cases (inverse: 0 cases = 100, 5+ = 0)
  if (reportCard?.criminal_cases != null) {
    const caseScore = Math.max(0, 100 - reportCard.criminal_cases * 20)
    scores.push({ value: caseScore, weight: 1.5 })
    if (reportCard.criminal_cases > 0) factors.push(`${reportCard.criminal_cases} criminal cases`)
  }

  // Ward committee meetings (max ~56 over 2020-22, score as % of 56)
  if (committeeMeetings) {
    const meetScore = Math.min(100, (committeeMeetings.meetings_count / 56) * 100)
    scores.push({ value: meetScore, weight: 1 })
    if (committeeMeetings.meetings_count < 10) factors.push(`Only ${committeeMeetings.meetings_count} ward meetings`)
  }

  // Traffic signals (compare to city avg 5.5)
  if (infraStats) {
    const sigScore = Math.min(100, (infraStats.signal_count / 5.5) * 50)
    scores.push({ value: sigScore, weight: 0.5 })
  }

  // Potholes (inverse: fewer = better, cap at 200)
  if (potholes) {
    const potScore = Math.max(0, 100 - (potholes.complaints / 200) * 100)
    scores.push({ value: potScore, weight: 0.5 })
  }

  // Flagged contractors (any = penalty)
  const flaggedCount = wardContractors.filter(c => c.blacklist_flags.length > 0).length
  if (flaggedCount > 0) {
    scores.push({ value: Math.max(0, 100 - flaggedCount * 40), weight: 1.5 })
    factors.push(`${flaggedCount} flagged contractor${flaggedCount > 1 ? "s" : ""}`)
  }

  if (scores.length < 2) return null

  const totalWeight = scores.reduce((s, x) => s + x.weight, 0)
  const weightedScore = scores.reduce((s, x) => s + x.value * x.weight, 0) / totalWeight
  const rounded = Math.round(weightedScore)

  let grade: string
  let color: string
  if (rounded >= 80) { grade = "A"; color = "text-green-400" }
  else if (rounded >= 65) { grade = "B"; color = "text-green-300" }
  else if (rounded >= 50) { grade = "C"; color = "text-yellow-400" }
  else if (rounded >= 35) { grade = "D"; color = "text-orange-400" }
  else { grade = "F"; color = "text-red-400" }

  return { grade, score: rounded, color, factors: factors.slice(0, 3) }
}

export function WardGrade(props: Props) {
  const result = computeGrade(props)
  if (!result) return null

  return (
    <div className="flex items-center gap-2">
      <span className={`text-2xl font-black ${result.color}`}>{result.grade}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="h-1 w-12 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                result.score >= 65 ? "bg-green-400" : result.score >= 50 ? "bg-yellow-400" : result.score >= 35 ? "bg-orange-400" : "bg-red-400"
              }`}
              style={{ width: `${result.score}%` }}
            />
          </div>
          <span className="text-white/20 text-[10px]">{result.score}/100</span>
        </div>
        {result.factors.length > 0 && (
          <p className="text-white/25 text-[10px] truncate mt-0.5">{result.factors.join(" · ")}</p>
        )}
      </div>
    </div>
  )
}
