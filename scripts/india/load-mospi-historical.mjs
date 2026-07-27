#!/usr/bin/env node
/**
 * load-mospi-historical.mjs — backfills in_central_projects and
 * in_central_project_snapshots from the PRE-2025-26 MoSPI flash reports.
 *
 * Usage:
 *   node scripts/india/load-mospi-historical.mjs                       # dry-run, committed artifacts
 *   node scripts/india/load-mospi-historical.mjs --pdf-dir DIR --emit  # re-parse PDFs, rewrite artifacts
 *   node scripts/india/load-mospi-historical.mjs --month 2015-04       # one report
 *   node scripts/india/load-mospi-historical.mjs --apply               # writes (credential-gated)
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   (or KAUN_LOCAL_PG for local testing)
 *   --pdf-dir additionally needs python3 + pdfplumber (scripts/india/mospi/requirements.txt).
 *
 * THE ARTIFACT IS THE INPUT, THE PDFs ARE THE SOURCE
 * ---------------------------------------------------
 * The monthly loader (load-central-projects.mjs) parses a PDF on every run
 * because there is exactly one new PDF a month and it is small enough to fetch.
 * That does not work here: this is ~1.5 GB of 600-page PDFs, and PAIMANA's PDF
 * endpoint 500s from GitHub Actions runners (it serves fine from an Indian
 * residential connection — the same asymmetry that put a pdf_release input on
 * refresh-india-mospi.yml).
 *
 * So the parse is a LOCAL, OCCASIONAL step whose output is committed:
 * data/india/mospi-historical/snapshots/<YYYY-MM>.csv, one file per report. The
 * load then reads those. That makes the backfill diffable in review — a change
 * to the parser shows up as a diff on 300,000 numbers, not as a claim — and
 * makes a re-load reproducible without touching MoSPI at all.
 *
 * IDENTITY: THE OCMS CODE, AND NOTHING ELSE
 * ------------------------------------------
 * The historical annexures carry MoSPI's OCMS project code ("[N06000123]",
 * "[060100093]") and the modern Table 6 carries it as legacy_ocms_code beside
 * its own newer project_code. That is the ONLY join used here:
 *
 *   ocms_code matches an existing legacy_ocms_code  -> the same project;
 *                                                      snapshots attach to the
 *                                                      existing project_code
 *   ocms_code matches nothing                       -> its OWN identity, keyed
 *                                                      "ocms:<CODE>"
 *
 * Names are never matched, not even as a tie-break. This corpus truncates names
 * at the cell edge, re-spells them between months, and repeats them across
 * genuinely different projects — there are eleven distinct rows in April 2020
 * beginning "REHABILITATION AND UPGRADATION OF NEW NH-". A fuzzy join would
 * manufacture a 15-year cost history for a project that never existed. A project
 * that completed in 2014 and has no modern row SHOULD be its own identity: that
 * is a real project with a real overrun, and inventing a merge would be worse
 * than leaving it standalone.
 *
 * The synthetic "ocms:" prefix is deliberate and greppable. MoSPI's own
 * project_code values are bare digits, so the two can never collide, and a
 * later reviewed merge can rewrite an "ocms:" row without guessing which rows
 * were synthetic.
 *
 * OLDEST MONTH FIRST
 * ------------------
 * in_central_projects.first_seen_month / last_seen_month are merged with
 * LEAST/GREATEST by the same updateExpressions the monthly loader uses, so the
 * order does not actually matter for correctness — but the reports are loaded
 * oldest first anyway, so a partial run leaves a prefix of history rather than
 * a hole in the middle.
 *
 * WHAT IS DELIBERATELY NOT LOADED
 * -------------------------------
 * April 2001 to April 2009. Those reports have a per-project table but print no
 * OCMS code in it, so every row would land as its own identity keyed on nothing
 * stable, and the "time series" would be 200 disconnected points per year.
 *
 * That era is inventoried in data/india/mospi-historical/archive-inventory.csv,
 * refused with a stated reason in manifest.json, and documented as an open gap
 * in that directory's METHODOLOGY.md.
 *
 * (October 2020 onward once sat in this list too — the ongoing list is split by
 * schedule status there, and the union of the three annexures it APPEARS to be
 * split into runs 118 short of the report's own count. The real partition is
 * five annexures, two of which were being misread as re-cuts; see PARTITION_RES
 * in scripts/india/mospi/parse_historical_report.py. Those months now
 * reconcile and load.)
 */
