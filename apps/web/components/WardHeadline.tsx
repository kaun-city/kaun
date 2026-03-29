"use client"

import type { ContractorProfile, RepReportCard, WardCommitteeMeetings, WardInfraStats } from "@/lib/types"

interface Props {
  reportCard: RepReportCard | null
  committeeMeetings: WardCommitteeMeetings | null
  infraStats: WardInfraStats | null
  wardContractors: ContractorProfile[]
}

interface Headline {
  severity: "red" | "yellow" | "info"
  text: string
  detail: string
}

function pickHeadline({ reportCard, committeeMeetings, infraStats, wardContractors }: Props): Headline | null {
  const flagged = wardContractors.filter(c => c.blacklist_flags.length > 0)
  const headlines: (Headline & { priority: number })[] = []

  // Flagged contractors in this ward — most alarming
  if (flagged.length > 0) {
    const totalValue = flagged.reduce((s, c) => s + c.total_value_lakh, 0)
    headlines.push({
      priority: 100,
      severity: "red",
      text: `${flagged.length} flagged contractor${flagged.length > 1 ? "s" : ""} active in this ward`,
      detail: `Rs ${totalValue >= 100 ? `${(totalValue / 100).toFixed(0)} Cr` : `${totalValue.toFixed(0)} L`} in public money to entities on debarment lists`,
    })
  }

  // MLA criminal cases
  if (reportCard?.criminal_cases && reportCard.criminal_cases > 0) {
    headlines.push({
      priority: 90,
      severity: "red",
      text: `MLA has ${reportCard.criminal_cases} criminal case${reportCard.criminal_cases > 1 ? "s" : ""}`,
      detail: "As declared in Election Commission affidavit",
    })
  }

  // MLA 0% LAD utilization
  if (reportCard?.lad_utilization_pct !== null && reportCard?.lad_utilization_pct !== undefined && reportCard.lad_utilization_pct === 0) {
    headlines.push({
      priority: 85,
      severity: "red",
      text: "MLA has spent 0% of development funds",
      detail: "LAD fund meant for local area development is completely unused",
    })
  }

  // Very low MLA attendance
  if (reportCard?.attendance_pct !== null && reportCard?.attendance_pct !== undefined && reportCard.attendance_pct < 40) {
    headlines.push({
      priority: 80,
      severity: "red",
      text: `MLA attended only ${reportCard.attendance_pct}% of assembly sessions`,
      detail: "Below 40% attendance in Karnataka Legislature",
    })
  }

  // Ward committee never met
  if (committeeMeetings && committeeMeetings.meetings_count === 0) {
    headlines.push({
      priority: 75,
      severity: "red",
      text: "Ward committee has never met",
      detail: "0 of 56 mandated meetings held (2020-2022)",
    })
  }

  // Zero traffic signals
  if (infraStats && infraStats.signal_count === 0) {
    headlines.push({
      priority: 60,
      severity: "yellow",
      text: "This ward has zero traffic signals",
      detail: `City average: 5.5 signals per ward`,
    })
  }

  // Low LAD utilization (non-zero)
  if (reportCard?.lad_utilization_pct !== null && reportCard?.lad_utilization_pct !== undefined
    && reportCard.lad_utilization_pct > 0 && reportCard.lad_utilization_pct < 30) {
    headlines.push({
      priority: 55,
      severity: "yellow",
      text: `Only ${reportCard.lad_utilization_pct}% of MLA development funds used`,
      detail: "Most of the area development budget remains unspent",
    })
  }

  if (headlines.length === 0) return null
  headlines.sort((a, b) => b.priority - a.priority)
  return headlines[0]
}

export function WardHeadline(props: Props) {
  const headline = pickHeadline(props)
  if (!headline) return null

  const colors = {
    red: { bg: "bg-red-500/10", border: "border-red-500/20", icon: "text-red-400", text: "text-red-300", detail: "text-red-400/60" },
    yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", icon: "text-yellow-400", text: "text-yellow-300", detail: "text-yellow-400/60" },
    info: { bg: "bg-blue-500/10", border: "border-blue-500/20", icon: "text-blue-400", text: "text-blue-300", detail: "text-blue-400/60" },
  }
  const c = colors[headline.severity]

  return (
    <div className={`mx-5 mt-3 flex gap-2.5 p-3 rounded-xl ${c.bg} border ${c.border}`}>
      <span className={`${c.icon} text-base mt-0.5 shrink-0`}>!</span>
      <div className="min-w-0">
        <p className={`${c.text} text-xs font-semibold leading-snug`}>{headline.text}</p>
        <p className={`${c.detail} text-[10px] mt-0.5 leading-snug`}>{headline.detail}</p>
      </div>
    </div>
  )
}
