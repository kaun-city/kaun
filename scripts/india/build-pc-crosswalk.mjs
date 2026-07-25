/**
 * build-pc-crosswalk.mjs — Canonical Kaun India PC Crosswalk builder.
 * Pure file artifact: no Supabase, no network at run time, no database access.
 *
 * THE PUBLIC GOOD
 * ---------------
 * There is no open, machine-readable table of which Assembly Constituencies
 * (and districts) make up each of India's 543 Lok Sabha constituencies. The
 * legal answer exists — it is Table B of the Election Commission's
 * *Delimitation of Parliamentary and Assembly Constituencies Order, 2008* — but
 * only as a 571-page two-column PDF. Every open geodata copy that claims to
 * carry the mapping is wrong: DataMeet's AC shapefile ships a `PC_NO` attribute
 * that puts up to 60 ACs in a single PC. Kaun parses the Order itself, verifies
 * it against independent geometry, and publishes the result: deterministic,
 * sourced, versioned, correctable.
 *
 * METHOD
 *   1. PRIMARY (authoritative, textual). Parse Table B of the 2008 Order per
 *      state → the exact numbered list of ACs composing every PC, plus each
 *      PC's SC/ST reservation. Parse Table A's "<n> – DISTRICT : X" headings →
 *      AC↔district, composed up to PC↔district. For the two states re-delimited
 *      since — Assam (2023) and J&K (2022) — the newer order replaces the 2008
 *      composition wholesale, from the transcriptions in data/pc-crosswalk/sources.
 *   2. VERIFICATION (independent, spatial). Locate each AC polygon's interior
 *      point (DataMeet AC shapefile) and test whether it falls inside the PC
 *      polygon the Order assigns it to. Agreement rate is reported per PC and
 *      nationally; disagreements are kept and explained, never dropped.
 *   3. DISTRICT SHARES (informational). Sample each PC's interior and classify
 *      by 2011 Census district polygon → a full share vector, same shape as the
 *      Bengaluru ward crosswalk's `shares`.
 *
 * KNOWN TRAPS HANDLED (see METHODOLOGY.md)
 *   - The AC shapefile's embedded PC_NO/PC_NAME is unusable. Never read.
 *   - SC/ST status in every geo/roster source is wrong. Derived from the Order.
 *   - Assam (2023) and J&K (2022) were re-delimited after 2008. Both orders are
 *     applied here; each transcription must reproduce its own gazette's seat and
 *     reservation tallies before it is allowed to override anything. Ladakh has
 *     no Assembly and stays on the 2008 (district-level) basis.
 *   - Andhra Pradesh's 2008 schedule covers today's Telangana + Andhra Pradesh.
 *     The 2014 reorganisation renumbered both; the offsets are verified here,
 *     not assumed.
 *
 * OUTPUT (committed — this is the deliverable)
 *   data/pc-crosswalk/india_pc_crosswalk.csv|.json
 *   data/pc-crosswalk/pc_ac_pairs.csv|.json
 *   data/pc-crosswalk/METHODOLOGY.md
 *   wiki/docs/india/pc-crosswalk/*.{csv,json}   ← public download copies,
 *   written by this builder in the same run so they can never drift.
 *
 * INPUTS (raw sources are NOT committed — 100+ MB of shapefiles and a 1.3 MB
 * government PDF; provenance and URLs are recorded in METHODOLOGY.md).
 * Point the builder at a local copy of the recon bundle:
 *   PC_CROSSWALK_SRC=/path/to/india-recon/geo-roster node scripts/india/build-pc-crosswalk.mjs
 * Default search path: ../india-recon/geo-roster and ../../india-recon/geo-roster
 * relative to the repo root (works from a checkout and from a git worktree).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import {
  groupLinesByY, rowText, inferColumnSplit, splitRow, joinWrapped,
  parsePcHeading, parseDistrictHeading, parseAcRefs, isWholeStateExtent,
  cleanName, titleCase, normKey,
} from "../lib/delimitation.mjs"

// Basis of the published composition: the 2008 Order, overridden for Assam by
// the 2023 order and for J&K by the 2022 order. Bump on any curated correction.
const CROSSWALK_VERSION = "2008do+2023as+2022jk-2026.07"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")
const DATA = resolve(ROOT, "data/pc-crosswalk")
const WIKI_PUB = resolve(ROOT, "wiki/docs/india/pc-crosswalk")

const SRC = (() => {
  const cands = [
    process.env.PC_CROSSWALK_SRC,
    resolve(ROOT, "../india-recon/geo-roster"),
    resolve(ROOT, "../../india-recon/geo-roster"),
  ].filter(Boolean)
  for (const c of cands) if (existsSync(resolve(c, "delimitation-order"))) return c
  throw new Error(
    "Source bundle not found. Set PC_CROSSWALK_SRC to the india-recon/geo-roster directory.\n" +
    "Tried:\n  " + cands.join("\n  "))
})()

// Committed source transcriptions (see data/pc-crosswalk/sources/README.md).
// These two orders are scanned gazettes with no text layer, so their Table B
// was transcribed by hand — the builder cannot regenerate them, which is why
// they live in the repo rather than in the external source bundle.
const SOURCES = resolve(ROOT, "data/pc-crosswalk/sources")

const F = {
  pdf: resolve(SRC, "delimitation-order/eci_delimitation_order_2008_archiveorg.pdf"),
  assamCsv: resolve(SOURCES, "assam_pc_ac.csv"),
  jkCsv: resolve(SOURCES, "jk_pc_ac.csv"),
  spine: resolve(SRC, "pc-boundaries/shijithpk_india_ls_seats_543.geojson"),
  datameetPc: resolve(SRC, "pc-boundaries/datameet_india_pc_2019_simplified.geojson"),
  acShp: resolve(SRC, "ac-boundaries/datameet_India_AC.shp"),
  acDbf: resolve(SRC, "ac-boundaries/datameet_India_AC.dbf"),
  distShp: resolve(SRC, "district-boundaries/datameet_2011_Dist.shp"),
  distDbf: resolve(SRC, "district-boundaries/datameet_2011_Dist.dbf"),
}

// ───────────────────────────── reference tables ─────────────────────────────

/** Schedule heading (as printed in the Order) → current state/UT of the spine. */
const ORDER_STATE_TO_SPINE = {
  "ANDHRA PRADESH": "__AP_SPLIT__",          // 2014 reorganisation, see below
  "ARUNACHAL PRADESH": "Arunachal Pradesh",
  "ASSAM": "Assam",
  "BIHAR": "Bihar",
  "CHHATTISGARH": "Chhattisgarh",
  "GOA": "Goa",
  "GUJARAT": "Gujarat",
  "HARYANA": "Haryana",
  "HIMACHAL PRADESH": "Himachal Pradesh",
  "JAMMU AND KASHMIR": "__JK_SPLIT__",       // Ladakh hived off in 2019
  "JHARKHAND": "Jharkhand",
  "KARNATAKA": "Karnataka",
  "KERALA": "Kerala",
  "MADHYA PRADESH": "Madhya Pradesh",
  "MAHARASHTRA": "Maharashtra",
  "MANIPUR": "Manipur",
  "MEGHALAYA": "Meghalaya",
  "MIZORAM": "Mizoram",
  "NAGALAND": "Nagaland",
  "ORISSA": "Odisha",
  "PUNJAB": "Punjab",
  "RAJASTHAN": "Rajasthan",
  "SIKKIM": "Sikkim",
  "TAMIL NADU": "Tamil Nadu",
  "TRIPURA": "Tripura",
  "UTTAR PRADESH": "Uttar Pradesh",
  "UTTARAKHAND": "Uttarakhand",
  "UTTARANCHAL": "Uttarakhand",
  "WEST BENGAL": "West Bengal",
  "NCT OF DELHI": "Delhi",
  "DELHI": "Delhi",
  "PUDUCHERRY": "Puducherry",
  "PONDICHERRY": "Puducherry",
}

/**
 * Seat allocation fixed by the same Order (Schedule I for Lok Sabha, Schedule II
 * for the Legislative Assemblies). Held here as an ASSERTION on the parse: if a
 * state's Table B does not yield exactly this many PCs, the run says so loudly
 * instead of silently publishing a short table.
 */
const EXPECTED_PC_COUNT = {
  "ANDHRA PRADESH": 42, "ARUNACHAL PRADESH": 2, "ASSAM": 14, "BIHAR": 40,
  "CHHATTISGARH": 11, "GOA": 2, "GUJARAT": 26, "HARYANA": 10, "HIMACHAL PRADESH": 4,
  "JAMMU AND KASHMIR": 6, "JHARKHAND": 14, "KARNATAKA": 28, "KERALA": 20,
  "MADHYA PRADESH": 29, "MAHARASHTRA": 48, "MANIPUR": 2, "MEGHALAYA": 2,
  "MIZORAM": 1, "NAGALAND": 1, "ORISSA": 21, "PUNJAB": 13, "RAJASTHAN": 25,
  "SIKKIM": 1, "TAMIL NADU": 39, "TRIPURA": 2, "UTTAR PRADESH": 80,
  "UTTARAKHAND": 5, "WEST BENGAL": 42, "NCT OF DELHI": 7, "PUDUCHERRY": 1,
}
const EXPECTED_AC_COUNT = {
  "ANDHRA PRADESH": 294, "ARUNACHAL PRADESH": 60, "ASSAM": 126, "BIHAR": 243,
  "CHHATTISGARH": 90, "GOA": 40, "GUJARAT": 182, "HARYANA": 90, "HIMACHAL PRADESH": 68,
  "JHARKHAND": 81, "KARNATAKA": 224, "KERALA": 140, "MADHYA PRADESH": 230,
  "MAHARASHTRA": 288, "MANIPUR": 60, "MEGHALAYA": 60, "MIZORAM": 40, "NAGALAND": 60,
  // Sikkim's Assembly has 32 seats but only 31 are territorial — the Sangha
  // seat is elected by the monasteries state-wide and has no Table A extent.
  "ORISSA": 147, "PUNJAB": 117, "RAJASTHAN": 200, "SIKKIM": 31, "TAMIL NADU": 234,
  "TRIPURA": 60, "UTTAR PRADESH": 403, "UTTARAKHAND": 70, "WEST BENGAL": 294,
  "NCT OF DELHI": 70, "PUDUCHERRY": 30,
  // Jammu & Kashmir's ACs are in the Order's Annexure, not its Schedule.
}

/**
 * Andhra Pradesh Reorganisation Act, 2014. The 2008 schedule numbers Telangana
 * first (PCs 1–17, ACs 1–119) and residuary Andhra Pradesh after (PCs 18–42,
 * ACs 120–294). Both were renumbered from 1 on 2 June 2014. The offsets below
 * are ASSERTED against the parsed data at run time, not taken on trust.
 */
const AP_SPLIT = [
  { spine: "Telangana", pcFrom: 1, pcTo: 17, pcOffset: 0, acFrom: 1, acTo: 119, acOffset: 0 },
  { spine: "Andhra Pradesh", pcFrom: 18, pcTo: 42, pcOffset: -17, acFrom: 120, acTo: 294, acOffset: -119 },
]

/** 2008 J&K schedule (6 PCs, described by district) → today's two UTs. */
const JK_SPLIT = { "Ladakh": "Ladakh" }   // every other J&K PC stays in J&K

/**
 * PC name aliases: 2008 Order spelling → current ECI spelling. Only needed
 * where the seat kept its identity but changed name/transliteration. Assam's
 * 2023 renames are mostly carried by the spine itself ("Kaziranga (ex Kaliabor)").
 */
const PC_NAME_ALIASES = {
  "nawgong": "nagaon",
  "nowgong": "nagaon",
  "gauhati": "guwahati",
  "autonomousdistrict": "diphu",
  "kaliabor": "kaziranga",
  "mangaldoi": "darrangudalguri",
  "tezpur": "sonitpur",
  "anantnag": "anantnagrajouri",
}

