import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 15

interface TableCheck {
  table: string
  total: number | null
  recent_24h: number | null
  recent_7d: number | null
  latest_at: string | null
  status: "ok" | "empty" | "error"
}

interface HealthResult {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkTable(
  supabase: any,
  table: string,
  dateCol: string,
): Promise<TableCheck> {
  try {
    // Total count
    const { count: total } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })

    // Recent 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: recent24h } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .gte(dateCol, since24h)

    // Recent 7d
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: recent7d } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .gte(dateCol, since7d)

    // Latest entry
    const { data: latest } = await supabase
      .from(table)
      .select(dateCol)
      .order(dateCol, { ascending: false })
      .limit(1)

    const latestAt = latest?.[0]?.[dateCol] ?? null

    return {
      table,
      total: total ?? 0,
      recent_24h: recent24h ?? 0,
      recent_7d: recent7d ?? 0,
      latest_at: latestAt,
      status: (total ?? 0) > 0 ? "ok" : "empty",
    }
  } catch {
    return { table, total: null, recent_24h: null, recent_7d: null, latest_at: null, status: "error" }
  }
}

export async function GET() {
  const result: HealthResult = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    supabase: "error",
    tables: [],
    crons: [],
    summary: {
      total_wards: null,
      total_reps: null,
      total_work_orders: null,
      total_contractor_profiles: null,
      reports_7d: null,
      questions_7d: null,
      signals_7d: null,
      facts_active: null,
    },
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // Test connectivity
    const { error: pingErr } = await supabase.from("wards").select("ward_no", { count: "exact", head: true })
    if (pingErr) throw pingErr
    result.supabase = "connected"

    // Check key tables
    const tableChecks = await Promise.all([
      checkTable(supabase, "wards", "created_at"),
      checkTable(supabase, "elected_reps", "created_at"),
      checkTable(supabase, "bbmp_work_orders", "created_at"),
      checkTable(supabase, "contractor_profiles", "updated_at"),
      checkTable(supabase, "ward_reports", "reported_at"),
      checkTable(supabase, "ask_kaun_logs", "created_at"),
      checkTable(supabase, "civic_signals", "signal_at"),
      checkTable(supabase, "community_facts", "created_at"),
      checkTable(supabase, "city_pulse_facts", "created_at"),
      checkTable(supabase, "ward_grievances", "created_at"),
      checkTable(supabase, "tenders", "created_at"),
    ])
    result.tables = tableChecks

    // Summary
    const find = (t: string) => tableChecks.find(c => c.table === t)
    result.summary = {
      total_wards: find("wards")?.total ?? null,
      total_reps: find("elected_reps")?.total ?? null,
      total_work_orders: find("bbmp_work_orders")?.total ?? null,
      total_contractor_profiles: find("contractor_profiles")?.total ?? null,
      reports_7d: find("ward_reports")?.recent_7d ?? null,
      questions_7d: find("ask_kaun_logs")?.recent_7d ?? null,
      signals_7d: find("civic_signals")?.recent_7d ?? null,
      facts_active: find("city_pulse_facts")?.total ?? null,
    }

    // Cron health — check freshness of data each cron produces
    const signalsLatest = find("civic_signals")?.latest_at
    const pulseLatest = find("city_pulse_facts")?.latest_at
    result.crons = [
      {
        name: "ingest-signals (daily 2am UTC)",
        last_data_at: signalsLatest ?? null,
        status: signalsLatest && (Date.now() - new Date(signalsLatest).getTime()) < 48 * 60 * 60 * 1000 ? "ok" : "stale",
      },
      {
        name: "refresh-pulse (daily 6am UTC)",
        last_data_at: pulseLatest ?? null,
        status: pulseLatest && (Date.now() - new Date(pulseLatest).getTime()) < 48 * 60 * 60 * 1000 ? "ok" : "stale",
      },
    ]

    // Overall status
    const errors = tableChecks.filter(t => t.status === "error")
    const coreEmpty = ["wards", "elected_reps"].some(t => find(t)?.status !== "ok")
    if (errors.length > 0 || coreEmpty) result.status = "degraded"
    if (result.supabase !== "connected") result.status = "down"

  } catch (e) {
    result.status = "down"
    result.supabase = "error"
  }

  return Response.json(result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
