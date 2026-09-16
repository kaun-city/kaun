"use client"

import { useState } from "react"
import { OFFICER_SUBJECTS } from "@/lib/constants"
import type { CityConfig } from "@/lib/cities"
import type {
  CommunityFact, ElectedRep, GbaContact, MlaLadFunds, PinResult,
  RepReportCard, WardCommitteeMeetings, WardProfile,
} from "@/lib/types"


const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60"
const PROVENANCE = "font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60"
const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
const TEXT_LINK = `text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent ${FOCUS_RING}`

/** Collapsible wrapper for data older than ~2 years */
function HistoricalSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-ink/15">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`w-full min-h-11 flex items-center justify-between px-3 py-2.5 bg-paper-muted hover:bg-ink/10 transition-colors ${FOCUS_RING}`}
      >
        <div className="flex items-center gap-2">
          <span className={EYEBROW}>Historical</span>
          <span className="font-mono text-[11px] text-ink/60">{label}</span>
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
          className={`text-ink/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div className="p-3 space-y-3 border-t border-ink/15">{children}</div>}
    </div>
  )
}
import { FactCard } from "@/components/shared/FactCard"
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
import { formatLakh } from "@/lib/ward-utils"
import { PartyBadge } from "@/components/shared/PartyBadge"
import { SkeletonCard, SkeletonRepCard, SkeletonScorecard } from "@/components/shared/Skeleton"
import { TrustBadge } from "@/components/shared/TrustBadge"
import { RTIDraftSheet } from "@/components/shared/RTIDraftSheet"
import type { RTIDraftRequest } from "@/app/api/rti-draft/route"
import type { WardInfraStats, WardPotholes } from "@/lib/types"

interface Props {
  result: PinResult
  city: CityConfig
  profile: WardProfile | null
  profileLoading: boolean
  electedReps: ElectedRep[]
  committeeMeetings: WardCommitteeMeetings | null
  reportCard: RepReportCard | null
  ladFunds: MlaLadFunds[]
  corpContacts: GbaContact[]
  corpName: string | null
  allFacts: CommunityFact[]
  officerGroups: Record<string, Record<string, CommunityFact>>
  onCorroborate: (id: number) => Promise<void>
  onNewFact: (fact: CommunityFact) => void
  infraStats: WardInfraStats | null
  potholes: WardPotholes | null
}

export function WhoTab({
  result, city, profile, profileLoading, electedReps,
  committeeMeetings, reportCard, ladFunds, corpContacts, corpName,
  allFacts, officerGroups, onCorroborate, onNewFact,
  infraStats, potholes,
}: Props) {
  const [rtiRequest, setRtiRequest] = useState<RTIDraftRequest | null>(null)

  function rtiBase(): Omit<RTIDraftRequest, "issue_type"> {
    const historicalWard = result.historical_wards?.[0]
    return {
      ward_no: historicalWard?.ward_no ?? result.ward_no ?? 0,
      ward_name: result.gba_ward_name ?? result.ward_name ?? "",
      assembly_constituency: result.gba_ac ?? result.assembly_constituency ?? "",
      mla_name: electedReps.find(r => r.role === "MLA")?.name ?? undefined,
      mla_party: electedReps.find(r => r.role === "MLA")?.party ?? undefined,
    }
  }

  // Build story payload once we have the key data points
  // Wait for profile to load before building storyData
  return (
    <>
    <RTIDraftSheet request={rtiRequest} onClose={() => setRtiRequest(null)} />
    <div className="px-5 py-4 space-y-6 pb-safe-content">


      {/* Governance alert — skip the "No elected corporator" noise (applies citywide) */}
      {profile?.governance_alert && profile.governance_alert.title !== "No elected corporator" && (
        <div className="flex gap-2.5 p-3 bg-warning/[0.07] border border-warning/35">
          <span aria-hidden="true" className="text-warning text-base font-semibold leading-none mt-0.5">!</span>
          <div>
            <p className="text-warning text-xs font-semibold">{profile.governance_alert.title}</p>
            <p className="text-ink/75 text-xs leading-snug mt-0.5">{profile.governance_alert.body}</p>
          </div>
        </div>
      )}

      {/* Elected representatives */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className={EYEBROW}>Elected Representatives</p>
          <FreshnessBadge label="Current term" source="GBA" />
        </div>
        {profileLoading && !profile ? (
          <><SkeletonRepCard /><SkeletonRepCard /></>
        ) : electedReps.length > 0 ? (
          <div className="border-t border-ink/15">
            {electedReps.map(rep => (
              <div key={rep.id} className="border-b border-ink/15 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={EYEBROW}>{rep.role}</span>
                      {rep.party && <PartyBadge party={rep.party} />}
                    </div>
                    <p className="text-ink font-semibold text-base leading-snug mt-1">{rep.name}</p>
                    <p className="text-ink/70 text-xs">{rep.constituency} constituency</p>
                    {rep.elected_since && <p className="text-ink/60 text-xs">Elected {rep.elected_since}</p>}
                    {rep.phone && (
                      <a href={`tel:${rep.phone.replace(/\s/g, "")}`} className={`inline-flex min-h-11 items-center font-mono text-sm tabular-nums ${TEXT_LINK}`}>
                        {rep.phone}
                      </a>
                    )}
                    {rep.notes && <p className="text-ink/60 text-xs mt-1 leading-snug">{rep.notes}</p>}
                  </div>
                  {rep.profile_url && (
                    <a href={rep.profile_url} target="_blank" rel="noopener noreferrer"
                      className={`-mt-3 inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-xs ${TEXT_LINK}`}>
                      Profile &rarr;
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : !profileLoading ? (
          <div className="border-y border-ink/15 py-4 text-center">
            <p className="text-ink/70 text-sm">No representative data yet</p>
            <p className="text-ink/60 text-xs mt-1">Data not yet linked for this ward.</p>
          </div>
        ) : null}
      </div>

      {/* MLA Report Card */}
      {reportCard ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={EYEBROW}>MLA Scorecard</p>
            <FreshnessBadge label="2023-25" source={`CIVIC ${city.name}`} />
          </div>
          <div className="grid grid-cols-2 border-t border-ink/15">
            <div className="border-b border-ink/15 py-2 odd:pr-3 even:border-l even:pl-3">
              <p className="text-ink/70 text-xs">Attendance</p>
              {reportCard.attendance_pct !== null
                ? <p className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${reportCard.attendance_pct < 40 ? "text-danger" : "text-ink"}`}>{reportCard.attendance_pct}%</p>
                : <p className="mt-0.5 text-ink/60 text-xs">N/A (Minister)</p>}
            </div>
            {reportCard.questions_asked !== null && (
              <div className="border-b border-ink/15 py-2 odd:pr-3 even:border-l even:pl-3">
                <p className="text-ink/70 text-xs">Questions Asked</p>
                <p className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${reportCard.questions_asked === 0 ? "text-danger" : "text-ink"}`}>
                  {reportCard.questions_asked}
                </p>
              </div>
            )}
            <div className="border-b border-ink/15 py-2 odd:pr-3 even:border-l even:pl-3">
              <p className="text-ink/70 text-xs">LAD Fund Used</p>
              {reportCard.lad_utilization_pct !== null ? (
                <p className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${Number(reportCard.lad_utilization_pct) === 0 ? "text-danger" : Number(reportCard.lad_utilization_pct) < 30 ? "text-warning" : "text-ink"}`}>
                  {reportCard.lad_utilization_pct}%
                </p>
              ) : (
                <p className="mt-0.5 text-ink/60 text-xs">No data</p>
              )}
            </div>
            {reportCard.net_worth_growth_pct !== null && (
              <div className="border-b border-ink/15 py-2 odd:pr-3 even:border-l even:pl-3">
                <p className="text-ink/70 text-xs">Net Worth Growth</p>
                <p className={`mt-0.5 font-mono text-base font-semibold tabular-nums text-ink`}>
                  {Number(reportCard.net_worth_growth_pct) > 0 ? "+" : ""}{reportCard.net_worth_growth_pct}%
                </p>
              </div>
            )}
          </div>

          {/* Net worth source note */}
          {reportCard.net_worth_growth_pct !== null && (
            <p className={PROVENANCE}>Net worth: self-declared in EC nomination affidavit</p>
          )}

          {/* Criminal cases */}
          {(reportCard.criminal_cases ?? 0) > 0 && (
            <div className="flex flex-col gap-1 mt-1 px-3 py-2 bg-danger/[0.07] border border-danger/35">
              <span className="text-danger text-xs font-semibold">
                {reportCard.criminal_cases} criminal case{reportCard.criminal_cases !== 1 ? "s" : ""} declared
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/70">Self-declared in Election Commission nomination affidavit</span>
            </div>
          )}
        </div>
      ) : profileLoading ? (
        <SkeletonScorecard />
      ) : null}

      {/* Ward Committee Meetings */}
      {committeeMeetings ? (() => {
        const count = committeeMeetings.meetings_count
        const MAX = 56
        const pct = Math.round((count / MAX) * 100)
        const tones = {
          danger:  { chip: "border-danger/35 bg-danger/[0.07] text-danger",    value: "text-danger",  bar: "bg-danger" },
          warning: { chip: "border-warning/35 bg-warning/[0.07] text-warning", value: "text-warning", bar: "bg-ink/70" },
          success: { chip: "border-success/35 bg-success/[0.07] text-success", value: "text-success", bar: "bg-ink/70" },
        }
        const grade = count === 0 ? { label: "Never met", tone: tones.danger }
          : count < 10 ? { label: "Rarely meets", tone: tones.warning }
          : count < 25 ? { label: "Meets sometimes", tone: tones.warning }
          : { label: "Meets regularly", tone: tones.success }
        return (
          <HistoricalSection label="2020-22">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className={EYEBROW}>Ward Committee</p>
              <span className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none ${grade.tone.chip}`}>{grade.label}</span>
            </div>
            <div className="flex justify-end -mt-1">
              <FreshnessBadge label="2020-22" source="opencity.in" />
            </div>
            <div className="flex items-center gap-3">
              <p className={`font-mono text-2xl font-semibold tabular-nums ${grade.tone.value}`}>{count}</p>
              <p className="text-ink/80 text-xs">meetings held<br /><span className="text-ink/60">out of a possible ~48 over 2 years</span></p>
            </div>
            <div className="w-full h-1.5 bg-ink/10 overflow-hidden">
              <div className={`h-full transition-all ${grade.tone.bar}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-ink/60 text-xs">Ward committees are mandated to meet monthly</p>
              {count < 25 && (
                <button
                  onClick={() => setRtiRequest({ ...rtiBase(), issue_type: "committee_meetings", committee_meetings: count })}
                  className={`inline-flex min-h-11 shrink-0 items-center text-xs transition-colors ${TEXT_LINK}`}
                >
                  File RTI
                </button>
              )}
            </div>
          </div>
          </HistoricalSection>
        )
      })() : null}

      {/* Ward Officers — only show if data exists */}
      {(profileLoading || (profile && (profile.officers.length > 0 || Object.keys(officerGroups).length > 0)) || corpContacts.length > 0) && (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className={EYEBROW}>Ward Officers</p>
          {allFacts.filter(f => f.category === "officer").length > 0 && (
            <span className="font-mono text-[11px] text-ink/60">community reported</span>
          )}
        </div>

        {profileLoading && !profile ? (
          <SkeletonCard lines={3} />
        ) : profile && profile.officers.length > 0 ? (
          <div className="border-t border-ink/15">
            {profile.officers.map(o => (
              <div key={o.id} className="border-b border-ink/15 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink/70 text-xs">{o.role}  -  {o.department}</p>
                  <TrustBadge level={o.source === "rti" ? "rti" : "official"} />
                </div>
                <p className="text-ink text-sm font-medium mt-0.5">{o.name ?? "Name not disclosed"}</p>
                {o.phone && <p className="font-mono text-xs tabular-nums text-ink/75">{o.phone}</p>}
              </div>
            ))}
          </div>
        ) : Object.keys(officerGroups).length > 0 ? (
          <div className="border-t border-ink/15">
            {Object.entries(officerGroups).map(([subject, fields]) => (
              <div key={subject} className="border-b border-ink/15 py-3 space-y-1">
                <p className="text-ink/70 text-xs font-medium">{OFFICER_SUBJECTS[subject] ?? subject}</p>
                {Object.values(fields).map(fact => (
                  <FactCard key={fact.id} fact={fact} onCorroborate={onCorroborate} />
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {/* GBA Corporation contacts */}
        {corpContacts.length > 0 && corpName && (
          <div className="space-y-2 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className={EYEBROW}>
                {corpName.replace("Bengaluru ", "").replace(" City Corporation", "")} City Corporation
              </p>
              <FreshnessBadge label="Dec 2025" source="BBMP" />
            </div>
            <div className="border-t border-ink/15">
              {corpContacts.filter(c => ["Commissioner", "Health Officer"].includes(c.role)).map(c => (
                <div key={c.role} className="flex min-h-11 items-center justify-between gap-3 border-b border-ink/15 py-2">
                  <div className="min-w-0">
                    <p className="text-ink/60 text-xs">{c.role}</p>
                    <p className="text-ink text-sm font-semibold truncate">{c.name}</p>
                  </div>
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className={`inline-flex min-h-11 shrink-0 items-center font-mono text-xs tabular-nums ${TEXT_LINK}`}>
                      {c.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
            {(() => {
              const comm = corpContacts.find(c => c.control_room)
              return comm?.control_room
                ? <p className="text-ink/60 text-xs pt-1">Control room: {comm.control_room}</p>
                : null
            })()}
          </div>
        )}
      </div>
      )}



      {/* MLA LAD Fund */}
      {ladFunds.length > 0 && (() => {
        const termRow = ladFunds.find(r => r.financial_year === "ALL")
        const fyRows = ladFunds.filter(r => r.financial_year !== "ALL").sort((a, b) => a.financial_year.localeCompare(b.financial_year))
        if (!termRow) return null
        return (
          <HistoricalSection label="2013-18 · previous MLA term">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className={EYEBROW}>MLA LAD Fund</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm font-semibold tabular-nums text-ink">{formatLakh(termRow.total_lakh)}</p>
                <FreshnessBadge label="2013-18" source="opencity.in" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-ink/70 text-xs">{termRow.project_count} projects in your constituency</p>
              <button
                onClick={() => setRtiRequest({ ...rtiBase(), issue_type: "lad_funds", lad_total_lakh: termRow.total_lakh })}
                className={`inline-flex min-h-11 shrink-0 items-center text-xs transition-colors ${TEXT_LINK}`}
              >
                File RTI
              </button>
            </div>
            <div className="space-y-1.5">
              {fyRows.map(r => (
                <div key={r.financial_year} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-ink/60">{r.financial_year.trim()}</span>
                  <div className="flex-1 h-1 bg-ink/10 overflow-hidden">
                    <div className="h-full bg-ink/70" style={{ width: `${Math.min(100, (r.total_lakh / termRow.total_lakh) * 100 * fyRows.length)}%` }} />
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-ink/75 shrink-0">{formatLakh(r.total_lakh)}</span>
                  <span className="font-mono text-[11px] tabular-nums text-ink/60 shrink-0">{r.project_count}p</span>
                </div>
              ))}
            </div>
          </div>
          </HistoricalSection>
        )
      })()}


    </div>
    </>
  )
}
