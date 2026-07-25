/**
 * delimitation.mjs — pure parsing helpers for the Election Commission of
 * India's *Delimitation of Parliamentary and Assembly Constituencies Order,
 * 2008* (the legal definition of which Assembly Constituencies compose each
 * Parliamentary Constituency).
 *
 * No I/O, no globals — everything here is a pure function so it can be unit
 * tested (tests/delimitation-parser.test.mjs) and reused.
 *
 * The Order is a two-column PDF. Every state/UT gets a Schedule containing:
 *   TABLE A — one row per Assembly Constituency (AC), grouped under
 *             "<n> – DISTRICT : <NAME>" headings → gives AC↔district.
 *   TABLE B — one row per Parliamentary Constituency (PC): left column is
 *             "<no>-<NAME> (SC|ST)?", right column is the list of constituent
 *             ACs → gives PC↔AC. THIS IS THE GROUND TRUTH.
 *
 * Text is extracted with pdfjs-dist, which yields positioned items; the helpers
 * below rebuild lines from item y-coordinates and split the two table columns
 * on an x threshold inferred per page (column geometry drifts between pages).
 */

/** Group positioned text items into visual lines, top-to-bottom, left-to-right. */
export function groupLinesByY(items, tol = 2.5) {
  const rows = []
  for (const it of items) {
    let r = rows.find(r => Math.abs(r.y - it.y) <= tol)
    if (!r) { r = { y: it.y, items: [] }; rows.push(r) }
    r.items.push(it)
  }
  rows.sort((a, b) => b.y - a.y)
  for (const r of rows) r.items.sort((a, b) => a.x - b.x)
  return rows
}

/** Whole-line text (both columns), whitespace-collapsed. */
export const rowText = row =>
  row.items.map(i => i.s).join(" ").replace(/\s+/g, " ").trim()

/**
 * Infer the x that separates the narrow left column ("Sl. No. & Name") from
 * the wide right column ("Extent…") on one page.
 *
 * Both columns are left-aligned at a fixed x, so the x of each line's FIRST
 * item clusters on a few values: the left margin (rows that open a new entry),
 * sometimes a left sub-column (a wrapped name beside the number), and the right
 * margin (continuation rows). Only the right margin gets a continuation line for
 * every wrapped extent, so among the positions that have some line starting well
 * to their left it is the one that occurs most often.
 * Returns null when the page has no two-column structure.
 */
export function inferColumnSplit(rows, { minGap = 25 } = {}) {
  const freq = new Map()
  for (const r of rows) {
    if (!r.items.length) continue
    const k = Math.round(r.items[0].x)
    freq.set(k, (freq.get(k) || 0) + 1)
  }
  if (freq.size < 2) return null
  const xs = [...freq.keys()].sort((a, b) => a - b)
  // Continuation lines (a wrapped extent with no new entry beside it) always
  // begin exactly at the right column's margin, so among the start positions
  // that have some line starting well to their left, the right margin is the
  // one that occurs most often. Left-column sub-columns (a separate "name"
  // item beside the number) occur only on the few rows whose name wraps.
  let right = null, best = 0
  for (const x of xs) {
    const n = freq.get(x) || 0
    if (!xs.some(o => o <= x - minGap)) continue
    if (n > best || (n === best && right !== null && x < right)) { best = n; right = x }
  }
  return right === null ? null : right - 4     // just inside the right column
}

/** Split one line into its left-column and right-column text. */
export function splitRow(row, splitX) {
  const l = [], r = []
  for (const it of row.items) (it.x < splitX ? l : r).push(it)
  const join = arr => arr.map(i => i.s).join(" ").replace(/\s+/g, " ").trim()
  return { left: join(l), right: join(r) }
}

/**
 * Join wrapped right-column lines. A line that ends on a hyphen/dash is a
 * mid-token break ("19. DABGRAM-" + "FULBARI", "109—" + "Bihpuria") and must be
 * glued without a space; everything else gets one space.
 */
export function joinWrapped(lines) {
  let out = ""
  for (const raw of lines) {
    const s = raw.trim()
    if (!s) continue
    if (!out) { out = s; continue }
    out += /[-–—~]$/.test(out) ? s : " " + s
  }
  return out.replace(/\s+/g, " ").trim()
}

