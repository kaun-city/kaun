/**
 * fixtures.ts — a small, committed, REAL dataset so every India page renders
 * without a database.
 *
 * WHY THIS EXISTS. The in_* tables do not exist in production yet: the schema
 * is PR #63 and the loaders are #65+. Without fixtures this whole surface
 * would be un-reviewable until three other PRs land. With them, a reviewer
 * runs `npm run dev`, opens /india, and sees the finished product.
 *
 * WHERE THE NUMBERS COME FROM. Everything here except the MPLADS block is a
 * verbatim row from the P0 recon captures, not invented:
 *
 *   constituencies  india-recon/geo-roster/pc-boundaries/datameet_india_pc_2019_simplified.geojson
 *   MPs             india-recon/geo-roster/mp-roster/ls18_roster_joined.csv  (sansad.in api_ls)
 *   affidavits      india-recon/mp-records/samples/myneta/candidate_*.json   (ECI affidavits via MyNeta)
 *   activity        india-recon/mp-records/samples/prs/18_LS_MP_Track.csv    (PRS India, to 18-04-2026)
 *   projects        india-recon/mospi-projects/extracted/{march,april,may}2026.json  (MoSPI Table 6)
 *
 * THE ONE EXCEPTION. No per-MP MPLADS figures were captured in recon —
 * eSAKSHI's getMpNamesData returned an empty array for Karnataka and Empowered
 * Indian's per-MP endpoint 404s. Those rows are therefore illustrative, and
 * they say so in their own data_source string, which the sources footer
 * renders. Nothing else on these pages is invented.
 *
 * FIXTURE MODE IS ALWAYS VISIBLY LABELLED. isFixtureMode() drives a banner on
 * every India page. A civic-transparency site showing sample numbers that
 * look live would be the single worst bug this surface could ship.
 *
 * Four Karnataka seats, chosen to cover the cases the UI must get right:
 *   29-23 Bangalore Rural    no affidavit row  -> "not yet matched" state
 *   29-24 Bangalore North    MP is a minister  -> activity metrics excluded
 *   29-25 Bangalore Central  4-term MP, largest declared assets + liabilities
 *   29-26 Bangalore South    2-term MP, attendance below the national average
 */
import type {
  Constituency, Mp, MpActivity, MpAffidavit, MpladsSummary, CentralProject,
} from "./types"

/**
 * Fixture mode. Defaulted ON while the in_* tables did not exist; as of
 * 2026-07-26 the schema is applied and every loader has run against prod
 * (543 seats / 788 MPs / affidavits / activity / MPLADS / 2,033 projects),
 * so live data is the default. Set NEXT_PUBLIC_KAUN_INDIA_FIXTURES=1 to
 * force the committed 4-seat sample (local dev without network, demos);
 * the read path is identical either way.
 */
export function isFixtureMode(): boolean {
  return process.env.NEXT_PUBLIC_KAUN_INDIA_FIXTURES === "1"
}

/** Term the fixtures describe. */
export const FIXTURE_TERM = "LS18"

// ---------------------------------------------------------------------------
// in_constituencies
// ---------------------------------------------------------------------------

const DATAMEET_SRC = "datameet + shijithpk 2024 supplement"

