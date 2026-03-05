"use client"

import { useState } from "react"
import { submitFact } from "@/lib/api"
import { OFFICER_SUBJECTS } from "@/lib/constants"
import { getVoterToken } from "@/lib/ward-utils"
import type { CityConfig } from "@/lib/cities"
import type {
  CommunityFact, GbaContact, MlaLadFunds, PinResult,
  RepReportCard, WardCommitteeMeetings, WardProfile,
} from "@/lib/types"
import type { ShowAddFor, WardUnknowns } from "@/hooks/useWardData"
import { AddFactForm } from "@/components/shared/AddFactForm"
import { FactCard } from "@/components/shared/FactCard"
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
import { PartyBadge } from "@/components/shared/PartyBadge"
import { SkeletonCard, SkeletonRepCard, SkeletonScorecard } from "@/components/shared/Skeleton"
import { TrustBadge } from "@/components/shared/TrustBadge"
import { WardStoryCard } from "@/components/shared/WardStoryCard"
import { RTIDraftSheet } from "@/components/shared/RTIDraftSheet"
import type { WardStoryRequest } from "@/app/api/ward-story/route"
import type { RTIDraftRequest } from "@/app/api/rti-draft/route"
import type { WardInfraStats, WardPotholes } from "@/lib/types"

interface Props {
  result: PinResult
  city: CityConfig
  profile: WardProfile | null
  profileLoading: boolean
  unknowns: WardUnknowns | null
  showAddFor: ShowAddFor | null
  onSetShowAddFor: (q: ShowAddFor | null) => void
  committeeMeetings: WardCommitteeMeetings | null
  reportCard: RepReportCard | null
  ladFunds: MlaLadFunds[]
  corpContacts: GbaContact[]
  corpName: string | null
  allFacts: CommunityFact[]
  officerGroups: Record<string, Record<string, CommunityFact>>
  onCorroborate: (id: number) => Promise<void>
  onNewFact: (fact: CommunityFact) => void
  onUnknownsRefresh: () => void
  infraStats: WardInfraStats | null
  potholes: WardPotholes | null
}

