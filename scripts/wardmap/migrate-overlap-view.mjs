/**
 * migrate-overlap-view.mjs  —  Phase 5: overlap-inclusive attribution.
 *
 * NON-DESTRUCTIVE & REVERSIBLE. Adds a small mapping table + a view; touches
 * no existing column/row. Revert = `DROP VIEW v_work_orders_243; DROP TABLE
 * ward_crosswalk;` (Phase 3's bbmp_ward_no stays as the primary).
 *
 * Winner-take-all (Phase 3) left ~107 of 243 DataMeet wards empty because a
 * BBMP-225 ward's works only land on its single max-overlap 243 ward. This
 * surfaces each work order in EVERY 243 ward its 225 ward materially overlaps
 * (share ≥ 0.10, plus the primary always), via:
 *
 *   ward_crosswalk(bbmp225_no, datameet243_no, share, is_primary)
 *   v_work_orders_243 = bbmp_work_orders ⋈ ward_crosswalk  (ward_class='ward')
 *
 * Reads consume the view filtered by datameet243_no; overlap_share +
 * is_primary let the UI tag shared works and weight ward totals.
 *
 *   node scripts/wardmap/migrate-overlap-view.mjs           # dry-run
 *   node scripts/wardmap/migrate-overlap-view.mjs --apply    # writes (mgmt token)
 */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes("--apply")

const art = JSON.parse(readFileSync(
  resolve(__dirname, "../../data/ward-crosswalk/ward_crosswalk_pairs.json"), "utf8"))
const PAIRS = art.pairs

let env = {}
try {
  env = Object.fromEntries(
    readFileSync(resolve(__dirname, "../../apps/web/.env.local"), "utf8")
      .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
      .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
} catch { /* CI */ }
const SB = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SVC = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const MGMT = process.env.SUPABASE_MANAGEMENT_TOKEN
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` }

const values = PAIRS.map(p =>
  `(${p.bbmp225_no},${p.datameet243_no},${p.share},${p.is_primary})`).join(",")

const SQL = `
-- Phase 5: overlap-inclusive ward attribution (crosswalk ${art.version})
CREATE TABLE IF NOT EXISTS ward_crosswalk (
  bbmp225_no     integer NOT NULL,
  datameet243_no integer NOT NULL,
  share          numeric NOT NULL,
  is_primary     boolean NOT NULL,
  PRIMARY KEY (bbmp225_no, datameet243_no)
);
TRUNCATE ward_crosswalk;
INSERT INTO ward_crosswalk (bbmp225_no,datameet243_no,share,is_primary) VALUES ${values};

CREATE OR REPLACE VIEW v_work_orders_243 AS
  SELECT wo.*, x.datameet243_no, x.share AS overlap_share, x.is_primary
    FROM bbmp_work_orders wo
    JOIN ward_crosswalk x ON x.bbmp225_no = wo.ward_no
   WHERE wo.ward_class = 'ward';

GRANT SELECT ON ward_crosswalk      TO anon, authenticated;
GRANT SELECT ON v_work_orders_243   TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
`.trim()

async function dbq(token, q) {
  const r = await fetch(
    "https://api.supabase.com/v1/projects/xgygxfyfsvccqqmtboeu/database/query",
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }) })
  const t = await r.text()
  if (!r.ok) throw new Error(`DB ${r.status}: ${t.slice(0, 300)}`)
  return t
}
async function svcCount(filter) {
  const r = await fetch(`${SB}/rest/v1/bbmp_work_orders?select=id&${filter}`,
    { headers: { ...H, Prefer: "count=exact", Range: "0-0" } })
  return Number(r.headers.get("content-range")?.split("/")[1] ?? -1)
}

async function dryRun() {
  console.log("=== DRY RUN (read-only; no writes) ===")
  console.log(`crosswalk ${art.version} · ${PAIRS.length} pairs (min_share ${art.min_share})`)
  const cov = new Set(PAIRS.map(p => p.datameet243_no))
  const prim = new Set(PAIRS.filter(p => p.is_primary).map(p => p.datameet243_no))
  // wards that HAD works under winner-take-all (Phase 3 bbmp_ward_no)
  const wn = await fetch(`${SB}/rest/v1/bbmp_work_orders?select=bbmp_ward_no&bbmp_ward_no=not.is.null`,
    { headers: { ...H, Range: "0-19999" } }).then(r => r.json())
  const hadWorks = new Set(wn.map(x => x.bbmp_ward_no))
  // 225 wards that actually have ≥1 'ward' WO
  const ww = await fetch(`${SB}/rest/v1/bbmp_work_orders?select=ward_no&ward_class=eq.ward`,
    { headers: { ...H, Range: "0-19999" } }).then(r => r.json())
  const wards225WithWorks = new Set(ww.map(x => x.ward_no))
  const willHave = new Set(
    PAIRS.filter(p => wards225WithWorks.has(p.bbmp225_no)).map(p => p.datameet243_no))
  console.log(`'ward' work orders total: ${await svcCount("ward_class=eq.ward")}`)
  console.log(`243 wards covered by pairs: ${cov.size}/243 (primary-only: ${prim.size})`)
  console.log(`243 wards with works — winner-take-all (now): ${hadWorks.size}`)
  console.log(`243 wards with works — overlap-inclusive (after): ${willHave.size}`)
  console.log(`→ newly-populated wards: ${willHave.size - hadWorks.size}`)
  console.log("\n--- SQL (first 600 chars) ---\n" + SQL.slice(0, 600) + "\n…")
  console.log(`\n(${PAIRS.length} VALUES rows omitted). Run --apply with SUPABASE_MANAGEMENT_TOKEN to write.`)
}

async function apply() {
  if (!MGMT) { console.error("SUPABASE_MANAGEMENT_TOKEN not set — run in CI. Aborting (no writes)."); process.exit(1) }
  console.log(`=== APPLY (crosswalk ${art.version}, ${PAIRS.length} pairs) ===`)
  await dbq(MGMT, SQL)
  console.log("SQL applied OK.")
  const v = await dbq(MGMT,
    "SELECT count(DISTINCT datameet243_no) wards_243, count(*) rows FROM v_work_orders_243;")
  console.log("v_work_orders_243:", v)
}

;(APPLY ? apply() : dryRun()).catch(e => { console.error("FAILED:", e); process.exit(1) })
