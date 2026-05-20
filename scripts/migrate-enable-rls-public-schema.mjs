/**
 * migrate-enable-rls-public-schema.mjs  —  fix Supabase Security Advisor
 * finding `rls_disabled_in_public` across every public-schema table.
 *
 * WHY: 46 public-schema objects in the kaun.city DB had no RLS. kaun.city is
 * a public civic-transparency site (the whole UI reads via the anon key), so
 * a permissive SELECT policy on reference data is *intentional* — but the
 * lack of explicit policies was an undocumented intent + a real defense-in-
 * depth gap on the 6 user/PII tables that anon should not freely read.
 *
 * APPROACH (idempotent, NON-DESTRUCTIVE to data, REVERSIBLE):
 *   1. ENABLE ROW LEVEL SECURITY on every public-schema table (skipping
 *      views + already-RLS tables).
 *   2. CREATE POLICY in the SAME transaction, per the table's bucket:
 *
 *      PUBLIC_READ (36 reference tables — wards, bbmp_work_orders, …):
 *        ENABLE RLS + `FOR SELECT TO anon, authenticated USING (true)`.
 *        Preserves current site behaviour exactly; documents the intent.
 *
 *      ANON_RW (2: fact_votes, community_facts — client writes via anon):
 *        ENABLE RLS + SELECT policy `USING (true)` + INSERT policy
 *        `WITH CHECK (true)`. UPDATE/DELETE remain blocked for anon (the
 *        service-role RPCs that increment counters bypass RLS).
 *
 *      SERVICE_ONLY (4: ask_kaun_logs, analytics_events, ward_reports,
 *      ward_stories — server-side writes via service role, no client read):
 *        ENABLE RLS, NO anon policies. Service role bypasses RLS, so the
 *        existing /api routes keep working; anon can no longer read/write.
 *
 *      SKIPPED (3 views: v_work_orders_243, geography_columns,
 *      geometry_columns) — RLS does not apply to views; security comes
 *      from base tables. spatial_ref_sys: PostGIS-owned, attempted with
 *      EXCEPTION-trapped DO block so an ownership failure does not abort
 *      the migration.
 *
 *   3. Verify post-apply: every public-schema table has relrowsecurity =
 *      true and at least one policy (or is in SERVICE_ONLY, which has zero
 *      policies by design).
 *
 * Idempotent: every step guards via pg_class.relrowsecurity + pg_policies,
 *   so re-running is a no-op.
 *
 * Revert (per table, manual; not destructive):
 *   ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;
 *   DROP POLICY <t>_anon_read ON <t>;  -- and other named policies on <t>
 *
 * DDL needs SUPABASE_MANAGEMENT_TOKEN (CI-only, by design). Without it the
 * script prints a READ-ONLY dry-run preview + the SQL it would run.
 *
 *   node scripts/migrate-enable-rls-public-schema.mjs            # dry-run
 *   node scripts/migrate-enable-rls-public-schema.mjs --inspect  # READ-ONLY catalog dump (mgmt token)
 *   node scripts/migrate-enable-rls-public-schema.mjs --apply    # write (mgmt token)
 */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY   = process.argv.includes("--apply")
const INSPECT = process.argv.includes("--inspect")

