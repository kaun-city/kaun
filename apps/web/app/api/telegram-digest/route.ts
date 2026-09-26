import { createClient } from "@supabase/supabase-js"
import { sendTelegramMessage } from "@/lib/telegram"

export const runtime = "nodejs"
export const maxDuration = 15

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

  const supabase = createClient(supabaseUrl, serviceKey)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [pins, reports, questions, healthResponse] = await Promise.all([
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event", "pin_drop").gte("created_at", since),
    supabase.from("ward_reports").select("*", { count: "exact", head: true }).gte("reported_at", since),
    supabase.from("ask_kaun_logs").select("*", { count: "exact", head: true }).gte("asked_at", since),
    fetch(new URL("/api/health", req.url), { cache: "no-store", signal: AbortSignal.timeout(8000) }),
  ])

  let health = "unknown"
  if (healthResponse.ok) {
    const healthData = await healthResponse.json()
    health = healthData.status ?? "unknown"
  }

  const queryFailed = [pins.error, reports.error, questions.error].some(Boolean)
  const message = [
    `📊 Kaun daily update (${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })})`,
    `Traffic: ${pins.count ?? "—"} pin drops`,
    `Civic reports: ${reports.count ?? "—"} new`,
    `Ask Kaun: ${questions.count ?? "—"} questions`,
    `System health: ${health}${queryFailed ? " (some activity counts unavailable)" : ""}`,
    "https://kaun.city/status",
  ].join("\n")

  const sent = await sendTelegramMessage(message)
  if (!sent) return Response.json({ error: "Telegram delivery failed" }, { status: 502 })
  return Response.json({ ok: true, health, since })
}
