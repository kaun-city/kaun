"use client"

import { useState } from "react"
import type { ContractorProfile, RepReportCard, WardCommitteeMeetings, WardInfraStats, WardPotholes } from "@/lib/types"

interface Props {
  reportCard: RepReportCard | null
  committeeMeetings: WardCommitteeMeetings | null
  infraStats: WardInfraStats | null
  potholes: WardPotholes | null
  wardContractors: ContractorProfile[]
  cityId?: string
}

interface EvidenceItem {
  label: string
  value: string
  note: string
  /** A count that is itself a warning sign, set in the danger colour. */
  alarm?: boolean
}

function availableEvidence(props: Props): EvidenceItem[] {
  const items: EvidenceItem[] = []
  const { reportCard, committeeMeetings, infraStats, potholes, wardContractors } = props

  if (reportCard?.attendance_pct != null) items.push({
    label: "MLA attendance",
    value: `${reportCard.attendance_pct}%`,
    note: `${reportCard.term} assembly record`,
  })
  if (reportCard?.lad_utilization_pct != null) items.push({
    label: "LAD fund used",
    value: `${reportCard.lad_utilization_pct}%`,
    note: "Constituency development funds",
  })
  if (reportCard?.criminal_cases != null) items.push({
    label: "Declared cases",
    value: String(reportCard.criminal_cases),
    note: "Candidate election affidavit",
    alarm: reportCard.criminal_cases > 0,
  })
  if (committeeMeetings) items.push({
    label: "Ward meetings",
    value: String(committeeMeetings.meetings_count),
    note: committeeMeetings.period,
  })
  if (infraStats?.signal_count != null) items.push({
    label: "Traffic signals",
    value: String(infraStats.signal_count),
    note: "Mapped public infrastructure",
  })
  if (potholes) items.push({
    label: "Pothole reports",
    value: potholes.complaints.toLocaleString("en-IN"),
    note: potholes.data_year,
  })
  if (wardContractors.length > 0) {
    const flagged = wardContractors.filter(contractor => contractor.blacklist_flags.length > 0).length
    items.push({
      label: "Contractor flags",
      value: String(flagged),
      note: `${wardContractors.length} contractor${wardContractors.length === 1 ? "" : "s"} checked`,
      alarm: flagged > 0,
    })
  }
  return items
}

const VISIBLE_ROWS = 4

/**
 * Raw evidence replaces the old weighted ward score. Unlike a composite
 * number, every measure can be understood, sourced and challenged on its own.
 * The first rows stay visible, as in the reference record sheet.
 */
export function WardGrade(props: Props) {
  const [open, setOpen] = useState(false)
  const evidence = availableEvidence(props)
  if (evidence.length === 0) return null

  const rows = open ? evidence : evidence.slice(0, VISIBLE_ROWS)
  const hidden = evidence.length - VISIBLE_ROWS

  return (
    <div className="mx-5 mb-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">
        Evidence snapshot · {evidence.length} measure{evidence.length === 1 ? "" : "s"}
      </p>
      <dl className="mt-1.5 border-t border-ink/15">
        {rows.map(item => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 border-b border-ink/15 py-2">
            <dt className="min-w-0">
              <span className="block text-sm text-ink/80">{item.label}</span>
              <span className="block text-xs leading-snug text-ink/60">{item.note}</span>
            </dt>
            <dd className={`shrink-0 font-mono text-base font-semibold tabular-nums ${item.alarm ? "text-danger" : "text-ink"}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-between text-left text-xs text-ink/60 hover:text-ink"
        >
          <span>{open ? "Show fewer measures" : `Show ${hidden} more measure${hidden === 1 ? "" : "s"}`}</span>
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      )}
    </div>
  )
}
