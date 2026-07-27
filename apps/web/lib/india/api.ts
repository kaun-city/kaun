/**
 * India layer read path.
 *
 * ONE PATH, DELIBERATELY. The ward-crosswalk work left a trap worth not
 * repeating: kaun.city has two ways to read data — the interactive UI talks to
 * Supabase PostgREST directly with the anon key (lib/api.ts -> lib/supabase.ts),
 * while /api/data/* exists separately for third parties. They drifted, and a fix
 * applied to one did not reach the other.
 *
 * So the India surface has exactly one read module: this one. It uses the same
 * query() helper as lib/api.ts — through cachedQuery() below, which is the one
 * place caching is turned on — and both the server components (constituency
 * page) and the client components (map, tracker) call these same functions.
 * There is no /api/data/india/* route in this PR; when one is wanted for third
 * parties it must be a thin wrapper over these functions, not a second
 * implementation.
 *
 * RLS. Every table is anon-SELECT under the policies in
 * scripts/migrate-india-schema.mjs. in_mp_affidavits is the row-restricted one:
 * PostgREST will only ever return rows with needs_review=false and
 * parse_status='ok', so an unreviewed MyNeta↔PC join cannot reach a page. The
 * filters below do not re-state that — the database is the enforcement point,
 * not this file.
 *
 * FIXTURE MODE. isFixtureMode() short-circuits each function to the committed
 * fixtures. The shaping code below the fetch (folding snapshots into tracked
 * projects, ordering activity rows) is shared by both paths, so fixture mode
 * exercises the real derivation rather than a parallel one.
 */
import { query as rawQuery } from "../supabase"
import { INDIA_REVALIDATE_SECONDS } from "./constants"
import { monthsBetween } from "./format"
import type { IndiaLayerId } from "./layers"
import type {
  CentralProject, CentralProjectChange, Constituency, ConstituencyProfile,
  Mp, MpActivity, MpAffidavit, MpladsSummary, TrackedProject,
} from "./types"
import {
  isFixtureMode, FIXTURE_ACTIVITY, FIXTURE_AFFIDAVITS, FIXTURE_CONSTITUENCIES,
  FIXTURE_MPLADS, FIXTURE_MPS, FIXTURE_PROJECTS, FIXTURE_SNAPSHOTS,
  type FixtureSnapshot,
} from "./fixtures"

/**
 * Every read below goes through here rather than through query() directly.
 *
 * WHY THE WHOLE MODULE IS CACHED AND NOTHING ELSE IS. These tables are written
 * by the refresh crons — the MP roster weekly, MoSPI and MPLADS monthly,
 * affidavits by hand. Nothing a visitor can do changes a row, so a read is
 * either identical to the last one or up to INDIA_REVALIDATE_SECONDS behind a
 * file that arrives twelve times a year. Caching it is not a trade-off here;
 * an uncached read is simply the same query asked again.
 *
 * What this buys, concretely, on a constituency page: the profile is seven
 * round trips to Supabase, of which the four behind "central projects in this
 * state" are shared by every seat in that state, and generateMetadata asks for
 * the whole profile a second time to build the title. All of it collapses onto
 * one cache entry per distinct query.
 *
 * The Data Cache is keyed on the full request URL, so the state-scoped project
 * queries are shared across seats automatically and nothing needs a key of its
 * own. Mutations do not pass through this module at all.
 */
function cachedQuery<T = unknown>(
  table: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  return rawQuery<T>(table, params, { revalidate: INDIA_REVALIDATE_SECONDS })
}

/** How many state projects the constituency page lists before "see all". */
export const PC_PROJECTS_LIMIT = 8
/** How many rows the tracker requests. Sorting happens in Postgres. */
export const TRACKER_LIMIT = 200