/**
 * Curated errata in the Order's own printed text. Each entry must cite why the
 * correction is certain — normally Table A of the same Order, which is the
 * cross-check. Applied to parsed AC references and reported on every run.
 */
const TEXT_ERRATA = [
  {
    state: "JHARKHAND", pc_no: 9, from: 41, to: 44, name: "Baharagora",
    why: "Table B prints '41-Bahragora' for Jamshedpur. Table A of the same Order lists 44 Baharagora; AC 41 is Jharia, already a segment of PC 7 Dhanbad. Misprinted number.",
  },
  {
    state: "MANIPUR", pc_no: 2, from: 4, to: 41, name: "Chandel",
    why: "Table B prints '4i~Chandel' for Outer Manipur — a glyph artefact for 41. Table A lists 41 Chandel; AC 4 is Khetrigao, already a segment of PC 1 Inner Manipur.",
  },
]

/**
 * Key contract (shared with the india-schema work): the canonical constituency
 * key is `pc_code = <st_code>-<pc_no>`, because `pc_no` restarts at 1 in every
 * state/UT. `st_code` is the state code the DataMeet geo files carry, so both
 * sides derive the key from the same published file. Two of those codes are not
 * strict Census-2011 values because the states did not exist in 2011 — DataMeet
 * uses 36 for Telangana and 37 for Andhra Pradesh — and Ladakh is absent from
 * DataMeet entirely, so it is assigned here. Both facts are documented rather
 * than silently normalised. `ac_code = <st_code>-<ac_no>` follows the same rule.
 */
const ST_CODE_FALLBACK = { "Ladakh": 38 }

/** UTs with no Legislative Assembly: their single PC has no constituent ACs. */
const NO_ASSEMBLY_STATES = new Set([
  "Andaman & Nicobar", "Chandigarh", "Lakshadweep",
  "Dadra and Nagar Haveli and Daman and Diu",
])

const DELIMITATION_NOTES = {
  "Assam": "assam-2023-applied: composition is the Assam Delimitation Order 2023 (ECI Notification 282/AS/2023, gazetted 11 Aug 2023), which supersedes the 2008 Order for this state",
  "Jammu & Kashmir": "jk-2022-applied: composition is the J&K Delimitation Commission order (Notification 282/J&K/2022 Vol. IV, gazetted 5 May 2022), which supersedes the 2008 Order for this UT",
  "Ladakh": "ladakh-2019: hived off J&K by the J&K Reorganisation Act 2019 and has no Legislative Assembly; the 2008 Order lists it as PC 4 of J&K, described by district",
}

/**
 * Orders that supersede the 2008 Order for a state/UT. Each ships as a
 * hand-transcribed Table B (the gazettes are scans with no text layer) and each
 * is asserted against the order's own recitals before it is allowed to override
 * the 2008 composition — see data/pc-crosswalk/sources/README.md.
 */
const CURRENT_ORDERS = [
  {
    spineState: "Assam", file: "assamCsv",
    order: "Assam Delimitation Order, 2023",
    citation: "ECI Notification No. 282/AS/2023, Gazette of India Extraordinary Part II s.3(iii), 11 August 2023",
    basis: "2023-assam-delimitation-order-table-b",
    expectPc: 14, expectAc: 126,
    expectPcReserved: { SC: 1, ST: 2 },      // Assam's 14 LS seats
    expectAcReserved: { SC: 9, ST: 19 },     // Assam's 126 Assembly seats
  },
  {
    spineState: "Jammu & Kashmir", file: "jkCsv",
    order: "Jammu and Kashmir Delimitation Order, 2022",
    citation: "Delimitation Commission Notification No. 282/J&K/2022 (Vol. IV), J&K Gazette Vol. 135 No. 5-2, 5 May 2022",
    basis: "2022-jk-delimitation-order-table-b",
    expectPc: 5, expectAc: 90,
    expectPcReserved: { SC: 0, ST: 0 },      // J&K's 5 LS seats are unreserved
    expectAcReserved: { SC: 7, ST: 9 },      // J&K's 90 Assembly seats
  },
]

// ────────────────────────────── tiny geo toolkit ─────────────────────────────
// Self-contained ray-casting PIP, same approach as scripts/wardmap/build-crosswalk.mjs
// (validated on the BBMP↔GBA ward crosswalk). No projection needed: every source
// here is WGS84 geographic.

function ringContains(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
const polyContains = (poly, x, y) =>
  ringContains(poly[0], x, y) && !poly.slice(1).some(h => ringContains(h, x, y))
function geomContains(g, x, y) {
  if (!g) return false
  if (g.type === "Polygon") return polyContains(g.coordinates, x, y)
  return g.coordinates.some(p => polyContains(p, x, y))
}
function geomBbox(g) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates
  for (const p of polys) for (const ring of p) for (const [x, y] of ring) {
    if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y
  }
  return [a, b, c, d]
}
const ringArea = ring => {
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    s += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1])
  return Math.abs(s / 2)
}
/** A point guaranteed to be inside the geometry (centroid, else grid search). */
function interiorPoint(g) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates
  let best = null, bestA = -1
  for (const p of polys) { const a = ringArea(p[0]); if (a > bestA) { bestA = a; best = p } }
  if (!best) return null
  let cx = 0, cy = 0, n = 0
  for (const [x, y] of best[0]) { cx += x; cy += y; n++ }
  const c = [cx / n, cy / n]
  if (geomContains(g, c[0], c[1])) return c
  const [mnX, mnY, mxX, mxY] = geomBbox(g)
  for (const steps of [12, 40]) {
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
      const x = mnX + ((i + 0.5) / (steps + 1)) * (mxX - mnX)
      const y = mnY + ((j + 0.5) / (steps + 1)) * (mxY - mnY)
      if (geomContains(g, x, y)) return [x, y]
    }
  }
  return null
}
/** Uniform bbox grid index over {geom,bbox} records — keeps PIP lookups cheap. */
function makeIndex(recs, cells = 64) {
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity
  for (const r of recs) {
    if (r.bbox[0] < mnX) mnX = r.bbox[0]; if (r.bbox[1] < mnY) mnY = r.bbox[1]
    if (r.bbox[2] > mxX) mxX = r.bbox[2]; if (r.bbox[3] > mxY) mxY = r.bbox[3]
  }
  const dx = (mxX - mnX) / cells || 1, dy = (mxY - mnY) / cells || 1
  const grid = new Map()
  const key = (i, j) => i * 4096 + j
  const cell = (x, y) => [
    Math.min(cells, Math.max(0, Math.floor((x - mnX) / dx))),
    Math.min(cells, Math.max(0, Math.floor((y - mnY) / dy))),
  ]
  for (const r of recs) {
    const [i0, j0] = cell(r.bbox[0], r.bbox[1]), [i1, j1] = cell(r.bbox[2], r.bbox[3])
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j)
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push(r)
    }
  }
  return (x, y) => {
    const [i, j] = cell(x, y)
    const bucket = grid.get(key(i, j))
    if (!bucket) return null
    for (const r of bucket) {
      if (x < r.bbox[0] || x > r.bbox[2] || y < r.bbox[1] || y > r.bbox[3]) continue
      if (geomContains(r.geom, x, y)) return r
    }
    return null
  }
}

// ─────────────────────────────── PDF extraction ──────────────────────────────

async function extractPdfPages(path) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    useSystemFonts: false, isEvalSupported: false, verbosity: 0,
  }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    pages.push({
      page: p,
      items: tc.items.filter(i => i.str && i.str.trim()).map(i => ({
        s: i.str, x: +i.transform[4].toFixed(1), y: +i.transform[5].toFixed(1),
      })),
    })
  }
  return pages
}

// ─────────────────────── Delimitation Order → structure ──────────────────────

const RE_SCHEDULE = /^SCHEDULE\s*[–—-]?\s*([IVXL]+)$/i
const RE_ANNEXURE = /^ANNEXURE\b/i
const RE_TABLE_A = /^TABLE\s*[–—-]?\s*A\b/i
const RE_TABLE_B = /^(?:TABLE|PART)\s*[–—-]?\s*B\b/i
const RE_PC_TABLE_HEAD = /^PARLIAMENTARY\s+CONSTITUENCIES(\s*&\s*THEIR\s+EXTENT)?$/i
// The trailing legal note ends a table. It is printed variously as "Note.—",
// "N OTE :" (with a stray space from the small-caps rendering) and, when the
// heading itself is lost, simply "Any reference in Table-A to …".
const RE_NOTE = /^(N\s*OTE|Note|Abbreviations|Any\s+reference)\b/i

const isNoise = t =>
  !t ||
  /^\d{1,3}$/.test(t) ||                                  // printed page number
  /^(Sl\.?\s*No|Serial\s*no)/i.test(t) ||
  /^Extent\b/i.test(t) ||
  RE_TABLE_A.test(t) || RE_TABLE_B.test(t) || RE_PC_TABLE_HEAD.test(t) ||
  RE_SCHEDULE.test(t) || RE_ANNEXURE.test(t) ||
  /^ASSEMBLY\s+CONSTITUENCIES/i.test(t)

/**
 * Flatten the whole document into rows carrying their per-page column split,
 * then cut it into Schedules (one per state/UT). The Annexure that follows the
 * last Schedule is excluded — it is J&K's 1995 assembly list, not a Table B.
 */
function documentRows(pages) {
  const out = []
  for (const pg of pages) {
    const rows = groupLinesByY(pg.items)
    const splitX = inferColumnSplit(rows)
    for (const r of rows) {
      const whole = rowText(r)
      const { left, right } = splitX == null ? { left: "", right: whole } : splitRow(r, splitX)
      out.push({ page: pg.page, whole, left, right })
    }
  }
  return out
}

function segmentSchedules(rows) {
  const starts = []
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].whole.match(RE_SCHEDULE)
    if (m) {
      const name = (rows[i + 1]?.whole || "").toUpperCase()
        .replace(/\s+/g, " ").replace(/[^A-Z& ]/g, "").trim()
      starts.push({ i, roman: m[1].toUpperCase(), name })
    } else if (RE_ANNEXURE.test(rows[i].whole) && starts.length > 3) {
      starts.push({ i, roman: "ANNEXURE", name: "__END__" })
    }
  }
  const out = []
  for (let k = 0; k < starts.length; k++) {
    if (starts[k].name === "__END__") continue
    out.push({
      roman: starts[k].roman, orderName: starts[k].name,
      from: starts[k].i + 1, to: k + 1 < starts.length ? starts[k + 1].i : rows.length,
    })
  }
  return out.filter(s => ORDER_STATE_TO_SPINE[s.orderName] !== undefined)
}

/**
 * Repair AC numbers that the Order printed with a leading digit dropped
 * ("5. Mehkar" for 25, "62-Mummidivaram" for 162 — both real). The repair is
 * only applied when Table A of the SAME Order settles it beyond doubt:
 *
 *   - the printed number's Table A name does not match the printed name, and
 *   - exactly one still-unassigned AC in the state carries that exact name, and
 *   - the printed number is a suffix of that AC's number (a dropped digit).
 *
 * Anything that does not meet all three is left alone and reported instead.
 */
function repairDroppedDigits(pcs, tableAcs, max, stateName) {
  if (!tableAcs.length) return []
  const nameByNo = new Map(tableAcs.map(a => [a.ac_no, normKey(a.ac_name)]))
  const assigned = new Set()
  for (const p of pcs) for (const a of p.acs) assigned.add(a.ac_no)
  const free = []
  for (let i = 1; i <= max; i++) if (!assigned.has(i) && nameByNo.has(i)) free.push(i)
  const log = []
  for (const p of pcs) for (const a of p.acs) {
    const printed = nameByNo.get(a.ac_no)
    if (printed && printed === normKey(a.ac_name)) continue        // number is right
    const cands = free.filter(y =>
      nameByNo.get(y) === normKey(a.ac_name) && String(y).endsWith(String(a.ac_no)))
    if (cands.length !== 1) continue
    const y = cands[0]
    log.push(`${stateName} PC ${p.pc_no}-${p.pc_name}: AC ${a.ac_no} → ${y} (${a.ac_name}) — the Order prints ${a.ac_no}, Table A gives ${y} for that name` +
      (printed ? ` and ${a.ac_no} for "${tableAcs.find(t => t.ac_no === a.ac_no).ac_name}"` : "") + "; dropped leading digit")
    a.corrected_from = a.ac_no
    a.ac_no = y
    free.splice(free.indexOf(y), 1)
  }
  for (const p of pcs) p.acs.sort((x, y) => x.ac_no - y.ac_no)
  return log
}

