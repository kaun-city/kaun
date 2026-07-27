/**
 * Unit tests for the MoSPI historical backfill (scripts/india/mospi/ and
 * scripts/india/load-mospi-historical.mjs).
 *
 * No network, no database, no PDFs. The Python parser's own geometry and
 * string handling is covered by tests/mospi_historical_parser_test.py against
 * committed word-box fixtures; this file runs that too, so `npm test` stays the
 * single entry point.
 *
 * Most of these assert what the backfill must NOT do: not join a 25-year time
 * series on a project name, not read a lakh table as crore, not overwrite what
 * the live monthly loader knows, not accept a report whose serial numbers have
 * a hole in them.
 *
 * Run: node --test tests/india-mospi-historical.test.mjs
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "fs"
import { execFileSync } from "child_process"
import { resolve, dirname, join } from "path"
import { fileURLToPath } from "url"

import {
  calendarMonth, partOf, parseArchiveRows, toCsv as inventoryCsv, missingMonths,
  localName, pdfUrl, annualAnchors, INVENTORY_COLUMNS, INVENTORY_CSV,
} from "../scripts/india/mospi/archive-inventory.mjs"
import {
  syntheticProjectCode, costLooksLikeCrore, unitSanity, toCsv, fromCsv,
  readSnapshotRow, artifactRows, gateReport, statedCountTolerance,
  SNAPSHOT_COLUMNS, SNAPSHOT_DIR, MANIFEST,
} from "../scripts/india/load-mospi-historical.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")

/* ========================================================================== */
/* archive inventory                                                          */
/* ========================================================================== */

test("calendarMonth maps an April-March financial year onto real months", () => {
  // Months 4-12 belong to the year the FY opens in; 1-3 to the next one. Getting
  // this backwards files every January-March report a year early.
  assert.equal(calendarMonth("2020-21", 4), "2020-04")
  assert.equal(calendarMonth("2020-21", 12), "2020-12")
  assert.equal(calendarMonth("2020-21", 1), "2021-01")
  assert.equal(calendarMonth("2020-21", 3), "2021-03")
  assert.equal(calendarMonth("2001-02", 4), "2001-04")
  assert.equal(calendarMonth("2020-21", 13), null)
  assert.equal(calendarMonth("2020-21", 0), null)
  assert.equal(calendarMonth("nonsense", 4), null)
})

test("partOf recognises the 2024-25 Part-I / Part-II split", () => {
  assert.equal(partOf("April_Part-II_List_of_tables.pdf"), "II")
  assert.equal(partOf("April_Part-I_Synopsis.pdf"), "I")
  assert.equal(partOf("FR_APril_2020.pdf"), null)
  assert.equal(partOf("MonthlyFR_apr_2004.pdf"), null)
})

test("parseArchiveRows reads a real ArchiveReport fragment", () => {
  const fragment =
    "<table><thead><tr><th>S.No.</th></tr></thead><tbody>" +
    "<tr><td>1</td><td>2020-21</td><td>April</td><td>" +
    "<a href='../ReportPage/ViewPdf?id=13&amp;path=Content\\ArchiveReport\\flash\\2020-21\\FR_APril_2020.pdf'>" +
    "<img src='/x.svg'></a></td></tr></tbody></table>"
  const rows = parseArchiveRows(fragment, "2020-21", 4)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    report_month: "2020-04",
    fyear: "2020-21",
    month_name: "April",
    paimana_id: 13,
    part: null,
    filename: "FR_APril_2020.pdf",
    // Windows server path, preserved verbatim: the endpoint rejects it normalised.
    archive_path: "Content\\ArchiveReport\\flash\\2020-21\\FR_APril_2020.pdf",
  })
  assert.match(pdfUrl(rows[0]), /ViewPdf\?id=13&path=Content%5CArchiveReport/)
  assert.equal(localName(rows[0]), "2020-21_04_FR_APril_2020.pdf")
})

test("parseArchiveRows returns nothing for an empty month rather than guessing", () => {
  assert.deepEqual(parseArchiveRows("", "2005-06", 4), [])
  assert.deepEqual(parseArchiveRows("<table><tbody></tbody></table>", "2005-06", 4), [])
})

