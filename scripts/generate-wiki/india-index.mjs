#!/usr/bin/env node
/**
 * india-index.mjs — generate the India section of the wiki (data.kaun.city).
 *
 * The national counterpart to ward-index.mjs. Same shape, same discipline:
 * one generator, honest empty states, a sources footer on every page, and
 * every page linking to its live counterpart on kaun.city.
 *
 * Writes:
 *   wiki/docs/india/constituencies/index.md              all 543 seats, by state
 *   wiki/docs/india/constituencies/<pc_code>-<slug>.md   one per seat (543 files)
 *   wiki/docs/india/projects.md                          central-project overruns
 *
 * READ PATH — PUBLIC ANON KEY, ON PURPOSE
 * ---------------------------------------
 * ward-index.mjs reads the kaun.city public APIs. There is no /api/data/india/*
 * route (lib/india/api.ts is deliberately the single read path for the surface,
 * see its header), so this reads Supabase PostgREST directly with the SAME
 * public anon key the browser bundle already ships in apps/web/lib/supabase.ts.
 * Nothing secret is involved and the workflow needs no repository secret.
 *
 * The anon key is not a convenience here, it is a safety property. in_mp_affidavits
 * is row-restricted by RLS:
 *
 *     USING (needs_review = false AND parse_status = 'ok')
 *
 * so an unreviewed MyNeta↔seat join — a criminal-case count possibly attached to
 * the wrong person — is invisible to this generator and therefore cannot be
 * published to a public wiki. A service-role key would bypass that policy and
 * silently publish exactly the rows a human has not yet cleared. assertAnonKey()
 * below refuses to run with anything but an `anon` token, so that mistake is not
 * available even to a careless workflow edit.
 *
 * TOLERANCE
 * ---------
 * The India tables are loaded by six independent pipelines on different cadences
 * (roster weekly, MoSPI monthly, affidavits on demand). At any moment some are
 * populated and some are not. Every section renders an explicit "not loaded yet"
 * state rather than an empty table or a zero, and a re-run converges: nothing is
 * cached, nothing is merged with a previous run. The one hard requirement is
 * in_constituencies — with no seats there is nothing to generate, and the script
 * aborts rather than deleting 543 pages.
 *
 * Usage:
 *   node scripts/generate-wiki/india-index.mjs
 *   node scripts/generate-wiki/india-index.mjs --limit 5     # first 5 seats, for a smoke test
 */

import { writeFileSync, mkdirSync, readdirSync, unlinkSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { run, intOpt } from "../india/lib/cli.mjs"

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

/** Same default as apps/web/lib/supabase.ts — public, and already in the bundle. */
const DEFAULT_URL = "https://xgygxfyfsvccqqmtboeu.supabase.co"
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneWd4Znlmc3ZjY3FxbXRib2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDg1NzIsImV4cCI6MjA4ODEyNDU3Mn0.5dzsC5-Ex-Umk-9DTM5xNsQB-t0my-MtWq9WUPhidD4"

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? DEFAULT_URL
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY

/** Where kaun.city serves the India layer. Every page links to its counterpart. */
const SITE = "https://kaun.city"
export const seatUrl = pcCode => `${SITE}/india/c/${pcCode}`
export const trackerUrl = `${SITE}/india/projects`
export const projectUrl = code => `${SITE}/india/projects/${encodeURIComponent(code)}`

const OUT_DIR = "wiki/docs/india"
const SEATS_DIR = `${OUT_DIR}/constituencies`
const INDEX_PATH = `${SEATS_DIR}/index.md`
const PROJECTS_PATH = `${OUT_DIR}/projects.md`
const CROSSWALK_PATH = "data/pc-crosswalk/india_pc_crosswalk.json"

const TODAY = new Date().toISOString().slice(0, 10)

/** Seats listed per state on the tracker's per-state project blocks. */
const PC_PROJECTS_LIMIT = 6
/** Rows in each ranking on the projects page. */
const TRACKER_ROWS = 25

const ISSUES = "https://github.com/kaun-city/kaun/issues/new"
const REPO = "https://github.com/kaun-city/kaun/blob/master"

// Column lists mirror apps/web/lib/india/api.ts so the wiki and the interactive
// surface read the same fields. Geometry is never selected — it is megabytes per
// seat and the wiki does not render maps.
const C_COLS = "pc_code,st_code,pc_no,state_name,pc_name,pc_name_hi,reserved_for,reserved_source,wikidata_qid,geom_source,data_source,updated_at"
const MP_COLS = "id,mpsno,house,term_label,pc_code,state_name,constituency_label,name,party_abbr,party_full,gender,age,no_of_terms,qualification,profession,status,is_minister,minister_note,profile_url,data_source,updated_at"
const AFF_COLS = "id,pc_code,election,candidate_name,party_abbr,age,self_profession,education_category,education_detail,criminal_cases,total_assets_inr,liabilities_inr,profile_url,data_source,updated_at"
const ACT_COLS = "id,mp_id,period_kind,session_no,session_label,sittings_held,signed_days,attendance_pct,questions_asked,debates,private_member_bills,committees,metrics_excluded,metrics_excluded_reason,data_source"
const MPLADS_COLS = "id,pc_code,source,house,term_label,allocated_inr,expenditure_inr,unspent_inr,utilization_pct,works_recommended,works_sanctioned,works_completed,captured_at,data_source"
const PROJ_COLS = "project_code,legacy_ocms_code,pmgid,project_name,ministry,sector,agency,state_raw,st_code,is_multi_state,first_seen_month,last_seen_month,is_ongoing"
const CHANGE_COLS = "project_code,report_month,prev_report_month,revised_cost_cr,prev_revised_cost_cr,revised_doc_month,prev_revised_doc_month,cumulative_expenditure_cr,physical_progress_pct,cost_overrun_cr,schedule_slip_months,cost_revised,schedule_changed"
const STALE_COLS = "project_code,last_change_month,months_unchanged,last_report_month,first_report_month,snapshot_count,is_in_latest_report,latest_physical_progress_pct,latest_cost_overrun_cr"

// ---------------------------------------------------------------------------
// read path
// ---------------------------------------------------------------------------

/**
 * Refuse anything but an `anon` token. See the module header: publishing
 * unreviewed affidavit rows to a public wiki is the failure this prevents, and
 * a wrong key is the only way it can happen.
 */
export function jwtRole(token) {
  const parts = String(token ?? "").split(".")
  if (parts.length !== 3) return null
  try {
    const pad = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4)
    const payload = JSON.parse(Buffer.from(pad, "base64url").toString("utf8"))
    return typeof payload.role === "string" ? payload.role : null
  } catch {
    return null
  }
}

export function assertAnonKey(token) {
  const role = jwtRole(token)
  if (role === "anon") return role
  throw new Error(
    `refusing to run with a '${role ?? "unrecognised"}' key. This generator must read as anon: ` +
    "in_mp_affidavits hides unreviewed rows by RLS, and a service-role key would publish them.",
  )
}

/**
 * Paged PostgREST GET. PostgREST caps a response at 1000 rows, and several of
 * these tables are larger than that, so every read pages explicitly rather than
 * silently truncating.
 *
 * Returns `{ rows, missing }`. A 404 (PGRST205 — relation not in the schema
 * cache) is not an error: v_in_central_project_staleness is created by a
 * separate one-off migration that may not have been applied, and a wiki
 * generator is not the place to fail over that. Every other non-2xx throws.
 */
export async function fetchTable(table, params = {}, { pageSize = 1000 } = {}) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
        "Range-Unit": "items",
      },
    })
    if (res.status === 404) return { rows: [], missing: true }
    if (!res.ok) throw new Error(`${table} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < pageSize) return { rows, missing: false }
  }
}

// ---------------------------------------------------------------------------
// formatting
//
// These mirror apps/web/lib/india/format.ts exactly. They are duplicated rather
// than imported because the workflow runs plain `node` on a .mjs file and that
// module is TypeScript; tests/india-wiki.test.mjs imports both and asserts they
// agree on every case, so the copies cannot drift.
// ---------------------------------------------------------------------------

export function groupIndian(n) {
  return Math.round(n).toLocaleString("en-IN")
}

/** Whole rupees → the largest readable unit. Null renders "—", never ₹0. */
export function formatRupees(inr) {
  if (inr === null || inr === undefined || !Number.isFinite(Number(inr))) return "—"
  const v = Number(inr)
  const abs = Math.abs(v)
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`
  return `₹${groupIndian(v)}`
}