const C_COLS = "pc_code,st_code,pc_no,state_name,pc_name,pc_name_hi,reserved_for,reserved_source,wikidata_qid,geom_source,data_source,updated_at"
const MP_COLS = "id,mpsno,house,term_label,pc_code,state_name,constituency_label,name,party_abbr,party_full,gender,age,no_of_terms,qualification,profession,status,is_minister,minister_note,profile_url,data_source,updated_at"
const AFF_COLS = "id,election,candidate_name,party_abbr,age,self_profession,education_category,education_detail,criminal_cases,total_assets_inr,liabilities_inr,declared_assets_history,profile_url,data_source,updated_at"
const ACT_COLS = "id,period_kind,session_no,session_label,sittings_held,signed_days,attendance_pct,questions_asked,debates,private_member_bills,committees,metrics_excluded,metrics_excluded_reason,data_source"
const MPLADS_COLS = "id,source,house,term_label,allocated_inr,expenditure_inr,unspent_inr,utilization_pct,works_recommended,works_sanctioned,works_completed,captured_at,data_source"
const PROJ_COLS = "project_code,legacy_ocms_code,pmgid,project_name,ministry,sector,agency,state_raw,st_code,is_multi_state,first_seen_month,last_seen_month,is_ongoing"
const CHANGE_COLS = "project_code,report_month,prev_report_month,revised_cost_cr,prev_revised_cost_cr,revised_doc_month,prev_revised_doc_month,cumulative_expenditure_cr,physical_progress_pct,cost_overrun_cr,schedule_slip_months,cost_revised,schedule_changed"

// ---------------------------------------------------------------------------
// constituency
// ---------------------------------------------------------------------------

export async function fetchConstituency(pcCode: string): Promise<Constituency | null> {
  if (isFixtureMode()) {
    return FIXTURE_CONSTITUENCIES.find(c => c.pc_code === pcCode) ?? null
  }
  const rows = await cachedQuery<Constituency>("in_constituencies", {
    pc_code: `eq.${pcCode}`, select: C_COLS, limit: "1",
  })
  return rows[0] ?? null
}

/**
 * The sitting MP. status=Sitting is what the partial unique index
 * in_mps_one_sitting_per_pc guarantees at most one of — so a seat whose MP has
 * died or resigned correctly returns null (3 seats were vacant at recon time)
 * rather than surfacing the predecessor as current.
 */
export async function fetchSittingMp(pcCode: string): Promise<Mp | null> {
  if (isFixtureMode()) {
    return FIXTURE_MPS.find(m => m.pc_code === pcCode && m.status === "Sitting") ?? null
  }
  const rows = await cachedQuery<Mp>("in_mps", {
    pc_code: `eq.${pcCode}`, house: "eq.LS", status: "eq.Sitting",
    select: MP_COLS, limit: "1",
  })
  return rows[0] ?? null
}

/**
 * The winning candidate's affidavit for this seat.
 * is_winner=true + the one-winner-per-PC unique index means this is at most
 * one row. Losing candidates, if ever loaded, are not surfaced here.
 */
export async function fetchAffidavit(pcCode: string): Promise<MpAffidavit | null> {
  if (isFixtureMode()) return FIXTURE_AFFIDAVITS[pcCode] ?? null
  const rows = await cachedQuery<MpAffidavit>("in_mp_affidavits", {
    pc_code: `eq.${pcCode}`, is_winner: "eq.true",
    select: AFF_COLS, order: "election.desc", limit: "1",
  })
  return rows[0] ?? null
}

/** Term-cumulative row first, then sessions newest-first. */
export async function fetchActivity(mpId: number, pcCode: string): Promise<MpActivity[]> {
  if (isFixtureMode()) return FIXTURE_ACTIVITY[pcCode] ?? []
  return await cachedQuery<MpActivity>("in_mp_activity", {
    mp_id: `eq.${mpId}`, select: ACT_COLS, order: "period_kind.asc,session_no.desc",
  })
}

/** eSAKSHI first — it is the official source; Empowered Indian is unofficial. */
export async function fetchMplads(pcCode: string): Promise<MpladsSummary[]> {
  if (isFixtureMode()) return FIXTURE_MPLADS[pcCode] ?? []
  return await cachedQuery<MpladsSummary>("in_mplads_summary", {
    pc_code: `eq.${pcCode}`, select: MPLADS_COLS, order: "source.asc,captured_at.desc",
  })
}

// ---------------------------------------------------------------------------
// central projects
// ---------------------------------------------------------------------------

/**
 * Latest report month present in the snapshots. One row, one round trip; every
 * tracker query keys off it so the whole page describes a single MoSPI report
 * rather than mixing months.
 */
