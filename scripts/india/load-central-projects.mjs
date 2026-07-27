#!/usr/bin/env node
/**
 * load-central-projects.mjs — populates in_central_projects and
 * in_central_project_snapshots from a MoSPI flash report.
 *
 * Usage:
 *   node scripts/india/load-central-projects.mjs --latest
 *   node scripts/india/load-central-projects.mjs --month 2026-05
 *   node scripts/india/load-central-projects.mjs --pdf <local.pdf>
 *   node scripts/india/load-central-projects.mjs --latest --apply
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   (or KAUN_LOCAL_PG for local testing)
 *   Requires python3 + `pip install -r scripts/india/mospi/requirements.txt`.
 *
 * PARSE IN PYTHON, LOAD IN NODE. Table 6 exists only inside a ~160-page PDF and
 * pdfplumber is the tool that reads it, so scripts/india/mospi/parse_flash_report.py
 * owns the extraction and emits JSON. Everything after that — discovery, the
 * sanity gate, date rules, the upserts — is Node, like every other adapter in
 * this repo. The two halves talk over a JSON file, so the parser can be run and
 * diffed on its own.
 *
 * WHY A SNAPSHOT PER MONTH
 * project_code is stable month-over-month (Mar→Apr 99.1%, Apr→May 98.5%
 * overlap; the non-overlap is genuine adds and completions, not ID churn).
 * That stability is what makes a monthly snapshot table a real time series:
 * Apr→May 2026 alone carries 450 revised commissioning dates and 11 revised
 * costs. Storing only "latest" would throw the entire signal away.
 *
 * THE SANITY GATE
 * The report states its own ongoing-project count on its summary page. If the
 * parser's row count does not match it EXACTLY, the layout moved and the load
 * is refused. Recon hit 1,987/1,987, 1,981/1,981 and 1,941/1,941 across three
 * months with zero missing fields, so anything less than exact is a defect, not
 * noise. --allow-count-mismatch exists for a human who has looked and decided
 * otherwise; it is never set by the workflow.
 *
 * SCHEMA DRIFT IS THE MAIN RISK
 * MoSPI changed Table 6's column set between March and April 2026 (PMGID
 * appeared) and the pre-2021 reports use a different multi-annexure layout
 * entirely. Every parsed field the loader does not recognise goes into
 * in_central_project_snapshots.raw (jsonb) rather than being dropped, so a new
 * column never fails an ingest and can be promoted to a first-class column
 * later, additively, without losing the months in between. parser_version is
 * written on every row so a re-parse is attributable.
 *
 * ARCHIVE ACCESS — two surfaces, both walked, never guessed
 *   current   the PAIMANA home page's "What's New" block links the most recent
 *             months as /Home/ViewPdf/<id>?path=FlashReport_<Month>_<Year>.pdf
 *   archive   /ReportPage/ArchiveReport?fyear=&month=&quater=&reportType=F
 *             returns {"html": "<table>…"} whose rows link
 *             ../ReportPage/ViewPdf?id=N&path=…
 *             (the parameter set is undocumented; the server's own 500 page
 *             names the missing ones, which is how `quater` was found)
 * Filename patterns changed 5+ times in 25 years, so a URL is never
 * constructed by hand. Publication lag is ~7-8 weeks.
 *
 * KNOWN GAPS (unchanged from recon, and deliberately not papered over):
 *   - pre-2021 reports use a different layout; the parser rejects them via the
 *     count gate rather than importing garbage.
 *   - 2024-25 months are split into Part-I / Part-II PDFs; --month for those
 *     picks the first part and the gate will fail. Handle before backfilling.
 */
import { execFileSync } from "child_process"
import { readFileSync, mkdirSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { openSink } from "./lib/sink.mjs"
import { politeFetch, fetchToFile, CACHE_DIR } from "./lib/http.mjs"
import { loadPcReference, loadAliases, aliasCandidate, readStateAliases,
         buildStateIndex, classifyState } from "./lib/pc-reference.mjs"
import { flag, opt, banner, run } from "./lib/cli.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOADER = "load-central-projects"

const PAIMANA = "https://paimana-proj.mospi.gov.in"
const ENDPOINTS = {
  home: `${PAIMANA}/`,
  financialYears: `${PAIMANA}/ReportPage/GetArchiveFinancialYearList`,
  archiveReport: `${PAIMANA}/ReportPage/ArchiveReport`,
}
const PARSER = resolve(__dirname, "mospi/parse_flash_report.py")

const MONTHS = ["january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"]

/* -------------------------------------------------------------------------- */
/* pure helpers — exported for tests                                          */
/* -------------------------------------------------------------------------- */

/** "05/2026" → "2026-05-01". MoSPI publishes MM/YYYY cells only. */
export function monthCellToDate(s) {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(String(s ?? "").trim())
  if (!m) return null
  const mm = Number(m[1])
  if (mm < 1 || mm > 12) return null
  return `${m[2]}-${String(mm).padStart(2, "0")}-01`
}

/** Whole months between two first-of-month dates; null if either is missing. */
export function monthsBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null
  const [fy, fm] = fromIso.split("-").map(Number)
  const [ty, tm] = toIso.split("-").map(Number)
  if (![fy, fm, ty, tm].every(Number.isFinite)) return null
  return (ty - fy) * 12 + (tm - fm)
}

