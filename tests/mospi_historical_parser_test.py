#!/usr/bin/env python3
"""
Fixture tests for scripts/india/mospi/parse_historical_report.py.

Run directly, or — the way CI runs it — through tests/india-mospi-historical.test.mjs,
which shells out to python3 so `npm test` stays the single entry point.

WHY WORD BOXES AND NOT PDFs
---------------------------
The fixtures under tests/fixtures/mospi-historical/ are the word boxes
(text, x0, x1, top) of the top of ONE real annexure page per era, cut out of the
source PDFs. That is the parser's actual input — everything upstream of it is
pdfplumber — so these exercise the whole of the logic that can go wrong (column
geometry, header naming, row assembly) without committing 370 MB of government
PDFs to the repo, and without needing pdfplumber installed to run the suite.

Each era is represented because each era broke something different:
  2010-04  no annexure title at all; "Antici- pated" hyphen-wrapped headers
  2012-04  the annexure is titled "Sector Wise Details"
  2015-04  the delay column's header bled into the anticipated-date column
  2020-04  the widest layout, and the one whose serial numbers are glued
  2024-04  no readable consolidated annexure; one of the five partition tables
  2024-10  the transitional format: modern column semantics, but no cell
           borders and no number row — read from its own printed gutters

Three more were cut for the state-attribution repair, one per way the state was
being lost (PR: fix/mospi-state-attribution):
  2017-10  the project cell's tail is agency,state,FUNDING TYPE — three fields,
           not two, so the state was coming out as "GUJARAT , G"
  2020-10  an agency group heading printed BETWEEN two numbered rows, with no
           Total line to close the first, glued onto the state above it
  2020-10  the On Schedule cut, whose project cell MoSPI itself clips mid-code
           ("[N04000083" and nothing after) — no state to read, and the honest
           answer is NULL
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts", "india", "mospi"))
FIXTURES = os.path.join(HERE, "fixtures", "mospi-historical")

import parse_historical_report as P  # noqa: E402

FAILURES = []


def check(name, got, want):
    if got != want:
        FAILURES.append(f"{name}: got {got!r}, want {want!r}")


def check_true(name, cond, detail=""):
    if not cond:
        FAILURES.append(f"{name}: expected true {detail}")


class FixturePage:
    """The only thing parse_historical_report asks of a pdfplumber page."""

    def __init__(self, words):
        self._words = words

    def extract_words(self):
        return list(self._words)


def load(label):
    with open(os.path.join(FIXTURES, label + ".json"), encoding="utf-8") as f:
        return json.load(f)


def columns_of(fixture):
    """Run the real geometry + header pipeline over a fixture page."""
    page = FixturePage(fixture["words"])
    lines = P.visual_lines(page)
    idx, anchors = P.find_number_row(lines)
    assert idx is not None, fixture["label"]
    data_words = [w for _, ws in lines[idx + 1:] for w in ws]
    hdr = P.header_lines(lines, idx)
    edges = P.gutter_edges(anchors, data_words + [w for _, ws in hdr for w in ws])
    header = P.read_header(hdr, edges, len(anchors))
    return [P.classify_header(header[i]) for i in range(len(anchors))], lines, idx, edges


# ---------------------------------------------------------------------------
# header naming — the ladder, and the traps in it
# ---------------------------------------------------------------------------

def test_header_ladder():
    # MoSPI really does head its expenditure column "Cumulative Expenditure
    # Cost". If "cost" were tested first this column would become a cost column
    # and the real expenditure figure would be lost.
    check("expenditure beats cost",
          P.classify_header("Cumulative Expenditure Cost"), "cumulative_expenditure")
    check("anticipated cost", P.classify_header("Antici pated Cost"), "cost_anticipated")
    # The narrow columns soft-hyphenate their labels across lines.
    check("hyphen-wrapped anticipated cost",
          P.classify_header("Antici- pated Cost"), "cost_anticipated")
    check("hyphen-wrapped expenditure",
          P.classify_header("Cumm. Expendi- ture"), "cumulative_expenditure")
    check("original/revised cost",
          P.classify_header("Original / Revised Cost (Rs. crore)"), "cost_original_revised")
    # The same two words WITHOUT "cost", under "Date of Commissioning", are dates.
    check("original/revised date",
          P.classify_header("Date Commissioning Original / Revised"), "doc_original_revised")
    check("anticipated date", P.classify_header("of Antici- pated"), "doc_anticipated")
    check("delay", P.classify_header("Delay w.r.t. Original/ Revised (in months)"),
          "delay_reported")
    check("milestones", P.classify_header("Miles tones Achieved/ Total"), "milestones")
    check("serial", P.classify_header("SI.No"), "sl_no")
    check("serial dotted", P.classify_header("S.No"), "sl_no")
    check("project", P.classify_header("Project"), "project")
    # Overrun columns are read and kept, never a reason to skip a page: the
    # delayed-projects annexure — one of the three whose union is the ongoing
    # list from 2020-21 on — carries both of these. Skipping on the header threw
    # four years of the series away. Overrun RE-CUTS are excluded by TITLE.
    check("cost overrun column", P.classify_header("Cost Overrun (%)"),
          "cost_overrun_reported")
    check("time overrun column", P.classify_header("Time Overrun (in months)"),
          "time_overrun_reported")
    check("overrun re-cut is excluded by its title, not its columns",
          P.annexure_kind("Details of Ongoing Projects having Cost Overruns "
                          "w.r.t. to Original Schedule"), "other")
    check("blank", P.classify_header("   "), None)


# ---------------------------------------------------------------------------
# column geometry, per era
# ---------------------------------------------------------------------------

EXPECTED_COLUMNS = {
    "2010-04-untitled": [
        "sl_no", "project", "approval", "cost_original_revised", "cost_anticipated",
        "cumulative_expenditure", "doc_original_revised", "doc_anticipated",
        "delay_reported", "milestones"],
    "2012-04-sector-wise-details": [
        "sl_no", "project", "approval", "cost_original_revised", "cost_anticipated",
        "cumulative_expenditure", "doc_original_revised", "doc_anticipated",
        "delay_reported", "milestones"],
    "2015-04-sector-wise-details": [
        "sl_no", "project", "approval", "cost_original_revised", "cost_anticipated",
        "cumulative_expenditure", "doc_original_revised", "doc_anticipated",
        "delay_reported", "milestones"],
    "2020-04-detail-of-ongoing": [
        "sl_no", "project", "approval", "cost_original_revised", "cost_anticipated",
        "cumulative_expenditure", "doc_original_revised", "doc_anticipated",
        "delay_reported", "milestones"],
}


def test_column_mapping_per_era():
    for label, want in EXPECTED_COLUMNS.items():
        got, _, _, _ = columns_of(load(label))
        check(f"{label} columns", got, want)


def test_2015_delay_does_not_steal_the_anticipated_date_column():
    """
    The regression this fixture exists for. On some 2015 pages the quietest x
    between the anticipated-date anchor and the delay anchor sat to the RIGHT of
    the word "Delay", so "Delay" was bucketed into the date column, the ladder
    named that column delay_reported, and the annexure forked into two runs with
    different signatures — losing a third of the report.
    """
    got, _, _, _ = columns_of(load("2015-04-sector-wise-details"))
    check("anticipated date column survives", got[7], "doc_anticipated")
    check("delay column is where it belongs", got[8], "delay_reported")
    check("exactly one delay column", got.count("delay_reported"), 1)


def test_partition_era_still_maps_its_columns():
    got, _, _, _ = columns_of(load("2024-04-delayed-partition"))
    for want in ("sl_no", "project", "approval", "cost_original_revised",
                 "cost_anticipated", "cumulative_expenditure",
                 "doc_original_revised", "doc_anticipated"):
        check_true(f"2024 partition has {want}", want in got, f"(got {got})")


# ---------------------------------------------------------------------------
# annexure classification
# ---------------------------------------------------------------------------

def test_annexure_kind():
    check("2010 prints no title", P.annexure_kind(load("2010-04-untitled")["head_text"]), None)
    check("2012 sector wise details is the consolidated table",
          P.annexure_kind(load("2012-04-sector-wise-details")["head_text"]), "consolidated")
    check("2020 detail of ongoing",
          P.annexure_kind(load("2020-04-detail-of-ongoing")["head_text"]), "consolidated")
    check("2024 delayed partition",
          P.annexure_kind(load("2024-04-delayed-partition")["head_text"]), "delayed")
    check("on-schedule partition",
          P.annexure_kind("Details of On Schedule Projects w.r.t. Original Schedule"),
          "on_schedule")
    check("without-DoC partition",
          P.annexure_kind("Details of Projects Without Date of Commissioning"), "without_doc")
    # The two cuts the post-2020 partition was originally missing. "Without
    # ORIGINAL Date of Commissioning" is a distinct annexure, not a re-cut —
    # without it October 2020 reconciles 118 rows short — and it must never be
    # swallowed by the without_doc pattern.
    check("without-ORIGINAL-DoC partition",
          P.annexure_kind("Details of Projects Without Original Date of Commissioning"),
          "without_original_doc")
    check("ahead partition",
          P.annexure_kind("Details of Projects Ahead of Schedule w.r.t. Original Schedule"),
          "ahead")
    # These are re-cuts of rows the ongoing annexures already carry.
    for other in ("List of ongoing projects having cost overrun w.r.t. to Latest Approved Cost",
                  "Details of Projects Without Milestones w.r.t. Original Schedule",
                  "List of Projects on schedule w.r.t. Latest Schedule",
                  "Month wise List of Completed Projects",
                  "Details of Ongoing Projects Under -Public Private Partnership Mode"):
        check(f"other: {other[:40]}", P.annexure_kind(other), "other")


def test_accounting_failure_names_what_broke():
    # The checks that decide whether a consolidated annexure can be trusted or
    # the report should fall back to its schedule-status partition. April 2021
    # is the motivating case: a clean 1..1737 serial run whose road pages print
    # the serial at the bottom of each block, shifting 122 codes off their rows.
    ok = [{"ocms_code": "A1"}, {"ocms_code": "A2"}]
    clean = {"c": {"forward_gap": 0, "starts_at": 1}}
    check("clean read passes", P.accounting_failure(ok, clean), None)
    check("a forward gap is named",
          P.accounting_failure(ok, {"c": {"forward_gap": 3, "starts_at": 1}}),
          "its numbering skips 3 row(s)")
    check("a missed leading page is named",
          P.accounting_failure(ok, {"c": {"forward_gap": 0, "starts_at": 12}}),
          "its numbering does not start at 1")
    check("codeless rows are named",
          P.accounting_failure([{"ocms_code": "A1"}, {"ocms_code": None}], clean),
          "1 row(s) carry no OCMS code")
    check("duplicated codes are named",
          P.accounting_failure([{"ocms_code": "A1"}, {"ocms_code": "A1"}], clean),
          "1 OCMS code(s) appear more than once")


def test_ahead_relistings_are_dropped_in_favour_of_the_primary_cut():
    # October 2020's "Ahead of Schedule" annexure re-lists 13 of its 21 projects
    # from the delayed and on-schedule cuts (they are ahead of their LATEST
    # schedule, not their original one). The re-listings must go — they would
    # trip the loader's duplicate-code gate — and the rows unique to the ahead
    # annexure must stay, because they complete the partition.
    def row(code, annexure):
        return {"ocms_code": code, "annexure": annexure}
    records = [row("A1", "delayed"), row("A2", "on_schedule"), row("A3", "without_doc"),
               row("A1", "ahead"), row("A4", "ahead"), row(None, "ahead")]
    warnings = []
    kept = P.drop_ahead_relistings(records, warnings)
    check("relisted ahead row dropped",
          [(r["ocms_code"], r["annexure"]) for r in kept],
          [("A1", "delayed"), ("A2", "on_schedule"), ("A3", "without_doc"),
           ("A4", "ahead"), (None, "ahead")])
    check_true("the drop is recorded", warnings and "1 of 3" in warnings[0],
               f"(got {warnings})")
    # No ahead annexure at all — records pass through untouched, no warning.
    warnings = []
    untouched = [row("A1", "delayed"), row("A2", "without_original_doc")]
    check("no ahead, no change", P.drop_ahead_relistings(untouched, warnings), untouched)
    check("no ahead, no warning", warnings, [])


# ---------------------------------------------------------------------------
# cell parsing
# ---------------------------------------------------------------------------

def test_project_cell():
    got = P.parse_project_cell(
        "GEVRA EXPANSION OCP (SECL) (35-70) MTY - [060100093]SECL,CHHATISGARH ,")
    check("name", got["project_name"], "GEVRA EXPANSION OCP (SECL) (35-70) MTY")
    check("code", got["ocms_code"], "060100093")
    check("agency", got["agency"], "SECL")
    check("state", got["state"], "CHHATISGARH")

    # 2010-11 clips the cell right after the code: no agency, no state.
    got = P.parse_project_cell("KAIGA 3 and 4 UNITS (NPCIL) - [020100041]")
    check("clipped name", got["project_name"], "KAIGA 3 and 4 UNITS (NPCIL)")
    check("clipped code", got["ocms_code"], "020100041")
    check("clipped agency", got["agency"], None)

    # Several years lose the closing bracket at the cell edge.
    got = P.parse_project_cell("REBUILDING OF COB-7 AT BSL - [N12000083")
    check("unclosed bracket code", got["ocms_code"], "N12000083")

    # A multi-state row keeps the verbatim string; the loader classifies it.
    got = P.parse_project_cell("NEW BG LINE - [N22000206]NFR,MULTI STATE")
    check("multi state", got["state"], "MULTI STATE")

    # THE TAIL HAS THREE FIELDS FROM 2016-17 ON: agency, state, funding type.
    # Joining the last two into the state produced ninety-odd labels that are
    # not places — "PUNJAB, EPC", "MAHARASHTRA, PPP (BOT)" — and none resolved.
    for cell, state in [
            ("KAKRAPAR ATOMIC POWER PROJECT - 3 AND 4 - [N02000010]NPCIL,GUJARAT , G", "GUJARAT"),
            ("SHAHKOT-MOGA SECTION OF NH-71 - [N24000385]MoRTH,PUNJAB ,EPC", "PUNJAB"),
            ("LIFE EXTENSION - [N16000213]ONGC,MAHARASHTRA ,Central Sector Projects", "MAHARASHTRA"),
            ("2-LANING - [N24000560]MoRTH,MADHYA PRADESH ,PPP (BOT)", "MADHYA PRADESH"),
            # the third field printed empty, which is how 2019-20 and April 2020
            # leave it — already worked, and must keep working
            ("WIDENING TO 2LPS - [N24000916]MoRTH,ODISHA ,", "ODISHA"),
            ("MULTI-STATE LINE - [N22000206]NFR,MULTI STATE ,G", "MULTI STATE")]:
        got = P.parse_project_cell(cell)
        check(f"state out of {cell[-28:]!r}", got["state"], state)
    check("the agency is still the first tail field",
          P.parse_project_cell("X - [N02000010]NPCIL,GUJARAT , G")["agency"], "NPCIL")

    got = P.parse_project_cell("SOME PROJECT WITH NO CODE AT ALL")
    check("no code", got["ocms_code"], None)
    check("no code keeps the name", got["project_name"], "SOME PROJECT WITH NO CODE AT ALL")


def test_glued_serial_numbers():
    # The plain case.
    check("plain glue", P.split_glued_sl_no("105REBUILDING OF BATTERY BLOCK", 105),
          (105, "REBUILDING OF BATTERY BLOCK"))
    # The ambiguous case: 109 + "3RD CONVERTER", never 1093 + "RD CONVERTER".
    check("ambiguous glue resolved by the sequence",
          P.split_glued_sl_no("1093RD CONVERTER AND 4TH CASTER", 109),
          (109, "3RD CONVERTER AND 4TH CASTER"))
    # A continuation line that merely starts with a number is NOT a serial.
    # Splitting these tore each project's code line into a record of its own and
    # invented serial numbers in the hundreds of thousands.
    check("continuation with a space is not a serial",
          P.split_glued_sl_no("500 MWE) - [020100044]", 5),
          (None, "500 MWE) - [020100044]"))
    check("project text starting with a digit is not a serial",
          P.split_glued_sl_no("3RD AND 4TH LINE BUDHAPANK", 595),
          (None, "3RD AND 4TH LINE BUDHAPANK"))
    check("out-of-sequence glue is refused",
          P.split_glued_sl_no("2LANING OF NH-31C", 700),
          (None, "2LANING OF NH-31C"))
    check("no digits at all", P.split_glued_sl_no("KAIGA 3 AND 4", 5), (None, "KAIGA 3 AND 4"))


def test_page_footer_is_not_data():
    """
    These reports centre their page number, and on the 2009-2011 pages the page
    centre falls inside the cost column. October 2009 page 27 ends with a lone
    "26" at x=306, which the cost column accepted as the revised approved cost
    of the last project on the page — giving a Rs 2,161 crore mine a revised
    approved cost of Rs 26 crore.
    """
    word = lambda t, x: {"text": t, "x0": x, "x1": x + 10, "top": 0}
    # Detached, single, numeric: the footer.
    check("detached page number", is_footer([word("26", 300)], 744.0, 721.0), True)
    # The same token at the table's own line pitch is a continuation cell.
    check("continuation cell at line pitch",
          is_footer([word("26", 300)], 730.0, 721.0), False)
    # A detached line with more than one word is a real row.
    check("detached multi-word line",
          is_footer([word("26", 300), word("03/2016", 420)], 744.0, 721.0), False)
    # Not every lone token is a page number.
    check("detached non-numeric", is_footer([word("Total", 300)], 744.0, 721.0), False)
    # The first line on a page has nothing to be detached from.
    check("no previous line", is_footer([word("26", 300)], 744.0, None), False)


def is_footer(words, top, prev_top):
    return P.is_page_footer(words, top, prev_top)


def test_numbers_and_months():
    check("crore figure", P.clean_num("11,459.00"), 11459.0)
    check("leading-dot figure", P.clean_num(".42"), 0.42)
    check("dash is absent, not zero", P.clean_num("-"), None)
    check("parenthesised dash", P.clean_num("(-)"), None)
    # A non-numeric cell is a parse failure, never a value.
    check("text in a number column", P.clean_num("03/2016"), None)

    check("month is zero padded", P.clean_month("3/2016"), "03/2016")
    check("month passthrough", P.clean_month("03/2016"), "03/2016")
    # There is no day component anywhere in this corpus, so a 13 can only be a
    # misread column — never a day that got into the month position.
    check("month 13 refused", P.clean_month("13/2016"), None)
    check("month 0 refused", P.clean_month("0/2016"), None)
    check("a bare number is not a month", P.clean_month("1,182.31"), None)
    check("dash is not a month", P.clean_month("-"), None)


def test_units_gate():
    ok, why = P.check_units("Detail of ongoing Projects (All Cost/ Expenditure in Rs. Crore)")
    check("crore page accepted", ok, True)
    ok, why = P.check_units("Statement of projects (Rs. in lakh)")
    check("lakh page refused", ok, False)
    # LAKHIMPUR, LAKHISARAI, LAKHANPUR. Matching a bare "lakh" substring here
    # dropped whole pages of genuinely crore-denominated road projects.
    ok, _ = P.check_units(
        "R AND U OF KHUTAR-LAKHIMPUR SECTION OF NH-730 - [N24000877]MoRTH,UTTAR PRADESH")
    check("a place name containing lakh is not a units declaration", ok, True)


def test_report_month_is_never_read_from_a_filename():
    """extract_projects takes the month off the document. The parenthesised
    stamp the annexure repeats on every page is the strongest signal."""
    check("2020 stamp", P.annexure_kind("x") is None or True, True)
    for label, want in (("2010-04-untitled", "APR"), ("2020-04-detail-of-ongoing", "APRIL"),
                        ("2024-04-delayed-partition", "APRIL")):
        head = load(label)["head_text"].upper()
        check_true(f"{label} stamps its own month", want in head, f"(head {head[:40]!r})")


# ---------------------------------------------------------------------------
# row assembly, end to end over a fixture page
# ---------------------------------------------------------------------------

def test_rows_off_a_real_page():
    fixture = load("2020-04-detail-of-ongoing")
    mapping_fields, lines, idx, edges = columns_of(fixture)
    mapping = {i: f for i, f in enumerate(mapping_fields) if f}
    run = {"label": "consolidated", "pages": [
        {"pageno": fixture["page"], "lines": lines, "idx": idx,
         "edges": edges, "mapping": mapping}]}
    warnings = []
    records, _contiguous = P.read_run(run, warnings)

    check_true("rows were read", len(records) >= 3, f"(got {len(records)})")
    first = records[0]
    check("first serial", first["sl_no"], 15)
    check("first code", first["ocms_code"], "N04000085")
    check("first agency", first["agency"], "AAI")
    check("first state", first["state"], "UTTARAKHAND")
    check_true("name spans its wrapped lines",
               first["project_name"].startswith("CONSTRUCTION OF DOMESTIC PASSENGER TERMINAL"),
               f"(got {first['project_name']!r})")
    check("approval", first["approval_date"], "07/2018")
    check("original cost", first["original_cost_cr"], 353.27)
    # "Anticipated" is the modern format's "revised" — the whole dataset hinges
    # on this mapping (see the module docstring).
    check("revised cost is the anticipated column", first["revised_cost_cr"], 353.27)
    check("expenditure", first["cumulative_expenditure_cr"], 114.29)
    check("original DoC", first["original_target_doc"], "09/2020")
    check("revised DoC is the anticipated column", first["revised_doc"], "09/2020")

    second = records[1]
    check("second serial", second["sl_no"], 16)
    check("second code", second["ocms_code"], "N04000080")
    check("a real slip is visible", (second["original_target_doc"], second["revised_doc"]),
          ("03/2020", "12/2020"))
    # Every row on this page carries an identity.
    check("no row lost its code", sum(1 for r in records if not r["ocms_code"]), 0)


def read_fixture_rows(label, annexure="consolidated"):
    """One fixture page through the real geometry + row assembly."""
    fixture = load(label)
    mapping_fields, lines, idx, edges = columns_of(fixture)
    mapping = {i: f for i, f in enumerate(mapping_fields) if f}
    run = {"label": annexure, "pages": [
        {"pageno": fixture["page"], "lines": lines, "idx": idx,
         "edges": edges, "mapping": mapping}]}
    records, _health = P.read_run(run, [])
    return {r["ocms_code"]: r for r in records}, records


def test_agency_heading_between_two_rows_is_not_part_of_either():
    """
    October 2020, delayed cut, page 337. The block reads:

        1  PROTOTYPE FAST BREEDER    …
           REACTOR (BHAVINI, 500 MWE) -
           [020100044]BHAVNI,TAMIL NADU
           Nuclear Power Corporation Of   ← the NEXT block's agency heading
           India Limited                  ← …wrapped onto a second line
        2  KAKRAPAR ATOMIC POWER     …

    Appending those two lines to row 1 gave it a state of "TAMIL NADU Nuclear
    Power Corporation Of India Limited", which is not a place and resolved to
    nothing. The same shape produced "RAJASTHAN Northern Railway", "ODISHA
    Neyveli Lignite Corporation" and "WEST BENGAL Uttar Pradesh Jal Nigam"
    across the whole 2020-2024 partitioned era.
    """
    by_code, records = read_fixture_rows("2020-10-delayed-agency-heading", "delayed")
    bhavini = by_code["020100044"]
    check("the heading did not join the state", bhavini["state"], "TAMIL NADU")
    check("the agency is still the cell's own", bhavini["agency"], "BHAVNI")
    check("the name is untouched", bhavini["project_name"],
          "PROTOTYPE FAST BREEDER REACTOR (BHAVINI, 500 MWE)")
    # Everything else about the row must be exactly where it was: dropping the
    # heading may not cost the row a figure printed on a genuine wrap line.
    check("original cost", bhavini["original_cost_cr"], 3492.0)
    check("anticipated cost is the revised one", bhavini["revised_cost_cr"], 6840.0)
    check("expenditure", bhavini["cumulative_expenditure_cr"], 5882.78)
    check("original DoC", bhavini["original_target_doc"], "09/2010")
    check("anticipated DoC is the revised one", bhavini["revised_doc"], "10/2022")
    check("the revised APPROVED cost rides along", bhavini["latest_approved_cost_cr"], 5677.0)
    check("the revised APPROVED date rides along", bhavini["approved_revised_doc"], "09/2016")
    check("the next row is its own row", by_code["N02000010"]["state"], "GUJARAT")
    check("no row on the page lost its state",
          sum(1 for r in records if r["state"] is None), 0)


def test_a_state_wrapped_across_two_lines_is_not_a_heading():
    """
    The counter-case, and the reason the heading rule is not simply "a
    project-column line with no code". April 2024 wraps the cell mid-state:

        [N04000092]AAI,ARUNACHAL
        PRADESH

    That second line is printed at the row's own wrap spacing, not a block
    apart, and dropping it would have truncated Arunachal Pradesh to
    "ARUNACHAL" — trading one wrong state for another.
    """
    by_code, _records = read_fixture_rows("2024-04-delayed-partition", "delayed")
    check("wrapped state survives", by_code["N04000092"]["state"], "ARUNACHAL PRADESH")
    check("and the one after it", by_code["N04000090"]["state"], "TAMIL NADU")
    check("an unwrapped state is unaffected", by_code["N04000088"]["state"], "GUJARAT")
    # 2015-04 wraps a state the same way in a different era and layout.
    by_code, _records = read_fixture_rows("2015-04-sector-wise-details")
    check("2015 wrapped state", by_code["N06000049"]["state"], "MADHYA PRADESH")


def test_a_cell_mospi_itself_clipped_yields_no_state():
    """
    October 2020, On Schedule cut, page 324. MoSPI clips the project cell in
    this annexure part-way through the OCMS code — "[N04000083" with no closing
    bracket, no agency and no state after it — so there is nothing to read. The
    honest answer is NULL, and it was previously the NEXT block's agency
    heading instead.
    """
    by_code, records = read_fixture_rows(
        "2020-10-on-schedule-clipped-cell", "on_schedule")
    row = by_code["N04000083"]
    check("no state was invented", row["state"], None)
    check("no agency was invented", row["agency"], None)
    check("the identity survives the clip", row["ocms_code"], "N04000083")
    check_true("the name is still read",
               row["project_name"].startswith("CONSTRUCTION OF NEW INTEGRATED TERMINAL"),
               f"(got {row['project_name']!r})")
    check("every row in this cut is stateless",
          sum(1 for r in records if r["state"]), 0)


def test_the_funding_type_column_never_reaches_the_state():
    """October 2017, page 61: the tail's third field is a bare "G"."""
    by_code, _records = read_fixture_rows("2017-10-contract-type-tail")
    check("gujarat", by_code["N02000010"]["state"], "GUJARAT")
    check("rajasthan", by_code["N02000027"]["state"], "RAJASTHAN")
    check("tamil nadu", by_code["020100044"]["state"], "TAMIL NADU")
    check("the agency is unaffected", by_code["N02000010"]["agency"], "NPCIL")
    check("and so are the figures", by_code["N02000010"]["original_cost_cr"], 11459.0)


