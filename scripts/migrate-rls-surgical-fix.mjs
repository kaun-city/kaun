/**
 * migrate-rls-surgical-fix.mjs  —  surgical RLS adjustments grounded in the
 * 2026-05-17 inspect-mode catalog dump (NOT inferred from anon-readability).
 *
 * WHY: PR #46's broad migration was largely a no-op + missed the actual fix.
 * The inspect dump (workflow run 26156543692) showed:
 *   - ward_reports: anon SELECT via "public read" — but client paths
 *     (lib/api.ts:530, app/page.tsx, /api/report-og) ALL filter
 *     status='approved'. The intent is "anon reads APPROVED only", not blanket.
 *   - ward_stories: anon SELECT via "public read" — but NO client/anon reads
 *     exist (only the server-side /api/ward-story route, service role).
 *   - ward_crosswalk + ward_infra_stats: no explicit named SELECT policy.
 *
 * THIS FIX (idempotent, REVERSIBLE, surgical — 5 statements):
 *   1. DROP "public read" on ward_reports;
 *   2. CREATE ward_reports_anon_read_approved (USING status='approved');
 *      → preserves the home-page approved-report reveal, OG image,
 *        fetchWardReportCount; blocks anon from reading pending/raw reports.
 *   3. DROP "public read" on ward_stories;
 *      → blocks anon SELECT entirely; server-side route (service role) intact.
 *   4. CREATE ward_crosswalk_anon_read (USING true).
 *   5. CREATE ward_infra_stats_anon_read (USING true).
 *
 * Revert (per statement, manual; restoring exact prior state):
 *   CREATE POLICY "public read" ON ward_reports
 *     FOR SELECT TO public USING (true);
 *   DROP   POLICY ward_reports_anon_read_approved ON ward_reports;
 *   CREATE POLICY "public read" ON ward_stories
 *     FOR SELECT TO public USING (true);
 *   DROP   POLICY ward_crosswalk_anon_read    ON ward_crosswalk;
 *   DROP   POLICY ward_infra_stats_anon_read  ON ward_infra_stats;
 *
 * DDL needs SUPABASE_MANAGEMENT_TOKEN (CI). Dry-run otherwise.
 *
 *   node scripts/migrate-rls-surgical-fix.mjs            # dry-run preview
 *   node scripts/migrate-rls-surgical-fix.mjs --apply    # writes (mgmt token)
 */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes("--apply")

let env = {}
try {
  env = Object.fromEntries(
    readFileSync(resolve(__dirname, "../apps/web/.env.local"), "utf8")
      .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
      .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
} catch { /* CI: no .env.local */ }
const SB   = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const MGMT = process.env.SUPABASE_MANAGEMENT_TOKEN
const PROJECT = SB?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "xgygxfyfsvccqqmtboeu"

const SQL = `
-- Surgical RLS fix grounded in 2026-05-17 catalog inspect.
-- All statements idempotent; all writes inside ONE transaction.
BEGIN;

-- (1) ward_reports: replace the unconditional anon SELECT with a row-restricted one.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='ward_reports'
                AND policyname='public read') THEN
    EXECUTE 'DROP POLICY "public read" ON public.ward_reports';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='ward_reports'
                    AND policyname='ward_reports_anon_read_approved') THEN
    EXECUTE $sql$
      CREATE POLICY ward_reports_anon_read_approved
        ON public.ward_reports
        FOR SELECT TO anon, authenticated
        USING (status = 'approved')
    $sql$;
  END IF;
END $$;

-- (2) ward_stories: drop the unconditional anon SELECT (no client read path).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='ward_stories'
                AND policyname='public read') THEN
    EXECUTE 'DROP POLICY "public read" ON public.ward_stories';
  END IF;
END $$;

-- (3) ward_crosswalk: add an explicit named SELECT policy (documents intent).
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid='public.ward_crosswalk'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ward_crosswalk ENABLE ROW LEVEL SECURITY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='ward_crosswalk'
                    AND policyname='ward_crosswalk_anon_read') THEN
    EXECUTE 'CREATE POLICY ward_crosswalk_anon_read
               ON public.ward_crosswalk
               FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;

-- (4) ward_infra_stats: same — explicit named SELECT policy.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid='public.ward_infra_stats'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ward_infra_stats ENABLE ROW LEVEL SECURITY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='ward_infra_stats'
                    AND policyname='ward_infra_stats_anon_read') THEN
    EXECUTE 'CREATE POLICY ward_infra_stats_anon_read
               ON public.ward_infra_stats
               FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
`.trim()

async function dbq(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`,
    { method: "POST",
      headers: { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }) })
  const t = await r.text()
  if (!r.ok) throw new Error(`DB ${r.status}: ${t.slice(0, 500)}`)
  try { return JSON.parse(t) } catch { return t }
}

async function dryRun() {
  console.log("=== DRY RUN (read-only) ===")
  console.log("4 surgical changes (5 statements total, all idempotent):")
  console.log("  1. ward_reports        : DROP \"public read\" + ADD ward_reports_anon_read_approved (USING status='approved')")
  console.log("  2. ward_stories        : DROP \"public read\" (no client reads to preserve)")
  console.log("  3. ward_crosswalk      : ADD ward_crosswalk_anon_read (USING true)")
  console.log("  4. ward_infra_stats    : ADD ward_infra_stats_anon_read (USING true)")
  console.log("\n--- SQL (full, ~" + SQL.length + " chars) ---\n" + SQL)
  console.log("\nRun with --apply (CI; needs SUPABASE_MANAGEMENT_TOKEN) to write.")
}

async function apply() {
  if (!MGMT) { console.error("SUPABASE_MANAGEMENT_TOKEN not set — run in CI."); process.exit(1) }
  console.log("=== APPLY ===")
  await dbq(SQL)
  console.log("SQL applied OK.")
  const v = await dbq(`
    SELECT tablename, policyname, cmd, roles,
           pg_get_expr(qual, polrelid) AS using_expr
      FROM pg_policies
      JOIN pg_policy p ON p.polname = policyname
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE schemaname='public'
       AND tablename IN ('ward_reports','ward_stories','ward_crosswalk','ward_infra_stats')
     ORDER BY tablename, policyname;`)
  console.log("post-apply policies on affected tables:\n" + JSON.stringify(v, null, 2))
}

;(APPLY ? apply() : dryRun()).catch(e => { console.error("FAILED:", e); process.exit(1) })