/** "FlashReport_March_2026.pdf" → { year, month }. */
export function monthFromFilename(name) {
  const m = new RegExp(`(${MONTHS.join("|")})[ _-]+(\\d{4})`, "i").exec(String(name ?? ""))
  if (!m) return null
  return { year: Number(m[2]), month: MONTHS.indexOf(m[1].toLowerCase()) + 1 }
}

/** Reports linked from the PAIMANA landing page's "What's New" block. */
export function parseHomeReports(html) {
  const out = []
  const re = /href=["']([^"']*ViewPdf\/(\d+)\?path=([^"']+))["']/gi
  let m
  while ((m = re.exec(html))) {
    const path = decodeURIComponent(m[3])
    if (!/flash/i.test(path)) continue
    const when = monthFromFilename(path)
    if (!when) continue
    out.push({
      ...when,
      label: path,
      url: new URL(m[1].startsWith("http") ? m[1] : m[1].replace(/^\/?/, "/"), PAIMANA).toString(),
      surface: "home",
    })
  }
  return out
}

/** The ArchiveReport HTML fragment → report rows. */
export function parseArchiveReports(htmlFragment, fyear, month) {
  const out = []
  const re = /href=['"]([^'"]*ViewPdf\?id=(\d+)&(?:amp;)?path=([^'"]+))['"][^>]*>[\s\S]*?<\/a>/gi
  let m
  while ((m = re.exec(htmlFragment))) {
    const path = decodeURIComponent(m[3].replace(/&amp;/g, "&"))
    const href = m[1].replace(/&amp;/g, "&").replace(/^\.\.\//, "/")
    out.push({
      year: null, month,
      fyear,
      label: path,
      url: new URL(href.startsWith("http") ? href : href.replace(/^\/?/, "/"), PAIMANA).toString(),
      surface: "archive",
      is_split_part: /part[-_ ]?(i{1,3}|\d)/i.test(path),
    })
  }
  return out
}

// classifyState moved to lib/pc-reference.mjs, where the state-alias table and
// the shared normalisers live, so the historical backfill and this monthly
// loader cannot drift apart on what "Chhattisgarh" or "Multi State" means.
// Re-exported because callers (and the tests) have always imported it here.
export { classifyState } from "./lib/pc-reference.mjs"

/** Fields the loader promotes to columns. Everything else lands in snapshots.raw. */
export const KNOWN_FIELDS = new Set([
  "sl_no", "ministry", "sector", "project_name", "agency", "project_code",
  "legacy_ocms_code", "pmgid", "state", "approval_date", "start_date",
  "original_target_doc", "revised_doc", "original_cost_cr", "revised_cost_cr",
  "cumulative_expenditure_cr", "physical_progress_pct", "source_page",
])

/* -------------------------------------------------------------------------- */
/* discovery                                                                   */
/* -------------------------------------------------------------------------- */

async function discoverReports(sink, { wantMonth }) {
  const reports = []

  const home = await politeFetch(ENDPOINTS.home, {
    namespace: "mospi", json: false, maxAgeMs: 6 * 3600e3,
  })
  reports.push(...parseHomeReports(home))
  sink.count("reports on the PAIMANA landing page", reports.length)

  // The archive is only worth walking when a specific older month is asked for
  // — it is one request per (financial year, month).
  if (wantMonth) {
    const [year, month] = wantMonth.split("-").map(Number)
    if (!reports.some(r => r.year === year && r.month === month)) {
      const fyears = await politeFetch(ENDPOINTS.financialYears, {
        namespace: "mospi", maxAgeMs: 7 * 24 * 3600e3,
      })
      // April–March financial year: Jan–Mar belong to the previous FY start.
      const fyStart = month >= 4 ? year : year - 1
      const fyear = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`
      if (!Array.isArray(fyears) || !fyears.includes(fyear)) {
        sink.warn(`financial year ${fyear} is not in the PAIMANA archive list`)
      } else {
        const body = await politeFetch(
          `${ENDPOINTS.archiveReport}?fyear=${fyear}&month=${month}&quater=1&reportType=F`,
          { namespace: "mospi", maxAgeMs: 24 * 3600e3 })
        const found = parseArchiveReports(body?.html ?? "", fyear, month)
          .map(r => ({ ...r, year }))
        reports.push(...found)
        sink.count(`archive reports for ${fyear} month ${month}`, found.length)
      }
    }
  }
  return reports
}

function pickReport(reports, { wantMonth, latest }) {
  const sorted = reports.slice().sort((a, b) =>
    (b.year - a.year) || (b.month - a.month) || String(a.label).localeCompare(String(b.label)))
  if (wantMonth) {
    const [year, month] = wantMonth.split("-").map(Number)
    return sorted.find(r => r.year === year && r.month === month) ?? null
  }
  return latest ? sorted[0] ?? null : null
}

/* -------------------------------------------------------------------------- */

async function main() {
  const wantMonth = opt("month")
  const latest = flag("latest") || !wantMonth
  const localPdf = opt("pdf")
  const allowMismatch = flag("allow-count-mismatch")
  const apply = banner(LOADER, {
    target: localPdf ? localPdf : (wantMonth ?? "latest published"),
    parser: PARSER,
  })
  const sink = openSink({ loader: LOADER, apply })

  /* ---- 1. find the PDF -------------------------------------------------- */
  let pdfPath = localPdf
  let sourceUrl = null
  let chosen = null
  if (!pdfPath) {
    const reports = await discoverReports(sink, { wantMonth })
    chosen = pickReport(reports, { wantMonth, latest })
    if (!chosen) {
      sink.warn(`no flash report found for ${wantMonth ?? "the latest month"}. ` +
        `Available: ${reports.map(r => `${r.year}-${r.month}`).join(", ") || "none"}`)
      sink.finish({ gate: "no report found" })
      process.exit(1)
    }
    if (chosen.is_split_part) {
      sink.warn(`${chosen.label} is a Part-I/Part-II split report — the 2024-25 ` +
        `split layout is not handled yet and the count gate will refuse it.`)
    }
    sourceUrl = chosen.url
    sink.note(`report: ${chosen.label} (${chosen.surface})`)
    const dest = resolve(CACHE_DIR, "mospi", chosen.label.replace(/[^\w.-]+/g, "_"))
    mkdirSync(dirname(dest), { recursive: true })
    const got = await fetchToFile(sourceUrl, dest)
    sink.note(`pdf ${got.cached ? "cached" : "downloaded"} → ${got.path}`)
    pdfPath = got.path
  }

  /* ---- 2. parse (python) ------------------------------------------------ */
  const outJson = resolve(CACHE_DIR, "mospi", `parsed-${Date.now()}.json`)
  mkdirSync(dirname(outJson), { recursive: true })
  try {
    execFileSync("python3", [PARSER, pdfPath, "--out", outJson],
      { stdio: ["ignore", "inherit", "inherit"], maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    throw new Error(`parser failed (is pdfplumber installed? ` +
      `pip install -r scripts/india/mospi/requirements.txt): ${e.message}`)
  }
  const parsed = JSON.parse(readFileSync(outJson, "utf8"))

  const reportMonth = parsed.report_month ??
    (wantMonth ? `${wantMonth}-01` : null)
  sink.count("rows extracted", parsed.extracted_count)
  sink.count("stated project count", parsed.stated_project_count ?? -1)
  sink.count("pages used", parsed.pages_used)
  for (const w of parsed.warnings ?? []) sink.warn(`parser: ${w}`)

  /* ---- 3. the sanity gate ----------------------------------------------- */
  const fatal = []
  if (!reportMonth) fatal.push("could not determine the report month")
  if (parsed.stated_project_count == null) {
    fatal.push("the report's own project count could not be read (summary layout moved)")
  } else if (parsed.stated_project_count !== parsed.extracted_count) {
    fatal.push(`extracted ${parsed.extracted_count} rows but the report states ` +
      `${parsed.stated_project_count} — the table layout moved`)
  }
  if (parsed.duplicate_project_codes?.length) {
    fatal.push(`${parsed.duplicate_project_codes.length} duplicate project_code value(s)`)
  }
  if (fatal.length && !allowMismatch) {
    for (const f of fatal) sink.warn(f)
    sink.finish({ gate: "failed", fatal })
    console.error(`\nSanity gate failed:\n  - ${fatal.join("\n  - ")}` +
      `\n(pass --allow-count-mismatch only after looking at the PDF yourself)`)
    process.exit(1)
  }
  if (fatal.length) sink.warn(`--allow-count-mismatch: proceeding despite ${fatal.length} gate failure(s)`)

  /* ---- 4. transform ------------------------------------------------------ */
  const reference = await loadPcReference(sink)
  const aliases = await loadAliases(sink, ["mospi"])
  const stateIndex = buildStateIndex({
    reference, pcAliases: aliases, source: "mospi",
    stateAliases: readStateAliases(undefined, { reference }),
  })

  const projects = []
  const snapshots = []
  const stateCandidates = new Map()

  for (const r of parsed.records) {
    if (!r.project_code) continue
    const st = classifyState(r.state, stateIndex)
    if (st.unresolved && r.state) {
      stateCandidates.set(r.state, (stateCandidates.get(r.state) ?? 0) + 1)
    }
    projects.push({
      project_code: String(r.project_code),
      legacy_ocms_code: r.legacy_ocms_code ?? null,
      pmgid: r.pmgid ?? null,
      project_name: r.project_name ?? "(unnamed)",
      ministry: r.ministry ?? null,
      sector: r.sector ?? null,
      agency: r.agency ?? null,
      state_raw: r.state ?? null,
      st_code: st.st_code,
      is_multi_state: st.is_multi_state,
      first_seen_month: reportMonth,
      last_seen_month: reportMonth,
      is_ongoing: true,
      data_source: "MoSPI Flash Report Table 6 (PAIMANA)",
      updated_at: new Date().toISOString(),
    })

    const originalDoc = monthCellToDate(r.original_target_doc)
    const revisedDoc = monthCellToDate(r.revised_doc)
    const extra = Object.fromEntries(
      Object.entries(r).filter(([k]) => !KNOWN_FIELDS.has(k)))
    snapshots.push({
      project_code: String(r.project_code),
      report_month: reportMonth,
      sl_no: Number.isFinite(Number(r.sl_no)) ? Number(r.sl_no) : null,
      approval_month: monthCellToDate(r.approval_date),
      start_month: monthCellToDate(r.start_date),
      original_doc_month: originalDoc,
      revised_doc_month: revisedDoc,
      original_cost_cr: typeof r.original_cost_cr === "number" ? r.original_cost_cr : null,
      revised_cost_cr: typeof r.revised_cost_cr === "number" ? r.revised_cost_cr : null,
      cumulative_expenditure_cr:
        typeof r.cumulative_expenditure_cr === "number" ? r.cumulative_expenditure_cr : null,
      physical_progress_pct:
        typeof r.physical_progress_pct === "number" ? r.physical_progress_pct : null,
      // The loader owns the date rules, so it owns the derived slip too.
      schedule_slip_months: monthsBetween(originalDoc, revisedDoc),
      // Anything the loader does not recognise survives here rather than being
      // dropped — this is how the April 2026 PMGID column would have landed.
      raw: Object.keys(extra).length ? extra : {},
      source_page: Number.isFinite(Number(r.source_page)) ? Number(r.source_page) : null,
      source_pdf_url: sourceUrl,
      parser_version: parsed.parser_version,
      ingested_at: new Date().toISOString(),
    })
  }

  sink.count("projects", projects.length)
  sink.count("snapshots", snapshots.length)
  sink.count("resolved to a state", projects.filter(p => p.st_code != null).length)
  sink.count("multi-state", projects.filter(p => p.is_multi_state).length)
  sink.count("with a revised schedule", snapshots.filter(s => s.revised_doc_month).length)
  sink.count("with a schedule slip > 0",
    snapshots.filter(s => (s.schedule_slip_months ?? 0) > 0).length)
  sink.count("with a cost revision",
    snapshots.filter(s => s.revised_cost_cr != null && s.original_cost_cr != null &&
      s.revised_cost_cr !== s.original_cost_cr).length)

  if (stateCandidates.size) {
    sink.review("state-alias-candidates", [...stateCandidates].map(([label, n]) =>
      aliasCandidate({ source: "mospi", sourceKey: label, sourceLabel: label,
        stateName: label, reason: "no_exact_state_match", extra: { projects: n } })))
    sink.warn(`${stateCandidates.size} MoSPI state label(s) did not match a known state — ` +
      `st_code left NULL and reported for review`)
  }

  /* ---- 5. write ---------------------------------------------------------- */
  await sink.upsert("in_central_projects", projects, {
    conflict: ["project_code"], batch: 200,
    updateExpressions: {
      // A re-ingest of an OLDER report must not move a project's first sighting
      // forwards, nor its last sighting backwards.
      first_seen_month: `LEAST("in_central_projects".first_seen_month, EXCLUDED.first_seen_month)`,
      last_seen_month: `GREATEST("in_central_projects".last_seen_month, EXCLUDED.last_seen_month)`,
    },
  })
  await sink.upsert("in_central_project_snapshots", snapshots, {
    conflict: ["project_code", "report_month"], batch: 200,
  })

  sink.finish({
    report_month: reportMonth,
    source_pdf_url: sourceUrl,
    source_pdf: pdfPath,
    parser_version: parsed.parser_version,
    stated_project_count: parsed.stated_project_count,
    extracted_count: parsed.extracted_count,
  })
}

run(main, import.meta.url)
