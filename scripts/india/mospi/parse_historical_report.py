#!/usr/bin/env python3
"""parse_historical_report.py — extract the per-project annexure out of a PRE-2025-26
MoSPI flash report PDF.

    python3 scripts/india/mospi/parse_historical_report.py <input.pdf> [--out out.json]

Emits the SAME JSON contract as its modern sibling parse_flash_report.py, so the
two loaders can be read side by side:

    { "parser_version", "era", "report_month", "stated_project_count",
      "extracted_count", "pages_used", "total_pages", "warnings", "records": [...] }

WHY A SECOND PARSER RATHER THAN A BIGGER FIRST ONE
==================================================
parse_flash_report.py reads a genuinely BORDERED table: the 2025-26 format draws
every cell, so forcing pdfplumber to use the page's own drawn line coordinates is
both possible and (as that file documents at length) necessary.

Nothing before that draws those lines. The older annexures are whitespace-aligned
text tables with no cell borders at all, so a line-coordinate strategy has nothing
to latch onto and pdfplumber's table extraction returns nothing. A different
document calls for a different reader; merging the two would produce one function
with two disjoint halves and a flag.

THE ERAS
========
Established by reading one report per financial year, 2001-02 to 2024-25:

  2001-04 … 2009-04   summary-only reports (17-50 pages). The per-project table
                      exists but carries NO OCMS project code, and stacks
                      original/(revised)/[anticipated] inside single cells. NOT
                      PARSED HERE — see "the identity floor" below. The cutover
                      falls INSIDE 2009-10: April 2009 has no coded annexure and
                      October 2009 does, which is exactly why the era is decided
                      per report from the document and never from the year.
  2009-10 … April 2020  one consolidated annexure holding every ongoing project,
                      titled "Sector Wise Details" (2012-2016), "Detail of
                      ongoing Projects Costing Rs 150 Crore and above"
                      (2017-2020), or untitled (2009-2011). This is the era the
                      committed backfill covers.
  Oct 2020 … 2024-25  no trustworthy consolidated annexure. One is often still
                      printed, but either with no column-number row for the
                      geometry to anchor on (October 2020's stacked three-line
                      layout) or misattributing rows when read serial-first
                      (April 2021 prints the serial at the BOTTOM of each road
                      project's block). What IS readable is the partition: the ongoing
                      list is cut FIVE ways, not the three it first appears —
                      "Details of Delayed Projects w.r.t. Original Schedule",
                      "…On Schedule Projects w.r.t. Original Schedule",
                      "…Projects Without Date of Commissioning", "…Projects
                      Without ORIGINAL Date of Commissioning" (a distinct
                      annexure, previously mistaken for a re-cut), and
                      "…Projects Ahead of Schedule w.r.t. Original Schedule",
                      whose unique rows complete the union (see PARTITION_RES).
                      October 2020: 539 + 194 + 794 + 130 + 8 = 1,665 distinct
                      codes against a stated 1,666 — inside the loader's
                      documented MoSPI-disagrees-with-itself tolerance.
  October 2024        one report in a TRANSITIONAL format: the modern report's
                      table numbering and column semantics ("Table:-7. Project
                      List: Ongoing Projects as of 31st October 2024", a
                      per-project code, Original/(Revised)/{Anticipated} stacked
                      inside single Date-of-Commissioning and Cost columns) but
                      NONE of the 2025-26 format's drawn cell borders, and no
                      column-number row either — so neither parse_flash_report.py
                      (which anchors on drawn lines) nor the number-row-anchored
                      readers here can touch it. It gets its own reader below
                      (see "THE TRANSITIONAL FORMAT"). Its "(N24000821)"-style
                      project codes ARE the OCMS codes the rest of this series
                      is keyed on — the modern bare-digit project_code did not
                      exist yet — so its rows join the series like any other.

THE IDENTITY FLOOR (why 2001-2009 is a documented gap, not a silent one)
------------------------------------------------------------------------
Every record this parser emits is keyed on the OCMS project code MoSPI prints in
the project cell — "[N06000123]", or "[060100093]" in the older numbering. That
code is the only thing that ties a row in one report to the same project in
another, and the loader refuses rows without one.

The 2001-02 to 2009-10 annexures print no code. The only join available there is
the project NAME, and names in this corpus are truncated at the cell edge, are
re-spelled between months, and repeat across genuinely different projects
("DOUBLING", "R AND U OF NH-31C"). Matching on them would manufacture a time
series out of string similarity. Those years are therefore inventoried (see
data/india/mospi-historical/archive-inventory.csv) and left unparsed.

HOW THE COLUMNS ARE FOUND: THE NUMBER ROW + THE GUTTERS
=======================================================
Every parsed annexure prints a row of column numbers — "1 2 3 4 5 6 7 8 9 10" —
under its header and above the first data row. Those word positions are column
ANCHORS, printed by MoSPI's own report generator, on every page, in the report's
own coordinate space.

Anchors alone are not enough. Splitting at the midpoint between two anchors
assumes columns of equal width, and these are not: the project column is ~170pt
wide and the serial column ~25pt, so the midpoint between their anchors falls
INSIDE the project text and shears every project name in half. So the anchors
only say how many columns there are and roughly where; the boundary between two
adjacent columns is then placed at the quietest x between them — the position
crossed by the fewest words on the page. That is the printed gutter, and it is
where the boundary actually is.

HOW THE COLUMNS ARE NAMED: THE HEADER, NOT THE YEAR
===================================================
The same bands read the header block above the number row, and each band's text
goes through a small keyword ladder (COLUMN_RULES). The ladder is ORDERED because
the labels overlap: MoSPI heads its expenditure column "Cumulative Expenditure
Cost", so "expenditure" must be tested before "cost"; "Anticipated Cost" is a
cost and bare "Anticipated" under "Date of Commissioning" is a date.

The result is that the untitled 10-column 2010-11 layout, the 2012-2016 "Sector
Wise Details" layout, the 2017-2020 layout and the post-2020 partition annexures
all parse through one code path. Eras only decide WHICH annexures to read.

THE UNITS TRAP, AND WHY "ANTICIPATED" IS THE MODERN "REVISED"
=============================================================
These reports carry THREE cost columns where the modern Table 6 carries two:

    Original / Revised Cost | Anticipated Cost | Cumulative Expenditure
       (approved) (approved)      (expected)         (spent so far)

The modern format's "Revised Cost" is the ANTICIPATED cost, not the revised
approved cost. That is not a guess — the reports do the arithmetic themselves:

  - April 2015 states original 10,69,127.84 cr, anticipated 12,78,256.35 cr and
    an overrun of 2,09,128.51 cr, which is anticipated minus original exactly.
  - KAKRAPAR 3&4 in April 2020 shows original DoC 12/2015, anticipated 09/2021,
    and a printed delay of "69(O)". 12/2015 → 09/2021 is 69 months. The revised
    approved date in the same row produces no such figure.

So `anticipated` maps to the schema's revised_cost_cr / revised_doc_month, and
the revised APPROVED figures are kept in `raw` (latest_approved_cost_cr,
approved_revised_doc) rather than thrown away. Getting this backwards would
silently zero out 14 years of cost overrun, which is the entire dataset.

Every cost column in every parsed era is ₹ crore — the annexure says so in its
own header, and check_units refuses a page that says otherwise rather than
trusting the year.

WHERE THE STATE COMES FROM, AND THE TWO WAYS IT USED TO BE LOST
==============================================================
There is no state COLUMN in any of these layouts. MoSPI prints the state inside
the project cell, after the OCMS code, as part of a comma-separated tail:

    GEVRA EXPANSION OCP (SECL) - [060100093]SECL,CHHATISGARH ,EPC
                                             ^agency ^state    ^funding type

Two things went wrong with that, and both produced a label that is not a place
and therefore resolved to nothing:

  1. THE TAIL HAS THREE FIELDS, not two, from 2016-17 onward. Joining everything
     past the agency into the state gave "PUNJAB, EPC", "MAHARASHTRA, PPP (BOT)",
     "TAMIL NADU, Central Sector Projects" and about ninety more. See
     parse_project_cell.
  2. A GROUP HEADING PRINTED BETWEEN TWO ROWS was being appended to the open
     row's cell, gluing the next block's agency onto the state above it —
     "TAMIL NADU Nuclear Power Corporation Of India Limited", "RAJASTHAN
     Northern Railway". See read_run and line_pitch; the hard part is that a
     heading and a cell that WRAPS mid-state ("…AAI,ARUNACHAL" / "PRADESH")
     are identical by every measure except the line spacing.

Two eras genuinely print no state, and NULL is the right answer there: October
2009 and April 2010 end the cell at the code, and the post-2020 "On Schedule"
and "Ahead of Schedule" cuts clip it PART-WAY THROUGH the code ("[N04000083"
with no closing bracket and nothing after). Nothing in this file invents one.

The label is emitted VERBATIM. Spelling variants ("CHHATISGARH"), abbreviations
("A & N ISLANDS") and line-wrapped words ("MAHARASHT RA") are resolved by the
loader against data/india/state-aliases.csv and the shared normaliser in
scripts/india/lib/pc-reference.mjs, which is where the closed set of 36 states
is known — not here.

GLUED SERIAL NUMBERS
====================
In several years the serial number and the first word of the project name are
emitted as one token ("105REBUILDING", "1093RD CONVERTER"). The split is
genuinely ambiguous — "1093RD" is 109 + "3RD", not 1093 + "RD" — so it is
resolved against the sequence: serials run 1..N in order, so the only acceptable
split is the one yielding the number expected next.
"""

