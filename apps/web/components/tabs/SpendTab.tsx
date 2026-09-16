"use client"

import { useState } from "react"
import { STATUS_STYLES } from "@/lib/constants"
import { formatCrore, formatINR, formatLakh, timeAgo } from "@/lib/ward-utils"
import type { CityConfig } from "@/lib/cities"
import type {
  BudgetSummary, ContractorProfile, PinResult, PropertyTaxData,
  WardProfile, WardSpendCategory, WardTradeLicenses, WorkOrder,
} from "@/lib/types"
import { SkeletonBarRow, SkeletonCard } from "@/components/shared/Skeleton"

const CORPORATION_TENDERS_SHOWN = 3
const WORK_ORDERS_PREVIEW = 5
const CONTRACTORS_PREVIEW = 5

// Signal on Paper: hairline-ruled sections, mono figures, a source under each.
const SECTION = "border-t border-ink/15 pt-2"
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60"
const FIGURE = "font-mono font-semibold tabular-nums"
const SOURCE = "font-mono text-[11px] uppercase leading-snug tracking-[0.06em] text-ink/60"
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
const LINK = "text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
const EMPTY = "bg-paper-muted px-4 py-4 text-center"
const TOGGLE = `flex min-h-11 w-full items-center justify-between border-b border-ink/15 text-left text-xs text-ink/70 hover:text-ink ${FOCUS}`

/** Where a section's figures come from. Same text the freshness chip carried. */
function Provenance({ label, source }: { label: string; source?: string }) {
  return <p className={`mt-1.5 ${SOURCE}`}>{source ? `${source} · ` : ""}{label}</p>
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").replace(/^\d{3}-\d{2}-\d{6}/, "").trim()
}

