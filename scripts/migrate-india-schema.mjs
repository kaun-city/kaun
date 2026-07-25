/**
 * migrate-india-schema.mjs  —  the "Kaun for India" national layer schema.
 *
 * ADDITIVE ONLY, IDEMPOTENT, REVERSIBLE. Creates eight new `in_*` tables and
 * one view. Touches NO existing table, column, row, policy or grant — the
 * Bengaluru schema (wards, elected_reps, rep_report_cards, bbmp_work_orders,
 * …) is untouched by design; India MPs get their own tables rather than being
 * squeezed into elected_reps' (role, constituency) text key.
 *
 * WHAT IT CREATES
 *   in_constituencies             543 Lok Sabha seats (identity + geometry)
 *   in_pc_source_aliases          every source's own constituency id → pc_code
 *   in_mps                        roster, keyed on sansad.in mpsno
 *   in_mp_affidavits              MyNeta/ADR affidavit facts
 *   in_mp_activity                attendance / questions / debates per session
 *   in_mplads_summary             MPLADS allocation + spend per MP
 *   in_central_projects           MoSPI Table 6 project identity
 *   in_central_project_snapshots  one row per project per report month
 *   v_in_central_project_changes  month-over-month diff (cost / schedule)
 *
 * THREE CONSTRAINTS THAT ARE THE POINT OF THIS SCHEMA
 *   1. pc_code = st_code||'-'||pc_no (unpadded) is CHECK-enforced. pc_no is
 *      NOT nationally unique (it restarts at 1 in all 36 states/UTs), so a
 *      pc_no-keyed table silently merges 36 different seats.
 *   2. in_mp_affidavits_one_winner_per_pc — a partial UNIQUE index on
 *      (election, pc_code) WHERE is_winner. MyNeta shares no id with any other
 *      source; the only safe bridge is the structural "exactly one winner per
 *      seat" fact. A bad join now fails at INSERT instead of double-counting.
 *      match_method's CHECK list has no fuzzy option at all.
 *   3. in_mp_activity_excluded_is_null_not_zero — ministers and the Speaker do
 *      not sign the attendance register and do not file questions or private
 *      member bills (confirmed independently by PRS's mp_note and sansad.in's
 *      signedDaysCount). Rows flagged metrics_excluded must carry NULL, never
 *      0, so nothing can rank a minister as an absentee.
 *
 * GEOMETRY. in_constituencies.geom follows wards.geom: a PostGIS
 * geometry(MultiPolygon, 4326) column on the table itself, so the existing
 * ST_Contains / pin_lookup pattern extends to "which PC is this pin in".
 * The column is added inside a DO block that resolves PostGIS's own schema and
 * raises a clear error if the extension is absent. This migration NEVER writes
 * to spatial_ref_sys or any other PostGIS catalog.
 *
 * Revert (drops only objects this migration created):
 *   DROP VIEW  IF EXISTS public.v_in_central_project_changes;
 *   DROP TABLE IF EXISTS public.in_central_project_snapshots,
 *                        public.in_central_projects,
 *                        public.in_mplads_summary,
 *                        public.in_mp_activity,
 *                        public.in_mp_affidavits,
 *                        public.in_mps,
 *                        public.in_pc_source_aliases,
 *                        public.in_constituencies CASCADE;
 *
 * DDL needs SUPABASE_MANAGEMENT_TOKEN (CI-only, by design). Without it the
 * script is read-only and prints exactly what it would run.
 *
 *   node scripts/migrate-india-schema.mjs             # dry-run preview
 *   node scripts/migrate-india-schema.mjs --inspect   # read-only catalog dump
 *   node scripts/migrate-india-schema.mjs --apply     # writes (needs mgmt token)
 */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
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

/** Tables this migration owns. Order matters: FK parents first. */
const TABLES = [
  "in_constituencies",
  "in_pc_source_aliases",
  "in_mps",
  "in_mp_affidavits",
  "in_mp_activity",
  "in_mplads_summary",
  "in_central_projects",
  "in_central_project_snapshots",
]
const VIEWS = ["v_in_central_project_changes"]