export const FIXTURE_CONSTITUENCIES: Constituency[] = [
  {
    pc_code: "29-23", st_code: 29, pc_no: 23, state_name: "Karnataka",
    pc_name: "Bangalore Rural", pc_name_hi: "बंगलौर ग्रामीण",
    reserved_for: null, reserved_source: null,
    wikidata_qid: "Q4855074", geom_source: "datameet",
    data_source: DATAMEET_SRC, updated_at: "2026-07-25T00:00:00Z",
  },
  {
    pc_code: "29-24", st_code: 29, pc_no: 24, state_name: "Karnataka",
    pc_name: "Bangalore North", pc_name_hi: "बंगलौर उत्तर",
    reserved_for: null, reserved_source: null,
    wikidata_qid: "Q4855069", geom_source: "datameet",
    data_source: DATAMEET_SRC, updated_at: "2026-07-25T00:00:00Z",
  },
  {
    pc_code: "29-25", st_code: 29, pc_no: 25, state_name: "Karnataka",
    pc_name: "Bangalore Central", pc_name_hi: "बंगलौर सेंट्रल",
    reserved_for: null, reserved_source: null,
    wikidata_qid: "Q4855038", geom_source: "datameet",
    data_source: DATAMEET_SRC, updated_at: "2026-07-25T00:00:00Z",
  },
  {
    pc_code: "29-26", st_code: 29, pc_no: 26, state_name: "Karnataka",
    pc_name: "Bangalore South", pc_name_hi: "बंगलौर दक्षिण",
    reserved_for: null, reserved_source: null,
    wikidata_qid: "Q6509948", geom_source: "datameet",
    data_source: DATAMEET_SRC, updated_at: "2026-07-25T00:00:00Z",
  },
]

// ---------------------------------------------------------------------------
// in_mps — sansad.in api_ls, 18th Lok Sabha, pulled 2026-07-25
// ---------------------------------------------------------------------------

const SANSAD_SRC = "sansad.in api_ls/api_rs"

export const FIXTURE_MPS: Mp[] = [
  {
    id: 1, mpsno: 5590, house: "LS", term_label: FIXTURE_TERM, pc_code: "29-23",
    state_name: "Karnataka", constituency_label: "Bangalore Rural",
    name: "C N Manjunath", party_abbr: "BJP", party_full: "Bharatiya Janata Party",
    gender: "Male", age: 69, no_of_terms: 1,
    qualification: "Post Graduate and above", profession: "Cardiologist",
    status: "Sitting", is_minister: false, minister_note: null,
    profile_url: "https://sansad.in/ls/members/5590",
    data_source: SANSAD_SRC, updated_at: "2026-07-10T00:00:00Z",
  },
  {
    id: 2, mpsno: 4616, house: "LS", term_label: FIXTURE_TERM, pc_code: "29-24",
    state_name: "Karnataka", constituency_label: "Bangalore North",
    name: "Shobha Karandlaje", party_abbr: "BJP", party_full: "Bharatiya Janata Party",
    gender: "Female", age: 59, no_of_terms: 3,
    qualification: "Post Graduate and above", profession: "Parliamentarian",
    status: "Sitting", is_minister: true,
    minister_note: "Union Minister of State. Ministers do not sign the attendance register, ask questions, or introduce private member bills.",
    profile_url: "https://sansad.in/ls/members/4616",
    data_source: SANSAD_SRC, updated_at: "2026-07-10T00:00:00Z",
  },
  {
    id: 3, mpsno: 4321, house: "LS", term_label: FIXTURE_TERM, pc_code: "29-25",
    state_name: "Karnataka", constituency_label: "Bangalore Central",
    name: "P C Mohan", party_abbr: "BJP", party_full: "Bharatiya Janata Party",
    gender: "Male", age: 63, no_of_terms: 4,
    qualification: "Upto Higher Secondary", profession: "Business and Social Worker",
    status: "Sitting", is_minister: false, minister_note: null,
    profile_url: "https://sansad.in/ls/members/4321",
    data_source: SANSAD_SRC, updated_at: "2026-07-10T00:00:00Z",
  },
  {
    id: 4, mpsno: 5182, house: "LS", term_label: FIXTURE_TERM, pc_code: "29-26",
    state_name: "Karnataka", constituency_label: "Bangalore South",
    name: "Tejasvi Surya", party_abbr: "BJP", party_full: "Bharatiya Janata Party",
    gender: "Male", age: 35, no_of_terms: 2,
    qualification: "Graduate", profession: "Advocate",
    status: "Sitting", is_minister: false, minister_note: null,
    profile_url: "https://sansad.in/ls/members/5182",
    data_source: SANSAD_SRC, updated_at: "2026-07-10T00:00:00Z",
  },
]

