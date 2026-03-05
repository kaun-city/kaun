"use client"

import type { PinResult } from "@/lib/types"
import { useWardData } from "@/hooks/useWardData"
import { WhoTab } from "@/components/tabs/WhoTab"
import { ExpensesTab } from "@/components/tabs/ExpensesTab"
import { StatsTab } from "@/components/tabs/StatsTab"
import { ReportTab } from "@/components/tabs/ReportTab"

interface Props {
  result: PinResult | null
  loading: boolean
  onClose: () => void
}

type Tab = "who" | "expenses" | "stats" | "report"

const TABS: { id: Tab; label: string }[] = [
  { id: "who",      label: "Who" },
  { id: "expenses", label: "Expenses" },
  { id: "stats",    label: "Area" },
  { id: "report",   label: "Report" },
]

export default function WardCard({ result, loading, onClose }: Props) {
  const ward = useWardData(result)

  if (!loading && !result) return null

  return (
    <div className="
      fixed bottom-0 left-0 right-0 z-[1000]
      md:bottom-6 md:right-6 md:left-auto md:w-[26rem]
      bg-[#111111] border border-white/10 rounded-t-2xl md:rounded-2xl
      shadow-2xl overflow-hidden animate-slide-up
    ">
      {/* Drag handle (mobile) */}
      <div className="flex justify-center pt-3 pb-1 md:hidden">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-white/10">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
            <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
          </div>
        ) : result?.found ? (
          <div>
            <h2 className="text-white font-semibold text-base leading-snug">{result.ward_name}</h2>
            <p className="text-white/40 text-xs mt-0.5">
              Ward {result.ward_no}
              {result.zone ? `  ·  ${result.zone}` : ""}
              {result.assembly_constituency ? `  ·  ${result.assembly_constituency}` : ""}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-white/60 font-medium text-base">Outside city boundary</h2>
            <p className="text-white/30 text-xs mt-0.5">No ward found at this location</p>
          </div>
        )}
        <button onClick={onClose} aria-label="Close" className="ml-4 mt-0.5 text-white/30 hover:text-white/70 transition-colors text-lg">
          &times;
        </button>
      </div>

      {/* Tabs + Content */}
      {!loading && result?.found && (
        <>
          <div className="flex border-b border-white/10">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => ward.setTab(t.id)}
                className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors
                  ${ward.tab === t.id
                    ? "text-[#FF9933] border-b-2 border-[#FF9933]"
                    : "text-white/30 hover:text-white/60"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {ward.tab === "who" && (
            <WhoTab
              result={result}
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
            />
          )}

          {ward.tab === "expenses" && (
            <ExpensesTab
              result={result}
              profile={ward.profile}
              profileLoading={ward.profileLoading}
              budget={ward.budget}
              workOrders={ward.workOrders}
              tradeLicenses={ward.tradeLicenses}
              buzz={ward.buzz}
              buzzLoading={ward.buzzLoading}
            />
          )}

          {ward.tab === "stats" && (
            <StatsTab
              wardStats={ward.wardStats}
              grievances={ward.grievances}
              potholes={ward.potholes}
              wardSpend={ward.wardSpend}
              propertyTax={ward.propertyTax}
              sakala={ward.sakala}
            />
          )}

          {ward.tab === "report" && (
            <ReportTab
              localOffices={ward.localOffices}
              departments={ward.departments}
            />
          )}
        </>
      )}

      {!loading && !result?.found && (
        <div className="px-5 py-6 text-center">
          <p className="text-white/30 text-sm">Try pinning a location within Bengaluru.</p>
        </div>
      )}
    </div>
  )
}