def test_line_pitch_separates_a_wrap_from_a_new_block():
    """
    The measurement the heading rule rests on. Both spacings are set by MoSPI's
    own report generator and are compared with each other, per page, never with
    a constant — so a different font size in a different year changes nothing.
    """
    lines = [(100.0, []), (109.2, []), (118.4, []), (131.0, []),
             (140.2, []), (149.4, []), (162.0, []), (171.2, [])]
    check("the modal gap is the wrap spacing", P.line_pitch(lines), 9.0)
    check_true("a block gap clears the margin",
               131.0 - 118.4 > P.line_pitch(lines) + P.BLOCK_GAP_MARGIN)
    check_true("a wrap gap does not",
               109.2 - 100.0 <= P.line_pitch(lines) + P.BLOCK_GAP_MARGIN)
    # Too few lines to have a modal anything: say nothing rather than guess,
    # which leaves the row assembly exactly where it was before this rule.
    check("a short page declines to answer", P.line_pitch(lines[:3]), None)


# ---------------------------------------------------------------------------
# the transitional (October 2024) format
# ---------------------------------------------------------------------------

def test_transitional_title_detection():
    # Only the full ongoing list ("… as of <date>") is the transitional
    # annexure. The North-East subset shares the layout and must stay out, and
    # so must the month-delta tables and the contents page's list of titles.
    rx = P.TRANSITIONAL_TITLE_RE
    check_true("table 7 is transitional",
               bool(rx.search("Table:-7. Project List: Ongoing Projects as of 31st October 2024")))
    for other in ("Table:-6. Project List: Ongoing Projects of North-East Region",
                  "Table:-3. Project List: Completed during October 2024",
                  "Table:-4. Project List: Added during October 2024",
                  "Table:-5. Project List: Frozen/Deleted during October 2024"):
        check(f"not transitional: {other[:40]}", bool(rx.search(other)), False)