// ---------------------------------------------------------------------------
// in_mp_affidavits — ECI nomination affidavits via myneta.info (ADR)
// Amounts are whole rupees, exactly as declared. 29-23 has no row on purpose.
// ---------------------------------------------------------------------------

const MYNETA_SRC = "ECI affidavits via myneta.info (ADR)"

export const FIXTURE_AFFIDAVITS: Record<string, MpAffidavit> = {
  "29-24": {
    id: 1, election: "LokSabha2024", candidate_name: "SHOBHA KARANDLAJE",
    party_abbr: "BJP", age: 57, self_profession: "Parliamentarian",
    education_category: "Post Graduate",
    education_detail: "Master of Social Services (Social Service), Roshani Nilaya, Mangalore University, 1990",
    criminal_cases: 5,
    total_assets_inr: 138866909, liabilities_inr: 40600640,
    declared_assets_history: [
      { election: "Lok Sabha 2019", declared_assets_inr: 104872668, declared_cases: 3 },
      { election: "Loksabha 2014", declared_assets_inr: 72089452, declared_cases: 0 },
      { election: "Karnataka 2013", declared_assets_inr: 68440947, declared_cases: 0 },
    ],
    profile_url: "https://myneta.info/LokSabha2024/candidate.php?candidate_id=2178",
    data_source: MYNETA_SRC, updated_at: "2026-07-25T00:00:00Z",
  },
  "29-25": {
    id: 2, election: "LokSabha2024", candidate_name: "P C MOHAN",
    party_abbr: "BJP", age: 60, self_profession: "Business and Social Worker",
    education_category: "12th Pass",
    education_detail: "2nd PUC, Vijaya College, Jayanagar, Bengaluru, 1981",
    criminal_cases: 2,
    total_assets_inr: 813065207, liabilities_inr: 165694024,
    declared_assets_history: [
      { election: "Lok Sabha 2019", declared_assets_inr: 755529306, declared_cases: 0 },
      { election: "Loksabha 2014", declared_assets_inr: 475796999, declared_cases: 2 },
      { election: "Karnataka 2013", declared_assets_inr: 304684050, declared_cases: 2 },
      { election: "Lok Sabha 2009", declared_assets_inr: 53729000, declared_cases: 1 },
    ],
    profile_url: "https://myneta.info/LokSabha2024/candidate.php?candidate_id=1866",
    data_source: MYNETA_SRC, updated_at: "2026-07-25T00:00:00Z",
  },
  "29-26": {
    id: 3, election: "LokSabha2024", candidate_name: "TEJASVI SURYA",
    party_abbr: "BJP", age: 33, self_profession: "Advocate",
    education_category: "Graduate Professional",
    education_detail: "BA LLB, Bangalore Institute of Legal Studies (Bangalore University), 2013",
    criminal_cases: 3,
    total_assets_inr: 41030489, liabilities_inr: null,
    declared_assets_history: [
      { election: "Lok Sabha 2019", declared_assets_inr: 1346593, declared_cases: 0 },
    ],
    profile_url: "https://myneta.info/LokSabha2024/candidate.php?candidate_id=2629",
    data_source: MYNETA_SRC, updated_at: "2026-07-25T00:00:00Z",
  },
}

// ---------------------------------------------------------------------------
// in_mp_activity — PRS MP Track, term-cumulative (period_kind='term',
// session_no=0), covering 24-06-2024 to 18-04-2026.
//
// Bangalore North is the row that matters: its MP is a minister, so every
// metric is NULL with a reason, never 0. The schema CHECK
// in_mp_activity_excluded_is_null_not_zero rejects the alternative.
// ---------------------------------------------------------------------------

