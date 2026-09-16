"use client"

import type { ContractorProfile, RepReportCard, WardCommitteeMeetings, WardInfraStats } from "@/lib/types"
import { getCity } from "@/lib/cities"
import { formatLakh } from "@/lib/ward-utils"

interface Props {
  reportCard: RepReportCard | null
  committeeMeetings: WardCommitteeMeetings | null
  infraStats: WardInfraStats | null
  wardContractors: ContractorProfile[]
  /** city_id from PinResult — used to phrase city-specific copy correctly */
  cityId?: string
  /**
   * Former wards whose ward-tagged records were used for a current ward.
   * Present only when the record is a historical-overlap estimate.
   */
  formerWards?: string[]
}

interface Headline {
  severity: "red" | "yellow" | "info"
  text: string
  detail: string
  /** Where the number came from. Every headline carries one. */
  source: string
}

function yearRange(values: Array<string | null | undefined>): string | null {
  const years = values.filter((value): value is string => !!value).sort()
  if (!years.length) return null
  return years[0] === years[years.length - 1] ? years[0] : `${years[0]} to ${years[years.length - 1]}`
}

export function pickHeadline({ reportCard, committeeMeetings, infraStats, wardContractors, cityId, formerWards }: Props): Headline | null {
  const flagged = wardContractors.filter(c => c.blacklist_flags.length > 0)
  const headlines: (Headline & { priority: number })[] = []
  const stateName = getCity(cityId).state
  const term = reportCard?.term ? ` · ${reportCard.term}` : ""

  // Flagged contractors in this ward's work orders — most alarming
  if (flagged.length > 0) {
    const totalValue = flagged.reduce((s, c) => s + c.total_value_lakh, 0)
    const years = yearRange(flagged.flatMap(c => [c.first_seen, c.last_seen]))
    const scope = formerWards?.length ? "this area's" : "this ward's"
    headlines.push({
      priority: 100,
      severity: "red",
      text: `${flagged.length} flagged contractor${flagged.length > 1 ? "s" : ""} in ${scope} work orders`,
      detail: `${formatLakh(totalValue)} in public money to entities on debarment lists`,
      source: [
        `BBMP work orders${years ? ` ${years}` : ""}`,
        formerWards?.length ? `former ward${formerWards.length > 1 ? "s" : ""} ${formerWards.join(", ")}` : null,
      ].filter(Boolean).join(" · "),
    })
  }

  // MLA criminal cases
  if (reportCard?.criminal_cases && reportCard.criminal_cases > 0) {
    headlines.push({
      priority: 90,
      severity: "red",
      text: `MLA has ${reportCard.criminal_cases} criminal case${reportCard.criminal_cases > 1 ? "s" : ""} declared`,
      detail: "Self-declared in the election nomination affidavit",
      source: `Election Commission affidavit${term}`,
    })
  }

  // MLA 0% LAD utilization
  if (reportCard?.lad_utilization_pct !== null && reportCard?.lad_utilization_pct !== undefined && reportCard.lad_utilization_pct === 0) {
    headlines.push({
      priority: 85,
      severity: "red",
      text: "MLA has spent 0% of development funds",
      detail: "LAD fund meant for local area development is unused",
      source: `MLA LAD fund record${term}`,
    })
  }

  // Very low MLA attendance
  if (reportCard?.attendance_pct !== null && reportCard?.attendance_pct !== undefined && reportCard.attendance_pct < 40) {
    headlines.push({
      priority: 80,
      severity: "red",
      text: `MLA attended ${reportCard.attendance_pct}% of assembly sessions`,
      detail: `Below 40% attendance in the ${stateName} Legislature`,
      source: `${stateName} Legislature record${term}`,
    })
  }

  // Ward committee never met
  if (committeeMeetings && committeeMeetings.meetings_count === 0) {
    headlines.push({
      priority: 75,
      severity: "red",
      text: "Ward committee has never met",
      detail: "0 of 56 mandated meetings held (2020-2022)",
      source: `Ward committee records${committeeMeetings.period ? ` · ${committeeMeetings.period}` : ""}`,
    })
  }

  // Zero traffic signals
  if (infraStats && infraStats.signal_count === 0) {
    headlines.push({
      priority: 60,
      severity: "yellow",
      text: "This ward has zero traffic signals",
      detail: "City average: 5.5 signals per ward",
      source: "Ward infrastructure records",
    })
  }

  // Low LAD utilization (non-zero)
  if (reportCard?.lad_utilization_pct !== null && reportCard?.lad_utilization_pct !== undefined
    && reportCard.lad_utilization_pct > 0 && reportCard.lad_utilization_pct < 30) {
    headlines.push({
      priority: 55,
      severity: "yellow",
      text: `${reportCard.lad_utilization_pct}% of MLA development funds used`,
      detail: "Most of the area development budget remains unspent",
      source: `MLA LAD fund record${term}`,
    })
  }

  if (headlines.length === 0) return null
  headlines.sort((a, b) => b.priority - a.priority)
  return headlines[0]
}

export function WardHeadline(props: Props) {
  const headline = pickHeadline(props)
  if (!headline) return null

  // Red is a solid block, as in the reference; lesser severities stay tinted
  // so the one alarming finding is never outshouted.
  const styles = {
    red: { box: "bg-danger border-danger", text: "text-paper", detail: "text-paper/85", source: "text-paper/85" },
    yellow: { box: "bg-warning/[0.07] border-warning/35", text: "text-warning", detail: "text-warning/90", source: "text-warning/90" },
    info: { box: "bg-info/[0.07] border-info/35", text: "text-info", detail: "text-info/90", source: "text-info/90" },
  }
  const s = styles[headline.severity]

  return (
    <div className={`mx-5 mb-3 border px-3.5 py-3 ${s.box}`}>
      <p className={`${s.text} text-sm font-semibold leading-snug`}>{headline.text}</p>
      <p className={`${s.detail} text-xs mt-0.5 leading-snug`}>{headline.detail}</p>
      <p className={`${s.source} mt-1.5 font-mono text-[11px] uppercase tracking-[0.06em] leading-snug`}>{headline.source}</p>
    </div>
  )
}
