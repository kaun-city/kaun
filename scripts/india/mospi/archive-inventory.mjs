#!/usr/bin/env node
/**
 * archive-inventory.mjs — walk the PAIMANA flash-report archive and write down
 * exactly what exists, then (optionally) download it.
 *
 *   node scripts/india/mospi/archive-inventory.mjs
 *   node scripts/india/mospi/archive-inventory.mjs --write
 *   node scripts/india/mospi/archive-inventory.mjs --fetch ~/…/raw/historical
 *   node scripts/india/mospi/archive-inventory.mjs --fetch DIR --all
 *
 * WHY AN INVENTORY IS ITS OWN ARTIFACT
 * The archive is the only description of itself. There is no index page, no
 * sitemap, and the filenames changed at least five times in 25 years
 * (FR_April_2001.pdf, MonthlyFR_apr_2004.pdf, FLR_APR_2009.pdf, fr_Apr_2010.pdf,
 * FR_APril_2020.pdf, April_Part-II_List_of_tables.pdf …). A URL is therefore
 * NEVER constructed by hand — every download starts from a listing row. Writing
 * the listing down as a committed CSV means the next run can tell "MoSPI removed
 * a report" apart from "our crawl broke", which a live-only crawl cannot.
 *
 * THE TWO ENDPOINTS
 *   GET /ReportPage/GetArchiveFinancialYearList   -> ["2024-25", … "2001-02"]
 *   GET /ReportPage/ArchiveReport?fyear=&month=&quater=&reportType=F
 *       -> {"html": "<table>…"} with ../ReportPage/ViewPdf?id=N&path=…
 *
 * `month` and `quater` are non-nullable ints on the server side: omitting either
 * returns an ASP.NET 500 whose <title> names the missing parameter (which is how
 * the parameter set was found in the first place). So the walk is one request per
 * (financial year, month) — 288 of them — rather than one per year.
 *
 * ViewPdf 500s intermittently, and always from GitHub Actions runners; it serves
 * fine from an Indian residential connection. That asymmetry is why --fetch is a
 * local step and the resulting PDFs get mirrored to a GitHub release for CI.
 */
import { writeFileSync, mkdirSync, statSync, readFileSync } from "fs"
import { resolve, dirname, join } from "path"
import { fileURLToPath } from "url"
import { politeFetch, fetchToFile } from "../lib/http.mjs"
import { flag, opt, run } from "../lib/cli.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, "../../..")
export const INVENTORY_CSV =
  resolve(REPO_ROOT, "data/india/mospi-historical/archive-inventory.csv")

const PAIMANA = "https://paimana-proj.mospi.gov.in"
const FY_LIST = `${PAIMANA}/ReportPage/GetArchiveFinancialYearList`
const ARCHIVE = `${PAIMANA}/ReportPage/ArchiveReport`
const VIEW_PDF = `${PAIMANA}/ReportPage/ViewPdf`

export const INVENTORY_COLUMNS = [
  "report_month", "fyear", "month_name", "paimana_id", "part", "filename", "archive_path",
]

/* -------------------------------------------------------------------------- */
/* pure helpers — exported for tests                                          */
/* -------------------------------------------------------------------------- */

/**
 * Calendar month for a (financial year, month index) pair.
 * India's FY runs April–March, so months 1-3 of "2020-21" are calendar 2021.
 */
export function calendarMonth(fyear, monthIndex) {
  const start = Number(String(fyear).slice(0, 4))
  if (!Number.isFinite(start) || !(monthIndex >= 1 && monthIndex <= 12)) return null
  const year = monthIndex >= 4 ? start : start + 1
  return `${year}-${String(monthIndex).padStart(2, "0")}`
}

/**
 * "April_Part-II_List_of_tables.pdf" -> "II". Null when the report is a single
 * PDF. From 2024-25 MoSPI split each month into a Part-I synopsis and a Part-II
 * table volume; only Part-II carries the per-project annexure.
 */
export function partOf(filename) {
  const m = /part[-_ ]?(i{1,3}|\d)/i.exec(String(filename ?? ""))
  if (!m) return null
  const raw = m[1].toUpperCase()
  return /^\d+$/.test(raw) ? "I".repeat(Number(raw)) : raw
}

/**
 * Rows out of one ArchiveReport HTML fragment.
 *
 * The fragment is a 4-column table (S.No | Financial Year | Month | Download);
 * the download cell holds the only copy of the id+path pair the PDF endpoint
 * needs. Backslashes in `path` are Windows server paths and are preserved
 * verbatim — the endpoint rejects them normalised.
 */
export function parseArchiveRows(htmlFragment, fyear, monthIndex) {
  const html = String(htmlFragment ?? "").replace(/&amp;/g, "&")
  const rows = []
  const re = /href='[^']*ViewPdf\?id=(\d+)&path=([^']+)'/gi
  const names = [...html.matchAll(/<td>\d+<\/td><td>[\d-]+<\/td><td>([A-Za-z]+)<\/td>/g)]
  let m, i = 0
  while ((m = re.exec(html))) {
    const path = m[2]
    const filename = path.split("\\").pop()
    rows.push({
      report_month: calendarMonth(fyear, monthIndex),
      fyear,
      month_name: names[i]?.[1] ?? null,
      paimana_id: Number(m[1]),
      part: partOf(filename),
      filename,
      archive_path: path,
    })
    i++
  }
  return rows
}

/** CSV with the repo's usual quoting (quote only when it matters). */
export function toCsv(rows, columns) {
  const cell = v => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(","), ...rows.map(r => columns.map(c => cell(r[c])).join(","))]
    .join("\n") + "\n"
}