/** Minimal CSV reader for the committed transcriptions (no embedded commas). */
function readCsvRows(text) {
  const lines = text.trim().split(/\r?\n/)
  const head = lines[0].split(",").map(h => h.trim())
  return lines.slice(1).filter(Boolean).map(l => {
    const cells = l.split(",")
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]))
  })
}

/**
 * Turn one transcribed current-order CSV into PC records, asserting it against
 * the order's own recitals first. Returns { pcs, problems } — a failed check
 * never silently downgrades the data, it is reported and the caller decides.
 */
function currentOrderPcs(spec, csvText) {
  const rows = readCsvRows(csvText)
  const problems = []
  const byPc = new Map()
  for (const r of rows) {
    const no = parseInt(r.pc_no, 10)
    if (!byPc.has(no)) byPc.set(no, {
      pc_no: no, pc_name: cleanName(r.pc_name),
      reserved: (r.pc_reserved || "GEN").toUpperCase() || "GEN", acs: [],
    })
    byPc.get(no).acs.push({
      ac_no: parseInt(r.ac_no, 10), ac_name: cleanName(r.ac_name),
      ac_reserved: (r.ac_reserved || "GEN").toUpperCase() || "GEN",
      source: r.source || "", confidence: r.confidence || "",
    })
  }
  const pcs = [...byPc.values()].sort((a, b) => a.pc_no - b.pc_no)
  for (const p of pcs) p.acs.sort((a, b) => a.ac_no - b.ac_no)

  if (pcs.length !== spec.expectPc)
    problems.push(`${spec.order}: ${pcs.length} PCs transcribed, order allocates ${spec.expectPc}`)
  const seen = new Map()
  for (const p of pcs) for (const a of p.acs) seen.set(a.ac_no, (seen.get(a.ac_no) || 0) + 1)
  const missing = [], dup = []
  for (let i = 1; i <= spec.expectAc; i++) if (!seen.has(i)) missing.push(i)
  for (const [no, n] of seen) if (n > 1) dup.push(no)
  const extra = [...seen.keys()].filter(n => n < 1 || n > spec.expectAc)
  if (missing.length || dup.length || extra.length)
    problems.push(`${spec.order}: AC coverage ${seen.size}/${spec.expectAc}` +
      (missing.length ? ` — missing ${missing.join(", ")}` : "") +
      (dup.length ? ` — duplicated ${dup.join(", ")}` : "") +
      (extra.length ? ` — out of range ${extra.join(", ")}` : ""))
  const tally = (list, key) => list.reduce((m, x) => (m[x[key]] = (m[x[key]] || 0) + 1, m), {})
  const pcRes = tally(pcs, "reserved")
  const acRes = tally(pcs.flatMap(p => p.acs), "ac_reserved")
  for (const [k, want] of Object.entries(spec.expectPcReserved))
    if ((pcRes[k] || 0) !== want) problems.push(`${spec.order}: ${pcRes[k] || 0} ${k}-reserved PCs, order recites ${want}`)
  for (const [k, want] of Object.entries(spec.expectAcReserved))
    if ((acRes[k] || 0) !== want) problems.push(`${spec.order}: ${acRes[k] || 0} ${k}-reserved ACs, order recites ${want}`)
  const lowConf = pcs.flatMap(p => p.acs).filter(a => a.confidence && a.confidence !== "high")
  if (lowConf.length) problems.push(`${spec.order}: ${lowConf.length} AC row(s) transcribed below high confidence`)
  return { pcs, problems, acCount: seen.size }
}

/**
 * SCHEDULE I — "Allocation of Seats in House of People". Columns 5/6/7 are the
 * 2008 total / SC-reserved / ST-reserved counts per state and UT. This is the
 * Order's own tally, so it is used to assert the Table B parse and to settle
 * reservation for the nine seats that have no Table B row of their own.
 * Returns Map(UPPERCASE state name → {total, sc, st}).
 */
function parseScheduleI(rows) {
  const start = rows.findIndex(r => /^SCHEDULE\s*[-–—]?\s*I$/i.test(r.whole))
  const end = rows.findIndex((r, i) => i > start && /^SCHEDULE\s*[-–—]?\s*II$/i.test(r.whole))
  if (start < 0 || end < 0) return new Map()
  const out = new Map()
  const num = t => (t === ".." ? 0 : parseInt(t, 10))
  let last = null
  for (const r of rows.slice(start, end)) {
    const t = r.whole.replace(/\s+/g, " ").trim()
    const m = t.match(/^(\d{1,2})\.\s+(.+?)\s+((?:\d+|\.\.)(?:\s+(?:\d+|\.\.)){5})$/)
    if (m) {
      const v = m[3].split(/\s+/)
      last = { name: m[2].trim().toUpperCase(), total: num(v[3]), sc: num(v[4]), st: num(v[5]) }
      out.set(last.name, last)
      continue
    }
    // a wrapped state name on the following line ("Andhra" / "Pradesh")
    if (last && /^[A-Za-z][A-Za-z ]{2,}$/.test(t) && !/^(I|II)\./.test(t) && t.length < 24) {
      out.delete(last.name)
      last.name = (last.name + " " + t.toUpperCase()).replace(/\s+/g, " ")
      out.set(last.name, last)
    }
  }
  return out
}

/** The left-column entry number on a row, or null. */
function leftEntryNo(left) {
  if (isNoise(left)) return null
  const m = left.match(/^(\d{1,3})\s*[.\-–—~:]?\s*(.*)$/)
  if (!m) return null
  if (!m[2].trim()) return null              // a bare number is a page number
  return +m[1]
}

/**
 * Split a Schedule into its Table A and Table B spans.
 *
 * Preferred anchor is the printed heading, but the Order omits or mangles it
 * for a third of the states (Bihar and UP have no "TABLE B" text at all; Assam
 * prints "PART B"). The structural fallback is exact: Table A numbers ACs
 * 1..N continuously across district headings and Table B restarts at 1, so the
 * LAST reset to 1 in the Schedule is where Table B begins.
 */
function splitTables(rows, sched) {
  const span = rows.slice(sched.from, sched.to)
  let bIdx = span.findIndex(r => RE_TABLE_B.test(r.whole) || RE_PC_TABLE_HEAD.test(r.whole))
  if (bIdx < 0) {
    const nums = []
    for (let i = 0; i < span.length; i++) {
      const n = leftEntryNo(span[i].left)
      if (n != null) nums.push({ i, n })
    }
    for (let k = nums.length - 1; k > 0; k--) {
      if (nums[k].n === 1 && nums[k - 1].n >= 5) { bIdx = nums[k].i; break }
    }
  }
  const aHead = span.findIndex(r => RE_TABLE_A.test(r.whole))
  const aIdx = aHead >= 0 && (bIdx < 0 || aHead < bIdx) ? aHead + 1 : 0
  return {
    tableA: span.slice(aIdx, bIdx < 0 ? span.length : bIdx),
    tableB: bIdx < 0 ? [] : span.slice(bIdx + 1),
  }
}

/**
 * TABLE A → [{ac_no, ac_name, district}].
 *
 * `max` (the Assembly's seat count, fixed by the same Order) rejects numbered
 * lists that belong to an appendix rather than the constituency table, and the
 * de-dup keeps the FIRST occurrence — the table proper always precedes any
 * appendix that repeats a number.
 */
function parseTableA(span, max = Infinity) {
  const out = []
  let district = null
  for (const r of span) {
    const d = parseDistrictHeading(r.whole)
    if (d) { district = d.name; continue }
    const left = r.left
    if (isNoise(left)) continue
    const m = left.match(/^(\d{1,3})\s*[.\-–—~:]?\s*(.*)$/)
    if (m && m[2].trim() && +m[1] >= 1 && +m[1] <= max)
      out.push({ ac_no: +m[1], ac_name: cleanName(m[2]), district })
    else if (out.length && /^[A-Za-z(]/.test(left)) {
      const last = out[out.length - 1]
      last.ac_name = cleanName(last.ac_name + " " + left)
    }
  }
  const byNo = new Map()
  for (const a of out) if (!byNo.has(a.ac_no)) byNo.set(a.ac_no, a)
  return [...byNo.values()].sort((a, b) => a.ac_no - b.ac_no)
}

/** TABLE B → [{pc_no, pc_name, reserved, acs, unparsed, wholeState}]. */
function parseTableB(span, { districtsOnly = false, stateName = "" } = {}) {
  const entries = []
  const repairs = []
  let cur = null
  for (const r of span) {
    if (RE_NOTE.test(r.whole)) break              // trailing legal note ends the table
    if (RE_SCHEDULE.test(r.whole) || RE_ANNEXURE.test(r.whole)) break
    const { left, right } = r
    if (left && !isNoise(left)) {
      const head = parsePcHeading(left)
      // "17-" on its own line: the number is a new entry whose name wrapped.
      const bare = !head && left.match(/^(\d{1,3})\s*[.\-–—~:]$/)
      if (head || bare) {
        if (cur) entries.push(cur)
        cur = bare
          ? { pc_no: +bare[1], pc_name: "", reserved: "GEN", extent: [] }
          : { pc_no: head.no, pc_name: head.name, reserved: head.reserved, extent: [] }
      } else if (cur) {
        const res = left.match(/^\(?\s*(SC|ST)\s*\)?$/i)
        if (res) cur.reserved = res[1].toUpperCase()
        // Only a genuine wrapped name continues the heading. Anything long or
        // prose-shaped is the schedule's trailing note bleeding into the column.
        else if (left.length <= 32 && !/reference|Table\s*-?\s*A|Census|division/i.test(left))
          cur.pc_name = (cur.pc_name ? cur.pc_name + " " : "") + left
      }
    }
    if (right && cur && !isNoise(right)) cur.extent.push(right)
  }
  if (cur) entries.push(cur)
  for (const e of entries) {
    e.pc_name = cleanName(e.pc_name)
    e.extent_text = joinWrapped(e.extent)
    // "(ST" with the closing bracket lost to the column split still counts.
    const res = e.pc_name.match(/\(\s*(SC|ST)\s*\)?\s*$/i)
    if (res) { e.reserved = res[1].toUpperCase(); e.pc_name = cleanName(e.pc_name.slice(0, res.index)) }
  }
  // Column-artefact repair. The Order occasionally prints the opening line(s) of
  // a PC's extent one row ABOVE its vertically-centred name cell, so that text
  // lands on the previous PC. The tell is unambiguous: the following PC's extent
  // then starts mid-entry (not with a number), and the previous PC's extent
  // carries a second period-terminated list — each PC's list ends in a full
  // stop, so the last ". <digit>" boundary is exactly where the stray list began.
  for (let i = 0; i < entries.length - 1; i++) {
    const next = entries[i + 1]
    if (/^\d/.test(next.extent_text)) continue        // next PC starts cleanly
    const cuts = [...entries[i].extent_text.matchAll(/\.\s+(?=\d)/g)]
    if (cuts.length) {
      const cut = cuts[cuts.length - 1]
      const tail = entries[i].extent_text.slice(cut.index + cut[0].length)
      entries[i].extent_text = entries[i].extent_text.slice(0, cut.index + 1)
      next.extent_text = (tail + " " + next.extent_text).trim()
      repairs.push(`${stateName} PC ${entries[i].pc_no}→${next.pc_no}: the following PC's extent opened above its name cell; moved "${tail.slice(0, 60)}${tail.length > 60 ? "…" : ""}" back to it`)
      continue
    }
    // Same defect, one dangling AC number at a time.
    const m = entries[i].extent_text.match(/(?:^|[,;]|\band\b)\s*(\d{1,3})\s*[.\-–—~:]?\s*$/)
    if (!m) continue
    entries[i].extent_text = entries[i].extent_text.slice(0, m.index).replace(/[\s,;]+$/, "")
    next.extent_text = `${m[1]}. ${next.extent_text}`
    repairs.push(`${stateName} PC ${entries[i].pc_no}→${next.pc_no}: moved dangling AC number ${m[1]} to the following PC`)
  }
  const out = entries.map(e => {
    if (districtsOnly)
      return { ...e, acs: [], unparsed: [], wholeState: false, districtsOnly: true }
    if (isWholeStateExtent(e.extent_text))
      return { ...e, acs: [], unparsed: [], wholeState: true }
    const { acs, unparsed } = parseAcRefs(e.extent_text)
    return { ...e, acs, unparsed, wholeState: false }
  })
  out.repairs = repairs
  return out
}

// ───────────────────────────── CSV / JSON writers ────────────────────────────

const csv = rows => rows.map(r => r.map(c => {
  const s = c == null ? "" : String(c)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}).join(",")).join("\n")

const writeBoth = (name, text) => {
  for (const dir of [DATA, WIKI_PUB]) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, name), text)
  }
}