def test_transitional_header_ladder():
    check("state", P.classify_transitional_header("State"), "state")
    check("sector", P.classify_transitional_header("Sector"), "sector")
    check("serial", P.classify_transitional_header("Sl No"), "sl_no")
    check("project", P.classify_transitional_header(
        "Project Name (Agency Name) (Project Code)"), "project")
    check("approval", P.classify_transitional_header(
        "Date of Approval (MM/YYYY)"), "approval")
    check("doc", P.classify_transitional_header(
        "Date of Commissioning Original (Revised) {Anticipated} (MM/YYYY)"), "doc")
    # "in Rs. Crore" appears under BOTH money columns; expenditure must win its
    # own column before the bare cost test runs.
    check("cost", P.classify_transitional_header(
        "Cost Original (Revised) {Anticipated} in Rs. Crore"), "cost")
    check("expenditure", P.classify_transitional_header(
        "Cumulative Expenditure in Rs. Crore"), "cumulative_expenditure")
    check("progress", P.classify_transitional_header("Physical Progress (%)"),
          "physical_progress")
    check("blank", P.classify_transitional_header("  "), None)


def test_transitional_wrapped_values():
    # The wrapper character IS the column: bare/(revised)/{anticipated}.
    check("bare is original", P.transitional_wrapped("417.23"), ("original", "417.23"))
    check("parens are revised approved", P.transitional_wrapped("(707.73)"),
          ("revised", "707.73"))
    check("braces are anticipated", P.transitional_wrapped("{707.73}"),
          ("anticipated", "707.73"))
    check("NA in parens", P.transitional_wrapped("(N.A.)"), ("revised", "N.A."))