/** Every calendar month the archive claims to cover, so gaps are nameable. */
export function missingMonths(rows) {
  const have = new Set(rows.map(r => r.report_month))
  const all = rows.map(r => r.report_month).filter(Boolean).sort()
  if (!all.length) return []
  const [first, last] = [all[0], all[all.length - 1]]
  const out = []
  let [y, m] = first.split("-").map(Number)
  const [ly, lm] = last.split("-").map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    if (!have.has(key)) out.push(key)
    if (++m === 13) { m = 1; y++ }
  }
  return out
}

/** Local filename for a listing row — stable, sortable, collision-free. */
export function localName(row) {
  return `${row.fyear}_${row.report_month.split("-")[1]}_${row.filename}`
}

export function pdfUrl(row) {
  return `${VIEW_PDF}?id=${row.paimana_id}&path=${encodeURIComponent(row.archive_path)}`
}

/**
 * One report per financial year, preferring April (the FY's first month, and
 * the month whose report is most likely to exist for every year).
 */
export function annualAnchors(rows, preference = [4, 5, 6, 3, 1]) {
  const byFy = new Map()
  for (const r of rows) {
    if (!byFy.has(r.fyear)) byFy.set(r.fyear, [])
    byFy.get(r.fyear).push(r)
  }
  const out = []
  for (const [, rs] of byFy) {
    const monthOf = r => Number(r.report_month.split("-")[1])
    let picked = null
    for (const want of preference) {
      const hit = rs.filter(r => monthOf(r) === want)
      if (hit.length) { picked = hit; break }
    }
    out.push(...(picked ?? [rs.slice().sort((a, b) => monthOf(a) - monthOf(b))[0]]))
  }
  return out.sort((a, b) => a.report_month.localeCompare(b.report_month))
}

/* -------------------------------------------------------------------------- */

async function crawl() {
  const fyears = await politeFetch(FY_LIST, { namespace: "mospi", maxAgeMs: 7 * 24 * 3600e3 })
  if (!Array.isArray(fyears) || !fyears.length) throw new Error("empty financial-year list")
  console.log(`  financial years: ${fyears.length} (${fyears[fyears.length - 1]} … ${fyears[0]})`)
  const rows = []
  for (const fyear of fyears.slice().reverse()) {
    for (let month = 1; month <= 12; month++) {
      const body = await politeFetch(
        `${ARCHIVE}?fyear=${fyear}&month=${month}&quater=1&reportType=F`,
        { namespace: "mospi", maxAgeMs: 24 * 3600e3, delayMs: 400 })
      rows.push(...parseArchiveRows(body?.html ?? "", fyear, month))
    }
    process.stdout.write(`\r  crawled ${fyear} — ${rows.length} report(s) so far`)
  }
  process.stdout.write("\n")
  return rows.sort((a, b) =>
    a.report_month.localeCompare(b.report_month) || a.filename.localeCompare(b.filename))
}

async function main() {
  const write = flag("write")
  const fetchDir = opt("fetch")
  const all = flag("all")
  console.log(`\narchive-inventory — PAIMANA flash-report archive`)

  const rows = await crawl()
  const months = new Set(rows.map(r => r.report_month))
  const gaps = missingMonths(rows)
  console.log(`  reports: ${rows.length} across ${months.size} distinct month(s)`)
  console.log(`  split into parts: ${rows.filter(r => r.part).length}`)
  console.log(`  months with no report at all: ${gaps.length}${gaps.length ? ` (${gaps.join(", ")})` : ""}`)

  if (write) {
    mkdirSync(dirname(INVENTORY_CSV), { recursive: true })
    writeFileSync(INVENTORY_CSV, toCsv(rows, INVENTORY_COLUMNS))
    console.log(`  wrote ${INVENTORY_CSV}`)
  } else {
    console.log(`  (pass --write to update ${INVENTORY_CSV})`)
  }

  if (fetchDir) {
    const wanted = all ? rows : annualAnchors(rows)
    mkdirSync(fetchDir, { recursive: true })
    console.log(`\n  fetching ${wanted.length} report(s) → ${fetchDir}`)
    let ok = 0, failed = 0
    for (const [i, row] of wanted.entries()) {
      const dest = join(fetchDir, localName(row))
      try {
        const got = await fetchToFile(pdfUrl(row), dest)
        // A 500 from ViewPdf still writes an HTML error body; refuse it loudly
        // rather than handing a parser something that is not a PDF.
        const head = readFileSync(dest).subarray(0, 5).toString("latin1")
        if (head !== "%PDF-") throw new Error("response is not a PDF (ViewPdf 500?)")
        ok++
        console.log(`  [${i + 1}/${wanted.length}] ${got.cached ? "cached" : "downloaded"} ` +
          `${(statSync(dest).size / 1e6).toFixed(1)}MB ${localName(row)}`)
      } catch (e) {
        failed++
        console.warn(`  [${i + 1}/${wanted.length}] FAILED ${localName(row)}: ${e.message}`)
      }
    }
    console.log(`  fetched ${ok}, failed ${failed}`)
  }
}

run(main, import.meta.url)
