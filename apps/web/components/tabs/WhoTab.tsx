"use client"

import { useState } from "react"
import { OFFICER_SUBJECTS } from "@/lib/constants"
import type { CityConfig } from "@/lib/cities"
import type {
  CommunityFact, GbaContact, MlaLadFunds, PinResult,
  RepReportCard, WardCommitteeMeetings, WardProfile,
} from "@/lib/types"


/** Collapsible wrapper for data older than ~2 years */
function HistoricalSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-white/5 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-white/20 text-[10px] uppercase tracking-widest font-semibold">Historical</span>
          <span className="text-white/15 text-[10px] font-mono">{label}</span>
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          className={`text-white/20 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div className="p-3 pt-0 space-y-3 bg-white/[0.02]">{children}</div>}
    </div>
  )
}
import { FactCard } from "@/components/shared/FactCard"
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
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
  result, city, profile, profileLoading,
  committeeMeetings, reportCard, ladFunds, corpContacts, corpName,
  allFacts, officerGroups, onCorroborate, onNewFact,
  infraStats, potholes,
}: Props) {
  const [rtiRequest, setRtiRequest] = useState<RTIDraftRequest | null>(null)

  function rtiBase(): Omit<RTIDraftRequest, "issue_type"> {
    return {
      ward_no: result.ward_no ?? 0,
      ward_name: result.ward_name ?? "",
      assembly_constituency: result.assembly_constituency ?? "",
      mla_name: profile?.elected_reps?.find(r => r.role === "MLA")?.name ?? undefined,
      mla_party: profile?.elected_reps?.find(r => r.role === "MLA")?.party ?? undefined,
    }
  }

  // Build story payload once we have the key data points
  // Wait for profile to load before building storyData
  return (
    <>
    <RTIDraftSheet request={rtiRequest} onClose={() => setRtiRequest(null)} />
    <div className="px-5 py-4 space-y-4 pb-safe-content">


      {/* GHMC administrator notice (Hyderabad) */}
      {city.civicBody === "GHMC" && (
        <div className="flex gap-2.5 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <span className="text-yellow-400 text-base mt-0.5">!</span>
          <div>
            <p className="text-yellow-400 text-xs font-semibold">GHMC under administrator rule</p>
            <p className="text-white/40 text-xs leading-snug mt-0.5">Elected corporators’ term ended in Feb 2023. GHMC has been under an administrator since then. The 2020 election results are shown as historical reference.</p>
          </div>
        </div>
      )}

      {/* Governance alert — skip the "No elected corporator" noise (applies to all 243 wards) */}
      {profile?.governance_alert && profile.governance_alert.title !== "No elected corporator" && (
        <div className="flex gap-2.5 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <span className="text-yellow-400 text-base mt-0.5">!</span>
          <div>
            <p className="text-yellow-400 text-xs font-semibold">{profile.governance_alert.title}</p>
            <p className="text-white/40 text-xs leading-snug mt-0.5">{profile.governance_alert.body}</p>
          </div>
        </div>
      )}

      {/* Elected representatives */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-white/30 text-xs uppercase tracking-wider">Elected Representatives</p>
          <FreshnessBadge
            label={city.id === "hyderabad" ? "2020 (historical)" : "Current term"}
            source={city.id === "hyderabad" ? "Wikipedia" : "GBA"}
          />
        </div>
        {profileLoading && !profile ? (
          <><SkeletonRepCard /><SkeletonRepCard /></>
        ) : profile && profile.elected_reps.length > 0 ? (
          profile.elected_reps.map(rep => (
            <div key={rep.id} className="p-3 rounded-xl bg-white/5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white/40 text-xs">{rep.role}</span>
                    {rep.party && <PartyBadge party={rep.party} />}
                  </div>
                  <p className="text-white font-semibold text-sm mt-0.5">{rep.name}</p>
                  <p className="text-white/30 text-xs">{rep.constituency} constituency</p>
                  {rep.elected_since && <p className="text-white/25 text-xs">Elected {rep.elected_since}</p>}
                  {rep.phone && (
                    <a href={`tel:${rep.phone.replace(/\s/g, "")}`} className="text-[#FF9933] text-xs font-mono hover:underline block mt-0.5">
                      {rep.phone}
                    </a>
                  )}
                  {rep.notes && <p className="text-white/30 text-xs mt-1 italic">{rep.notes}</p>}
                </div>
                {rep.profile_url && (
                  <a href={rep.profile_url} target="_blank" rel="noopener noreferrer"
                    className="text-[#FF9933]/60 hover:text-[#FF9933] text-xs transition-colors whitespace-nowrap mt-1">
                    Profile &rarr;
                  </a>
                )}
              </div>
            </div>
          ))
        ) : !profileLoading ? (
          <div className="p-3 rounded-xl bg-white/5 text-center">
            <p className="text-white/30 text-sm">No representative data yet</p>
            <p className="text-white/20 text-xs mt-1">Data not yet linked for this ward.</p>
          </div>
        ) : null}
      </div>

      {/* GHMC helpline (Hyderabad) */}
      {city.helplineNumber && city.id === "hyderabad" && (
        <div className="p-3 rounded-xl bg-white/5 flex items-center justify-between">
          <div>
            <p className="text-white/30 text-xs uppercase tracking-wider">GHMC Helpline</p>
            <p className="text-white/60 text-xs mt-0.5">Report civic issues: roads, drainage, garbage</p>
          </div>
          <a href={`tel:${city.helplineNumber}`} className="text-[#FF9933] font-mono text-sm font-semibold hover:underline">
            {city.helplineNumber}
          </a>
        </div>
      )}

      {/* MLA Report Card */}
      {reportCard ? (
        <div className="rounded-xl bg-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[10px] uppercase tracking-wider">MLA Scorecard</p>
            <FreshnessBadge label="2023-25" source={`CIVIC ${city.name}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <p className="text-white/30 text-[10px]">Attendance</p>
              {reportCard.attendance_pct !== null
                ? <p className={`text-sm font-bold ${reportCard.attendance_pct < 75 ? "text-red-400" : reportCard.attendance_pct < 85 ? "text-yellow-400" : "text-green-400"}`}>{reportCard.attendance_pct}%</p>
                : <p className="text-white/20 text-xs italic">N/A (Minister)</p>}
            </div>
            {reportCard.questions_asked !== null && (
              <div className="space-y-0.5">
                <p className="text-white/30 text-[10px]">Questions Asked</p>
                <p className={`text-sm font-bold ${reportCard.questions_asked === 0 ? "text-red-400" : reportCard.questions_asked < 10 ? "text-yellow-400" : "text-green-400"}`}>
                  {reportCard.questions_asked}
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              <p className="text-white/30 text-[10px]">LAD Fund Used</p>
              {reportCard.lad_utilization_pct !== null ? (
                <p className={`text-sm font-bold ${Number(reportCard.lad_utilization_pct) < 50 ? "text-red-400" : Number(reportCard.lad_utilization_pct) < 75 ? "text-yellow-400" : "text-green-400"}`}>
                  {reportCard.lad_utilization_pct}%
                </p>
              ) : (
                <p className="text-white/20 text-xs italic">No data</p>
              )}
            </div>
            {reportCard.net_worth_growth_pct !== null && (
              <div className="space-y-0.5">
                <p className="text-white/30 text-[10px]">Net Worth Growth</p>
                <p className={`text-sm font-bold ${Number(reportCard.net_worth_growth_pct) > 100 ? "text-red-400" : "text-white/60"}`}>
                  {Number(reportCard.net_worth_growth_pct) > 0 ? "+" : ""}{reportCard.net_worth_growth_pct}%
                  {Number(reportCard.net_worth_growth_pct) > 100 && <span className="text-[10px] ml-1">!</span>}
                </p>
              </div>
            )}
          </div>

          {/* Net worth source note */}
          {reportCard.net_worth_growth_pct !== null && (
            <p className="text-white/20 text-[10px] italic">Net worth: self-declared in EC nomination affidavit</p>
          )}

          {/* Criminal cases */}
          {(reportCard.criminal_cases ?? 0) > 0 && (
            <div className="flex flex-col gap-1 mt-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="text-red-400 text-xs font-bold">
                {reportCard.criminal_cases} criminal case{reportCard.criminal_cases !== 1 ? "s" : ""} declared
              </span>
              <span className="text-white/25 text-[10px]">Self-declared in Election Commission nomination affidavit</span>
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
        const grade = count === 0 ? { label: "Never met", color: "#ef4444" }
          : count < 10 ? { label: "Rarely meets", color: "#f97316" }
          : count < 25 ? { label: "Meets sometimes", color: "#eab308" }
          : { label: "Meets regularly", color: "#22c55e" }
        return (
          <HistoricalSection label="2020-22">
          <div className="rounded-xl bg-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">Ward Committee</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: grade.color + "22", color: grade.color }}>{grade.label}</span>
            </div>
            <div className="flex justify-end -mt-1">
              <FreshnessBadge label="2020-22" source="opencity.in" />
            </div>
            <div className="flex items-center gap-3">
              <p style={{ color: grade.color }} className="text-2xl font-bold">{count}</p>
              <p className="text-white/40 text-xs">meetings held<br /><span className="text-white/25">out of a possible ~48 over 2 years</span></p>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: grade.color + "99" }} />
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <p className="text-white/15 text-[10px]">Ward committees are mandated to meet monthly</p>
              {count < 25 && (
                <button
                  onClick={() => setRtiRequest({ ...rtiBase(), issue_type: "committee_meetings", committee_meetings: count })}
                  className="text-[10px] text-[#FF9933]/70 hover:text-[#FF9933] underline transition-colors"
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
        <div className="flex items-center justify-between">
          <p className="text-white/30 text-xs uppercase tracking-wider">Ward Officers</p>
          {allFacts.filter(f => f.category === "officer").length > 0 && (
            <span className="text-white/20 text-[10px]">community reported</span>
          )}
        </div>

        {profileLoading && !profile ? (
          <SkeletonCard lines={3} />
        ) : profile && profile.officers.length > 0 ? (
          profile.officers.map(o => (
            <div key={o.id} className="p-3 rounded-xl bg-white/5">
              <div className="flex items-center justify-between">
                <p className="text-white/40 text-xs">{o.role}  -  {o.department}</p>
                <TrustBadge level={o.source === "rti" ? "rti" : "official"} />
              </div>
              <p className="text-white text-sm font-medium">{o.name ?? "Name not disclosed"}</p>
              {o.phone && <p className="text-white/40 text-xs">{o.phone}</p>}
            </div>
          ))
        ) : Object.keys(officerGroups).length > 0 ? (
          Object.entries(officerGroups).map(([subject, fields]) => (
            <div key={subject} className="p-3 rounded-xl bg-white/5 space-y-2">
              <p className="text-white/40 text-xs font-medium">{OFFICER_SUBJECTS[subject] ?? subject}</p>
              {Object.values(fields).map(fact => (
                <FactCard key={fact.id} fact={fact} onCorroborate={onCorroborate} />
              ))}
            </div>
          ))
        ) : null}

        {/* GBA Corporation contacts — Bengaluru only */}
        {city.id === "bengaluru" && corpContacts.length > 0 && corpName && (
          <div className="rounded-xl bg-white/5 p-3 space-y-2 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">
                {corpName.replace("Bengaluru ", "").replace(" City Corporation", "")} City Corporation
              </p>
              <FreshnessBadge label="Dec 2025" source="BBMP" />
            </div>
            {corpContacts.filter(c => ["Commissioner", "Health Officer"].includes(c.role)).map(c => (
              <div key={c.role} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white/30 text-xs">{c.role}</p>
                  <p className="text-white text-xs font-semibold truncate">{c.name}</p>
                </div>
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-[#FF9933] text-xs font-mono shrink-0 hover:underline">
                    {c.phone}
                  </a>
                )}
              </div>
            ))}
            {(() => {
              const comm = corpContacts.find(c => c.control_room)
              return comm?.control_room
                ? <p className="text-white/20 text-[10px] pt-1">Control room: {comm.control_room}</p>
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
          <div className="rounded-xl bg-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">MLA LAD Fund</p>
              <div className="flex items-center gap-1.5">
                <p className="text-[#FF9933] font-bold text-sm">Rs.{Math.round(termRow.total_lakh / 100 * 10) / 10} Cr</p>
                <FreshnessBadge label="2013-18" source="opencity.in" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-white/40 text-xs">{termRow.project_count} projects in your constituency</p>
              <button
                onClick={() => setRtiRequest({ ...rtiBase(), issue_type: "lad_funds", lad_total_lakh: termRow.total_lakh })}
                className="text-[10px] text-[#FF9933]/70 hover:text-[#FF9933] underline transition-colors"
              >
                File RTI
              </button>
            </div>
            <div className="space-y-1">
              {fyRows.map(r => (
                <div key={r.financial_year} className="flex items-center justify-between gap-2">
                  <span className="text-white/30 text-[10px] font-mono">{r.financial_year.trim()}</span>
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#FF9933]/40 rounded-full" style={{ width: `${Math.min(100, (r.total_lakh / termRow.total_lakh) * 100 * fyRows.length)}%` }} />
                  </div>
                  <span className="text-white/40 text-[10px] font-mono shrink-0">Rs.{Math.round(r.total_lakh)} L</span>
                  <span className="text-white/20 text-[10px] shrink-0">{r.project_count}p</span>
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
