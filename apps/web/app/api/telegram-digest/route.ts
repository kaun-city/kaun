import { createClient } from "@supabase/supabase-js"
import { sendTelegramMessage } from "@/lib/telegram"
import { CRON_JOBS, recordCronRun } from "@/lib/cron-runs"
import { buildActivityDigest, parseTrafficSnapshot } from "@/lib/activity-digest"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 })
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    return Response.json({ error: "Telegram is not configured" }, { status: 503 })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
  })
  const healthResponse = await fetch(new URL("/api/health", req.url), {
    cache: "no-store", signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const healthData = healthResponse?.ok ? await healthResponse.json() : null
  const health = healthData?.status ?? "unknown"
  const stale = (healthData?.crons ?? []).filter((job: { job: string; status: string }) =>
    job.status === "stale" && job.job !== CRON_JOBS.telegramDigest).map((job: { job: string }) => job.job)

  // The maintenance runner calls this to notify only when health changes.
  if (new URL(req.url).searchParams.get("mode") === "health") {
    const { data: previous, error } = await supabase.from("cron_runs")
      .select("last_result").eq("job", CRON_JOBS.telegramHealth).maybeSingle()
    if (error) return Response.json({ error: "Cannot read previous alert state" }, { status: 503 })
    const ifmsParam = new URL(req.url).searchParams.get("ifms")
    const ifms = ifmsParam === "ok" || ifmsParam === "failed" ? ifmsParam : "unknown"
    const state = JSON.stringify({ health, stale, ifms })
    const lastState = previous?.last_result?.state
    if (state === lastState) return Response.json({ ok: true, unchanged: true })
    const healthy = health === "healthy" && ifms !== "failed"
    const sent = !lastState && healthy ? true : await sendTelegramMessage([
      healthy ? "✅ Kaun recovered" : `⚠️ Kaun health: ${health}`,
      stale.length ? `Stale jobs: ${stale.join(", ")}` : "",
      ifms === "failed" ? "IFMS work-order refresh failed; saved data is retained." : "",
      "https://kaun.city/status",
    ].filter(Boolean).join("\n"))
    // Persist only after delivery so a transient Telegram failure is retried.
    if (sent) await recordCronRun(supabase, CRON_JOBS.telegramHealth, true, { state })
    return Response.json({ ok: sent }, { status: sent ? 200 : 502 })
  }
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const since = new Date(now - day).toISOString()
  function eventCount(event: string, days: number, untilDays?: number) {
    let query = supabase.from("analytics_events").select("*", { count: "exact", head: true })
      .eq("event", event).gte("created_at", new Date(now - days * day).toISOString())
    if (untilDays) query = query.lt("created_at", new Date(now - untilDays * day).toISOString())
    return query
  }
  function tableCount(table: string, column: string, days: number) {
    return supabase.from(table).select("*", { count: "exact", head: true }).gte(column, new Date(now - days * day).toISOString())
  }
  const [pages, pagesBefore, pagesWeek, pagesPreviousWeek, pins, pinsWeek, pinsPreviousWeek, reports, reportsWeek, questions, questionsWeek, saved] = await Promise.all([
    eventCount("page_view", 1), eventCount("page_view", 2, 1), eventCount("page_view", 7), eventCount("page_view", 14, 7),
    eventCount("pin_drop", 1), eventCount("pin_drop", 7), eventCount("pin_drop", 14, 7),
    tableCount("ward_reports", "reported_at", 1), tableCount("ward_reports", "reported_at", 7),
    tableCount("ask_kaun_logs", "asked_at", 1), tableCount("ask_kaun_logs", "asked_at", 7),
    supabase.from("cron_runs").select("job,last_success_at,last_result").in("job", [CRON_JOBS.trafficSnapshot, CRON_JOBS.telegramHealth]),
  ])
  const queryFailed = [pages, pagesBefore, pagesWeek, pagesPreviousWeek, pins, pinsWeek, pinsPreviousWeek, reports, reportsWeek, questions, questionsWeek, saved].some(q => q.error)
  const count = (query: { error: unknown; count: number | null }) => query.error ? null : query.count
  const trafficRun = saved.data?.find(run => run.job === CRON_JOBS.trafficSnapshot)
  const metrics = parseTrafficSnapshot(trafficRun?.last_result)
  const previousHealth = saved.data?.find(run => run.job === CRON_JOBS.telegramHealth)
  const issues = stale.map((job: string) => `Stale pipeline: ${job}`)
  if (!healthData) issues.push("Live health check unavailable.")
  try {
    if (JSON.parse(previousHealth?.last_result?.state ?? "{}").ifms === "failed") issues.push("BBMP IFMS refresh failed; saved work-order data retained.")
  } catch { /* An unreadable previous check is not evidence of a source failure. */ }
  if (saved.error) issues.push("Cannot read the latest maintenance or traffic snapshot.")
  for (const table of healthData?.tables ?? []) {
    if (table.status === "error") issues.push(`Database check failed: ${table.table}`)
    else if (["wards", "elected_reps"].includes(table.table) && table.status !== "ok") issues.push(`Core data unavailable: ${table.table}`)
  }
  const message = buildActivityDigest({
    now, health, queryFailed, issues,
    topWards: healthData?.analytics?.top_wards_7d ?? [],
    snapshot: metrics && trafficRun?.last_success_at ? { at: trafficRun.last_success_at, metrics } : null,
    counts: {
      pages24h: count(pages), pagesPrevious24h: count(pagesBefore), pages7d: count(pagesWeek), pagesPrevious7d: count(pagesPreviousWeek),
      pins24h: count(pins), pins7d: count(pinsWeek), pinsPrevious7d: count(pinsPreviousWeek),
      reports24h: count(reports), reports7d: count(reportsWeek), questions24h: count(questions), questions7d: count(questionsWeek),
    },
  })

  const sent = await sendTelegramMessage(message)
  await recordCronRun(supabase, CRON_JOBS.telegramDigest, sent && !queryFailed, { sent, health, queryFailed })
  if (!sent) return Response.json({ error: "Telegram delivery failed" }, { status: 502 })
  if (queryFailed) return Response.json({ error: "Digest sent with unavailable counts" }, { status: 503 })
  return Response.json({ ok: true, health, since })
}

/** The daily desktop maintenance check supplies only visible aggregate metrics. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const metrics = parseTrafficSnapshot(await req.json().catch(() => null))
  if (!metrics) return Response.json({ error: "Invalid traffic snapshot" }, { status: 400 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return Response.json({ error: "Supabase is not configured" }, { status: 503 })
  const supabase = createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
  })
  const at = new Date().toISOString()
  const { error } = await supabase.from("cron_runs").upsert({
    job: CRON_JOBS.trafficSnapshot, last_attempt_at: at, last_success_at: at, last_result: metrics,
  }, { onConflict: "job" })
  if (error) return Response.json({ error: "Could not save traffic snapshot" }, { status: 503 })
  return Response.json({ ok: true, recorded_at: at })
}