/** Crore in, crore out — MoSPI's own unit. */
export function formatCrore(cr) {
  if (cr === null || cr === undefined || !Number.isFinite(Number(cr))) return "—"
  const v = Number(cr)
  const abs = Math.abs(v)
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L Cr`
  if (abs >= 100) return `₹${groupIndian(v)} Cr`
  return `₹${v.toFixed(2)} Cr`
}

export function formatCroreDelta(cr) {
  if (cr === null || cr === undefined || !Number.isFinite(Number(cr))) return "—"
  const v = Number(cr)
  if (v === 0) return "no change"
  return `${v > 0 ? "+" : "−"}${formatCrore(Math.abs(v))}`
}

export function formatPct(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—"
  return `${Number(v).toFixed(digits)}%`
}

export function formatMonth(iso) {
  if (!iso) return "—"
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  if (!m) return iso
  const month = Number(m[2])
  if (month < 1 || month > 12) return iso
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${MONTHS[month - 1]} ${m[1]}`
}

export function formatSlip(months) {
  if (months === null || months === undefined || !Number.isFinite(Number(months))) return "—"
  const v = Number(months)
  if (v === 0) return "on original schedule"
  const abs = Math.abs(v)
  const unit = abs === 1 ? "month" : "months"
  return v > 0 ? `${abs} ${unit} later` : `${abs} ${unit} earlier`
}

// ---------------------------------------------------------------------------
// page identity
// ---------------------------------------------------------------------------