test("missingMonths names the holes in the archive instead of hiding them", () => {
  const rows = [
    { report_month: "2001-04" }, { report_month: "2001-05" }, { report_month: "2001-07" },
  ]
  assert.deepEqual(missingMonths(rows), ["2001-06"])
  assert.deepEqual(missingMonths([]), [])
})

test("annualAnchors takes one report per financial year, April first", () => {
  const rows = [
    { fyear: "2020-21", report_month: "2020-04" },
    { fyear: "2020-21", report_month: "2020-10" },
    { fyear: "2005-06", report_month: "2005-05" },   // no April that year
    { fyear: "2005-06", report_month: "2005-11" },
  ]
  assert.deepEqual(annualAnchors(rows).map(r => r.report_month), ["2005-05", "2020-04"])
})

test("the committed archive inventory covers the full archive", () => {
  assert.ok(existsSync(INVENTORY_CSV), "archive-inventory.csv is committed")
  const text = readFileSync(INVENTORY_CSV, "utf8")
  const [head, ...lines] = text.trim().split("\n")
  assert.equal(head, INVENTORY_COLUMNS.join(","))
  const rows = lines.map(l => Object.fromEntries(l.split(",").map((v, i) => [INVENTORY_COLUMNS[i], v])))
  assert.ok(rows.length > 250, `expected the whole archive, got ${rows.length} rows`)
  // The archive reaches back to 2001-02 — that reach is the point of the file.
  assert.equal(rows[0].report_month, "2001-04")
  assert.ok(rows.every(r => /^\d{4}-\d{2}$/.test(r.report_month)))
  assert.ok(rows.every(r => /^\d+$/.test(r.paimana_id)))
  // Two months genuinely have no report at all; the file must say so by omission
  // rather than by inventing a row.
  assert.deepEqual(missingMonths(rows), ["2005-04", "2009-01"])
})

test("inventory CSV quotes only what has to be quoted", () => {
  const csv = inventoryCsv([{ a: "plain", b: 'has,comma' }], ["a", "b"])
  assert.equal(csv, 'a,b\nplain,"has,comma"\n')
})

/* ========================================================================== */
/* identity                                                                   */
/* ========================================================================== */

test("a historical project with no modern match gets its own greppable identity", () => {
  // MoSPI's own project_code values are bare digits, so the prefix can never
  // collide with one, and a later reviewed merge can find every synthetic row.
  assert.equal(syntheticProjectCode("N06000123"), "ocms:N06000123")
  assert.equal(syntheticProjectCode("060100093"), "ocms:060100093")
  assert.equal(syntheticProjectCode(" n06000123 "), "ocms:N06000123")
  assert.ok(!/^\d+$/.test(syntheticProjectCode("060100093")))
})

/* ========================================================================== */
/* units — the 100x error that looks plausible                                */
/* ========================================================================== */

test("costLooksLikeCrore rejects lakh and rupee readings of the same figure", () => {
  assert.equal(costLooksLikeCrore(353.27), true)
  assert.equal(costLooksLikeCrore(38585), true)
  assert.equal(costLooksLikeCrore(null), true, "absent is not wrong")
  assert.equal(costLooksLikeCrore(0), true)
  // ₹353.27 crore expressed in rupees, and a fraction of a crore.
  assert.equal(costLooksLikeCrore(3_532_700_000), false)
  assert.equal(costLooksLikeCrore(0.5), false)
  assert.equal(costLooksLikeCrore(-1), false)
})

test("unitSanity catches a whole report in the wrong unit, not just one row", () => {
  const crore = Array.from({ length: 21 }, (_, i) => ({ original_cost_cr: 150 + i * 100 }))
  const ok = unitSanity(crore)
  assert.equal(ok.ok, true)
  assert.ok(ok.median >= 150)

  // The same projects in lakh: every figure is 100x smaller and every one of
  // them still looks like a number a project could cost.
  const lakh = crore.map(r => ({ original_cost_cr: r.original_cost_cr / 100 }))
  assert.equal(unitSanity(lakh).ok, false)

  const rupees = crore.map(r => ({ original_cost_cr: r.original_cost_cr * 1e7 }))
  assert.equal(unitSanity(rupees).ok, false)

  assert.equal(unitSanity([]).ok, false)
  assert.equal(unitSanity([{ original_cost_cr: null }]).ok, false)
})

