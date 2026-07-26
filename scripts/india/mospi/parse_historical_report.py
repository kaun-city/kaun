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

THE THREE ERAS
==============
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
  Oct 2020 … 2024-25  no consolidated annexure at all: the ongoing list is split
                      by schedule status across "Details of Delayed Projects
                      w.r.t. Original Schedule", "Details of On Schedule Projects
                      w.r.t. Original Schedule" and "Details of Projects Without
                      Date of Commissioning". Those three parse cleanly here, but
                      their union does not reconcile to the report's own count
                      (October 2020: 1,548 rows against a stated 1,666), so they
                      are not the partition they look like. The loader's gate
                      refuses those months rather than publishing a series that
                      is quietly short; see data/india/mospi-historical/
                      METHODOLOGY.md.

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
    # "Details of Delayed Projects w.r.t. Original Schedule" — one of the three
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

def visual_lines(page, tol=3.0):
    """Words grouped into printed lines, each sorted left to right."""
    buckets = defaultdict(list)
    for w in page.extract_words():
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
            state = none_if_dash(", ".join(bits[1:]))
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
PARTITION_RES = {
    "delayed": re.compile(r"details?\s+of\s+delayed\s+projects\s+w\.?r\.?t\.?\s+original", re.I),
    "on_schedule": re.compile(r"details?\s+of\s+on\s+schedule\s+projects\s+w\.?r\.?t\.?\s+original", re.I),
    "without_doc": re.compile(r"details?\s+of\s+projects\s+without\s+date\s+of\s+commissioning", re.I),
}
OTHER_ANNEXURE_RE = re.compile(
    r"completed|newly\s+added|expenditure\s+is\s+more\s+than|cost\s+overrun|"
    r"without\s+milestones|latest\s+schedule|public\s+private\s+partnership|"
    r"ahead\s+of\s+schedule|without\s+original\s+date", re.I)


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
    Candidate annexure pages, grouped into runs.

    A run is a maximal stretch of pages (allowing a two-page gap for an
    interleaved chart) that share a column-mapping SIGNATURE — the tuple of
    field names the header ladder produced. Signature rather than title, because
    two annexures with the same title can have different column sets across
    years and, in 2010-11, the table pages carry no title at all.
    """
    runs = []
    for pageno, page in enumerate(pdf.pages, start=1):
        text = page.extract_text() or ""
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
        if runs and runs[-1]["signature"] == signature and \
                pageno - runs[-1]["pages"][-1]["pageno"] <= 2:
            runs[-1]["pages"].append(entry)
            if kind and not runs[-1]["kind"]:
                runs[-1]["kind"] = kind
        else:
            runs.append({"signature": signature, "kind": kind, "pages": [entry]})
    return merge_runs(runs)


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

    def flush():
        nonlocal pending
        if pending is not None:
            records.append(finalise(pending, run["label"]))
            pending = None

    for page in run["pages"]:
        edges, mapping = page["edges"], page["mapping"]
        col_of = {v: k for k, v in mapping.items()}
        project_col = col_of["project"]
        sl_col = col_of.get("sl_no", 0)

        prev_top = None
        for top, ws in page["lines"][page["idx"] + 1:]:
            if is_page_footer(ws, top, prev_top):
                continue
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
                expected = sl_no + 1
                continue

            others = [v for k, v in cells.items() if k != project_col and v.strip()]
            if pending is None:
                # A line with only a project-column value and no serial is a
                # sector or ministry heading.
                if proj_text and not others and not OCMS_RE.search(proj_text):
                    current_sector = re.sub(r"\s+", " ", proj_text).strip()
                continue
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

def select_runs(runs, warnings):
    """
    Decide which runs make up "all ongoing projects" for this report.

      consolidated  a run titled "…ongoing projects…" / "Sector Wise Details",
                    or — for 2010-11 and 2011-12, whose table pages print no
                    title at all — the largest untitled run.
      partitioned   no consolidated run, but all three schedule-status
                    annexures present; their UNION is the ongoing list.

    Anything else is refused rather than guessed at.
    """
    for r in runs:
        r["label"] = r["kind"] or f"untitled/{len([f for f in r['signature'] if f])}col"

    consolidated = [r for r in runs if r["kind"] == "consolidated"]
    if consolidated:
        best = max(consolidated, key=lambda r: len(r["pages"]))
        return "consolidated", [best]

    partitions = {k: [r for r in runs if r["kind"] == k] for k in PARTITION_RES}
    if all(partitions.values()):
        chosen = [max(v, key=lambda r: len(r["pages"])) for v in partitions.values()]
        return "partitioned", chosen

    # THE UNTITLED FALLBACK, AND THE ONE CONDITION THAT MAKES IT SAFE.
    #
    # Several years print no title on the consolidated annexure's pages — 2009 to
    # 2011 print none anywhere, and October 2016 prints one on its other
    # annexures but not on this one. So "was anything else titled?" is not the
    # test.
    #
    # The test is that the untitled run is the BIGGEST TABLE IN THE REPORT. The
    # consolidated annexure always is: it lists every ongoing project, so it
    # cannot be shorter than any cut of itself. In the post-2020 reports, which
    # have no consolidated annexure at all, the untitled runs are 2 and 5 pages
    # against 81- and 69-page titled ones — and accepting one of those produced
    # 383 rows for a report of about 1,800 projects, which passed the gate
    # because those few pages' own serial numbers were internally tidy.
    # "Biggest" is measured against the ONGOING-list annexures only. The
    # overrun re-cuts are excluded from the comparison because they are not a
    # cut of the ongoing list in the same sense — October 2016 prints a 94-page
    # cost-overrun annexure against a 59-page consolidated one, and counting it
    # would reject a report that parses perfectly.
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
    seen = sorted({r["kind"] for r in runs if r["kind"]})
    warnings.append(
        f"no consolidated annexure and an incomplete partition set; annexures seen: {seen}")

    warnings.append("no ongoing-project annexure could be identified")
    return "unknown", []


# ---------------------------------------------------------------------------

def extract_projects(pdf_path):
    if pdfplumber is None:
        sys.exit("Missing dependency: pip install -r scripts/india/mospi/requirements.txt")
    warnings = []
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        report_month = parse_report_month(pdf)
        stated_count = parse_stated_count(pdf, report_month)
        runs = build_runs(pdf, warnings)
        era, chosen = select_runs(runs, warnings)

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
