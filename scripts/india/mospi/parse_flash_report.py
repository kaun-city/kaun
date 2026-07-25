#!/usr/bin/env python3
"""parse_flash_report.py — extract Table 6 "All Ongoing Projects" out of a MoSPI
flash report PDF (2024-25 report format onward).

    python3 scripts/india/mospi/parse_flash_report.py <input.pdf> [--out out.json]

Writes a JSON document to --out (or stdout):

    {
      "parser_version": "...",
      "report_month": "2026-05-01" | null,     # first of the report's own month
      "stated_project_count": 1987 | null,     # the report's OWN headline figure
      "extracted_count": 1987,
      "pages_used": 111, "total_pages": 163,
      "warnings": [...],
      "records": [ {...}, ... ]
    }

THIS IS THE PARSE STEP ONLY. It never touches a database and has no Supabase
dependency: the loader that writes in_central_projects /
in_central_project_snapshots is scripts/india/load-central-projects.mjs, in Node
like every other adapter in this repo. Python earns its place here and only
here, because Table 6 exists solely inside a ~160-page PDF and pdfplumber is
what reads it.

Ported from india-recon/mospi-projects/parse_flash_report.py, which was proven
against three consecutive months (1,987/1,987, 1,981/1,981 and 1,941/1,941 rows,
zero missing fields). Two hard-won details survive verbatim and must not be
"simplified":

  1. EXPLICIT LINE COORDINATES. pdfplumber's automatic "lines" table strategy
     non-deterministically collapses every column into one cell on some pages
     that have identical grid geometry to pages where it works. Forcing explicit
     vertical/horizontal line positions taken from the page's own drawn lines
     side-steps that instability.
  2. A BALANCED-PAREN SCANNER for the project-name cell. Agency names contain
     nested parens — "(Central Organisation for Railway Electrification (CORE))"
     — which a naive regex splits in the wrong place.

Added here, for the loader's sanity gate: the report's own stated project count
and its month, read off the summary page. Recon compared those by hand; the
pipeline has to do it automatically, because "the layout moved" and "the data
changed" look identical from downstream.
"""

import argparse
import json
import re
import sys
from collections import Counter

try:
    import pdfplumber
except ImportError:  # pragma: no cover - dependency is pinned in requirements.txt
    sys.exit("Missing dependency: pip install -r scripts/india/mospi/requirements.txt")


PARSER_VERSION = "flash-report-2024-25-format/v1"

MONTHS = {
    "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "APRIL": 4, "MAY": 5, "JUNE": 6,
    "JULY": 7, "AUGUST": 8, "SEPTEMBER": 9, "OCTOBER": 10, "NOVEMBER": 11,
    "DECEMBER": 12,
}


# ---------------------------------------------------------------------------
# Page-level table extraction
# ---------------------------------------------------------------------------

def find_vlines(page):
    return sorted(set(round(l["x0"], 1) for l in page.lines if abs(l["x0"] - l["x1"]) < 0.5))


def find_hlines(page):
    return sorted(set(round(l["top"], 1) for l in page.lines if abs(l["top"] - l["bottom"]) < 0.5))


def is_candidate_page(text):
    """
    A page that plausibly holds a slice of the FULL per-project annexure
    ("Table 6: All Ongoing Projects"). Deliberately excludes lookalike tables
    that share the same column layout but are subsets/other cuts of the data:
      - "Ongoing Projects of North Eastern Region" (Table 5, a state subset)
      - "Completed Projects During Month" (different schedule semantics)
      - "Newly Added Projects" (different column set, no expenditure/progress)
    """
    if "Sl.No" not in text or "Project Name" not in text:
        return False
    return "All Ongoing Projects" in text


def extract_page_table(page):
    vpos = find_vlines(page)
    hpos = find_hlines(page)
    if len(vpos) < 6 or len(hpos) < 2:
        return None
    settings = {
        "vertical_strategy": "explicit",
        "horizontal_strategy": "explicit",
        "explicit_vertical_lines": vpos,
        "explicit_horizontal_lines": hpos,
    }
    tables = page.extract_tables(table_settings=settings)
    if not tables:
        return None
    # Title-row-only artifacts sometimes appear as a spurious extra small table.
    return max(tables, key=len)


# ---------------------------------------------------------------------------
# Cell-level parsing
# ---------------------------------------------------------------------------