/* ========================================================================== */
/* CSV round trip                                                             */
/* ========================================================================== */

test("the committed artifact survives a write/read round trip unchanged", () => {
  const rows = [{
    report_month: "2015-04-01", ocms_code: "N12000080", sl_no: 105,
    project_name: 'REBUILDING OF "BATTERY" BLOCK 5A, 5B', sector: "STEEL",
    agency: "SAIL", state_raw: "Jharkhand", approval_month: "2012-11-01",
    original_doc_month: "2015-06-01", revised_doc_month: "2015-06-01",
    original_cost_cr: 313.05, revised_cost_cr: 313.05,
    cumulative_expenditure_cr: 217.48, physical_progress_pct: null,
    latest_approved_cost_cr: null, approved_revised_doc_month: null,
    delay_months_reported: "0(O)", milestones: "1/7", annexure: "consolidated",
    source_page: 151,
  }]
  const back = fromCsv(toCsv(rows, SNAPSHOT_COLUMNS)).map(readSnapshotRow)
  assert.deepEqual(back, rows)
})

test("fromCsv keeps embedded commas, quotes and blank cells straight", () => {
  const parsed = fromCsv('a,b,c\n1,"x, ""y""",\n')
  assert.deepEqual(parsed, [{ a: "1", b: 'x, "y"', c: "" }])
})

test("readSnapshotRow turns empty cells into null, never into 0", () => {
  const r = readSnapshotRow({ original_cost_cr: "", sl_no: "", project_name: "" })
  assert.equal(r.original_cost_cr, null)
  assert.equal(r.sl_no, null)
  assert.equal(r.project_name, null)
})

/* ========================================================================== */
/* artifact rows                                                              */
/* ========================================================================== */

const PARSED_SAMPLE = {
  report_month: "2020-04-01",
  era: "consolidated",
  stated_project_count: 2,
  extracted_count: 3,
  distinct_ocms_codes: 2,
  serials_start_at_one: true,
  serial_forward_gap: 0,
  serial_backward_steps: 0,
  duplicate_ocms_codes: [],
  records: [
    {
      sl_no: 15, sector: "CIVIL AVIATION", annexure: "consolidated",
      project_name: "CONSTRUCTION OF DOMESTIC PASSENGER TERMINAL",
      ocms_code: "N04000085", agency: "AAI", state: "UTTARAKHAND",
      approval_date: "07/2018", original_target_doc: "09/2020", revised_doc: "09/2020",
      original_cost_cr: 353.27, revised_cost_cr: 353.27,
      cumulative_expenditure_cr: 114.29, physical_progress_pct: null,
      latest_approved_cost_cr: null, approved_revised_doc: null,
      delay_months_reported: "0(O)", milestones: "0/0", source_page: 69,
    },
    {
      sl_no: 16, sector: "CIVIL AVIATION", annexure: "consolidated",
      project_name: "CONSTRUCTION OF ATC TOWER", ocms_code: "N04000080",
      agency: "AAI", state: "WEST BENGAL", approval_date: "01/2016",
      original_target_doc: "03/2020", revised_doc: "12/2020",
      original_cost_cr: 219.91, revised_cost_cr: 219.91,
      cumulative_expenditure_cr: 65.45, physical_progress_pct: null,
      latest_approved_cost_cr: 240.0, approved_revised_doc: "06/2020",
      delay_months_reported: "9(O)", milestones: "0/0", source_page: 69,
    },
    // A wrapped project name that lost its code line. It has no identity, so it
    // cannot be loaded; in every report checked these were parse artefacts of a
    // row already counted, never a project the report actually lists.
    {
      sl_no: 17, project_name: "REHABILITATION AND UPGRADATION OF NEW NH-",
      ocms_code: null, original_cost_cr: 289.67, source_page: 70,
    },
  ],
}

test("artifactRows keeps only rows that have an identity", () => {
  const rows = artifactRows(PARSED_SAMPLE)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(r => r.ocms_code), ["N04000085", "N04000080"])
  assert.ok(rows.every(r => r.report_month === "2020-04-01"))
})

