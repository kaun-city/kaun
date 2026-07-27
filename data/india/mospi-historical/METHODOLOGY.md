# MoSPI central-project cost overruns — the historical backfill

**The MoSPI flash report has been published every month since April 2001 and has
never existed as machine-readable data.** This directory is the first
machine-readable per-project cost-and-schedule series cut out of it.

Everything here is derived from MoSPI's own monthly *Flash Report on Central
Sector Projects (₹150 crore and above)*, published by the Infrastructure and
Project Monitoring Division and archived at
`paimana-proj.mospi.gov.in`. The reports are Government of India public
documents; nothing in them is modified, and every row carries the page it came
off.

---

## Files

| File | What it is |
|---|---|
| `archive-inventory.csv` | Every flash report the PAIMANA archive holds — one row per PDF, with the id and server path the download endpoint needs. Written by `scripts/india/mospi/archive-inventory.mjs`. |
| `snapshots/<YYYY-MM>.csv` | One report. One row per project, keyed on MoSPI's OCMS project code. |
| `manifest.json` | Provenance and the gate verdict for every report the parser was shown, including the ones it refused and why. |

Regenerate with:

```
node scripts/india/mospi/archive-inventory.mjs --write
node scripts/india/mospi/archive-inventory.mjs --fetch <dir outside the repo> --all
node scripts/india/load-mospi-historical.mjs --pdf-dir <that dir> --emit
```

The PDFs themselves are **not** committed — they are ~1.5 GB for the full
archive. They live outside the repo and are re-fetchable from the inventory.

---

## What the archive actually holds

291 reports across 24 financial years, 2001-02 to 2024-25, covering 286 distinct
calendar months. Two months have no report at all: **2005-04** and **2009-01**.
Ten files are the Part-I / Part-II split MoSPI introduced in 2024-25, where only
Part-II carries the per-project tables.

Filenames changed at least five times over the 25 years — `FR_April_2001.pdf`,
`MonthlyFR_apr_2004.pdf`, `FLR_APR_2009.pdf`, `fr_Apr_2010.pdf`,
`FR_APril_2020.pdf`, `April_Part-II_List_of_tables.pdf` — so a URL is never
constructed by hand. Every download starts from a listing row in
`archive-inventory.csv`.

### Access

Two undocumented JSON endpoints drive it:

```
GET /ReportPage/GetArchiveFinancialYearList        -> 24 financial years
GET /ReportPage/ArchiveReport?fyear=&month=&quater=&reportType=F
GET /ReportPage/ViewPdf?id=N&path=Content\ArchiveReport\flash\...
```

`month` and `quater` are non-nullable integers server-side; omitting either
returns an ASP.NET 500 whose `<title>` names the missing parameter. The walk is
therefore one request per (financial year, month), 288 of them, throttled.

`ViewPdf` serves fine from an Indian residential connection and 500s from GitHub
Actions runners — the same asymmetry that put a `pdf_release` input on
`.github/workflows/refresh-india-mospi.yml`. That is why parsing is a local,
occasional step whose **output** is committed here.

---

## The three eras

Established by reading one report per financial year across the whole archive.

| Reports | Layout | Parsed? |
|---|---|---|
| April 2001 … April 2009 | Summary-only reports (17-50 pages). A per-project table exists but prints **no OCMS project code**, and stacks original / (revised) / [anticipated] inside single cells. | **No** — see the identity floor below |
| October 2009 … April 2020 | One consolidated annexure holding every ongoing project — titled "Sector Wise Details" (2012-2016), "Detail of ongoing Projects Costing Rs 150 Crore and above" (2017-2020), or **untitled** (2009-2011, and October 2016) | Yes — this is what is committed here |
| October 2020 … 2024-25 | **No trustworthy consolidated annexure.** One is often still printed, but it either has no column-number row to anchor on (October 2020) or misattributes rows when read serial-first (April 2021). The ongoing list is instead read from its **five-way partition** — see below | Yes — the partition reconciles; see below |

The cutover between the first two rows falls **inside** 2009-10: the April 2009
report has no coded annexure and the October 2009 one does. That is exactly why
the era is decided per report, from the document, and never from the year.

2025-26 onward is a different document again — a genuinely bordered Table 6 —
and is handled by the monthly pipeline (`scripts/india/load-central-projects.mjs`
+ `scripts/india/mospi/parse_flash_report.py`), not by this backfill.

### How the columns are found

None of the pre-2025-26 annexures draws cell borders, so pdfplumber's table
extraction returns nothing and the modern parser's line-coordinate strategy has
nothing to latch onto. Instead:

1. **The number row.** Every one of these annexures prints `1 2 3 4 5 6 7 8 9 10`
   under its header. Those word positions are column anchors, printed by MoSPI's
   own report generator, on every page, in the report's own coordinate space.
