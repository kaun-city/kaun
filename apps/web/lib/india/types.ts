/**
 * Row shapes for the India layer (`in_*` tables + v_in_central_project_changes).
 *
 * These mirror scripts/migrate-india-schema.mjs column-for-column. Where the
 * schema deliberately allows NULL to mean something specific, the type keeps
 * the null — the UI is required to render it as that meaning, not as zero:
 *
 *   in_mp_activity.attendance_pct === null && metrics_excluded
 *     -> "Attendance not recorded for ministers", NEVER 0 and never a rank.
 *   in_mp_affidavits.criminal_cases === null
 *     -> "not parsed", which is different from an explicit 0 ("none declared").
 *
 * Amount units differ by table and are named in the field, because they differ
 * in the source and rounding them into one unit would lose precision:
 *   *_inr  whole rupees   (affidavits: bigint; MPLADS: numeric, eSAKSHI paise)
 *   *_cr   crore rupees   (MoSPI publishes Table 6 in crore)
 */

/** in_constituencies */
export interface Constituency {
  pc_code: string
  st_code: number
  pc_no: number
  state_name: string
  pc_name: string
  pc_name_hi: string | null
  /** 'SC' | 'ST' | null (general). Never rendered without reserved_source. */
  reserved_for: string | null
  /** Provenance of reserved_for. CHECK-enforced to exist whenever it does. */
  reserved_source: string | null
  wikidata_qid: string | null
  geom_source: string | null
  data_source: string
  updated_at: string | null
}

/** in_mps */
export interface Mp {
  id: number
  mpsno: number
  house: "LS" | "RS"
  term_label: string
  pc_code: string | null
  state_name: string | null
  constituency_label: string | null
  name: string
  party_abbr: string | null
  party_full: string | null
  gender: string | null
  age: number | null
  no_of_terms: number | null
  qualification: string | null
  profession: string | null
  status: string
  is_minister: boolean
  minister_note: string | null
  profile_url: string | null
  data_source: string
  updated_at: string | null
}

/** in_mp_affidavits — only rows with needs_review=false, parse_status='ok'
 *  are anon-readable (RLS policy in_mp_affidavits_anon_read_matched). */
export interface MpAffidavit {
  id: number
  election: string
  candidate_name: string
  party_abbr: string | null
  age: number | null
  self_profession: string | null
  education_category: string | null
  education_detail: string | null
  /** Explicit integer once parse_status='ok'. null = page not parsed. */
  criminal_cases: number | null
  total_assets_inr: number | null
  liabilities_inr: number | null
  declared_assets_history: Array<{
    election: string
    declared_assets_inr: number | null
    declared_cases: number | null
  }> | null
  profile_url: string | null
  data_source: string
  updated_at: string | null
}

/** in_mp_activity */
export interface MpActivity {
  id: number
  period_kind: "session" | "term"
  session_no: number
  session_label: string | null
  sittings_held: number | null
  signed_days: number | null
  attendance_pct: number | null
  questions_asked: number | null
  debates: number | null
  private_member_bills: number | null
  committees: number | null
  /** true => every excluded metric above is NULL, CHECK-enforced. */
  metrics_excluded: boolean
  metrics_excluded_reason: string | null
  data_source: string
}

/** in_mplads_summary */
export interface MpladsSummary {
  id: number
  source: "esakshi" | "empoweredindian"
  house: string
  term_label: string
  allocated_inr: number | null
  expenditure_inr: number | null
  unspent_inr: number | null
  utilization_pct: number | null
  works_recommended: number | null
  works_sanctioned: number | null
  works_completed: number | null
  captured_at: string | null
  data_source: string
}

/** in_central_projects — identity only; the numbers live in the snapshots. */
export interface CentralProject {
  project_code: string
  legacy_ocms_code: string | null
  /** Added by MoSPI between the March and April 2026 reports. Often null. */
  pmgid: string | null
  project_name: string
  ministry: string | null
  sector: string | null
  agency: string | null
  state_raw: string | null
  st_code: number | null
  is_multi_state: boolean
  first_seen_month: string
  last_seen_month: string
  is_ongoing: boolean
}

/** One row of v_in_central_project_changes (latest report month per project). */
export interface CentralProjectChange {
  project_code: string
  report_month: string
  prev_report_month: string | null
  revised_cost_cr: number | null
  prev_revised_cost_cr: number | null
  revised_doc_month: string | null
  prev_revised_doc_month: string | null
  cumulative_expenditure_cr: number | null
  physical_progress_pct: number | null
  cost_overrun_cr: number | null
  schedule_slip_months: number | null
  cost_revised: boolean | null
  schedule_changed: boolean | null
}

/** A project joined to its latest change row, as the tracker renders it. */
export interface TrackedProject extends CentralProject, Omit<CentralProjectChange, "project_code"> {
  /**
   * Months between the latest report month and the most recent month in which
   * this project's cost or schedule actually moved.
   *
   * null means "no cost or schedule change is recorded in the months Kaun has
   * ingested" — which is NOT the same as "nothing has changed since it began".
   * The UI must render null as that sentence, never as 0.
   */
  months_since_last_change: number | null
  /** Original cost, back-derived: revised_cost_cr - cost_overrun_cr. */
  original_cost_cr: number | null
}

/** Everything the constituency page renders, fetched in one call. */
export interface ConstituencyProfile {
  constituency: Constituency
  mp: Mp | null
  affidavit: MpAffidavit | null
  /** Term-cumulative row first (PRS MP Track), then per-session rows. */
  activity: MpActivity[]
  mplads: MpladsSummary[]
  projects: TrackedProject[]
  /** Total ongoing central projects in the state, before the display limit. */
  projectsTotal: number
}
