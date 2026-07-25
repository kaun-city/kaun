#!/usr/bin/env python3
"""load_flash_report.py — SKELETON. Populates in_central_projects and
in_central_project_snapshots from a MoSPI flash report PDF.

Usage:
    python scripts/india/mospi/load_flash_report.py --month 2026-05 [--apply]
    python scripts/india/mospi/load_flash_report.py --latest [--apply]
Env:
    SUPABASE_URL, SUPABASE_SERVICE_KEY

This is the one Python pipeline in the repo (everything else is Node) because
Table 6 only exists inside a ~160-page PDF and pdfplumber is the tool that
works. The wiki build already uses actions/setup-python, so the runner story
is solved.

WHY A SNAPSHOT PER MONTH
    project_code is stable month-over-month (Mar->Apr 99.1%, Apr->May 98.5%
    overlap; the non-overlap is genuine adds and completions, not ID churn).
    That stability is what makes a monthly snapshot table a real time series:
    Apr->May 2026 alone carries 450 revised commissioning dates and 11 revised
    costs. Storing only "latest" would throw the entire signal away.

SCHEMA DRIFT IS THE MAIN RISK
    MoSPI changed Table 6's column set between March and April 2026 (PMGID
    appeared) and the pre-2021 reports use a different multi-annexure layout
    entirely. Every parsed field the loader does not recognise goes into
    in_central_project_snapshots.raw (jsonb) rather than being dropped, so a
    new column never fails an ingest and can be promoted to a first-class
    column later, additively, without losing the months in between.
    parser_version is written on every row so a re-parse is attributable.

ARCHIVE ACCESS
    Old host ipm.mospi.gov.in migrated to paimana-proj.mospi.gov.in. Filename
    patterns changed 5+ times in 25 years, so always walk the JSON endpoints —
    never guess a URL. The legacy host's TLS cert is expired; if anything ever
    needs it, that is why. Publication lag is ~7-8 weeks.

STEPS
    1. GET ArchiveReport for the target FY, find the report for --month, and
       stream the PDF via ViewPdf.
    2. Parse Table 6 with the parser (see TODO below).
    3. Sanity-gate BEFORE writing: the report states its own project count.
       Refuse to load if extracted != stated. Recon hit 1,987/1,987,
       1,981/1,981 and 1,941/1,941 across three months with zero missing
       fields, so anything less than an exact match means the layout moved.
    4. Upsert in_central_projects (identity, first_seen/last_seen months).
    5. Insert in_central_project_snapshots for report_month = first of month.
       Idempotent on (project_code, report_month).
    6. Convert MM/YYYY date cells to the first of that month; compute
       schedule_slip_months here (the loader owns the date parsing rules).

TODO: port india-recon/mospi-projects/parse_flash_report.py into this
      directory. It already extracts Table 6 cleanly — forcing explicit
      line-coordinate table extraction (pdfplumber's default detection
      non-deterministically collapses columns) and a balanced-paren scanner
      for nested parens in agency names. Do not rewrite it from scratch.
TODO: old-format parser for pre-2021 reports (data goes back to 2001-02, and
      legacy OCMS codes are shared between the 2020 and 2026 reports, so the
      backfill is reachable once the old layout is handled).
TODO: 2024-25 months are split into Part-I / Part-II PDFs; unhandled.
TODO: resolve state_raw to st_code via in_pc_source_aliases (source='mospi').
      Multi-state projects set is_multi_state and leave st_code NULL.
"""

import argparse
import sys

PARSER_VERSION = "flash-report-2024-25-format/v1"

PAIMANA = "https://paimana-proj.mospi.gov.in"
ENDPOINTS = {
    "financial_years": f"{PAIMANA}/ReportPage/GetArchiveFinancialYearList",
    "reports": f"{PAIMANA}/ReportPage/ArchiveReport",   # ?fyear=...&reportType=F
    "pdf": f"{PAIMANA}/ReportPage/ViewPdf",             # ?id=N&path=...
}

# Columns the loader knows about. Anything else the parser returns goes into
# in_central_project_snapshots.raw so a MoSPI column addition cannot break an
# ingest (this is exactly how PMGID arrived in April 2026).
KNOWN_FIELDS = {
    "sl_no", "ministry", "sector", "project_name", "agency", "project_code",
    "legacy_ocms_code", "pmgid", "state", "approval_date", "start_date",
    "original_target_doc", "revised_doc", "original_cost_cr", "revised_cost_cr",
    "cumulative_expenditure_cr", "physical_progress_pct", "source_page",
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--month", help="report month as YYYY-MM")
    ap.add_argument("--latest", action="store_true", help="use the newest published report")
    ap.add_argument("--apply", action="store_true", help="write to Supabase")
    args = ap.parse_args()

    print("load_flash_report — SKELETON, no extract implemented yet")
    print(f"parser_version: {PARSER_VERSION}")
    print(f"endpoints: {ENDPOINTS}")
    print(f"known fields: {len(KNOWN_FIELDS)} (everything else -> snapshots.raw)")
    print(f"target: {'latest' if args.latest else args.month}")

    if args.apply:
        print("\n--apply is not implemented yet; refusing to write.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