export function WhoTab({
  result, city, profile, profileLoading, unknowns, showAddFor, onSetShowAddFor,
  committeeMeetings, reportCard, ladFunds, corpContacts, corpName,
  allFacts, officerGroups, onCorroborate, onNewFact, onUnknownsRefresh,
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
  const storyData: WardStoryRequest | null =
    result.ward_no && result.assembly_constituency
      ? {
          ward_no: result.ward_no,
          ward_name: result.ward_name ?? "",
          assembly_constituency: result.assembly_constituency,
          mla_name: reportCard?.constituency ?? undefined,
          mla_party: profile?.elected_reps?.find(r => r.role === "MLA")?.party ?? undefined,
          mla_attendance_pct: reportCard?.attendance_pct ?? undefined,
          mla_questions_asked: reportCard?.questions_asked ?? undefined,
          mla_lad_utilization_pct: reportCard?.lad_utilization_pct ?? undefined,
          mla_criminal_cases: reportCard?.criminal_cases ?? undefined,
          mla_net_worth_growth_pct: reportCard?.net_worth_growth_pct ?? undefined,
          committee_meetings: committeeMeetings?.meetings_count ?? undefined,
          signal_count: infraStats?.signal_count ?? undefined,
          bus_stop_count: infraStats?.bus_stop_count ?? undefined,
          pothole_complaints: potholes?.complaints ?? undefined,
        }
      : null

  return (
    <>
    <RTIDraftSheet request={rtiRequest} onClose={() => setRtiRequest(null)} />
    <div className="px-5 py-4 space-y-4 pb-safe-content">
      <WardStoryCard storyData={storyData} />

      {/* Knowledge Score */}
      {unknowns ? (
        <div className="rounded-xl bg-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-xs uppercase tracking-wider">Community Knowledge</p>
            <span className="text-white/40 text-xs font-mono">{unknowns.answered}/{unknowns.total_questions}</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(2, (unknowns.answered / unknowns.total_questions) * 100)}%`,
                background: unknowns.answered === 0 ? "#ef4444" : unknowns.answered < unknowns.total_questions / 2 ? "#f59e0b" : "#22c55e",
              }}
            />
          </div>
          <p className="text-white/25 text-[10px]">
            {unknowns.answered === 0
              ? "Nobody has contributed data about this ward yet. Be the first."
              : unknowns.unanswered?.length
                ? `${unknowns.unanswered.length} things still unknown. Help fill the gaps.`
                : "This ward is fully mapped by the community!"}
          </p>
        </div>
      ) : (
        <SkeletonCard lines={2} />
      )}

      {/* Governance alert */}
      {profile?.governance_alert && (
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
          <FreshnessBadge label="Current term" source="GBA" />
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
              <p className={`text-sm font-bold ${(reportCard.lad_utilization_pct ?? 0) < 50 ? "text-red-400" : (reportCard.lad_utilization_pct ?? 0) < 75 ? "text-yellow-400" : "text-green-400"}`}>
                {reportCard.lad_utilization_pct ?? 0}%
              </p>
            </div>
            {reportCard.net_worth_growth_pct !== null && (
              <div className="space-y-0.5">
                <p className="text-white/30 text-[10px]">Net Worth Growth</p>
                <p className={`text-sm font-bold ${reportCard.net_worth_growth_pct > 100 ? "text-red-400" : "text-white/60"}`}>
                  {reportCard.net_worth_growth_pct > 0 ? "+" : ""}{reportCard.net_worth_growth_pct}%
                  {reportCard.net_worth_growth_pct > 100 && <span className="text-[10px] ml-1">!</span>}
                </p>
              </div>
            )}
          </div>
          {(reportCard.criminal_cases ?? 0) > 0 && (
            <div className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="text-red-400 text-xs font-bold">
                {reportCard.criminal_cases} criminal case{reportCard.criminal_cases !== 1 ? "s" : ""} declared
              </span>
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
          <div className="rounded-xl bg-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">Ward Committee</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: grade.color + "22", color: grade.color }}>{grade.label}</span>
                <FreshnessBadge label="2020-22" source="opencity.in" />
              </div>
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
        )
      })() : null}

      {/* Ward Officers */}
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
        ) : (
          <div className="p-3 rounded-xl bg-white/5">
            <p className="text-white/50 text-sm">No officer details yet</p>
            <p className="text-white/25 text-xs mt-1 leading-relaxed">
              Government doesn&apos;t publish this. If you know your ward officer&apos;s name or number, share it below.
            </p>
          </div>
        )}

        {/* GBA Corporation contacts */}
        {corpContacts.length > 0 && corpName && (
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

      {/* Fill-the-gaps prompts */}
      {unknowns?.unanswered && unknowns.unanswered.length > 0 && (
        <div className="space-y-2">
          <p className="text-white/30 text-xs uppercase tracking-wider">Help fill the gaps</p>
          {unknowns.unanswered.slice(0, showAddFor ? 3 : 6).map(q => (
            <button
              key={`${q.category}-${q.subject}-${q.field}`}
              onClick={() => onSetShowAddFor(q)}
              className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                showAddFor?.field === q.field && showAddFor?.subject === q.subject
                  ? "bg-[#FF9933]/10 border border-[#FF9933]/30"
                  : "bg-white/[0.03] hover:bg-white/[0.06] border border-transparent"
              }`}
            >
              <span className="text-sm mr-2">{q.icon}</span>
              <span className="text-white/50 text-xs">{q.prompt}</span>
            </button>
          ))}
        </div>
      )}

      {/* Inline quick-answer form */}
      {showAddFor && result.ward_no && (
        <div className="rounded-xl bg-[#FF9933]/5 border border-[#FF9933]/20 p-3 space-y-2">
          <p className="text-white/60 text-xs">{showAddFor.prompt}</p>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const input = (e.target as HTMLFormElement).elements.namedItem("answer") as HTMLInputElement
              if (!input.value.trim()) return
              const res = await submitFact({
                city_id: result.city_id,
                ward_no: result.ward_no!,
                category: showAddFor!.category,
                subject: showAddFor!.subject,
                field: showAddFor!.field,
                value: input.value.trim(),
                source_type: "community",
                contributor_token: getVoterToken(),
              })
              if (res?.fact) {
                onNewFact(res.fact)
                onSetShowAddFor(null)
                onUnknownsRefresh()
                input.value = ""
              }
            }}
            className="flex gap-2"
          >
            <input
              name="answer"
              type="text"
              placeholder="Type what you know..."
              className="flex-1 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#FF9933]/50"
              autoFocus
            />
            <button type="submit" className="bg-[#FF9933] text-black text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#FF9933]/80 transition-colors shrink-0">
              Share
            </button>
          </form>
          <button onClick={() => onSetShowAddFor(null)} className="text-white/20 text-[10px] hover:text-white/40">cancel</button>
        </div>
      )}

      {/* MLA LAD Fund */}
      {ladFunds.length > 0 && (() => {
        const termRow = ladFunds.find(r => r.financial_year === "ALL")
        const fyRows = ladFunds.filter(r => r.financial_year !== "ALL").sort((a, b) => a.financial_year.localeCompare(b.financial_year))
        if (!termRow) return null
        return (
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
        )
      })()}

      {/* Generic add-fact form */}
      {!showAddFor && profile && result.ward_no && (
        <AddFactForm wardNo={result.ward_no} cityId={result.city_id} onSubmitted={onNewFact} />
      )}
    </div>
    </>
  )
}
