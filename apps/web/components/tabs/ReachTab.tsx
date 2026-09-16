"use client"

import { useState } from "react"
import type { CityConfig } from "@/lib/cities"
import type { Department, LocalOffice, SakalaPerformance, WardGrievances } from "@/lib/types"
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
import { RTIDraftSheet } from "@/components/shared/RTIDraftSheet"
import type { RTIDraftRequest, RTIIssueType } from "@/app/api/rti-draft/route"

const OFFICE_LABELS: Record<string, string> = {
  pincode:               "Pin Code",
  admin_taluk:           "Taluk",
  bescom_division:       "BESCOM Division",
  bescom_subdivision:    "BESCOM Subdivision",
  bwssb_division:        "BWSSB Division",
  bwssb_service_station: "BWSSB Service Station",
  police_city:           "City Police Station",
  police_traffic:        "Traffic Police",
  stamps_sro:            "Sub-Registrar (SRO)",
  stamps_dro:            "Dist. Registrar (DRO)",
}

function formatOfficeName(type: string, name: string): string {
  if (type === "pincode") {
    const parts = name.split(": ")
    return parts.length === 2 ? `${parts[0]} (${parts[1]})` : name
  }
  return name
}

interface Props {
  city: CityConfig
  localOffices: LocalOffice[]
  departments: Department[]
  grievances: WardGrievances[]
  sakala: SakalaPerformance | null
  wardNo: number
  wardName: string
  assemblyConstituency: string
}

const RTI_ISSUES: { type: RTIIssueType; label: string; desc: string }[] = [
  { type: "lad_funds",          label: "MLA Fund Utilization",     desc: "Demand account of unspent LAD funds" },
  { type: "committee_meetings", label: "Ward Committee Meetings",   desc: "Why hasn't your ward committee met?" },
  { type: "pothole_complaints", label: "Pothole Resolution",        desc: "Status of logged road complaints" },
  { type: "ward_spend",         label: "BBMP Ward Expenditure",     desc: "Breakdown of ward budget spending" },
  { type: "work_orders",        label: "Work Order Status",         desc: "Completion status of BBMP work orders" },
]

const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60"
const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
const PHONE_LINK = `inline-flex min-h-11 shrink-0 items-center font-mono text-xs text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent ${FOCUS_RING}`

