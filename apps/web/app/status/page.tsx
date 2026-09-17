"use client"

import { BackLink, PageHeader } from "@/components/shared/PageHeader"
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
  build: {
    sha: string
    ref: string
    built_at: string
  }
  supabase: "connected" | "error"
  tables: TableCheck[]
  cities: CityCoverage[]
  crons: { name: string; last_run_at: string | null; last_data_at: string | null; status: "ok" | "stale" | "unknown" }[]
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
  const timestamp = new Date(dateStr).getTime()
  if (Number.isNaN(timestamp)) return "unknown"
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function statusTone(status: string): { dot: string; text: string } {
  return status === "ok" || status === "healthy" || status === "connected"
    ? { dot: "bg-success", text: "text-success" }
    : status === "stale" || status === "degraded" || status === "empty" || status === "unknown"
      ? { dot: "bg-warning", text: "text-warning" }
      : { dot: "bg-danger", text: "text-danger" }
}

/** Status is never colour alone: pass `showLabel` wherever no text label sits beside the dot. */
function StatusDot({ status, showLabel = false }: { status: string; showLabel?: boolean }) {
  const tone = statusTone(status)
  if (showLabel) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ${tone.text}`}>
        <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
        {status}
      </span>
    )
  }
  return <span role="img" aria-label={`Status: ${status}`} className={`inline-block w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
}

const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60"

function CovStat({ label, value, target, pct }: { label: string; value: number | null; target?: number; pct?: number }) {
  const dim = value === null || value === 0
  return (
    <div>
      <p className="text-ink/60 uppercase tracking-[0.08em]">{label}</p>
      <p className={`font-mono tabular-nums text-xs mt-0.5 ${dim ? "text-ink/60" : "font-semibold text-ink"}`}>
        {value === null ? "—" : value.toLocaleString("en-IN")}
        {target ? <span className="font-normal text-ink/60">/{target}</span> : null}
        {typeof pct === "number" && target ? <span className="font-normal text-ink/60 ml-1">({pct}%)</span> : null}
      </p>
    </div>
  )
}

function ReportStatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const styles: Record<string, string> = {
    pending: "bg-warning/[0.07] border-warning/35 text-warning",
    approved: "bg-success/[0.07] border-success/35 text-success",
    rejected: "bg-danger/[0.07] border-danger/35 text-danger",
  }
  return <span className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[11px] ${styles[status] ?? "border-ink/20 text-ink/70"}`}>{status}</span>
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
    <div className="signal-page fixed inset-0 overflow-y-auto bg-paper-canvas text-ink">
      <PageHeader surface="city" back={<BackLink href="/" label="Map" ariaLabel="Back to the map" />} width="4xl" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">System status</h1>
            {data && (
              <p className="mt-1 text-[11px] text-ink/60 font-mono">
                build {data.build.sha.slice(0, 7)} &middot; {data.build.ref} &middot; {timeAgo(data.build.built_at)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="flex items-center gap-2">
                <StatusDot status={data.status} />
                <span className={`font-mono text-sm font-semibold uppercase tracking-[0.08em] ${statusTone(data.status).text}`}>{data.status}</span>
              </div>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="min-h-11 px-4 bg-paper border border-ink/55 text-ink font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-paper-muted transition-colors disabled:border-ink/20 disabled:text-ink/50 disabled:hover:bg-paper"
            >
              {loading ? "Checking..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-danger/[0.07] border border-danger/35 px-4 py-3 mb-6">
            <p className="text-danger text-sm">Failed to fetch health data: {error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink/15 border border-ink/15 mb-8">
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
                <div key={card.label} className={`p-4 ${card.highlight ? "bg-paper-muted" : "bg-paper"}`}>
                  <p className={EYEBROW}>{card.label}</p>
                  <p className={`font-mono tabular-nums text-2xl font-semibold mt-1 ${
                    card.value === null ? "text-ink/60" :
                    card.value === 0 && card.highlight ? "text-ink/60" : "text-ink"
                  }`}>
                    {card.value?.toLocaleString("en-IN") ?? "--"}
                    {card.target && card.value ? <span className="text-ink/60 text-sm font-normal">/{card.target}</span> : null}
                  </p>
                </div>
              ))}
            </div>

            {/* City Coverage — what data is flowing per city */}
            {data.cities && data.cities.length > 0 && (
              <section className="bg-paper border border-ink/15 mb-8">
                <div className="px-4 py-3 border-b border-ink/15 flex items-center justify-between gap-3">
                  <h2 className={EYEBROW}>City Coverage</h2>
                  <p className="text-ink/60 font-mono text-[11px]">{data.cities.length} cities registered</p>
                </div>
                <div className="divide-y divide-ink/10">
                  {data.cities.map(c => {
                    const pct = Math.round(c.readiness * 100)
                    const wardPct = c.expected_wards > 0 ? Math.round(((c.wards ?? 0) / c.expected_wards) * 100) : 0
                    const barColor = pct >= 40 ? "bg-ink/70" : "bg-danger"
                    return (
                      <div key={c.city_id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-ink text-sm font-semibold">{c.name}</p>
                            <p className="text-ink/60 font-mono text-[11px]">{c.state} · {c.city_id}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-ink text-sm font-mono tabular-nums font-semibold">{pct}%</p>
                            <p className="text-ink/60 text-[11px]">readiness</p>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-ink/10 overflow-hidden">
                          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2 text-[11px]">
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
              </section>
            )}

            {/* Ward Crosswalk — Kaun-derived public dataset */}
            <section className="bg-paper border border-ink/15 mb-8">
              <div className="px-4 py-3 border-b border-ink/15 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 className={EYEBROW}>Ward Crosswalk · BBMP-Final-225 ↔ DataMeet-243</h2>
                <p className="text-ink/60 text-[11px] font-mono">v2023f-2026.05</p>
              </div>
              <div className="px-4 py-3">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-[11px]">
                  <CovStat label="Wards mapped" value={225} />
                  <CovStat label="Clean 1:1" value={123} />
                  <CovStat label="Split-primary" value={83} />
                  <CovStat label="True-split" value={19} />
                  <CovStat label="WOs resolved" value={9963} />
                  <CovStat label="City-wide WOs" value={5494} />
                </div>
                <p className="text-ink/70 text-xs mt-3 pt-3 border-t border-ink/10 leading-relaxed">
                  First public BBMP-official ↔ KGIS ward correspondence, derived deterministically by
                  spatial overlap. Methodology &amp; corrections:{" "}
                  <a href="https://data.kaun.city/bengaluru/ward-crosswalk/" target="_blank" rel="noopener noreferrer" className="font-mono text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">data.kaun.city/bengaluru/ward-crosswalk</a>
                </p>
              </div>
            </section>

            {/* User Engagement */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
              <div className="bg-paper border border-ink/15 p-4">
                <p className={EYEBROW}>Pin Drops (24h)</p>
                <p className={`font-mono tabular-nums text-2xl font-semibold mt-1 ${(data.analytics?.pin_drops_24h ?? 0) > 0 ? "text-ink" : "text-ink/60"}`}>
                  {data.analytics?.pin_drops_24h ?? "--"}
                </p>
              </div>
              <div className="bg-paper border border-ink/15 p-4">
                <p className={EYEBROW}>Pin Drops (7d)</p>
                <p className={`font-mono tabular-nums text-2xl font-semibold mt-1 ${(data.analytics?.pin_drops_7d ?? 0) > 0 ? "text-ink" : "text-ink/60"}`}>
                  {data.analytics?.pin_drops_7d ?? "--"}
                </p>
              </div>
              {data.analytics?.top_wards_7d && data.analytics.top_wards_7d.length > 0 && (
                <div className="bg-paper border border-ink/15 p-4 col-span-2 md:col-span-1">
                  <p className={`${EYEBROW} mb-2`}>Top Wards (7d)</p>
                  <div className="divide-y divide-ink/10">
                    {data.analytics.top_wards_7d.slice(0, 5).map((w, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-1">
                        <p className="text-ink/80 text-xs truncate">{w.ward_name}</p>
                        <p className="text-ink text-xs font-mono tabular-nums font-semibold shrink-0">{w.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Database + Crons */}
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <section className="bg-paper border border-ink/15 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <StatusDot status={data.supabase} />
                  <span className="text-ink/80 text-sm">Supabase (PostgreSQL + PostGIS)</span>
                </div>
                <p className={`font-mono text-xs font-semibold uppercase tracking-[0.06em] ${data.supabase === "connected" ? "text-success" : "text-danger"}`}>
                  {data.supabase}
                </p>
              </section>
              <section className="bg-paper border border-ink/15 p-4">
                <h2 className={`${EYEBROW} mb-2`}>Scheduled Jobs</h2>
                <div className="divide-y divide-ink/10">
                  {data.crons.map(cron => (
                    <div key={cron.name} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-ink/80 text-xs min-w-0 truncate">{cron.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusDot status={cron.status} showLabel />
                        <span
                          className="text-ink/60 text-xs font-mono"
                          title={`Last successful run ${timeAgo(cron.last_run_at)}; newest data ${timeAgo(cron.last_data_at)}`}
                        >
                          ran {timeAgo(cron.last_run_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Activity Feed */}
            <section className="bg-paper border border-ink/15 mb-8">
              <div className="flex border-b border-ink/15 overflow-x-auto">
                {activityTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 min-w-0 min-h-11 px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap border-r border-ink/20 last:border-r-0 transition-colors ${
                      activeTab === tab.id
                        ? "bg-ink text-paper"
                        : "text-ink/60 hover:text-ink hover:bg-ink/5"
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && <span className={`ml-1 tabular-nums ${activeTab === tab.id ? "text-paper/80" : "text-ink/60"}`}>{tab.count}</span>}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-ink/10">
                {/* Reports */}
                {activeTab === "reports" && (
                  data.recent_reports.length > 0 ? data.recent_reports.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-ink/85 text-sm truncate">{r.ward_name ?? "Unknown ward"}</p>
                          <ReportStatusBadge status={r.status} />
                        </div>
                        <p className="text-ink/60 text-xs mt-0.5">{r.issue_type ?? "General"}</p>
                      </div>
                      <span className="text-ink/60 text-xs font-mono shrink-0">{timeAgo(r.reported_at)}</span>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center"><p className="text-ink/60 text-sm">No recent reports</p></div>
                  )
                )}

                {/* Ask Kaun Questions */}
                {activeTab === "questions" && (
                  data.recent_questions.length > 0 ? data.recent_questions.map((q, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-ink/70 text-xs font-medium">{q.ward_name}</p>
                        <span className="text-ink/60 text-xs font-mono shrink-0">{timeAgo(q.created_at)}</span>
                      </div>
                      <p className="text-ink/85 text-sm mt-0.5 line-clamp-2">{q.question}</p>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center"><p className="text-ink/60 text-sm">No recent questions</p></div>
                  )
                )}

                {/* Civic Signals */}
                {activeTab === "signals" && (
                  data.recent_signals.length > 0 ? data.recent_signals.map((s, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-ink/75 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]">{s.issue_type}</span>
                          <span className="text-ink/60 text-[11px]">Ward {s.ward_no}</span>
                          <span className="text-ink/60 text-[11px] truncate">{s.source}</span>
                        </div>
                        <span className="text-ink/60 text-xs font-mono shrink-0">{timeAgo(s.signal_at)}</span>
                      </div>
                      <p className="text-ink/85 text-sm mt-0.5 line-clamp-2">{s.title}</p>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center"><p className="text-ink/60 text-sm">No recent signals</p></div>
                  )
                )}

                {/* Community Facts */}
                {activeTab === "facts" && (
                  data.recent_community_facts.length > 0 ? data.recent_community_facts.map((f, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-ink/60 font-mono text-[11px] uppercase tracking-[0.06em]">{f.category}</span>
                          {f.ward_no && <span className="text-ink/60 text-[11px]">Ward {f.ward_no}</span>}
                        </div>
                        <p className="text-ink/85 text-sm mt-0.5">{f.subject}: {f.field}</p>
                        <p className="text-ink/70 text-xs mt-0.5">{f.value}</p>
                      </div>
                      <span className="text-ink/60 text-xs font-mono shrink-0">{timeAgo(f.created_at)}</span>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center"><p className="text-ink/60 text-sm">No community facts yet</p></div>
                  )
                )}
              </div>
            </section>

            {/* Tables Detail */}
            <section className="bg-paper border border-ink/15">
              <div className="px-4 py-3 border-b border-ink/15">
                <h2 className={EYEBROW}>Database Tables</h2>
              </div>
              <div className="divide-y divide-ink/10">
                {data.tables.map(t => (
                  <div key={t.table} className="px-4 py-3 flex items-center gap-4">
                    <div className="w-16 shrink-0">
                      <StatusDot status={t.status} showLabel />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-sm font-mono truncate">{t.table}</p>
                    </div>
                    <div className="hidden md:flex items-center gap-6 text-right">
                      <div>
                        <p className="text-ink/80 text-sm font-mono tabular-nums">{t.total?.toLocaleString("en-IN") ?? "--"}</p>
                        <p className="text-ink/60 text-[11px]">total</p>
                      </div>
                      <div>
                        <p className={`text-sm font-mono tabular-nums ${(t.recent_24h ?? 0) > 0 ? "text-success font-semibold" : "text-ink/60"}`}>
                          {t.recent_24h ?? "--"}
                        </p>
                        <p className="text-ink/60 text-[11px]">24h</p>
                      </div>
                      <div>
                        <p className={`text-sm font-mono tabular-nums ${(t.recent_7d ?? 0) > 0 ? "text-ink font-semibold" : "text-ink/60"}`}>
                          {t.recent_7d ?? "--"}
                        </p>
                        <p className="text-ink/60 text-[11px]">7d</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-ink/70 text-xs font-mono">{timeAgo(t.latest_at)}</p>
                      <p className="text-ink/60 text-[11px]">latest</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-ink/15 text-center space-y-1">
              <p className="text-ink/60 text-xs">
                Auto-refreshes every 30s · Last checked {lastRefresh.toLocaleTimeString()}
              </p>
              <p className="text-ink/60 text-xs">
                kaun.city · open source civic accountability
              </p>
            </div>
          </>
        )}

        {!data && !error && loading && (
          <div className="text-center py-20">
            <div className="w-6 h-6 border-2 border-ink/15 border-t-ink/70 rounded-full animate-spin mx-auto" />
            <p className="text-ink/60 text-sm mt-4">Checking systems...</p>
          </div>
        )}
      </div>
    </div>
  )
}
