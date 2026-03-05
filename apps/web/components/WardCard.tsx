"use client"

import { useRef, useState, useCallback } from "react"
import type { PinResult } from "@/lib/types"
import { useWardData } from "@/hooks/useWardData"
import { useKeyboardAware } from "@/hooks/useKeyboardAware"
import { WhoTab } from "@/components/tabs/WhoTab"
import { SpendTab } from "@/components/tabs/SpendTab"
import { CitizenTab } from "@/components/tabs/CitizenTab"
import { ReachTab } from "@/components/tabs/ReachTab"
import { AskKaunBar } from "@/components/shared/AskKaunBar"
import type { AskKaunRequest } from "@/app/api/ask-kaun/route"

interface Props {
  result: PinResult | null
  loading: boolean
  onClose: () => void
}

type Tab = "who" | "spend" | "citizen" | "reach"

const TABS: { id: Tab; label: string }[] = [
  { id: "who",     label: "Who" },
  { id: "spend",   label: "Spend" },
  { id: "citizen", label: "Citizen" },
  { id: "reach",   label: "Reach" },
]

function buildShareText(result: PinResult, ward: ReturnType<typeof useWardData>): string {
  const mla    = ward.profile?.elected_reps?.find(r => r.role === "MLA")
  const report = ward.reportCard
  const lines: string[] = []

  // Lead with the most accountability-worthy stat
  if (report?.lad_utilization_pct === 0) {
    lines.push(`${mla?.name ?? "The MLA"} (${mla?.party ?? ""}) has spent Rs 0 of crore-level development funds in ${result.ward_name}.`)
  } else if (report?.criminal_cases && report.criminal_cases >= 3) {
    lines.push(`${mla?.name ?? "The MLA"} (${mla?.party ?? ""}) representing ${result.ward_name} has ${report.criminal_cases} criminal cases on record.`)
  } else if (report?.attendance_pct != null && report.attendance_pct < 60) {
    lines.push(`${mla?.name ?? "The MLA"} representing ${result.ward_name} attends only ${report.attendance_pct}% of assembly sessions.`)
  } else if (mla?.name) {
    lines.push(`${mla.name} (${mla.party ?? ""}) represents ${result.ward_name} — Ward ${result.ward_no}, ${result.assembly_constituency}.`)
  } else {
    lines.push(`Ward ${result.ward_no} — ${result.ward_name}, Bengaluru.`)
  }

  lines.push(`Find out who is accountable for your ward: kaun.city`)
  return lines.join("\n")
}