import argparse
import json
import re
import sys
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict

try:
    import pdfplumber
except ImportError:  # dependency is pinned in scripts/india/mospi/requirements.txt
    # Deliberately not fatal at import time. Everything in this module except
    # extract_projects() is pure geometry and string handling over word boxes,
    # and the test suite exercises exactly that against committed fixtures — so
    # the tests must not need a PDF library installed to run.
    pdfplumber = None


PARSER_VERSION = "flash-report-historical/v1"

MONTHS = {
    "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "APRIL": 4, "MAY": 5, "JUNE": 6,
    "JULY": 7, "AUGUST": 8, "SEPTEMBER": 9, "OCTOBER": 10, "NOVEMBER": 11,
    "DECEMBER": 12,
}
MONTH_ABBR = {k[:3]: v for k, v in MONTHS.items()}

# OCMS project code: "[N06000123]" (post-2010 numbering) or "[060100093]"
# (older), often with the closing bracket clipped off by the cell edge.
OCMS_RE = re.compile(r"\[\s*([A-Z]?\d{6,})\s*\]?")
MMYYYY_RE = re.compile(r"^(\d{1,2})/(\d{4})$")
# Leading-dot figures are real: an expenditure of ₹0.42 crore prints as ".42",
# and requiring a digit before the point silently turned those into NULLs.
NUM_RE = re.compile(r"^-?(?:[\d,]+(?:\.\d+)?|\.\d+)$")

# Page furniture that spans the full width and would otherwise be bucketed into
# the header — "…Costing Rs 150 Crore…" landing in the cost column would rename
# it.
TITLE_NOISE_RE = re.compile(
    r"costing\s+rs|crore\s+and\s+above|all\s+cost/|^table\s*[-–]?\s*\d+|"
    r"^detail|^details|^list\s+of|^annexure|^statement|^status\s+of|"
    r"^sector\s+wise", re.I)

# Header text, lowercased with ALL whitespace removed, tested in order.
COLUMN_RULES = [
    # Overrun columns are READ, not a reason to skip the page. MoSPI's
    # "Details of Delayed Projects w.r.t. Original Schedule" — one of the five
    # annexures whose union IS the ongoing list from 2020-21 onward — carries
    # Time Overrun and Cost Overrun columns of its own. Treating an overrun
    # HEADER as a signal to skip the page threw that entire annexure away and
    # left four years of the series unparseable. The overrun RE-CUT annexures
    # are excluded by their titles (OTHER_ANNEXURE_RE), which is where that
    # decision belongs.
    ("timeoverrun",      "time_overrun_reported"),
    ("costoverrun",      "cost_overrun_reported"),
    ("expenditure",      "cumulative_expenditure"),
    ("milestone",        "milestones"),
    ("delay",            "delay_reported"),
    ("approval",         "approval"),
    ("physicalprogress", "physical_progress"),
]


def normalize_header(text):
    """
    Lowercase and drop every space AND hyphen.

    The hyphens are not decorative: the narrow columns wrap their labels with a
    soft hyphen — "Antici- pated", "Cumm. Expendi- ture" — so a naive
    whitespace-only strip leaves "antici-pated", which contains neither
    "anticipated" nor "anticipat" and silently loses the column.
    """
    return re.sub(r"[\s‐-―-]+", "", (text or "")).lower()


def classify_header(text):
    """Header text for one column -> field name, or None."""
    t = normalize_header(text)
    if not t:
        return None
    for needle, field in COLUMN_RULES:
        if needle in t:
            return field
    if "cost" in t:
        return "cost_anticipated" if "anticipat" in t else "cost_original_revised"
    if "anticipat" in t:
        return "doc_anticipated"          # under "Date of Commissioning"
    if "original" in t and "revised" in t:
        return "doc_original_revised"
    if "project" in t:
        return "project"
    # "Sl.No", "S.No", "SI.No" (an OCR-ish capital-i for l, which MoSPI really
    # does emit) — and the bare "sno" the hyphen strip can produce.
    if re.search(r"s[li]?\.?n[o0]", t):
        return "sl_no"
    return None


# ---------------------------------------------------------------------------
# Page geometry
# ---------------------------------------------------------------------------

# Anything printed larger than this is page decoration, not table text. The
# body of every parsed annexure is 8-14pt; the October 2021 / 2022 reports lay
# a 72pt "FOR REPORT" stamp ACROSS the table, and pdfplumber merges its letters
# character-by-character into whichever row they land on — "4 NEYVELI NEW
# THERMAL POWER PROJECT" comes out as "F4 NEYLVELI NEWA THERMAL PSOWER
# PRHOJECT", the serial cell reads "F4", the row stops being a row, and the
# annexure's serial run gains a hole. Dropping oversized characters before word
# assembly removes the stamp without touching a single body glyph.
WATERMARK_MIN_SIZE = 40.0


def visual_lines(page, tol=3.0):
    """Words grouped into printed lines, each sorted left to right."""
    try:
        words = page.filter(
            lambda obj: obj.get("object_type") != "char"
            or (obj.get("size") or 0) <= WATERMARK_MIN_SIZE).extract_words()
    except AttributeError:
        # Fixture pages implement extract_words() only — word boxes carry no
        # character sizes, so there is nothing to filter.
        words = page.extract_words()
    buckets = defaultdict(list)
    for w in words:
        buckets[round(w["top"] / tol)].append(w)
    return [(round(min(w["top"] for w in ws), 1), sorted(ws, key=lambda w: w["x0"]))
            for _, ws in sorted(buckets.items())]


def centre(word):
    return (word["x0"] + word["x1"]) / 2


def find_number_row(lines):
    """The '1 2 3 … N' column-anchor row -> (line index, [x centres])."""
    for i, (_, ws) in enumerate(lines):
        if len(ws) < 5:
            continue
        try:
            nums = [int(w["text"]) for w in ws]
        except ValueError:
            continue
        if nums == list(range(1, len(nums) + 1)):
            return i, [centre(w) for w in ws]
    return None, None


def gutter_edges(anchors, data_words, step=1.0):
    """
    Column boundaries: between each adjacent pair of anchors, the x crossed by
    the fewest words. Ties are broken towards the midpoint, so a page with no
    usable evidence degrades to the midpoint rule rather than to nonsense.

    Word-crossing counts, not ink coverage: the question is where a boundary can
    be drawn without cutting a word in half.
    """
    # Crossing count at x is (#words starting before x) - (#words ending at or
    # before x), which two sorted arrays and a binary search answer in log time.
    # The scan is otherwise the inner loop of the whole parser: a 600-page report
    # samples ~100 positions for each of 9 boundaries on each of 300 candidate
    # pages, and doing that against every word linearly took over an hour.
    starts = sorted(w["x0"] for w in data_words)
    ends = sorted(w["x1"] for w in data_words)

    def crossings(x):
        return bisect_left(starts, x) - bisect_right(ends, x)

    edges = []
    for a, b in zip(anchors, anchors[1:]):
        lo, hi = a + 1.0, b - 1.0
        if hi <= lo:
            edges.append((a + b) / 2)
            continue
        mid = (a + b) / 2
        best, best_key = mid, None
        x = lo
        while x <= hi:
            key = (crossings(x), abs(x - mid))
            if best_key is None or key < best_key:
                best, best_key = x, key
            x += step
        edges.append(best)
    return edges


def band_of(x, edges):
    for i, e in enumerate(edges):
        if x < e:
            return i
    return len(edges)


def bucket(words, edges):
    """Words -> {column index: joined text}."""
    cells = defaultdict(list)
    for w in words:
        cells[band_of(centre(w), edges)].append(w["text"])
    return {i: " ".join(parts) for i, parts in cells.items()}