function WorkOrdersList({ workOrders, profileLoading, profile }: { workOrders: WorkOrder[]; profileLoading: boolean; profile: WardProfile | null }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? workOrders : workOrders.slice(0, WORK_ORDERS_PREVIEW)
  const hidden = workOrders.length - WORK_ORDERS_PREVIEW

  if (workOrders.length === 0) {
    if (!profileLoading && profile !== null) {
      return (
        <div className={`${EMPTY} space-y-1`}>
          <p className="text-sm text-ink/75">No work orders on record</p>
          <p className={SOURCE}>BBMP IFMS / opencity</p>
        </div>
      )
    }
    return null
  }

  const liveCount = workOrders.filter(w => w.data_source === "ifms_direct").length
  const freshnessLabel = liveCount > 0 ? "live + 2024-25" : "2024-25"

  // Which BBMP-225 ward(s) these works are originally recorded under. BBMP/
  // IFMS numbers wards on the 2023 Final (225) delimitation; historical facts
  // use the 243-ward set, so works are reconciled across by spatial overlap.
  // Surfacing the source ward(s) makes any name mismatch legible, not a bug.
  const sourceWards = [...new Set(
    workOrders.map(w => (w.source_ward_name || "").trim()).filter(Boolean)
  )].sort()

  return (
    <section className={SECTION}>
      <p className={EYEBROW}>Works ({workOrders.length})</p>
      {sourceWards.length > 0 && (
        <div className="mt-1.5 bg-paper-muted px-3 py-2">
          <p className="text-xs leading-relaxed text-ink/75">
            BBMP records these under its 2023 (225-ward) delimitation as{" "}
            <span className="font-medium text-ink">{sourceWards.join(", ")}</span>.
            Reconciled to this map&apos;s ward by spatial overlap —{" "}
            <a
              href="https://data.kaun.city/bengaluru/ward-crosswalk/"
              target="_blank"
              rel="noopener noreferrer"
              className={`${LINK} ${FOCUS}`}
            >
              how this works
            </a>
            .
          </p>
        </div>
      )}
      <div className="mt-1 divide-y divide-ink/10 border-b border-ink/10">
        {visible.map(wo => {
          const desc = stripHtml(wo.description)
          const contractor = wo.contractor
            ? wo.contractor.replace(/^\d{6}\s*/, "").replace(/\d{10}$/, "").trim()
            : wo.contractor_name
          // IFMS rows have net_paid null (per-bill drill-down is a follow-up).
          // Fall back to sanctioned_amount with a label so the number is honest
          // about what it represents.
          const shownAmount = wo.net_paid ?? wo.sanctioned_amount ?? null
          const amountLabel = wo.net_paid != null ? "paid" : "sanctioned"
          return (
            <div key={wo.id} className="py-2.5">
              <p className="line-clamp-2 text-sm leading-snug text-ink">{desc}</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-ink/70">{contractor}</p>
                {shownAmount != null && (
                  <p className="shrink-0 text-sm text-ink">
                    <span className={FIGURE}>{formatINR(shownAmount)}</span>
                    <span className="ml-1 text-[11px] text-ink/60">{amountLabel}</span>
                  </p>
                )}
              </div>
              {wo.payment_status && (
                <p className="mt-1 text-xs text-ink/75">
                  <span className="text-ink/60">Bill stage:</span> {wo.payment_status}
                </p>
              )}
              {(wo.division || wo.fy) && (
                <p className={`mt-1 truncate ${SOURCE}`}>
                  {[wo.division, wo.fy && `FY ${wo.fy}`].filter(Boolean).join(" · ")}
                </p>
              )}
              {wo.source_ward_name && (
                <p className={`mt-0.5 truncate ${SOURCE}`}>
                  BBMP ward: {wo.source_ward_name}
                </p>
              )}
              {wo.is_primary === false && (
                <p className="mt-0.5 truncate text-xs text-info">
                  shared — ~{Math.round((wo.overlap_share ?? 0) * 100)}% of this ward&apos;s area
                </p>
              )}
            </div>
          )
        })}
      </div>
      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className={TOGGLE}
        >
          <span>Show {hidden} more work order{hidden !== 1 ? "s" : ""}</span>
          <span aria-hidden="true">&darr;</span>
        </button>
      )}
      {expanded && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded={true}
          className={TOGGLE}
        >
          <span>Show less</span>
          <span aria-hidden="true">&uarr;</span>
        </button>
      )}
      <Provenance label={freshnessLabel} source="BBMP IFMS" />
    </section>
  )
}

/** "West" / "Bengaluru West City Corporation" -> "Bengaluru West City Corporation", the KPPP department name. */
function corporationDepartment(corporation: string | null | undefined): string | null {
  const direction = corporation?.match(/\b(Central|North|South|East|West)\b/i)?.[1]
  if (!direction) return null
  return `Bengaluru ${direction[0].toUpperCase()}${direction.slice(1).toLowerCase()} City Corporation`
}

/** KPPP statuses beyond the four styled ones (RETENDERED, NO_BIDS_RECIEVED…) read as plain text, never as "Open". */
function tenderStatus(status: string): { className: string; label: string } {
  const styled = STATUS_STYLES[status]
  if (styled) return { className: `${styled.bg} ${styled.text}`, label: styled.label }
  const words = status.replace(/RECIEVED/g, "RECEIVED").replace(/_/g, " ").toLowerCase()
  return { className: "border border-ink/20 text-ink/70", label: words.charAt(0).toUpperCase() + words.slice(1) }
}

/**
 * KPPP tenders cannot be scoped to a ward: most carry no ward, and the ward
 * numbers parsed from titles mix the old BBMP maps with the new corporations'
 * own numbering. So this is labelled for what it is — the latest tenders from
 * the reader's GBA corporation — with a small fixed list, no ward total, and
 * no "show 13,000 more".
 */