def extract_top_level_parens(line):
    """
    Extract top-level '(...)' groups, allowing nested parens inside a group
    (agency names like "(Central Organisation for Railway Electrification
    (CORE))"). Returns (groups, remainder_text_outside_parens).
    """
    groups = []
    depth = 0
    start = None
    buf = []
    for i, ch in enumerate(line):
        if ch == "(":
            if depth == 0:
                start = i + 1
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
            if depth == 0 and start is not None:
                groups.append(line[start:i])
                start = None
        else:
            if depth == 0:
                buf.append(ch)
    return groups, "".join(buf).strip()


def is_code_line(line):
    """A line consisting entirely of one or more parenthesized groups."""
    groups, remainder = extract_top_level_parens(line)
    return bool(groups) and remainder == ""


def none_if_dash(v):
    if v is None:
        return None
    v = v.strip()
    return None if v in ("", "-", "NA", "N.A.") else v


def clean_num(v):
    v = none_if_dash(v)
    if v is None:
        return None
    v = v.replace(",", "").strip()
    try:
        return float(v)
    except ValueError:
        return v


def parse_project_name_cell(cell):
    """
    Cell text (newline-joined) looks like:
        <project name, 1-3 lines>
        (<agency>)
        (<project_code>)
        (<legacy_ocms_code>) (<pmgid>)      -- Apr 2026 onward
        (<legacy_ocms_code>)                -- pre Apr 2026 (no PMGID column)
    Trailing lines made up entirely of "(...)" groups are peeled off from the
    bottom; the first such line is the agency, subsequent ones are code fields.
    """
    if not cell:
        return {"project_name": None, "agency": None, "project_code": None,
                "legacy_ocms_code": None, "pmgid": None}
    lines = [l.strip() for l in cell.split("\n") if l.strip()]
    idx = len(lines)
    trailing = []
    while idx > 0 and is_code_line(lines[idx - 1]):
        trailing.insert(0, lines[idx - 1])
        idx -= 1
    agency = None
    codes = []
    for i, l in enumerate(trailing):
        groups, _ = extract_top_level_parens(l)
        if i == 0:
            agency = groups[0] if groups else None
            codes.extend(groups[1:])
        else:
            codes.extend(groups)
    project_name = " ".join(lines[:idx]).strip() or None
    return {
        "project_name": project_name,
        "agency": agency,
        "project_code": none_if_dash(codes[0]) if len(codes) > 0 else None,
        "legacy_ocms_code": none_if_dash(codes[1]) if len(codes) > 1 else None,
        "pmgid": none_if_dash(codes[2]) if len(codes) > 2 else None,
    }


def parse_two_line(cell):
    """'01/2026\\n(07/2026)' -> ('01/2026', '07/2026'); handles a missing 2nd line."""
    if not cell:
        return None, None
    parts = [p.strip() for p in cell.split("\n") if p.strip()]
    if not parts:
        return None, None
    first = none_if_dash(parts[0])
    second = None
    if len(parts) > 1:
        m = re.match(r"^\((.*)\)$", parts[1])
        second = none_if_dash(m.group(1) if m else parts[1])
    return first, second


def is_ministry_header(text):
    return bool(text) and text.strip().startswith(
        ("Ministry of", "Department of", "Department for")
    )


def find_sl_no_column(row):
    for i, cell in enumerate(row):
        if cell and cell.strip() == "Sl.No":
            return i
    return None


# ---------------------------------------------------------------------------
# Summary page — the report's own headline figures (used as a sanity gate)
# ---------------------------------------------------------------------------