def header_lines(lines, number_row_idx, max_height=150):
    """The printed lines that make up the column header block."""
    top_limit = lines[number_row_idx][0] - max_height
    out = []
    for top, ws in lines[:number_row_idx]:
        if top < top_limit:
            continue
        if TITLE_NOISE_RE.search(" ".join(w["text"] for w in ws)):
            continue
        out.append((top, ws))
    return out


def read_header(header_ws, edges, ncols):
    """Column headers, bucketed into the same bands as the data."""
    parts = defaultdict(list)
    for _top, ws in header_ws:
        for i, text in bucket(ws, edges).items():
            parts[i].append(text)
    return {i: " ".join(parts.get(i, [])) for i in range(ncols)}


# ---------------------------------------------------------------------------
# Cell-level parsing
# ---------------------------------------------------------------------------

def none_if_dash(v):
    if v is None:
        return None
    v = str(v).strip().strip(",").strip()
    return None if v in ("", "-", "--", "NA", "N.A.", ".", "(-)", "[-]") else v


def clean_num(v):
    """A ₹-crore figure, or None. Never a string: a cell that is not a number is
    a parse failure, not a value."""
    v = none_if_dash(v)
    if v is None:
        return None
    v = v.replace(",", "").strip()
    if not NUM_RE.match(v):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def clean_month(v):
    """'3/2016' -> '03/2016'; anything else -> None. Guards a date column against
    a stray number, and pins the field order so a DD/MM reading is impossible."""
    v = none_if_dash(v)
    if v is None:
        return None
    m = MMYYYY_RE.match(v)
    if not m or not (1 <= int(m.group(1)) <= 12):
        return None
    return f"{int(m.group(1)):02d}/{m.group(2)}"


def split_glued_sl_no(text, expected):
    """
    "105REBUILDING OF …" -> (105, "REBUILDING OF …").

    Ambiguous by construction ("1093RD CONVERTER" is 109 + "3RD CONVERTER", not
    1093 + "RD CONVERTER"), so the serial sequence decides.
    """
    text = text or ""
    # GLUED means no separator at all: "105REBUILDING". A continuation line like
    # "500 MWE) - [020100044]" has a space, is not a serial, and must not be
    # split — doing so invented serial numbers in the hundreds of thousands.
    m = re.match(r"^(\d{1,6})([A-Za-z].*)$", text)
    if not m:
        return None, text
    run = m.group(1)
    want = str(expected) if expected is not None else None
    # STRICT: the split is accepted only when it produces the serial we are
    # expecting next. Anything else is project text that merely starts with a
    # digit — "3RD AND 4TH LINE", "2 LANING FROM …" — and treating those as
    # serials tore a project's code line off into a record of its own.
    if want and run.startswith(want):
        return expected, text[len(want):].strip()
    return None, text


def parse_project_cell(text):
    """
    "GEVRA EXPANSION OCP (SECL) - [060100093]SECL,CHHATISGARH ,"
      -> name / ocms_code / agency / state

    2010-11 and 2011-12 clip the cell after the code ("[020100041]") and carry no
    agency or state at all, so everything past the code is optional.

    THE TAIL HAS THREE FIELDS, NOT TWO
    ----------------------------------
    MoSPI prints "<agency>,<state>,<funding or contract type>" after the code,
    and the third field is present from 2016-17 onward:

        [N02000010]NPCIL,GUJARAT , G
        [N24000385]MoRTH,PUNJAB ,EPC
        [N16000213]ONGC,MAHARASHTRA ,Central Sector Projects

    Joining everything past the agency into the state produced "PUNJAB, EPC",
    "MAHARASHTRA, PPP (BOT)", "TAMIL NADU, Central Sector Projects" and about
    ninety other variants, none of which is a state and none of which resolves.
    The state is the SECOND field; the third is a contract type this schema has
    no column for and is dropped rather than smuggled into a place name. (No
    state or UT in this corpus prints a comma inside its own name — every one of
    the 152 comma-bearing labels in the committed snapshots is a state followed
    by a funding type.)
    """
    text = re.sub(r"\s+", " ", (text or "")).strip()
    m = OCMS_RE.search(text)
    if not m:
        return {"project_name": none_if_dash(text), "ocms_code": None,
                "agency": None, "state": None}
    name = text[:m.start()].strip().rstrip("-").strip()
    tail = text[m.end():].strip().strip(",").strip()
    agency = state = None
    if tail:
        bits = [b.strip() for b in tail.split(",")]
        agency = none_if_dash(bits[0])
        if len(bits) > 1:
            state = none_if_dash(bits[1])
    return {"project_name": none_if_dash(name), "ocms_code": m.group(1),
            "agency": agency, "state": state}


# "Rs. in lakh" as a UNITS DECLARATION. Deliberately not a bare "lakh" substring:
# this corpus is full of Indian place names that contain it (LAKHIMPUR,
# LAKHISARAI, LAKHANPUR), and matching those silently dropped whole pages of
# genuinely crore-denominated projects.
LAKH_UNITS_RE = re.compile(r"(?:rs\.?|₹|in|units?)[\s.:]*(?:in\s+)?lakhs?\b", re.I)
CRORE_UNITS_RE = re.compile(r"\bcrores?\b", re.I)


def check_units(page_text):
    """The annexure states its own units. A lakh-denominated table read as crore
    is a 100x error that looks entirely plausible downstream."""
    t = page_text or ""
    if LAKH_UNITS_RE.search(t) and not CRORE_UNITS_RE.search(t):
        return False, "page declares lakh units, not crore"
    return True, None


# ---------------------------------------------------------------------------
# Annexure classification
# ---------------------------------------------------------------------------

CONSOLIDATED_RE = re.compile(
    r"detail[s]?\s+of\s+ongoing\s+project|^\s*sector\s+wise\s+details", re.I | re.M)
# The post-2020 ongoing list is cut FIVE ways, not three. The union of the four
# schedule-status cuts below is pairwise disjoint and, with "ahead", reconciles
# to the report's own stated count — October 2020: 539 delayed + 194 on schedule
# + 794 without DoC + 130 without ORIGINAL DoC + 8 only-in-ahead = 1665 against
# a stated 1666 (and the report's own narrative confirms the split: "9 ahead,
# 194 on schedule, 539 delayed" and "for 924 projects neither the year of
# commissioning nor the tentative gestation period has been reported", where
# 794 + 130 = 924 exactly).
#
# "ahead" is the odd one out. Its title says "w.r.t. Original Schedule" but its
# contents say otherwise: most of its rows are projects that are DELAYED against
# their original schedule and merely ahead of their LATEST one (October 2020's
# first row is GOPAL JI KANIHA — original DoC 03/2013, anticipated 03/2022,
# revised 03/2028), and those rows are re-listings of rows the delayed and
# on-schedule annexures already carry. Only the handful of rows unique to it
# complete the partition, so extract_projects keeps exactly those.
PARTITION_RES = {
    "delayed": re.compile(r"details?\s+of\s+delayed\s+projects\s+w\.?r\.?t\.?\s+original", re.I),
    "on_schedule": re.compile(r"details?\s+of\s+on\s+schedule\s+projects\s+w\.?r\.?t\.?\s+original", re.I),
    "without_doc": re.compile(r"details?\s+of\s+projects\s+without\s+date\s+of\s+commissioning", re.I),
    "without_original_doc": re.compile(
        r"details?\s+of\s+projects\s+without\s+original\s+date\s+of\s+commissioning", re.I),
    "ahead": re.compile(r"details?\s+of\s+projects\s+ahead\s+of\s+schedule\s+w\.?r\.?t\.?\s+original", re.I),
}
# The cuts that are genuinely disjoint slices of the ongoing list. "ahead" is
# deliberately not here: it is accepted when present and deduplicated, never
# required, because a month with nothing ahead of schedule prints no such
# annexure at all.
PARTITION_CORE = ("delayed", "on_schedule", "without_doc", "without_original_doc")
OTHER_ANNEXURE_RE = re.compile(
    r"completed|newly\s+added|expenditure\s+is\s+more\s+than|cost\s+overrun|"
    r"without\s+milestones|latest\s+schedule|public\s+private\s+partnership", re.I)


def annexure_kind(head_text):
    """First 600 characters of a page -> annexure kind, or None when the page
    carries no title (2010-11 and 2011-12 print none on the table pages)."""
    if OTHER_ANNEXURE_RE.search(head_text):
        return "other"
    for kind, rx in PARTITION_RES.items():
        if rx.search(head_text):
            return kind
    if CONSOLIDATED_RE.search(head_text):
        return "consolidated"
    return None