2. **The gutters.** Splitting at the midpoint between two anchors assumes equal
   column widths; the project column is ~170pt wide and the serial column ~25pt,
   so the midpoint falls inside the project text and shears every name in half.
   The boundary is instead placed at the quietest x between two anchors — the
   position crossed by the fewest words on the page. That is the printed gutter.
3. **The header names the column, not the year.** The header block is bucketed
   into the same bands and matched against an ordered keyword ladder. The order
   matters: MoSPI heads its expenditure column "Cumulative Expenditure **Cost**",
   so `expenditure` must be tested before `cost`; "Anticipated Cost" is a cost
   and a bare "Anticipated" under "Date of Commissioning" is a date.

The consequence is that four visually different layouts parse through one code
path, and a fifth would too.

**Which annexure is the ongoing list** is a separate question from how to read
it, and it is answered from the report, not from the year. A run of pages titled
"Detail of ongoing Projects" or "Sector Wise Details" is the consolidated list.
Where the pages carry no title at all — 2009 to 2011, and October 2016 — the
untitled run is accepted only if it is the largest ongoing-list table in the
report, which the consolidated annexure always is, because it cannot be shorter
than a cut of itself. Overrun re-cuts are excluded by their titles and never by
their columns: the delayed-projects annexure has Time Overrun and Cost Overrun
columns of its own, and skipping pages on that basis threw away four years.

### The post-2020 partition — five annexures, not three

From October 2020 the ongoing list is read from its schedule-status partition.
Some of these reports still print a consolidated annexure, and it is still
preferred when it accounts for itself — but from October 2020 it rarely does.
October 2020's has no column-number row at all (a stacked three-line layout the
geometry cannot anchor on). April 2021's parses into a clean 1..1,737 serial
run and is still wrong: its road-sector pages print the serial number at the
*bottom* of each project's block, so serial-first row assembly stitches every
block to its neighbour's — names, costs and codes shift one project apart, and
122 rows come out with no code. That is a misattributed parse, not an
incomplete one, and it is exactly what the count gate caught. So a consolidated
annexure that skips rows, duplicates codes, or loses codes falls back to the
partition, which prints the same projects serial-first and reads cleanly.

The partition is five annexures, not the three it first appears to be:

1. **Details of Delayed Projects w.r.t. Original Schedule**
2. **Details of On Schedule Projects w.r.t. Original Schedule**
3. **Details of Projects Without Date of Commissioning**
4. **Details of Projects Without _Original_ Date of Commissioning** — a
   distinct annexure (projects whose original schedule was never fixed, as
   opposed to projects reporting no schedule at all), previously mistaken for
   an overrun-style re-cut. Without it every month reconciles ~120 rows short.
5. **Details of Projects Ahead of Schedule w.r.t. Original Schedule** — the odd
   one out. Its title says *original* schedule but its contents say otherwise:
   most of its rows are projects that are **delayed** against their original
   schedule and merely ahead of their *latest* one (October 2020's first row is
   GOPAL JI KANIHA — original commissioning 03/2013, anticipated 03/2022,
   revised 03/2028), and those rows are re-listings of rows annexures 1-2
   already carry. The parser keeps only the rows unique to it — the genuinely
   ahead-of-schedule projects no other cut lists — and drops the re-listings in
   favour of the primary cut's fuller row.

October 2020 proves the arithmetic on its own numbers: 539 delayed + 194 on
schedule + 794 without DoC + 130 without original DoC are pairwise disjoint,
and the report's own narrative says "for 924 projects neither the year of
commissioning nor the tentative gestation period has been reported" — 794 + 130
= 924 exactly. With the 8 rows unique to the ahead annexure the union is 1,665
distinct codes against a stated 1,666, inside the gate's tolerance (the report
also says "9 projects are ahead of schedule" while its ahead annexure carries 8
rows found nowhere else — MoSPI disagreeing with itself by one, as it does).

Annexures 1-4 are required for a partitioned month to load; the ahead annexure
is folded in when present but never required, because a month with nothing
ahead of schedule prints no such annexure.

---

## The identity floor — why 2001-2009 is a gap and not a guess

Every row here is keyed on the **OCMS project code** MoSPI prints in the project
cell (`[N06000123]`, or `[060100093]` in the older numbering). That code is the
only thing that ties a row in one report to the same project in another, and the
modern Table 6 still carries it as `legacy_ocms_code`. Rows without one are
dropped.

The earliest reports print no code. The only join available there is the project
**name**, and in this corpus names are truncated at the cell edge, re-spelled
between months, and repeated across genuinely different projects — April 2020
alone has eleven distinct rows beginning "REHABILITATION AND UPGRADATION OF NEW
NH-". Matching on them would manufacture a time series out of string similarity.

So those years are **inventoried and left unparsed**. They are in
`archive-inventory.csv`, they are refused with a stated reason in
`manifest.json`, and recovering them needs a different idea about identity —
not a fuzzier matcher.