export async function fetchLatestReportMonth(): Promise<string | null> {
  if (isFixtureMode()) {
    return FIXTURE_SNAPSHOTS.reduce<string | null>(
      (max, s) => (max === null || s.report_month > max ? s.report_month : max), null)
  }
  const rows = await cachedQuery<{ report_month: string }>("v_in_central_project_changes", {
    select: "report_month", order: "report_month.desc", limit: "1",
  })
  return rows[0]?.report_month ?? null
}

export type TrackerSort = "cost_overrun" | "schedule_slip" | "stale" | "cost"

const SORT_ORDER: Record<TrackerSort, string> = {
  cost_overrun: "cost_overrun_cr.desc.nullslast",
  schedule_slip: "schedule_slip_months.desc.nullslast",
  cost: "revised_cost_cr.desc.nullslast",
  // "months since last change" is derived across months and cannot be ordered
  // in this query; the rows are re-sorted after the fold. Cost overrun is the
  // stable secondary key so the fetched window is deterministic.
  stale: "cost_overrun_cr.desc.nullslast",
}

/**
 * v_in_central_project_changes computes the month-over-month diff in Postgres
 * (LAG per project_code). This reads the latest month's row per project and
 * joins it to project identity.
 *
 * FOUR ROUND TRIPS, NOT A JOIN. PostgREST can only embed across a declared
 * foreign key and a view has none, so identity and change rows are fetched
 * separately and folded here. The alternative — a database function — is a
 * schema change, and the schema is a sibling PR's to own.
 */
export async function fetchTrackedProjects(opts: {
  stCode?: number | null
  sort?: TrackerSort
  limit?: number
} = {}): Promise<{ rows: TrackedProject[]; reportMonth: string | null; total: number }> {
  const sort = opts.sort ?? "cost_overrun"
  const limit = opts.limit ?? TRACKER_LIMIT
  const reportMonth = await fetchLatestReportMonth()
  if (!reportMonth) return { rows: [], reportMonth: null, total: 0 }

  if (isFixtureMode()) {
    const projects = opts.stCode == null
      ? FIXTURE_PROJECTS
      : FIXTURE_PROJECTS.filter(p => p.st_code === opts.stCode)
    const codes = new Set(projects.map(p => p.project_code))
    const changes = changesFromSnapshots(FIXTURE_SNAPSHOTS.filter(s => codes.has(s.project_code)))
    const rows = foldTracked(
      projects,
      changes.filter(c => c.report_month === reportMonth),
      changes.filter(c => c.cost_revised || c.schedule_changed),
      reportMonth,
    )
    return { rows: sortTracked(rows, sort).slice(0, limit), reportMonth, total: projects.length }
  }

  // 1. project identity for the selected scope
  const identityParams: Record<string, string> = {
    select: PROJ_COLS, is_ongoing: "eq.true", order: "project_code.asc",
  }
  if (opts.stCode != null) identityParams["st_code"] = `eq.${opts.stCode}`
  const projects = await cachedQuery<CentralProject>("in_central_projects", identityParams)
  if (projects.length === 0) return { rows: [], reportMonth, total: 0 }

  // 2. latest month's change row for those projects, ordered by the metric
  const codeList = `(${projects.map(p => p.project_code).join(",")})`
  const latest = await cachedQuery<CentralProjectChange>("v_in_central_project_changes", {
    report_month: `eq.${reportMonth}`, project_code: `in.${codeList}`,
    select: CHANGE_COLS, order: SORT_ORDER[sort], limit: String(limit),
  })

  // 3. every month in which those projects actually moved, for "months since
  //    last change". Only the two boolean flags are filtered on, so this stays
  //    a small result even over a long history.
  const windowCodes = `(${latest.map(r => r.project_code).join(",")})`
  const moved = latest.length === 0 ? [] : await cachedQuery<CentralProjectChange>("v_in_central_project_changes", {
    project_code: `in.${windowCodes}`,
    or: "(cost_revised.is.true,schedule_changed.is.true)",
    select: "project_code,report_month,cost_revised,schedule_changed",
    order: "report_month.desc",
  })

  const rows = foldTracked(projects, latest, moved, reportMonth)
  return { rows: sortTracked(rows, sort), reportMonth, total: projects.length }
}

