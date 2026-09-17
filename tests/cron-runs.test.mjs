/**
 * Scheduled-job heartbeats: health calls a job stale when it stopped running
 * successfully, not when the news was quiet.
 *
 * Run: node --test --experimental-strip-types tests/cron-runs.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  CRON_JOBS,
  CRON_STALE_AFTER_MS,
  cronStatus,
  recordCronRun,
  runSucceeded,
} from "../apps/web/lib/cron-runs.ts"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const HOUR = 60 * 60 * 1000

test("a quiet day, where sources answer with nothing new, is a successful run", () => {
  assert.equal(runSucceeded([{ tried: 11, failed: 0 }, { tried: 0, failed: 0 }, { tried: 0, failed: 0 }]), true)
  assert.equal(runSucceeded([]), true)
})

test("a run fails only when a stage that had work failed every time", () => {
  assert.equal(runSucceeded([{ tried: 11, failed: 3 }, { tried: 40, failed: 0 }]), true, "some feeds down")
  assert.equal(runSucceeded([{ tried: 11, failed: 11 }]), false, "every source unreachable")
  assert.equal(runSucceeded([{ tried: 11, failed: 0 }, { tried: 25, failed: 25 }]), false, "classifier refused everything")
  assert.equal(runSucceeded([{ tried: 9, failed: 0 }, { tried: 4, failed: 4 }]), false, "every write rejected")
})

test("health status comes from the last successful run", () => {
  const now = Date.parse("2026-09-17T02:07:00Z")
  assert.equal(cronStatus("2026-09-17T02:00:40Z", true, now), "ok")
  assert.equal(cronStatus(new Date(now - 47 * HOUR).toISOString(), true, now), "ok", "one missed daily run is tolerated")
  assert.equal(cronStatus(new Date(now - CRON_STALE_AFTER_MS - 1).toISOString(), true, now), "stale")
  assert.equal(cronStatus(null, true, now), "stale", "no success recorded")
  assert.equal(cronStatus("not a date", true, now), "stale")
  assert.equal(cronStatus(null, false, now), "unknown", "heartbeat table unreadable")
})

function stubWriter(response) {
  const calls = []
  return {
    calls,
    from(table) {
      return {
        upsert(row, options) {
          calls.push({ table, row, options })
          if (response instanceof Error) return Promise.reject(response)
          return Promise.resolve(response)
        },
      }
    },
  }
}

test("a successful run moves last_success_at; a failed one only last_attempt_at", async () => {
  const at = new Date("2026-09-17T02:00:40Z")
  const ok = stubWriter({ error: null })
  await recordCronRun(ok, CRON_JOBS.ingestSignals, true, { news: 0 }, at)
  assert.deepEqual(ok.calls, [{
    table: "cron_runs",
    row: { job: "ingest-signals", last_attempt_at: at.toISOString(), last_result: { news: 0 }, last_success_at: at.toISOString() },
    options: { onConflict: "job" },
  }])

  const failed = stubWriter({ error: null })
  await recordCronRun(failed, CRON_JOBS.refreshPulse, false, { feed_errors: ["x"] }, at)
  assert.equal(failed.calls[0].row.job, "refresh-pulse")
  assert.equal("last_success_at" in failed.calls[0].row, false)
})

test("recording a run never fails the job, even before the table exists", async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    await recordCronRun(stubWriter({ error: { message: "Could not find the table 'public.cron_runs'" } }), CRON_JOBS.refreshPulse, true, {})
    await recordCronRun(stubWriter(new Error("network down")), CRON_JOBS.refreshPulse, true, {})
  } finally {
    console.error = originalError
  }
})

test("both jobs record their runs and health reads the heartbeat, not the newest row", () => {
  const ingest = read("apps/web/app/api/ingest-signals/route.ts")
  const pulse = read("apps/web/app/api/refresh-pulse/route.ts")
  const health = read("apps/web/app/api/health/route.ts")

  assert.match(ingest, /recordCronRun\(supabase, CRON_JOBS\.ingestSignals, succeeded,/)
  assert.match(ingest, /runSucceeded\(\[sources, classifications, writes\]\)/)
  // an unreachable feed or a failed classification must be countable, not look like "no items"
  assert.match(ingest, /async function fetchRSS\([^)]*\): Promise<NewsItem\[\] \| null>/)
  assert.doesNotMatch(ingest, /return \{ is_civic: false, issue_type: "other", ward_hint: null \}/)

  assert.match(pulse, /recordCronRun\(supabase, CRON_JOBS\.refreshPulse, succeeded,/)
  assert.match(pulse, /\{ tried: RSS_FEEDS\.length, failed: errors\.length \}/)

  assert.match(health, /\.from\("cron_runs"\)/)
  assert.match(health, /status: cronStatus\(run\?\.last_success_at, !runsError, now\)/)
  assert.doesNotMatch(health, /48 \* 60 \* 60 \* 1000/, "no data-age threshold left in the route")
  assert.match(health, /checkTable\(supabase, "civic_signals", "ingested_at"\)/)
})

test("the heartbeat table is service-role only", () => {
  const sql = read("supabase/migrations/20260918_cron_runs.sql")
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.cron_runs/)
  assert.match(sql, /last_success_at\s+timestamptz,/, "nullable: a failed first run still records its attempt")
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.cron_runs FROM anon, authenticated/)
  assert.doesNotMatch(sql, /CREATE POLICY/)
})