# ---------------------------------------------------------------------------
# THE TRANSITIONAL FORMAT (October 2024)
# ---------------------------------------------------------------------------
# One report sits between the eras. October 2024 already prints the modern
# report's tables ("Table:-7. Project List: Ongoing Projects as of 31st October
# 2024" is the full ongoing list; Table 6 is the North-East subset), already
# stacks Original/(Revised)/{Anticipated} inside single DoC and Cost columns,
# and already prints one code per project — but draws no cell borders and
# prints no column-number row, so neither the modern parser's line-coordinate
# strategy nor the number-row anchors above have anything to hold on to.
#
# What it DOES have is nine columns separated by printed gutters that no word
# crosses on any of its 223 table pages. So the columns are found from the
# words themselves: the disjoint x-intervals covered by the data words, pooled
# across every page of the annexure, ARE the columns, and the boundaries are
# the midpoints of the gaps between them. Pooling across pages is what makes
# this safe — a gutter survives only if no word on any page crosses it, which
# is exactly the definition of a column boundary in a machine-generated table.
#
# The wrapper character carries the semantics the older formats spread across
# separate columns: a bare value is the ORIGINAL figure, "(...)" is the REVISED
# APPROVED one, "{...}" is the ANTICIPATED one — the report's own header says
# so ("Original (Revised) {Anticipated}"). The anticipated figure maps to
# revised_* exactly as in every other era (see the module docstring), and the
# revised approved figure rides along to snapshots.raw.
#
# The "(N24000821)" codes this format prints in the project cell are OCMS
# codes in parentheses instead of brackets — the same identity space as
# "[N24000821]" in April 2024 six months earlier, and the same values the
# 2025-26 Table 6 later carries as legacy_ocms_code beside its new bare-digit
# project_code. They join the series' identity rule unchanged.

TRANSITIONAL_TITLE_RE = re.compile(
    r"project\s+list\s*:?[-–]?\s*ongoing\s+projects\s+as\s+of", re.I)
# The OCMS code as this format prints it: "(N24000821)" — parens, not brackets.
TRANSITIONAL_CODE_RE = re.compile(r"\(\s*([A-Z]?\d{6,})\s*\)")
# "47 of 269" — the page footer, centred, which would otherwise bridge two
# columns and glue their bands together.
TRANSITIONAL_FOOTER_RE = re.compile(r"^\d{1,4}\s+of\s+\d{1,4}$")
# Page furniture above the column header ("MOSPI_ ( October 2024) _FR_ …",
# "Table:-7. …") spans the full width; letting it vote on the header text
# would scatter title words like "Sector" and "Projects" across every band.
TRANSITIONAL_NOISE_RE = re.compile(r"_FR_|^\s*table\s*:", re.I)
# Two columns are distinct when the printed gutter between them is at least
# this wide at its narrowest point across the whole annexure. The narrowest
# real gutter in October 2024 (state|sector) is 4.3pt at its tightest; the
# widest gap WITHIN a column is under 2pt.
TRANSITIONAL_MIN_GAP = 3.0

# The nine columns this format prints, named from its own header.
TRANSITIONAL_FIELDS = frozenset((
    "state", "sector", "sl_no", "project", "approval", "doc", "cost",
    "cumulative_expenditure", "physical_progress"))

# Ordered for the same reason COLUMN_RULES is: "Cumulative Expenditure in Rs.
# Crore" must not be caught by a bare cost test.
TRANSITIONAL_COLUMN_RULES = [
    ("expenditure",   "cumulative_expenditure"),
    ("commissioning", "doc"),
    ("approval",      "approval"),
    ("progress",      "physical_progress"),
    ("project",       "project"),
    ("cost",          "cost"),
    ("state",         "state"),
    ("sector",        "sector"),
]


def classify_transitional_header(text):
    """Header text for one transitional column -> field name, or None."""
    t = normalize_header(text)
    if not t:
        return None
    for needle, field in TRANSITIONAL_COLUMN_RULES:
        if needle in t:
            return field
    if re.search(r"s[li]?\.?n[o0]", t):
        return "sl_no"
    return None


def transitional_band_edges(words, min_gap=TRANSITIONAL_MIN_GAP):
    """
    Column boundaries for the borderless transitional layout: merge the words'
    x-intervals across gaps narrower than min_gap; the surviving gaps are the
    printed gutters and the boundaries sit at their midpoints.
    Returns (edges, band_count).
    """
    spans = sorted((w["x0"], w["x1"]) for w in words)
    bands = []
    for x0, x1 in spans:
        if bands and x0 - bands[-1][1] < min_gap:
            bands[-1][1] = max(bands[-1][1], x1)
        else:
            bands.append([x0, x1])
    edges = [(a[1] + b[0]) / 2 for a, b in zip(bands, bands[1:])]
    return edges, len(bands)


# The revised APPROVED date is the one value this format prints as "May-23"
# instead of "5/2023". Two-digit years are unambiguous here: no revised
# approved date in an October 2024 report predates 2000.
TRANSITIONAL_MONYY_RE = re.compile(r"^([A-Za-z]{3,9})[-\s]?(\d{2})$")


def clean_transitional_month(v):
    """'9/2018' or 'May-23' -> 'MM/YYYY'; anything else -> None."""
    got = clean_month(v)
    if got is not None:
        return got
    v = none_if_dash(v)
    if v is None:
        return None
    m = TRANSITIONAL_MONYY_RE.match(v)
    if not m:
        return None
    mon = MONTH_ABBR.get(m.group(1)[:3].upper())
    if mon is None:
        return None
    return f"{mon:02d}/20{m.group(2)}"


def transitional_wrapped(value):
    """
    '417.23' -> ('original', '417.23'); '(707.73)' -> ('revised', '707.73');
    '{707.73}' -> ('anticipated', '707.73'). The wrapper IS the column
    semantics in this format — the header stacks all three quantities into one
    printed column and distinguishes them exactly this way.
    """
    v = (value or "").strip()
    if v.startswith("{") and v.endswith("}"):
        return "anticipated", v[1:-1].strip()
    if v.startswith("(") and v.endswith(")"):
        return "revised", v[1:-1].strip()
    return "original", v


def parse_transitional_project_cell(text):
    """
    "CONSTRUCTION OF NITB (AAI) (N04000091)" -> name / agency / ocms_code.

    The code is the LAST parenthesised OCMS-shaped group; the balanced paren
    group before it is the agency (agencies nest parens, and project names
    contain parenthesised figures that must stay in the name).
    """
    text = re.sub(r"\s+", " ", (text or "")).strip()
    matches = list(TRANSITIONAL_CODE_RE.finditer(text))
    if not matches:
        return {"project_name": none_if_dash(text), "ocms_code": None, "agency": None}
    m = matches[-1]
    rest = (text[:m.start()] + " " + text[m.end():]).strip()
    agency = None
    if rest.endswith(")"):
        depth = 0
        for i in range(len(rest) - 1, -1, -1):
            if rest[i] == ")":
                depth += 1
            elif rest[i] == "(":
                depth -= 1
                if depth == 0:
                    agency = none_if_dash(rest[i + 1:-1])
                    rest = rest[:i].strip()
                    break
    return {"project_name": none_if_dash(rest), "ocms_code": m.group(1),
            "agency": agency}


def transitional_page_entry(lines, pageno, warnings):
    """
    One transitional annexure page -> {pageno, header, data} line groups, or
    None when the page's header block cannot be found. The header block ends
    at the last "(MM/YYYY)" line; page footers are dropped here so they can
    neither join a row nor glue two column bands together.
    """
    hdr_end = None
    for i, (_top, ws) in enumerate(lines[:12]):
        if any("MM/YYYY" in w["text"] for w in ws):
            hdr_end = i
    if hdr_end is None:
        warnings.append(f"page {pageno}: transitional annexure page but no "
                        "header block was found — page skipped")
        return None
    header = []
    for top, ws in lines[:hdr_end + 1]:
        if TRANSITIONAL_NOISE_RE.search(" ".join(w["text"] for w in ws)):
            continue
        header.append((top, ws))
    data = []
    for top, ws in lines[hdr_end + 1:]:
        if TRANSITIONAL_FOOTER_RE.match(" ".join(w["text"] for w in ws).strip()):
            continue
        data.append((top, ws))
    return {"pageno": pageno, "header": header, "data": data}


