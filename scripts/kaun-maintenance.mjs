// Runs with the existing GitHub CRON_SECRET; never prints credentials or user content.
const base = process.env.SITE_URL || "https://kaun.city"
const secret = process.env.CRON_SECRET
if (!secret) throw new Error("CRON_SECRET is missing")
const HOUR = 3600000
async function call(path, timeout = 15000) {
  const response = await fetch(new URL(path, base), {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(timeout),
  })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.json()
}
let health = await call("/api/health")
let failed = false
for (const name of ["ingest-signals", "refresh-pulse"]) {
  const job = health.crons?.find(job => job.job === name)
  const lastAttempt = Date.parse(job?.last_attempt_at || "")
  if (job?.status === "stale" && (!Number.isFinite(lastAttempt) || Date.now() - lastAttempt > 20 * HOUR)) {
    try {
      const run = await call(`/api/${name}`, 70000)
      if (run.succeeded === false) throw new Error(`${name}: unsuccessful processing stage`)
      console.log(`${name}: recovery completed`)
    } catch {
      console.error(`${name}: recovery failed; inspect runtime logs`)
      failed = true
    }
  }
}
health = await call("/api/health")
if (health.telegram?.configured) {
  try {
    const digest = health.crons?.find(job => job.job === "telegram-digest")
    if (digest?.status === "stale") {
      const delivered = await call("/api/telegram-digest", 35000)
      if (!delivered.ok) throw new Error("Digest failed")
      console.log("Telegram digest: recovery completed")
    }
    health = await call("/api/health")
    let ifms = "unknown"
    try {
      const runsResponse = await fetch("https://api.github.com/repos/kaun-city/kaun/actions/workflows/264226545/runs?per_page=1&branch=master&status=completed", {
        headers: { accept: "application/vnd.github+json", ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
        signal: AbortSignal.timeout(10000),
      })
      if (runsResponse.ok) {
        const runs = await runsResponse.json()
        const conclusion = runs.workflow_runs?.[0]?.conclusion
        ifms = conclusion === "success" ? "ok" : conclusion === "failure" ? "failed" : "unknown"
      }
    } catch { /* unknown is shown as unknown, never as a source failure */ }
    const alert = await call(`/api/telegram-digest?mode=health&ifms=${ifms}`, 35000)
    if (!alert.ok) throw new Error("Health alert failed")
  } catch {
    console.error("Telegram maintenance alert or digest failed")
    failed = true
  }
} else {
  console.log("::warning::Telegram setup needs the one-time bot token entry")
}
console.log(`System health: ${health.status}`)
if (failed || health.status === "down") process.exitCode = 1