// ────────────────────────────────── main ─────────────────────────────────────

async function main() {
  const warn = []
  const note = m => { warn.push(m); console.log("     ⚠ " + m) }

  console.log("1/7  extracting the 2008 Delimitation Order PDF…")
  const pages = await extractPdfPages(F.pdf)
  console.log(`     ${pages.length} pages`)

  console.log("2/7  segmenting schedules and parsing Table A / Table B…")
  const docRows = documentRows(pages)
  const scheds = segmentSchedules(docRows)
  console.log(`     ${scheds.length} state/UT schedules`)

  const allocation = parseScheduleI(docRows)
  const allocTotal = [...allocation.values()].reduce((a, v) => a + v.total, 0)
  const allocSc = [...allocation.values()].reduce((a, v) => a + v.sc, 0)
  const allocSt = [...allocation.values()].reduce((a, v) => a + v.st, 0)
  console.log(`     Schedule I: ${allocation.size} states/UTs · ${allocTotal} seats · ${allocSc} SC · ${allocSt} ST`)
  if (allocTotal !== 543) note(`Schedule I parse totals ${allocTotal} seats, expected 543`)
  if (allocSc !== 84 || allocSt !== 47) note(`Schedule I parse reserves ${allocSc} SC / ${allocSt} ST, expected 84 / 47`)
  for (const [name, exp] of Object.entries(EXPECTED_PC_COUNT)) {
    const a = allocation.get(name) || allocation.get(name.replace(/^NCT OF /, ""))
    if (a && a.total !== exp) note(`Schedule I gives ${name} ${a.total} seats, builder table says ${exp}`)
  }

  const orderStates = []
  const errataApplied = []
  for (const s of scheds) {
    const { tableA, tableB } = splitTables(docRows, s)
    const districtsOnly = s.orderName === "JAMMU AND KASHMIR"
    const pcs = parseTableB(tableB, { districtsOnly, stateName: s.orderName })
    for (const r of pcs.repairs || []) note(r)
    const maxAc = EXPECTED_AC_COUNT[s.orderName] || Infinity
    const acs = parseTableA(tableA, maxAc)
    errataApplied.push(...repairDroppedDigits(pcs, acs, maxAc, s.orderName))
    // curated errata for anything the Table A cross-check cannot settle
    for (const e of TEXT_ERRATA.filter(e => e.state === s.orderName)) {
      const pc = pcs.find(p => p.pc_no === e.pc_no)
      const ac = pc?.acs.find(a => a.ac_no === e.from)
      if (!ac) { note(`curated erratum no longer matches (${e.state} PC ${e.pc_no}: ${e.from}→${e.to}) — re-verify before removing it`); continue }
      ac.ac_no = e.to; ac.corrected_from = e.from
      if (e.name) ac.ac_name = e.name
      pc.acs.sort((a, b) => a.ac_no - b.ac_no)
      errataApplied.push(`${e.state} PC ${e.pc_no}: AC ${e.from} → ${e.to} (${ac.ac_name}). ${e.why}`)
    }
    orderStates.push({ ...s, districtsOnly, pcs, acs })
  }
  for (const s of orderStates) {
    const bad = s.pcs.reduce((n, p) => n + p.unparsed.length, 0)
    const exp = EXPECTED_PC_COUNT[s.orderName], expAc = EXPECTED_AC_COUNT[s.orderName]
    const flag = (exp && exp !== s.pcs.length ? `  ✗ PCs expected ${exp}` : "") +
      (expAc && expAc !== s.acs.length ? `  ✗ ACs expected ${expAc}` : "")
    console.log(`     ${s.roman.padEnd(6)} ${s.orderName.padEnd(20)} ACs ${String(s.acs.length).padStart(3)}  PCs ${String(s.pcs.length).padStart(3)}${bad ? `  unparsed-tokens ${bad}` : ""}${flag}`)
    // A single-seat state whose Table B has no numbered row ("Sikkim — the
    // entire area of the State") is expected, not a defect: it is expanded from
    // Table A below.
    const wholeStateSeat = exp === 1 && s.pcs.length === 0 && s.acs.length > 0
    if (exp && exp !== s.pcs.length && !wholeStateSeat)
      note(`${s.orderName}: parsed ${s.pcs.length} PCs from Table B, expected ${exp}`)
    if (expAc && expAc !== s.acs.length) {
      const have = new Set(s.acs.map(a => a.ac_no))
      const missing = []
      for (let i = 1; i <= expAc; i++) if (!have.has(i)) missing.push(i)
      note(`${s.orderName}: parsed ${s.acs.length} ACs from Table A, expected ${expAc}` +
        (missing.length ? ` — missing AC numbers ${missing.join(", ")}` : ""))
    }
    if (bad) for (const p of s.pcs) for (const u of p.unparsed)
      note(`${s.orderName} PC ${p.pc_no}-${p.pc_name}: unparsed extent token "${u}"`)
  }
  for (const e of errataApplied) console.log(`     ✎ erratum applied — ${e}`)

  console.log("3/7  normalising to today's states/UTs…")
  // orderPc records keyed by current spine state
  const orderPcs = []          // {spineState, pc_no, pc_name, reserved, acs[], basis}
  const stateAcIndex = new Map() // spineState -> Map(ac_no -> {ac_name, district})

  const putAcIndex = (spineState, acs, acOffset = 0, from = -Infinity, to = Infinity) => {
    if (!stateAcIndex.has(spineState)) stateAcIndex.set(spineState, new Map())
    const m = stateAcIndex.get(spineState)
    for (const a of acs) {
      if (a.ac_no < from || a.ac_no > to) continue
      m.set(a.ac_no + acOffset, { ac_name: a.ac_name, district: a.district })
    }
  }

  for (const s of orderStates) {
    const target = ORDER_STATE_TO_SPINE[s.orderName]
    if (target === "__AP_SPLIT__") {
      // Assert the reorganisation offsets rather than trusting them.
      for (const seg of AP_SPLIT) {
        const segPcs = s.pcs.filter(p => p.pc_no >= seg.pcFrom && p.pc_no <= seg.pcTo)
        const stray = segPcs.flatMap(p => p.acs.filter(a => a.ac_no < seg.acFrom || a.ac_no > seg.acTo)
          .map(a => `PC ${p.pc_no}-${p.pc_name} → AC ${a.ac_no}-${a.ac_name}`))
        if (stray.length) note(`AP 2014 split: ${seg.spine} segment has ${stray.length} AC(s) outside ${seg.acFrom}–${seg.acTo}: ${stray.slice(0, 4).join("; ")}`)
        putAcIndex(seg.spine, s.acs, seg.acOffset, seg.acFrom, seg.acTo)
        for (const p of segPcs) {
          orderPcs.push({
            spineState: seg.spine, pc_no: p.pc_no + seg.pcOffset, pc_name: p.pc_name,
            reserved: p.reserved, wholeState: p.wholeState,
            acs: p.acs.map(a => ({ ...a, ac_no: a.ac_no + seg.acOffset })),
            basis: "2008-order-renumbered-ap-reorg-2014",
            order_ref: `AP PC ${p.pc_no}`,
          })
        }
      }
      continue
    }
    if (target === "__JK_SPLIT__") {
      for (const p of s.pcs) {
        const spineState = JK_SPLIT[p.pc_name] || "Jammu & Kashmir"
        orderPcs.push({
          spineState, pc_no: null, pc_name: p.pc_name, reserved: p.reserved,
          wholeState: false, acs: [], districtsText: p.extent_text,
          basis: "2008-order-districts-only",
          order_ref: `J&K PC ${p.pc_no}`,
        })
      }
      continue
    }
    putAcIndex(target, s.acs)
    for (const p of s.pcs) {
      orderPcs.push({
        spineState: target, pc_no: p.pc_no, pc_name: p.pc_name, reserved: p.reserved,
        wholeState: p.wholeState, acs: p.acs,
        basis: p.wholeState ? "2008-order-whole-state" : "2008-order-direct",
        order_ref: `${s.orderName} PC ${p.pc_no}`,
      })
    }
    // States with a single PC and no Table B (Nagaland) — the whole state is the seat.
    if (!s.pcs.length && s.acs.length) {
      orderPcs.push({
        spineState: target, pc_no: 1, pc_name: titleCase(s.orderName), reserved: "GEN",
        wholeState: true, acs: [], basis: "2008-order-whole-state",
        order_ref: `${s.orderName} (no Table B — single-seat state)`,
      })
    }
  }
  // Expand whole-state PCs to the state's full AC list.
  for (const p of orderPcs) {
    if (!p.wholeState) continue
    const idx = stateAcIndex.get(p.spineState)
    if (!idx || !idx.size) { note(`${p.spineState}: whole-state PC but no Table A ACs parsed`); continue }
    p.acs = [...idx.entries()].sort((a, b) => a[0] - b[0])
      .map(([no, v]) => ({ ac_no: no, ac_name: v.ac_name, ac_reserved: "GEN" }))
  }
  // Post-2008 orders override the 2008 composition for their state/UT. Assam was
  // re-delimited in 2023 and J&K in 2022; both renumbered their ACs from scratch,
  // so the 2008 rows are replaced wholesale — never merged — and the stale 2008
  // AC→district index for those states is dropped with them.
  const upgraded = []
  for (const spec of CURRENT_ORDERS) {
    const { pcs, problems, acCount } = currentOrderPcs(spec, readFileSync(F[spec.file], "utf8"))
    for (const p of problems) note(p)
    if (problems.length) { note(`${spec.order}: NOT applied — 2008 basis retained for ${spec.spineState}`); continue }
    const replaced = orderPcs.filter(p => p.spineState === spec.spineState).length
    for (let i = orderPcs.length - 1; i >= 0; i--)
      if (orderPcs[i].spineState === spec.spineState) orderPcs.splice(i, 1)
    stateAcIndex.delete(spec.spineState)     // 2008 AC numbering no longer applies
    for (const p of pcs) orderPcs.push({
      spineState: spec.spineState, pc_no: p.pc_no, pc_name: p.pc_name,
      reserved: p.reserved, wholeState: false, acs: p.acs,
      basis: spec.basis, order_ref: `${spec.order}, Table B — PC ${p.pc_no}`,
      currentOrder: spec,
    })
    upgraded.push({ spec, pcs: pcs.length, acs: acCount, replaced })
    console.log(`     ✔ ${spec.order}: ${pcs.length} PCs · ${acCount} ACs applied (replacing ${replaced} rows built on the 2008 basis)`)
  }

  // Reservation for the seats the Order gives no Table B row of its own
  // (single-seat states whose extent is "the entire state", and the five UTs
  // with no Assembly and therefore no Schedule): Schedule I settles it.
  const allocFor = spineState => {
    for (const [name, v] of allocation)
      if (normKey(name) === normKey(spineState) ||
        normKey(name).startsWith(normKey(spineState))) return v
    return null
  }
  for (const p of orderPcs) {
    if (!p.wholeState || p.reserved !== "GEN") continue
    const a = allocFor(p.spineState)
    if (a && a.total === 1) p.reserved = a.st === 1 ? "ST" : a.sc === 1 ? "SC" : "GEN"
  }

  // Completeness assertion: within a state every Assembly Constituency belongs
  // to exactly one Parliamentary Constituency. Anything missing or doubled is a
  // parse defect and is reported, never quietly published.
  const acExpectedBySpine = { Telangana: 119, "Andhra Pradesh": 175 }
  for (const [orderName, spineName] of Object.entries(ORDER_STATE_TO_SPINE)) {
    if (spineName.startsWith("__")) continue
    if (EXPECTED_AC_COUNT[orderName]) acExpectedBySpine[spineName] = EXPECTED_AC_COUNT[orderName]
  }
  // A state governed by a newer order is checked against that order's count.
  for (const u of upgraded) acExpectedBySpine[u.spec.spineState] = u.spec.expectAc
  let acLinkTotal = 0, acMissingTotal = 0, acDupTotal = 0
  for (const [state, expected] of Object.entries(acExpectedBySpine)) {
    const pcs = orderPcs.filter(p => p.spineState === state)
    if (!pcs.length) continue
    const seen = new Map()
    for (const p of pcs) for (const a of p.acs) {
      acLinkTotal++
      seen.set(a.ac_no, (seen.get(a.ac_no) || 0) + 1)
    }
    const missing = [], dup = []
    for (let i = 1; i <= expected; i++) if (!seen.has(i)) missing.push(i)
    for (const [no, n] of seen) if (n > 1) dup.push(no)
    const extra = [...seen.keys()].filter(n => n < 1 || n > expected)
    acMissingTotal += missing.length; acDupTotal += dup.length
    if (missing.length || dup.length || extra.length)
      note(`${state}: Table B covers ${seen.size}/${expected} ACs` +
        (missing.length ? ` — never assigned: ${missing.join(", ")}` : "") +
        (dup.length ? ` — assigned twice: ${dup.join(", ")}` : "") +
        (extra.length ? ` — out of range: ${extra.join(", ")}` : ""))
  }
  console.log(`     ${orderPcs.length} PCs carried forward · ${acLinkTotal} AC links · ${acMissingTotal} ACs unassigned · ${acDupTotal} double-assigned`)

  // Reservation assertion: the SC/ST counts we derived from each state's
  // Table B tags must equal Schedule I's own tally for that state.
  for (const [name, a] of allocation) {
    const spineName = ORDER_STATE_TO_SPINE[name] || ORDER_STATE_TO_SPINE["NCT OF " + name] ||
      [...new Set(orderPcs.map(p => p.spineState))].find(s => normKey(s) === normKey(name))
    if (!spineName || spineName.startsWith("__")) continue
    const pcs = orderPcs.filter(p => p.spineState === spineName)
    if (!pcs.length) continue
    const sc = pcs.filter(p => p.reserved === "SC").length
    const st = pcs.filter(p => p.reserved === "ST").length
    if (sc !== a.sc || st !== a.st)
      note(`${spineName}: Table B tags give ${sc} SC / ${st} ST, Schedule I says ${a.sc} SC / ${a.st} ST`)
  }

  console.log("4/7  loading the 543-seat spine + DataMeet attributes…")
  const spineGeo = JSON.parse(readFileSync(F.spine, "utf8"))
  const dmGeo = JSON.parse(readFileSync(F.datameetPc, "utf8"))
  const spine = spineGeo.features.map(f => {
    const p = f.properties
    const raw = p.ls_seat_name
    const ex = raw.match(/\(ex\s+([^)]+)\)/i)
    return {
      pc_id: p.unique_id, state_ut_code: p.state_ut_code, state_ut: p.state_ut_name,
      pc_no: parseInt(p.ls_seat_code, 10),
      pc_name: cleanName(raw.replace(/\s*\(ex[^)]*\)/i, "")),
      former_name: ex ? cleanName(ex[1]) : "",
      geom: f.geometry, bbox: geomBbox(f.geometry),
    }
  }).sort((a, b) => a.state_ut.localeCompare(b.state_ut) || a.pc_no - b.pc_no)
  if (spine.length !== 543) note(`spine has ${spine.length} seats, expected 543`)

  const alias = k => PC_NAME_ALIASES[k] || k
  const spineKeys = s => {
    const k = new Set([normKey(s.pc_name)])
    if (s.former_name) k.add(normKey(s.former_name))
    return k
  }
  const byState = new Map()
  for (const s of spine) {
    if (!byState.has(s.state_ut)) byState.set(s.state_ut, [])
    byState.get(s.state_ut).push(s)
  }

  // DataMeet attribute join (pc_category is NOT trusted for reservation — kept
  // only to report divergence; wikidata_qid / Hindi name are the useful bits).
  const dmByState = new Map()
  const DM_STATE_FIX = { "Orissa": "Odisha", "Jammu & Kashmir": "Jammu & Kashmir", "Daman & Diu": "Dadra and Nagar Haveli and Daman and Diu", "Dadra & Nagar Haveli": "Dadra and Nagar Haveli and Daman and Diu" }
  for (const f of dmGeo.features) {
    const p = f.properties
    const st = DM_STATE_FIX[p.st_name] || p.st_name
    if (!dmByState.has(st)) dmByState.set(st, [])
    dmByState.get(st).push(p)
  }
  const dmFor = s => {
    const list = dmByState.get(s.state_ut) || []
    const keys = spineKeys(s)
    let hit = list.find(p => [...keys].some(k => alias(normKey(p.pc_name)) === alias(k) || normKey(p.pc_name) === k))
    if (!hit && !["Assam", "Jammu & Kashmir", "Ladakh", "Dadra and Nagar Haveli and Daman and Diu"].includes(s.state_ut))
      hit = list.find(p => +p.pc_no === s.pc_no)
    return hit || null
  }

  // Attach the DataMeet record and the canonical key to every seat up front, so
  // the verification pass and the artifact writer share one definition.
  for (const s of spine) {
    s.dm = dmFor(s)
    s.st_code = s.dm?.st_code ?? ST_CODE_FALLBACK[s.state_ut] ?? null
    if (s.st_code == null) note(`no st_code for ${s.state_ut} ${s.pc_no}-${s.pc_name} — pc_code cannot be formed`)
    s.pc_code = s.st_code == null ? "" : `${s.st_code}-${s.pc_no}`
  }
  const dupKeys = spine.map(s => s.pc_code).filter((v, i, a) => v && a.indexOf(v) !== i)
  if (dupKeys.length) note(`pc_code is not unique: ${[...new Set(dupKeys)].join(", ")}`)

  console.log("5/7  joining the Order composition onto the spine…")
  const orderByState = new Map()
  for (const p of orderPcs) {
    if (!orderByState.has(p.spineState)) orderByState.set(p.spineState, [])
    orderByState.get(p.spineState).push(p)
  }
  const joinReport = { byNumber: 0, byName: 0, unmatched: 0, nameVariants: [] }
  for (const s of spine) {
    const pool = orderByState.get(s.state_ut) || []
    const keys = spineKeys(s)
    let hit = pool.find(p => [...keys].some(k => alias(normKey(p.pc_name)) === alias(k)))
    if (hit) joinReport.byName++
    if (!hit) {
      hit = pool.find(p => p.pc_no === s.pc_no && !p.__used)
      if (hit) {
        joinReport.byNumber++
        if (![...keys].some(k => alias(normKey(hit.pc_name)) === alias(k)))
          joinReport.nameVariants.push(`${s.state_ut} ${s.pc_no}: Order "${hit.pc_name}" ↔ current "${s.pc_name}"`)
      }
    }
    if (hit) { hit.__used = true; s.order = hit }
    else {
      s.order = null
      if (!NO_ASSEMBLY_STATES.has(s.state_ut)) {
        joinReport.unmatched++
        note(`no Order match for ${s.state_ut} ${s.pc_no}-${s.pc_name}`)
      }
    }
  }
  const orphans = orderPcs.filter(p => !p.__used)
  for (const o of orphans) note(`Order PC not matched to any current seat: ${o.spineState} ${o.pc_no}-${o.pc_name} (${o.order_ref})`)
  console.log(`     matched by name ${joinReport.byName} · by number ${joinReport.byNumber} · unmatched ${joinReport.unmatched} · Order orphans ${orphans.length}`)
  for (const v of joinReport.nameVariants) console.log(`       name variant — ${v}`)

  console.log("6/7  spatial verification + district shares…")
  const sf = await import("shapefile")
  const acGeo = await sf.read(F.acShp, F.acDbf, { encoding: "utf-8" })
  const distGeo = await sf.read(F.distShp, F.distDbf, { encoding: "utf-8" })
  console.log(`     ${acGeo.features.length} AC polygons · ${distGeo.features.length} district polygons (2011 Census)`)

  // AC polygon lookup: by (spine state, normalised AC name), then by (state, no).
  const AC_STATE_FIX = {
    "ORISSA": "Odisha", "UTTARKHAND": "Uttarakhand", "PONDICHERRY": "Puducherry",
    "JAMMU & KASHMIR": "Jammu & Kashmir", "DELHI": "Delhi",
  }
  const acByStateName = new Map(), acByStateNo = new Map()
  for (const f of acGeo.features) {
    const p = f.properties
    const st = AC_STATE_FIX[p.ST_NAME] || titleCase(p.ST_NAME)
    const pt = interiorPoint(f.geometry)
    if (!pt) continue
    const rec = { state: st, ac_no: +p.AC_NO, ac_name: p.AC_NAME, district: p.DIST_NAME, pt }
    const nk = st + "|" + normKey(p.AC_NAME)
    if (!acByStateName.has(nk)) acByStateName.set(nk, [])
    acByStateName.get(nk).push(rec)
    const ik = st + "|" + p.AC_NO
    if (!acByStateNo.has(ik)) acByStateNo.set(ik, rec)
  }
  // Telangana ACs live under "Andhra Pradesh" in the 2011-vintage shapefile.
  // Names are not unique inside a state (Andhra Pradesh has two Gannavaram),
  // so a name hit with several candidates is disambiguated by AC number.
  const acLookup = (state, ac) => {
    const states = state === "Telangana" ? ["Telangana", "Andhra Pradesh"] : [state]
    for (const st of states) {
      const cands = acByStateName.get(st + "|" + normKey(ac.ac_name))
      if (!cands || !cands.length) continue
      if (cands.length === 1) return cands[0]
      return cands.find(c => c.ac_no === ac.ac_no) || cands[0]
    }
    for (const st of states) {
      const byNo = acByStateNo.get(st + "|" + ac.ac_no)
      if (byNo && normKey(byNo.ac_name) === normKey(ac.ac_name)) return byNo
    }
    return null
  }

  const pcIndex = makeIndex(spine.map(s => ({ ...s, geom: s.geom, bbox: s.bbox })))
  const districts = distGeo.features.map(f => ({
    name: f.properties.DISTRICT, state: f.properties.ST_NM,
    geom: f.geometry, bbox: geomBbox(f.geometry),
  }))
  const distIndex = makeIndex(districts)

  let totAc = 0, totLocated = 0, totAgree = 0
  const disagreements = []
  for (const s of spine) {
    const acs = s.order ? s.order.acs : []
    let located = 0, agree = 0
    for (const a of acs) {
      totAc++
      const rec = acLookup(s.state_ut, a)
      a.located = !!rec
      if (!rec) continue
      located++; totLocated++
      const hitPc = pcIndex(rec.pt[0], rec.pt[1])
      a.spatial_pc = hitPc ? `${hitPc.state_ut} ${hitPc.pc_no}-${hitPc.pc_name}` : null
      a.spatial_agrees = !!hitPc && hitPc.pc_id === s.pc_id
      if (a.spatial_agrees) { agree++; totAgree++ }
      else disagreements.push({
        pc_code: s.pc_code, pc_id: s.pc_id,
        pc: `${s.state_ut} ${s.pc_no}-${s.pc_name}`,
        ac: `${a.ac_no}-${a.ac_name}`, spatial_pc: a.spatial_pc || "(outside every PC polygon)",
      })
      a.shapefile_district = rec.district || null
    }
    s.ac_located = located; s.ac_agree = agree
    s.ac_agreement = located ? +(agree / located).toFixed(3) : null
  }
  console.log(`     AC↔PC spatial check: ${totLocated}/${totAc} ACs locatable · ${totAgree} agree (${(100 * totAgree / (totLocated || 1)).toFixed(1)}%) · ${disagreements.length} disagreements`)

  // PC → district share vector (interior grid sampling, ward-crosswalk style).
  for (const s of spine) {
    const [mnX, mnY, mxX, mxY] = s.bbox
    const steps = 26, dx = (mxX - mnX) / steps, dy = (mxY - mnY) / steps
    const hits = {}; let inside = 0, outside = 0
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
      const x = mnX + (i + 0.5) * dx, y = mnY + (j + 0.5) * dy
      if (!geomContains(s.geom, x, y)) continue
      inside++
      const d = distIndex(x, y)
      if (!d) { outside++; continue }
      hits[d.name] = (hits[d.name] || 0) + 1
    }
    const ranked = Object.entries(hits).sort((a, b) => b[1] - a[1])
    s.district_shares = ranked.map(([name, c]) => ({ district: name, share: +(c / (inside || 1)).toFixed(4) }))
    s.district_outside_share = inside ? +(outside / inside).toFixed(4) : 1
    s.district_samples = inside
  }

  console.log("7/7  writing the canonical artifact…")
  const rows = []
  for (const s of spine) {
    const o = s.order
    const acs = o ? o.acs : []
    // KEY CONTRACT: pc_code = <st_code>-<pc_no> (see ST_CODE_FALLBACK above).
    const { dm, st_code, pc_code } = s
    const acCode = n => (st_code == null ? "" : `${st_code}-${n}`)
    // Seats with no Table B row of their own (Assembly-less UTs) take their
    // reservation from Schedule I, which allocates seat-by-seat for one-seat UTs.
    const alloc1 = o ? null : allocFor(s.pc_name) || allocFor(s.state_ut)
    const reserved_status = o ? o.reserved
      : alloc1 && alloc1.total === 1 ? (alloc1.st === 1 ? "ST" : alloc1.sc === 1 ? "SC" : "GEN")
        : (dm?.pc_category || "")
    const reserved_source = o ? "2008-delimitation-order-table-b"
      : alloc1 && alloc1.total === 1 ? "2008-delimitation-order-schedule-i"
        : (dm ? "datameet-pc_category" : "")
    const districtsFromOrder = (() => {
      if (o && o.districtsText) {
        // J&K: the Order describes each PC directly as a list of districts.
        // "Ananmag" is the Order's own misprint of Anantnag.
        return o.districtsText.replace(/\s*districts?\.?$/i, "")
          .split(/\s*(?:,|\band\b)\s*/)
          .map(x => titleCase(cleanName(x)).replace(/^Ananmag$/, "Anantnag"))
          .filter(Boolean)
      }
      const idx = stateAcIndex.get(s.state_ut) || new Map()
      const seen = []
      for (const a of acs) {
        const d = idx.get(a.ac_no)?.district
        if (d && !seen.includes(d)) seen.push(d)
      }
      return seen
    })()
    const noAssembly = NO_ASSEMBLY_STATES.has(s.state_ut)
    const status =
      noAssembly ? "no-assembly"
        : !o ? "unmatched"
          : o.basis === "2008-order-districts-only" ? "districts-only"
            : !acs.length ? "no-acs-parsed"
              : s.ac_located === 0 ? "unverified"
                : s.ac_agreement >= 0.999 ? "verified"
                  : s.ac_agreement >= 0.7 ? "mostly-verified" : "divergent"
    if (status === "no-acs-parsed") note(`${s.state_ut} ${s.pc_no}-${s.pc_name}: matched the Order but no constituent ACs were parsed`)

    rows.push({
      pc_code,
      st_code: st_code ?? "",
      pc_id: s.pc_id,
      state_ut_code: s.state_ut_code,
      state_ut: s.state_ut,
      pc_no: s.pc_no,
      // Where a post-2008 order governs the seat, its gazette spelling wins —
      // it is the current legal name ("Guwahati", not the older "Gauhati").
      pc_name: o?.currentOrder ? o.pc_name : s.pc_name,
      pc_name_former: s.former_name || "",
      pc_name_hi: dm?.pc_name_hi || "",
      reserved_status,
      reserved_source,
      reserved_status_datameet: dm?.pc_category || "",
      wikidata_qid: dm?.wikidata_qid || "",
      pc_code_datameet: dm ? `${dm.st_code}-${dm.pc_no}` : "",
      ac_count: acs.length,
      ac_numbers: acs.map(a => a.ac_no).join(" "),
      ac_codes: acs.map(a => acCode(a.ac_no)).join(" "),
      // FULL constituent-AC list, no truncation: compact string for CSV,
      // structured array (`acs`) in the JSON.
      ac_list: acs.map(a => `${a.ac_no}-${a.ac_name}${a.ac_reserved && a.ac_reserved !== "GEN" ? ` (${a.ac_reserved})` : ""}`).join("; "),
      districts_order: districtsFromOrder.join("; "),
      district_count_order: districtsFromOrder.length,
      district_primary_spatial: s.district_shares[0]?.district || "",
      district_shares: s.district_shares.map(d => `${d.district}:${d.share}`).join(" "),
      district_outside_share: s.district_outside_share,
      ac_located: s.ac_located || 0,
      ac_spatial_agree: s.ac_agree || 0,
      ac_agreement: s.ac_agreement == null ? "" : s.ac_agreement,
      verification: status,
      delimitation_note: DELIMITATION_NOTES[s.state_ut] || "",
      source_basis: noAssembly ? "no-assembly-ut" : (o ? o.basis : "unmatched"),
      order_ref: o ? o.order_ref : "",
      acs: acs.map(a => ({
        ac_code: acCode(a.ac_no),
        ac_no: a.ac_no, ac_name: a.ac_name, ac_reserved: a.ac_reserved || "GEN",
        corrected_from: a.corrected_from ?? null,
        source_page: a.source || null,
        district_order: (stateAcIndex.get(s.state_ut) || new Map()).get(a.ac_no)?.district || null,
        district_shapefile: a.shapefile_district || null,
        spatial_located: !!a.located,
        spatial_agrees: a.located ? !!a.spatial_agrees : null,
        spatial_pc: a.located ? (a.spatial_pc || null) : null,
      })),
      district_shares_json: s.district_shares,
    })
  }

  const resTally = rows.reduce((m, r) => (m[r.reserved_status] = (m[r.reserved_status] || 0) + 1, m), {})
  const statusTally = rows.reduce((m, r) => (m[r.verification] = (m[r.verification] || 0) + 1, m), {})
  const acTotal = rows.reduce((n, r) => n + r.ac_count, 0)
  console.log(`     ${rows.length} PCs · ${acTotal} constituent-AC links · reservation ${JSON.stringify(resTally)}`)
  console.log(`     verification ${JSON.stringify(statusTally)}`)

  const dmDiff = rows.filter(r => r.reserved_status_datameet && r.reserved_status !== r.reserved_status_datameet)
  console.log(`     reservation differs from DataMeet's pc_category on ${dmDiff.length} seats`)
  for (const d of dmDiff) console.log(`       ${d.state_ut} ${d.pc_no}-${d.pc_name}: Order ${d.reserved_status} vs DataMeet ${d.reserved_status_datameet}`)

  const HEADER = [
    "pc_code", "st_code", "pc_id", "state_ut_code", "state_ut", "pc_no", "pc_name",
    "pc_name_former", "pc_name_hi",
    "reserved_status", "reserved_source", "reserved_status_datameet", "wikidata_qid",
    "pc_code_datameet", "ac_count", "ac_numbers", "ac_codes", "ac_list",
    "districts_order", "district_count_order", "district_primary_spatial",
    "district_shares", "district_outside_share",
    "ac_located", "ac_spatial_agree", "ac_agreement", "verification",
    "delimitation_note", "source_basis", "order_ref",
  ]
  writeBoth("india_pc_crosswalk.csv", csv([HEADER, ...rows.map(r => HEADER.map(h => r[h]))]))

  const generated = new Date().toISOString()
  writeBoth("india_pc_crosswalk.json", JSON.stringify({
    crosswalk: "india-lok-sabha-543 → assembly-constituencies + districts",
    version: CROSSWALK_VERSION,
    generated_at: generated,
    method: "Delimitation Order Table B parsed as primary source — the 2008 Order for every state except Assam (2023 order) and Jammu & Kashmir (2022 order), which supersede it; independent spatial verification against AC/PC/district polygons",
    sources: {
      composition: "Election Commission of India — Delimitation of Parliamentary and Assembly Constituencies Order, 2008 (Table A + Table B), via the Internet Archive mirror archive.org/details/delimitation-2008. Government of India publication.",
      composition_assam: "Assam Delimitation Order, 2023, Table B — ECI Notification No. 282/AS/2023, Gazette of India Extraordinary Part II s.3(iii), 11 August 2023 (ceoassam.nic.in mirror). Supersedes the 2008 Order for Assam's 14 PCs / 126 ACs.",
      composition_jk: "Jammu and Kashmir Delimitation Order, 2022, Table B — Delimitation Commission Notification No. 282/J&K/2022 (Vol. IV), J&K Gazette Vol. 135 No. 5-2, 5 May 2022 (DEO Anantnag mirror). Supersedes the 2008 Order for J&K's 5 PCs / 90 ACs.",
      pc_polygons: "shijithpk/2024_maps_supplement india_ls_seats_543.geojson (Unlicense) — DataMeet PC boundaries with Assam-2023 / J&K-2022 / Ladakh corrections",
      pc_attributes: "DataMeet maps parliamentary-constituencies india_pc_2019 (CC0 simplified attribute build) — Wikidata QID, Hindi name; pc_category recorded but NOT trusted",
      ac_polygons: "DataMeet maps assembly-constituencies India_AC (CC-BY 2.5 IN) — verification only; its embedded PC_NO attribute is unusable and is never read",
      district_polygons: "DataMeet maps Districts/Census_2011 (CC-BY 2.5 IN) — 641 districts, informational share vector only",
    },
    totals: {
      pcs: rows.length, ac_links: acTotal,
      reserved: resTally, verification: statusTally,
      ac_spatial_checked: totLocated, ac_spatial_agree: totAgree,
      ac_spatial_agreement_rate: +(totAgree / (totLocated || 1)).toFixed(4),
      ac_not_locatable: totAc - totLocated,
      unresolved_disagreements: disagreements.length,
    },
    caveats: [
      "PRIMARY SOURCE IS THE DELIMITATION ORDER IN FORCE. The AC list per PC is the legal composition, not a spatial guess.",
      "Assam and Jammu & Kashmir are built from their post-2008 orders (2023 and 2022), which replace the 2008 composition wholesale — both renumbered their Assembly seats, so the two vintages are never mixed. Those 19 rows carry `delimitation_note` recording which order applies.",
      "Assam and J&K have no `districts_order`: only each order's Table B was transcribed, and substituting the 2008 district mapping would be wrong under the new AC numbering. Ladakh stays on the 2008 basis — it has no Legislative Assembly, so there are no ACs to map.",
      "SC/ST reservation is taken from the Order, NOT from any geodata or roster field — every one of those checked was wrong.",
      "`districts_order` is authoritative (the Order's own district headings, as on the Order's stated reference dates). `district_shares` is a spatial share vector against 2011 Census districts and is INFORMATIONAL — India has split many districts since 2011.",
      "`ac_agreement` compares the Order against DataMeet AC polygons. Disagreement usually means the AC shapefile is pre-2008-delimitation for that state (DataMeet flags J&K, Jharkhand, Assam, Manipur, Nagaland and Arunachal Pradesh itself), not that the Order was misparsed.",
      "Corrections: open an issue at github.com/kaun-city/kaun (label: pc-crosswalk).",
    ],
    rows: rows.map(r => {
      const { district_shares_json, ...rest } = r
      return { ...rest, acs: r.acs, district_shares_vector: district_shares_json }
    }),
  }, null, 1))

  // Long-format join table: one row per (PC, AC) pair.
  const pairs = []
  for (const r of rows) for (const a of r.acs) {
    pairs.push({
      pc_code: r.pc_code, ac_code: a.ac_code,
      state_ut: r.state_ut, pc_no: r.pc_no, pc_name: r.pc_name,
      ac_no: a.ac_no, ac_name: a.ac_name, ac_reserved: a.ac_reserved,
      district_order: a.district_order || "", spatial_agrees: a.spatial_agrees == null ? "" : a.spatial_agrees,
      spatial_pc: a.spatial_pc || "",
    })
  }
  const PAIR_H = ["pc_code", "ac_code", "state_ut", "pc_no", "pc_name", "ac_no", "ac_name", "ac_reserved", "district_order", "spatial_agrees", "spatial_pc"]
  writeBoth("pc_ac_pairs.csv", csv([PAIR_H, ...pairs.map(p => PAIR_H.map(h => p[h]))]))
  writeBoth("pc_ac_pairs.json", JSON.stringify({
    crosswalk: "pc_ac_pairs (one row per PC↔AC link)",
    version: CROSSWALK_VERSION, generated_at: generated, count: pairs.length, pairs,
  }, null, 1))

  // Disagreement register — every spatial mismatch, listed, never dropped.
  const DIS_H = ["pc_code", "pc_id", "pc", "ac", "spatial_pc"]
  writeBoth("verification_disagreements.csv",
    csv([DIS_H, ...disagreements.map(d => DIS_H.map(h => d[h]))]))

  console.log("     writing METHODOLOGY.md…")
  writeFileSync(resolve(DATA, "METHODOLOGY.md"), methodology({
    rows, acTotal, resTally, statusTally, totAc, totLocated, totAgree,
    disagreements, joinReport, orderStates, dmDiff, warn, generated,
    errataApplied, allocTotal, allocSc, allocSt, upgraded,
  }))

  console.log("\n=== DONE ===")
  console.log(`India PC crosswalk: ${rows.length} PCs · ${acTotal} AC links · version ${CROSSWALK_VERSION}`)
  console.log(`Spatial agreement ${(100 * totAgree / (totLocated || 1)).toFixed(1)}% over ${totLocated} locatable ACs · ${disagreements.length} disagreements recorded`)
  console.log(`Artifact → data/pc-crosswalk/ (+ wiki download copies)`)
  if (warn.length) console.log(`${warn.length} warning(s) — all listed in METHODOLOGY.md`)
}

