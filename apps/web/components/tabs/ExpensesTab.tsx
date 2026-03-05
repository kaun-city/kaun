"use client"

import { STATUS_STYLES } from "@/lib/constants"
import { formatLakh, timeAgo } from "@/lib/ward-utils"
import type { CityConfig } from "@/lib/cities"
import type { BudgetSummary, PinResult, RedditPost, WardProfile, WardTradeLicenses, WorkOrder } from "@/lib/types"

interface Props {
  result: PinResult
  city: CityConfig
  profile: WardProfile | null
  profileLoading: boolean
  budget: BudgetSummary | null
  workOrders: WorkOrder[]
  tradeLicenses: WardTradeLicenses[]
  buzz: RedditPost[] | null
  buzzLoading: boolean
}

export function ExpensesTab({ result, city, profile, profileLoading, budget, workOrders, tradeLicenses, buzz, buzzLoading }: Props) {
  return (
    <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-4">

      {/* City-wide Budget */}
      {budget && (
        <div className="rounded-xl bg-white/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[10px] uppercase tracking-wider">BBMP Budget {budget.financial_year}</p>
            <p className="text-[#FF9933] text-lg font-bold">
              Rs.{budget.total_expenditure_lakh ? Math.round(budget.total_expenditure_lakh / 100).toLocaleString("en-IN") : "--"} Cr
            </p>
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
          <p className="text-white/15 text-[10px]">Source: BBMP Budget Book 2024-25 via opencity.in</p>
        </div>
      )}

      {/* Tenders */}
      {profileLoading && !profile ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
              <div className="h-3 w-3/4 bg-white/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : profile && profile.tenders.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-white/30 text-xs uppercase tracking-wider">
              {profile.tender_count} tender{profile.tender_count !== 1 ? "s" : ""}
            </p>
            <p className="text-[#FF9933] text-xs font-semibold">{formatLakh(profile.tender_total_lakh)} total</p>
          </div>
          {profile.tenders.map(t => {
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
                    {t.contractor_blacklisted && <span className="text-red-400 text-xs font-bold">FLAGGED</span>}
                    <p className={`text-xs ${t.contractor_blacklisted ? "text-red-300" : "text-white/40"}`}>{t.contractor_name}</p>
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
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-white/30 text-sm">No tenders found for this ward</p>
          <p className="text-white/20 text-xs mt-1">File an RTI to get the complete works register.</p>
        </div>
      )}
      <p className="text-white/15 text-[10px] px-1">Source: KPPP karnataka.gov.in</p>

      {/* Work Orders 2024-25 */}
      {workOrders.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/30 text-[10px] uppercase tracking-wider">Works 2024-25 ({workOrders.length})</p>
            <p className="text-white/15 text-[10px]">BBMP via opencity.in</p>
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
      )}

      {/* Trade Licenses */}
      {tradeLicenses.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/30 text-[10px] uppercase tracking-wider">Trade Licenses (BBMP)</p>
            <p className="text-white/15 text-[10px]">opencity.in</p>
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

      {/* Reddit buzz */}
      {buzz && buzz.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/30 text-xs uppercase tracking-wider">r/{city.subreddit} chatter</p>
            <p className="text-white/15 text-[10px]">reddit.com/r/{city.subreddit}</p>
          </div>
          {buzz.map((post, i) => (
            <a key={i} href={post.url} target="_blank" rel="noopener noreferrer" className="block group">
              <div className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <p className="text-white text-xs leading-snug group-hover:text-[#FF9933] transition-colors line-clamp-2">{post.title}</p>
                <p className="text-white/25 text-xs mt-1">+{post.score}  -  {post.num_comments} comments  -  {timeAgo(post.created_utc)}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