export function slugify(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * `<pc_code>-<slug>.md`, e.g. "29-25-bangalore-central.md". pc_code already
 * carries a hyphen ("29-25") and is unique, so the filename is unique even when
 * two states have a seat of the same name (Aurangabad: Bihar and Maharashtra).
 */
export function seatFilename(c) {
  return `${c.pc_code}-${slugify(c.pc_name)}.md`
}

/** Escape a pipe so a value containing one cannot break a markdown table. */
export function cell(v, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback
  return String(v).replace(/\|/g, "\\|").replace(/\n+/g, " ").trim()
}

/**
 * Reservation, from the strongest available source.
 *
 * in_constituencies stores SC/ST and leaves GEN as NULL. The crosswalk artifact
 * records all three explicitly, with the Delimitation Order clause it came from.
 * So a NULL in the database plus a GEN in the crosswalk means "General, and we
 * know it" — not "unknown". Only a seat missing from both renders as unknown.
 */
export function reservedLabel(dbValue, crosswalkValue) {
  const v = dbValue ?? (crosswalkValue === "GEN" ? null : crosswalkValue ?? null)
  if (v === "SC") return "SC"
  if (v === "ST") return "ST"
  if (crosswalkValue === "GEN" || dbValue === null) return "General"
  return "not recorded"
}

// ---------------------------------------------------------------------------
// crosswalk artifact
// ---------------------------------------------------------------------------

/**
 * The committed PC↔AC↔district crosswalk (data/pc-crosswalk/, PR #64).
 *
 * Read from disk, never refetched: it is a versioned artifact of a
 * delimitation order, it changes only when a delimitation order changes, and
 * the whole point of committing it was that a build does not depend on
 * archive.org being up.
 */
export function loadCrosswalk(path = CROSSWALK_PATH) {
  if (!existsSync(path)) return { version: null, generatedAt: null, byPc: new Map(), missing: true }
  const doc = JSON.parse(readFileSync(path, "utf8"))
  const byPc = new Map((doc.rows ?? []).map(r => [r.pc_code, r]))
  return {
    version: doc.version ?? null,
    generatedAt: doc.generated_at ?? null,
    method: doc.method ?? null,
    byPc,
    missing: false,
  }
}

// ---------------------------------------------------------------------------
// shared prose
//
// One wording for each caveat, used identically by every page. The ward pages
// drifted on this and it took a PR to reconcile; the India surface fixed it by
// centralising SOURCE_* in lib/india/constants.ts, and this is that list again
// in markdown.
// ---------------------------------------------------------------------------

export const MINISTER_RULE =
  "Ministers and the Speaker do not sign the attendance register, do not ask questions and do not " +
  "introduce private member bills. Their metrics are recorded as **not applicable — never as zero**, " +
  "because a zero here would read as absenteeism and would be false."

export const MOSPI_STATE_LEVEL_NOTE =
  "MoSPI reports central projects **by state only**. These are the state's projects, not this " +
  "constituency's — no district or constituency breakdown exists in the source, and Kaun does not " +
  "guess one from a project's name."

export const AFFIDAVIT_PENDING =
  "**Affidavit not published yet.** Kaun serves a nomination affidavit only once its MyNeta↔seat join " +
  "has been reviewed by a human and the source page has parsed cleanly — unreviewed rows are hidden by " +
  "a database policy, not by this page. Attaching a criminal-case count to the wrong person is the " +
  "failure this guards against, so the count is withheld rather than guessed."

function sourceRow(name, publisher, url, note) {
  return `| ${name} | [${publisher}](${url}) | ${note} |`
}

/** The sources footer. `have` decides which datasets are cited, so a page never
 *  cites a source it did not actually read a row from. */
export function sourcesFooter(have, crosswalk) {
  const lines = []
  lines.push("## Sources")
  lines.push("")
  lines.push("| Dataset | Publisher | Notes |")
  lines.push("|---|---|---|")
  if (have.seats) {
    lines.push(sourceRow(
      "Seat identity and boundaries (543)",
      "DataMeet + shijithpk 2024 supplement",
      "https://github.com/datameet/maps/tree/master/parliamentary-constituencies",
      "2008 delimitation, with the 2022 J&K and 2023 Assam orders applied. Assam, J&K and Ladakh outlines were re-georeferenced from ECI press-note PDFs and are not survey-grade.",
    ))
  }
  if (have.crosswalk) {
    lines.push(sourceRow(
      `Assembly segments and districts (crosswalk \`${crosswalk?.version ?? "unversioned"}\`)`,
      "Kaun, from ECI Delimitation Orders 2008 / 2022-J&K / 2023-Assam",
      "../pc-crosswalk.md",
      "Table B of the order in force for each state, parsed and then independently verified against AC/PC/district polygons.",
    ))
  }
  if (have.roster) {
    lines.push(sourceRow(
      "MP roster — 18th Lok Sabha",
      "sansad.in (Lok Sabha Secretariat)",
      "https://sansad.in",
      "sansad.in publishes constituency names with no seat number. Names resolve to a `pc_code` through an alias table and exact normalized matching only — never by similarity.",
    ))
  }
  if (have.affidavit) {
    lines.push(sourceRow(
      "Criminal cases, assets, education",
      "ECI nomination affidavits via myneta.info (ADR)",
      "https://myneta.info",
      "Self-declared by the candidate. Kaun reproduces the declaration; it does not verify it.",
    ))
  }
  if (have.activity) {
    lines.push(sourceRow(
      "Attendance, questions, debates",
      "PRS Legislative Research MP Track and sansad.in",
      "https://prsindia.org/mptrack",
      "Ministers and the Speaker are excluded by the source itself; see the note above.",
    ))
  }
  if (have.mplads) {
    lines.push(sourceRow(
      "MPLADS allocation and spend",
      "eSAKSHI (MoSPI)",
      "https://mplads.gov.in",
      "eSAKSHI is the official source. Rows from Empowered Indian, where present, are labelled unofficial.",
    ))
  }
  if (have.projects) {
    lines.push(sourceRow(
      "Central projects ≥ ₹150 crore",
      "MoSPI Flash Report, Table 6 (PAIMANA)",
      "https://www.mospi.gov.in",
      "Monthly, with a ~7–8 week publication lag. Published with a state column and nothing finer.",
    ))
  }
  lines.push("")
  return lines
}

function generatedLine(extra = "") {
  return `_Auto-generated on ${TODAY} by [\`scripts/generate-wiki/india-index.mjs\`](${REPO}/scripts/generate-wiki/india-index.mjs), reading the kaun.city Supabase tables with the public anon key. ${extra}Refreshed weekly by the \`refresh-india-wiki\` workflow; if something looks wrong the source of truth is the database, so please [open an issue](${ISSUES}) with the seat code and the correction._`
}

// ---------------------------------------------------------------------------
// index page
// ---------------------------------------------------------------------------

/**
 * Districts a seat is made of.
 *
 * The order's own district headings (`districts_order`) when the transcription
 * has them. Assam and J&K were re-delimited after 2008 and only their newer
 * Table B was transcribed — no district headings — so those seats fall back to
 * the polygon-overlap share vector, and say so. Returning the whole vector
 * rather than the single largest share matters: Anantnag-Rajouri spans four
 * districts and naming only Anantnag would be wrong.
 */
export function districtsLabel(cw) {
  if (!cw) return null
  if (cw.districts_order) return { text: cw.districts_order, fromOrder: true }
  const vec = (cw.district_shares_vector ?? [])
    .filter(d => d.district)
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
  if (vec.length === 0) {
    return cw.district_primary_spatial ? { text: cw.district_primary_spatial, fromOrder: false } : null
  }
  return {
    text: vec.map(d => `${d.district} (${Math.round((d.share ?? 0) * 100)}%)`).join(", "),
    fromOrder: false,
  }
}

/** How a seat with no sitting MP should be described. */
export function vacancyKind(former) {
  if (!former || former.length === 0) return "unmatched"
  return "vacant"
}

export function renderIndex({ constituencies, mpByPc, formerByPc, affidavitByPc, crosswalk, coverage, unresolvedMps }) {
  const byState = new Map()
  for (const c of constituencies) {
    if (!byState.has(c.state_name)) byState.set(c.state_name, [])
    byState.get(c.state_name).push(c)
  }
  for (const arr of byState.values()) arr.sort((a, b) => a.pc_no - b.pc_no)
  const states = [...byState.keys()].sort((a, b) => a.localeCompare(b))

  const withMp = constituencies.filter(c => mpByPc.has(c.pc_code)).length
  const vacant = constituencies.length - withMp

  const lines = []
  lines.push(`# Constituencies — India (Lok Sabha, ${constituencies.length})`)
  lines.push("")
  lines.push(generatedLine())
  lines.push("")
  lines.push("Every Lok Sabha seat gets a page here: who holds it, which assembly segments and districts")
  lines.push("it is made of, what its MP has declared, and what Parliament records of their work. Each seat")
  lines.push("also links to its live page on kaun.city, which adds the map, the choropleth layers and the")
  lines.push("comparison tools this wiki does not try to reproduce.")
  lines.push("")
  lines.push(`**[Open the interactive India map on kaun.city →](${SITE}/india)** — all ${constituencies.length} seats on one map,`)
  lines.push("shaded by declared criminal cases, MPLADS utilization or attendance, with search by seat or MP name.")
  lines.push("")
  lines.push("!!! info \"How seats are keyed\"")
  lines.push("    Kaun's seat key is `pc_code` = `<state code>-<seat number>`, unpadded — Bangalore Central is")
  lines.push("    `29-25`. The seat number alone is **not** nationally unique: it restarts at 1 in every state")
  lines.push("    and UT, so `pc_no = 1` names 36 different seats. Anything keyed on the seat number alone")
  lines.push("    silently merges them. The state code is the Census-2011 code as extended by DataMeet")
  lines.push("    (Telangana 36, residuary Andhra Pradesh 37, Ladakh 38).")
  lines.push("")
  lines.push("---")
  lines.push("")

  // Coverage — the honest header. Which of the six pipelines have actually
  // landed at generation time, stated in numbers rather than implied by blanks.
  lines.push("## What is loaded right now")
  lines.push("")
  lines.push("The India layer is fed by six independent pipelines on different cadences. This table is the")
  lines.push("state of each one at the moment these pages were generated — a blank section on a seat page")
  lines.push("means the pipeline has not landed yet, not that the seat has no data.")
  lines.push("")
  lines.push("| Dataset | Table | Rows readable | Status |")
  lines.push("|---|---|---:|---|")
  for (const row of coverage) {
    lines.push(`| ${row.label} | \`${row.table}\` | ${row.count === null ? "—" : groupIndian(row.count)} | ${row.status} |`)
  }
  lines.push("")
  lines.push("\"Rows readable\" is what the **public** anon role can see. `in_mp_affidavits` is row-restricted:")
  lines.push("an affidavit becomes readable only after its MyNeta↔seat join has been reviewed, so a low number")
  lines.push("there means review is pending, not that the scrape failed.")
  lines.push("")
  lines.push("---")
  lines.push("")

  lines.push("## Seats by state")
  lines.push("")
  const rosterLoaded = withMp > 0 || (unresolvedMps?.length ?? 0) > 0 || (formerByPc?.size ?? 0) > 0
  lines.push(`${constituencies.length} seats across ${states.length} states and union territories. ` +
    (rosterLoaded
      ? `${withMp} have a sitting MP in the roster${vacant > 0 ? `; ${vacant} do not` : ""}.`
      : "The MP roster has not been loaded yet, so the MP columns are blank throughout."))
  lines.push("")
  if (rosterLoaded && vacant > 0) {
    lines.push("A seat shows no MP for one of two reasons, and they are different reasons:")
    lines.push("")
    lines.push("- **Vacant** — the seat's MP has died, resigned or been disqualified and the bypoll has not")
    lines.push("  happened. Kaun keeps the predecessor's row and names them on the seat page, but never presents")
    lines.push("  them as the current MP.")
    lines.push("- **Not matched** — the roster holds an MP whose constituency name has not yet been resolved to a")
    lines.push("  seat code." + (unresolvedMps?.length
      ? ` ${unresolvedMps.length} sitting MP${unresolvedMps.length === 1 ? "" : "s"} ` +
        `(${unresolvedMps.map(m => `${cell(m.name)} — "${cell(m.constituency_label)}"`).join("; ")}) ` +
        "were awaiting a reviewed alias row when this page was generated."
      : "") + " Names resolve through a reviewed alias table and exact")
    lines.push("  normalized matching only — never by similarity — so an unresolved name stays visibly")
    lines.push("  unresolved instead of being guessed onto a seat.")
    lines.push("")
  }
  lines.push("Jump to: " + states.map(s => `[${s}](#${slugify(s)})`).join(" · "))
  lines.push("")

  for (const state of states) {
    const seats = byState.get(state)
    lines.push(`### ${state}`)
    lines.push("")
    lines.push(`${seats.length} seat${seats.length === 1 ? "" : "s"}.`)
    lines.push("")
    lines.push("| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |")
    lines.push("|---|---|---|---|---|---|---|")
    for (const c of seats) {
      const cw = crosswalk.byPc.get(c.pc_code)
      const mp = mpByPc.get(c.pc_code)
      const aff = affidavitByPc.get(c.pc_code)
      const reserved = reservedLabel(c.reserved_for, cw?.reserved_status)
      const mpCell = mp
        ? `${cell(mp.name)}${mp.is_minister ? " ·&nbsp;minister" : ""}`
        : vacancyKind(formerByPc?.get(c.pc_code)) === "vacant"
          ? "_vacant — bypoll pending_"
          : "_not matched_"
      const cases = aff?.criminal_cases
      const casesCell = cases === null || cases === undefined
        ? "_pending review_"
        : cases > 0 ? `⚠ ${cases}` : "none declared"
      lines.push(
        `| \`${c.pc_code}\` | [${cell(c.pc_name)}](${seatFilename(c)}) | ${reserved === "General" ? "—" : reserved} ` +
        `| ${mpCell} | ${cell(mp?.party_abbr)} | ${casesCell} | [open →](${seatUrl(c.pc_code)}) |`,
      )
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("")
  lines.push("## Reading the columns")
  lines.push("")
  lines.push("- **Reserved** — SC or ST as fixed by the Delimitation Order in force. A dash means the seat is")
  lines.push("  General. Kaun takes this from the order's own schedule, because every boundary file and roster")
  lines.push("  API checked under-reports it — DataMeet's own PC file and the official Lok Sabha members API")
  lines.push("  both undercount ST seats.")
  lines.push("- **Declared cases** — pending criminal cases the winner declared in their Election Commission")
  lines.push("  nomination affidavit. Self-declared; a pending case is an accusation, not a conviction.")
  lines.push("  \"Pending review\" means Kaun holds no publicly-cleared affidavit for that seat.")
  lines.push("- **Sitting MP** — from the sansad.in roster. Ministers are marked, because their parliamentary")
  lines.push("  activity metrics are structurally absent rather than low.")
  lines.push("")
  lines.push(...sourcesFooter(
    { seats: true, crosswalk: !crosswalk.missing, roster: withMp > 0, affidavit: affidavitByPc.size > 0 },
    crosswalk,
  ))
  return lines.join("\n") + "\n"
}

// ---------------------------------------------------------------------------
// seat page
// ---------------------------------------------------------------------------

export function renderSeat({ c, cw, mp, former = [], affidavit, activity, mplads, projects, reportMonth, crosswalk, staleByCode, unresolvedCount = 0 }) {
  const reserved = reservedLabel(c.reserved_for, cw?.reserved_status)
  const acs = cw?.acs ?? []
  const lines = []

  lines.push(`# ${c.pc_name} — Lok Sabha, ${c.state_name}`)
  lines.push("")
  const ident = [`\`${c.pc_code}\``]
  if (c.pc_name_hi) ident.push(c.pc_name_hi)
  ident.push(reserved === "General" ? "General seat" : `Reserved for ${reserved}`)
  if (acs.length) ident.push(`${acs.length} assembly segment${acs.length === 1 ? "" : "s"}`)
  lines.push(`_${ident.join(" · ")}_`)
  lines.push("")
  lines.push(`**[Open ${c.pc_name} on kaun.city →](${seatUrl(c.pc_code)})** for the interactive view — the seat`)
  lines.push("on the national map, the choropleth layers (declared cases, MPLADS utilization, attendance) and")
  lines.push("side-by-side comparison against any other seat.")
  lines.push("")
  lines.push("---")
  lines.push("")

  // --- identity -----------------------------------------------------------
  lines.push("## Identity")
  lines.push("")
  lines.push("| Field | Value |")
  lines.push("|---|---|")
  lines.push(`| Kaun seat key | \`${c.pc_code}\` |`)
  lines.push(`| State / UT | ${cell(c.state_name)} |`)
  lines.push(`| Seat number within the state | ${cell(c.pc_no)} |`)
  lines.push(`| Reservation | ${reserved}${cw?.reserved_source ? ` (source: \`${cw.reserved_source}\`)` : c.reserved_source ? ` (source: \`${c.reserved_source}\`)` : ""} |`)
  if (c.pc_name_hi) lines.push(`| Name (Hindi) | ${cell(c.pc_name_hi)} |`)
  if (cw?.pc_name_former) lines.push(`| Former name | ${cell(cw.pc_name_former)} |`)
  const districts = districtsLabel(cw)
  if (districts) {
    lines.push(`| Districts | ${cell(districts.text)}${districts.fromOrder ? "" : " _(share of the seat's area by district, measured from polygon overlap — this state was re-delimited after 2008 and only the newer order's seat composition was transcribed, without district headings)_"} |`)
  }
  if (cw?.ac_count != null) lines.push(`| Assembly segments | ${cw.ac_count} |`)
  if (c.wikidata_qid) lines.push(`| Wikidata | [${c.wikidata_qid}](https://www.wikidata.org/wiki/${c.wikidata_qid}) |`)
  if (cw?.verification) lines.push(`| Crosswalk verification | ${cell(cw.verification)} |`)
  if (c.geom_source) lines.push(`| Boundary source | \`${c.geom_source}\` |`)
  lines.push("")

  if (reserved === "General") {
    lines.push("_Reservation is shown only when it comes from the Delimitation Order. Kaun does not repeat the")
    lines.push("SC/ST flags published in boundary files and roster APIs, because both were checked and both")
    lines.push("undercount ST seats._")
    lines.push("")
  }

  // --- assembly segments ---------------------------------------------------
  lines.push("---")
  lines.push("")
  lines.push("## Assembly segments")
  lines.push("")
  if (!cw) {
    lines.push("This seat is not present in the committed PC crosswalk artifact. That is a gap in the")
    lines.push(`crosswalk, not in the seat — please [report it](${ISSUES}) with the seat code \`${c.pc_code}\`.`)
  } else if (acs.length === 0) {
    const note = cw.delimitation_note || cw.source_basis || ""
    lines.push(`**${c.state_name} has no legislative assembly**, so this seat has no assembly segments to list.`)
    lines.push("The Delimitation Order records the seat's composition in districts rather than assembly")
    lines.push(`constituencies${districts ? `: ${cell(districts.text)}` : ""}.${note ? ` _(${cell(note)})_` : ""}`)
  } else {
    const agree = acs.filter(a => a.spatial_agrees === true).length
    const testable = acs.filter(a => a.spatial_located === true).length
    lines.push(`${acs.length} assembly constituenc${acs.length === 1 ? "y makes" : "ies make"} up this Lok Sabha seat, ` +
      "as listed in Table B of the delimitation order in force for this state.")
    lines.push("")
    lines.push("| AC # | Assembly constituency | Reserved | District (per the Order) | Independent polygon check |")
    lines.push("|---:|---|---|---|---|")
    for (const a of acs) {
      const res = a.ac_reserved && a.ac_reserved !== "GEN" ? a.ac_reserved : "—"
      const check = a.spatial_located === false || a.spatial_located == null
        ? "not testable"
        : a.spatial_agrees ? "agrees" : `⚠ polygon puts it in ${cell(a.spatial_pc, "another seat")}`
      lines.push(`| ${cell(a.ac_no)} | ${cell(a.ac_name)} | ${res} | ${cell(a.district_order)} | ${check} |`)
    }
    lines.push("")
    if (testable > 0) {
      lines.push(`_Independent check: ${agree} of ${testable} testable segments agree with the polygon geometry` +
        `${testable < acs.length ? `; ${acs.length - testable} could not be tested` : ""}. Where the text and the`)
      lines.push("geometry disagree the order's text is the fixed point — the published AC boundaries predate the")
      lines.push("2008 delimitation in several states. Every disagreement is published rather than hidden; see the")
      lines.push("[crosswalk page](../pc-crosswalk.md)._")
    } else {
      lines.push("_No segment in this seat could be tested against independent polygons; the composition rests on")
      lines.push("the order's text alone. See the [crosswalk page](../pc-crosswalk.md)._")
    }
  }
  lines.push("")

  // --- MP ------------------------------------------------------------------
  lines.push("---")
  lines.push("")
  lines.push("## Who holds this seat")
  lines.push("")
  if (!mp && former.length > 0) {
    const prev = former[0]
    lines.push("**This seat is vacant.** The bypoll to fill it has not been held, or its result has not reached")
    lines.push("the roster yet. Kaun keeps the predecessor's record and names them below, but never presents a")
    lines.push("former member as the current MP.")
    lines.push("")
    lines.push("| Previous member | Party | Left the seat as | Term |")
    lines.push("|---|---|---|---|")
    for (const f of former) {
      lines.push(`| ${cell(f.name)}${f.profile_url ? ` ([profile](${f.profile_url}))` : ""} | ${cell(f.party_full ?? f.party_abbr)} | ${cell(f.status)} | ${cell(f.term_label)} |`)
    }
    lines.push("")
    lines.push(`_${cell(prev.name)} is recorded with status \`${cell(prev.status)}\`. The database enforces at most one` +
      " sitting member per seat, so a predecessor row can never be mistaken for the incumbent._")
  } else if (!mp) {
    lines.push("**No MP is linked to this seat.** Either the roster has not been loaded, or it holds a member")
    lines.push("whose constituency name has not yet been resolved to this seat code.")
    if (unresolvedCount > 0) {
      lines.push("")
      lines.push(`${unresolvedCount} sitting member${unresolvedCount === 1 ? " was" : "s were"} awaiting a reviewed alias row` +
        " when this page was generated. Kaun resolves a source's constituency label to a seat through a")
      lines.push("reviewed alias table and exact normalized matching only — never by similarity — so an")
      lines.push("unresolved name stays visibly unresolved rather than being guessed onto a seat. Matching")
      lines.push("\"Mahbubnagar\" to \"Mahabubnagar\" automatically is exactly the error this refuses to make.")
    }
  } else {
    const party = mp.party_full || mp.party_abbr
    lines.push(`**${mp.name}**${party ? ` (${cell(party)})` : ""} holds this seat.`)
    lines.push("")
    lines.push("| Field | Value |")
    lines.push("|---|---|")
    lines.push(`| Name | ${cell(mp.name)} |`)
    lines.push(`| Party | ${cell(mp.party_full ?? mp.party_abbr)}${mp.party_full && mp.party_abbr ? ` (${cell(mp.party_abbr)})` : ""} |`)
    lines.push(`| Term | ${cell(mp.term_label)} |`)
    lines.push(`| Status | ${cell(mp.status)} |`)
    if (mp.no_of_terms != null) lines.push(`| Terms served | ${mp.no_of_terms} |`)
    if (mp.age != null) lines.push(`| Age | ${mp.age} |`)
    if (mp.gender) lines.push(`| Gender | ${cell(mp.gender)} |`)
    if (mp.qualification) lines.push(`| Qualification | ${cell(mp.qualification)} |`)
    if (mp.profession) lines.push(`| Profession | ${cell(mp.profession)} |`)
    if (mp.is_minister) lines.push(`| Minister | yes${mp.minister_note ? ` — ${cell(mp.minister_note)}` : ""} |`)
    if (mp.constituency_label && mp.constituency_label !== c.pc_name) {
      lines.push(`| Constituency name at source | ${cell(mp.constituency_label)} |`)
    }
    if (mp.profile_url) lines.push(`| Official profile | [sansad.in](${mp.profile_url}) |`)
    lines.push("")
    if (mp.constituency_label && mp.constituency_label !== c.pc_name) {
      lines.push(`_sansad.in spells this seat "${cell(mp.constituency_label)}". The two names were matched by` +
        ` \`${cell(mp.pc_match_method, "an exact normalized match or a reviewed alias")}\` — never by similarity._`)
      lines.push("")
    }
  }
  lines.push("")

  // --- affidavit -----------------------------------------------------------
  lines.push("---")
  lines.push("")
  lines.push("## Declared record")
  lines.push("")
  if (!affidavit) {
    lines.push(AFFIDAVIT_PENDING)
    lines.push("")
    lines.push(`The underlying declarations are public at [myneta.info](https://myneta.info) in the meantime.`)
  } else {
    lines.push("From the winning candidate's Election Commission nomination affidavit. **Self-declared** — Kaun")
    lines.push("reproduces the declaration, it does not verify it.")
    lines.push("")
    lines.push("| Declared | Value |")
    lines.push("|---|---|")
    lines.push(`| Election | ${cell(affidavit.election)} |`)
    lines.push(`| Candidate as named on the affidavit | ${cell(affidavit.candidate_name)} |`)
    const cases = affidavit.criminal_cases
    lines.push(`| Pending criminal cases | ${cases === null || cases === undefined ? "not recorded" : cases > 0 ? `⚠ ${cases}` : "none declared"} |`)
    lines.push(`| Total assets | ${formatRupees(affidavit.total_assets_inr)} |`)
    lines.push(`| Liabilities | ${formatRupees(affidavit.liabilities_inr)} |`)
    if (affidavit.education_category || affidavit.education_detail) {
      lines.push(`| Education | ${cell(affidavit.education_category)}${affidavit.education_detail ? ` — ${cell(affidavit.education_detail)}` : ""} |`)
    }
    if (affidavit.self_profession) lines.push(`| Profession (self-declared) | ${cell(affidavit.self_profession)} |`)
    if (affidavit.age != null) lines.push(`| Age at nomination | ${affidavit.age} |`)
    if (affidavit.profile_url) lines.push(`| Affidavit source | [myneta.info](${affidavit.profile_url}) |`)
    lines.push("")
    if (cases && cases > 0) {
      lines.push("!!! warning \"A pending case is an accusation, not a conviction\"")
      lines.push("    These are cases the candidate declared as pending against them when filing nomination.")
      lines.push("    Indian law presumes innocence until conviction, and a count says nothing about the")
      lines.push("    seriousness of the charges or who brought them.")
      lines.push("")
    }
  }
  lines.push("")

  // --- activity ------------------------------------------------------------
  lines.push("---")
  lines.push("")
  lines.push("## In Parliament")
  lines.push("")
  const excluded = activity.filter(a => a.metrics_excluded)
  const usable = activity.filter(a => !a.metrics_excluded)
  if (mp?.is_minister || excluded.length > 0) {
    const reason = excluded[0]?.metrics_excluded_reason || mp?.minister_note || null
    lines.push("**Not recorded for ministers.**")
    lines.push("")
    lines.push(MINISTER_RULE)
    if (reason) {
      lines.push("")
      lines.push(`_Recorded reason: ${cell(reason)}._`)
    }
    if (usable.length > 0) {
      lines.push("")
      lines.push("Sessions in this term for which metrics **were** recorded:")
      lines.push("")
      lines.push(...activityTable(usable))
    }
  } else if (activity.length === 0) {
    lines.push("**Parliamentary activity has not been loaded for this seat yet.** The attendance, questions and")
    lines.push("debate figures come from PRS MP Track and sansad.in on a separate cadence to the roster; this")
    lines.push("section fills in on the next refresh once that pipeline has run.")
    lines.push("")
    lines.push("Nothing here is a zero. An absent figure is absent, and Kaun will not render it as 0 —")
    lines.push("that is the difference between \"not recorded\" and \"did nothing\".")
  } else {
    lines.push("Components, not a score. Kaun publishes what Parliament records and does not compose it into a")
    lines.push("single ranking — attendance, questions and debates measure different things and a weighted")
    lines.push("average of them measures none of them.")
    lines.push("")
    lines.push(...activityTable(activity))
  }
  lines.push("")

  // --- MPLADS --------------------------------------------------------------
  lines.push("---")
  lines.push("")
  lines.push("## Local area development funds (MPLADS)")
  lines.push("")
  if (mplads.length === 0) {
    lines.push("**MPLADS figures have not been loaded for this seat yet.** Each MP is entitled to recommend works")
    lines.push("worth ₹5 crore a year in their constituency; the allocation, the release and the unspent balance")
    lines.push("come from eSAKSHI (MoSPI) on a weekly cadence, and this section fills in once that pipeline has run.")
  } else {
    lines.push("| Source | Allocated | Spent | Unspent | Utilization | Works recommended | Sanctioned | Completed | As of |")
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---|")
    for (const m of mplads) {
      const label = m.source === "esakshi" ? "eSAKSHI (official)" : `${cell(m.source)} (unofficial)`
      lines.push(
        `| ${label} | ${formatRupees(m.allocated_inr)} | ${formatRupees(m.expenditure_inr)} | ${formatRupees(m.unspent_inr)} ` +
        `| ${formatPct(m.utilization_pct)} | ${cell(m.works_recommended)} | ${cell(m.works_sanctioned)} | ${cell(m.works_completed)} ` +
        `| ${m.captured_at ? String(m.captured_at).slice(0, 10) : "—"} |`,
      )
    }
    lines.push("")
    lines.push("_eSAKSHI is the official MPLADS portal and reports aggregates only. Where a second, unofficial")
    lines.push("row is present it is kept separate rather than merged, so every figure carries its own provenance._")
  }
  lines.push("")

  // --- central projects ----------------------------------------------------
  lines.push("---")
  lines.push("")
  lines.push(`## Central projects in ${c.state_name}`)
  lines.push("")
  lines.push(MOSPI_STATE_LEVEL_NOTE)
  lines.push("")
  if (projects.length === 0) {
    lines.push(`**No central projects loaded for ${c.state_name} yet.** MoSPI's Flash Report tracks every central`)
    lines.push("project of ₹150 crore or more and publishes monthly with a ~7–8 week lag; the first load is")
    lines.push("pending, or this state has no projects in the latest report Kaun holds.")
  } else {
    lines.push(`The ${projects.length} project${projects.length === 1 ? "" : "s"} in ${c.state_name} furthest above` +
      ` sanctioned cost${reportMonth ? `, as of the ${formatMonth(reportMonth)} report` : ""}.`)
    lines.push("")
    lines.push("| Project | Ministry | Sanctioned | Latest cost | Overrun | Schedule | Progress |")
    lines.push("|---|---|---:|---:|---:|---|---:|")
    for (const p of projects) {
      const stale = staleByCode?.get(p.project_code)
      const scheduleCell = p.schedule_slip_months != null
        ? formatSlip(p.schedule_slip_months)
        : stale?.months_unchanged != null ? `unchanged ${stale.months_unchanged} months` : "—"
      lines.push(
        `| [${cell(p.project_name)}](${projectUrl(p.project_code)}) | ${cell(p.ministry)} | ${formatCrore(p.original_cost_cr)} ` +
        `| ${formatCrore(p.revised_cost_cr)} | ${formatCroreDelta(p.cost_overrun_cr)} | ${scheduleCell} | ${formatPct(p.physical_progress_pct, 0)} |`,
      )
    }
    lines.push("")
    lines.push(`[All central projects, ranked and filterable →](../projects.md) · [on kaun.city →](${trackerUrl}?state=${c.st_code})`)
  }
  lines.push("")

  // --- footer --------------------------------------------------------------
  lines.push("---")
  lines.push("")
  lines.push(...sourcesFooter({
    seats: true,
    crosswalk: !!cw,
    roster: !!mp || former.length > 0,
    affidavit: !!affidavit,
    activity: activity.length > 0,
    mplads: mplads.length > 0,
    projects: projects.length > 0,
  }, crosswalk))
  lines.push(generatedLine())
  lines.push("")

  return lines.join("\n")
}

function activityTable(rows) {
  const lines = []
  lines.push("| Period | Sittings | Attended | Attendance | Questions | Debates | Private member bills | Committees |")
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|")
  for (const a of rows) {
    const period = a.period_kind === "term"
      ? `Term to date${a.session_label ? ` (${cell(a.session_label)})` : ""}`
      : cell(a.session_label ?? (a.session_no != null ? `Session ${a.session_no}` : null))
    lines.push(
      `| ${period} | ${cell(a.sittings_held)} | ${cell(a.signed_days)} | ${formatPct(a.attendance_pct)} ` +
      `| ${cell(a.questions_asked)} | ${cell(a.debates)} | ${cell(a.private_member_bills)} | ${cell(a.committees)} |`,
    )
  }
  lines.push("")
  lines.push("_A dash is a value the source does not record. It is never a zero._")
  return lines
}

// ---------------------------------------------------------------------------
// projects page
// ---------------------------------------------------------------------------

export function renderProjects({ tracked, reportMonth, totalOngoing, staleRows, staleMissing, changesMissing, stateNameByCode }) {
  const lines = []
  lines.push("# Central projects — cost overruns and stalled work")
  lines.push("")
  lines.push(generatedLine(reportMonth ? `Latest MoSPI report held: **${formatMonth(reportMonth)}**. ` : ""))
  lines.push("")
  lines.push("MoSPI's Flash Report tracks every central-sector project of **₹150 crore or more** — what it was")
  lines.push("sanctioned at, what it now costs, when it was meant to finish and when it now will. MoSPI")
  lines.push("publishes the current month; Kaun keeps every month, so what follows is change over time rather")
  lines.push("than a status snapshot.")
  lines.push("")
  lines.push(`**[Open the interactive tracker on kaun.city →](${trackerUrl})** to sort, filter by state and open`)
  lines.push("any project's full revision history.")
  lines.push("")
  lines.push("---")
  lines.push("")

  if (tracked.length === 0) {
    lines.push("## First monthly load pending")
    lines.push("")
    lines.push("**Kaun holds no MoSPI Flash Report data yet.** The tables below are generated from")
    lines.push("`in_central_projects` and `in_central_project_snapshots`; both are empty at the moment this page")
    lines.push("was generated, so there is nothing to rank.")
    lines.push("")
    lines.push("This is the expected state before the first monthly load. The parser is committed")
    lines.push(`([\`scripts/india/mospi/parse_flash_report.py\`](${REPO}/scripts/india/mospi/parse_flash_report.py))`)
    lines.push("and the loader runs monthly on the 5th; the page fills in on the first refresh after that.")
    lines.push("")
    if (changesMissing) {
      lines.push("!!! warning \"View not reachable\"")
      lines.push("    `v_in_central_project_changes` did not respond. It is created by")
      lines.push("    `migrate-india-schema`; until that migration is applied, the month-over-month diff cannot be")
      lines.push("    computed and this page cannot be more than a placeholder.")
      lines.push("")
    }
    lines.push("Nothing here is a zero — an empty ranking is an empty ranking, and Kaun will not publish a")
    lines.push("\"top overruns\" table whose rows do not exist.")
    lines.push("")
    lines.push("---")
    lines.push("")
    lines.push("## What this page will show")
    lines.push("")
    lines.push("- **Furthest above sanctioned cost** — projects ranked by revised cost minus original cost.")
    lines.push("- **Longest unchanged** — projects whose cost, completion date, expenditure and physical")
    lines.push("  progress have not moved for the most consecutive monthly reports. A project that stops")
    lines.push("  moving is the signal a monthly status report is least able to show.")
    lines.push("- **What changed in the latest report** — the cost revisions and schedule slips MoSPI published")
    lines.push("  this month, which is the diff MoSPI itself does not publish.")
    lines.push("")
    lines.push(...sourcesFooter({ projects: true }, null))
    return lines.join("\n") + "\n"
  }

  const withOverrun = tracked.filter(t => t.cost_overrun_cr != null && t.cost_overrun_cr > 0)
  const totalOverrun = withOverrun.reduce((s, t) => s + t.cost_overrun_cr, 0)
  const changed = tracked.filter(t => t.cost_revised || t.schedule_changed)
  const states = new Set(tracked.map(t => t.st_code).filter(v => v != null))

  lines.push("## Summary")
  lines.push("")
  lines.push(`- **Ongoing projects tracked:** ${groupIndian(totalOngoing)}${reportMonth ? ` in the ${formatMonth(reportMonth)} report` : ""}`)
  lines.push(`- **Above sanctioned cost:** ${groupIndian(withOverrun.length)} project${withOverrun.length === 1 ? "" : "s"}, ${formatCrore(totalOverrun)} in total`)
  lines.push(`- **States and UTs represented:** ${states.size}`)
  lines.push(`- **Moved in this report:** ${groupIndian(changed.length)} project${changed.length === 1 ? "" : "s"} had a cost or schedule revision`)
  lines.push("")
  lines.push("---")
  lines.push("")

  // --- top overruns --------------------------------------------------------
  const byOverrun = [...tracked]
    .filter(t => t.cost_overrun_cr != null)
    .sort((a, b) => b.cost_overrun_cr - a.cost_overrun_cr)
    .slice(0, TRACKER_ROWS)

  lines.push(`## Furthest above sanctioned cost (top ${byOverrun.length})`)
  lines.push("")
  if (byOverrun.length === 0) {
    lines.push("No project in the latest report carries both an original and a revised cost, so no overrun can")
    lines.push("be computed. This is a gap in the source month, not a claim that nothing is over budget.")
  } else {
    lines.push("| # | Project | Ministry | State | Sanctioned | Latest cost | Overrun | Schedule | Progress |")
    lines.push("|---:|---|---|---|---:|---:|---:|---|---:|")
    byOverrun.forEach((p, i) => {
      lines.push(
        `| ${i + 1} | [${cell(p.project_name)}](${projectUrl(p.project_code)}) | ${cell(p.ministry)} ` +
        `| ${cell(stateLabel(p, stateNameByCode))} | ${formatCrore(p.original_cost_cr)} | ${formatCrore(p.revised_cost_cr)} ` +
        `| ${formatCroreDelta(p.cost_overrun_cr)} | ${formatSlip(p.schedule_slip_months)} | ${formatPct(p.physical_progress_pct, 0)} |`,
      )
    })
  }
  lines.push("")
  lines.push("---")
  lines.push("")

  // --- longest stalled -----------------------------------------------------
  lines.push(`## Longest unchanged`)
  lines.push("")
  if (staleMissing) {
    lines.push("!!! note \"Ranked on schedule slip, not on staleness\"")
    lines.push("    The `v_in_central_project_staleness` view is not present in the database yet — it is created")
    lines.push("    by the one-off `migrate-india-project-staleness` workflow. Until it is applied, \"how many")
    lines.push("    consecutive reports has this project not moved in\" cannot be computed over the full history,")
    lines.push("    so this table falls back to the furthest-behind-schedule ranking, which the latest month's")
    lines.push("    rows do support. The two are not the same question and this page does not pretend otherwise.")
    lines.push("")
    const bySlip = [...tracked]
      .filter(t => t.schedule_slip_months != null)
      .sort((a, b) => b.schedule_slip_months - a.schedule_slip_months)
      .slice(0, TRACKER_ROWS)
    if (bySlip.length === 0) {
      lines.push("No project in the latest report carries both an original and a revised completion date, so no")
      lines.push("slip can be computed.")
    } else {
      lines.push(`Furthest behind the originally-promised completion date (top ${bySlip.length}).`)
      lines.push("")
      lines.push("| # | Project | Ministry | State | Schedule | Latest cost | Overrun | Progress |")
      lines.push("|---:|---|---|---|---|---:|---:|---:|")
      bySlip.forEach((p, i) => {
        lines.push(
          `| ${i + 1} | [${cell(p.project_name)}](${projectUrl(p.project_code)}) | ${cell(p.ministry)} ` +
          `| ${cell(stateLabel(p, stateNameByCode))} | ${formatSlip(p.schedule_slip_months)} | ${formatCrore(p.revised_cost_cr)} ` +
          `| ${formatCroreDelta(p.cost_overrun_cr)} | ${formatPct(p.physical_progress_pct, 0)} |`,
        )
      })
    }
  } else {
    const identity = new Map(tracked.map(t => [t.project_code, t]))
    const stalled = staleRows
      .filter(s => s.is_in_latest_report && s.months_unchanged != null && identity.has(s.project_code))
      .sort((a, b) => b.months_unchanged - a.months_unchanged)
      .slice(0, TRACKER_ROWS)
    if (stalled.length === 0) {
      lines.push("Kaun holds too few monthly reports to rank projects by how long they have sat still — with a")
      lines.push("single month there is nothing to compare against. This table fills in from the second monthly")
      lines.push("load onward.")
    } else {
      lines.push("Projects whose cost, completion date, expenditure and physical progress have not moved across")
      lines.push("the most consecutive monthly reports. Only projects still present in the latest report are")
      lines.push("ranked — a completed project that drops out of the report stops accruing staleness and would")
      lines.push("otherwise sit permanently at the top.")
      lines.push("")
      lines.push("| # | Project | Ministry | State | Unchanged for | Last moved | Reports held | Progress | Overrun |")
      lines.push("|---:|---|---|---|---:|---|---:|---:|---:|")
      stalled.forEach((s, i) => {
        const p = identity.get(s.project_code)
        lines.push(
          `| ${i + 1} | [${cell(p.project_name)}](${projectUrl(p.project_code)}) | ${cell(p.ministry)} ` +
          `| ${cell(stateLabel(p, stateNameByCode))} | ${s.months_unchanged} months | ${formatMonth(s.last_change_month)} ` +
          `| ${cell(s.snapshot_count)} | ${formatPct(s.latest_physical_progress_pct, 0)} | ${formatCroreDelta(s.latest_cost_overrun_cr)} |`,
        )
      })
    }
  }
  lines.push("")
  lines.push("---")
  lines.push("")

  // --- what changed --------------------------------------------------------
  lines.push("## What changed in the latest report")
  lines.push("")
  if (changed.length === 0) {
    lines.push("No project's cost or completion date moved between the previous report Kaun holds and this one —")
    lines.push("or this is the first report held, in which case there is nothing to diff against. Either way it is")
    lines.push("stated rather than left to be inferred from an empty table.")
  } else {
    const shown = changed.slice(0, TRACKER_ROWS)
    lines.push(`${groupIndian(changed.length)} project${changed.length === 1 ? "" : "s"} moved` +
      `${reportMonth ? ` in the ${formatMonth(reportMonth)} report` : ""}` +
      `${shown.length < changed.length ? `; the first ${shown.length} are listed` : ""}.`)
    lines.push("")
    lines.push("| Project | Ministry | State | What moved | Cost now | Completion now |")
    lines.push("|---|---|---|---|---:|---|")
    for (const p of shown) {
      const what = [p.cost_revised ? "cost revised" : null, p.schedule_changed ? "schedule changed" : null]
        .filter(Boolean).join(" · ")
      lines.push(
        `| [${cell(p.project_name)}](${projectUrl(p.project_code)}) | ${cell(p.ministry)} | ${cell(stateLabel(p, stateNameByCode))} ` +
        `| ${what} | ${formatCrore(p.revised_cost_cr)} | ${formatMonth(p.revised_doc_month)} |`,
      )
    }
  }
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## Reading these tables")
  lines.push("")
  lines.push("- **Sanctioned** is the originally-approved cost; **latest cost** is the most recent revision")
  lines.push("  MoSPI reports. The overrun is the difference, and it is a *reported* difference, not an audit.")
  lines.push("- **Schedule** compares the original commissioning month with the current one. A negative slip —")
  lines.push("  finishing earlier than first promised — does occur and is shown as such rather than clamped to zero.")
  lines.push("- A dash means the source does not carry that field for that project in that month.")
  lines.push("- Projects spanning more than one state carry no state code by design, and are shown as multi-state")
  lines.push("  rather than filed under a guessed one.")
  lines.push("")
  lines.push(...sourcesFooter({ projects: true }, null))
  return lines.join("\n") + "\n"
}

function stateLabel(p, stateNameByCode) {
  if (p.is_multi_state || p.st_code == null) return "multi-state"
  return stateNameByCode?.get(p.st_code) ?? p.state_raw ?? `state ${p.st_code}`
}

// ---------------------------------------------------------------------------
// fold: identity + latest change, the same join lib/india/api.ts does
// ---------------------------------------------------------------------------

export function foldTracked(projects, latestChanges) {
  const identity = new Map(projects.map(p => [p.project_code, p]))
  const out = []
  for (const change of latestChanges) {
    const p = identity.get(change.project_code)
    if (!p) continue
    out.push({
      ...p,
      ...change,
      original_cost_cr:
        change.revised_cost_cr != null && change.cost_overrun_cr != null
          ? Number((change.revised_cost_cr - change.cost_overrun_cr).toFixed(2))
          : null,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  assertAnonKey(SUPABASE_ANON_KEY)
  const limit = intOpt("limit", null)
  console.log(`india-index — reading ${SUPABASE_URL} as anon${limit ? ` (--limit ${limit})` : ""}`)

  const crosswalk = loadCrosswalk()
  if (crosswalk.missing) {
    console.warn(`  ! ${CROSSWALK_PATH} is absent — assembly segments will be omitted`)
  } else {
    console.log(`  crosswalk: ${crosswalk.byPc.size} seats, version ${crosswalk.version}`)
  }

  // --- read ----------------------------------------------------------------
  const { rows: constituencies } = await fetchTable("in_constituencies", {
    select: C_COLS, order: "st_code.asc,pc_no.asc",
  })
  if (constituencies.length === 0) {
    throw new Error(
      "in_constituencies returned no rows. Refusing to regenerate — that would delete every seat page " +
      "over what is almost certainly a transient read failure. Nothing was written.",
    )
  }

  // Every Lok Sabha row, not only the sitting ones. A seat whose member died or
  // resigned is vacant, and "vacant, previously X" is a materially different
  // fact from "no data" — the schema keeps bypoll predecessors precisely so
  // that distinction survives, and the pages honour it.
  const { rows: allLsMps } = await fetchTable("in_mps", {
    select: MP_COLS + ",pc_match_method", house: "eq.LS", order: "pc_code.asc",
  })
  const mps = allLsMps.filter(m => m.status === "Sitting")
  const formerMps = allLsMps.filter(m => m.status !== "Sitting")
  const unresolvedMps = mps.filter(m => !m.pc_code)
  const { rows: affidavits } = await fetchTable("in_mp_affidavits", {
    select: AFF_COLS, is_winner: "eq.true", order: "election.desc",
  })
  const { rows: activityRows } = await fetchTable("in_mp_activity", {
    select: ACT_COLS, order: "period_kind.asc,session_no.desc",
  })
  const { rows: mpladsRows } = await fetchTable("in_mplads_summary", {
    select: MPLADS_COLS, order: "source.asc,captured_at.desc",
  })
  const { rows: projectRows } = await fetchTable("in_central_projects", {
    select: PROJ_COLS, is_ongoing: "eq.true", order: "project_code.asc",
  })
  const { rows: latestMonthRow, missing: changesMissing } = await fetchTable("v_in_central_project_changes", {
    select: "report_month", order: "report_month.desc", limit: "1",
  })
  const reportMonth = latestMonthRow[0]?.report_month ?? null
  const { rows: changeRows } = reportMonth
    ? await fetchTable("v_in_central_project_changes", {
      select: CHANGE_COLS, report_month: `eq.${reportMonth}`, order: "project_code.asc",
    })
    : { rows: [] }
  const { rows: staleRows, missing: staleMissing } = await fetchTable("v_in_central_project_staleness", {
    select: STALE_COLS, order: "months_unchanged.desc",
  })

  console.log(
    `  read: ${constituencies.length} seats · ${mps.length} sitting LS MPs · ${affidavits.length} public affidavits · ` +
    `${activityRows.length} activity rows · ${mpladsRows.length} MPLADS rows · ${projectRows.length} ongoing projects · ` +
    `${changeRows.length} change rows${reportMonth ? ` (${reportMonth})` : ""}` +
    `${staleMissing ? " · staleness view ABSENT" : ` · ${staleRows.length} staleness rows`}`,
  )

  // --- index by key --------------------------------------------------------
  const mpByPc = new Map()
  for (const m of mps) if (m.pc_code) mpByPc.set(m.pc_code, m)

  const formerByPc = new Map()
  for (const m of formerMps) {
    if (!m.pc_code || mpByPc.has(m.pc_code)) continue
    if (!formerByPc.has(m.pc_code)) formerByPc.set(m.pc_code, [])
    formerByPc.get(m.pc_code).push(m)
  }

  const affidavitByPc = new Map()
  for (const a of affidavits) if (a.pc_code && !affidavitByPc.has(a.pc_code)) affidavitByPc.set(a.pc_code, a)

  const activityByMp = new Map()
  for (const a of activityRows) {
    if (!activityByMp.has(a.mp_id)) activityByMp.set(a.mp_id, [])
    activityByMp.get(a.mp_id).push(a)
  }

  const mpladsByPc = new Map()
  for (const m of mpladsRows) {
    if (!m.pc_code) continue
    if (!mpladsByPc.has(m.pc_code)) mpladsByPc.set(m.pc_code, [])
    mpladsByPc.get(m.pc_code).push(m)
  }

  const stateNameByCode = new Map()
  for (const c of constituencies) if (!stateNameByCode.has(c.st_code)) stateNameByCode.set(c.st_code, c.state_name)

  const tracked = foldTracked(projectRows, changeRows)
  const staleByCode = new Map(staleRows.map(s => [s.project_code, s]))
  const trackedByState = new Map()
  for (const t of tracked) {
    if (t.st_code == null || t.is_multi_state) continue
    if (!trackedByState.has(t.st_code)) trackedByState.set(t.st_code, [])
    trackedByState.get(t.st_code).push(t)
  }
  for (const arr of trackedByState.values()) {
    arr.sort((a, b) => (b.cost_overrun_cr ?? -Infinity) - (a.cost_overrun_cr ?? -Infinity))
  }

  // --- coverage ------------------------------------------------------------
  const coverage = [
    { label: "Seats, boundaries and reservation", table: "in_constituencies", count: constituencies.length,
      status: constituencies.length === 543 ? "complete — all 543 seats" : `partial — ${constituencies.length} of 543` },
    { label: "Sitting MPs (18th Lok Sabha)", table: "in_mps", count: mps.length,
      status: mps.length === 0
        ? "**not loaded yet**"
        : `${mpByPc.size} seats matched to a sitting MP` +
          (unresolvedMps.length ? ` · ${unresolvedMps.length} awaiting a reviewed alias row` : "") +
          (formerByPc.size ? ` · ${formerByPc.size} vacant` : "") },
    { label: "Nomination affidavits (publicly cleared)", table: "in_mp_affidavits", count: affidavits.length,
      status: affidavits.length === 0 ? "**none cleared for publication yet** — rows exist only after human review" : `${affidavitByPc.size} seats` },
    { label: "Parliamentary activity", table: "in_mp_activity", count: activityRows.length,
      status: activityRows.length === 0 ? "**not loaded yet**" : `${activityByMp.size} MPs` },
    { label: "MPLADS allocation and spend", table: "in_mplads_summary", count: mpladsRows.length,
      status: mpladsRows.length === 0 ? "**not loaded yet**" : `${mpladsByPc.size} seats` },
    { label: "Central projects ≥ ₹150 Cr", table: "in_central_projects", count: projectRows.length,
      status: projectRows.length === 0 ? "**first monthly load pending**" : `latest report held: ${formatMonth(reportMonth)}` },
  ]

  // --- write ---------------------------------------------------------------
  mkdirSync(SEATS_DIR, { recursive: true })
  for (const name of readdirSync(SEATS_DIR)) {
    if (name === "index.md" || name === "_template.md") continue
    if (name.endsWith(".md")) unlinkSync(join(SEATS_DIR, name))
  }

  writeFileSync(INDEX_PATH, renderIndex({
    constituencies, mpByPc, formerByPc, affidavitByPc, crosswalk, coverage, unresolvedMps,
  }))
  console.log(`  wrote ${INDEX_PATH}`)

  const seats = limit ? constituencies.slice(0, limit) : constituencies
  const stats = { pages: 0, mp: 0, affidavit: 0, activity: 0, minister: 0, mplads: 0, projects: 0, noCrosswalk: 0, vacant: 0 }
  for (const c of seats) {
    const cw = crosswalk.byPc.get(c.pc_code) ?? null
    const mp = mpByPc.get(c.pc_code) ?? null
    const former = formerByPc.get(c.pc_code) ?? []
    const affidavit = affidavitByPc.get(c.pc_code) ?? null
    const activity = mp ? (activityByMp.get(mp.id) ?? []) : []
    const mplads = mpladsByPc.get(c.pc_code) ?? []
    const projects = (trackedByState.get(c.st_code) ?? []).slice(0, PC_PROJECTS_LIMIT)

    if (!cw) stats.noCrosswalk++
    if (mp) stats.mp++
    else if (former.length) stats.vacant++
    if (mp?.is_minister) stats.minister++
    if (affidavit) stats.affidavit++
    if (activity.length) stats.activity++
    if (mplads.length) stats.mplads++
    if (projects.length) stats.projects++

    writeFileSync(
      join(SEATS_DIR, seatFilename(c)),
      renderSeat({
        c, cw, mp, former, affidavit, activity, mplads, projects, reportMonth, crosswalk, staleByCode,
        unresolvedCount: unresolvedMps.length,
      }),
    )
    stats.pages++
  }
  console.log(`  wrote ${stats.pages} seat pages`)
  console.log(`    ${stats.mp} with a sitting MP (${stats.minister} ministers) · ${stats.vacant} vacant · ${stats.affidavit} with a public affidavit`)
  console.log(`    ${stats.activity} with parliamentary activity · ${stats.mplads} with MPLADS · ${stats.projects} with state projects`)
  if (stats.noCrosswalk) console.log(`    ! ${stats.noCrosswalk} seats absent from the crosswalk artifact`)

  writeFileSync(PROJECTS_PATH, renderProjects({
    tracked, reportMonth, totalOngoing: projectRows.length, staleRows, staleMissing, changesMissing, stateNameByCode,
  }))
  console.log(`  wrote ${PROJECTS_PATH} (${tracked.length} tracked project rows)`)
}

run(main, import.meta.url)