// ─────────────────────────────── METHODOLOGY.md ──────────────────────────────

function methodology(x) {
  const { rows, acTotal, resTally, statusTally, totAc, totLocated, totAgree, disagreements,
    dmDiff, warn, generated, errataApplied, allocTotal, allocSc, allocSt, upgraded } = x
  const upgradedTable = upgraded.map(u => {
    const rs = rows.filter(r => r.state_ut === u.spec.spineState)
    const acs = rs.reduce((n, r) => n + r.ac_count, 0)
    const loc = rs.reduce((n, r) => n + r.ac_located, 0)
    const ag = rs.reduce((n, r) => n + r.ac_spatial_agree, 0)
    return `| ${u.spec.spineState} | ${u.spec.order.replace(/,.*/, "")} | ${rs.length} | ${acs} | ${loc} | ${ag} | ${loc ? (100 * ag / loc).toFixed(1) + "%" : "—"} |`
  }).join("\n")
  const rate = (100 * totAgree / (totLocated || 1)).toFixed(1)
  const byStateDis = {}
  for (const d of disagreements) {
    const st = d.pc.split(" ")[0] === "Dadra" ? "Dadra and Nagar Haveli and Daman and Diu" : d.pc.replace(/\s+\d+-.*$/, "")
    byStateDis[st] = (byStateDis[st] || 0) + 1
  }
  const disTable = Object.entries(byStateDis).sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `| ${s} | ${n} |`).join("\n")
  const flagged = rows.filter(r => r.delimitation_note)
  return `# Kaun India PC Crosswalk — Lok Sabha 543 ↔ Assembly Constituencies ↔ Districts

**Version \`${CROSSWALK_VERSION}\` · generated ${generated.slice(0, 10)} · ${rows.length} parliamentary constituencies · ${acTotal} constituent-AC links · ${Object.entries(resTally).map(([k, v]) => `${v} ${k}`).join(" / ")}**

## Why this exists

The question *"which Assembly segments make up this Lok Sabha seat?"* has a
legal answer — Table B of the Election Commission's delimitation orders, the
**2008 Order** for most of the country, superseded by the **Assam order of 2023**
and the **Jammu & Kashmir order of 2022** — and no open, machine-readable one.
Two of those three are scanned gazettes with no text layer at all. The mapping
that *is* published in open geodata is wrong:
DataMeet's assembly-constituency shapefile carries a \`PC_NO\` attribute that
assigns up to **60 ACs to a single PC**, and its own README warns the boundaries
for six states are pre-delimitation. Reservation status (SC/ST) is wrong in
every source we checked, including the official Lok Sabha member API.

So Kaun parses the orders themselves, verifies them against independent geometry, and
publishes the result: deterministic, sourced, versioned, correctable — the same
playbook as the [Bengaluru ward crosswalk](../ward-crosswalk/METHODOLOGY.md).

## Sources

| Layer | Source | Licence | Used for |
|---|---|---|---|
| **AC↔PC composition (primary)** | ECI, *Delimitation of Parliamentary and Assembly Constituencies Order, 2008*, Tables A & B — [archive.org/details/delimitation-2008](https://archive.org/details/delimitation-2008) | Government of India publication | The authoritative AC list per PC, PC reservation, AC↔district, for every state except the two below |
| **Assam — current order** | *Assam Delimitation Order, 2023*, Table B — ECI Notification No. 282/AS/2023, Gazette of India Extraordinary Part II s.3(iii), **11 Aug 2023** ([CEO Assam mirror](https://ceoassam.nic.in/Final_Order_and_Notification.pdf)) | Government of India publication | The 14 Assam PCs and their 126 ACs — **supersedes the 2008 Order** |
| **Jammu & Kashmir — current order** | *J&K Delimitation Order, 2022*, Table B — Delimitation Commission Notification No. 282/J&K/2022 (Vol. IV), J&K Gazette Vol. 135 No. 5-2, **5 May 2022** ([DEO Anantnag mirror](https://cdn.s3waas.gov.in/s330ef30b64204a3088a26bc2e6ecf7602/uploads/2022/05/2022051069.pdf)) | Government of India publication | The 5 J&K PCs and their 90 ACs — **supersedes the 2008 Order** |
| PC polygons | [shijithpk/2024_maps_supplement](https://github.com/shijithpk/2024_maps_supplement) \`india_ls_seats_543.geojson\` | Unlicense | The 543-seat identity spine (ECI state/seat codes) + geometry |
| PC attributes | [DataMeet maps](https://github.com/datameet/maps) \`parliamentary-constituencies\` | CC0 (simplified attribute build) | Wikidata QID, Hindi name. \`pc_category\` recorded for comparison only — **not** trusted |
| AC polygons | DataMeet \`assembly-constituencies\` \`India_AC\` | CC-BY 2.5 IN | Spatial verification only. Its \`PC_NO\`/\`PC_NAME\` columns are **never read** |
| District polygons | DataMeet \`Districts/Census_2011\` (641 districts) | CC-BY 2.5 IN | Informational \`district_shares\` vector |

Bulk raw sources are **not committed** (100+ MB of shapefiles plus three
government PDFs). The builder reads a local copy; point it with
\`PC_CROSSWALK_SRC\`. This follows the ward-crosswalk precedent: \`data/\` carries
derived artifacts, never bulk upstream geodata.

**One deliberate exception.** The Assam-2023 and J&K-2022 gazettes are *scans
with no embedded text layer* — \`pdftotext\`/\`pdfjs\` return nothing — so their
Table B was transcribed by reading the rendered pages. Those two transcriptions
(10 KB) are committed under [\`sources/\`](sources/README.md), because without
them the builder cannot rebuild the 19 seats they govern. Everything else it
reads is parsed deterministically from a file anyone can re-download.

## Key contract

\`pc_no\` is **not** nationally unique — it restarts at 1 in every state and UT,
so \`pc_no = 1\` occurs 36 times across the 543 seats. The canonical key is
therefore

    pc_code = <st_code>-<pc_no>       e.g. 29-24  = Karnataka 24-Bangalore North
    ac_code = <st_code>-<ac_no>       e.g. 29-158 = Karnataka AC 158-Hebbal

shared with the Kaun India schema. \`st_code\` is the state code **the DataMeet
geo files carry**, read off each seat's matched DataMeet record so both sides of
the join derive the key from the same published value. Three notes on it:

- DataMeet uses \`36\` for Telangana and \`37\` for Andhra Pradesh. Neither is a
  strict Census-2011 code — Telangana did not exist in 2011 and 2011's code 28
  was undivided Andhra Pradesh. The published DataMeet value is used as-is
  rather than silently renormalised.
- **Ladakh is absent from DataMeet entirely** (still folded into Jammu &
  Kashmir), so it is assigned \`38\` here — the first free integer, chosen to
  avoid colliding with any DataMeet code. If the schema settles on a different
  value for Ladakh, change \`ST_CODE_FALLBACK\` in the builder and re-run.
- Dadra & Nagar Haveli and Daman & Diu merged into one UT in 2020 but keep two
  seats; each seat keeps its own DataMeet state code (26 and 25), so both
  \`pc_code\`s stay unique.

\`pc_code_datameet\` carries \`<st_code>-<pc_no>\` **as DataMeet numbers the seat**,
which differs from the current ECI numbering for Assam (renumbered in 2023) and
for the J&K/Ladakh split. Join on \`pc_code\` for current identity and on
\`pc_code_datameet\` when joining to a DataMeet-derived table.

## Method

**1 — Primary, textual (authoritative).** The Order is a 571-page two-column
PDF. Text is extracted with positions (\`pdfjs-dist\`), lines are rebuilt from
y-coordinates, and the two table columns are separated on an x threshold
**inferred per page** (the column geometry drifts between pages). For each of
the ${x.orderStates.length} state/UT schedules:

- **Table B** → one record per PC: number, name, \`(SC)\`/\`(ST)\` reservation, and
  the complete numbered list of constituent ACs. Separators in the Order are
  wildly inconsistent (\`1-Sirpur\`, \`4. Premnagar\`, \`1 Gummidipoondi\`,
  \`2—Mohanpur\`, \`48~Boko (SC)\`, \`01. MEKLIGANJ\`, and \`22Virugambakkam\` with no
  separator at all), so entries are split on *separator-followed-by-digit* and
  each token parsed. **Tokens that fail to parse are reported, never dropped.**
- **Table A** → \`<n> – DISTRICT : X\` headings give AC↔district, composed up to
  PC↔district (\`districts_order\`).
- PCs whose extent reads "the entire area of the State/UT" (Mizoram, Sikkim,
  Nagaland, Puducherry) are expanded to that state's full Table A AC list.

**2 — Later orders override the 2008 basis.** Two states were re-delimited after
2008, and for them the 2008 composition is **replaced wholesale, never merged**
— both renumbered their Assembly seats from scratch, so mixing the two vintages
would be worse than either alone. The 2008 AC→district index for those states is
dropped with the rows it described.

| State | Order applied | PCs | ACs |
|---|---|---|---|
| Assam | Assam Delimitation Order, 2023 (gazetted 11 Aug 2023) | 14 | 126 |
| Jammu & Kashmir | J&K Delimitation Order, 2022 (gazetted 5 May 2022) | 5 | 90 |

Each transcription is asserted against its own order's recitals *before* it is
allowed to override anything — seat counts, a gap-free non-duplicating AC
sequence, and the reserved-seat tallies the order itself recites. If any check
fails the override is refused, the 2008 basis is retained, and the run says so.

**3 — Normalisation to today's map.** The 2008 Order predates two changes that
move seats between states:

- **Andhra Pradesh Reorganisation Act, 2014.** The 2008 AP schedule numbers
  Telangana first (PCs 1–17, ACs 1–119) then residuary Andhra Pradesh (PCs
  18–42, ACs 120–294); both were renumbered from 1. The builder applies the
  offsets **and asserts them** — it checks that no Telangana-segment PC
  references an AC above 119 and no AP-segment PC references one below 120.
- **J&K Reorganisation Act, 2019.** The Order's J&K PC 4 (Ladakh) is today its
  own UT with one seat.

**4 — Verification, spatial (independent).** For every (PC, AC) link the builder
takes the AC polygon's interior point and tests which PC polygon contains it.
Agreement is reported per PC (\`ac_agreement\`) and nationally. This is a genuine
cross-check: the composition comes from text, the check comes from geometry, and
the two share no inputs.

**5 — District shares (informational).** Each PC's interior is sampled on a
26×26 grid and classified by 2011 Census district polygon, producing a full
share vector (\`district_shares\`, and \`district_shares_vector\` in the JSON) —
the same shape as the ward crosswalk's \`shares\`. No truncation.

## Verification results

Four independent checks run on every build. Each one prints every failure it
finds, and all of them are reproduced under *Builder warnings* below — nothing
is suppressed to make the numbers look better.

**Check 0 — the post-2008 transcriptions against their own orders.** Before
either current order is allowed to override the 2008 basis it must reproduce the
seat counts, a gap-free non-duplicating AC sequence, and the reserved-seat
tallies its own gazette recites (Assam 1 SC + 2 ST parliamentary and 9 SC + 19 ST
assembly seats; J&K 0 reserved parliamentary and 7 SC + 9 ST assembly seats).
A failure refuses the override rather than publishing it.

**Check 1 — completeness against the Order's own seat allocation.** Schedule I
("Allocation of Seats in House of People") is parsed from the 2008 PDF:
**${allocTotal} seats · ${allocSc} SC · ${allocSt} ST**. Every state's
Table B parse is asserted against it, and inside each state the constituent-AC
sets must partition the Assembly exactly — every AC in exactly one PC, none
missing, none doubled. Current status: **${acTotal} AC links, 0 unassigned,
0 double-assigned**.

**Check 2 — reservation against Schedule I.** SC/ST status is read off the
Order's own \`(SC)\`/\`(ST)\` tags and the per-state totals are compared with
Schedule I. Result: **${Object.entries(resTally).map(([k, v]) => `${k} ${v}`).join(" · ")}** — exact.

**Check 3 — spatial, independent of the text.**

| Metric | Value |
|---|---|
| Parliamentary constituencies | **${rows.length}** |
| Constituent-AC links | **${acTotal}** |
| AC links testable against polygons | ${totLocated} of ${totAc} (${(100 * totLocated / (totAc || 1)).toFixed(1)}%) |
| **Spatial agreement** | **${totAgree} / ${totLocated} = ${rate}%** |
| Disagreements recorded | ${disagreements.length} (all listed in \`verification_disagreements.csv\`) |

Per-PC verification tier:

| Tier | Seats | Meaning |
|---|---|---|
| \`verified\` | ${statusTally.verified || 0} | every locatable constituent AC lands inside this PC's polygon |
| \`mostly-verified\` | ${statusTally["mostly-verified"] || 0} | ≥70% do |
| \`divergent\` | ${statusTally.divergent || 0} | <70% do — **suspect the geometry, not the composition**: in every case examined the Order's text is the fixed point and the AC polygon set is the stale side |
| \`unverified\` | ${statusTally.unverified || 0} | no constituent AC could be located in the AC shapefile |
| \`districts-only\` | ${statusTally["districts-only"] || 0} | the Order defines the PC by district, not by AC (J&K, Ladakh) |
| \`no-assembly\` | ${statusTally["no-assembly"] || 0} | UT without a Legislative Assembly, so the seat has no ACs |

### Where the disagreements are, and why

| State/UT | Disagreements |
|---|---|
${disTable || "| — | 0 |"}

Disagreement is concentrated exactly where DataMeet's own README says its AC
boundaries are pre-2008-delimitation (J&K, Jharkhand, Assam, Manipur, Nagaland,
Arunachal Pradesh) and where the shapefile is administratively stale (Telangana
is still filed under Andhra Pradesh; the file has 4,182 features for ~4,120 real
seats, i.e. duplicates and historical entries). These are **AC-polygon**
problems, not composition problems — which is why the Order stays primary and
geometry stays advisory. Every disagreement is published rather than suppressed
so a reader can check the call.

### The 19 seats governed by a post-2008 order

| State | Order | PCs | ACs | AC links locatable | agree | rate |
|---|---|---|---|---|---|---|
${upgradedTable}

These are the seats that previously carried a "2008 basis, pending the newer
order" flag. Applying the real orders **raised the national agreement rate and
cut the disagreement count by more than a third** — Assam alone fell from 22
disagreements on the 2008 basis to ${disagreements.filter(d => d.pc.startsWith("Assam")).length}, and J&K went from
unverifiable (the 2008 Order describes it only by district) to
${disagreements.filter(d => d.pc.startsWith("Jammu")).length} across 90 ACs.

Read the *locatable* column with care: the AC polygon layer is DataMeet's
pre-delimitation set for both states, so only ACs whose name survived the
re-delimitation can be tested at all, and even those carry their **old**
boundary. The remaining handful of mismatches sit on that seam, compounded by
PC polygons that upstream georeferenced from ECI press-note images rather than
survey data. Neither layer is evidence against the gazetted composition.

A worked example of what a disagreement actually is: the Order gives Rajasthan
PC 8-Alwar the ACs 59, 60, 61, 62, 65, 66, 67, 68 — which is the current
Rajasthan numbering, verifiably (65 *is* Alwar Rural). Four of those polygons
nevertheless fall inside the neighbouring Bharatpur PC, because DataMeet's
Rajasthan AC layer carries 201 features for a 200-seat Assembly and is the
pre-2008 set. The composition is right; the polygons are old.

### Reservation status

Derived from the Order's own \`(SC)\`/\`(ST)\` tags, and for the ${rows.filter(r => r.reserved_source === "2008-delimitation-order-schedule-i").length} single-seat
Assembly-less UTs (which get no Table B row) from Schedule I. This **differs
from DataMeet's \`pc_category\` on ${dmDiff.length} seat(s)** — exactly the
2-seat ST undercount the source-recon flagged:

${dmDiff.length ? dmDiff.map(d => `- ${d.state_ut} ${d.pc_no}-${d.pc_name} — Order **${d.reserved_status}**, DataMeet \`${d.reserved_status_datameet}\``).join("\n") : "- (none)"}