export default function WardCard({ result, loading, onClose }: Props) {
  const ward = useWardData(result)
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    if (!result?.found) return
    const text = buildShareText(result, ward)
    const url = result.ward_no
      ? `https://kaun.city?ward=${result.ward_no}`
      : "https://kaun.city"
    if (navigator.share) {
      try {
        await navigator.share({ text, url })
      } catch {
        // user dismissed share sheet — no-op
      }
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [result, ward])
  const cardRef = useRef<HTMLDivElement>(null)
  // Shift card above keyboard when inputs are focused on iOS
  useKeyboardAware(cardRef, !loading && !!result?.found)

  if (!loading && !result) return null

  return (
    /*
     * Layout:
     *   Mobile  : fixed bottom sheet (overlays map, slides up from bottom)
     *   Desktop : static flex sidebar (map shrinks to accommodate)
     */
    <div
      ref={cardRef}
      className="
      fixed bottom-0 left-0 right-0 z-[1000]
      flex flex-col
      bg-[#111111] border-t border-white/10
      rounded-t-2xl
      min-h-[48svh] max-h-[88svh]
      animate-slide-up

      lg:static lg:z-auto
      lg:w-[26rem] lg:h-dvh lg:min-h-0 lg:max-h-none
      lg:rounded-none lg:border-t-0 lg:border-l lg:border-white/10
    ">
      {/* Drag handle (mobile only) — also acts as a 44px tap target for dismiss */}
      <div className="flex justify-center items-center py-3 lg:hidden shrink-0 cursor-grab active:cursor-grabbing">
        <div className="w-10 h-1 rounded-full bg-white/25" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
        {loading ? (
          <div className="space-y-2 flex-1">
            <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
            <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
          </div>
        ) : result?.found ? (
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold text-base leading-snug truncate">{result.ward_name}</h2>
            <p className="text-white/40 text-xs mt-0.5 truncate">
              Ward {result.ward_no}
              {result.zone ? `  ·  ${result.zone}` : ""}
              {result.assembly_constituency ? `  ·  ${result.assembly_constituency}` : ""}
            </p>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <h2 className="text-white/60 font-medium text-base">Outside city boundary</h2>
            <p className="text-white/30 text-xs mt-0.5">No ward found at this location</p>
          </div>
        )}
        {/* Share button — only when ward found */}
        {result?.found && !loading && (
          <button
            onClick={handleShare}
            aria-label="Share"
            className="ml-1 shrink-0 w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M2.5 8L6 11.5L12.5 4" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <circle cx="12" cy="2.5" r="1.8" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="12" cy="12.5" r="1.8" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="3"  cy="7.5"  r="1.8" stroke="currentColor" strokeWidth="1.3"/>
                <line x1="10.3" y1="3.4"  x2="4.7" y2="6.6"  stroke="currentColor" strokeWidth="1.3"/>
                <line x1="4.7"  y1="8.4"  x2="10.3" y2="11.6" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            )}
          </button>
        )}

        {/* 44×44 touch target on mobile, smaller on desktop */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 -mr-1 w-11 h-11 lg:w-7 lg:h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors text-xl lg:text-base lg:bg-white/5"
        >
          &times;
        </button>
      </div>

      {/* Tabs */}
      {!loading && result?.found && (
        <div className="flex border-b border-white/10 shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => ward.setTab(t.id)}
              className={`flex-1 py-3 lg:py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors
                ${ward.tab === t.id
                  ? "text-[#FF9933] border-b-2 border-[#FF9933]"
                  : "text-white/30 hover:text-white/60 active:text-white/60"
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content + Ask Kaun bar */}
      {!loading && result?.found && (
        <>
        <div className="flex-1 overflow-y-auto min-h-0 pb-safe">
          {ward.tab === "who" && (
            <WhoTab
              result={result}
              city={ward.city}
              profile={ward.profile}
              profileLoading={ward.profileLoading}
              unknowns={ward.unknowns}
              showAddFor={ward.showAddFor}
              onSetShowAddFor={ward.setShowAddFor}
              committeeMeetings={ward.committeeMeetings}
              reportCard={ward.reportCard}
              ladFunds={ward.ladFunds}
              corpContacts={ward.corpContacts}
              corpName={ward.corpName}
              allFacts={ward.allFacts}
              officerGroups={ward.officerGroups}
              onCorroborate={ward.handleCorroborate}
              onNewFact={ward.handleNewFact}
              onUnknownsRefresh={ward.refreshUnknowns}
              infraStats={ward.infraStats}
              potholes={ward.potholes}
            />
          )}

          {ward.tab === "spend" && (
            <SpendTab
              result={result}
              city={ward.city}
              profile={ward.profile}
              profileLoading={ward.profileLoading}
              budget={ward.budget}
              workOrders={ward.workOrders}
              tradeLicenses={ward.tradeLicenses}
              wardSpend={ward.wardSpend}
              propertyTax={ward.propertyTax}
            />
          )}

          {ward.tab === "citizen" && (
            <CitizenTab
              city={ward.city}
              wardStats={ward.wardStats}
              potholes={ward.potholes}
              infraStats={ward.infraStats}
              buzz={ward.buzz}
              buzzLoading={ward.buzzLoading}
              wardNo={result.ward_no ?? 0}
              wardName={result.ward_name ?? ""}
              assemblyConstituency={result.assembly_constituency ?? ""}
            />
          )}

          {ward.tab === "reach" && (
            <ReachTab
              city={ward.city}
              localOffices={ward.localOffices}
              departments={ward.departments}
              grievances={ward.grievances}
              sakala={ward.sakala}
              wardNo={result.ward_no ?? 0}
              wardName={result.ward_name ?? ""}
              assemblyConstituency={result.assembly_constituency ?? ""}
            />
          )}
        </div>

        {/* Ask Kaun bar */}
        <AskKaunBar
            wardContext={result.ward_no ? {
              ward_no: result.ward_no,
              ward_name: result.ward_name ?? "",
              assembly_constituency: result.assembly_constituency ?? "",
              corporator_name: ward.profile?.elected_reps?.find(r => r.role === "CORPORATOR")?.name ?? null,
              corporator_party: ward.profile?.elected_reps?.find(r => r.role === "CORPORATOR")?.party ?? null,
              mla_name: ward.profile?.elected_reps?.find(r => r.role === "MLA")?.name ?? null,
              mla_party: ward.profile?.elected_reps?.find(r => r.role === "MLA")?.party ?? null,
              mla_attendance_pct: ward.reportCard?.attendance_pct ?? null,
              mla_questions_asked: ward.reportCard?.questions_asked ?? null,
              mla_lad_utilization_pct: ward.reportCard?.lad_utilization_pct ?? null,
              mla_criminal_cases: ward.reportCard?.criminal_cases ?? null,
              committee_meetings: ward.committeeMeetings?.meetings_count ?? null,
              signal_count: ward.infraStats?.signal_count ?? null,
              bus_stop_count: ward.infraStats?.bus_stop_count ?? null,
              pothole_complaints: ward.potholes?.complaints ?? null,
              ward_spend_total_lakh: ward.wardSpend?.grand_total ?? null,
              ward_spend_roads_pct: ward.wardSpend
                ? ((ward.wardSpend.roads_and_drains + ward.wardSpend.roads_and_infrastructure) / ward.wardSpend.grand_total) * 100
                : null,
              grievance_count: ward.grievances?.length ?? null,
            } : null}
          />
        </>
      )}

      {/* Not found */}
      {!loading && !result?.found && (
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 pb-safe gap-3">
          <div className="text-4xl opacity-20">?</div>
          <p className="text-white/40 text-sm text-center">
            No ward found here.
          </p>
          <p className="text-white/20 text-xs text-center leading-relaxed">
            Try tapping within {ward.city.name} city limits.
          </p>
        </div>
      )}
    </div>
  )
}