import { execFileSync } from "child_process"
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "fs"
import { resolve, dirname, join, basename } from "path"
import { fileURLToPath } from "url"
import { openSink, REPO_ROOT } from "./lib/sink.mjs"
import { loadPcReference, loadAliases, aliasCandidate, normalizeStateName } from "./lib/pc-reference.mjs"
import { flag, opt, banner, run } from "./lib/cli.mjs"
import { monthCellToDate, monthsBetween, classifyState } from "./load-central-projects.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOADER = "load-mospi-historical"

const PARSER = resolve(__dirname, "mospi/parse_historical_report.py")
export const ARTIFACT_DIR = resolve(REPO_ROOT, "data/india/mospi-historical")
export const SNAPSHOT_DIR = join(ARTIFACT_DIR, "snapshots")
export const MANIFEST = join(ARTIFACT_DIR, "manifest.json")

/** Columns of a committed snapshot CSV, in order. */
export const SNAPSHOT_COLUMNS = [
  "report_month", "ocms_code", "sl_no", "project_name", "sector", "agency",
  "state_raw", "approval_month", "original_doc_month", "revised_doc_month",
  "original_cost_cr", "revised_cost_cr", "cumulative_expenditure_cr",
  "physical_progress_pct", "latest_approved_cost_cr", "approved_revised_doc_month",
  "delay_months_reported", "milestones", "annexure", "source_page",
]

/* -------------------------------------------------------------------------- */
/* pure helpers — exported for tests                                          */
/* -------------------------------------------------------------------------- */

/** "ocms:N06000123" — the identity a historical row gets when nothing matches. */
export function syntheticProjectCode(ocmsCode) {
  return `ocms:${String(ocmsCode).trim().toUpperCase()}`
}

/**
 * Cost figures that are plausibly ₹ crore for a project the flash report tracks
 * at all. The report's own floor is ₹150 crore, so a value of 1.5 is a lakh
 * reading of the same project and a value of 15,000,000 is rupees — both look
 * entirely normal in a chart and neither is crore.
 *
 * The floor is 1 rather than 150: a handful of rows carry a cost below the
 * threshold (a project descoped after approval), and refusing those would lose
 * real data to catch a unit error that shows up as thousands of rows, not one.
 */
export const COST_MIN_CR = 1
export const COST_MAX_CR = 2_000_000

export function costLooksLikeCrore(v) {
  if (v == null) return true
  return v >= 0 && (v === 0 || (v >= COST_MIN_CR && v <= COST_MAX_CR))
}

/**
 * Report-level unit check. One odd row is data; a whole report whose median
 * cost is 100x off is a units flip, and that is what this catches.
 */
export function unitSanity(rows) {
  const costs = rows.map(r => r.original_cost_cr).filter(v => typeof v === "number" && v > 0)
    .sort((a, b) => a - b)
  if (!costs.length) return { ok: false, reason: "no original cost figures at all", median: null }
  const median = costs[Math.floor(costs.length / 2)]
  const bad = rows.filter(r => !costLooksLikeCrore(r.original_cost_cr)).length
  // MoSPI tracks projects of ₹150 crore and above, so a report whose median
  // project costs less than ₹50 crore is not denominated in crore.
  if (median < 50) return { ok: false, reason: `median original cost ${median} is too small for ₹ crore`, median, bad }
  if (median > 100000) return { ok: false, reason: `median original cost ${median} is too large for ₹ crore`, median, bad }
  return { ok: true, reason: null, median, bad }
}

/** CSV serialisation shared by every artifact this loader writes. */
export function toCsv(rows, columns) {
  const cell = v => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(","), ...rows.map(r => columns.map(c => cell(r[c])).join(","))]
    .join("\n") + "\n"
}

