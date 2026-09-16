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
      note: `${wardContractors.length} contractors checked`,
    })
  }
  return items
}

/**
 * Raw evidence replaces the old weighted ward score. Unlike a composite
 * number, every measure can be understood, sourced and challenged on its own.
 */
export function WardGrade(props: Props) {
  const [open, setOpen] = useState(false)
  const evidence = availableEvidence(props)
  if (evidence.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 border-y border-white/10 py-2 text-left"
      >
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#FF9933]">
          Evidence snapshot · {evidence.length} measures
        </span>
        <span aria-hidden="true" className="text-white/35">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="grid grid-cols-2 border-b border-white/10 bg-white/5 sm:grid-cols-3">
          {evidence.map(item => (
            <div key={item.label} className="border-r border-t border-white/10 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/45">{item.label}</p>
              <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
              <p className="mt-1 text-xs leading-snug text-white/35">{item.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
