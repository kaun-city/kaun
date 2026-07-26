/**
 * migrate-india-project-staleness.mjs — one view, for the "longest unchanged"
 * ranking on the central-projects tracker.
 *
 * ADDITIVE ONLY, IDEMPOTENT, REVERSIBLE. Creates exactly one object:
 *
 *   v_in_central_project_staleness   how long each central project has sat
 *                                    with nothing changing
 *
 * It touches no table, no column, no row, no policy and no other view. It
 * extends the schema created by scripts/migrate-india-schema.mjs and depends
 * only on in_central_project_snapshots, which that migration created.
 *
 * WHY A VIEW AND NOT CLIENT-SIDE ARITHMETIC
 * ----------------------------------------
 * The tracker page reads a top-N window (the 200 worst overruns). "Which
 * projects have gone longest with nothing changing" is a ranking over the WHOLE
 * table — the stalest project is very unlikely to also be one of the 200
 * largest overruns, so no amount of client-side work on that window can produce
 * it. It also needs every historical snapshot per project, not just the latest
 * row. Both facts put it in the database.
 *
 * WHAT COUNTS AS A CHANGE
 * -----------------------
 * A project "changed" in a report month when any of the four fields the tracker
 * actually reports on differs from the previous month's snapshot:
 *
 *   revised_cost_cr             a cost revision
 *   revised_doc_month           a schedule revision
 *   cumulative_expenditure_cr   money actually moving
 *   physical_progress_pct       work actually happening
 *
 * Deliberately EXCLUDED: sl_no (a row number in that month's PDF, which shifts
 * whenever a project is added above it), source_page, ingested_at,
 * parser_version and raw. Those move for reasons that have nothing to do with
 * the project, and letting them count would make every project look active.
 *
 * The month a project first appears counts as a change — it appeared. So a
 * project seen once has months_unchanged = 0, not "unchanged since the
 * beginning of time".
 *
 * READ IT WITH is_in_latest_report
 * -------------------------------
 * A project that was completed and dropped out of the report stops accruing
 * staleness, but its last computed value stays. Ranking "most stalled" without
 * filtering on is_in_latest_report would surface finished projects. The column
 * is there so the surface can filter; the view does not filter for it, because
 * "when did this project stop being reported" is a real question too.
 *
 * Revert (drops only what this migration created):
 *   DROP VIEW IF EXISTS public.v_in_central_project_staleness;
 *
 * DDL needs SUPABASE_MANAGEMENT_TOKEN (CI-only, by design). Without it the
 * script is read-only and prints exactly what it would run.
 *
 *   node scripts/migrate-india-project-staleness.mjs             # dry-run preview
 *   node scripts/migrate-india-project-staleness.mjs --inspect   # read-only check
 *   node scripts/migrate-india-project-staleness.mjs --apply     # writes (needs mgmt token)
 */
import { readFileSync } from "fs"
import { fileURLToPath, pathToFileURL } from "url"
import { dirname, resolve } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes("--apply")
const INSPECT = process.argv.includes("--inspect")