/**
 * Central projects for a constituency's state.
 *
 * MoSPI publishes Table 6 with a STATE column and nothing finer — no district,
 * no constituency, no coordinates (verified across the March, April and May
 * 2026 reports: 1,987 / 1,981 / 1,941 rows, none carrying a district). So these
 * are state-level facts shown on a constituency page, and the card says exactly
 * that. Inferring a district from a project's name is the kind of name matching
 * this codebase refuses to do anywhere else, and it is not done here either.
 *
 * When the PC↔district crosswalk (sibling PR #64) lands it will let Kaun narrow
 * this the day MoSPI publishes anything below state level — not before.
 */
export async function fetchProjectsForConstituency(
  stCode: number, limit = PC_PROJECTS_LIMIT,
): Promise<{ rows: TrackedProject[]; reportMonth: string | null; total: number }> {
  return await fetchTrackedProjects({ stCode, sort: "cost_overrun", limit })
}

// ---------------------------------------------------------------------------
// shaping — shared by the live and fixture paths
// ---------------------------------------------------------------------------

/**
 * The fixture-mode stand-in for v_in_central_project_changes.
 *
 * Reproduces the view's semantics exactly: LAG over report_month partitioned by
 * project_code, with cost_revised / schedule_changed false on a project's first
 * month (no previous row to differ from). Live mode never calls this — it reads
 * the real view — but keeping the definition here in one readable place is what
 * makes the fixtures a faithful preview rather than an approximation.
 */
export function changesFromSnapshots(snapshots: FixtureSnapshot[]): CentralProjectChange[] {
  const byProject = new Map<string, FixtureSnapshot[]>()
  for (const s of snapshots) {
    const list = byProject.get(s.project_code) ?? []
    list.push(s)
    byProject.set(s.project_code, list)
  }
  const out: CentralProjectChange[] = []
  for (const [code, list] of byProject) {
    list.sort((a, b) => a.report_month.localeCompare(b.report_month))
    list.forEach((s, i) => {
      const prev = i > 0 ? list[i - 1] : null
      const overrun = s.revised_cost_cr !== null && s.original_cost_cr !== null
        ? Number((s.revised_cost_cr - s.original_cost_cr).toFixed(2))
        : null
      const prevOverrun = prev && prev.revised_cost_cr !== null && prev.original_cost_cr !== null
        ? Number((prev.revised_cost_cr - prev.original_cost_cr).toFixed(2))
        : null
      out.push({
        project_code: code,
        report_month: s.report_month,
        prev_report_month: prev?.report_month ?? null,
        revised_cost_cr: s.revised_cost_cr,
        prev_revised_cost_cr: prev?.revised_cost_cr ?? null,
        revised_doc_month: s.revised_doc_month,
        prev_revised_doc_month: prev?.revised_doc_month ?? null,
        cumulative_expenditure_cr: s.cumulative_expenditure_cr,
        physical_progress_pct: s.physical_progress_pct,
        cost_overrun_cr: overrun,
        schedule_slip_months: monthsBetween(s.original_doc_month, s.revised_doc_month),
        cost_revised: prev !== null && s.revised_cost_cr !== prev.revised_cost_cr,
        schedule_changed: prev !== null && s.revised_doc_month !== prev.revised_doc_month,
        // carried for the fold; not part of the view's own column list
        ...(prevOverrun !== null ? { prev_cost_overrun_cr: prevOverrun } : {}),
      } as CentralProjectChange)
    })
  }
  return out
}

/** Join identity + latest change + change history into what the UI renders. */
export function foldTracked(
  projects: CentralProject[],
  latest: CentralProjectChange[],
  moved: Pick<CentralProjectChange, "project_code" | "report_month">[],
  reportMonth: string,
): TrackedProject[] {
  const identity = new Map(projects.map(p => [p.project_code, p]))
  /** Most recent month in which each project's cost or schedule moved. */
  const lastMove = new Map<string, string>()
  for (const m of moved) {
    const cur = lastMove.get(m.project_code)
    if (!cur || m.report_month > cur) lastMove.set(m.project_code, m.report_month)
  }

  const out: TrackedProject[] = []
  for (const change of latest) {
    const p = identity.get(change.project_code)
    if (!p) continue
    const moveMonth = lastMove.get(change.project_code) ?? null
    out.push({
      ...p,
      ...change,
      months_since_last_change: monthsBetween(moveMonth, reportMonth),
      original_cost_cr: change.revised_cost_cr !== null && change.cost_overrun_cr !== null
        ? Number((change.revised_cost_cr - change.cost_overrun_cr).toFixed(2))
        : null,
    })
  }
  return out
}

