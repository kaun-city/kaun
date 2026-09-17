#!/usr/bin/env node
/**
 * mospi-missing-months.mjs — the report months the monthly MoSPI job should load.
 *
 * Prints one YYYY-MM per line: every month after the newest report_month in
 * in_central_project_snapshots, up to and including the current month, oldest
 * first. The workflow loads them in that order with load-central-projects.mjs
 * and stops at the first month with no published report (exit 78,
 * NO_REPORT_EXIT). So a missed run catches up on its own, and snapshots append
 * in publication order.
 *
 * Why not just "--latest": PAIMANA's home page listed nothing newer than March
 * 2026 while its archive already had June and July, so "latest on the home
 * page" had stopped moving.
 *
 * Reads with the service key (read only). Env: SUPABASE_URL, SUPABASE_SERVICE_KEY.
 */
import { fileURLToPath } from "node:url"

/** Months after `latest` (YYYY-MM-DD or YYYY-MM) through `now`'s month, as YYYY-MM. */
export function monthsToLoad(latest, now = new Date()) {
  const [y, m] = String(latest).split("-").map(Number)
  if (!Number.isInteger(y) || !Number.isInteger(m)) throw new Error(`not a report month: ${latest}`)
  const end = now.getUTCFullYear() * 12 + now.getUTCMonth()
  const months = []
  for (let index = y * 12 + (m - 1) + 1; index <= end; index++) {
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`)
  }
  return months
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
  const res = await fetch(`${url}/rest/v1/in_central_project_snapshots?select=report_month&order=report_month.desc&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`reading the latest report month failed: ${res.status} ${await res.text()}`)
  const [row] = await res.json()
  if (!row?.report_month) throw new Error("no report months loaded yet; run the historical backfill first")
  for (const month of monthsToLoad(row.report_month)) console.log(month)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exit(1) })
}