def parse_summary(pdf, max_pages=8):
    """
    Read the report month and the stated ongoing-project count off the summary
    page. The layout is stable across the months checked:

        Flash Report
        MAY 2026
        Central Sector Infrastructure Projects Costing Rs. 150 crore & above
        1987 | 17 <Rs> ... <Rs> ... <Rs> ...
        Ongoing Projects | Original Cost Revised Cost

    Returns (report_month_iso | None, stated_count | None).
    """
    month_iso = None
    stated = None
    for page in pdf.pages[:max_pages]:
        text = page.extract_text() or ""
        if month_iso is None:
            m = re.search(r"\b(" + "|".join(MONTHS) + r")\s+(\d{4})\b", text.upper())
            if m:
                month_iso = f"{int(m.group(2)):04d}-{MONTHS[m.group(1)]:02d}-01"
        if stated is None and "Ongoing Projects" in text:
            lines = text.split("\n")
            for i, line in enumerate(lines):
                if not re.match(r"^\s*Ongoing Projects\s*\|", line):
                    continue
                # The figures line sits immediately above the label line.
                for back in range(1, 4):
                    if i - back < 0:
                        break
                    m = re.match(r"^\s*([\d,]{3,})\s*\|", lines[i - back])
                    if m:
                        stated = int(m.group(1).replace(",", ""))
                        break
                if stated is not None:
                    break
        if month_iso and stated:
            break
    return month_iso, stated


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def extract_projects(pdf_path):
    records = []
    warnings = []
    pages_used = 0
    current_ministry = None
    current_sector = None

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        report_month, stated_count = parse_summary(pdf)

        for pageno, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            if not is_candidate_page(text):
                continue

            table = extract_page_table(page)
            if table is None:
                warnings.append(f"page {pageno + 1}: candidate page but table extraction returned nothing")
                continue

            sl_col = None
            for row in table:
                c = find_sl_no_column(row)
                if c is not None:
                    sl_col = c
                    break
            if sl_col is None:
                warnings.append(f"page {pageno + 1}: could not locate 'Sl.No' header column, skipping page")
                continue

            pages_used += 1
            expected_cols = 8  # SlNo, ProjectName, State, Approval, DoC, Cost, Expenditure, Progress
            for row in table:
                cells = row[sl_col:sl_col + expected_cols]
                if len(cells) < expected_cols:
                    cells = cells + [None] * (expected_cols - len(cells))
                sl_no, proj_cell, state, appr_cell, doc_cell, cost_cell, expend_cell, prog_cell = cells

                if sl_no is not None and sl_no.strip() == "Sl.No":
                    continue  # repeated header row

                proj_text = (proj_cell or "").strip()
                other_blank = all(
                    (c is None or not c.strip())
                    for c in (state, appr_cell, doc_cell, cost_cell, expend_cell, prog_cell)
                )
                if (sl_no is None or not sl_no.strip()) and proj_text and other_blank:
                    if is_ministry_header(proj_text):
                        current_ministry = proj_text
                        current_sector = None
                    else:
                        current_sector = proj_text
                    continue

                if sl_no is None or not sl_no.strip():
                    continue  # blank/spacer row
                if not re.match(r"^\d+$", sl_no.strip()):
                    # Footnote/legend rows at the foot of the table sometimes
                    # land in the Sl.No column instead of being blank.
                    warnings.append(
                        f"page {pageno + 1}: skipped non-numeric Sl.No row: {sl_no.strip()[:60]!r}"
                    )
                    continue

                parsed_name = parse_project_name_cell(proj_cell)
                appr_start, appr_actual = parse_two_line(appr_cell)
                doc_orig, doc_revised = parse_two_line(doc_cell)
                cost_orig, cost_revised = parse_two_line(cost_cell)

                records.append({
                    "sl_no": none_if_dash(sl_no),
                    "ministry": current_ministry,
                    "sector": current_sector,
                    **parsed_name,
                    "state": none_if_dash((state or "").replace("\n", " ").strip()),
                    "approval_date": appr_start,
                    "start_date": appr_actual,
                    "original_target_doc": doc_orig,
                    "revised_doc": doc_revised,
                    "original_cost_cr": clean_num(cost_orig),
                    "revised_cost_cr": clean_num(cost_revised),
                    "cumulative_expenditure_cr": clean_num(expend_cell),
                    "physical_progress_pct": clean_num(prog_cell),
                    "source_page": pageno + 1,
                })

    dupes = Counter(r["project_code"] for r in records if r["project_code"])
    duplicate_codes = sorted(k for k, v in dupes.items() if v > 1)
    if duplicate_codes:
        warnings.append(f"duplicate project_code values: {duplicate_codes[:10]}")

    return {
        "parser_version": PARSER_VERSION,
        "source_pdf": str(pdf_path),
        "report_month": report_month,
        "stated_project_count": stated_count,
        "extracted_count": len(records),
        "pages_used": pages_used,
        "total_pages": total_pages,
        "missing_project_code": sum(1 for r in records if not r["project_code"]),
        "missing_project_name": sum(1 for r in records if not r["project_name"]),
        "missing_original_cost": sum(1 for r in records if r["original_cost_cr"] is None),
        "duplicate_project_codes": duplicate_codes,
        "warnings": warnings,
        "records": records,
    }


def main():
    ap = argparse.ArgumentParser(description="Parse Table 6 out of a MoSPI flash report PDF.")
    ap.add_argument("pdf_path")
    ap.add_argument("--out", help="write JSON here instead of stdout")
    args = ap.parse_args()

    result = extract_projects(args.pdf_path)
    payload = json.dumps(result, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload)
        summary = {k: v for k, v in result.items() if k != "records"}
        print(json.dumps(summary, ensure_ascii=False, indent=2), file=sys.stderr)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
