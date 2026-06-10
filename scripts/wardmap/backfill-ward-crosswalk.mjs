/**
 * backfill-ward-crosswalk.mjs  —  Phase 3 production backfill.
 *
 * NON-DESTRUCTIVE. Adds two nullable columns and populates them from the
 * committed crosswalk. The raw `ward_no` (BBMP-Final-225 number) is NEVER
 * touched, so it is fully reversible (drop the two columns to revert).
 *
 *   bbmp_ward_no  int   — DataMeet-243 ward (what the map/`wards`/wiki render),
 *                         via max-overlap from the canonical crosswalk.
 *   ward_class    text  — 'ward'      : maps to a real 243 ward
 *                         'citywide'  : CE/Mayor/etc — no single ward
 *                         'unmapped'  : no crosswalk entry (flagged)
 *
 * DDL needs SUPABASE_MANAGEMENT_TOKEN (same as every seed-*.mjs). It is NOT
 * available locally by design — run this in CI or by Bharat. Without the
 * token the script does a READ-ONLY dry-run preview via the service role and
 * prints the exact SQL it would execute.
 *
 *   node scripts/wardmap/backfill-ward-crosswalk.mjs            # dry-run preview
 *   node scripts/wardmap/backfill-ward-crosswalk.mjs --apply    # writes (needs mgmt token)
 */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes("--apply")

// canonical crosswalk (committed)
const xwalk = JSON.parse(readFileSync(
  resolve(__dirname, "../../data/ward-crosswalk/bbmp2023_225_to_datameet_243.json"), "utf8"))
const MAP = xwalk.rows
  .filter(r => r.datameet243_no != null)
  .map(r => [r.bbmp225_no, r.datameet243_no])          // [225 → 243] max-overlap

// The 11 non-geographic CE/Mayor buckets (BBMP-Final ward_no, audited list).
// Verified earlier as the ONLY ward_no values > 225 carrying admin labels.
const CITYWIDE = {
  301: "Mayor", 303: "CE Project", 304: "CE Major Roads", 307: "CE SWD",
  308: "CE Lakes", 309: "Emergency", 310: "CE SWM", 313: "JD Horticulture",
  314: "CE Electrical", 317: "CE Road Infra", 318: "CE Quality Control",
}