const PRS_SRC = "PRS India MP Track (18th Lok Sabha, to 18-04-2026)"
const MINISTER_REASON =
  "This MP is a minister. Ministers represent the government in debates, so PRS does not report their participation. They do not sign the attendance register, ask questions, or introduce private member bills."

export const FIXTURE_ACTIVITY: Record<string, MpActivity[]> = {
  "29-23": [{
    id: 1, period_kind: "term", session_no: 0, session_label: "18th Lok Sabha, to Apr 2026",
    sittings_held: null, signed_days: null, attendance_pct: 93.33,
    questions_asked: 19, debates: 13, private_member_bills: 0, committees: null,
    metrics_excluded: false, metrics_excluded_reason: null, data_source: PRS_SRC,
  }],
  "29-24": [{
    id: 2, period_kind: "term", session_no: 0, session_label: "18th Lok Sabha, to Apr 2026",
    sittings_held: null, signed_days: null, attendance_pct: null,
    questions_asked: null, debates: null, private_member_bills: null, committees: null,
    metrics_excluded: true, metrics_excluded_reason: MINISTER_REASON, data_source: PRS_SRC,
  }],
  "29-25": [{
    id: 3, period_kind: "term", session_no: 0, session_label: "18th Lok Sabha, to Apr 2026",
    sittings_held: null, signed_days: null, attendance_pct: 94.07,
    questions_asked: 197, debates: 7, private_member_bills: 0, committees: null,
    metrics_excluded: false, metrics_excluded_reason: null, data_source: PRS_SRC,
  }],
  "29-26": [{
    id: 4, period_kind: "term", session_no: 0, session_label: "18th Lok Sabha, to Apr 2026",
    sittings_held: null, signed_days: null, attendance_pct: 80.00,
    questions_asked: 188, debates: 26, private_member_bills: 0, committees: null,
    metrics_excluded: false, metrics_excluded_reason: null, data_source: PRS_SRC,
  }],
}

/** PRS's own national averages for the same window — shown as context so a
 *  single attendance number is not read as good or bad on its own. */
export const FIXTURE_ACTIVITY_BENCHMARKS = {
  attendance_national_pct: 84.91,
  attendance_state_pct: 79.44,
  questions_national: 103,
  questions_state: 81,
  source: PRS_SRC,
}

// ---------------------------------------------------------------------------
// in_mplads_summary — THE ONE ILLUSTRATIVE BLOCK. See the file header.
// Shape and units follow eSAKSHI (whole rupees, numeric); the values are the
// standard ₹5 crore/year entitlement over the two financial years the 18th Lok
// Sabha has run, not a captured figure.
// ---------------------------------------------------------------------------

const MPLADS_SRC = "FIXTURE — illustrative values in eSAKSHI's field shape; no per-MP MPLADS figures were captured in recon"

function mplads(id: number, expenditure: number, works: [number, number, number]): MpladsSummary {
  const allocated = 100000000 // ₹10 Cr = ₹5 Cr/yr × FY2024-25 + FY2025-26
  return {
    id, source: "esakshi", house: "LS", term_label: FIXTURE_TERM,
    allocated_inr: allocated,
    expenditure_inr: expenditure,
    unspent_inr: allocated - expenditure,
    utilization_pct: Number(((expenditure / allocated) * 100).toFixed(2)),
    works_recommended: works[0], works_sanctioned: works[1], works_completed: works[2],
    captured_at: "2026-07-25T00:00:00Z", data_source: MPLADS_SRC,
  }
}

export const FIXTURE_MPLADS: Record<string, MpladsSummary[]> = {
  "29-23": [mplads(1, 41500000, [212, 168, 94])],
  "29-24": [mplads(2, 63200000, [301, 244, 151])],
  "29-25": [mplads(3, 78900000, [268, 231, 187])],
  "29-26": [mplads(4, 52400000, [244, 190, 122])],
}