def read_transitional(pages, warnings):
    """
    The transitional annexure's pages -> (records, serial health, pages used).

    State and sector are group labels printed only on the row where they
    change, wrapped over several lines in their own narrow columns; both carry
    forward until the next label. Rows themselves are delimited by the serial
    column, and a row's continuation lines (wrapped names, the (Revised) and
    {Anticipated} lines) attach to the open row — across page breaks too,
    which is why this reads all pages in one pass.
    """
    all_words = [w for p in pages for _top, ws in p["data"] for w in ws]
    edges, nbands = transitional_band_edges(all_words)
    header_text = {}
    for _top, ws in pages[0]["header"]:
        for i, text in bucket(ws, edges).items():
            header_text[i] = (header_text.get(i, "") + " " + text).strip()
    mapping = {}
    for i in range(nbands):
        field = classify_transitional_header(header_text.get(i, ""))
        if field and field not in mapping.values():
            mapping[i] = field
    if set(mapping.values()) != TRANSITIONAL_FIELDS or nbands != len(TRANSITIONAL_FIELDS):
        warnings.append(
            f"transitional annexure: {nbands} column band(s) mapped to "
            f"{sorted(mapping.values())} — the layout moved, refusing to guess")
        return [], None, 0
    col_of = {v: k for k, v in mapping.items()}

    records = []
    state = sector = None
    pending = None

    def flush():
        nonlocal pending, state, sector
        if pending is None:
            return
        p, pending = pending, None
        if p["state"]:
            state = " ".join(p["state"])
        if p["sector"]:
            sector = " ".join(p["sector"])
        name = parse_transitional_project_cell(" ".join(p["project"]))
        rec = {
            "sl_no": p["sl_no"], "sector": sector, "annexure": "transitional",
            "project_name": name["project_name"], "ocms_code": name["ocms_code"],
            "agency": name["agency"], "state": state,
            "approval_date": None, "original_target_doc": None, "revised_doc": None,
            "original_cost_cr": None, "revised_cost_cr": None,
            "cumulative_expenditure_cr": None, "physical_progress_pct": None,
            "latest_approved_cost_cr": None, "approved_revised_doc": None,
            "delay_months_reported": None, "milestones": None,
            "source_page": p["source_page"],
        }
        for v in p["approval"]:
            kind, val = transitional_wrapped(v)
            # The parenthesised second line under Approval is the actual start
            # date ("(May-23)"), which this schema does not carry.
            if kind == "original" and rec["approval_date"] is None:
                rec["approval_date"] = clean_month(val)
        for v in p["doc"]:
            kind, val = transitional_wrapped(v)
            key = {"original": "original_target_doc", "revised": "approved_revised_doc",
                   "anticipated": "revised_doc"}[kind]
            if rec[key] is None:
                rec[key] = clean_transitional_month(val)
        for v in p["cost"]:
            kind, val = transitional_wrapped(v)
            key = {"original": "original_cost_cr", "revised": "latest_approved_cost_cr",
                   "anticipated": "revised_cost_cr"}[kind]
            if rec[key] is None:
                rec[key] = clean_num(val)
        if p["cumulative_expenditure"]:
            rec["cumulative_expenditure_cr"] = clean_num(p["cumulative_expenditure"][0])
        if p["physical_progress"]:
            rec["physical_progress_pct"] = clean_num(p["physical_progress"][0])
        records.append(rec)

    label_fields = ("state", "sector", "sl_no", "project")
    value_fields = ("project", "approval", "doc", "cost",
                    "cumulative_expenditure", "physical_progress")
    for page in pages:
        for _top, ws in page["data"]:
            cells = bucket(ws, edges)
            # The grand total at the annexure's foot closes the open row and
            # joins nothing. Recognised by its label bands reading EXACTLY
            # "Total", not by a line merely starting with the word: project
            # names in this report really do wrap onto lines like "(TOTAL
            # LENGTH 27.10 KM) ON", and swallowing one would truncate a name
            # without disturbing the serial run that would otherwise catch it.
            label = " ".join((cells.get(col_of[f], "") or "").strip()
                             for f in label_fields).strip().lower()
            if label in ("total", "grand total"):
                flush()
                continue
            sl_text = (cells.get(col_of["sl_no"], "") or "").strip()
            if re.fullmatch(r"\d{1,6}", sl_text):
                flush()
                pending = {"sl_no": int(sl_text), "source_page": page["pageno"],
                           "state": [], "sector": [],
                           **{f: [] for f in value_fields}}
            if pending is None:
                # A label line before any row on the first page, or stray
                # figures after a Total line: only the labels matter.
                for band in ("state", "sector"):
                    v = (cells.get(col_of[band], "") or "").strip()
                    if v:
                        if band == "state":
                            state = v
                        else:
                            sector = v
                continue
            for band in ("state", "sector"):
                v = (cells.get(col_of[band], "") or "").strip()
                if v:
                    pending[band].append(v)
            for band in value_fields:
                v = (cells.get(col_of[band], "") or "").strip()
                if v:
                    pending[band].append(v)
    flush()

    health = serial_health(records, "transitional", warnings)
    return records, health, len(pages)


# ---------------------------------------------------------------------------
# Report-level metadata
# ---------------------------------------------------------------------------

def parse_report_month(pdf, max_pages=60):
    """
    The report's own month, taken from the document and never from the filename.
    Weighted towards the parenthesised stamp the annexure prints on every one of
    its pages — "(April 2020)", "(Apr,2010)" — which is unambiguous, repeated
    hundreds of times, and cannot be confused with a project's own dates.
    """
    counts = Counter()
    names = "|".join(list(MONTHS) + list(MONTH_ABBR))
    paren = re.compile(r"\(\s*(" + names + r")\s*[,.]?\s*(\d{4})\s*\)", re.I)
    loose = re.compile(r"\b(" + "|".join(MONTHS) + r")\s*,?\s+(\d{4})\b", re.I)
    for page in pdf.pages[:max_pages]:
        text = page.extract_text() or ""
        for m in paren.finditer(text):
            counts[(m.group(1).upper()[:3], int(m.group(2)))] += 5
        for m in loose.finditer(text):
            counts[(m.group(1).upper()[:3], int(m.group(2)))] += 1
    if not counts:
        return None
    (mon, year), _ = counts.most_common(1)[0]
    return f"{year:04d}-{MONTH_ABBR[mon]:02d}-01"


# The report states its ongoing-project count in more than one place, and the
# places do not always agree: October 2014's opening sentence says 748 while its
# own summary table says "No of Projects in Current Month 747" and the annexure
# lists 747. The tabulated figure is the one the annexure is built from, so it
# is preferred and the narrative sentence is only a fallback.
STATED_RES = [
    re.compile(r"N(?:o\.?|umber)\s+of\s+Projects\s+in\s+Current\s+Month\s+([\d,]{2,7})", re.I),
    re.compile(r"(?:status|details?)\s+of\s+(?:the\s+)?([\d,]{2,7})\s+(?:on-?going\s+)?"
               r"(?:central\s+sector\s+)?(?:infrastructure\s+)?projects?", re.I),
    re.compile(r"([\d,]{2,7})\s+(?:on-?going\s+)?(?:central\s+sector\s+)?"
               r"infrastructure\s+projects", re.I),
]


def parse_stated_count(pdf, report_month=None, max_pages=40):
    """
    The report's own headline ongoing-project count, when its summary states it
    in English. Best effort only: several years state it exclusively in Hindi.

    THE PREVIOUS-YEAR TRAP
    Several reports carry a comparison block for the SAME MONTH OF THE PREVIOUS
    YEAR, in the identical wording. April 2018 reprints "Flash Report for the
    month of April, 2017 … Number of Projects in Current Month 1247" twenty
    pages after saying it has 1332 projects of its own. A page is therefore only
    allowed to supply the tabulated figure when it names THIS report's month and
    year; the narrative sentence is the fallback for the years that print no
    table.
    """
    pages = [(page.extract_text() or "").replace("\n", " ") for page in pdf.pages[:max_pages]]

    # The transitional (October 2024) format states no count in prose; its
    # figure is the Total row of "Table:-1. Overview of Ongoing Projects:
    # Sector-wise Distribution". The title only exists in that format, so this
    # cannot fire on any other era, and the tabulated figure is preferred for
    # the same reason "No of Projects in Current Month" is below.
    for text in pages:
        if "Overview of Ongoing Projects" not in text:
            continue
        m = re.search(r"\bTotal\s+([\d,]{2,7})\s", text)
        if m:
            n = int(m.group(1).replace(",", ""))
            if 50 <= n <= 20000:
                return n

    own = None
    if report_month:
        year, month = int(report_month[:4]), int(report_month[5:7])
        name = [k for k, v in MONTHS.items() if v == month][0]
        own = re.compile(r"\b" + name[:3] + r"[a-z]*\.?,?\s*" + str(year) + r"\b", re.I)

    for rx in STATED_RES:
        for text in pages:
            if rx is STATED_RES[0] and own and not own.search(text):
                continue
            for m in rx.finditer(text):
                n = int(m.group(1).replace(",", ""))
                if 50 <= n <= 20000:
                    return n
    return None


# ---------------------------------------------------------------------------
# Runs of pages
# ---------------------------------------------------------------------------

