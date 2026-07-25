/**
 * xlsx.mjs — a minimal, dependency-free .xlsx reader.
 *
 * WHY THIS EXISTS RATHER THAN A LIBRARY
 * scripts/ in this repo has no node_modules and no package dependencies at all;
 * every adapter is plain Node. The Zenodo parliamentary-proceedings export
 * (DOI 10.5281/zenodo.18146342, CC BY 4.0) — the one bulk source that saves
 * thousands of paginated sansad.in requests — ships as .xlsx. An .xlsx is a ZIP
 * of XML, and Node's zlib can already inflate it, so reading one costs ~150
 * lines and keeps the zero-dependency property.
 *
 * SCOPE, deliberately narrow: read-only, cell values as strings/numbers, shared
 * strings, inline strings, and the sheet's own row/column addressing. No
 * formulas, no styles, no dates-as-serial conversion beyond what the caller
 * asks for. That is everything the Zenodo files need.
 */
import { inflateRawSync } from "zlib"
import { readFileSync } from "fs"

/* ------------------------------- ZIP reader ------------------------------ */

function u16(b, o) { return b.readUInt16LE(o) }
function u32(b, o) { return b.readUInt32LE(o) }

/** Locate the End Of Central Directory record (searching back over any comment). */
function findEocd(buf) {
  const max = Math.min(buf.length, 0xffff + 22)
  for (let i = buf.length - 22; i >= buf.length - max; i--) {
    if (i >= 0 && u32(buf, i) === 0x06054b50) return i
  }
  throw new Error("not a zip file (no end-of-central-directory record)")
}

/** name → Buffer for every entry in the archive. */
export function unzip(buf) {
  const eocd = findEocd(buf)
  const count = u16(buf, eocd + 10)
  let p = u32(buf, eocd + 16)
  const out = new Map()
  for (let i = 0; i < count; i++) {
    if (u32(buf, p) !== 0x02014b50) throw new Error("bad central directory header")
    const method = u16(buf, p + 10)
    const compSize = u32(buf, p + 20)
    const nameLen = u16(buf, p + 28)
    const extraLen = u16(buf, p + 30)
    const commentLen = u16(buf, p + 32)
    const localOffset = u32(buf, p + 42)
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen

    if (u32(buf, localOffset) !== 0x04034b50) throw new Error(`bad local header for ${name}`)
    const lNameLen = u16(buf, localOffset + 26)
    const lExtraLen = u16(buf, localOffset + 28)
    const start = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compSize)
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw))
  }
  return out
}

/* ------------------------------- XML bits -------------------------------- */

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }

export function unescapeXml(s) {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, m => ENTITIES[m])
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
          .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

/** sharedStrings.xml → array of strings (concatenating each <si>'s <t> runs). */
export function parseSharedStrings(xml) {
  if (!xml) return []
  const out = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let m
  while ((m = siRe.exec(xml))) {
    let s = ""
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
    let t
    while ((t = tRe.exec(m[1]))) s += unescapeXml(t[1])
    out.push(s)
  }
  return out
}

/** "BC12" → 54 (0-based column index). */
export function colIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? ""
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** sheet XML → array of row arrays (cells as strings, "" for blanks). */
export function parseSheet(xml, shared) {
  const rows = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  let r
  while ((r = rowRe.exec(xml))) {
    const cells = []
    const cRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g
    let c
    while ((c = cRe.exec(r[1]))) {
      const attrs = c[1] ?? ""
      const body = c[2] ?? ""
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n"
      let value = ""
      if (type === "inlineStr") {
        let t
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
        while ((t = tRe.exec(body))) value += unescapeXml(t[1])
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
        if (v != null) {
          value = type === "s" ? (shared[Number(v)] ?? "") : unescapeXml(v)
        }
      }
      const idx = ref ? colIndex(ref) : cells.length
      while (cells.length < idx) cells.push("")
      cells[idx] = value
    }
    rows.push(cells)
  }
  return rows
}

/* --------------------------------- API ----------------------------------- */

/** Sheet names in workbook order. */
export function sheetNames(zip) {
  const wb = zip.get("xl/workbook.xml")?.toString("utf8") ?? ""
  return [...wb.matchAll(/<sheet\b[^>]*name="([^"]+)"/g)].map(m => unescapeXml(m[1]))
}

/**
 * Read the first (or named) sheet of an .xlsx as objects keyed by its header
 * row. Blank trailing rows are dropped.
 */
export function readXlsx(pathOrBuffer, { sheet = 0 } = {}) {
  const buf = Buffer.isBuffer(pathOrBuffer) ? pathOrBuffer : readFileSync(pathOrBuffer)
  const zip = unzip(buf)
  const shared = parseSharedStrings(zip.get("xl/sharedStrings.xml")?.toString("utf8"))

  const names = sheetNames(zip)
  const wantIndex = typeof sheet === "number" ? sheet : Math.max(0, names.indexOf(sheet))
  const key = `xl/worksheets/sheet${wantIndex + 1}.xml`
  const xml = (zip.get(key) ?? zip.get("xl/worksheets/sheet1.xml"))?.toString("utf8")
  if (!xml) throw new Error(`no worksheet at ${key}`)

  const rows = parseSheet(xml, shared)
  if (!rows.length) return { sheet: names[wantIndex] ?? null, header: [], rows: [] }
  const header = rows[0].map(h => String(h).trim())
  const records = []
  for (const row of rows.slice(1)) {
    if (!row.some(v => String(v ?? "").trim() !== "")) continue
    const rec = {}
    header.forEach((h, i) => { if (h) rec[h] = row[i] ?? "" })
    records.push(rec)
  }
  return { sheet: names[wantIndex] ?? null, header, rows: records }
}
