-- A heartbeat per scheduled job, so /api/health can tell a job that stopped
-- running from a quiet news day.
--
-- Why
-- ---
-- /api/health judged ingest-signals and refresh-pulse by their newest row.
-- Both upsert with ignoreDuplicates, so a run that finds nothing new writes
-- nothing, and inserts are naturally days apart (civic_signals.ingested_at on
-- 2026-08-25, 08-26, 09-02, 09-04, 09-11, 09-14, 09-15). On 2026-09-17 health
-- reported "degraded" although both jobs were running.
--
-- What
-- ----
-- One row per job, written by the job itself at the end of every run:
--   last_attempt_at  every run that reached the end of its handler
--   last_success_at  only runs apps/web/lib/cron-runs.ts counts as successful
--                    (no stage failed every time it was tried)
--   last_result      that run's counts, for diagnosis
-- Health marks a job stale when last_success_at is missing or older than 48h.
--
-- Only the service role reads or writes it; the jobs and /api/health both use
-- the service-role key.

CREATE TABLE IF NOT EXISTS public.cron_runs (
  job              text PRIMARY KEY,
  last_attempt_at  timestamptz NOT NULL,
  last_success_at  timestamptz,
  last_result      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(last_result) = 'object')
);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. With RLS on and no policy they would read nothing, but the
-- grant is removed too so the table is plainly service-role only.
REVOKE ALL ON public.cron_runs FROM anon, authenticated;