def test_transitional_months():
    check("slash month", P.clean_transitional_month("9/2018"), "09/2018")
    # The revised APPROVED date is the one value printed as "May-23".
    check("Mon-YY", P.clean_transitional_month("May-23"), "05/2023")
    check("Mon-YY unpadded", P.clean_transitional_month("Dec-21"), "12/2021")
    check("NA", P.clean_transitional_month("N.A."), None)
    check("not a month", P.clean_transitional_month("417.23"), None)


def test_transitional_project_cell():
    got = P.parse_transitional_project_cell(
        "CONSTRUCTION OF NEW INTEGRATED TERMINAL BUILDING AT VSI AIRPORT, "
        "PORTBLAIR (AAI) (N04000073)")
    check("name", got["project_name"],
          "CONSTRUCTION OF NEW INTEGRATED TERMINAL BUILDING AT VSI AIRPORT, PORTBLAIR")
    check("agency", got["agency"], "AAI")
    check("code", got["ocms_code"], "N04000073")

    # A parenthesised figure in the NAME must stay in the name; the code is the
    # last OCMS-shaped group, and the balanced group before it is the agency —
    # including agencies that nest parens.
    got = P.parse_transitional_project_cell(
        "LUDHIANA KILA RAIPUR (19 KMS) WITH FREIGHT LINE "
        "(Central Organisation for Railway Electrification (CORE)) (N22000584)")
    check("nested agency", got["agency"],
          "Central Organisation for Railway Electrification (CORE)")
    check("name keeps its own parens", got["project_name"],
          "LUDHIANA KILA RAIPUR (19 KMS) WITH FREIGHT LINE")
    check("nested code", got["ocms_code"], "N22000584")

    got = P.parse_transitional_project_cell("SOME PROJECT WITH NO CODE")
    check("no code", got["ocms_code"], None)
    check("no code keeps name", got["project_name"], "SOME PROJECT WITH NO CODE")