/** Blanket public-read tables. in_mp_affidavits is deliberately NOT here —
 *  it gets a row-restricted policy (see below), mirroring the merged
 *  ward_reports_anon_read_approved precedent. */
const PUBLIC_READ_TABLES = TABLES.filter(t => t !== "in_mp_affidavits")

const SQL = `
-- ===========================================================================
-- Kaun for India — national layer schema. Additive, idempotent, reversible.
-- Creates new in_* tables only; never alters an existing object.
-- ===========================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. in_constituencies — the 543 Lok Sabha seats. Every other in_* table
--    joins through pc_code. Seeded by scripts/india/seed-constituencies.mjs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_constituencies (
  pc_code          text        NOT NULL,
  st_code          integer     NOT NULL,   -- Census-2011 state code (DataMeet st_code)
  pc_no            integer     NOT NULL,   -- ECI seat number WITHIN the state
  state_name       text        NOT NULL,
  pc_name          text        NOT NULL,
  pc_name_norm     text        NOT NULL,   -- normalizeConstituencyName(pc_name)
  pc_name_hi       text,
  reserved_for     text,                   -- 'SC' | 'ST' | NULL (= general)
  reserved_source  text,                   -- provenance of reserved_for
  wikidata_qid     text,
  pc_id_datameet   integer,                -- DataMeet's own pc_id, provenance only
  geom_source      text,                   -- 'datameet' | 'shijithpk-2024'
  data_source      text        NOT NULL DEFAULT 'datameet + shijithpk 2024 supplement',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT in_constituencies_pkey       PRIMARY KEY (pc_code),
  CONSTRAINT in_constituencies_st_pc_key  UNIQUE (st_code, pc_no),
  -- pc_code is derived, not typed by hand. Mirrors pcCode() in
  -- scripts/india/lib/pc-code.mjs, which every loader must use.
  CONSTRAINT in_constituencies_pc_code_derived CHECK (
    pc_code = st_code::text || '-' || pc_no::text),
  CONSTRAINT in_constituencies_pc_no_positive CHECK (pc_no > 0 AND st_code > 0),
  CONSTRAINT in_constituencies_reserved_chk CHECK (
    reserved_for IS NULL OR reserved_for IN ('SC', 'ST')),
  -- reserved_for is unreliable in EVERY source recon checked (DataMeet
  -- undercounts ST by 2, sansad's categoryCode is badly under-populated).
  -- A value must therefore always say where it came from.
  CONSTRAINT in_constituencies_reserved_has_source CHECK (
    reserved_for IS NULL OR reserved_source IS NOT NULL),
  CONSTRAINT in_constituencies_name_norm_present CHECK (pc_name_norm <> '')
);
CREATE INDEX IF NOT EXISTS in_constituencies_state_idx
  ON public.in_constituencies (st_code);
CREATE INDEX IF NOT EXISTS in_constituencies_name_norm_idx
  ON public.in_constituencies (st_code, pc_name_norm);

-- Geometry column, added schema-agnostically (Supabase may host PostGIS in
-- the "extensions" schema). Mirrors wards.geom. Never touches spatial_ref_sys.
DO $$
DECLARE ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'postgis';
  IF ext_schema IS NULL THEN
    RAISE EXCEPTION 'PostGIS is not installed; in_constituencies.geom cannot be created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'in_constituencies'
       AND column_name = 'geom'
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.in_constituencies ADD COLUMN geom %I.geometry(MultiPolygon, 4326)',
      ext_schema);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS in_constituencies_geom_gix
  ON public.in_constituencies USING GIST (geom);

-- ---------------------------------------------------------------------------
-- 2. in_pc_source_aliases — the alias mechanism. Every external source uses
--    its own constituency identifier space: sansad has names only (32 of 544
--    roster rows do not match DataMeet's spelling), MyNeta's constituency_id
--    185 is Bangalore Central whose ECI PC number is 25, eSAKSHI has its own
--    numeric ID (166 = BANGALORE RURAL), PRS has names only. One table maps
--    all of them to pc_code so no loader ever name-matches against another
--    loader's output.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_pc_source_aliases (
  id           bigserial   PRIMARY KEY,
  source       text        NOT NULL,   -- 'sansad'|'myneta'|'esakshi'|'prs'|'mospi'|'empoweredindian'
  source_key   text        NOT NULL,   -- the source's own id, or its normalized label if it has none
  source_label text,                   -- verbatim label as published, for audit
  st_code      integer,
  pc_code      text        NOT NULL
                 REFERENCES public.in_constituencies (pc_code) ON UPDATE CASCADE,
  method       text        NOT NULL,
  note         text,
  reviewed_by  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT in_pc_source_aliases_key UNIQUE (source, source_key),
  -- There is deliberately no 'fuzzy' / 'similarity' method. An alias is either
  -- an official lookup, an exact normalized match, or a human decision.
  CONSTRAINT in_pc_source_aliases_method_chk CHECK (
    method IN ('official_lookup', 'exact_normalized', 'manual_reviewed')),
  CONSTRAINT in_pc_source_aliases_manual_is_attributed CHECK (
    method <> 'manual_reviewed' OR reviewed_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS in_pc_source_aliases_pc_idx
  ON public.in_pc_source_aliases (pc_code);

-- ---------------------------------------------------------------------------
-- 3. in_mps — the roster. mpsno (sansad.in) is the canonical MP id; the
--    surrogate id exists because a re-elected member may reuse mpsno across
--    terms and Kaun keeps the historical record. Rajya Sabha rows carry no
--    pc_code (state-level house).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_mps (
  id                bigserial   PRIMARY KEY,
  mpsno             integer     NOT NULL,   -- sansad.in mpsno == Zenodo mpCode
  house             text        NOT NULL,   -- 'LS' | 'RS'
  term_label        text        NOT NULL,   -- 'LS18', 'RS-2022-2028', …
  lok_sabha_no      integer,
  pc_code           text        REFERENCES public.in_constituencies (pc_code) ON UPDATE CASCADE,
  pc_match_method   text,
  state_name        text,
  constituency_label text,                  -- verbatim sansad constName
  name              text        NOT NULL,
  name_norm         text,
  party_abbr        text,
  party_full        text,
  gender            text,
  dob               date,
  age               integer,
  no_of_terms       integer,
  qualification     text,
  profession        text,
  status            text        NOT NULL,   -- 'Sitting'|'Died'|'Resigned'|'Term Ended'
  term_start        date,
  term_end          date,
  -- Ministers/Speaker are legitimately absent from the attendance, questions
  -- and private-member-bill counters. Flagged here, honoured by the
  -- metrics_excluded CHECK on in_mp_activity.
  is_minister       boolean     NOT NULL DEFAULT false,
  minister_note     text,
  profile_url       text,
  image_url         text,
  data_source       text        NOT NULL DEFAULT 'sansad.in api_ls/api_rs',
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT in_mps_natural_key UNIQUE (mpsno, house, term_label),
  CONSTRAINT in_mps_house_chk  CHECK (house IN ('LS', 'RS')),
  CONSTRAINT in_mps_status_chk CHECK (
    status IN ('Sitting', 'Died', 'Resigned', 'Disqualified', 'Term Ended')),
  CONSTRAINT in_mps_pc_only_for_ls CHECK (house = 'LS' OR pc_code IS NULL),
  CONSTRAINT in_mps_pc_match_method_chk CHECK (
    pc_match_method IS NULL OR
    pc_match_method IN ('exact_normalized', 'alias_table', 'manual_reviewed')),
  CONSTRAINT in_mps_matched_rows_have_method CHECK (
    pc_code IS NULL OR pc_match_method IS NOT NULL)
);
-- At most one SITTING Lok Sabha member per seat. Bypolls are fine (the
-- predecessor's status is 'Died'/'Resigned'); the 3 currently vacant seats
-- simply have no sitting row. A duplicate roster join fails here.
CREATE UNIQUE INDEX IF NOT EXISTS in_mps_one_sitting_per_pc
  ON public.in_mps (pc_code)
  WHERE house = 'LS' AND status = 'Sitting' AND pc_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS in_mps_pc_idx    ON public.in_mps (pc_code);
CREATE INDEX IF NOT EXISTS in_mps_mpsno_idx ON public.in_mps (mpsno);

-- ---------------------------------------------------------------------------
-- 4. in_mp_affidavits — MyNeta / ADR affidavit facts.
--    Amounts are stored in whole rupees exactly as declared (bigint, lossless);
--    the surface layer renders crore. This deliberately differs from
--    elected_reps.total_assets_cr, which is lossy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_mp_affidavits (
  id                     bigserial   PRIMARY KEY,
  myneta_candidate_id    integer     NOT NULL,
  election               text        NOT NULL,   -- 'LokSabha2024'
  profile_url            text,
  -- MyNeta's OWN constituency numbering. NOT the ECI PC number. Never treat
  -- this as pc_no (Bangalore Central: MyNeta 185, ECI PC 25).
  myneta_constituency_id integer,
  constituency_label     text,
  state_label            text,
  pc_code                text        REFERENCES public.in_constituencies (pc_code) ON UPDATE CASCADE,
  mp_id                  bigint      REFERENCES public.in_mps (id) ON DELETE SET NULL,
  is_winner              boolean     NOT NULL DEFAULT false,
  candidate_name         text        NOT NULL,
  party_abbr             text,
  party_full             text,
  age                    integer,
  self_profession        text,
  spouse_profession      text,
  education_category     text,
  education_detail       text,
  criminal_cases         integer,
  criminal_cases_detail  jsonb,
  total_assets_inr       bigint,
  liabilities_inr        bigint,
  declared_assets_history jsonb,               -- MyNeta "Other Elections" trend
  parse_status           text        NOT NULL DEFAULT 'ok',  -- 'ok'|'partial'|'failed'
  match_method           text,
  needs_review           boolean     NOT NULL DEFAULT true,
  data_source            text        NOT NULL DEFAULT 'ECI affidavits via myneta.info (ADR)',
  scraped_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT in_mp_affidavits_key UNIQUE (myneta_candidate_id, election),
  CONSTRAINT in_mp_affidavits_parse_status_chk CHECK (
    parse_status IN ('ok', 'partial', 'failed')),
  -- On MyNeta a candidate with zero cases has NO "Number of Criminal Cases"
  -- text at all — absence, not "0". A fully parsed page must therefore record
  -- an explicit integer (0 included); NULL means "we could not read the page".
  CONSTRAINT in_mp_affidavits_cases_explicit CHECK (
    parse_status <> 'ok' OR criminal_cases IS NOT NULL),
  CONSTRAINT in_mp_affidavits_cases_nonneg CHECK (
    criminal_cases IS NULL OR criminal_cases >= 0),
  CONSTRAINT in_mp_affidavits_amounts_nonneg CHECK (
    (total_assets_inr IS NULL OR total_assets_inr >= 0) AND
    (liabilities_inr  IS NULL OR liabilities_inr  >= 0)),
  -- MyNeta shares no id with any other source. The ONLY permitted bridges are
  -- the alias table, the one-winner-per-PC structural constraint, and a human.
  -- There is no fuzzy / name-similarity option, on purpose.
  CONSTRAINT in_mp_affidavits_match_method_chk CHECK (
    match_method IS NULL OR
    match_method IN ('alias_table', 'one_winner_per_pc', 'manual_reviewed')),
  CONSTRAINT in_mp_affidavits_matched_rows_have_method CHECK (
    pc_code IS NULL OR match_method IS NOT NULL),
  CONSTRAINT in_mp_affidavits_matched_rows_reviewed CHECK (
    needs_review OR pc_code IS NOT NULL)
);
-- THE constraint. Exactly one winner per seat per election — so a wrong
-- MyNeta↔PC join raises a unique violation instead of double-counting a seat.
CREATE UNIQUE INDEX IF NOT EXISTS in_mp_affidavits_one_winner_per_pc
  ON public.in_mp_affidavits (election, pc_code)
  WHERE is_winner AND pc_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS in_mp_affidavits_pc_idx     ON public.in_mp_affidavits (pc_code);
CREATE INDEX IF NOT EXISTS in_mp_affidavits_review_idx ON public.in_mp_affidavits (needs_review)
  WHERE needs_review;

-- ---------------------------------------------------------------------------
-- 5. in_mp_activity — attendance / questions / debates.
--    period_kind = 'session' for sansad.in + Zenodo per-session rows,
--                  'term'    for PRS's term-cumulative MP Track figures
--                            (which use session_no = 0).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_mp_activity (
  id                      bigserial   PRIMARY KEY,
  mp_id                   bigint      NOT NULL REFERENCES public.in_mps (id) ON DELETE CASCADE,
  mpsno                   integer     NOT NULL,   -- denormalized, for debugging joins
  house                   text        NOT NULL,
  term_label              text        NOT NULL,
  period_kind             text        NOT NULL,   -- 'session' | 'term'
  session_no              integer     NOT NULL,   -- 0 for period_kind='term'
  session_label           text,
  session_start           date,
  session_end             date,
  sittings_held           integer,
  signed_days             integer,
  attendance_pct          numeric(5,2),
  questions_asked         integer,
  debates                 integer,
  private_member_bills    integer,
  committees              integer,
  metrics_excluded        boolean     NOT NULL DEFAULT false,
  metrics_excluded_reason text,
  data_source             text        NOT NULL,   -- 'zenodo:10.5281/zenodo.18146342' | 'sansad.in' | 'prsindia.org'
  ingested_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT in_mp_activity_key UNIQUE (mp_id, period_kind, session_no),
  CONSTRAINT in_mp_activity_house_chk       CHECK (house IN ('LS', 'RS')),
  CONSTRAINT in_mp_activity_period_kind_chk CHECK (period_kind IN ('session', 'term')),
  CONSTRAINT in_mp_activity_term_session_no CHECK (
    period_kind <> 'term' OR session_no = 0),
  CONSTRAINT in_mp_activity_session_no_positive CHECK (
    period_kind <> 'session' OR session_no > 0),
  CONSTRAINT in_mp_activity_attendance_range CHECK (
    attendance_pct IS NULL OR (attendance_pct >= 0 AND attendance_pct <= 100)),
  -- Ministers and the Speaker do not sign the register, ask questions or file
  -- private member bills — corroborated by PRS's mp_note and sansad.in's
  -- signedDaysCount independently. Excluded rows carry NULL, NEVER 0, so no
  -- read path can rank a minister as an absentee.
  CONSTRAINT in_mp_activity_excluded_is_null_not_zero CHECK (
    NOT metrics_excluded OR (
      signed_days          IS NULL AND
      attendance_pct       IS NULL AND
      questions_asked      IS NULL AND
      private_member_bills IS NULL)),
  CONSTRAINT in_mp_activity_excluded_has_reason CHECK (
    NOT metrics_excluded OR metrics_excluded_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS in_mp_activity_mp_idx ON public.in_mp_activity (mp_id);

-- ---------------------------------------------------------------------------
-- 6. in_mplads_summary — per-MP MPLADS aggregate. eSAKSHI (authoritative,
--    aggregate-only) and Empowered Indian (unofficial, richer) rows coexist,
--    separated by "source", so a read path always knows what it is citing.
--    Amounts in whole rupees; eSAKSHI reports paise, hence numeric.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_mplads_summary (
  id                      bigserial     PRIMARY KEY,
  mp_id                   bigint        REFERENCES public.in_mps (id) ON DELETE SET NULL,
  mpsno                   integer,
  pc_code                 text          REFERENCES public.in_constituencies (pc_code) ON UPDATE CASCADE,
  house                   text          NOT NULL,
  term_label              text          NOT NULL,
  source                  text          NOT NULL,   -- 'esakshi' | 'empoweredindian'
  source_mp_key           text          NOT NULL,   -- the source's own MP identifier
  source_constituency_key text,                     -- eSAKSHI constituency ID, etc.
  mp_name_source          text,
  allocated_inr           numeric(18,2),
  expenditure_inr         numeric(18,2),
  unspent_inr             numeric(18,2),
  utilization_pct         numeric(6,2),
  works_recommended       integer,
  works_sanctioned        integer,
  works_completed         integer,
  captured_at             timestamptz   NOT NULL DEFAULT now(),
  data_source             text          NOT NULL,
  CONSTRAINT in_mplads_summary_key UNIQUE (source, house, term_label, source_mp_key),
  CONSTRAINT in_mplads_summary_source_chk CHECK (source IN ('esakshi', 'empoweredindian')),
  CONSTRAINT in_mplads_summary_house_chk  CHECK (house IN ('LS', 'RS')),
  CONSTRAINT in_mplads_summary_amounts_nonneg CHECK (
    (allocated_inr   IS NULL OR allocated_inr   >= 0) AND
    (expenditure_inr IS NULL OR expenditure_inr >= 0)),
  CONSTRAINT in_mplads_summary_pc_only_for_ls CHECK (house = 'LS' OR pc_code IS NULL)
);
CREATE INDEX IF NOT EXISTS in_mplads_summary_pc_idx ON public.in_mplads_summary (pc_code);
CREATE INDEX IF NOT EXISTS in_mplads_summary_mp_idx ON public.in_mplads_summary (mp_id);

-- ---------------------------------------------------------------------------
-- 7. in_central_projects — MoSPI Table 6 project identity. project_code is
--    ~99% stable month-over-month (Mar→Apr 99.1%, Apr→May 98.5%), so it is
--    the key; legacy_ocms_code is kept for the pre-2021 backfill.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_central_projects (
  project_code     text        PRIMARY KEY,
  legacy_ocms_code text,
  pmgid            text,                    -- appeared in the Apr 2026 report
  project_name     text        NOT NULL,
  ministry         text,
  sector           text,
  agency           text,
  state_raw        text,                    -- verbatim MoSPI state string
  st_code          integer,                 -- resolved via alias table; NULL if multi-state
  is_multi_state   boolean     NOT NULL DEFAULT false,
  first_seen_month date        NOT NULL,
  last_seen_month  date        NOT NULL,
  is_ongoing       boolean     NOT NULL DEFAULT true,
  data_source      text        NOT NULL DEFAULT 'MoSPI Flash Report Table 6 (PAIMANA)',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT in_central_projects_months_ordered CHECK (last_seen_month >= first_seen_month)
);
CREATE INDEX IF NOT EXISTS in_central_projects_state_idx ON public.in_central_projects (st_code);
CREATE INDEX IF NOT EXISTS in_central_projects_ocms_idx  ON public.in_central_projects (legacy_ocms_code)
  WHERE legacy_ocms_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. in_central_project_snapshots — one immutable row per project per report
--    month. This is what makes the overrun tracker a time series rather than
--    a "latest value" table: Apr→May 2026 alone carries 450 schedule slips
--    and 11 cost revisions.
--
--    SCHEMA DRIFT: MoSPI changed Table 6's column set between March and April
--    2026 (PMGID added) and the pre-2021 layout differs again. "raw" holds
--    every parsed field the loader did not recognise, so a new column never
--    fails an ingest and can be promoted to a first-class column later,
--    additively, without losing the months in between.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_central_project_snapshots (
  project_code              text          NOT NULL
                              REFERENCES public.in_central_projects (project_code) ON DELETE CASCADE,
  report_month              date          NOT NULL,   -- first day of the report month
  sl_no                     integer,
  approval_month            date,
  start_month               date,
  original_doc_month        date,                     -- original commissioning schedule
  revised_doc_month         date,                     -- revised commissioning schedule
  original_cost_cr          numeric(14,2),
  revised_cost_cr           numeric(14,2),
  cumulative_expenditure_cr numeric(14,2),
  physical_progress_pct     numeric(5,2),
  cost_overrun_cr           numeric(14,2)
                              GENERATED ALWAYS AS (revised_cost_cr - original_cost_cr) STORED,
  -- computed by the loader, which owns the MM/YYYY parsing rules
  schedule_slip_months      integer,
  raw                       jsonb         NOT NULL DEFAULT '{}'::jsonb,
  source_page               integer,
  source_pdf_url            text,
  parser_version            text          NOT NULL,
  ingested_at               timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT in_central_project_snapshots_pkey PRIMARY KEY (project_code, report_month),
  CONSTRAINT in_central_project_snapshots_month_is_first CHECK (
    EXTRACT(DAY FROM report_month) = 1),
  CONSTRAINT in_central_project_snapshots_progress_range CHECK (
    physical_progress_pct IS NULL OR
    (physical_progress_pct >= 0 AND physical_progress_pct <= 100)),
  CONSTRAINT in_central_project_snapshots_costs_nonneg CHECK (
    (original_cost_cr IS NULL OR original_cost_cr >= 0) AND
    (revised_cost_cr  IS NULL OR revised_cost_cr  >= 0))
);
CREATE INDEX IF NOT EXISTS in_central_project_snapshots_month_idx
  ON public.in_central_project_snapshots (report_month);

-- ---------------------------------------------------------------------------
-- 9. v_in_central_project_changes — month-over-month diff. Powers the overrun
--    tracker's "what changed this month" without the frontend re-deriving it.
-- ---------------------------------------------------------------------------
-- DROP + CREATE rather than CREATE OR REPLACE: replacing a view can only
-- APPEND columns, so any future reshuffle of this select list would make the
-- migration fail on re-run. The view is owned entirely by this migration and
-- nothing depends on it, so dropping it is safe and keeps re-runs green.
DROP VIEW IF EXISTS public.v_in_central_project_changes;
CREATE VIEW public.v_in_central_project_changes AS
  SELECT
    s.project_code,
    s.report_month,
    lag(s.report_month)              OVER w AS prev_report_month,
    s.revised_cost_cr,
    lag(s.revised_cost_cr)           OVER w AS prev_revised_cost_cr,
    s.revised_doc_month,
    lag(s.revised_doc_month)         OVER w AS prev_revised_doc_month,
    s.cumulative_expenditure_cr,
    lag(s.cumulative_expenditure_cr) OVER w AS prev_cumulative_expenditure_cr,
    s.physical_progress_pct,
    lag(s.physical_progress_pct)     OVER w AS prev_physical_progress_pct,
    s.cost_overrun_cr,
    lag(s.cost_overrun_cr)           OVER w AS prev_cost_overrun_cr,
    s.schedule_slip_months,
    lag(s.schedule_slip_months)      OVER w AS prev_schedule_slip_months,
    (lag(s.revised_cost_cr)  OVER w IS NOT NULL
      AND s.revised_cost_cr  IS DISTINCT FROM lag(s.revised_cost_cr)  OVER w) AS cost_revised,
    (lag(s.revised_doc_month) OVER w IS NOT NULL
      AND s.revised_doc_month IS DISTINCT FROM lag(s.revised_doc_month) OVER w) AS schedule_changed
  FROM public.in_central_project_snapshots s
  WINDOW w AS (PARTITION BY s.project_code ORDER BY s.report_month);

-- ---------------------------------------------------------------------------
-- 10. RLS. Matches the posture set by the merged surgical-fix migration:
--     RLS enabled everywhere, one explicitly NAMED "<table>_anon_read" SELECT
--     policy per public table, GRANT SELECT to anon+authenticated, and NO
--     anon INSERT/UPDATE/DELETE anywhere (writes are service-role ETL only).
--
--     in_mp_affidavits is row-restricted rather than blanket-open, exactly
--     like ward_reports_anon_read_approved: a row is only publicly readable
--     once its MyNeta↔PC join has been resolved (needs_review = false) and the
--     source page parsed cleanly. Unreviewed criminal-case rows must never be
--     served to the public.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[${PUBLIC_READ_TABLES.map(t => `'${t}'`).join(", ")}]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_anon_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        t || '_anon_read', t);
    END IF;
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.in_mp_affidavits ENABLE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'in_mp_affidavits'
       AND policyname = 'in_mp_affidavits_anon_read_matched'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY in_mp_affidavits_anon_read_matched
        ON public.in_mp_affidavits
        FOR SELECT TO anon, authenticated
        USING (needs_review = false AND parse_status = 'ok')
    $sql$;
  END IF;
  EXECUTE 'GRANT SELECT ON public.in_mp_affidavits TO anon, authenticated';
END $$;

GRANT SELECT ON public.v_in_central_project_changes TO anon, authenticated;

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
  for (const name of [...TABLES, ...VIEWS]) {
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
  console.log(`\nWould create ${TABLES.length} tables + ${VIEWS.length} view:`)
  for (const t of TABLES) console.log(`  table  ${t}`)
  for (const v of VIEWS)  console.log(`  view   ${v}`)
  console.log("\nRLS:")
  for (const t of PUBLIC_READ_TABLES) console.log(`  ${t}: ENABLE RLS + ${t}_anon_read (USING true) + GRANT SELECT`)
  console.log("  in_mp_affidavits: ENABLE RLS + in_mp_affidavits_anon_read_matched")
  console.log("                    (USING needs_review = false AND parse_status = 'ok') + GRANT SELECT")
  console.log("\nTouches NO existing table, column, policy or grant.")

  const existing = await probeExisting()
  if (existing) {
    console.log("\n--- current state (PostgREST probe, read-only) ---")
    for (const [k, v] of Object.entries(existing)) console.log(`  ${k.padEnd(30)} ${v}`)
    const already = Object.values(existing).filter(v => v === "EXISTS").length
    console.log(already
      ? `\n  ${already} object(s) already exist — apply is idempotent and will not drop or truncate them.`
      : "\n  none exist yet — this would be a clean create.")
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
  const list = TABLES.map(t => `'${t}'`).join(", ")
  const sections = [
    ["tables", `SELECT table_name FROM information_schema.tables
                 WHERE table_schema='public' AND table_name IN (${list})
                 ORDER BY table_name;`],
    ["columns", `SELECT table_name, ordinal_position, column_name, data_type,
                        is_nullable, column_default, is_generated
                   FROM information_schema.columns
                  WHERE table_schema='public' AND table_name IN (${list})
                  ORDER BY table_name, ordinal_position;`],
    ["constraints", `SELECT rel.relname AS table_name, con.conname, con.contype,
                            pg_get_constraintdef(con.oid) AS def
                       FROM pg_constraint con
                       JOIN pg_class rel ON rel.oid = con.conrelid
                       JOIN pg_namespace n ON n.oid = rel.relnamespace
                      WHERE n.nspname='public' AND rel.relname IN (${list})
                      ORDER BY rel.relname, con.conname;`],
    ["indexes", `SELECT tablename, indexname, indexdef FROM pg_indexes
                  WHERE schemaname='public' AND tablename IN (${list})
                  ORDER BY tablename, indexname;`],
    ["policies", `SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
                    FROM pg_policies
                   WHERE schemaname='public' AND tablename IN (${list})
                   ORDER BY tablename, policyname;`],
    ["rls_enabled", `SELECT rel.relname, rel.relrowsecurity, rel.relforcerowsecurity
                       FROM pg_class rel JOIN pg_namespace n ON n.oid = rel.relnamespace
                      WHERE n.nspname='public' AND rel.relname IN (${list})
                      ORDER BY rel.relname;`],
    ["grants", `SELECT table_name, grantee, privilege_type
                  FROM information_schema.role_table_grants
                 WHERE table_schema='public'
                   AND table_name IN (${list}, 'v_in_central_project_changes')
                   AND grantee IN ('anon','authenticated')
                 ORDER BY table_name, grantee, privilege_type;`],
    ["row_counts", `SELECT relname, n_live_tup FROM pg_stat_user_tables
                     WHERE schemaname='public' AND relname IN (${list})
                     ORDER BY relname;`],
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
  console.log(`project: ${PROJECT} · ${TABLES.length} tables + ${VIEWS.length} view · additive only`)
  await dbq(SQL)
  console.log("SQL applied OK.")

  const created = await dbq(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN (${TABLES.map(t => `'${t}'`).join(", ")})
     ORDER BY table_name;`)
  console.log("\ntables now present:\n" + JSON.stringify(created, null, 2))

  const pol = await dbq(`
    SELECT tablename, policyname, cmd, roles, qual AS using_expr
      FROM pg_policies
     WHERE schemaname='public' AND tablename IN (${TABLES.map(t => `'${t}'`).join(", ")})
     ORDER BY tablename, policyname;`)
  console.log("\npolicies on the new tables:\n" + JSON.stringify(pol, null, 2))

  const geom = await dbq(`
    SELECT column_name, udt_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='in_constituencies' AND column_name='geom';`)
  console.log("\nin_constituencies.geom:\n" + JSON.stringify(geom))
}

;(INSPECT ? inspect() : APPLY ? apply() : dryRun())
  .catch(e => { console.error("FAILED:", e); process.exit(1) })