// ─── env (mirrors the other migration scripts) ─────────────────────────────
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
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` }

if (!SB || !SVC) { console.error("Missing Supabase URL / service key."); process.exit(1) }

// ─── classification (audited 2026-05-17) ───────────────────────────────────
// Bucket per table. Anything in PostgREST's public schema not listed here is
// treated as PUBLIC_READ (safe default for civic-transparency reference data)
// and surfaced explicitly in the dry-run for review.

const SERVICE_ONLY = new Set([
  // Writes flow through Next API routes that use SUPABASE_SERVICE_ROLE_KEY.
  // Service role bypasses RLS, so the existing routes continue to function.
  // Anon should have no SELECT, INSERT, UPDATE, or DELETE on these.
  "ask_kaun_logs",       // /api/ask-kaun (server) inserts Q&A logs
  "analytics_events",    // /api/track (server) inserts pin drops / telemetry
  "ward_reports",        // /api/submit-report + /api/admin/reports (server)
  "ward_stories",        // /api/ward-story (server) upserts AI-summarised stories
])

const ANON_RW = new Set([
  // Client-side writes via the anon key (lib/api.ts → lib/supabase.ts
  // `insert()` uses NEXT_PUBLIC_SUPABASE_ANON_KEY). Preserve INSERT + SELECT;
  // UPDATE/DELETE are not granted to anon today and remain blocked by RLS.
  "fact_votes",          // community-fact voting; voter_token is a session id
  "community_facts",     // user-submitted civic facts (curated)
])

const SKIP_VIEWS = new Set([
  "v_work_orders_243",   // view (RLS on views N/A; security from base table)
  "geography_columns",   // PostGIS view
  "geometry_columns",    // PostGIS view
])

const POSTGIS_OWNED = new Set([
  // PostGIS extension owns this; ENABLE RLS may fail with "must be owner".
  // We wrap in EXCEPTION so the rest of the migration doesn't abort.
  "spatial_ref_sys",
])

// Full list observed in PostgREST's OpenAPI as of 2026-05-17 (46 objects):
const ALL_OBJECTS = [
  "ac_to_ls", "analytics_events", "ask_kaun_logs", "bbmp_work_orders",
  "bmtc_stops", "boundary_lookup", "city_budget", "city_pulse_facts",
  "civic_signals", "community_facts", "contractor_profiles", "departments",
  "elected_reps", "fact_templates", "fact_votes", "gba_contacts",
  "gba_wards", "geography_columns", "geometry_columns", "mla_lad_funds",
  "officers", "police_stations", "property_tax", "rep_report_cards",
  "sakala_performance", "spatial_ref_sys", "tenders", "traffic_signals",
  "v_work_orders_243", "ward_air_quality", "ward_amenities",
  "ward_boundaries", "ward_bus_stops", "ward_committee_meetings",
  "ward_crosswalk", "ward_grievances", "ward_infra_stats", "ward_potholes",
  "ward_reports", "ward_road_crashes", "ward_spend_category", "ward_stats",
  "ward_stories", "ward_trade_licenses", "ward_water_quality", "wards",
]

function bucket(t) {
  if (SKIP_VIEWS.has(t))     return "SKIP_VIEW"
  if (POSTGIS_OWNED.has(t))  return "POSTGIS"
  if (SERVICE_ONLY.has(t))   return "SERVICE_ONLY"
  if (ANON_RW.has(t))        return "ANON_RW"
  return "PUBLIC_READ"
}

// ─── SQL builders (per-table, idempotent, atomic) ──────────────────────────
// Each table's section is a DO block that:
//   (a) checks pg_class.relrowsecurity — skips ALTER if already on,
//   (b) ENABLE RLS,
//   (c) creates only the policies not yet present (lookup pg_policies),
// all inside the same atomic statement. We wrap everything in ONE BEGIN/COMMIT
// transaction so the migration is all-or-nothing.

function sqlPublicRead(t) {
  return `
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.${t}'::regclass) THEN
    EXECUTE 'ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='${t}'
       AND policyname='${t}_anon_read'
  ) THEN
    EXECUTE 'CREATE POLICY ${t}_anon_read ON public.${t}
               FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;`
}

function sqlAnonRw(t) {
  return `
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.${t}'::regclass) THEN
    EXECUTE 'ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='${t}'
                    AND policyname='${t}_anon_read') THEN
    EXECUTE 'CREATE POLICY ${t}_anon_read ON public.${t}
               FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='${t}'
                    AND policyname='${t}_anon_insert') THEN
    EXECUTE 'CREATE POLICY ${t}_anon_insert ON public.${t}
               FOR INSERT TO anon, authenticated WITH CHECK (true)';
  END IF;
END $$;`
}

function sqlServiceOnly(t) {
  // Enable RLS, NO anon policies. Service role bypasses RLS by design.
  return `
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.${t}'::regclass) THEN
    EXECUTE 'ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;`
}

function sqlPostgis(t) {
  // Try to enable RLS; trap "must be owner" so the rest proceeds.
  return `
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.${t}'::regclass) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY';
      EXECUTE 'CREATE POLICY ${t}_anon_read ON public.${t}
                 FOR SELECT TO anon, authenticated USING (true)';
    EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
      RAISE NOTICE 'Skipping ${t}: %', SQLERRM;
    END;
  END IF;
END $$;`
}

