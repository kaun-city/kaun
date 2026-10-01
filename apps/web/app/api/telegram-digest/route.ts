import { createClient } from "@supabase/supabase-js"
import { sendTelegramMessage } from "@/lib/telegram"
import { CRON_JOBS, recordCronRun } from "@/lib/cron-runs"

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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [pages, pins, reports, questions] = await Promise.all([
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event", "page_view").gte("created_at", since),
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event", "pin_drop").gte("created_at", since),
    supabase.from("ward_reports").select("*", { count: "exact", head: true }).gte("reported_at", since),
    supabase.from("ask_kaun_logs").select("*", { count: "exact", head: true }).gte("asked_at", since),
  ])
  const queryFailed = [pages.error, pins.error, reports.error, questions.error].some(Boolean)
  const count = (query: { error: unknown; count: number | null }) => query.error ? "unavailable" : query.count ?? 0
  const message = [
    `📊 Kaun daily update (${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })})`,
    `Traffic: ${count(pages)} page views`,
    `Map activity: ${count(pins)} pin drops`,
    `Civic reports: ${count(reports)} new`,
    `Ask Kaun: ${count(questions)} questions`,
    `System health: ${health}${queryFailed ? " (some activity counts unavailable)" : ""}`,
    stale.length ? `Stale jobs: ${stale.join(", ")}` : "",
    "https://kaun.city/status",
  ].filter(Boolean).join("\n")

  const sent = await sendTelegramMessage(message)
  await recordCronRun(supabase, CRON_JOBS.telegramDigest, sent && !queryFailed, { sent, health, queryFailed })
  if (!sent) return Response.json({ error: "Telegram delivery failed" }, { status: 502 })
  if (queryFailed) return Response.json({ error: "Digest sent with unavailable counts" }, { status: 503 })
  return Response.json({ ok: true, health, since })
}