const RESERVED = /\(\s*(SC|ST)\s*\)?\s*$/i

/** "1-ADILABAD (ST)" / "2.ALIPURDUARS (ST)" / "8- SECUNDERABAD" → parts. */
export function parsePcHeading(text) {
  const m = String(text).trim().match(/^(\d{1,3})\s*[.\-–—~:]?\s*(.+)$/)
  if (!m) return null
  const no = parseInt(m[1], 10)
  let name = m[2].trim()
  let reserved = "GEN"
  const r = name.match(RESERVED)
  if (r) { reserved = r[1].toUpperCase(); name = name.slice(0, r.index).trim() }
  name = cleanName(name)
  if (!name) return null
  return { no, name, reserved }
}

/** "16 – DISTRICT : DAKSHIN BASTAR (DANTEWADA)" → {no, name}. */
export function parseDistrictHeading(text) {
  const m = String(text).trim()
    .match(/^(\d{1,3})\s*[–—\-]+\s*DISTRICT\s*[:\-–—]\s*(.+?)\.?$/i)
  if (!m) return null
  return { no: parseInt(m[1], 10), name: titleCase(cleanName(m[2])) }
}

/** true for a Table B extent that means "the whole state/UT is one PC". */
export const isWholeStateExtent = text =>
  /entire\s+area\s+of\s+the\s+(state|union\s+territory)/i.test(String(text))

/**
 * Parse a Table B extent string into its constituent Assembly Constituencies.
 *
 * The Order is wildly inconsistent about separators — "1-Sirpur", "4. Premnagar",
 * "1 Gummidipoondi", "2—Mohanpur", "48~Boko (SC)", "01. MEKLIGANJ (SC)" and even
 * "22Virugambakkam" (no separator at all) all occur. Entries are always
 * comma / semicolon / "and" separated and always START with the AC number, so
 * we split on a separator followed by a digit and parse each token.
 *
 * Returns { acs, unparsed } — tokens that do not parse are RETURNED, never
 * dropped, so the builder can report and investigate them.
 */
export function parseAcRefs(text) {
  const acs = [], unparsed = []
  let s = String(text).replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "")
  if (!s) return { acs, unparsed }
  // Split on a separator followed by an entry number — and also on a bare space
  // before a "<number><name>" run, because the Order regularly forgets the
  // separator ("23-Marcaim 24-Mormugao", "144-Manachanallur 145 Musiri").
  // `\band` without a closing \b: the Order also runs them together ("and102").
  // The junk class absorbs stray glyphs the PDF emits ("\206 Virudhunagar").
  const tokens = s.split(
    /\s*(?:,|;|\band|&)[\s\\/|~]*(?=\d)|\s+(?=[\\/|]?\d{1,3}\s*[-–—.,;]{0,2}\s*[A-Za-z])/i)
  for (const tok of tokens) {
    const t = tok.trim().replace(/^[^\dA-Za-z]+/, "").replace(/[.;,]+$/, "")
    if (!t) continue
    const m = t.match(/^(\d{1,3})\s*[.\-–—~:,]?\s*(.*)$/)
    if (!m || !m[2].trim()) { unparsed.push(t); continue }
    let name = m[2].trim()
    let reserved = "GEN"
    const r = name.match(RESERVED)
    if (r) { reserved = r[1].toUpperCase(); name = name.slice(0, r.index).trim() }
    name = cleanName(name)
    if (!name) { unparsed.push(t); continue }
    acs.push({ ac_no: parseInt(m[1], 10), ac_name: name, ac_reserved: reserved })
  }
  return { acs, unparsed }
}

/** Trim stray punctuation/pdf artefacts off a constituency or district name. */
export function cleanName(s) {
  return String(s)
    .replace(/\s+/g, " ")
    .replace(/^[\s.,:;~\-–—]+/, "")
    .replace(/[\s.,:;~]+$/, "")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s*\)\s*/g, ") ")
    .replace(/\s+/g, " ")
    .trim()
}

/** ALL CAPS → Title Case; leave mixed-case names alone. */
export function titleCase(s) {
  const str = String(s).trim()
  if (str !== str.toUpperCase()) return str
  return str.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
}

/** Aggressive normalisation for cross-source name matching. */
export function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
}
