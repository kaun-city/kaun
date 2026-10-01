// Use `vercel env run -e production --project kaun --scope kaun -- node
// scripts/publish-traffic-snapshot.mjs <aggregate-metrics.json> [--send]`.
// The CLI supplies CRON_SECRET in memory. Never print environment variables.
import { readFile } from "node:fs/promises"
const file = process.argv[2]
const secret = process.env.CRON_SECRET
if (!file || !secret) throw new Error("A snapshot JSON file and CRON_SECRET are required")
const metrics = JSON.parse(await readFile(file, "utf8"))
const endpoint = "https://kaun.city/api/telegram-digest"
try {
  const saved = await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(metrics), signal: AbortSignal.timeout(15000),
  })
  if (!saved.ok) throw new Error(`Snapshot save failed (HTTP ${saved.status})`)
  console.log("Aggregate traffic snapshot saved")
  if (process.argv.includes("--send")) {
    const sent = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(35000) })
    if (!sent.ok) throw new Error(`Digest delivery failed (HTTP ${sent.status})`)
    console.log("Expanded Telegram digest delivered")
  }
} catch {
  console.error("Traffic snapshot or digest could not be delivered; inspect the authenticated endpoint status")
  process.exitCode = 1
}