// env: local dev reads apps/web/.env.local; CI has no such file and uses
// process.env (GH secrets). Accept both names (mirrors the wardmap scripts).
let env = {}
try {
  env = Object.fromEntries(
    readFileSync(resolve(__dirname, "../apps/web/.env.local"), "utf8")
      .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
      .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
} catch { /* CI: no .env.local — fall through to process.env */ }
const SB   = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SVC  = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const MGMT = process.env.SUPABASE_MANAGEMENT_TOKEN
const PROJECT = SB?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "xgygxfyfsvccqqmtboeu"

const VIEW = "v_in_central_project_staleness"
const REQUIRES = "in_central_project_snapshots"

export const SQL = `
-- ===========================================================================
-- Kaun for India — "longest unchanged" ranking for the central-projects
-- tracker. Additive, idempotent, reversible: one view, nothing else.
-- ===========================================================================
BEGIN;

-- DROP + CREATE rather than CREATE OR REPLACE: replacing a view can only
-- APPEND columns, so any future reshuffle of this select list would make the
-- migration fail on re-run. The view is owned entirely by this migration and
-- nothing depends on it, so dropping it is safe and keeps re-runs green.
-- (Same reasoning as v_in_central_project_changes in migrate-india-schema.mjs.)
DROP VIEW IF EXISTS public.${VIEW};

CREATE VIEW public.${VIEW} AS
WITH monthly AS (
  SELECT
    s.project_code,
    s.report_month,
    -- A month is a CHANGE when any field the tracker reports on moved. sl_no,
    -- source_page, parser_version and raw are excluded on purpose: they shift
    -- for reasons that have nothing to do with the project itself.
    ( ROW(s.revised_cost_cr, s.revised_doc_month,
          s.cumulative_expenditure_cr, s.physical_progress_pct)
      IS DISTINCT FROM
      ROW(lag(s.revised_cost_cr)           OVER w,
          lag(s.revised_doc_month)         OVER w,
          lag(s.cumulative_expenditure_cr) OVER w,
          lag(s.physical_progress_pct)     OVER w) ) AS changed
  FROM public.in_central_project_snapshots s
  WINDOW w AS (PARTITION BY s.project_code ORDER BY s.report_month)
),
bounds AS (
  SELECT max(report_month) AS latest_report_month
    FROM public.in_central_project_snapshots
),
agg AS (
  SELECT
    m.project_code,
    min(m.report_month)                          AS first_report_month,
    max(m.report_month)                          AS last_report_month,
    count(*)::integer                            AS snapshot_count,
    -- NULL only when a project's very first snapshot carried no tracked value
    -- at all; COALESCE below falls back to the month it first appeared.
    max(m.report_month) FILTER (WHERE m.changed) AS changed_month
  FROM monthly m
  GROUP BY m.project_code
),
resolved AS (
  SELECT
    a.project_code,
    a.first_report_month,
    a.last_report_month,
    a.snapshot_count,
    COALESCE(a.changed_month, a.first_report_month) AS last_change_month
  FROM agg a
)
SELECT
  r.project_code,
  r.last_change_month,
  -- Whole months. Both operands are first-of-month dates (enforced by
  -- in_central_project_snapshots_month_is_first), so age() is exact.
  ( date_part('year',  age(r.last_report_month, r.last_change_month)) * 12
  + date_part('month', age(r.last_report_month, r.last_change_month)) )::integer
    AS months_unchanged,
  r.last_report_month,
  r.first_report_month,
  r.snapshot_count,
  -- Filter on this before ranking "most stalled": a completed project that
  -- dropped out of the report stops accruing staleness but keeps its value.
  (r.last_report_month = b.latest_report_month) AS is_in_latest_report,
  latest.physical_progress_pct AS latest_physical_progress_pct,
  latest.cost_overrun_cr       AS latest_cost_overrun_cr
FROM resolved r
CROSS JOIN bounds b
LEFT JOIN LATERAL (
  SELECT s.physical_progress_pct, s.cost_overrun_cr
    FROM public.in_central_project_snapshots s
   WHERE s.project_code = r.project_code
   ORDER BY s.report_month DESC
   LIMIT 1
) latest ON true;

-- Same posture as every other public object in the India schema: read-only to
-- anon + authenticated, writes are service-role ETL only. A view inherits the
-- RLS of its base table, and in_central_project_snapshots is blanket
-- public-read, so this exposes nothing new.
GRANT SELECT ON public.${VIEW} TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
`.trim()

async function dbq(q) {
  if (!MGMT) throw new Error("SUPABASE_MANAGEMENT_TOKEN not set")
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`,
    { method: "POST",
      headers: { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }) })
  const t = await r.text()
  if (!r.ok) throw new Error(`DB ${r.status}: ${t.slice(0, 800)}`)
  try { return JSON.parse(t) } catch { return t }
}

/** Read-only existence probe via PostgREST — works with just the service key. */
async function probeExisting() {
  if (!SB || !SVC) return null
  const H = { apikey: SVC, Authorization: `Bearer ${SVC}` }
  const out = {}
  for (const name of [REQUIRES, VIEW]) {
    try {
      const r = await fetch(`${SB}/rest/v1/${name}?select=*&limit=0`, { headers: H })
      out[name] = r.ok ? "EXISTS" : (r.status === 404 ? "absent" : `http ${r.status}`)
    } catch (e) { out[name] = `probe failed: ${e.message}` }
  }
  return out
}

async function dryRun() {
  console.log("=== DRY RUN (read-only; no writes) ===")
  console.log(`project: ${PROJECT}`)
  console.log(`\nWould create 1 view: ${VIEW}`)
  console.log(`  depends on: public.${REQUIRES} (created by migrate-india-schema.mjs)`)
  console.log("  GRANT SELECT TO anon, authenticated")
  console.log("\nTouches NO table, column, row, policy or other view.")
  console.log(`Revert: DROP VIEW IF EXISTS public.${VIEW};`)

  const existing = await probeExisting()
  if (existing) {
    console.log("\n--- current state (PostgREST probe, read-only) ---")
    for (const [k, v] of Object.entries(existing)) console.log(`  ${k.padEnd(32)} ${v}`)
    if (existing[REQUIRES] !== "EXISTS") {
      console.log(`\n  ${REQUIRES} is absent — run migrate-india-schema.mjs --apply first.`)
    }
  } else {
    console.log("\n(no Supabase URL/service key in env — skipped the read-only existence probe)")
  }

  console.log(`\n--- SQL (full, ${SQL.length} chars) ---\n${SQL}`)
  console.log("\nRun --apply with SUPABASE_MANAGEMENT_TOKEN (CI) to write.")
}

async function inspect() {
  console.log("=== INSPECT (read-only catalog dump) ===")
  if (!MGMT) {
    console.error("SUPABASE_MANAGEMENT_TOKEN not set — inspect needs it. Aborting (no writes).")
    process.exit(1)
  }
  const sections = [
    ["view", `SELECT table_name FROM information_schema.views
               WHERE table_schema='public' AND table_name='${VIEW}';`],
    ["columns", `SELECT ordinal_position, column_name, data_type
                   FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='${VIEW}'
                  ORDER BY ordinal_position;`],
    ["grants", `SELECT grantee, privilege_type FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='${VIEW}'
                   AND grantee IN ('anon','authenticated') ORDER BY grantee;`],
    ["sample", `SELECT project_code, last_change_month, months_unchanged,
                       snapshot_count, is_in_latest_report
                  FROM public.${VIEW}
                 WHERE is_in_latest_report
                 ORDER BY months_unchanged DESC, project_code
                 LIMIT 10;`],
  ]
  for (const [label, q] of sections) {
    const rows = await dbq(q)
    console.log(`\n--- ${label} ---\n${JSON.stringify(rows, null, 2)}`)
  }
}

async function apply() {
  if (!MGMT) {
    console.error("SUPABASE_MANAGEMENT_TOKEN not set — run in CI. Aborting (no writes).")
    process.exit(1)
  }
  console.log("=== APPLY ===")
  console.log(`project: ${PROJECT} · 1 view · additive only`)
  await dbq(SQL)
  console.log("SQL applied OK.")

  const cols = await dbq(`
    SELECT ordinal_position, column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='${VIEW}' ORDER BY ordinal_position;`)
  console.log(`\n${VIEW} columns:\n${JSON.stringify(cols, null, 2)}`)

  const stalest = await dbq(`
    SELECT project_code, last_change_month, months_unchanged
      FROM public.${VIEW} WHERE is_in_latest_report
     ORDER BY months_unchanged DESC, project_code LIMIT 5;`)
  console.log(`\nlongest unchanged (current projects):\n${JSON.stringify(stalest, null, 2)}`)
}

// Guarded so the SQL can be imported by a test without the script running.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  ;(INSPECT ? inspect() : APPLY ? apply() : dryRun())
    .catch(e => { console.error("FAILED:", e); process.exit(1) })
}
