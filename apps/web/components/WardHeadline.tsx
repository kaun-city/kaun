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
  /**
   * Every input the headline ranks has loaded. Until then a quiet placeholder
   * holds the space, so the reader never sees one finding swap for another.
   */
  settled?: boolean
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

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`
}

export function pickHeadline({ reportCard, committeeMeetings, infraStats, wardContractors, cityId, formerWards }: Props): Headline | null {
  const flagged = wardContractors
    .filter(c => c.blacklist_flags.length > 0)
    .sort((a, b) => (Number(b.total_value_lakh) || 0) - (Number(a.total_value_lakh) || 0))
  const headlines: (Headline & { priority: number })[] = []
  const stateName = getCity(cityId).state
  const term = reportCard?.term ? ` · ${reportCard.term}` : ""

  // Flagged contractors with work orders in this area — most alarming.
  // contractor_profiles totals are each contractor's CITY-WIDE work orders,
  // never this ward's share, so the money is named with its real scope.
  if (flagged.length > 0) {
    // One firm can carry several entity ids (KRIDL appears under two phones);
    // count firms, not rows.
    const firms = new Set(flagged.map(c => c.canonical_name.trim().toLowerCase())).size
    const lead = flagged[0]
    const others = firms - 1
    const years = yearRange(flagged.flatMap(c => [c.first_seen, c.last_seen]))
    const place = formerWards?.length ? "this area" : "this ward"
    const reach = lead.ward_count > 1
      ? `across ${plural(lead.ward_count, "ward")} city-wide`
      : "city-wide, in 1 ward"
    headlines.push({
      priority: 100,
      severity: "red",
      text: firms === 1
        ? `A contractor on a debarment list has work orders in ${place}`
        : `${firms} contractors on debarment lists have work orders in ${place}`,
      detail: [
        `${lead.canonical_name.trim()}: ${formatLakh(lead.total_value_lakh)} in ${plural(lead.total_contracts, "contract")} ${reach}`,
        others > 0 ? `and ${plural(others, "other flagged firm")}` : null,
      ].filter(Boolean).join(", "),
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

  // No ward committee meetings on record. The 2020-22 dataset gives no
  // denominator, so the finding is the zero itself, never "0 of N".
  if (committeeMeetings && committeeMeetings.meetings_count === 0) {
    headlines.push({
      priority: 75,
      severity: "red",
      text: `No ward committee meetings recorded${committeeMeetings.period ? ` in ${committeeMeetings.period}` : ""}`,
      detail: "Ward committees are meant to meet every month",
      source: `BBMP ward committee records via opencity.in${committeeMeetings.period ? ` · ${committeeMeetings.period}` : ""}`,
    })
  }

  // No traffic signals mapped. OpenStreetMap coverage is incomplete, so the
  // claim is about the map, not the street.
  if (infraStats && infraStats.signal_count === 0) {
    headlines.push({
      priority: 60,
      severity: "yellow",
      text: "No traffic signals mapped in this ward",
      detail: "City average: 5.5 mapped signals per ward",
      source: "OpenStreetMap traffic signals",
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
  if (props.settled === false) {
    return (
      <div aria-busy="true" className="mx-5 mb-3 h-[5.25rem] border border-ink/10 px-3.5 py-3">
        <span className="sr-only">Loading the main finding for this ward</span>
        <div aria-hidden="true" className="h-3.5 w-4/5 bg-ink/10 animate-pulse" />
        <div aria-hidden="true" className="mt-2 h-2.5 w-3/5 bg-ink/10 animate-pulse" />
        <div aria-hidden="true" className="mt-3 h-2 w-2/5 bg-ink/10 animate-pulse" />
      </div>
    )
  }

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