export function ReachTab({ city, localOffices, departments, grievances, sakala, wardNo, wardName, assemblyConstituency }: Props) {
  const offices = localOffices.filter(o => o.boundary_type !== "gba_corporation")
  const [rtiRequest, setRtiRequest] = useState<RTIDraftRequest | null>(null)
  const [showIssues, setShowIssues] = useState(false)

  return (
    <>
    <RTIDraftSheet request={rtiRequest} onClose={() => setRtiRequest(null)} />
    <div className="px-5 py-4 space-y-6 pb-safe-content">

      {/* Complaint Resolution */}
      {grievances.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={EYEBROW}>Complaint Resolution</p>
            <FreshnessBadge label="2021-23" source="BBMP" />
          </div>
          <div className="border-t border-ink/15">
            {grievances.map(g => {
              const closeRate = g.total_complaints > 0 ? Math.round((g.closed / g.total_complaints) * 100) : 0
              return (
                <div key={g.year} className="flex items-center justify-between gap-4 border-b border-ink/15 py-2.5">
                  <div>
                    <p className="font-mono text-sm font-semibold tabular-nums text-ink">{g.year}</p>
                    <p className="text-xs text-ink/60">{g.total_complaints.toLocaleString("en-IN")} complaints filed</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono text-sm font-semibold tabular-nums ${closeRate >= 90 ? "text-success" : closeRate >= 70 ? "text-warning" : "text-danger"}`}>
                      {closeRate}% resolved
                    </p>
                    {g.registered > 0 && <p className="text-xs text-ink/60">{g.registered.toLocaleString("en-IN")} pending</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sakala Service Delivery */}
      {sakala && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={EYEBROW}>Sakala Service Delivery</p>
            <FreshnessBadge label={String(sakala.year)} source="sakala.kar.nic.in" />
          </div>
          <div className="border-t border-ink/15">
            <div className="flex items-baseline justify-between gap-4 border-b border-ink/15 py-2">
              <span className="text-sm text-ink/80">BBMP rank ({sakala.assembly_name})</span>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">{sakala.rank_overall != null ? `#${sakala.rank_overall} of 28` : "--"}</span>
            </div>
            {sakala.intime_pct != null && (
              <div className="flex items-baseline justify-between gap-4 border-b border-ink/15 py-2">
                <span className="text-sm text-ink/80">In-time delivery</span>
                <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${sakala.intime_pct >= 90 ? "text-success" : sakala.intime_pct >= 75 ? "text-warning" : "text-danger"}`}>
                  {sakala.intime_pct.toFixed(1)}%
                </span>
              </div>
            )}
            {sakala.pending != null && (
              <div className="flex items-baseline justify-between gap-4 border-b border-ink/15 py-2">
                <span className="text-sm text-ink/80">Pending applications</span>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">{sakala.pending.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
          {city.sakalaNote && <p className="text-xs leading-snug text-ink/60">{city.sakalaNote}</p>}
        </div>
      )}

      {/* RTI Section */}
      <div className="space-y-2">
        <button
          onClick={() => setShowIssues(v => !v)}
          aria-expanded={showIssues}
          className={`w-full min-h-11 px-4 py-3 bg-ink text-paper font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-ink/85 transition-colors ${FOCUS_RING}`}
        >
          {showIssues ? "Pick an issue below" : "File an RTI Application"}
        </button>

        {showIssues && (
          <div className="border-y border-ink/15 divide-y divide-ink/10">
            {RTI_ISSUES.map(issue => (
              <button
                key={issue.type}
                onClick={() => { setRtiRequest({ issue_type: issue.type, ward_no: wardNo, ward_name: wardName, assembly_constituency: assemblyConstituency }); setShowIssues(false) }}
                className={`w-full min-h-11 px-2 py-3 flex items-center justify-between gap-3 text-left hover:bg-ink/5 transition-colors ${FOCUS_RING}`}
              >
                <div>
                  <p className="text-sm font-medium text-ink">{issue.label}</p>
                  <p className="text-xs text-ink/60">{issue.desc}</p>
                </div>
                <span aria-hidden="true" className="text-lg text-ink/50">›</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink/60">RTI Act 2005 · ₹10 fee · 30-day response</p>
          <a
            href="https://rtionline.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-11 shrink-0 items-center text-xs text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent ${FOCUS_RING}`}
          >
            File online (Central Govt)
          </a>
        </div>
      </div>

      {/* Local Offices */}
      {offices.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={EYEBROW}>Your Local Offices</p>
            <FreshnessBadge label="2024" source="opencity.in" />
          </div>
          <div className="border-t border-ink/15">
            {offices.map(o => (
              <div key={o.boundary_type} className="flex min-h-11 items-center justify-between gap-3 border-b border-ink/15 py-2">
                <div className="min-w-0">
                  <span className="block text-xs text-ink/60">{OFFICE_LABELS[o.boundary_type] ?? o.boundary_type}</span>
                  <p className={`text-sm font-semibold text-ink ${o.boundary_type === "pincode" ? "font-mono tabular-nums" : ""}`}>
                    {formatOfficeName(o.boundary_type, o.name)}
                  </p>
                </div>
                {o.phone && (
                  <a href={`tel:${o.phone.replace(/\s/g, "")}`} className={PHONE_LINK}>
                    {o.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-y border-ink/15 py-4 text-center space-y-1">
          <p className="text-sm text-ink/60">Loading local offices...</p>
          <div className="h-2 w-full bg-ink/10 animate-pulse mt-2" />
          <div className="h-2 w-3/4 bg-ink/10 animate-pulse" />
        </div>
      )}

      {/* Agencies & Helplines */}
      {departments.length > 0 ? (
        <div className="space-y-2">
          <p className={EYEBROW}>Agencies &amp; Helplines</p>
          <div className="border-t border-ink/15">
            {departments.filter(d => d.complaint_url || d.toll_free || d.helpline).map(dept => (
              <a
                key={dept.short}
                href={dept.complaint_url || dept.website || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex min-h-11 items-center justify-between border-b border-ink/15 py-2.5 hover:bg-ink/5 active:bg-ink/10 transition-colors ${FOCUS_RING}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink group-hover:underline group-hover:decoration-ink/40 group-hover:underline-offset-2">{dept.short}</p>
                  <p className="truncate text-xs text-ink/60">{dept.name}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  {dept.toll_free
                    ? <span className="font-mono text-sm font-semibold tabular-nums text-accent">{dept.toll_free}</span>
                    : dept.helpline
                      ? <span className="font-mono text-xs tabular-nums text-accent">{dept.helpline}</span>
                      : <span className="text-xs text-accent">File online &rarr;</span>}
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className={EYEBROW}>Agencies &amp; Helplines</p>
          <div className="border-t border-ink/15">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex items-center justify-between border-b border-ink/15 py-3">
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-16 bg-ink/10 animate-pulse" />
                  <div className="h-2.5 w-32 bg-ink/10 animate-pulse" />
                </div>
                <div className="h-4 w-12 bg-ink/10 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  )
}