/** Minimal RFC4180 reader — the artifacts are written by toCsv above. */
export function fromCsv(text) {
  const rows = []
  let row = [], field = "", quoted = false
  const s = text.replace(/\r\n/g, "\n")
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") { row.push(field); field = "" }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = "" }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const [head, ...body] = rows
  return body.filter(r => r.some(v => v !== ""))
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])))
}

const num = v => (v === "" || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null))
const str = v => (v === "" || v == null ? null : String(v))

/** One committed snapshot CSV row -> the shape the transform below expects. */
export function readSnapshotRow(r) {
  return {
    report_month: str(r.report_month),
    ocms_code: str(r.ocms_code),
    sl_no: num(r.sl_no),
    project_name: str(r.project_name),
    sector: str(r.sector),
    agency: str(r.agency),
    state_raw: str(r.state_raw),
    approval_month: str(r.approval_month),
    original_doc_month: str(r.original_doc_month),
    revised_doc_month: str(r.revised_doc_month),
    original_cost_cr: num(r.original_cost_cr),
    revised_cost_cr: num(r.revised_cost_cr),
    cumulative_expenditure_cr: num(r.cumulative_expenditure_cr),
    physical_progress_pct: num(r.physical_progress_pct),
    latest_approved_cost_cr: num(r.latest_approved_cost_cr),
    approved_revised_doc_month: str(r.approved_revised_doc_month),
    delay_months_reported: str(r.delay_months_reported),
    milestones: str(r.milestones),
    annexure: str(r.annexure),
    source_page: num(r.source_page),
  }
}

/**
 * A parsed report (the Python parser's JSON) -> committed-artifact rows.
 * Rows without an OCMS code are dropped here, by design: they have no identity,
 * and in every report checked they were an artefact of a wrapped project name
 * rather than a project the report actually lists.
 */
export function artifactRows(parsed) {
  const month = parsed.report_month
  const out = []
  for (const r of parsed.records ?? []) {
    if (!r.ocms_code) continue
    out.push({
      report_month: month,
      ocms_code: String(r.ocms_code).toUpperCase(),
      sl_no: r.sl_no ?? null,
      project_name: r.project_name ?? null,
      sector: r.sector ?? null,
      agency: r.agency ?? null,
      state_raw: r.state ?? null,
      approval_month: monthCellToDate(r.approval_date),
      original_doc_month: monthCellToDate(r.original_target_doc),
      revised_doc_month: monthCellToDate(r.revised_doc),
      original_cost_cr: r.original_cost_cr ?? null,
      revised_cost_cr: r.revised_cost_cr ?? null,
      cumulative_expenditure_cr: r.cumulative_expenditure_cr ?? null,
      physical_progress_pct: r.physical_progress_pct ?? null,
      latest_approved_cost_cr: r.latest_approved_cost_cr ?? null,
      approved_revised_doc_month: monthCellToDate(r.approved_revised_doc),
      delay_months_reported: r.delay_months_reported ?? null,
      milestones: r.milestones ?? null,
      annexure: r.annexure ?? null,
      source_page: r.source_page ?? null,
    })
  }
  // One row per project per report: a project listed twice in the same report is
  // a parse defect, and the last row would silently win at the database anyway.
  const seen = new Map()
  for (const row of out) seen.set(row.ocms_code, row)
  return [...seen.values()].sort((a, b) => (a.sl_no ?? 0) - (b.sl_no ?? 0))
}

/**
 * The gate. A report is loadable only when the parse is provably complete.
 *
 * Two independent checks, both from the document itself:
 *   - the report's OWN stated ongoing-project count, when it states one in
 *     English (several years state it only in Hindi), and
 *   - the serial-number run, which must be a contiguous 1..N — the annexure
 *     numbers its own rows, so a gap is a page the parser failed to read.
 * Plus the unit check, because a 100x error passes both of the above.
 */
