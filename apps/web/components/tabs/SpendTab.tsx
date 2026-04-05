"use client"

import { useState } from "react"
import { STATUS_STYLES } from "@/lib/constants"
import { formatLakh, timeAgo } from "@/lib/ward-utils"
import type { CityConfig } from "@/lib/cities"
import type {
  BudgetSummary, ContractorProfile, PinResult, PropertyTaxData,
  WardProfile, WardSpendCategory, WardTradeLicenses, WorkOrder,
} from "@/lib/types"
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
import { SkeletonBarRow, SkeletonCard } from "@/components/shared/Skeleton"

const TENDERS_PREVIEW = 5

function TendersList({ profile, profileLoading }: { profile: WardProfile | null; profileLoading: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const tenders = profile?.tenders ?? []
  const visible = expanded ? tenders : tenders.slice(0, TENDERS_PREVIEW)
  const hidden = tenders.length - TENDERS_PREVIEW

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-white/30 text-xs uppercase tracking-wider">
          {profileLoading && !profile ? "Tenders" : profile ? `${profile.tender_count} Tender${profile.tender_count !== 1 ? "s" : ""}` : "Tenders"}
        </p>
        <div className="flex items-center gap-1.5">
          {profile && <span className="text-[#FF9933] text-xs font-semibold">{formatLakh(profile.tender_total_lakh)} total</span>}
          <FreshnessBadge label="2023-present" source="KPPP" />
        </div>
      </div>

      {profileLoading && !profile ? (
        <><SkeletonCard lines={3} /><SkeletonCard lines={2} /><SkeletonCard lines={3} /></>
      ) : tenders.length > 0 ? (
        <>
          {visible.map(t => {
            const st = STATUS_STYLES[t.status] ?? STATUS_STYLES.OPEN
            return (
              <div key={t.id} className="p-3 rounded-xl bg-white/5">
                <p className="text-white text-sm leading-snug line-clamp-2">{t.title}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                  {t.value_lakh != null && <span className="text-[#FF9933] text-xs font-semibold">{formatLakh(t.value_lakh)}</span>}
                  {t.issued_date && <span className="text-white/30 text-xs">{t.issued_date}</span>}
                </div>
                {t.contractor_name && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {t.contractor_blacklisted && <span className="text-amber-400 text-xs font-bold">Govt. Record</span>}
                    <p className={`text-xs ${t.contractor_blacklisted ? "text-amber-200" : "text-white/40"}`}>{t.contractor_name}</p>
                  </div>
                )}
                {t.source_url && (
                  <a href={t.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-[#FF9933]/50 hover:text-[#FF9933] text-xs transition-colors mt-1 inline-block">
                    View on KPPP &rarr;
                  </a>
                )}
              </div>
            )
          })}
          {!expanded && hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white/70 text-xs"
            >
              Show {hidden} more tender{hidden !== 1 ? "s" : ""} &darr;
            </button>
          )}
          {expanded && hidden > 0 && (
            <button
              onClick={() => setExpanded(false)}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white/70 text-xs"
            >
              Show less &uarr;
            </button>
          )}
        </>
      ) : !profileLoading ? (
        <div className="p-5 rounded-xl bg-white/5 text-center space-y-1">
          <p className="text-white/30 text-sm">No tenders found</p>
          <p className="text-white/20 text-xs">File an RTI to get the complete works register.</p>
        </div>
      ) : null}
    </div>
  )
}

interface Props {
  result: PinResult
  city: CityConfig
  profile: WardProfile | null
  profileLoading: boolean
  budget: BudgetSummary | null
  workOrders: WorkOrder[]
  tradeLicenses: WardTradeLicenses[]
  wardSpend: WardSpendCategory | null
  propertyTax: PropertyTaxData | null
  wardContractors: ContractorProfile[]
}

