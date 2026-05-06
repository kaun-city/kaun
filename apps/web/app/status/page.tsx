"use client"

import { useState, useEffect, useCallback } from "react"

interface TableCheck {
  table: string
  total: number | null
  recent_24h: number | null
  recent_7d: number | null
  latest_at: string | null
  status: "ok" | "empty" | "error"
}

interface CityCoverage {
  city_id: string
  name: string
  state: string
  expected_wards: number
  wards: number | null
  ward_amenities: number | null
  upyog_grievances: number | null
  upyog_property_tax: number | null
  city_budget_heads: number | null
  elected_reps: number | null
  readiness: number
}

interface HealthData {
  status: "healthy" | "degraded" | "down"
  timestamp: string
  supabase: "connected" | "error"
  tables: TableCheck[]
  cities: CityCoverage[]
  crons: { name: string; last_data_at: string | null; status: "ok" | "stale" | "unknown" }[]
  summary: {
    total_wards: number | null
    total_reps: number | null
    total_work_orders: number | null
    total_contractor_profiles: number | null
    reports_7d: number | null
    questions_7d: number | null
    signals_7d: number | null
    facts_active: number | null
  }
  analytics: {
    pin_drops_24h: number | null
    pin_drops_7d: number | null
    top_wards_7d: { ward_name: string; count: number }[]
  }
  recent_reports: { ward_name: string | null; issue_type: string | null; status: string | null; reported_at: string }[]
  recent_questions: { ward_name: string; question: string; created_at: string }[]
  recent_signals: { ward_no: number; issue_type: string; title: string; source: string; signal_at: string }[]
  recent_community_facts: { ward_no: number | null; category: string; subject: string; field: string; value: string; created_at: string }[]
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never"
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatusDot({ status }: { status: string }) {
  const color = status === "ok" || status === "healthy" || status === "connected"
    ? "bg-green-500"
    : status === "stale" || status === "degraded" || status === "empty"
      ? "bg-yellow-500"
      : "bg-red-500"
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

function CovStat({ label, value, target, pct }: { label: string; value: number | null; target?: number; pct?: number }) {
  const dim = value === null || value === 0
  return (
    <div>
      <p className="text-white/30 uppercase tracking-wider">{label}</p>
      <p className={`font-mono mt-0.5 ${dim ? "text-white/20" : "text-white/70"}`}>
        {value === null ? "—" : value.toLocaleString("en-IN")}
        {target ? <span className="text-white/15">/{target}</span> : null}
        {typeof pct === "number" && target ? <span className="text-white/30 ml-1">({pct}%)</span> : null}
      </p>
    </div>
  )
}

function ReportStatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const styles: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    approved: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
  }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles[status] ?? "bg-white/10 text-white/40"}`}>{status}</span>
}

export default function StatusPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [activeTab, setActiveTab] = useState<"reports" | "questions" | "signals" | "facts">("reports")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/health")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setLastRefresh(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const timer = setInterval(refresh, 30000)
    return () => clearInterval(timer)
  }, [refresh])

  const activityTabs = [
    { id: "reports" as const, label: "Reports", count: data?.recent_reports.length ?? 0 },
    { id: "questions" as const, label: "Ask Kaun", count: data?.recent_questions.length ?? 0 },
    { id: "signals" as const, label: "Signals", count: data?.recent_signals.length ?? 0 },
    { id: "facts" as const, label: "Community", count: data?.recent_community_facts.length ?? 0 },
  ]

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#0A0A0A] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <a href="/" className="hover:text-[#FF9933] transition-colors">KAUN<span className="text-[#FF9933]">?</span></a>
              <span className="text-white/30 font-normal ml-3 text-lg">System Status</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="flex items-center gap-2">
                <StatusDot status={data.status} />
                <span className={`text-sm font-semibold uppercase tracking-wider ${
                  data.status === "healthy" ? "text-green-400" :
                  data.status === "degraded" ? "text-yellow-400" : "text-red-400"
                }`}>{data.status}</span>
              </div>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="text-white/30 hover:text-white/60 text-sm px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {loading ? "Checking..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 mb-6">
            <p className="text-red-400 text-sm">Failed to fetch health data: {error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Wards", value: data.summary.total_wards, target: 243 },
                { label: "Elected Reps", value: data.summary.total_reps },
                { label: "Work Orders", value: data.summary.total_work_orders },
                { label: "Contractor Profiles", value: data.summary.total_contractor_profiles },
                { label: "Reports (7d)", value: data.summary.reports_7d, highlight: true },
                { label: "AI Questions (7d)", value: data.summary.questions_7d, highlight: true },
                { label: "Civic Signals (7d)", value: data.summary.signals_7d, highlight: true },
                { label: "Pulse Facts", value: data.summary.facts_active },
              ].map(card => (
                <div key={card.label} className={`rounded-xl p-4 ${card.highlight ? "bg-[#FF9933]/5 border border-[#FF9933]/10" : "bg-white/5"}`}>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">{card.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    card.value === null ? "text-white/20" :
                    card.value === 0 && card.highlight ? "text-white/20" :
                    card.highlight && (card.value ?? 0) > 0 ? "text-[#FF9933]" : "text-white"
                  }`}>
                    {card.value?.toLocaleString("en-IN") ?? "--"}
                    {card.target && card.value ? <span className="text-white/20 text-sm font-normal">/{card.target}</span> : null}
                  </p>
                </div>
              ))}
            </div>

            {/* City Coverage — what data is flowing per city */}
            {data.cities && data.cities.length > 0 && (
              <div className="rounded-xl bg-white/5 overflow-hidden mb-8">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">City Coverage</p>
                  <p className="text-white/20 text-[10px]">{data.cities.length} cities registered</p>
                </div>
                <div className="divide-y divide-white/5">
                  {data.cities.map(c => {
                    const pct = Math.round(c.readiness * 100)
                    const wardPct = c.expected_wards > 0 ? Math.round(((c.wards ?? 0) / c.expected_wards) * 100) : 0
                    const barColor = pct >= 75 ? "bg-green-400" : pct >= 40 ? "bg-yellow-400" : "bg-orange-400"
                    return (
                      <div key={c.city_id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-white/80 text-sm font-semibold">{c.name}</p>
                            <p className="text-white/30 text-[10px]">{c.state} · {c.city_id}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-white/70 text-sm font-mono">{pct}%</p>
                            <p className="text-white/20 text-[10px]">readiness</p>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2 text-[10px]">
                          <CovStat label="Wards" value={c.wards} target={c.expected_wards} pct={wardPct} />
                          <CovStat label="Amenities" value={c.ward_amenities} />
                          <CovStat label="Grievances" value={c.upyog_grievances} />
                          <CovStat label="Property Tax" value={c.upyog_property_tax} />
                          <CovStat label="Budget Heads" value={c.city_budget_heads} />
                          <CovStat label="Elected Reps" value={c.elected_reps} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* User Engagement */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
              <div className="rounded-xl bg-[#FF9933]/5 border border-[#FF9933]/10 p-4">
                <p className="text-white/40 text-[10px] uppercase tracking-wider">Pin Drops (24h)</p>
                <p className={`text-2xl font-bold mt-1 ${(data.analytics?.pin_drops_24h ?? 0) > 0 ? "text-[#FF9933]" : "text-white/20"}`}>
                  {data.analytics?.pin_drops_24h ?? "--"}
                </p>
              </div>
              <div className="rounded-xl bg-[#FF9933]/5 border border-[#FF9933]/10 p-4">
                <p className="text-white/40 text-[10px] uppercase tracking-wider">Pin Drops (7d)</p>
                <p className={`text-2xl font-bold mt-1 ${(data.analytics?.pin_drops_7d ?? 0) > 0 ? "text-[#FF9933]" : "text-white/20"}`}>
                  {data.analytics?.pin_drops_7d ?? "--"}
                </p>
              </div>
              {data.analytics?.top_wards_7d && data.analytics.top_wards_7d.length > 0 && (
                <div className="rounded-xl bg-white/5 p-4 col-span-2 md:col-span-1">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Top Wards (7d)</p>
                  <div className="space-y-1">
                    {data.analytics.top_wards_7d.slice(0, 5).map((w, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <p className="text-white/60 text-xs truncate">{w.ward_name}</p>
                        <p className="text-[#FF9933] text-xs font-mono shrink-0">{w.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Database + Crons */}
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <div className="rounded-xl bg-white/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <StatusDot status={data.supabase} />
                  <span className="text-white/60 text-sm">Supabase (PostgreSQL + PostGIS)</span>
                </div>
                <p className={`text-xs ${data.supabase === "connected" ? "text-green-400/60" : "text-red-400"}`}>
                  {data.supabase}
                </p>
              </div>
              <div className="rounded-xl bg-white/5 p-4">
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-3">Scheduled Jobs</p>
                <div className="space-y-2">
                  {data.crons.map(cron => (
                    <div key={cron.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusDot status={cron.status} />
                        <span className="text-white/70 text-xs">{cron.name}</span>
                      </div>
                      <span className="text-white/30 text-xs">{timeAgo(cron.last_data_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Activity Feed */}
            <div className="rounded-xl bg-white/5 overflow-hidden mb-8">
              <div className="flex border-b border-white/5 overflow-x-auto">
                {activityTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 min-w-0 px-2 py-3 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? "text-[#FF9933] border-b-2 border-[#FF9933]"
                        : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && <span className="ml-1 text-[10px] text-white/20">{tab.count}</span>}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-white/5">
                {/* Reports */}
                {activeTab === "reports" && (
                  data.recent_reports.length > 0 ? data.recent_reports.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-white/70 text-sm truncate">{r.ward_name ?? "Unknown ward"}</p>
                          <ReportStatusBadge status={r.status} />
                        </div>
                        <p className="text-white/30 text-xs mt-0.5">{r.issue_type ?? "General"}</p>
                      </div>
                      <span className="text-white/20 text-xs shrink-0">{timeAgo(r.reported_at)}</span>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center"><p className="text-white/20 text-sm">No recent reports</p></div>
                  )
                )}

                {/* Ask Kaun Questions */}
                {activeTab === "questions" && (
                  data.recent_questions.length > 0 ? data.recent_questions.map((q, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[#FF9933]/60 text-xs">{q.ward_name}</p>
                        <span className="text-white/20 text-xs shrink-0">{timeAgo(q.created_at)}</span>
                      </div>
                      <p className="text-white/70 text-sm mt-0.5 line-clamp-2">{q.question}</p>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center"><p className="text-white/20 text-sm">No recent questions</p></div>
                  )
                )}

                {/* Civic Signals */}
                {activeTab === "signals" && (
                  data.recent_signals.length > 0 ? data.recent_signals.map((s, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[#FF9933]/50 text-[10px] font-semibold uppercase">{s.issue_type}</span>
                          <span className="text-white/15 text-[10px]">Ward {s.ward_no}</span>
                          <span className="text-white/15 text-[10px]">{s.source}</span>
                        </div>
                        <span className="text-white/20 text-xs shrink-0">{timeAgo(s.signal_at)}</span>
                      </div>
                      <p className="text-white/70 text-sm mt-0.5 line-clamp-2">{s.title}</p>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center"><p className="text-white/20 text-sm">No recent signals</p></div>
                  )
                )}

                {/* Community Facts */}
                {activeTab === "facts" && (
                  data.recent_community_facts.length > 0 ? data.recent_community_facts.map((f, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white/30 text-[10px] uppercase">{f.category}</span>
                          {f.ward_no && <span className="text-white/15 text-[10px]">Ward {f.ward_no}</span>}
                        </div>
                        <p className="text-white/70 text-sm mt-0.5">{f.subject}: {f.field}</p>
                        <p className="text-white/40 text-xs mt-0.5">{f.value}</p>
                      </div>
                      <span className="text-white/20 text-xs shrink-0">{timeAgo(f.created_at)}</span>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center"><p className="text-white/20 text-sm">No community facts yet</p></div>
                  )
                )}
              </div>
            </div>

            {/* Tables Detail */}
            <div className="rounded-xl bg-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-white/40 text-[10px] uppercase tracking-wider">Database Tables</p>
              </div>
              <div className="divide-y divide-white/5">
                {data.tables.map(t => (
                  <div key={t.table} className="px-4 py-3 flex items-center gap-4">
                    <StatusDot status={t.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-sm font-mono">{t.table}</p>
                    </div>
                    <div className="hidden md:flex items-center gap-6 text-right">
                      <div>
                        <p className="text-white/60 text-sm font-mono">{t.total?.toLocaleString("en-IN") ?? "--"}</p>
                        <p className="text-white/20 text-[10px]">total</p>
                      </div>
                      <div>
                        <p className={`text-sm font-mono ${(t.recent_24h ?? 0) > 0 ? "text-green-400" : "text-white/20"}`}>
                          {t.recent_24h ?? "--"}
                        </p>
                        <p className="text-white/20 text-[10px]">24h</p>
                      </div>
                      <div>
                        <p className={`text-sm font-mono ${(t.recent_7d ?? 0) > 0 ? "text-[#FF9933]" : "text-white/20"}`}>
                          {t.recent_7d ?? "--"}
                        </p>
                        <p className="text-white/20 text-[10px]">7d</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white/30 text-xs">{timeAgo(t.latest_at)}</p>
                      <p className="text-white/15 text-[10px]">latest</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center space-y-1">
              <p className="text-white/15 text-xs">
                Auto-refreshes every 30s · Last checked {lastRefresh.toLocaleTimeString()}
              </p>
              <p className="text-white/10 text-xs">
                kaun.city · open source civic accountability
              </p>
            </div>
          </>
        )}

        {!data && !error && loading && (
          <div className="text-center py-20">
            <div className="w-6 h-6 border-2 border-white/20 border-t-[#FF9933] rounded-full animate-spin mx-auto" />
            <p className="text-white/30 text-sm mt-4">Checking systems...</p>
          </div>
        )}
      </div>
    </div>
  )
}