/**
 * How far the report's own stated count may sit from the extracted one before
 * the report is refused.
 *
 * Not zero. MoSPI's summary pages disagree with MoSPI's own annexure: October
 * 2014 opens with "the status of the 748 Central Sector Infrastructure
 * Projects", while its summary table says "No of Projects in Current Month 747"
 * and its annexure numbers exactly 747 rows. That is an inconsistency inside the
 * document, not a parse defect, and refusing the report would lose a real month
 * over MoSPI's typo.
 *
 * A wider gap means something else: it means the wrong annexure is being read —
 * a partition table rather than the ongoing list — and that must stay fatal.
 * The narrow band is what separates the two, and the serial-number run (which
 * has to be a contiguous 1..N with no duplicates) is what makes the band safe.
 */
export function statedCountTolerance(stated) {
  return Math.max(1, Math.round(stated * 0.005))
}

export function gateReport(parsed, rows) {
  const fatal = []
  const soft = []
  if (!parsed.report_month) fatal.push("could not read the report's own month")
  if (!/^\d{4}-\d{2}-01$/.test(parsed.report_month ?? "")) {
    fatal.push(`report month ${parsed.report_month} is not the first of a month`)
  }
  if (parsed.era === "unknown") fatal.push("no ongoing-project annexure was identified")
  // A FORWARD gap in the annexure's own numbering means rows it counted were not
  // extracted, and nothing says which. A BACKWARD step is MoSPI renumbering its
  // own tail (April 2018 numbers 1..1330 and then prints two more as 1231, 1232)
  // and loses nothing — it is recorded, not refused.
  // Only meaningful once an annexure was found at all — otherwise the "no
  // annexure" failure above already says everything there is to say.
  if (parsed.extracted_count > 0 && !parsed.serials_start_at_one) {
    fatal.push("the annexure's row numbering does not start at 1 — a leading page was missed")
  }
  if (parsed.extracted_count === 0) fatal.push("no rows were extracted")
  if (parsed.serial_forward_gap > 0) {
    fatal.push(`the annexure's own numbering skips ${parsed.serial_forward_gap} row(s) ` +
      `that were not extracted (${parsed.extracted_count} row(s) extracted)`)
  }
  if (parsed.serial_backward_steps > 0) {
    soft.push(`the annexure's numbering steps backwards ${parsed.serial_backward_steps} ` +
      `time(s) — MoSPI renumbering, no rows lost`)
  }
  if (parsed.stated_project_count != null) {
    const drift = Math.abs(parsed.stated_project_count - parsed.distinct_ocms_codes)
    const allowed = statedCountTolerance(parsed.stated_project_count)
    const msg = `the report states ${parsed.stated_project_count} ongoing projects but ` +
      `${parsed.distinct_ocms_codes} distinct OCMS code(s) were extracted`
    if (drift > allowed) fatal.push(msg)
    else if (drift) soft.push(`${msg} (within the ±${allowed} tolerance)`)
  }
  if (parsed.duplicate_ocms_codes?.length) {
    fatal.push(`${parsed.duplicate_ocms_codes.length} duplicate OCMS code(s)`)
  }
  const units = unitSanity(rows)
  if (!units.ok) fatal.push(`unit check: ${units.reason}`)
  return { fatal, soft, units }
}

/* -------------------------------------------------------------------------- */
/* parse (python) — only when --pdf-dir is given                              */
/* -------------------------------------------------------------------------- */

function parsePdf(pdfPath) {
  const out = join(process.env.TMPDIR ?? "/tmp", `mospi-hist-${process.pid}-${Date.now()}.json`)
  try {
    execFileSync("python3", [PARSER, pdfPath, "--out", out],
      { stdio: ["ignore", "ignore", "inherit"], maxBuffer: 256 * 1024 * 1024 })
  } catch (e) {
    throw new Error(`parser failed on ${basename(pdfPath)} (is pdfplumber installed? ` +
      `pip install -r scripts/india/mospi/requirements.txt): ${e.message}`)
  }
  try {
    return JSON.parse(readFileSync(out, "utf8"))
  } finally {
    // A full backfill run is ~50 reports of ~20 MB of intermediate JSON each.
    rmSync(out, { force: true })
  }
}