export function SpendTab({
  result, city, profile, profileLoading, budget,
  workOrders, tradeLicenses, wardSpend, propertyTax, wardContractors,
}: Props) {
  return (
    <div className="px-5 py-4 space-y-4 pb-safe-content">

      {/* City-wide Budget */}
      {budget ? (
        <div className="rounded-xl bg-white/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[10px] uppercase tracking-wider">BBMP Budget</p>
            <div className="flex items-center gap-1.5">
              <p className="text-[#FF9933] text-lg font-bold">
                Rs.{budget.total_expenditure_lakh ? Math.round(budget.total_expenditure_lakh / 100).toLocaleString("en-IN") : "--"} Cr
              </p>
              <FreshnessBadge label={city.budgetYear} source="BBMP" />
            </div>
          </div>
          {budget.departments && budget.departments.length > 0 && (
            <div className="space-y-2">
              {budget.departments.map((dept, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-white/60 text-xs truncate flex-1">{dept.department}</p>
                    <p className="text-white/40 text-xs font-mono shrink-0">Rs.{dept.amount_cr} Cr <span className="text-white/20">({dept.pct}%)</span></p>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#FF9933]/60 rounded-full" style={{ width: `${Math.min(dept.pct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white/5 p-3 space-y-2">
          <div className="h-3 w-28 bg-white/10 rounded animate-pulse" />
          <SkeletonBarRow />
        </div>
      )}

      {/* Ward-level BBMP Spending */}
      {wardSpend && wardSpend.grand_total > 0 ? (
        <div className="rounded-xl bg-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[10px] uppercase tracking-wider">Ward Spending</p>
            <div className="flex items-center gap-1.5">
              <p className="text-white/30 text-[10px]">Rs.{(wardSpend.grand_total / 10000000).toFixed(1)} Cr total</p>
              <FreshnessBadge label="2018-23" source="BBMP" />
            </div>
          </div>
          {[
            { label: "Roads & Infrastructure", val: wardSpend.roads_and_infrastructure },
            { label: "Roads & Drains",         val: wardSpend.roads_and_drains },
            { label: "Drainage",               val: wardSpend.drainage },
            { label: "Streetlighting",         val: wardSpend.streetlighting },
            { label: "Waste Management",       val: wardSpend.waste_management },
            { label: "Water & Sanitation",     val: wardSpend.water_and_sanitation },
            { label: "Buildings & Facilities", val: wardSpend.buildings_facilities },
          ].filter(x => x.val > 0).map(({ label, val }) => {
            const pct = wardSpend.grand_total > 0 ? Math.round((val / wardSpend.grand_total) * 100) : 0
            return (
              <div key={label}>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-white/40">{label}</span>
                  <span className="text-white/60 font-mono">Rs.{(val / 10000000).toFixed(1)} Cr ({pct}%)</span>
                </div>
                <div className="h-1 rounded-full bg-white/10">
                  <div className="h-1 rounded-full bg-[#FF9933]/60" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : wardSpend !== undefined && (!wardSpend || wardSpend.grand_total === 0) ? (
        <div className="p-4 rounded-xl bg-white/5 text-center">
          <p className="text-white/25 text-sm">No ward spend data</p>
          <p className="text-white/15 text-xs mt-0.5">BBMP 2018-23 · Not yet available for this ward</p>
        </div>
      ) : null}

      {/* Property Tax */}
      {propertyTax?.years && propertyTax.years.length > 0 ? (
        <div className="rounded-xl bg-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[10px] uppercase tracking-wider">Property Tax Collection</p>
            <FreshnessBadge label="2021-24" source="BBMP" />
          </div>
          {propertyTax.years.map(yr => (
            <div key={yr.financial_year} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white text-xs font-mono">{yr.financial_year}</p>
                <p className="text-white/30 text-[10px]">{yr.total_applications?.toLocaleString("en-IN")} properties</p>
              </div>
              <p className="text-[#FF9933] text-sm font-bold shrink-0">Rs.{(yr.total_collection_lakh / 100).toFixed(0)} Cr</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Tenders */}
      <TendersList profile={profile} profileLoading={profileLoading} />

      {/* Work Orders */}
      {workOrders.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/30 text-xs uppercase tracking-wider">Works ({workOrders.length})</p>
            <FreshnessBadge label="2024-25" source="BBMP" />
          </div>
          <div className="space-y-2">
            {workOrders.map(wo => {
              const desc = wo.description.replace(/^\d{3}-\d{2}-\d{6}/, "").trim()
              const contractor = wo.contractor
                ? wo.contractor.replace(/^\d{6}\s*/, "").replace(/\d{10}$/, "").trim()
                : null
              return (
                <div key={wo.id} className="rounded-xl bg-white/5 p-3">
                  <p className="text-white text-xs leading-snug line-clamp-2">{desc}</p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <p className="text-white/30 text-[10px] truncate">{contractor}</p>
                    <p className="text-[#FF9933] text-xs font-semibold shrink-0">Rs.{(wo.net_paid / 100000).toFixed(1)}L</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : !profileLoading && profile !== null ? (
        <div className="p-4 rounded-xl bg-white/5 text-center space-y-1">
          <p className="text-white/25 text-sm">No work orders on record</p>
          <p className="text-white/15 text-xs">BBMP 2024-25</p>
        </div>
      ) : null}

      {/* Contractor Accountability */}
      {wardContractors.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/30 text-xs uppercase tracking-wider">Contractors in this Ward</p>
            <p className="text-white/20 text-[10px] mt-0.5">Payment deductions recorded in BBMP work orders. High deductions may reflect quality disputes, delays, or scope changes.</p>
            <FreshnessBadge label="2013-25" source="BBMP / opencity.in" />
          </div>
          {wardContractors.map(c => {
            const isFlagged = c.blacklist_flags.length > 0
            return (
              <div key={c.entity_id} className={`rounded-xl p-3 ${isFlagged ? "bg-amber-500/10 border border-amber-500/20" : "bg-white/5"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isFlagged && <span className="text-amber-400 text-[10px] font-bold uppercase tracking-wider shrink-0">Govt. Record</span>}
                      <p className={`text-sm font-semibold truncate ${isFlagged ? "text-amber-200" : "text-white"}`}>{c.canonical_name}</p>
                    </div>
                    {c.aliases.length > 1 && (
                      <p className="text-white/20 text-[10px] truncate mt-0.5">
                        Also: {c.aliases.filter(a => a !== c.canonical_name).slice(0, 2).join(", ")}
                      </p>
                    )}
                  </div>
                  <p className="text-[#FF9933] text-sm font-bold shrink-0">Rs.{c.total_value_lakh >= 100 ? `${(c.total_value_lakh / 100).toFixed(1)} Cr` : `${c.total_value_lakh.toFixed(0)} L`}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                  <div>
                    <p className="text-white/80 text-xs font-semibold">{c.total_contracts}</p>
                    <p className="text-white/30 text-[10px]">Contracts</p>
                  </div>
                  <div>
                    <p className="text-white/80 text-xs font-semibold">{c.ward_count}</p>
                    <p className="text-white/30 text-[10px]">Wards</p>
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${c.avg_deduction_pct > 15 ? "text-red-400" : c.avg_deduction_pct > 10 ? "text-yellow-400" : "text-green-400"}`}>
                      {c.avg_deduction_pct}%
                    </p>
                    <p className="text-white/30 text-[10px]">Deductions</p>
                  </div>
                </div>
                {isFlagged && (
                  <div className="mt-2 pt-2 border-t border-amber-500/10">
                    {c.blacklist_flags.map((flag, i) => (
                      <p key={i} className="text-amber-400/80 text-[10px] leading-relaxed">▸ {flag}</p>
                    ))}
                    <p className="text-white/20 text-[10px] mt-1 italic">Source: KPPP / BBMP official records</p>
                  </div>
                )}
                {c.is_govt_entity && <p className="text-white/20 text-[10px] mt-1">Government entity</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Trade Licenses */}
      {tradeLicenses.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/30 text-xs uppercase tracking-wider">Trade Licenses</p>
            <FreshnessBadge label="2021-23" source="BBMP" />
          </div>
          <div className="space-y-2">
            {tradeLicenses.map(tl => (
              <div key={tl.year} className="rounded-xl bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-white text-sm font-semibold">{tl.year}</span>
                  <span className="text-[#FF9933] text-sm font-bold">{tl.total_licenses.toLocaleString("en-IN")} licenses</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/5 py-1.5">
                    <p className="text-green-400 text-xs font-bold">{tl.new_licenses.toLocaleString("en-IN")}</p>
                    <p className="text-white/30 text-[10px]">New</p>
                  </div>
                  <div className="rounded-lg bg-white/5 py-1.5">
                    <p className="text-blue-400 text-xs font-bold">{tl.renewals.toLocaleString("en-IN")}</p>
                    <p className="text-white/30 text-[10px]">Renewed</p>
                  </div>
                  <div className="rounded-lg bg-white/5 py-1.5">
                    <p className="text-white text-xs font-bold">
                      {tl.total_revenue >= 10000000
                        ? `${(tl.total_revenue / 10000000).toFixed(1)} Cr`
                        : tl.total_revenue >= 100000
                          ? `${(tl.total_revenue / 100000).toFixed(1)} L`
                          : `${Math.round(tl.total_revenue / 1000)}K`}
                    </p>
                    <p className="text-white/30 text-[10px]">Revenue</p>
                  </div>
                </div>
                {tl.top_trade_type && <p className="text-white/20 text-[10px] mt-1.5 truncate">Top: {tl.top_trade_type}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