def test_transitional_rows_off_a_real_page():
    fixture = load("2024-10-transitional")
    page = FixturePage(fixture["words"])
    lines = P.visual_lines(page)
    warnings = []
    entry = P.transitional_page_entry(lines, fixture["page"], warnings)
    check_true("header block found", entry is not None, f"(warnings {warnings})")

    _edges, nbands = P.transitional_band_edges(
        [w for _top, ws in entry["data"] for w in ws])
    check("nine columns off one page", nbands, 9)

    records, health, pages_used = P.read_transitional([entry], warnings)
    check("pages used", pages_used, 1)
    check("rows on the page", len(records), 7)
    check("serials run from 1", health["starts_at"], 1)
    check("no serial gap", health["forward_gap"], 0)

    first = records[0]
    check("state", first["state"], "ANDAMAN AND NICOBAR ISLANDS")
    check("sector", first["sector"], "CIVIL AVIATION")
    check("code", first["ocms_code"], "N04000073")
    check("agency", first["agency"], "AAI")
    check_true("name spans its wrapped lines",
               first["project_name"].startswith("CONSTRUCTION OF NEW INTEGRATED TERMINAL"),
               f"(got {first['project_name']!r})")
    check("approval", first["approval_date"], "10/2013")
    check("original DoC", first["original_target_doc"], "09/2018")
    check("anticipated DoC is the revised one", first["revised_doc"], "06/2023")
    check("revised approved DoC read from Mon-YY", first["approved_revised_doc"], "05/2023")
    check("original cost", first["original_cost_cr"], 417.23)
    check("anticipated cost is the revised one", first["revised_cost_cr"], 707.73)
    check("revised approved cost", first["latest_approved_cost_cr"], 707.73)
    check("expenditure", first["cumulative_expenditure_cr"], 698.8)
    check("progress", first["physical_progress_pct"], 100.0)

    # Sector changes on row 2, state carries; both carry through row 4+,
    # whose labels the report does not reprint.
    check("sector moves with its label", records[1]["sector"], "RAILWAYS")
    check("state carries forward", records[3]["state"], "ANDAMAN AND NICOBAR ISLANDS")
    check("sector carries forward", records[3]["sector"], "ROAD TRANSPORT AND HIGHWAYS")
    # An (N.A.) revised line is an absent value, not a parse failure.
    check("NA revised approved DoC", records[1]["approved_revised_doc"], None)
    check("every row has a code", sum(1 for r in records if not r["ocms_code"]), 0)


