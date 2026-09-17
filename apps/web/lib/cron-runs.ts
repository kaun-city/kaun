/**
 * Scheduled-job heartbeats (public.cron_runs, migration 20260918).
 *
 * The jobs upsert with ignoreDuplicates, so a day with no new items writes no
 * rows. Judging a job by its newest row therefore called quiet news days
 * "stale". Each job now records its own run, and health reads that instead.
 */

export const CRON_JOBS = {
  ingestSignals: "ingest-signals",
  refreshPulse: "refresh-pulse",
} as const

export type CronJob = (typeof CRON_JOBS)[keyof typeof CRON_JOBS]

/** A daily job may miss one run before health calls it stale. */
export const CRON_STALE_AFTER_MS = 48 * 60 * 60 * 1000

export type CronStatus = "ok" | "stale" | "unknown"

/** How often one stage of a run (fetching sources, classifying, writing) was tried and failed. */
export interface StageTally {
  tried: number
  failed: number
}

/**
 * A run succeeded unless a stage that had work to do failed every time: every
 * source unreachable, every classification refused, or every write rejected.
 * A quiet day, where the sources answer with nothing new, is a success.
 */
export function runSucceeded(stages: StageTally[]): boolean {
  return stages.every(stage => stage.tried === 0 || stage.failed < stage.tried)
}

/**
 * "unknown" when the heartbeat table could not be read (not yet migrated, or
 * no service-role key); "stale" when it was read and holds no recent success.
 */
export function cronStatus(lastSuccessAt: string | null | undefined, readable: boolean, now: number): CronStatus {
  if (!readable) return "unknown"
  const at = lastSuccessAt ? Date.parse(lastSuccessAt) : Number.NaN
  if (Number.isNaN(at)) return "stale"
  return now - at < CRON_STALE_AFTER_MS ? "ok" : "stale"
}

/** The one supabase-js call recordCronRun makes, so tests can pass a stub. */
export interface CronRunWriter {
  from(table: "cron_runs"): {
    upsert(
      row: Record<string, unknown>,
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>
  }
}

/**
 * Records a finished run. A failed run moves last_attempt_at but leaves
 * last_success_at as it was. Never throws: a missing table must not fail the job.
 */
export async function recordCronRun(
  supabase: CronRunWriter,
  job: CronJob,
  succeeded: boolean,
  result: Record<string, unknown>,
  now: Date = new Date(),
): Promise<void> {
  const at = now.toISOString()
  const row: Record<string, unknown> = { job, last_attempt_at: at, last_result: result }
  if (succeeded) row.last_success_at = at
  try {
    const { error } = await supabase.from("cron_runs").upsert(row, { onConflict: "job" })
    if (error) console.error(`cron_runs: could not record ${job}: ${error.message}`)
  } catch (e) {
    console.error(`cron_runs: could not record ${job}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