The same rule governs the load. A historical project whose OCMS code matches an
existing `legacy_ocms_code` attaches to that project; one that matches nothing
gets its **own** identity, `project_code = "ocms:<CODE>"`. A project that
completed in 2014 and has no modern row is a real project with a real overrun,
and inventing a merge for it would be worse than leaving it standalone. MoSPI's
own `project_code` values are bare digits, so the prefix can never collide, and a
later reviewed merge can find every synthetic row.

---

## Units, and the one mapping the whole dataset hangs on

These reports carry **three** cost columns where the modern Table 6 carries two:

```
Original / Revised Cost  |  Anticipated Cost  |  Cumulative Expenditure
   (approved) (approved)       (expected)           (spent so far)
```

The modern format's "Revised Cost" is the **anticipated** cost, not the revised
*approved* cost. The reports prove it themselves:

- April 2015 states original ₹10,69,127.84 cr, anticipated ₹12,78,256.35 cr and
  an overrun of ₹2,09,128.51 cr — which is anticipated minus original exactly.
- KAKRAPAR 3&4 in April 2020 shows original commissioning 12/2015, anticipated
  09/2021 and a printed delay of "69(O)". 12/2015 → 09/2021 is 69 months. The
  revised approved date in the same row produces no such figure.

So `revised_cost_cr` / `revised_doc_month` here are MoSPI's *anticipated*
figures, matching the monthly loader's semantics exactly, and the revised
**approved** figures are kept beside them as `latest_approved_cost_cr` /
`approved_revised_doc_month` (they land in `in_central_project_snapshots.raw`).
Getting this backwards would silently zero out the overrun for the whole series.

Every cost is **₹ crore**. The annexure declares its own units and a page that
declares lakh is refused rather than converted. The declaration is matched as a
declaration, not as a substring: this corpus is full of place names containing
"lakh" (LAKHIMPUR, LAKHISARAI, LAKHANPUR), and matching those dropped whole
pages of genuinely crore-denominated road projects.

---

## The gate — a report is loaded only when its own accounting adds up

Each report is checked against itself before a single row is written:

1. **The serial-number run.** The annexure numbers its own rows. The parse must
   recover a contiguous `1..N` with no duplicate OCMS codes. A gap means a page
   the parser failed to read, and there is no way to tell which projects went
   missing. This is the primary gate, and every parsed era supports it.
2. **The report's own stated count**, where the summary states one in English.
   Tolerance is ±max(1, 0.5%) and any drift is recorded. Not zero, because MoSPI
   disagrees with itself: October 2014 opens with "the status of the 748 Central
   Sector Infrastructure Projects" while its own summary table says "No of
   Projects in Current Month 747" and its annexure lists exactly 747. A wider gap
   means the wrong annexure is being read, and stays fatal.
3. **Units.** A report whose median original cost is below ₹50 crore is not
   denominated in crore — MoSPI only tracks projects of ₹150 crore and above.
4. **The report month**, read off the stamp the annexure repeats on every one of
   its pages (`(April 2020)`, `(Apr,2010)`), never off the filename. The archive
   files 2024-25 months under the month they were *published*.

A refused report writes no CSV and records its reasons in `manifest.json`.

---

## Known gaps

- **April 2001 to April 2009** — no OCMS code in the annexure. Inventoried, not
  parsed.
- **2005-04 and 2009-01** — no report in the archive at all.
- **2024-25 Part-I files** — the Part-I / Part-II split puts the synopsis and
  the tables in separate PDFs; the Part-I files carry no per-project annexure
  and are refused ("no rows extracted"), which is correct — their months load
  from the Part-II files.
- **October 2024** — the archive's October 2024 file is already the modern
  bordered Table-6 document (the 2025-26 format arrived a year early), which is
  `parse_flash_report.py`'s document, not this parser's. It is refused here and
  stays a hole in the committed series until it is routed through the modern
  parser.
- **Density** — the committed series is annual and semi-annual anchors, not every
  month. The archive holds all 291 reports and the pipeline is per-report; adding
  months is a matter of fetching and parsing more of them, not of new code.
- **`start_month`** — the historical annexures carry a single approval date, not
  the approval/start pair the modern Table 6 prints. It is left NULL rather than
  copied from the approval date.
- **`physical_progress_pct`** — these eras report milestones achieved/total
  instead of a percentage. The raw milestone string is kept in
  `snapshots.raw.milestones`; the percentage column is left NULL rather than
  derived from it.
- **State resolution** — the 2009-2011 reports clip the project cell right after
  the code and carry no agency or state at all, so those rows have
  `state_raw = NULL`. Later years carry it and are resolved through the same
  alias path as the monthly loader, with unmatched labels reported for review.
- **Identity reach** — only about a tenth of the projects in any historical
  report still appear in the current one, because most of them completed and
  left the ongoing list years ago. The rest are loaded as their own `ocms:`
  identities, which is correct: they are real projects with real overruns, and
  they simply have no modern row to attach to.

## Corrections

To report an error: open an issue at `github.com/kaun-city/kaun` with label
`mospi-historical`, citing the report month, the OCMS code and the PDF page
number (both are on every row).