# How far apart two page-runs of the same annexure may sit and still be the same
# annexure. Big enough to absorb a chart or a landscape page dropped into the
# middle of a 90-page table; far too small to swallow a same-titled re-cut
# printed hundreds of pages further back.
MERGE_MAX_PAGE_GAP = 25


def build_runs(pdf, warnings):
    """
    Candidate annexure pages, grouped into runs — plus, separately, the pages
    of the October 2024 transitional annexure, which prints neither the
    bracketed codes nor the number row the runs machinery anchors on and is
    read by read_transitional instead. Returns (runs, transitional_pages).
    """
    runs = []
    transitional = []
    for pageno, page in enumerate(pdf.pages, start=1):
        text = page.extract_text() or ""
        # The transitional annexure titles every one of its pages; the check is
        # against the page head so the contents page's table list cannot match.
        if TRANSITIONAL_TITLE_RE.search("\n".join(text.split("\n")[:4])):
            ok, why = check_units(text)
            if not ok:
                warnings.append(f"page {pageno}: {why} — page skipped")
                continue
            entry = transitional_page_entry(visual_lines(page), pageno, warnings)
            if entry:
                transitional.append(entry)
            continue
        if not OCMS_RE.search(text):
            continue
        lines = visual_lines(page)
        idx, anchors = find_number_row(lines)
        if idx is None:
            continue
        ok, why = check_units(text)
        if not ok:
            warnings.append(f"page {pageno}: {why} — page skipped")
            continue

        data_words = [w for _, ws in lines[idx + 1:] for w in ws]
        if not data_words:
            continue
        # The HEADER words vote on the gutters too. Without them a narrow column
        # whose data is sparse (a delay of "12(O)" against a dense date column)
        # leaves a quiet stripe inside its neighbour, the boundary lands there,
        # and the header word "Delay" is read as part of the date column — which
        # silently renamed the anticipated-commissioning column on some pages
        # and split one annexure into two.
        hdr = header_lines(lines, idx)
        edges = gutter_edges(anchors, data_words + [w for _, ws in hdr for w in ws])
        header = read_header(hdr, edges, len(anchors))

        mapping = {}
        for i in range(len(anchors)):
            field = classify_header(header.get(i, ""))
            if field and field not in mapping.values():
                mapping[i] = field
        if "project" not in mapping.values():
            continue

        signature = tuple(mapping.get(i) for i in range(len(anchors)))
        kind = annexure_kind("\n".join(text.split("\n")[:8]))
        entry = {"pageno": pageno, "lines": lines, "idx": idx, "edges": edges,
                 "mapping": mapping, "text_head": text[:600]}
        # A page that carries its OWN title starts its own run when that title
        # differs from the run's. Two adjacent annexures can share a column
        # signature exactly — October 2020's "Ahead of Schedule" starts on the
        # page after "On Schedule" ends with the identical eight columns, and
        # gluing them together restarted the serial run and double-counted the
        # on-schedule annexure's rows.
        if runs and runs[-1]["signature"] == signature and \
                pageno - runs[-1]["pages"][-1]["pageno"] <= 2 and \
                (kind is None or runs[-1]["kind"] in (None, kind)):
            runs[-1]["pages"].append(entry)
            if kind and not runs[-1]["kind"]:
                runs[-1]["kind"] = kind
        else:
            runs.append({"signature": signature, "kind": kind, "pages": [entry]})
    return merge_runs(runs), transitional


def merge_runs(runs):
    """
    Fold runs that are the same annexure interrupted by something else.

    A sector chart or a landscape page in the middle of a 90-page annexure ends
    the contiguous stretch, and the serial numbers of the two halves are then a
    single 1..N sequence split in two — which would fail the contiguity gate and
    lose half the report.

    A titled annexure merges on its TITLE, not its signature: a page whose header
    block happens to read one column differently must not fork the annexure in
    two. An untitled run has only its signature to go on, which is enough,
    because the years that print no title (2010-11, 2011-12) print exactly one
    per-project annexure.

    Merging is bounded by MERGE_MAX_PAGE_GAP, and that bound is load-bearing.
    Several years print a SECOND table hundreds of pages further back under the
    same title — a re-cut of the same projects — and merging it into the
    consolidated annexure produced 1,332 rows for a report that states 1,247 and
    a serial run with a hole in it. An interruption inside one annexure is a
    chart or a landscape page, never 250 pages of other annexures.
    """
    merged = []
    for run in runs:
        key = run["kind"] if run["kind"] else ("untitled", run["signature"])
        target = None
        for candidate in merged:
            if candidate["key"] != key:
                continue
            gap = run["pages"][0]["pageno"] - candidate["pages"][-1]["pageno"]
            if 0 < gap <= MERGE_MAX_PAGE_GAP:
                target = candidate
                break
        if target is None:
            merged.append({"key": key, "signature": run["signature"],
                           "kind": run["kind"], "pages": list(run["pages"])})
        else:
            target["pages"].extend(run["pages"])
    for run in merged:
        run["pages"].sort(key=lambda p: p["pageno"])
    return merged


# ---------------------------------------------------------------------------
# Row assembly
# ---------------------------------------------------------------------------

# A printed line sits about 9-12pt below the one above it inside a table row.
# The page number at the foot of the page is separated by much more than that.
FOOTER_MIN_GAP = 18.0


def line_pitch(lines):
    """
    The page's INTRA-ROW line spacing — the gap at which a wrapped cell
    continues — or None when the page is too short to say.

    This is the one thing that tells a wrapped project cell apart from a group
    heading printed between two rows, and both look identical by every other
    measure (same column, same left edge, same font, no serial number):

        [N21000021]HSCC,UTTAR      gap 9.2   the cell wrapping mid-state
        PRADESH                              …and it must stay with the row

        [020100044]BHAVNI,TAMIL NADU
        Nuclear Power Corporation Of  gap 12.6   a new block's agency heading
                                                 …and it must not

    The report generator sets both spacings; they are not measured against a
    constant here but against each other, per page, so a different font size in
    a different year changes nothing. The commonest gap on a page of a table
    whose rows wrap is the wrap spacing, by a wide margin.
    """
    gaps = Counter()
    prev = None
    for top, _ws in lines:
        if prev is not None:
            g = round((top - prev) * 2) / 2
            if 0 < g <= 30:
                gaps[g] += 1
        prev = top
    # Too few lines to have a modal anything — say nothing rather than guess.
    if sum(gaps.values()) < 6:
        return None
    return gaps.most_common(1)[0][0]


# How far past the wrap spacing a line must sit before it is a new block rather
# than a continuation. The two spacings differ by 3-4pt everywhere they were
# measured (9.2 vs 12.6 in 2020-21, 9.1 vs 13.1 in 2023-24); half of that is
# margin enough and still refuses to fire on a rounding wobble.
BLOCK_GAP_MARGIN = 1.5


def is_page_footer(words, top, prev_top):
    """
    The page number printed at the foot of the page, which is NOT data.

    These reports centre their page number, and on the 2009-2011 pages the page
    centre falls inside the cost column. October 2009 page 27 ends with a lone
    "26" at x=306, which the cost column happily accepted as the second (revised
    approved) cost of the last project on the page — giving a ₹2,161 crore mine
    a revised approved cost of ₹26 crore.

    A footer is recognised by being detached: one bare number, well below the
    last row of the table. Detachment is what distinguishes it from a genuine
    continuation line, which is printed at the table's own line pitch.
    """
    if len(words) != 1 or prev_top is None:
        return False
    if top - prev_top < FOOTER_MIN_GAP:
        return False
    return bool(re.fullmatch(r"\d{1,4}", words[0]["text"].strip()))