function emitArtifacts(sink, pdfDir, wantMonth) {
  const pdfs = readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith(".pdf")).sort()
  sink.note(`parsing ${pdfs.length} PDF(s) from ${pdfDir}`)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const manifest = []
  for (const f of pdfs) {
    const parsed = parsePdf(join(pdfDir, f))
    const month = parsed.report_month?.slice(0, 7) ?? null
    if (wantMonth && month !== wantMonth) continue
    const rows = artifactRows(parsed)
    const { fatal, soft, units } = gateReport(parsed, rows)
    const entry = {
      report_month: month,
      source_pdf: f,
      era: parsed.era,
      parser_version: parsed.parser_version,
      stated_project_count: parsed.stated_project_count,
      extracted_count: parsed.extracted_count,
      distinct_ocms_codes: parsed.distinct_ocms_codes,
      rows_written: fatal.length ? 0 : rows.length,
      serial_forward_gap: parsed.serial_forward_gap,
      serial_backward_steps: parsed.serial_backward_steps,
      median_original_cost_cr: units.median,
      pages_used: parsed.pages_used,
      total_pages: parsed.total_pages,
      gate: fatal.length ? "refused" : "ok",
      gate_failures: fatal,
      gate_notes: soft,
      warnings: parsed.warnings ?? [],
    }
    manifest.push(entry)
    if (fatal.length) {
      sink.warn(`${f}: refused — ${fatal.join("; ")}`)
      continue
    }
    for (const s of soft) sink.warn(`${month}: ${s}`)
    writeFileSync(join(SNAPSHOT_DIR, `${month}.csv`), toCsv(rows, SNAPSHOT_COLUMNS))
    sink.note(`${month}: ${rows.length} row(s) (${parsed.era}, ${f})`)
  }
  manifest.sort((a, b) => String(a.report_month).localeCompare(String(b.report_month)))
  writeFileSync(MANIFEST, JSON.stringify({
    generated_by: LOADER,
    parser: "scripts/india/mospi/parse_historical_report.py",
    source: "MoSPI flash reports, PAIMANA archive (paimana-proj.mospi.gov.in)",
    reports: manifest,
  }, null, 2) + "\n")
  sink.note(`wrote ${MANIFEST}`)
  return manifest
}

/* -------------------------------------------------------------------------- */

function readCommittedSnapshots(sink, wantMonth) {
  if (!existsSync(SNAPSHOT_DIR)) {
    throw new Error(`${SNAPSHOT_DIR} does not exist — run with --pdf-dir DIR --emit first`)
  }
  const files = readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith(".csv")).sort()
  const rows = []
  for (const f of files) {
    const month = f.replace(/\.csv$/, "")
    if (wantMonth && month !== wantMonth) continue
    const parsed = fromCsv(readFileSync(join(SNAPSHOT_DIR, f), "utf8")).map(readSnapshotRow)
    const units = unitSanity(parsed)
    if (!units.ok) {
      sink.warn(`${f}: unit check failed (${units.reason}) — report skipped`)
      continue
    }
    rows.push(...parsed)
  }
  sink.note(`read ${rows.length} snapshot row(s) from ${files.length} committed report(s)`)
  return rows
}

