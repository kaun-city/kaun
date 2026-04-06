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

interface RecentReport {
  ward_name: string | null
  issue_type: string | null
  status: string | null
  reported_at: string
}

interface RecentQuestion {
  ward_name: string
  question: string
  created_at: string
}

interface RecentSignal {
  ward_no: number
  issue_type: string
  title: string
  source: string
  signal_at: string
}

interface RecentFact {
  ward_no: number | null
  category: string
  subject: string
  field: string
  value: string
  created_at: string
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
  analytics: {
    pin_drops_24h: number | null
    pin_drops_7d: number | null
    top_wards_7d: { ward_name: string; count: number }[]
  }
  recent_reports: RecentReport[]
  recent_questions: RecentQuestion[]
  recent_signals: RecentSignal[]
  recent_community_facts: RecentFact[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkTable(
  supabase: any,
  table: string,
  dateCol: string,
): Promise<TableCheck> {
  try {
    const { count: total } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: recent24h } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .gte(dateCol, since24h)

    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: recent7d } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .gte(dateCol, since7d)

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
    analytics: {
      pin_drops_24h: null,
      pin_drops_7d: null,
      top_wards_7d: [],
    },
    recent_reports: [],
    recent_questions: [],
    recent_signals: [],
    recent_community_facts: [],
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
      checkTable(supabase, "ask_kaun_logs", "asked_at"),
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

    // Analytics — pin drop counts
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [drops24h, drops7d, topWards] = await Promise.all([
        supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event", "pin_drop").gte("created_at", since24h),
        supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event", "pin_drop").gte("created_at", since7d),
        supabase.rpc("top_pin_drop_wards", { p_days: 7 }).then((r: { data: { ward_name: string; count: number }[] | null }) => r.data ?? []),
      ])
      result.analytics = {
        pin_drops_24h: drops24h.count ?? 0,
        pin_drops_7d: drops7d.count ?? 0,
        top_wards_7d: topWards.slice(0, 5),
      }
    } catch {
      // analytics_events table may not exist yet
    }

    // Recent activity feeds
    const [reports, questions, signals, facts] = await Promise.all([
      supabase.from("ward_reports")
        .select("ward_name,issue_type,status,reported_at")
        .order("reported_at", { ascending: false })
        .limit(15)
        .then((r: { data: RecentReport[] | null }) => r.data ?? []),
      supabase.from("ask_kaun_logs")
        .select("ward_name,question,asked_at")
        .order("asked_at", { ascending: false })
        .limit(15)
        .then((r: { data: Array<{ ward_name: string; question: string; asked_at: string }> | null }) =>
          (r.data ?? []).map(q => ({ ward_name: q.ward_name, question: q.question, created_at: q.asked_at }))
        ),
      supabase.from("civic_signals")
        .select("ward_no,issue_type,title,source,signal_at")
        .order("signal_at", { ascending: false })
        .limit(10)
        .then((r: { data: RecentSignal[] | null }) => r.data ?? []),
      supabase.from("community_facts")
        .select("ward_no,category,subject,field,value,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(10)
        .then((r: { data: RecentFact[] | null }) => r.data ?? []),
    ])
    result.recent_reports = reports
    result.recent_questions = questions
    result.recent_signals = signals
    result.recent_community_facts = facts

    // Cron health
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

  } catch {
    result.status = "down"
    result.supabase = "error"
  }

  return Response.json(result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