def read_run(run, warnings):
    """One run of pages -> records. Serial numbers restart at 1 in each run."""
    records = []
    current_sector = None
    expected = 1
    pending = None
    pending_has_code = False
    in_heading = False

    def flush():
        nonlocal pending, pending_has_code, in_heading
        if pending is not None:
            records.append(finalise(pending, run["label"]))
            pending = None
            pending_has_code = False
            in_heading = False

    for page in run["pages"]:
        edges, mapping = page["edges"], page["mapping"]
        col_of = {v: k for k, v in mapping.items()}
        project_col = col_of["project"]
        sl_col = col_of.get("sl_no", 0)

        pitch = line_pitch(page["lines"][page["idx"] + 1:])
        prev_top = None
        for top, ws in page["lines"][page["idx"] + 1:]:
            if is_page_footer(ws, top, prev_top):
                continue
            gap = None if prev_top is None else top - prev_top
            prev_top = top
            cells = bucket(ws, edges)
            if not any(v.strip() for v in cells.values()):
                continue
            sl_text = (cells.get(sl_col, "") or "").strip()
            proj_text = (cells.get(project_col, "") or "").strip()

            joined = " ".join(v for v in cells.values() if v).strip().lower()
            if joined.startswith("total") or joined.startswith("grand total"):
                flush()
                continue

            sl_no = None
            if re.fullmatch(r"\d{1,6}", sl_text):
                sl_no = int(sl_text)
            elif sl_col == project_col or not sl_text:
                if re.match(r"^\d", proj_text):
                    sl_no, proj_text = split_glued_sl_no(proj_text, expected)

            if sl_no is not None:
                flush()
                cells = dict(cells)
                cells[project_col] = proj_text
                pending = {"sl_no": sl_no, "source_page": page["pageno"],
                           "sector": current_sector, "col_of": col_of,
                           "lines": [cells]}
                pending_has_code = bool(OCMS_RE.search(proj_text))
                in_heading = False
                expected = sl_no + 1
                continue

            others = [v for k, v in cells.items() if k != project_col and v.strip()]
            if pending is None:
                # A line with only a project-column value and no serial is a
                # sector or ministry heading.
                if proj_text and not others and not OCMS_RE.search(proj_text):
                    current_sector = re.sub(r"\s+", " ", proj_text).strip()
                continue
            # A GROUP HEADING PRINTED BETWEEN TWO PROJECTS IS NOT PART OF EITHER.
            #
            # These annexures head each ministry block with its sector and each
            # sub-block with the implementing agency, and the agency heading is
            # printed BETWEEN two numbered rows with no Total line to close the
            # first one:
            #
            #     1  PROTOTYPE FAST BREEDER    09/2003  3,492.00 …
            #        REACTOR (BHAVINI, 500 MWE) -
            #        [020100044]BHAVNI,TAMIL NADU
            #        Nuclear Power Corporation Of      ← heading for row 2
            #        India Limited                     ← …wrapped
            #     2  KAKRAPAR ATOMIC POWER     10/2009 …
            #
            # Appending those two lines to the open row glued the next block's
            # agency onto the state and produced "TAMIL NADU Nuclear Power
            # Corporation Of India Limited" — and the same shape gave "RAJASTHAN
            # Northern Railway", "ODISHA Neyveli Lignite Corporation" and
            # "WEST BENGAL Uttar Pradesh Jal Nigam".
            #
            # A heading is recognised structurally, not by how it is spelled:
            # nothing outside the project column, no OCMS code of its own, the
            # open row's project cell has already printed ITS code, and the line
            # sits a BLOCK apart rather than a wrap apart (see line_pitch — the
            # cell really does wrap mid-state, "…HSCC,UTTAR" / "PRADESH", and
            # dropping that would truncate Uttar Pradesh to "UTTAR"). It is
            # dropped rather than made the sector: the sector these annexures
            # already record comes from the same headings read when no row is
            # open, and changing which of them wins is a different repair.
            #
            # A heading WRAPS like anything else ("Nuclear Power Corporation
            # Of" / "India Limited", "Metropolitan Rapid Transport" /
            # "Projects"), and its second line is printed at the wrap spacing —
            # so once a heading has started, its continuation lines belong to it
            # and not to the row above. The heading ends at the next serial, or
            # at the next line that puts anything in another column.
            if pending_has_code and proj_text and not others \
                    and not OCMS_RE.search(proj_text) \
                    and (in_heading
                         or (pitch is not None and gap is not None
                             and gap > pitch + BLOCK_GAP_MARGIN)):
                in_heading = True
                continue
            in_heading = False
            if OCMS_RE.search(proj_text):
                pending_has_code = True
            pending["lines"].append(cells)
    flush()

    return records, serial_health(records, run["label"], warnings)


def serial_health(records, label, warnings):
    """
    How the annexure's own row numbering behaved.

    A FORWARD gap — the numbering skips 812 to 814 — means a row the annexure
    counted was not extracted, and there is no way to know which. That is fatal
    downstream.

    A BACKWARD step is MoSPI renumbering, not data loss. April 2018 numbers its
    rows 1..1330 and then prints two more numbered 1231 and 1232; the report
    states 1332 projects and 1332 rows are extracted, so nothing is missing. It
    is recorded and it is not fatal.
    """
    serials = [r["sl_no"] for r in records]
    health = {"rows": len(serials), "starts_at": serials[0] if serials else None,
              "max": max(serials) if serials else None,
              "forward_gap": 0, "backward_steps": 0}
    for prev, cur in zip(serials, serials[1:]):
        if cur > prev + 1:
            health["forward_gap"] += cur - prev - 1
        elif cur <= prev:
            health["backward_steps"] += 1
    if health["forward_gap"]:
        warnings.append(f"{label}: the annexure's own numbering skips "
                        f"{health['forward_gap']} row(s) that were not extracted")
    if health["backward_steps"]:
        warnings.append(f"{label}: the annexure's own numbering steps backwards "
                        f"{health['backward_steps']} time(s) — MoSPI renumbering, no rows lost")
    return health


def finalise(pending, annexure_label):
    """Collapse the printed lines of one project into a record."""
    col_of = pending["col_of"]

    def column(field):
        """Values printed in this column, top line first, blanks dropped."""
        c = col_of.get(field)
        if c is None:
            return []
        out = []
        for cells in pending["lines"]:
            v = none_if_dash(cells.get(c))
            if v is not None:
                out.append(v)
        return out

    def first(field, fn):
        vals = column(field)
        return fn(vals[0]) if vals else None

    name = parse_project_cell(
        " ".join((cells.get(col_of["project"]) or "").strip()
                 for cells in pending["lines"]))
    costs = column("cost_original_revised")
    docs = column("doc_original_revised")
    delay = column("delay_reported")
    milestones = column("milestones")

    return {
        "sl_no": pending["sl_no"],
        "sector": pending["sector"],
        "annexure": annexure_label,
        "project_name": name["project_name"],
        "ocms_code": name["ocms_code"],
        "agency": name["agency"],
        "state": name["state"],
        "approval_date": first("approval", clean_month),
        "original_target_doc": clean_month(docs[0]) if docs else None,
        # "anticipated" is the modern format's "revised" — see the module docstring.
        "revised_doc": first("doc_anticipated", clean_month),
        "original_cost_cr": clean_num(costs[0]) if costs else None,
        "revised_cost_cr": first("cost_anticipated", clean_num),
        "cumulative_expenditure_cr": first("cumulative_expenditure", clean_num),
        "physical_progress_pct": first("physical_progress", clean_num),
        # Kept, not promoted: the revised APPROVED figures are a different
        # quantity from the anticipated ones and belong in snapshots.raw.
        "latest_approved_cost_cr": clean_num(costs[1]) if len(costs) > 1 else None,
        "approved_revised_doc": clean_month(docs[1]) if len(docs) > 1 else None,
        "delay_months_reported": delay[0] if delay else None,
        "milestones": milestones[0] if milestones else None,
        "source_page": pending["source_page"],
    }


# ---------------------------------------------------------------------------
# Selection
# ---------------------------------------------------------------------------

def select_partition(runs):
    """The schedule-status partition, when the report prints a complete one:
    every one of the four disjoint cuts, plus the "ahead" re-cut when present.
    None when any core cut is missing — a partial partition is not a list."""
    partitions = {k: [r for r in runs if r["kind"] == k] for k in PARTITION_RES}
    if not all(partitions[k] for k in PARTITION_CORE):
        return None
    return [max(partitions[k], key=lambda r: len(r["pages"]))
            for k in PARTITION_RES if partitions[k]]