async function main() {
  const pdfDir = opt("pdf-dir")
  const emit = flag("emit")
  const wantMonth = opt("month")
  const apply = banner(LOADER, {
    input: pdfDir ? `${pdfDir} (re-parse)` : SNAPSHOT_DIR,
    month: wantMonth ?? "all",
    emit: emit ? "yes — artifacts will be rewritten" : "no",
  })
  const sink = openSink({ loader: LOADER, apply })

  /* ---- 1. artifacts ----------------------------------------------------- */
  if (pdfDir) {
    if (!emit) {
      sink.warn("--pdf-dir without --emit parses and gates only; nothing is written to data/")
    }
    const manifest = emitArtifacts(sink, pdfDir, wantMonth)
    sink.count("reports parsed", manifest.length)
    sink.count("reports passing the gate", manifest.filter(m => m.gate === "ok").length)
    sink.count("reports refused", manifest.filter(m => m.gate !== "ok").length)
    if (!emit) {
      sink.finish({ mode: "parse-only" })
      return
    }
  }
  const rows = readCommittedSnapshots(sink, wantMonth)
  if (!rows.length) {
    sink.warn("no snapshot rows to load")
    sink.finish({ gate: "nothing to load" })
    return
  }

  /* ---- 2. identity ------------------------------------------------------ */
  // Read-only, allowed in every mode. Without credentials this comes back empty
  // and every historical project is reported as a NEW identity — which is the
  // honest answer, not a failure: the match cannot be known without the table.
  const existing = await sink.select("in_central_projects",
    { columns: "project_code,legacy_ocms_code" })
  const byOcms = new Map()
  for (const p of existing) {
    if (p.legacy_ocms_code) byOcms.set(String(p.legacy_ocms_code).toUpperCase(), p.project_code)
  }
  sink.count("existing projects with a legacy OCMS code", byOcms.size)
  if (!byOcms.size) {
    sink.warn("no existing in_central_projects rows were readable — every historical " +
      "project will be reported as a new identity. Re-run with credentials to see " +
      "the real matched/new split before --apply.")
  }

  /* ---- 3. transform ----------------------------------------------------- */
  const reference = await loadPcReference(sink)
  const aliases = await loadAliases(sink, ["mospi"])
  const statesByNorm = new Map()
  for (const r of reference?.rows ?? []) {
    const k = normalizeStateName(r.state_name)
    if (!statesByNorm.has(k)) statesByNorm.set(k, r.st_code)
  }
  for (const [key, pcCodeValue] of aliases) {
    const label = key.slice("mospi:".length)
    const row = reference?.byCode.get(pcCodeValue)
    if (row) statesByNorm.set(normalizeStateName(label), row.st_code)
  }

  const projects = new Map()          // project_code -> row
  const snapshots = []
  const stateCandidates = new Map()
  let matched = 0, minted = 0, unitRejected = 0

  for (const r of rows) {
    if (!r.ocms_code || !r.report_month) continue
    if (!costLooksLikeCrore(r.original_cost_cr) || !costLooksLikeCrore(r.revised_cost_cr)) {
      unitRejected++
      continue
    }
    const known = byOcms.get(r.ocms_code)
    const projectCode = known ?? syntheticProjectCode(r.ocms_code)
    const st = classifyState(r.state_raw, statesByNorm)
    if (st.unresolved && r.state_raw) {
      stateCandidates.set(r.state_raw, (stateCandidates.get(r.state_raw) ?? 0) + 1)
    }

    const prev = projects.get(projectCode)
    if (!prev) {
      if (known) matched++; else minted++
    }
    // Latest report wins for the descriptive fields; the sighting window widens.
    if (!prev || r.report_month >= prev.last_seen_month) {
      projects.set(projectCode, {
        project_code: projectCode,
        legacy_ocms_code: r.ocms_code,
        project_name: r.project_name ?? "(unnamed)",
        sector: r.sector ?? null,
        agency: r.agency ?? null,
        state_raw: r.state_raw ?? null,
        st_code: st.st_code,
        is_multi_state: st.is_multi_state,
        first_seen_month: prev ? min(prev.first_seen_month, r.report_month) : r.report_month,
        last_seen_month: prev ? max(prev.last_seen_month, r.report_month) : r.report_month,
        // A historical row says nothing about whether the project is ongoing
        // TODAY. A project this backfill invents is flagged FALSE — the last
        // time MoSPI listed it was years ago — and is_ongoing is kept OUT of
        // updateColumns below, so a live project's flag is never touched.
        is_ongoing: known ? true : false,
        data_source: "MoSPI Flash Report historical annexure (PAIMANA archive)",
        updated_at: new Date().toISOString(),
      })
    } else {
      prev.first_seen_month = min(prev.first_seen_month, r.report_month)
      prev.last_seen_month = max(prev.last_seen_month, r.report_month)
    }

    snapshots.push({
      project_code: projectCode,
      report_month: r.report_month,
      sl_no: r.sl_no,
      approval_month: r.approval_month,
      start_month: null,                       // not carried by these annexures
      original_doc_month: r.original_doc_month,
      revised_doc_month: r.revised_doc_month,
      original_cost_cr: r.original_cost_cr,
      revised_cost_cr: r.revised_cost_cr,
      cumulative_expenditure_cr: r.cumulative_expenditure_cr,
      physical_progress_pct: r.physical_progress_pct,
      schedule_slip_months: monthsBetween(r.original_doc_month, r.revised_doc_month),
      // Everything the schema has no column for survives verbatim, exactly as
      // the monthly loader does it — including the revised APPROVED cost and
      // date, which are a different quantity from the anticipated ones.
      raw: dropNulls({
        ocms_code: r.ocms_code,
        annexure: r.annexure,
        sector: r.sector,
        latest_approved_cost_cr: r.latest_approved_cost_cr,
        approved_revised_doc_month: r.approved_revised_doc_month,
        delay_months_reported: r.delay_months_reported,
        milestones: r.milestones,
      }),
      source_page: r.source_page,
      source_pdf_url: null,      // the mirrored release, not a live PAIMANA URL
      parser_version: "flash-report-historical/v1",
      ingested_at: new Date().toISOString(),
    })
  }

  const projectRows = [...projects.values()]

  const months = [...new Set(snapshots.map(s => s.report_month))].sort()
  sink.count("report months", months.length)
  sink.count("snapshot rows", snapshots.length)
  sink.count("distinct projects", projectRows.length)
  sink.count("matched to an existing project_code", matched)
  sink.count("new identities minted (ocms:*)", minted)
  sink.count("rows rejected by the per-row unit check", unitRejected)
  sink.count("resolved to a state", projectRows.filter(p => p.st_code != null).length)
  sink.count("multi-state", projectRows.filter(p => p.is_multi_state).length)
  sink.count("with a revised schedule", snapshots.filter(s => s.revised_doc_month).length)
  sink.count("with a schedule slip > 0",
    snapshots.filter(s => (s.schedule_slip_months ?? 0) > 0).length)
  sink.count("with a cost revision", snapshots.filter(s =>
    s.revised_cost_cr != null && s.original_cost_cr != null &&
    s.revised_cost_cr !== s.original_cost_cr).length)
  if (months.length) sink.note(`report months: ${months[0]} … ${months[months.length - 1]}`)

  if (stateCandidates.size) {
    sink.review("state-alias-candidates", [...stateCandidates].map(([label, n]) =>
      aliasCandidate({ source: "mospi", sourceKey: label, sourceLabel: label,
        stateName: label, reason: "no_exact_state_match", extra: { projects: n } })))
    sink.warn(`${stateCandidates.size} MoSPI state label(s) did not match a known state — ` +
      `st_code left NULL and reported for review`)
  }

  /* ---- 4. write --------------------------------------------------------- */
  await sink.upsert("in_central_projects", projectRows, {
    conflict: ["project_code"], batch: 200,
    updateColumns: [
      // A backfill must not overwrite what the LIVE monthly loader knows. It may
      // widen the sighting window and fill in a legacy code; it may not rename a
      // project, re-point its state, or touch is_ongoing on a row that already
      // exists.
      "legacy_ocms_code", "first_seen_month", "last_seen_month", "updated_at",
    ],
    updateExpressions: {
      first_seen_month: `LEAST("in_central_projects".first_seen_month, EXCLUDED.first_seen_month)`,
      last_seen_month: `GREATEST("in_central_projects".last_seen_month, EXCLUDED.last_seen_month)`,
      legacy_ocms_code: `COALESCE("in_central_projects".legacy_ocms_code, EXCLUDED.legacy_ocms_code)`,
    },
  })
  await sink.upsert("in_central_project_snapshots", snapshots, {
    conflict: ["project_code", "report_month"], batch: 200,
  })

  sink.finish({
    report_months: months,
    matched_to_existing: matched,
    new_identities: minted,
    parser_version: "flash-report-historical/v1",
  })
}

function min(a, b) { return a < b ? a : b }
function max(a, b) { return a > b ? a : b }
function dropNulls(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""))
}

run(main, import.meta.url)
