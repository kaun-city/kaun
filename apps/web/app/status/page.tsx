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

interface HealthData {
  status: "healthy" | "degraded" | "down"
  timestamp: string
  supabase: "connected" | "error"
  tables: TableCheck[]
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

export default function StatusPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

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

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(refresh, 30000)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
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

            {/* Database Connection */}
            <div className="rounded-xl bg-white/5 p-4 mb-4">
              <div className="flex items-center gap-2">
                <StatusDot status={data.supabase} />
                <span className="text-white/60 text-sm">Supabase (PostgreSQL + PostGIS)</span>
                <span className={`text-xs ml-auto ${data.supabase === "connected" ? "text-green-400/60" : "text-red-400"}`}>
                  {data.supabase}
                </span>
              </div>
            </div>

            {/* Cron Jobs */}
            <div className="rounded-xl bg-white/5 p-4 mb-4">
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-3">Scheduled Jobs</p>
              <div className="space-y-2">
                {data.crons.map(cron => (
                  <div key={cron.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot status={cron.status} />
                      <span className="text-white/70 text-sm">{cron.name}</span>
                    </div>
                    <span className="text-white/30 text-xs">{timeAgo(cron.last_data_at)}</span>
                  </div>
                ))}
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