def select_runs(runs, warnings):
    """
    Decide which runs make up "all ongoing projects" for this report.

      consolidated  a run titled "…ongoing projects…" / "Sector Wise Details",
                    or — for 2010-11 and 2011-12, whose table pages print no
                    title at all — the largest untitled run.
      partitioned   no consolidated run, but the four disjoint schedule-status
                    cuts (PARTITION_CORE) all present; their union, plus the
                    rows unique to the "ahead" re-cut when that annexure is
                    printed, is the ongoing list.

    Anything else is refused rather than guessed at. A consolidated run whose
    OWN read fails its accounting still ends up on the partition — that
    fallback lives in extract_projects, which is the first place the row-level
    evidence exists.
    """
    for r in runs:
        r["label"] = r["kind"] or f"untitled/{len([f for f in r['signature'] if f])}col"

    consolidated = [r for r in runs if r["kind"] == "consolidated"]
    if consolidated:
        best = max(consolidated, key=lambda r: len(r["pages"]))
        return "consolidated", [best]

    # THE UNTITLED FALLBACK, AND THE ONE CONDITION THAT MAKES IT SAFE.
    #
    # Several years print no title on the consolidated annexure's pages — 2009 to
    # 2011 print none anywhere, and October 2016 prints one on its other
    # annexures but not on this one. So "was anything else titled?" is not the
    # test.
    #
    # The test is that the untitled run is the BIGGEST TABLE IN THE REPORT. The
    # consolidated annexure always is: it lists every ongoing project, so it
    # cannot be shorter than any cut of itself. In the post-2020 reports, whose
    # consolidated annexure is unreadable, the untitled runs are 2 and 5 pages
    # against 81- and 69-page titled ones — and accepting one of those produced
    # 383 rows for a report of about 1,800 projects, which passed the gate
    # because those few pages' own serial numbers were internally tidy.
    # "Biggest" is measured against the ONGOING-list annexures only. The
    # overrun re-cuts are excluded from the comparison because they are not a
    # cut of the ongoing list in the same sense — October 2016 prints a 94-page
    # cost-overrun annexure against a 59-page consolidated one, and counting it
    # would reject a report that parses perfectly.
    #
    # This check runs BEFORE the partition check for the same reason a titled
    # consolidated annexure does: October 2016 prints BOTH an untitled
    # consolidated annexure and a complete schedule-status partition, and the
    # consolidated one is the fuller source (the partition's cuts drop the
    # milestones, agency and state columns and print delay as free-text
    # reasons). A consolidated read that cannot account for itself still falls
    # back to the partition in extract_projects.
    untitled = [r for r in runs if r["kind"] is None]
    contenders = [r for r in runs if r["kind"] != "other"]
    if untitled:
        best = max(untitled, key=lambda r: len(r["pages"]))
        biggest = max(len(r["pages"]) for r in contenders)
        if len(best["pages"]) == biggest:
            warnings.append(
                "no titled ongoing-project annexure; using the largest untitled run "
                f"({len(best['pages'])} page(s)), which is also the largest table in "
                "the report")
            return "untitled-consolidated", [best]

    partition = select_partition(runs)
    if partition:
        return "partitioned", partition

    seen = sorted({r["kind"] for r in runs if r["kind"]})
    warnings.append(
        f"no consolidated annexure and an incomplete partition set; annexures seen: {seen}")

    warnings.append("no ongoing-project annexure could be identified")
    return "unknown", []


def read_chosen(chosen, warnings):
    """Read a set of selected runs into records plus their bookkeeping."""
    records = []
    per_annexure = {}
    serials = {}
    pages_used = 0
    for run in chosen:
        got, health = read_run(run, warnings)
        per_annexure[run["label"]] = len(got)
        serials[run["label"]] = health
        pages_used += len(run["pages"])
        records.extend(got)
    return records, per_annexure, serials, pages_used


def accounting_failure(records, serials):
    """
    Why this read of the ongoing list cannot be trusted, or None when it can.

    The same checks the loader's gate applies, asked early enough to try a
    different annexure instead of refusing the whole report. April 2021 is the
    month that makes this necessary: its consolidated annexure parses into a
    clean 1..1737 serial run, but its road-sector pages print the serial number
    at the BOTTOM of each project's block instead of the top, so serial-first
    row assembly stitches each block to its neighbour's — names, costs and OCMS
    codes shift one project apart, and 122 rows come out with no code at all.
    That parse is not incomplete, it is misattributed, and no column geometry
    fixes it. The report's schedule-status partition prints those same projects
    serial-first and reads cleanly — so a consolidated annexure that cannot
    account for itself falls back to the partition (see extract_projects).
    """
    gaps = sum(h["forward_gap"] for h in serials.values())
    if gaps:
        return f"its numbering skips {gaps} row(s)"
    if any(h["starts_at"] != 1 for h in serials.values()):
        return "its numbering does not start at 1"
    missing = sum(1 for r in records if not r["ocms_code"])
    if missing:
        return f"{missing} row(s) carry no OCMS code"
    seen = Counter(r["ocms_code"] for r in records if r["ocms_code"])
    dups = sum(1 for v in seen.values() if v > 1)
    if dups:
        return f"{dups} OCMS code(s) appear more than once"
    return None


def drop_ahead_relistings(records, warnings):
    """
    The "ahead" annexure is a re-cut, not a slice. Despite its "w.r.t. Original
    Schedule" title, most of its rows are projects the delayed and on-schedule
    annexures already carry — ahead of their LATEST schedule while behind (or
    on) their original one — and keeping both copies would trip the loader's
    duplicate-code gate on rows that are not a parse defect. The rows unique to
    it are the genuinely-ahead projects no other cut lists, and they are what
    completes the partition; the duplicate is dropped in favour of the primary
    cut's row, which carries the fuller column set.
    """
    ahead_total = sum(1 for r in records if r["annexure"] == "ahead")
    if not ahead_total:
        return records
    primary = {r["ocms_code"] for r in records
               if r["annexure"] != "ahead" and r["ocms_code"]}
    kept = [r for r in records
            if not (r["annexure"] == "ahead" and r["ocms_code"] in primary)]
    if len(kept) != len(records):
        warnings.append(
            f"ahead: {len(records) - len(kept)} of {ahead_total} row(s) re-list "
            "projects the schedule-status cuts already carry — dropped in favour "
            "of the primary cut's rows")
    return kept


# ---------------------------------------------------------------------------

def extract_projects(pdf_path):
    if pdfplumber is None:
        sys.exit("Missing dependency: pip install -r scripts/india/mospi/requirements.txt")
    warnings = []
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        report_month = parse_report_month(pdf)
        stated_count = parse_stated_count(pdf, report_month)
        runs, transitional = build_runs(pdf, warnings)
        if transitional:
            era = "transitional"
            records, health, pages_used = read_transitional(transitional, warnings)
            per_annexure = {"transitional": len(records)}
            serials = {"transitional": health} if health else {}
        else:
            era, chosen = select_runs(runs, warnings)
            records, per_annexure, serials, pages_used = read_chosen(chosen, warnings)

        # A consolidated annexure is preferred — it is the list itself, and it
        # carries the fullest column set — but only while its own accounting
        # holds. When it does not (April 2021's serial-at-the-bottom road pages,
        # October 2021's 300-row hole) and the report also prints a complete
        # schedule-status partition, the partition IS the same list, cut by the
        # same generator, and reading it is not a guess — its per-annexure
        # serial runs and the report's own stated count still gate it.
        if era in ("consolidated", "untitled-consolidated"):
            why = accounting_failure(records, serials)
            fallback = select_partition(runs) if why else None
            if fallback:
                warnings.append(
                    f"the {era} annexure does not account for itself ({why}); "
                    "reading the schedule-status partition instead")
                era = "partitioned"
                records, per_annexure, serials, pages_used = read_chosen(fallback, warnings)

    if era == "partitioned":
        records = drop_ahead_relistings(records, warnings)

    # Identity is the OCMS code. A row without one cannot be tied to anything, so
    # it is counted here and refused by the loader rather than silently dropped.
    missing_code = sum(1 for r in records if not r["ocms_code"])
    seen = Counter(r["ocms_code"] for r in records if r["ocms_code"])
    duplicate_codes = sorted(k for k, v in seen.items() if v > 1)
    if duplicate_codes:
        warnings.append(f"{len(duplicate_codes)} OCMS code(s) appear more than once "
                        f"(e.g. {duplicate_codes[:5]})")

    return {
        "parser_version": PARSER_VERSION,
        "era": era,
        "source_pdf": str(pdf_path),
        "report_month": report_month,
        "stated_project_count": stated_count,
        "extracted_count": len(records),
        "distinct_ocms_codes": len(seen),
        # A forward gap means rows the annexure counted were not extracted; a
        # backward step is MoSPI renumbering. Only the first is data loss.
        "serial_forward_gap": sum(h["forward_gap"] for h in serials.values()),
        "serial_backward_steps": sum(h["backward_steps"] for h in serials.values()),
        "serials_start_at_one": all(h["starts_at"] == 1 for h in serials.values()) if serials else False,
        "serials": serials,
        "annexures": per_annexure,
        "runs_seen": [{"label": r.get("label"), "pages": len(r["pages"]),
                       "columns": [f for f in r["signature"] if f]} for r in runs],
        "pages_used": pages_used,
        "total_pages": total_pages,
        "missing_ocms_code": missing_code,
        "missing_project_name": sum(1 for r in records if not r["project_name"]),
        "missing_original_cost": sum(1 for r in records if r["original_cost_cr"] is None),
        "duplicate_ocms_codes": duplicate_codes,
        "warnings": warnings,
        "records": records,
    }


def main():
    ap = argparse.ArgumentParser(
        description="Parse the ongoing-project annexure out of a pre-2025-26 MoSPI flash report.")
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