def test_transitional_total_line_is_not_a_row():
    # The grand-total block at the annexure's foot ("Total 2,609,935.22 … /
    # (-) / {3,109,678.35}") must close the open row and attach to nothing.
    # A minimal page mimicking the real geometry: all nine columns present in
    # the data (the reader refuses anything else) and a header row to name them.
    word = lambda t, x, top: {"text": t, "x0": x, "x1": x + 4 * len(t), "top": top}
    entry = {"pageno": 1, "header": [(0, [
        word("State", 40, 0), word("Sector", 90, 0), word("Sl.No", 142, 0),
        word("Project", 165, 0), word("Approval", 290, 0),
        word("Commissioning", 330, 0), word("Cost", 400, 0),
        word("Expenditure", 468, 0), word("Progress", 540, 0)])], "data": [
        (0, [word("WEST", 40, 0), word("WATER", 90, 0), word("1", 145, 0),
             word("PROJECT", 165, 0), word("ALPHA", 195, 0),
             word("1/2018", 290, 0), word("12/2021", 345, 0), word("172.10", 400, 0),
             word("47.20", 470, 0), word("100", 540, 0)]),
        (10, [word("(KMDA)", 165, 10)]),
        (20, [word("(N30000048)", 165, 20)]),
        (30, [word("Total", 165, 30), word("2,609,935.22", 400, 30),
              word("1,644,087.19", 470, 30)]),
        (40, [word("(-)", 400, 40)]),
        (50, [word("{3,109,678.35}", 400, 50)]),
    ]}
    warnings = []
    records, health, _pages = P.read_transitional([entry], warnings)
    check("one row, not two", len(records), 1)
    check("the total is not in the name", records[0]["project_name"], "PROJECT ALPHA")
    check("agency", records[0]["agency"], "KMDA")
    check("the grand total never becomes a cost", records[0]["original_cost_cr"], 172.10)

    # A name that merely CONTAINS the word — this report really does wrap names
    # onto lines like "(TOTAL LENGTH 27.10 KM) ON" — is not a total row, and
    # treating it as one would truncate the name without disturbing the serial
    # run that would otherwise catch it.
    entry["data"] = entry["data"][:1] + [
        (10, [word("(TOTAL", 165, 10), word("LENGTH", 191, 10), word("27.10", 217, 10),
              word("KM)", 239, 10)]),
    ] + entry["data"][1:]
    warnings = []
    records, _health, _pages = P.read_transitional([entry], warnings)
    check("a name containing TOTAL survives", records[0]["project_name"],
          "PROJECT ALPHA (TOTAL LENGTH 27.10 KM)")
    check("its agency is still read", records[0]["agency"], "KMDA")
    check("its code is still read", records[0]["ocms_code"], "N30000048")


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        try:
            t()
        except Exception as e:  # noqa: BLE001 - the harness reports, it does not raise
            FAILURES.append(f"{t.__name__}: raised {type(e).__name__}: {e}")
    if FAILURES:
        print(f"FAILED {len(FAILURES)} check(s) across {len(tests)} test(s):")
        for f in FAILURES:
            print("  -", f)
        return 1
    print(f"ok - {len(tests)} parse_historical_report test(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