/** Nulls always sort last: "not recorded" is never the top of a ranking. */
function nullsLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

export function sortTracked(rows: TrackedProject[], sort: TrackerSort): TrackedProject[] {
  const copy = [...rows]
  switch (sort) {
    case "schedule_slip":
      return copy.sort((a, b) => nullsLast(a.schedule_slip_months, b.schedule_slip_months))
    case "cost":
      return copy.sort((a, b) => nullsLast(a.revised_cost_cr, b.revised_cost_cr))
    case "stale":
      return copy.sort((a, b) => nullsLast(a.months_since_last_change, b.months_since_last_change))
    case "cost_overrun":
    default:
      return copy.sort((a, b) => nullsLast(a.cost_overrun_cr, b.cost_overrun_cr))
  }
}

// ---------------------------------------------------------------------------
// the constituency page's single entry point
// ---------------------------------------------------------------------------

export async function fetchConstituencyProfile(pcCode: string): Promise<ConstituencyProfile | null> {
  const constituency = await fetchConstituency(pcCode)
  if (!constituency) return null

  const [mp, affidavit, mplads] = await Promise.all([
    fetchSittingMp(pcCode),
    fetchAffidavit(pcCode),
    fetchMplads(pcCode),
  ])
  const [activity, projects] = await Promise.all([
    mp ? fetchActivity(mp.id, pcCode) : Promise.resolve([] as MpActivity[]),
    fetchProjectsForConstituency(constituency.st_code),
  ])

  return {
    constituency,
    mp,
    affidavit,
    activity,
    mplads,
    projects: projects.rows,
    projectsTotal: projects.total,
  }
}

/**
 * States that have central projects, with counts, for the tracker's filter.
 *
 * PostgREST has no DISTINCT, so this reads the two identity columns for every
 * ongoing project and counts here. ~2,000 two-field rows; it runs on the
 * server, once per page render.
 */