function buildSql() {
  const sections = []
  for (const t of ALL_OBJECTS) {
    switch (bucket(t)) {
      case "PUBLIC_READ":   sections.push(`-- ${t}: PUBLIC_READ`           + sqlPublicRead(t)); break
      case "ANON_RW":       sections.push(`-- ${t}: ANON_RW (read+insert)` + sqlAnonRw(t));     break
      case "SERVICE_ONLY":  sections.push(`-- ${t}: SERVICE_ONLY`          + sqlServiceOnly(t)); break
      case "POSTGIS":       sections.push(`-- ${t}: POSTGIS (best-effort)` + sqlPostgis(t));    break
      case "SKIP_VIEW":     sections.push(`-- ${t}: SKIP_VIEW (RLS N/A)`);                       break
    }
  }
  return [
    "-- Migration: enable RLS + per-bucket policies across the public schema",
    "-- (auditable 46-object classification — see migrate-enable-rls-public-schema.mjs)",
    "BEGIN;",
    sections.join("\n"),
    "COMMIT;",
    "NOTIFY pgrst, 'reload schema';",
  ].join("\n\n")
}

// ─── catalog probes (read-only via mgmt token; falls back gracefully) ──────
async function dbq(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`,
    { method: "POST",
      headers: { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }) })
  const t = await r.text()
  if (!r.ok) throw new Error(`DB ${r.status}: ${t.slice(0, 500)}`)
  try { return JSON.parse(t) } catch { return t }
}

async function probeCurrentRls() {
  // Needs mgmt token. Returns null when unavailable (local dry-run).
  if (!MGMT) return null
  return await dbq(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           (SELECT count(*) FROM pg_policies p
              WHERE p.schemaname='public' AND p.tablename=c.relname)::int AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p')
     ORDER BY c.relname;`)
}

// ─── classification table for printing / PR description ────────────────────
function classificationTable() {
  const rows = ALL_OBJECTS.map(t => [t, bucket(t)])
  const w = Math.max(...rows.map(r => r[0].length))
  return rows.map(([t, b]) => `  ${t.padEnd(w)}  ${b}`).join("\n")
}

// ─── modes ─────────────────────────────────────────────────────────────────
async function dryRun() {
  console.log("=== DRY RUN (read-only; no writes) ===")
  console.log(`objects classified: ${ALL_OBJECTS.length}`)
  const counts = ALL_OBJECTS.reduce((a, t) => (a[bucket(t)] = (a[bucket(t)] || 0) + 1, a), {})
  console.log(`buckets:`, JSON.stringify(counts))
  console.log(`\n--- per-object classification ---\n${classificationTable()}`)

  const live = await probeCurrentRls()
  if (live) {
    const offTables = live.filter(r => !r.rls_enabled).map(r => r.table_name)
    const onTables  = live.filter(r =>  r.rls_enabled).map(r => r.table_name)
    console.log(`\n--- live catalog (via mgmt token) ---`)
    console.log(`tables with RLS OFF: ${offTables.length}  ${JSON.stringify(offTables.slice(0, 30))}`)
    console.log(`tables with RLS ON:  ${onTables.length}   ${JSON.stringify(onTables)}`)
    const unclassified = live
      .map(r => r.table_name)
      .filter(t => !ALL_OBJECTS.includes(t))
    if (unclassified.length) {
      console.log(`\n⚠ tables in catalog NOT in this script's classification list:`)
      unclassified.forEach(t => console.log(`   • ${t}`))
      console.log(`(Either add to ALL_OBJECTS with a bucket, or confirm they should be skipped.)`)
    }
  } else {
    console.log(`\n(no SUPABASE_MANAGEMENT_TOKEN — skipping live catalog probe; would run in CI)`)
  }

  const sql = buildSql()
  console.log(`\n--- SQL that --apply would run (first 1500 chars) ---\n${sql.slice(0, 1500)}\n…`)
  console.log(`\nFull SQL length: ${sql.length} chars · ${sql.split("\n").length} lines`)
  console.log(`\nRun with --apply (CI; needs SUPABASE_MANAGEMENT_TOKEN) to write.`)
}