test("artifactRows converts MM/YYYY to a first-of-month date", () => {
  const [first, second] = artifactRows(PARSED_SAMPLE)
  assert.equal(first.approval_month, "2018-07-01")
  assert.equal(first.original_doc_month, "2020-09-01")
  assert.equal(second.revised_doc_month, "2020-12-01")
  assert.equal(second.approved_revised_doc_month, "2020-06-01")
})

test("artifactRows carries the revised APPROVED cost separately from the anticipated one", () => {
  // These are different quantities. revised_cost_cr is MoSPI's anticipated cost
  // (the one its own overrun headline is computed from); the approved revision
  // is kept beside it and lands in snapshots.raw, not in the cost columns.
  const [, second] = artifactRows(PARSED_SAMPLE)
  assert.equal(second.revised_cost_cr, 219.91)
  assert.equal(second.latest_approved_cost_cr, 240.0)
})

test("artifactRows collapses a code repeated inside one report", () => {
  const dupes = {
    report_month: "2020-04-01",
    records: [
      { sl_no: 1, ocms_code: "N1", project_name: "A", original_cost_cr: 200 },
      { sl_no: 2, ocms_code: "N1", project_name: "A again", original_cost_cr: 200 },
    ],
  }
  assert.equal(artifactRows(dupes).length, 1)
})

test("artifactRows uppercases the code so the join is case-stable", () => {
  const rows = artifactRows({
    report_month: "2020-04-01",
    records: [{ sl_no: 1, ocms_code: "n04000085", original_cost_cr: 200 }],
  })
  assert.equal(rows[0].ocms_code, "N04000085")
})

/* ========================================================================== */
/* the gate                                                                   */
/* ========================================================================== */

const GOOD_ROWS = Array.from({ length: 21 }, (_, i) => ({ original_cost_cr: 200 + i * 50 }))

const HEALTHY = {
  report_month: "2020-04-01", era: "consolidated", serials_start_at_one: true,
  serial_forward_gap: 0, serial_backward_steps: 0,
  stated_project_count: 21, distinct_ocms_codes: 21, extracted_count: 21,
  duplicate_ocms_codes: [],
}

test("the gate passes a report whose own accounting adds up", () => {
  const { fatal, soft } = gateReport(HEALTHY, GOOD_ROWS)
  assert.deepEqual(fatal, [])
  assert.deepEqual(soft, [])
})

test("the gate refuses a serial run that skips rows the annexure counted", () => {
  // A FORWARD gap means a page the parser failed to read, and there is no way
  // to tell which projects went missing.
  const { fatal } = gateReport({ ...HEALTHY, serial_forward_gap: 3 }, GOOD_ROWS)
  assert.equal(fatal.length, 1)
  assert.match(fatal[0], /skips 3 row/)
})

test("the gate tolerates MoSPI renumbering its own tail", () => {
  // April 2018 numbers its rows 1..1330 and then prints two more as 1231 and
  // 1232. Its own summary says 1332 projects and 1332 rows come out, so nothing
  // is missing — a backward step is the publisher, not a parse defect.
  const { fatal, soft } = gateReport({ ...HEALTHY, serial_backward_steps: 1 }, GOOD_ROWS)
  assert.deepEqual(fatal, [])
  assert.equal(soft.length, 1)
  assert.match(soft[0], /steps backwards/)
})

test("the gate refuses a run that does not start at 1", () => {
  const { fatal } = gateReport({ ...HEALTHY, serials_start_at_one: false }, GOOD_ROWS)
  assert.ok(fatal.some(f => /does not start at 1/.test(f)))
})

test("the gate refuses a report whose annexure could not be identified", () => {
  const parsed = { ...HEALTHY, report_month: "2004-04-01", era: "unknown",
    serials_start_at_one: false, stated_project_count: null,
    distinct_ocms_codes: 0, extracted_count: 0 }
  const { fatal } = gateReport(parsed, [])
  assert.ok(fatal.some(f => /annexure was identified/.test(f)))
  assert.ok(fatal.some(f => /no rows were extracted/.test(f)))
  assert.ok(fatal.some(f => /unit check/.test(f)))
  // A report with no annexure must not ALSO be told its row numbering is wrong.
  assert.ok(!fatal.some(f => /does not start at 1/.test(f)))
})

test("the gate refuses a report month that is not the first of a month", () => {
  const { fatal } = gateReport({ ...HEALTHY, report_month: "2020-04-15" }, GOOD_ROWS)
  assert.ok(fatal.some(f => /first of a month/.test(f)))
})