// env: local dev reads apps/web/.env.local; CI has no such file and uses
// process.env (GH secrets), with the workflow's secret names. Accept both.
let env = {}
try {
  env = Object.fromEntries(
    readFileSync(resolve(__dirname, "../../apps/web/.env.local"), "utf8")
      .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
      .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
} catch { /* CI: no .env.local — fall through to process.env */ }
const SB = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SVC = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const MGMT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` }

const valuesList = MAP.map(([s, d]) => `(${s},${d})`).join(",")
const cityNos = Object.keys(CITYWIDE).join(",")
const SQL = `
-- Phase 3: non-destructive ward-crosswalk backfill (crosswalk ${xwalk.version})
ALTER TABLE bbmp_work_orders ADD COLUMN IF NOT EXISTS bbmp_ward_no integer;
ALTER TABLE bbmp_work_orders ADD COLUMN IF NOT EXISTS ward_class  text;

-- 1. geographic wards: BBMP-Final-225 ward_no -> DataMeet-243 (max-overlap)
UPDATE bbmp_work_orders AS w
   SET bbmp_ward_no = m.d, ward_class = 'ward'
  FROM (VALUES ${valuesList}) AS m(s, d)
 WHERE w.ward_no = m.s;

-- 2. city-wide CE/Mayor buckets: no single ward
UPDATE bbmp_work_orders
   SET ward_class = 'citywide', bbmp_ward_no = NULL
 WHERE ward_no IN (${cityNos});

-- 3. anything still unclassified: flagged unmapped (no crosswalk entry)
UPDATE bbmp_work_orders
   SET ward_class = 'unmapped'
 WHERE ward_class IS NULL;
`.trim()

async function svcCount(filter) {
  const r = await fetch(`${SB}/rest/v1/bbmp_work_orders?select=ward_no&${filter}`,
    { headers: { ...H, Prefer: "count=exact", Range: "0-0" } })
  return Number(r.headers.get("content-range")?.split("/")[1] ?? -1)
}

async function dryRun() {
  console.log("=== DRY RUN (read-only; no writes) ===")
  console.log(`crosswalk version: ${xwalk.version} · ${MAP.length} geographic 225→243 pairs`)
  const total = await svcCount("ward_no=not.is.null")
  const inMap = await svcCount(`ward_no=in.(${MAP.map(m => m[0]).join(",")})`)
  const cityWide = await svcCount(`ward_no=in.(${cityNos})`)
  const gt225 = await svcCount("ward_no=gt.225")
  const unmapped = total - inMap - cityWide
  console.log(`\nWould classify ${total} work orders:`)
  console.log(`  ward_class='ward'      : ${inMap}  (→ bbmp_ward_no set from crosswalk)`)
  console.log(`  ward_class='citywide'  : ${cityWide}  (11 CE/Mayor buckets; bbmp_ward_no NULL)`)
  console.log(`  ward_class='unmapped'  : ${unmapped}  (no crosswalk entry; flagged)`)
  // integrity guard: a ward_no>225 with an admin-looking label that is NOT
  // in the CITYWIDE list would be a NEW bucket BBMP added — must review.
  // (ward_no 226..~243 with no label are the expected 'unmapped' opencity
  // rows, not a problem.)
  const knownCity = new Set(Object.keys(CITYWIDE).map(Number))
  const ADMIN = /\b(CE|JD|EE|Mayor|Common|Quality|Project|Major Roads|Road Infra|Commissioner|Council|Electrical|Horticulture|Lakes?|SWD|SWM|Emergency|Storm Water)\b/i
  const hi = await fetch(`${SB}/rest/v1/bbmp_work_orders?select=ward_no,source_ward_name&ward_no=gt.225`,
    { headers: { ...H, Range: "0-9999" } }).then(r => r.json())
  const newBuckets = [...new Map(hi.map(r => [r.ward_no, r.source_ward_name])).entries()]
    .filter(([n, nm]) => !knownCity.has(n) && ADMIN.test(nm || ""))
  const unlabelledHi = [...new Set(hi.map(r => r.ward_no))].filter(n => !knownCity.has(n))
  console.log(`\nintegrity: ${gt225} WOs ward_no>225 = ${cityWide} citywide + ${gt225 - cityWide} unmapped`,
    `(unmapped ward_no: ${unlabelledHi.join(",")} — no label, expected).`)
  console.log(newBuckets.length
    ? `  ⚠ NEW admin bucket(s) not in CITYWIDE list — REVIEW before --apply: ${JSON.stringify(newBuckets)}`
    : `  ✓ no new admin buckets; CITYWIDE list is complete`)
  console.log("\n--- SQL that --apply would run ---\n" + SQL)
  console.log("\nRun with --apply (needs SUPABASE_MANAGEMENT_TOKEN) to write.")
}

async function apply() {
  if (!MGMT_TOKEN) {
    console.error("SUPABASE_MANAGEMENT_TOKEN not set — run in CI or export it. Aborting (no writes).")
    process.exit(1)
  }
  console.log(`=== APPLY (crosswalk ${xwalk.version}) ===`)
  const res = await fetch(
    "https://api.supabase.com/v1/projects/xgygxfyfsvccqqmtboeu/database/query",
    { method: "POST",
      headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: SQL }) })
  const txt = await res.text()
  if (!res.ok) { console.error(`DB ${res.status}: ${txt.slice(0, 400)}`); process.exit(1) }
  console.log("SQL applied OK.")
  // post-verify
  const v = await fetch(
    "https://api.supabase.com/v1/projects/xgygxfyfsvccqqmtboeu/database/query",
    { method: "POST",
      headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query:
        "SELECT ward_class, count(*) n, count(bbmp_ward_no) with_243 FROM bbmp_work_orders GROUP BY ward_class ORDER BY n DESC;" }) })
  console.log("post-state:", await v.text())
}

;(APPLY ? apply() : dryRun()).catch(e => { console.error("FAILED:", e); process.exit(1) })