### Errata in the Order's own printed text

The 2008 Order contains typographical errors in Table B. Each is corrected only
where **Table A of the same Order settles it beyond doubt** — the printed number
belongs to a different, already-assigned constituency and exactly one unassigned
AC carries the printed name. Every correction applied is listed here and carried
in the JSON as \`corrected_from\` on the AC:

${errataApplied.length ? errataApplied.map(e => `- ${e}`).join("\n") : "- (none)"}

Two further defects are layout artefacts, not text errors: the Order occasionally
prints a PC's extent one row *above* its vertically-centred name cell, which the
builder detects and undoes (Jharkhand 13→14, West Bengal 33→34).

## Known limitations

1. **No district mapping for Assam or Jammu & Kashmir.** Their AC↔district
   relation comes from each order's Table A, and only Table B was transcribed
   (for J&K the sourced gazette copy is missing most of Table A altogether).
   Those ${flagged.length - 1} rows therefore have an empty \`districts_order\` and rely on the
   spatial \`district_shares\` vector alone. The 2008 district mapping is **not**
   substituted, because both states renumbered their ACs — it would be wrong.
2. **J&K sub-AC detail is unavailable.** The sourced copy of Notification
   No. 282/J&K/2022 (Vol. IV) is a district-office bundle: Table B is complete,
   but Table A's ward/tehsil-level extent for most of the 90 ACs is not in it.
   Closing that needs a complete copy of the gazette — not required for this
   crosswalk, but it is the remaining gap on J&K.
3. **Ladakh remains on the 2008 basis.** It has no Legislative Assembly, so
   there are no ACs to map; the 2008 Order describes it by district and the
   2019 reorganisation only moved it out of J&K.
4. **Districts are 2011 Census vintage.** \`district_shares\` uses the 641-district
   2011 set; India now has 780+. \`districts_order\` uses the Order's own district
   names as on its stated reference dates. Neither is a current district list.
4. **Delhi has no district headings** in its Table A (ACs are described by
   municipal ward), so Delhi's \`districts_order\` is empty and only the spatial
   share vector is available.
5. **PC polygons for Assam/J&K/Ladakh are georeferenced from ECI press-note
   images**, not survey-grade (the upstream author's own caveat). International
   borders in particular are approximate.
6. **UTs without an Assembly** (Andaman & Nicobar, Chandigarh, Lakshadweep,
   Dadra & Nagar Haveli and Daman & Diu) have no constituent ACs by definition.
7. **A handful of Table A rows do not parse**, listed under builder warnings
   below. They cost only a district label on the ACs concerned — the AC↔PC
   composition comes from Table B, which parses completely (0 unassigned,
   0 doubled across all ${acTotal} links).
8. **Sikkim's Sangha seat** is elected state-wide by the monasteries and has no
   territorial extent, so Sikkim contributes 31 territorial ACs, not 32.

${warn.length ? `### Builder warnings this run\n\n${warn.map(w => `- ${w}`).join("\n")}\n` : ""}
## Corrections