test("the gate tolerates MoSPI disagreeing with itself by a row, but not by a table", () => {
  // October 2014 opens with "the status of the 748 ... Projects" while its own
  // summary table and annexure both say 747. One row is the document being
  // inconsistent; a wide gap means the wrong annexure is being read.
  assert.equal(statedCountTolerance(748), 4)
  assert.equal(statedCountTolerance(100), 1)

  const near = { ...HEALTHY, report_month: "2014-10-01",
    stated_project_count: 748, distinct_ocms_codes: 747, extracted_count: 747 }
  const nearResult = gateReport(near, GOOD_ROWS)
  assert.deepEqual(nearResult.fatal, [])
  assert.equal(nearResult.soft.length, 1)
  assert.match(nearResult.soft[0], /tolerance/)

  const far = { ...near, distinct_ocms_codes: 500, extracted_count: 500 }
  assert.equal(gateReport(far, GOOD_ROWS).fatal.length, 1)
})

test("the gate refuses duplicate identities inside one report", () => {
  const parsed = { ...HEALTHY, duplicate_ocms_codes: ["N04000085"] }
  assert.ok(gateReport(parsed, GOOD_ROWS).fatal.some(f => /duplicate/.test(f)))
})

test("the gate refuses a report in the wrong unit even when everything else adds up", () => {
  const parsed = { ...HEALTHY, report_month: "2015-04-01" }
  const lakh = GOOD_ROWS.map(r => ({ original_cost_cr: r.original_cost_cr / 100 }))
  assert.ok(gateReport(parsed, lakh).fatal.some(f => /unit check/.test(f)))
})

/* ========================================================================== */
/* the committed backfill itself                                              */
/* ========================================================================== */

test("every committed snapshot file is loadable and internally consistent", () => {
  if (!existsSync(SNAPSHOT_DIR)) return   // artifacts not generated in this tree
  const files = readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith(".csv")).sort()
  assert.ok(files.length > 0, "at least one report is committed")
  for (const f of files) {
    const month = f.replace(/\.csv$/, "")
    assert.match(month, /^\d{4}-\d{2}$/, `${f} is named for its report month`)
    const rows = fromCsv(readFileSync(join(SNAPSHOT_DIR, f), "utf8")).map(readSnapshotRow)
    assert.ok(rows.length > 100, `${f} has ${rows.length} rows`)

    // Every row belongs to the month the file is named for, and carries an
    // identity — the loader has nothing to attach a row without one to.
    assert.ok(rows.every(r => r.report_month === `${month}-01`), `${f}: report_month`)
    assert.ok(rows.every(r => r.ocms_code), `${f}: every row has an OCMS code`)
    assert.equal(new Set(rows.map(r => r.ocms_code)).size, rows.length, `${f}: unique codes`)

    // Units, per report, in the same shape the loader gates on.
    assert.equal(unitSanity(rows).ok, true, `${f}: costs are in ₹ crore`)

    // Every date is a first-of-month date. This one is absolute: the source
    // carries MM/YYYY only, so anything else is the parser inventing a day.
    let outOfRange = 0, datedCells = 0
    for (const col of ["approval_month", "original_doc_month", "revised_doc_month"]) {
      for (const r of rows) {
        if (r[col] == null) continue
        assert.match(r[col], /^\d{4}-\d{2}-01$/, `${f}: ${col} ${r[col]}`)
        datedCells++
        const year = Number(r[col].slice(0, 4))
        if (year < 1960 || year > 2060) outOfRange++
      }
    }
    // A year outside living memory is usually a parse defect and occasionally a
    // government typo: the October 2016 report really does print an approval
    // date of "04/2093" for LUMDING-DIBRUGARH on its page 66. Kaun publishes
    // what the source says, with the page number beside it, rather than quietly
    // correcting it — so this asserts the RATE. A column that had slipped would
    // put thousands of cells out of range, not two.
    assert.ok(outOfRange / datedCells < 0.001,
      `${f}: ${outOfRange} of ${datedCells} dates outside 1960-2060 — a shifted column`)
    for (const r of rows) {
      if (r.physical_progress_pct == null) continue
      assert.ok(r.physical_progress_pct >= 0 && r.physical_progress_pct <= 100,
        `${f}: physical progress ${r.physical_progress_pct}`)
    }
  }
})