export async function fetchProjectStates(): Promise<Array<{ st_code: number; name: string; count: number }>> {
  const rows = isFixtureMode()
    ? FIXTURE_PROJECTS.map(p => ({ st_code: p.st_code, state_raw: p.state_raw }))
    : await cachedQuery<{ st_code: number | null; state_raw: string | null }>("in_central_projects", {
      is_ongoing: "eq.true", select: "st_code,state_raw",
    })

  const byState = new Map<number, { st_code: number; name: string; count: number }>()
  for (const r of rows) {
    // Multi-state projects carry a null st_code by design; they belong to no
    // single state and must not be filed under a guessed one.
    if (r.st_code == null) continue
    const cur = byState.get(r.st_code)
    if (cur) cur.count++
    else byState.set(r.st_code, { st_code: r.st_code, name: r.state_raw ?? `State ${r.st_code}`, count: 1 })
  }
  return [...byState.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * One central project, as its own canonical page: identity, every snapshot
 * month Kaun holds, and how many times each thing has actually been revised.
 *
 * The revision counts are the point of keeping snapshots at all. "Revised for
 * the third time, +₹4,290 Cr, 66 months later than first promised" is a fact
 * about a project's history; a latest-value table can only ever say "late".
 */
export interface ProjectDetail {
  project: CentralProject
  /** Oldest month first, so the timeline reads left to right. */
  history: CentralProjectChange[]
  latest: CentralProjectChange | null
  costRevisions: number
  scheduleRevisions: number
  monthsSinceLastChange: number | null
}

export async function fetchProjectDetail(projectCode: string): Promise<ProjectDetail | null> {
  let project: CentralProject | null
  let history: CentralProjectChange[]

  if (isFixtureMode()) {
    project = FIXTURE_PROJECTS.find(p => p.project_code === projectCode) ?? null
    history = changesFromSnapshots(FIXTURE_SNAPSHOTS.filter(s => s.project_code === projectCode))
  } else {
    const rows = await cachedQuery<CentralProject>("in_central_projects", {
      project_code: `eq.${projectCode}`, select: PROJ_COLS, limit: "1",
    })
    project = rows[0] ?? null
    history = project
      ? await cachedQuery<CentralProjectChange>("v_in_central_project_changes", {
        project_code: `eq.${projectCode}`, select: CHANGE_COLS, order: "report_month.asc",
      })
      : []
  }
  if (!project) return null

  history.sort((a, b) => a.report_month.localeCompare(b.report_month))
  const latest = history[history.length - 1] ?? null
  const lastMove = history.filter(h => h.cost_revised || h.schedule_changed).pop() ?? null

  return {
    project,
    history,
    latest,
    costRevisions: history.filter(h => h.cost_revised).length,
    scheduleRevisions: history.filter(h => h.schedule_changed).length,
    monthsSinceLastChange: latest
      ? monthsBetween(lastMove?.report_month ?? null, latest.report_month)
      : null,
  }
}

/**
 * The prefix load-mospi-historical.mjs mints for a project it cannot match to
 * an existing MoSPI project_code. MoSPI's own codes are bare digits, so a
 * project_code starting with this was always ours, never theirs.
 */
const SYNTHETIC_PREFIX = "ocms:"

/**
 * Does this project_code name a row at all?
 *
 * The identity read out of fetchProjectDetail, without the history behind it.
 * app/india/projects/[project_code]/layout.tsx runs it ABOVE the segment's
 * Suspense boundary so a missing project can still be answered with a real 404
 * status; the expensive part — every monthly snapshot, folded into a timeline —
 * stays below the boundary where the loading skeleton covers it.
 *
 * One indexed primary-key lookup, cached like every other read in this module,
 * and only ever paid on a cold render of a project page.
 */
export async function projectExists(projectCode: string): Promise<boolean> {
  if (isFixtureMode()) return FIXTURE_PROJECTS.some(p => p.project_code === projectCode)
  const rows = await cachedQuery<{ project_code: string }>("in_central_projects", {
    project_code: `eq.${projectCode}`, select: "project_code", limit: "1",
  })
  return rows.length > 0
}

/**
 * Where a merged synthetic project went.
 *
 * A truncated PostgREST read once minted a second, synthetic identity for
 * projects that already had a real MoSPI project_code, and 708 of those
 * `ocms:` rows have since been merged away
 * (scripts/india/merge-ocms-identities.mjs). Their URLs are real: they were
 * served, they render, they can have been linked or crawled. Deleting the row
 * without this would turn each of them into a 404 for a project that still
 * exists under a different code.
 *
 * The forward is not a stored redirect table — it is the same statement the
 * merge made. `ocms:<CODE>` meant "the project with OCMS code <CODE>", so the
 * survivor is the row that carries that legacy_ocms_code and is not itself
 * synthetic. Exact string match, and only when the answer is unambiguous: a
 * code held by more than one real row (MoSPI has reissued a few) resolves to
 * nothing and the page 404s honestly rather than guessing which project the
 * visitor meant.
 *
 * Costs one extra query, on the 404 path of a synthetic code only.
 */
export async function resolveMergedProjectCode(projectCode: string): Promise<string | null> {
  if (!projectCode.startsWith(SYNTHETIC_PREFIX)) return null
  const ocmsCode = projectCode.slice(SYNTHETIC_PREFIX.length)
  if (!ocmsCode) return null
  const rows = isFixtureMode()
    ? FIXTURE_PROJECTS.filter(p => p.legacy_ocms_code === ocmsCode)
    : await cachedQuery<CentralProject>("in_central_projects", {
      legacy_ocms_code: `eq.${ocmsCode}`, select: "project_code", limit: "3",
    })
  const survivors = rows
    .map(r => r.project_code)
    .filter(code => !code.startsWith(SYNTHETIC_PREFIX))
  return survivors.length === 1 ? survivors[0] : null
}

/**
 * Per-seat values for one choropleth layer, keyed by pc_code.
 *
 * A seat is absent from the returned map when it has no value — including the
 * structural absences (an unreviewed affidavit, a minister's attendance). The
 * map paints absent seats in the no-data grey; it must never substitute 0.
 */
export async function fetchIndiaLayerValues(layerId: IndiaLayerId): Promise<Record<string, number>> {
  const out: Record<string, number> = {}

  if (layerId === "criminal_cases") {
    if (isFixtureMode()) {
      for (const [pc, aff] of Object.entries(FIXTURE_AFFIDAVITS)) {
        if (aff.criminal_cases !== null) out[pc] = aff.criminal_cases
      }
      return out
    }
    const rows = await cachedQuery<{ pc_code: string | null; criminal_cases: number | null }>("in_mp_affidavits", {
      is_winner: "eq.true", select: "pc_code,criminal_cases",
    })
    for (const r of rows) if (r.pc_code && r.criminal_cases !== null) out[r.pc_code] = r.criminal_cases
    return out
  }

  if (layerId === "mplads_utilization") {
    if (isFixtureMode()) {
      for (const [pc, rows] of Object.entries(FIXTURE_MPLADS)) {
        const esakshi = rows.find(r => r.source === "esakshi") ?? rows[0]
        if (esakshi?.utilization_pct != null) out[pc] = esakshi.utilization_pct
      }
      return out
    }
    const rows = await cachedQuery<{ pc_code: string | null; utilization_pct: number | null }>("in_mplads_summary", {
      source: "eq.esakshi", select: "pc_code,utilization_pct",
    })
    for (const r of rows) if (r.pc_code && r.utilization_pct !== null) out[r.pc_code] = r.utilization_pct
    return out
  }

  // attendance: in_mp_activity is keyed on mp_id, not pc_code, so the seat has
  // to come from in_mps. Two reads, joined here — and rows flagged
  // metrics_excluded carry NULL by CHECK constraint, so ministers simply never
  // land in the output map.
  if (isFixtureMode()) {
    for (const [pc, rows] of Object.entries(FIXTURE_ACTIVITY)) {
      const term = rows.find(r => r.period_kind === "term") ?? rows[0]
      if (term && !term.metrics_excluded && term.attendance_pct !== null) out[pc] = term.attendance_pct
    }
    return out
  }
  const mps = await cachedQuery<{ id: number; pc_code: string | null }>("in_mps", {
    house: "eq.LS", status: "eq.Sitting", select: "id,pc_code",
  })
  const seatOf = new Map(mps.map(m => [m.id, m.pc_code]))
  const acts = await cachedQuery<{ mp_id: number; attendance_pct: number | null; metrics_excluded: boolean }>("in_mp_activity", {
    period_kind: "eq.term", select: "mp_id,attendance_pct,metrics_excluded",
  })
  for (const a of acts) {
    const pc = seatOf.get(a.mp_id)
    if (pc && !a.metrics_excluded && a.attendance_pct !== null) out[pc] = a.attendance_pct
  }
  return out
}

/** Every seat, for the search box and the state filter. Identity only. */
export async function fetchAllConstituencies(): Promise<Pick<Constituency, "pc_code" | "st_code" | "pc_no" | "state_name" | "pc_name">[]> {
  if (isFixtureMode()) {
    return FIXTURE_CONSTITUENCIES.map(({ pc_code, st_code, pc_no, state_name, pc_name }) =>
      ({ pc_code, st_code, pc_no, state_name, pc_name }))
  }
  return await cachedQuery("in_constituencies", {
    select: "pc_code,st_code,pc_no,state_name,pc_name", order: "st_code.asc,pc_no.asc",
  })
}

/** Sitting MPs, keyed by seat — the map's search matches on MP name too. */
export async function fetchAllSittingMps(): Promise<Array<Pick<Mp, "pc_code" | "name" | "party_abbr" | "is_minister">>> {
  if (isFixtureMode()) {
    return FIXTURE_MPS.filter(m => m.status === "Sitting")
      .map(({ pc_code, name, party_abbr, is_minister }) => ({ pc_code, name, party_abbr, is_minister }))
  }
  return await cachedQuery("in_mps", {
    house: "eq.LS", status: "eq.Sitting", select: "pc_code,name,party_abbr,is_minister",
  })
}
