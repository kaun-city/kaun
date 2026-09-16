"use client"

import { useRef, useState, useCallback } from "react"
import type { PinResult } from "@/lib/types"
import type { HistoricalWardRef } from "@/lib/gba-crosswalk"
import { useWardData } from "@/hooks/useWardData"
import { useKeyboardAware } from "@/hooks/useKeyboardAware"
import { WhoTab } from "@/components/tabs/WhoTab"
import { SpendTab } from "@/components/tabs/SpendTab"
import { CitizenTab } from "@/components/tabs/CitizenTab"
import { ReachTab } from "@/components/tabs/ReachTab"
import { AskKaunBar } from "@/components/shared/AskKaunBar"
import { WardHeadline } from "@/components/WardHeadline"
import { WardGrade } from "@/components/WardGrade"
import { getCity } from "@/lib/cities"
import { WardProjectSignal } from "@/components/projects/WardProjectSignal"

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

function buildShareText(result: PinResult): string {
  const cityName = getCity(result.city_id).name
  const currentWard = result.gba_ward_name && result.gba_corporation
  const wardName = result.gba_ward_name ?? result.ward_name ?? "Ward"
  const wardNumber = result.gba_ward_no ?? result.ward_no
  const lines = [wardName]

  if (currentWard) {
    lines.push(`${cityName} ${result.gba_corporation} · Ward ${wardNumber}`)
  } else {
    lines.push(`${cityName} · Ward ${wardNumber}`)
  }
  if (result.gba_ac ?? result.assembly_constituency) {
    lines.push(`Assembly constituency: ${result.gba_ac ?? result.assembly_constituency}`)
  }
  if (result.gba_population != null) {
    lines.push(`Population: ${result.gba_population.toLocaleString("en-IN")}`)
  }
  lines.push("Explore this ward on Kaun")
  return lines.join("\n")
}

/** "W-51 / BLR-N" — the record code from the Signal on Paper reference. */
function recordCode(result: PinResult): string | null {
  if (result.gba_ward_no == null || !result.gba_corporation) return null
  const direction = result.gba_corporation.match(/\b(Central|North|South|East|West)\b/i)?.[1]
  return direction ? `W-${result.gba_ward_no} / BLR-${direction[0].toUpperCase()}` : `W-${result.gba_ward_no}`
}

/**
 * Provenance for historical data, stated once and quietly under the ward
 * identity. It explains how older ward-tagged records reach a current ward
 * without pushing the record itself below the fold.
 */
function HistoricalNote({ wards, listWards }: { wards: HistoricalWardRef[]; listWards: HistoricalWardRef[] }) {
  if (!wards.length) {
    return (
      <p className="mt-2 text-xs leading-relaxed text-[#16130e]/55">
        Current-boundary data only. This ward falls outside the older 243-ward map.
      </p>
    )
  }
  const shares = wards.map(ref => `${ref.ward_name} ${Math.round(ref.current_share * 100)}%`).join(" · ")
  const omitted = wards.length - listWards.length
  return (
    <p className="mt-2 text-xs leading-relaxed text-[#16130e]/55">
      Older records are estimated from former wards by map overlap: {shares}.
      {omitted > 0 && <> Lists of contracts and complaints use only {listWards.map(ref => ref.ward_name).join(" and ")}.</>}
      {" "}
      <a href="/how-it-works" className="text-[#b35400] underline decoration-[#b35400]/40 underline-offset-2">How this works</a>
    </p>
  )
}

const iconButton = "shrink-0 w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center border border-[#16130e]/20 text-[#16130e]/60 hover:bg-[#16130e]/5 hover:text-[#16130e] transition-colors"