test("the manifest records a gate verdict for every report the parser was shown", () => {
  if (!existsSync(MANIFEST)) return
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"))
  assert.ok(Array.isArray(manifest.reports) && manifest.reports.length > 0)
  for (const r of manifest.reports) {
    assert.ok(["ok", "refused"].includes(r.gate), `${r.source_pdf}: gate ${r.gate}`)
    // A refusal has to say why. "Refused" with no reason is unreviewable.
    if (r.gate === "refused") {
      assert.ok(r.gate_failures.length > 0, r.source_pdf)
    } else {
      assert.equal(r.rows_written, r.distinct_ocms_codes)
      // A loaded report never skipped a row its own annexure numbered.
      assert.equal(r.serial_forward_gap, 0, `${r.report_month}: no rows skipped`)
    }
  }
  // Every passing report has a committed CSV, and every committed CSV has a
  // manifest entry — a file with no provenance is not evidence of anything.
  if (existsSync(SNAPSHOT_DIR)) {
    const files = new Set(readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith(".csv"))
      .map(f => f.replace(/\.csv$/, "")))
    const passed = manifest.reports.filter(r => r.gate === "ok").map(r => r.report_month)
    for (const m of passed) assert.ok(files.has(m), `${m}.csv is committed`)
    for (const m of files) assert.ok(passed.includes(m), `${m} has a manifest entry`)
  }
})

test("the series moves plausibly across years for a long-running project", () => {
  if (!existsSync(SNAPSHOT_DIR)) return
  const files = readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith(".csv")).sort()
  const byCode = new Map()
  for (const f of files) {
    for (const r of fromCsv(readFileSync(join(SNAPSHOT_DIR, f), "utf8")).map(readSnapshotRow)) {
      if (!byCode.has(r.ocms_code)) byCode.set(r.ocms_code, [])
      byCode.get(r.ocms_code).push(r)
    }
  }
  const long = [...byCode.values()].filter(rs => rs.length >= 4)
  assert.ok(long.length > 50, `expected many multi-report projects, got ${long.length}`)
  let beforeApproval = 0, dated = 0

  for (const rs of long) {
    rs.sort((a, b) => a.report_month.localeCompare(b.report_month))
    const costs = rs.map(r => r.original_cost_cr).filter(v => v != null && v > 0)
    if (costs.length < 2) continue
    // The ORIGINAL sanctioned cost of a project is a historical fact. It can be
    // restated, but a 100x step between two reports is a unit flip, not a
    // restatement — this is the check that a mixed-unit era would fail.
    const lo = Math.min(...costs), hi = Math.max(...costs)
    assert.ok(hi / lo < 50,
      `${rs[0].ocms_code}: original cost swings ${lo} -> ${hi} across reports`)

    for (const r of rs) {
      if (!r.original_doc_month || !r.approval_month) continue
      dated++
      if (r.original_doc_month < r.approval_month) beforeApproval++
    }
  }

  // A project is approved before it is commissioned, so a commissioning date
  // earlier than the approval date is an anomaly — but a few are MoSPI's own.
  // KOLDAM HEP is approved 10/2002 in eleven reports and 01/2011 in the October
  // 2014 one; that report really does print 01/2011, so the parse is right and
  // the publisher is inconsistent.
  //
  // What this asserts is therefore the RATE, which is what a real defect moves.
  // A DD/MM inversion or a shifted date column would put a large share of the
  // series on the wrong side of this line, not a handful of rows.
  assert.ok(beforeApproval / dated < 0.01,
    `${beforeApproval} of ${dated} rows commission before approval — ` +
    `that is a date-column defect, not publisher noise`)
})

/* ========================================================================== */
/* the Python parser's own fixtures                                           */
/* ========================================================================== */

test("parse_historical_report fixture tests pass", { skip: pythonSkipReason() }, () => {
  const out = execFileSync("python3", [join(REPO_ROOT, "tests/mospi_historical_parser_test.py")],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  assert.match(out, /^ok - \d+ parse_historical_report test/m)
})

function pythonSkipReason() {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" })
  } catch {
    return "python3 is not available"
  }
  return false
}