This is a living dataset. To report an error open an issue at
\`github.com/kaun-city/kaun\` with label **\`pc-crosswalk\`**, citing the PC and AC
numbers and your source (ideally a gazette or ECI notification). Accepted
corrections bump \`version\` and are logged in this file's history.

## Files (all regenerated by \`scripts/india/build-pc-crosswalk.mjs\`)

- \`data/pc-crosswalk/india_pc_crosswalk.csv\` — 543 rows, one per PC, full AC list
- \`data/pc-crosswalk/india_pc_crosswalk.json\` — same + structured \`acs\`, district share vectors, provenance, caveats
- \`data/pc-crosswalk/pc_ac_pairs.csv|.json\` — long format, one row per PC↔AC link (${acTotal} rows)
- \`data/pc-crosswalk/verification_disagreements.csv\` — every spatial mismatch (${disagreements.length})
- \`data/pc-crosswalk/METHODOLOGY.md\` — this file
- \`data/pc-crosswalk/sources/\` — the two hand-transcribed current-order Table Bs
  (Assam 2023, J&K 2022) and their provenance. **Inputs, not outputs** — the only
  files here the builder reads rather than writes.
- \`wiki/docs/india/pc-crosswalk/*.{csv,json}\` — public download copies,
  **auto-written by the builder; never hand-edit** (kept in lockstep so a
  correction can't leave the published files stale).
`
}

main().catch(e => { console.error("FAILED:", e); process.exit(1) })