export default function WardCard({ result, loading, onClose }: Props) {
  const ward = useWardData(result)
  const primaryHistoricalWard = ward.historicalWards[0]
  const listWards = ward.recordWards ?? ward.historicalWards
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recordEndRef = useRef<HTMLDivElement>(null)

  const handleShare = useCallback(async () => {
    if (!result?.found) return
    const text = buildShareText(result)
    const currentWard = result.gba_corporation_id != null && result.gba_ward_no != null
    const cityParam = result.city_id && result.city_id !== "bengaluru" ? `&city=${result.city_id}` : ""
    const url = currentWard
      ? `https://bengaluru.kaun.city?gba_corporation=${result.gba_corporation_id}&gba_ward=${result.gba_ward_no}`
      : result.ward_no
        ? `https://bengaluru.kaun.city?ward=${result.ward_no}${cityParam}`
        : "https://bengaluru.kaun.city"
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
  }, [result])

  // Tabs live in the footer, so a tab switch must bring its content into view
  // when the reader has already scrolled past the ward record.
  const selectTab = useCallback((tab: Tab) => {
    ward.setTab(tab)
    const scroller = scrollRef.current
    const recordEnd = recordEndRef.current
    if (!scroller || !recordEnd) return
    const top = recordEnd.offsetTop
    if (scroller.scrollTop > top) scroller.scrollTo({ top })
  }, [ward])

  const cardRef = useRef<HTMLDivElement>(null)
  // Shift card above keyboard when inputs are focused on iOS
  useKeyboardAware(cardRef, !loading && !!result?.found)

  if (!loading && !result) return null

  const code = result?.found ? recordCode(result) : null

  return (
    /*
     * Layout:
     *   Mobile  : fixed bottom sheet (overlays map, slides up from bottom)
     *   Desktop : static flex sidebar (map shrinks to accommodate)
     *
     * One scroll region holds the record and the active tab; the tab bar and
     * Ask Kaun stay pinned at the bottom, as in the Signal on Paper reference.
     */
    <div
      ref={cardRef}
      className="signal-panel
      fixed bottom-0 left-0 right-0 z-[1050]
      flex flex-col
      bg-[#F8F5EF] border-t-2 border-[#16130e]
      min-h-[48svh] max-h-[88svh]
      animate-slide-up

      lg:static lg:z-auto
      lg:w-[26rem] lg:h-dvh lg:min-h-0 lg:max-h-none
      lg:border-t-0 lg:border-l lg:border-[#16130e]/25
    ">
      {/* Drag handle (mobile only) */}
      <div className="flex justify-center items-center pt-2.5 pb-1 lg:hidden shrink-0 cursor-grab active:cursor-grabbing">
        <div className="w-10 h-1 bg-[#16130e]/25" />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
        {/* Record header */}
        <div className="px-5 pt-2 pb-4 lg:pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#16130e]/55">
              {loading || result?.found ? "Ward record" : "No ward"}
            </p>
            <div className="flex items-center gap-1.5">
              {code && !loading && (
                <span className="mr-1 font-mono text-[11px] tracking-[0.04em] text-[#16130e]/45">{code}</span>
              )}
              {result?.found && !loading && (
                <button onClick={handleShare} aria-label={copied ? "Link copied" : "Share"} className={iconButton}>
                  {copied ? (
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                      <path d="M2.5 8L6 11.5L12.5 4" stroke="#24643c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                      <circle cx="12" cy="2.5" r="1.8" stroke="currentColor" strokeWidth="1.3"/>
                      <circle cx="12" cy="12.5" r="1.8" stroke="currentColor" strokeWidth="1.3"/>
                      <circle cx="3"  cy="7.5"  r="1.8" stroke="currentColor" strokeWidth="1.3"/>
                      <line x1="10.3" y1="3.4"  x2="4.7" y2="6.6"  stroke="currentColor" strokeWidth="1.3"/>
                      <line x1="4.7"  y1="8.4"  x2="10.3" y2="11.6" stroke="currentColor" strokeWidth="1.3"/>
                    </svg>
                  )}
                </button>
              )}
              <button onClick={onClose} aria-label="Close" className={`${iconButton} text-lg lg:text-base`}>
                &times;
              </button>
            </div>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <div className="h-6 w-48 bg-[#16130e]/10 animate-pulse" />
              <div className="h-3 w-32 bg-[#16130e]/5 animate-pulse" />
            </div>
          ) : result?.found ? (
            <>
              {/* GBA ward name (primary), falls back to legacy BBMP name */}
              <h2 className="mt-1 text-2xl font-bold leading-tight tracking-[-0.02em] text-[#16130e]">
                {result.gba_ward_name ?? result.ward_name}
              </h2>
              <p className="mt-0.5 text-sm text-[#16130e]/60">
                {result.gba_corporation ? (
                  <>
                    Bengaluru {result.gba_corporation}
                    {result.gba_ward_no != null && <> &middot; Ward {result.gba_ward_no}</>}
                    {result.assembly_constituency && <> &middot; {result.assembly_constituency}</>}
                  </>
                ) : (
                  <>
                    Ward {result.ward_no}
                    {result.zone && <> &middot; {result.zone}</>}
                    {result.assembly_constituency && <> &middot; {result.assembly_constituency}</>}
                  </>
                )}
              </p>
              {result.gba_ward_name && <HistoricalNote wards={ward.historicalWards} listWards={listWards} />}
            </>
          ) : (
            <>
              <h2 className="mt-1 text-xl font-semibold text-[#16130e]/70">Outside city boundary</h2>
              <p className="mt-0.5 text-sm text-[#16130e]/50">No ward found at this location</p>
            </>
          )}
        </div>

        {!loading && result?.found && (
          <>
            {/* Most important finding, with its source */}
            <WardHeadline
              reportCard={ward.reportCard}
              committeeMeetings={ward.committeeMeetings}
              infraStats={ward.infraStats}
              wardContractors={ward.wardContractors ?? []}
              cityId={result.city_id}
              formerWards={result.gba_ward_name ? listWards.map(ref => ref.ward_name) : undefined}
            />

            <WardGrade
              reportCard={ward.reportCard}
              committeeMeetings={ward.committeeMeetings}
              infraStats={ward.infraStats}
              potholes={ward.potholes}
              wardContractors={ward.wardContractors ?? []}
              cityId={result.city_id}
            />

            {/* Multi-ward civic projects are durable records, not transient news. */}
            <WardProjectSignal result={result} />

            <div ref={recordEndRef} />

            <div className="pb-4">
              {ward.tab === "who" && (
                <WhoTab
                  result={result}
                  city={ward.city}
                  profile={ward.profile}
                  profileLoading={ward.profileLoading}
                  electedReps={ward.electedReps}

                  committeeMeetings={ward.committeeMeetings}
                  reportCard={ward.reportCard}
                  ladFunds={ward.ladFunds}
                  corpContacts={ward.corpContacts}
                  corpName={ward.corpName}
                  allFacts={ward.allFacts}
                  officerGroups={ward.officerGroups}
                  onCorroborate={ward.handleCorroborate}
                  onNewFact={ward.handleNewFact}

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
                  wardContractors={ward.wardContractors ?? []}
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
                  wardBusStats={ward.wardBusStats ?? null}
                  roadCrashes={ward.roadCrashes ?? null}
                  airQuality={ward.airQuality ?? null}
                  amenities={ward.amenities ?? null}
                  waterQuality={ward.waterQuality ?? []}
                  wardNo={primaryHistoricalWard?.ward_no ?? 0}
                  wardName={result.gba_ward_name ?? result.ward_name ?? ""}
                  assemblyConstituency={result.gba_ac ?? result.assembly_constituency ?? ""}
                  reportCount={ward.reportCount}
                  signals={ward.signals}
                />
              )}

              {ward.tab === "reach" && (
                <ReachTab
                  city={ward.city}
                  localOffices={ward.localOffices}
                  departments={ward.departments}
                  grievances={ward.grievances}
                  sakala={ward.sakala}
                  wardNo={primaryHistoricalWard?.ward_no ?? 0}
                  wardName={result.gba_ward_name ?? result.ward_name ?? ""}
                  assemblyConstituency={result.gba_ac ?? result.assembly_constituency ?? ""}
                />
              )}
            </div>
          </>
        )}

        {/* Not found */}
        {!loading && !result?.found && (
          <div className="flex flex-col items-center justify-center px-5 py-8 pb-safe gap-2">
            <p className="text-sm text-center text-[#16130e]/60">
              Not in {ward.city.name}?
            </p>
            <p className="text-xs text-center leading-relaxed text-[#16130e]/45">
              Try tapping within {ward.city.name} city limits.
            </p>
          </div>
        )}
      </div>

      {/* Pinned footer: tabs + Ask Kaun */}
      {!loading && result?.found && (
        <div className="shrink-0 bg-[#F8F5EF]">
          <div role="tablist" aria-label="Ward record sections" className="flex border-y border-[#16130e]/20">
            {TABS.map((t, index) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={ward.tab === t.id}
                onClick={() => selectTab(t.id)}
                className={`flex-1 min-h-11 py-3 lg:py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors
                  ${index > 0 ? "border-l border-[#16130e]/20" : ""}
                  ${ward.tab === t.id
                    ? "bg-[#16130e] text-[#F8F5EF]"
                    : "text-[#16130e]/55 hover:text-[#16130e] hover:bg-[#16130e]/5"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Ask Kaun bar — Bengaluru-only until the AI tools/prompt are city-scoped */}
          {getCity(result.city_id).features.askKaun && <AskKaunBar
              wardContext={result.found ? {
                ward_no: primaryHistoricalWard?.ward_no ?? null,
                ward_name: result.gba_ward_name ?? result.ward_name ?? "",
                assembly_constituency: result.gba_ac ?? result.assembly_constituency ?? "",
                boundary_system: result.gba_ward_name ? "gba-369-2025" : "datameet-243",
                gba_corporation_id: result.gba_corporation_id,
                gba_ward_no: result.gba_ward_no,
                historical_wards: ward.historicalWards.map(ref => ({ ward_no: ref.ward_no, ward_name: ref.ward_name, current_share: ref.current_share })),
                corporator_name: ward.electedReps.find(r => r.role === "CORPORATOR")?.name ?? null,
                corporator_party: ward.electedReps.find(r => r.role === "CORPORATOR")?.party ?? null,
                mla_name: ward.electedReps.find(r => r.role === "MLA")?.name ?? null,
                mla_party: ward.electedReps.find(r => r.role === "MLA")?.party ?? null,
                mla_attendance_pct: ward.reportCard?.attendance_pct ?? null,
                mla_questions_asked: ward.reportCard?.questions_asked ?? null,
                mla_lad_utilization_pct: ward.reportCard?.lad_utilization_pct ?? null,
                mla_criminal_cases: ward.reportCard?.criminal_cases ?? null,
                committee_meetings: ward.committeeMeetings?.meetings_count ?? null,
                signal_count: ward.infraStats?.signal_count ?? null,
                bus_stop_count: ward.infraStats?.bus_stop_count ?? null,
                pothole_complaints: ward.potholes?.complaints ?? null,
                ward_spend_total_lakh: ward.wardSpend ? ward.wardSpend.grand_total / 100_000 : null,
                ward_spend_roads_pct: ward.wardSpend
                  ? ((ward.wardSpend.roads_and_drains + ward.wardSpend.roads_and_infrastructure) / ward.wardSpend.grand_total) * 100
                  : null,
                grievance_count: ward.grievances?.length ?? null,
              } : null}
            />}
        </div>
      )}
    </div>
  )
}