function CorporationTenders({ result, profile, profileLoading }: { result: PinResult; profile: WardProfile | null; profileLoading: boolean }) {
  const department = corporationDepartment(result.gba_corporation)
  if (!department) return null
  const tenders = (profile?.tenders ?? []).filter(t => t.department === department)
  const latest = tenders.slice(0, CORPORATION_TENDERS_SHOWN)

  return (
    <section className={SECTION}>
      <p className={EYEBROW}>Latest corporation tenders</p>
      <p className="mt-1 text-xs leading-snug text-ink/70">
        From {department}, not specific to this ward. KPPP tenders are not reliably tagged to wards.
      </p>

      {profileLoading && !profile ? (
        <div className="mt-1.5 space-y-2"><SkeletonCard lines={2} /><SkeletonCard lines={2} /></div>
      ) : latest.length > 0 ? (
        <div className="mt-1 divide-y divide-ink/10 border-b border-ink/10">
          {latest.map(t => {
            const status = tenderStatus(t.status)
            return (
              <div key={t.id} className="py-2.5">
                <p className="line-clamp-2 text-sm leading-snug text-ink">{t.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[11px] font-medium ${status.className}`}>{status.label}</span>
                  {t.value_lakh != null && <span className={`text-sm text-ink ${FIGURE}`}>{formatLakh(t.value_lakh)}</span>}
                  {t.issued_date && <span className="font-mono text-[11px] tabular-nums text-ink/60">{t.issued_date}</span>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-ink/70">No recent tenders from this corporation on record.</p>
      )}
      <a
        href="https://kppp.karnataka.gov.in"
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex min-h-11 items-center text-xs ${LINK} ${FOCUS}`}
      >
        Search all tenders on KPPP &rarr;
      </a>
      <Provenance label={profile ? `latest ${latest.length} of ${tenders.length.toLocaleString("en-IN")}` : "latest"} source="KPPP" />
    </section>
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
  /** Ward spend has been looked up for this ward; before that, show a skeleton rather than "no data". */
  wardSpendSettled: boolean
  /** False while ward spend is only available on the older 198-ward map, which can't be matched to this ward. */
  wardSpendAttributable: boolean
  propertyTax: PropertyTaxData | null
  wardContractors: ContractorProfile[]
}

export function SpendTab({
  result, city, profile, profileLoading, budget,
  workOrders, tradeLicenses, wardSpend, wardSpendSettled, wardSpendAttributable, propertyTax, wardContractors,
}: Props) {
  const [contractorsExpanded, setContractorsExpanded] = useState(false)
  // Flagged firms first, so a short list never hides one.
  const contractors = [...wardContractors].sort((a, b) => Number(b.blacklist_flags.length > 0) - Number(a.blacklist_flags.length > 0))
  const visibleContractors = contractorsExpanded ? contractors : contractors.slice(0, CONTRACTORS_PREVIEW)
  const hiddenContractors = contractors.length - CONTRACTORS_PREVIEW

  return (
    <div className="px-5 py-4 space-y-5 pb-safe-content">

      {/* City-wide Budget */}
      {budget ? (
        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-3">
            <p className={EYEBROW}>BBMP Budget</p>
            <p className={`shrink-0 text-lg text-ink ${FIGURE}`}>
              {formatLakh(budget.total_expenditure_lakh)}
            </p>
          </div>
          {budget.departments && budget.departments.length > 0 && (
            <div className="mt-1.5 space-y-2">
              {budget.departments.map((dept, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-ink/75">{dept.department}</p>
                    <p className="shrink-0 font-mono text-xs tabular-nums text-ink">{formatCrore(dept.amount_cr)} <span className="text-ink/60">({dept.pct}%)</span></p>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden bg-ink/10">
                    <div className="h-full bg-ink/70" style={{ width: `${Math.min(dept.pct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <Provenance label={city.budgetYear} source="BBMP" />
        </section>
      ) : (
        <div className={`${SECTION} space-y-2`}>
          <div className="h-3 w-28 bg-ink/10 animate-pulse" />
          <SkeletonBarRow />
        </div>
      )}

      {/* Ward-level BBMP Spending */}
      {wardSpend && wardSpend.grand_total > 0 ? (
        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-3">
            <p className={EYEBROW}>Ward Spending</p>
            <p className="shrink-0 text-xs text-ink/70"><span className={`text-sm text-ink ${FIGURE}`}>{formatINR(wardSpend.grand_total)}</span> total</p>
          </div>
          <div className="mt-1.5 space-y-2">
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
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-ink/75">{label}</span>
                    <span className="shrink-0 font-mono tabular-nums text-ink">{formatINR(val)} <span className="text-ink/60">({pct}%)</span></span>
                  </div>
                  <div className="h-1 bg-ink/10">
                    <div className="h-1 bg-ink/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <Provenance label="2018-23" source="BBMP 198-ward records, estimated by map overlap" />
        </section>
      ) : !wardSpendAttributable ? (
        <section className={SECTION}>
          <p className={EYEBROW}>Ward Spending</p>
          <p className="mt-1 text-xs leading-snug text-ink/70">
            Not shown. BBMP recorded ward spending for 2018-23 on its older 198-ward map, which Kaun cannot yet match to this ward.
          </p>
        </section>
      ) : !wardSpendSettled ? (
        <div aria-busy="true" className={`${SECTION} space-y-2`}>
          <p className={EYEBROW}>Ward Spending</p>
          <SkeletonBarRow />
        </div>
      ) : (
        <div className={EMPTY}>
          <p className="text-sm text-ink/75">No ward spend data</p>
          <p className={`mt-0.5 ${SOURCE}`}>BBMP 2018-23 · Not yet available for this ward</p>
        </div>
      )}

      {/* Property Tax */}
      {propertyTax?.years && propertyTax.years.length > 0 ? (
        <section className={SECTION}>
          <p className={EYEBROW}>Property Tax Collection</p>
          <div className="mt-1 divide-y divide-ink/10 border-b border-ink/10">
            {propertyTax.years.map(yr => (
              <div key={yr.financial_year} className="flex items-baseline justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <p className="font-mono text-sm tabular-nums text-ink">{yr.financial_year}</p>
                  <p className="text-xs text-ink/60">{yr.total_applications?.toLocaleString("en-IN")} properties</p>
                </div>
                <p className={`shrink-0 text-sm text-ink ${FIGURE}`}>{formatLakh(yr.total_collection_lakh)}</p>
              </div>
            ))}
          </div>
          <Provenance label="2021-24" source="BBMP" />
        </section>
      ) : null}

      {/* Tenders — corporation-wide, clearly labelled; ward scoping isn't possible */}
      <CorporationTenders result={result} profile={profile} profileLoading={profileLoading} />

      {/* Work Orders */}
      <WorkOrdersList workOrders={workOrders} profileLoading={profileLoading} profile={profile} />

      {/* Contractor Accountability */}
      {contractors.length > 0 && (
        <section className={SECTION}>
          <p className={EYEBROW}>Contractors with work orders in this area</p>
          <p className="mt-1 text-xs leading-snug text-ink/70">Every figure here covers the firm&apos;s BBMP work orders across the city, not this ward&apos;s share. High payment deductions may reflect quality disputes, delays, or scope changes.</p>
          <div className="mt-1.5 border-t border-ink/10">
            {visibleContractors.map(c => {
              const isFlagged = c.blacklist_flags.length > 0
              return (
                <div key={c.entity_id} className={isFlagged ? "my-2 border border-warning/35 bg-warning/[0.07] px-3 py-2.5" : "border-b border-ink/10 py-2.5"}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        {isFlagged && <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-warning">Govt. Record</span>}
                        <p className="truncate text-sm font-semibold text-ink">{c.canonical_name}</p>
                      </div>
                      {c.aliases.length > 1 && (
                        <p className="mt-0.5 truncate text-xs text-ink/60">
                          Also: {c.aliases.filter(a => a !== c.canonical_name).slice(0, 2).join(", ")}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-right">
                      <span className={`block text-sm text-ink ${FIGURE}`}>{formatLakh(c.total_value_lakh)}</span>
                      <span className="block text-[11px] text-ink/70">city-wide</span>
                    </p>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <div>
                      <p className={`text-sm text-ink ${FIGURE}`}>{c.total_contracts}</p>
                      <p className="text-[11px] text-ink/70">Contracts, city-wide</p>
                    </div>
                    <div>
                      <p className={`text-sm text-ink ${FIGURE}`}>{c.ward_count}</p>
                      <p className="text-[11px] text-ink/70">Wards worked in</p>
                    </div>
                    <div>
                      <p className={`text-sm ${FIGURE} ${c.avg_deduction_pct > 15 ? "text-danger" : c.avg_deduction_pct > 10 ? "text-warning" : "text-ink"}`}>
                        {c.avg_deduction_pct}%
                      </p>
                      <p className="text-[11px] text-ink/70">Deductions</p>
                    </div>
                  </div>
                  {isFlagged && (
                    <div className="mt-2 border-t border-warning/25 pt-2">
                      {c.blacklist_flags.map((flag, i) => (
                        <p key={i} className="text-xs leading-relaxed text-warning">▸ {flag}</p>
                      ))}
                      {/* Each flag ends with its own citation (scripts/lib/contractor-flags.mjs);
                          none of them comes from KPPP or BBMP records. */}
                      <p className={`mt-1 ${SOURCE}`}>Reported by the source named on each line</p>
                    </div>
                  )}
                  {c.is_govt_entity && <p className="mt-1 text-xs text-ink/60">Government entity</p>}
                </div>
              )
            })}
          </div>
          {hiddenContractors > 0 && (
            <button
              type="button"
              onClick={() => setContractorsExpanded(value => !value)}
              aria-expanded={contractorsExpanded}
              className={TOGGLE}
            >
              <span>{contractorsExpanded ? "Show less" : `Show ${hiddenContractors} more contractor${hiddenContractors !== 1 ? "s" : ""}`}</span>
              <span aria-hidden="true">{contractorsExpanded ? "\u2191" : "\u2193"}</span>
            </button>
          )}
          <Provenance label="2013-25" source="BBMP / opencity.in" />
        </section>
      )}

      {/* Trade Licenses */}
      {tradeLicenses.length > 0 && (
        <section className={SECTION}>
          <p className={EYEBROW}>Trade Licenses</p>
          <div className="mt-1 divide-y divide-ink/10 border-b border-ink/10">
            {tradeLicenses.map(tl => (
              <div key={tl.year} className="py-2.5">
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className={`text-sm text-ink ${FIGURE}`}>{tl.year}</span>
                  <span className="text-xs text-ink/70"><span className={`text-sm text-ink ${FIGURE}`}>{tl.total_licenses.toLocaleString("en-IN")}</span> licenses</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className={`text-sm text-ink ${FIGURE}`}>{tl.new_licenses.toLocaleString("en-IN")}</p>
                    <p className="text-[11px] text-ink/70">New</p>
                  </div>
                  <div>
                    <p className={`text-sm text-ink ${FIGURE}`}>{tl.renewals.toLocaleString("en-IN")}</p>
                    <p className="text-[11px] text-ink/70">Renewed</p>
                  </div>
                  <div>
                    <p className={`text-sm text-ink ${FIGURE}`}>
                      {formatINR(tl.total_revenue)}
                    </p>
                    <p className="text-[11px] text-ink/70">Revenue</p>
                  </div>
                </div>
                {tl.top_trade_type && <p className="mt-1.5 truncate text-xs text-ink/60">Top: {tl.top_trade_type}</p>}
              </div>
            ))}
          </div>
          <Provenance label="2021-23" source="BBMP" />
        </section>
      )}
    </div>
  )
}