// ---------------------------------------------------------------------------
// in_central_projects + in_central_project_snapshots
// MoSPI Flash Report Table 6, March / April / May 2026, parsed by
// india-recon/mospi-projects/parse_flash_report.py.
//
// MoSPI publishes Table 6 with a STATE column and nothing finer — there is no
// district, no constituency. So these rows are state-level facts, and the
// constituency page labels them as such. See docs/design-india-surface.md.
// ---------------------------------------------------------------------------

const MOSPI_SRC = "MoSPI Flash Report Table 6 (PAIMANA)"

export const FIXTURE_PROJECTS: CentralProject[] = [
  { project_code: "702635", legacy_ocms_code: "N28000058", pmgid: "2472", project_name: "Construction of Bangalore Metro Rail Project Phase 2.", ministry: "Ministry of Housing & Urban Affairs", sector: "Urban Public Transport", agency: "Bengaluru Metro Rail", state_raw: "Karnataka", st_code: 29, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "705490", legacy_ocms_code: "N22000299", pmgid: "1541", project_name: "Gadag-Wadi New Railway Line [257 km]", ministry: "Ministry of Railways", sector: "Railways", agency: "South Western Railway [SWR] - II", state_raw: "Karnataka", st_code: 29, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "619120", legacy_ocms_code: null, pmgid: "11790", project_name: "Nidagatta-Mysore Pkg II", ministry: "Ministry of Road Transport & Highways", sector: "Roads & Highways", agency: "National Highways Authority of India [NHAI]", state_raw: "Karnataka", st_code: 29, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "701377", legacy_ocms_code: null, pmgid: "3341", project_name: "Upper Tunga Irrigation Project", ministry: "Department of Water Resources, River Development & GR", sector: "Water Resources", agency: "Water Resources-KA", state_raw: "Karnataka", st_code: 29, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "400023", legacy_ocms_code: "N22000558", pmgid: "4449", project_name: "Construction of New BG line between Hassan to Belur [27 Km]", ministry: "Ministry of Railways", sector: "Railways", agency: "South Western Railway [SWR] - II", state_raw: "Karnataka", st_code: 29, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "617989", legacy_ocms_code: "N24001450", pmgid: null, project_name: "Construction of Major Bridge at Km.180.865 across river Krishna on NH 167 Hagari Jadcherla section", ministry: "Ministry of Road Transport & Highways", sector: "Roads & Highways", agency: "MoRTH", state_raw: "Karnataka", st_code: 29, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "701657", legacy_ocms_code: null, pmgid: "4121", project_name: "Tumakuru Node - Phase 1 - Roads and Services Development", ministry: "Department for Promotion of Industry & Internal Trade", sector: "Real Estate", agency: "National Highways & Infrastructure Development Corporation Ltd. [NHIDCL]", state_raw: "Karnataka", st_code: 29, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "618870", legacy_ocms_code: null, pmgid: "10624", project_name: "4L PS from near Hemmige Village Periyapatna - Hassan Road Jn. to near Hunsur - KR Nagar Jn section from Km. 144.900 to Km. 169.000 of NH-275 Pkg. III", ministry: "Ministry of Road Transport & Highways", sector: "Roads & Highways", agency: "National Highways Authority of India [NHAI]", state_raw: "Karnataka", st_code: 29, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "702637", legacy_ocms_code: "N28000086", pmgid: "1384", project_name: "Mumbai Metro Line 3", ministry: "Ministry of Housing & Urban Affairs", sector: "Urban Public Transport", agency: "Mumbai Metro Rail Corporation Limited [MMRC]", state_raw: "Maharashtra", st_code: 27, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "701408", legacy_ocms_code: null, pmgid: "3319", project_name: "Madhya Ganga canal Phase-II", ministry: "Department of Water Resources, River Development & GR", sector: "Water Resources", agency: "Irrigation & Water Resources-UP", state_raw: "Uttar Pradesh", st_code: 9, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
  { project_code: "602579", legacy_ocms_code: "N18000194", pmgid: "2361", project_name: "Buxar Thermal Power Project [1320 MW]", ministry: "Ministry of Power", sector: "Electricity Generation", agency: "Satluj Jal Vidyut Nigam [SJVN] Thermal Limited", state_raw: "Bihar", st_code: 10, is_multi_state: false, first_seen_month: "2026-03-01", last_seen_month: "2026-05-01", is_ongoing: true },
]

/** in_central_project_snapshots. One immutable row per project per report
 *  month — the reason the tracker is a time series and not a latest-value
 *  table. Costs in crore, exactly as MoSPI prints them. */
export interface FixtureSnapshot {
  project_code: string
  report_month: string
  original_cost_cr: number | null
  revised_cost_cr: number | null
  cumulative_expenditure_cr: number | null
  physical_progress_pct: number | null
  original_doc_month: string | null
  revised_doc_month: string | null
}

export const FIXTURE_SNAPSHOTS: FixtureSnapshot[] = [
  // Bangalore Metro Phase 2 — ₹4,290 Cr over, 5½ years late, stable month to month.
  { project_code: "702635", report_month: "2026-03-01", original_cost_cr: 26405.14, revised_cost_cr: 30695.10, cumulative_expenditure_cr: 29782.97, physical_progress_pct: 95.4, original_doc_month: "2021-03-01", revised_doc_month: "2026-09-01" },
  { project_code: "702635", report_month: "2026-04-01", original_cost_cr: 26405.14, revised_cost_cr: 30695.10, cumulative_expenditure_cr: 29802.97, physical_progress_pct: 95.5, original_doc_month: "2021-03-01", revised_doc_month: "2026-09-01" },
  { project_code: "702635", report_month: "2026-05-01", original_cost_cr: 26405.14, revised_cost_cr: 30695.10, cumulative_expenditure_cr: 29812.97, physical_progress_pct: 95.6, original_doc_month: "2021-03-01", revised_doc_month: "2026-09-01" },
  // Gadag-Wadi — cost more than doubled before the window opens; no change inside it.
  { project_code: "705490", report_month: "2026-03-01", original_cost_cr: 2842.00, revised_cost_cr: 6700.00, cumulative_expenditure_cr: 1513.54, physical_progress_pct: 34.0, original_doc_month: "2027-03-01", revised_doc_month: "2027-12-01" },
  { project_code: "705490", report_month: "2026-04-01", original_cost_cr: 2842.00, revised_cost_cr: 6700.00, cumulative_expenditure_cr: 1539.51, physical_progress_pct: 34.5, original_doc_month: "2027-03-01", revised_doc_month: "2027-12-01" },
  { project_code: "705490", report_month: "2026-05-01", original_cost_cr: 2842.00, revised_cost_cr: 6700.00, cumulative_expenditure_cr: 1613.49, physical_progress_pct: 40.0, original_doc_month: "2027-03-01", revised_doc_month: "2027-12-01" },
  // Nidagatta-Mysore — the completion date slipped in BOTH April and May.
  { project_code: "619120", report_month: "2026-03-01", original_cost_cr: 2919.80, revised_cost_cr: 4113.89, cumulative_expenditure_cr: 1378.91, physical_progress_pct: 99.19, original_doc_month: "2022-06-01", revised_doc_month: "2026-04-01" },
  { project_code: "619120", report_month: "2026-04-01", original_cost_cr: 2919.80, revised_cost_cr: 4113.89, cumulative_expenditure_cr: 2279.05, physical_progress_pct: 99.19, original_doc_month: "2022-06-01", revised_doc_month: "2026-06-01" },
  { project_code: "619120", report_month: "2026-05-01", original_cost_cr: 2919.80, revised_cost_cr: 4113.89, cumulative_expenditure_cr: 2280.10, physical_progress_pct: 99.19, original_doc_month: "2022-06-01", revised_doc_month: "2026-07-01" },
  // Upper Tunga — nothing moved in any of the three months: months_since_last_change is null.
  { project_code: "701377", report_month: "2026-03-01", original_cost_cr: 770.16, revised_cost_cr: 1606.07, cumulative_expenditure_cr: 1515.60, physical_progress_pct: 99.32, original_doc_month: "2019-12-01", revised_doc_month: "2026-03-01" },
  { project_code: "701377", report_month: "2026-04-01", original_cost_cr: 770.16, revised_cost_cr: 1606.07, cumulative_expenditure_cr: 1515.60, physical_progress_pct: 99.32, original_doc_month: "2019-12-01", revised_doc_month: "2026-03-01" },
  { project_code: "701377", report_month: "2026-05-01", original_cost_cr: 770.16, revised_cost_cr: 1606.07, cumulative_expenditure_cr: 1515.60, physical_progress_pct: 99.32, original_doc_month: "2019-12-01", revised_doc_month: "2026-03-01" },
  // Hassan-Belur — was running AHEAD of its original date, then slipped 35 months in one report.
  { project_code: "400023", report_month: "2026-03-01", original_cost_cr: 749.00, revised_cost_cr: 749.00, cumulative_expenditure_cr: 0.94, physical_progress_pct: 0.3, original_doc_month: "2028-04-01", revised_doc_month: "2027-04-01" },
  { project_code: "400023", report_month: "2026-04-01", original_cost_cr: 749.00, revised_cost_cr: 749.00, cumulative_expenditure_cr: 0.94, physical_progress_pct: 0.3, original_doc_month: "2028-04-01", revised_doc_month: "2027-04-01" },
  { project_code: "400023", report_month: "2026-05-01", original_cost_cr: 749.00, revised_cost_cr: 749.00, cumulative_expenditure_cr: 0.94, physical_progress_pct: 0.0, original_doc_month: "2028-04-01", revised_doc_month: "2030-03-01" },
  // Krishna bridge — slipped 13 months in the May report.
  { project_code: "617989", report_month: "2026-03-01", original_cost_cr: 157.32, revised_cost_cr: 187.61, cumulative_expenditure_cr: 103.33, physical_progress_pct: 68.0, original_doc_month: "2021-11-01", revised_doc_month: "2026-03-01" },
  { project_code: "617989", report_month: "2026-04-01", original_cost_cr: 157.32, revised_cost_cr: 187.61, cumulative_expenditure_cr: 103.33, physical_progress_pct: 68.0, original_doc_month: "2021-11-01", revised_doc_month: "2026-03-01" },
  { project_code: "617989", report_month: "2026-05-01", original_cost_cr: 157.32, revised_cost_cr: 187.61, cumulative_expenditure_cr: 103.33, physical_progress_pct: 69.0, original_doc_month: "2021-11-01", revised_doc_month: "2027-04-01" },
  // Tumakuru Node — no revised date at all until May, when one appeared a year out.
  { project_code: "701657", report_month: "2026-03-01", original_cost_cr: 1701.81, revised_cost_cr: 1701.81, cumulative_expenditure_cr: 278.35, physical_progress_pct: 21.84, original_doc_month: "2026-09-01", revised_doc_month: null },
  { project_code: "701657", report_month: "2026-04-01", original_cost_cr: 1701.81, revised_cost_cr: 1701.81, cumulative_expenditure_cr: 278.35, physical_progress_pct: 23.18, original_doc_month: "2026-09-01", revised_doc_month: null },
  { project_code: "701657", report_month: "2026-05-01", original_cost_cr: 1701.81, revised_cost_cr: 1701.81, cumulative_expenditure_cr: 300.46, physical_progress_pct: 23.89, original_doc_month: "2026-09-01", revised_doc_month: "2027-09-01" },
  // NH-275 Pkg III — slipped in April, then again in May.
  { project_code: "618870", report_month: "2026-03-01", original_cost_cr: 883.62, revised_cost_cr: 1726.65, cumulative_expenditure_cr: 60.91, physical_progress_pct: 16.85, original_doc_month: "2027-04-01", revised_doc_month: "2027-04-01" },
  { project_code: "618870", report_month: "2026-04-01", original_cost_cr: 883.62, revised_cost_cr: 1726.65, cumulative_expenditure_cr: 61.05, physical_progress_pct: 20.10, original_doc_month: "2027-04-01", revised_doc_month: "2027-07-01" },
  { project_code: "618870", report_month: "2026-05-01", original_cost_cr: 883.62, revised_cost_cr: 1726.65, cumulative_expenditure_cr: 61.61, physical_progress_pct: 21.79, original_doc_month: "2027-04-01", revised_doc_month: "2028-07-01" },
  // Three non-Karnataka projects, so the tracker's state filter is real.
  { project_code: "702637", report_month: "2026-03-01", original_cost_cr: 23136.00, revised_cost_cr: 37276.00, cumulative_expenditure_cr: 33308.88, physical_progress_pct: 97.76, original_doc_month: "2023-03-01", revised_doc_month: "2025-08-01" },
  { project_code: "702637", report_month: "2026-04-01", original_cost_cr: 23136.00, revised_cost_cr: 37276.00, cumulative_expenditure_cr: 33526.69, physical_progress_pct: 97.79, original_doc_month: "2023-03-01", revised_doc_month: "2025-08-01" },
  { project_code: "702637", report_month: "2026-05-01", original_cost_cr: 23136.00, revised_cost_cr: 37276.00, cumulative_expenditure_cr: 33648.26, physical_progress_pct: 97.86, original_doc_month: "2023-03-01", revised_doc_month: "2025-08-01" },
  { project_code: "701408", report_month: "2026-03-01", original_cost_cr: 1060.67, revised_cost_cr: 4417.21, cumulative_expenditure_cr: 4575.74, physical_progress_pct: 82.39, original_doc_month: "2019-12-01", revised_doc_month: "2025-12-01" },
  { project_code: "701408", report_month: "2026-04-01", original_cost_cr: 1060.67, revised_cost_cr: 4417.21, cumulative_expenditure_cr: 4575.74, physical_progress_pct: 82.39, original_doc_month: "2019-12-01", revised_doc_month: "2025-12-01" },
  { project_code: "701408", report_month: "2026-05-01", original_cost_cr: 1060.67, revised_cost_cr: 4417.21, cumulative_expenditure_cr: 4575.74, physical_progress_pct: 82.39, original_doc_month: "2019-12-01", revised_doc_month: "2025-12-01" },
  { project_code: "602579", report_month: "2026-03-01", original_cost_cr: 10439.09, revised_cost_cr: 13756.60, cumulative_expenditure_cr: 13252.96, physical_progress_pct: 94.10, original_doc_month: "2024-01-01", revised_doc_month: "2026-05-01" },
  { project_code: "602579", report_month: "2026-04-01", original_cost_cr: 10439.09, revised_cost_cr: 13756.60, cumulative_expenditure_cr: 13370.07, physical_progress_pct: 94.33, original_doc_month: "2024-01-01", revised_doc_month: "2026-05-01" },
  { project_code: "602579", report_month: "2026-05-01", original_cost_cr: 10439.09, revised_cost_cr: 13756.60, cumulative_expenditure_cr: 13479.85, physical_progress_pct: 94.79, original_doc_month: "2024-01-01", revised_doc_month: "2026-05-01" },
]

/** The MoSPI PDFs these snapshots were parsed from. Cited in the footer. */
export const FIXTURE_MOSPI_REPORTS = [
  { month: "2026-03-01", label: "March 2026", source: MOSPI_SRC },
  { month: "2026-04-01", label: "April 2026", source: MOSPI_SRC },
  { month: "2026-05-01", label: "May 2026", source: MOSPI_SRC },
]