async function apply() {
  if (!MGMT) { console.error("SUPABASE_MANAGEMENT_TOKEN not set — run in CI. Aborting."); process.exit(1) }
  console.log("=== APPLY ===")
  const sql = buildSql()
  console.log(`SQL length: ${sql.length} chars; executing…`)
  await dbq(sql)
  console.log("SQL applied OK.")

  // Verify
  const v = await dbq(`
    SELECT
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity)::int AS rls_on_tables,
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity)::int AS rls_off_tables,
      (SELECT count(*) FROM pg_policies WHERE schemaname='public')::int AS total_policies;`)
  console.log("post-apply state:", JSON.stringify(v))

  // Any public table still without RLS? (other than POSTGIS_OWNED which may
  // legitimately refuse — surfaced as warning, not failure.)
  const off = await dbq(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
     ORDER BY c.relname;`)
  console.log("tables still RLS-off (expected: empty or only PostGIS-owned):", JSON.stringify(off))
}

// ─── inspect: READ-ONLY catalog dump ───────────────────────────────────────
// Lists every public-schema table with its current RLS state, all existing
// policies (name + roles + cmd + USING + WITH CHECK), and which anon/auth
// table privileges are granted. No writes. Use this to plan a real fix
// without inferring from anon-readability heuristics.
async function inspect() {
  if (!MGMT) {
    console.error("--inspect needs SUPABASE_MANAGEMENT_TOKEN. Run via the CI workflow (mode=inspect).")
    process.exit(1)
  }
  console.log("=== INSPECT (read-only catalog dump) ===")

  const tables = await dbq(`
    SELECT c.relname AS t, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
     ORDER BY c.relname;`)

  const policies = await dbq(`
    SELECT schemaname, tablename, policyname, roles, cmd,
           pg_get_expr(qual, polrelid)       AS using_expr,
           pg_get_expr(with_check, polrelid) AS with_check_expr
      FROM pg_policies
      JOIN pg_policy p ON p.polname = policyname
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE schemaname = 'public'
     ORDER BY tablename, policyname;`).catch(async () => {
       // Fallback if the JOIN syntax above trips on a Supabase PG version —
       // pg_policies already has qual/with_check as text on modern PG.
       return dbq(`
         SELECT schemaname, tablename, policyname, roles, cmd,
                qual AS using_expr, with_check AS with_check_expr
           FROM pg_policies
          WHERE schemaname = 'public'
          ORDER BY tablename, policyname;`)
     })

  const privs = await dbq(`
    SELECT table_name, grantee, privilege_type
      FROM information_schema.table_privileges
     WHERE table_schema = 'public'
       AND grantee IN ('anon','authenticated','service_role')
     ORDER BY table_name, grantee, privilege_type;`)

  const polByTable = {}
  for (const p of policies) (polByTable[p.tablename] ||= []).push(p)
  const privByTable = {}
  for (const g of privs) (privByTable[g.table_name] ||= []).push(g)

  for (const row of tables) {
    const t = row.t, b = bucket(t)
    console.log(`\n── ${t}   [${b}]   RLS=${row.rls ? "ON" : "OFF"}`)
    const ps = polByTable[t] || []
    if (!ps.length) console.log("   policies: (none)")
    for (const p of ps) {
      const roles = Array.isArray(p.roles) ? p.roles.join(",") : p.roles
      console.log(`   policy "${p.policyname}"  cmd=${p.cmd}  roles=${roles}`)
      if (p.using_expr)      console.log(`      USING       (${p.using_expr})`)
      if (p.with_check_expr) console.log(`      WITH CHECK  (${p.with_check_expr})`)
    }
    const gs = privByTable[t] || []
    const byGrantee = gs.reduce((a, g) => ((a[g.grantee] ||= []).push(g.privilege_type), a), {})
    for (const [g, types] of Object.entries(byGrantee)) {
      console.log(`   grant ${g}: ${types.join(",")}`)
    }
  }

  // High-signal summary: which SERVICE_ONLY tables still have an anon SELECT
  // policy (the thing we may want to DROP), and which PUBLIC_READ tables are
  // missing one (the thing we may want to ADD).
  console.log("\n── SUMMARY ──")
  const anonSelectPolicy = t => (polByTable[t] || []).some(p =>
    (p.cmd === "SELECT" || p.cmd === "ALL") &&
    (Array.isArray(p.roles) ? p.roles : (p.roles || "").split(/[,{}\s]+/)).some(r => r === "anon" || r === "public" || r === "authenticated"))
  const so = [...SERVICE_ONLY].filter(t => anonSelectPolicy(t))
  const prMissing = ALL_OBJECTS.filter(t => bucket(t) === "PUBLIC_READ" && !anonSelectPolicy(t))
  console.log(`SERVICE_ONLY tables with an anon-readable SELECT policy (candidates to DROP): ${so.length}`)
  so.forEach(t => console.log(`   • ${t}`))
  console.log(`PUBLIC_READ tables WITHOUT an anon SELECT policy (candidates to ADD): ${prMissing.length}`)
  prMissing.forEach(t => console.log(`   • ${t}`))
}

;(INSPECT ? inspect() : APPLY ? apply() : dryRun())
  .catch(e => { console.error("FAILED:", e); process.exit(1) })
