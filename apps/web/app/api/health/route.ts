import { createClient } from "@supabase/supabase-js"
import { allCities } from "@/lib/cities"
import { deriveOverallHealth } from "@/lib/health-status"
import { CRON_JOBS, cronStatus, type CronJob, type CronStatus } from "@/lib/cron-runs"
import { checkTable, HEALTH_TABLES, type TableCheck } from "@/lib/health-tables"

export const runtime = "nodejs"
export const maxDuration = 15

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

interface CronHealth {
  name: string
  job: CronJob
  /** Last run the job counted as successful (public.cron_runs); what status is judged on. */
  last_run_at: string | null
  /** Last run of any outcome. */
  last_attempt_at: string | null
  /** Newest row the job wrote. For information only: quiet days write nothing. */
  last_data_at: string | null
  status: CronStatus
}

interface CityCoverage {
  city_id: string
  name: string
  state: string
  expected_wards: number
  /** Per-table row count for this city (null = table absent or query failed). */
  wards: number | null
  ward_amenities: number | null
  upyog_grievances: number | null
  upyog_property_tax: number | null
  city_budget_heads: number | null
  elected_reps: number | null
  /** Computed readiness (0-1) for the dashboard bar. */
  readiness: number
}

interface HealthResult {
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
  crons: CronHealth[]
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

export async function GET() {
  const result: HealthResult = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    build: {
      sha: process.env.NEXT_PUBLIC_KAUN_BUILD_SHA ?? "local",
      ref: process.env.NEXT_PUBLIC_KAUN_BUILD_REF ?? "local",
      built_at: process.env.NEXT_PUBLIC_KAUN_BUILD_TIME ?? "unknown",
    },
    supabase: "error",
    tables: [],
    cities: [],
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
    const tableChecks = await Promise.all(HEALTH_TABLES.map(table => checkTable(supabase, table)))
    result.tables = tableChecks

    // Per-city coverage — what's flowing into each registered city's tables.
    // Uses head:true count queries against city-scoped tables. Tables that
    // don't exist (Supabase returns an error) collapse to null and are
    // treated as 0 in the readiness calculation.
    async function countByCity(table: string, cityId: string): Promise<number | null> {
      try {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("city_id", cityId)
        if (error) return null
        return count ?? 0
      } catch {
        return null
      }
    }
    const cityCoverage = await Promise.all(allCities().map(async (c): Promise<CityCoverage> => {
      const [wards, wardAmenities, grievances, propertyTax, budgetHeads, reps] = await Promise.all([
        countByCity("wards", c.id),
        countByCity("ward_amenities", c.id),
        countByCity("upyog_grievances", c.id),
        countByCity("upyog_property_tax", c.id),
        countByCity("city_budget_heads", c.id),
        countByCity("elected_reps", c.id),
      ])
      const expected = c.wardCount ?? 0
      const wardCoverage = expected > 0 ? Math.min(1, (wards ?? 0) / expected) : 0
      const tablesPresent = [wardAmenities, grievances, propertyTax, budgetHeads, reps]
        .filter(v => (v ?? 0) > 0).length
      const readiness = (wardCoverage * 0.5) + ((tablesPresent / 5) * 0.5)
      return {
        city_id: c.id,
        name: c.name,
        state: c.state,
        expected_wards: expected,
        wards,
        ward_amenities: wardAmenities,
        upyog_grievances: grievances,
        upyog_property_tax: propertyTax,
        city_budget_heads: budgetHeads,
        elected_reps: reps,
        readiness,
      }
    }))
    result.cities = cityCoverage

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

    // Cron health: judged on each job's own heartbeat, not on its newest row,
    // because a run that finds nothing new writes no rows.
    const { data: runs, error: runsError } = await supabase
      .from("cron_runs")
      .select("job,last_attempt_at,last_success_at")
    const runFor = (job: CronJob) =>
      (runs as Array<{ job: string; last_attempt_at: string; last_success_at: string | null }> | null)
        ?.find(run => run.job === job)
    const now = Date.now()
    const cron = (name: string, job: CronJob, lastDataAt: string | null | undefined): CronHealth => {
      const run = runFor(job)
      return {
        name,
        job,
        last_run_at: run?.last_success_at ?? null,
        last_attempt_at: run?.last_attempt_at ?? null,
        last_data_at: lastDataAt ?? null,
        status: cronStatus(run?.last_success_at, !runsError, now),
      }
    }
    result.crons = [
      cron("ingest-signals (daily 2am UTC)", CRON_JOBS.ingestSignals, find("civic_signals")?.latest_at),
      cron("refresh-pulse (daily 6am UTC)", CRON_JOBS.refreshPulse, find("city_pulse_facts")?.latest_at),
    ]

    // Overall status
    const errors = tableChecks.filter(t => t.status === "error")
    const coreEmpty = ["wards", "elected_reps"].some(t => find(t)?.status !== "ok")
    const stalePipelines = result.crons.some(cron => cron.status === "stale")
    result.status = deriveOverallHealth({
      supabaseConnected: result.supabase === "connected",
      hasTableErrors: errors.length > 0,
      coreDataHealthy: !coreEmpty,
      hasStalePipelines: stalePipelines,
    })

  } catch {
    result.status = "down"
    result.supabase = "error"
  }

  return Response.json(result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
