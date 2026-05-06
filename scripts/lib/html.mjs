/**
 * lib/html.mjs — small HTML/JSON extraction helpers shared by adapters.
 *
 * Pure functions, no I/O — safe to unit-test.
 *
 * Used by:
 *   - adapters/upyog.mjs       (CDMA Open Portal dashboards)
 *   - adapters/ap-eproc.mjs    (AP e-Procurement awarded tender tables)
 *   - any future adapter that scrapes embedded-state pages or HTML tables
 */

/**
 * Extract embedded JSON from a `<script>window.__VAR__ = {...};</script>` blob.
 * Returns null when the variable is absent or the JSON doesn't parse.
 *
 * Robust to whitespace and to assignments that span multiple lines, but
 * intentionally non-recursive: it picks the first balanced object literal it
 * sees after the equals sign.
 */
export function extractEmbeddedState(html, varName = "__INITIAL_STATE__") {
  const re = new RegExp(`window\\.${varName}\\s*=\\s*(\\{[\\s\\S]*?\\});`, "m")
  const m = re.exec(html)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

/**
 * Find the first <table> matching `tableSelectorRegex` and parse it into an
 * array of objects keyed by header (<th>) text. Cells whose count doesn't
 * match the header count are skipped.
 */
export function parseHtmlTable(html, tableSelectorRegex) {
  const tableMatch = tableSelectorRegex.exec(html)
  if (!tableMatch) return []
  const tableHtml = tableMatch[0]

  const headers = []
  const headerRe = /<th[^>]*>([\s\S]*?)<\/th>/gi
  let m
  while ((m = headerRe.exec(tableHtml)) !== null) {
    headers.push(m[1].replace(/<[^>]+>/g, "").trim())
  }

  const rows = []
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rm
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    const cells = []
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let cm
    while ((cm = cellRe.exec(rm[1])) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, "").trim())
    }
    if (cells.length === headers.length && cells.length > 0) {
      const row = {}
      for (let i = 0; i < headers.length; i++) row[headers[i]] = cells[i]
      rows.push(row)
    }
  }
  return rows
}

/**
 * Header-aware variant of parseHtmlTable used by AP eProc — the awarded
 * tenders table puts headers and rows in the same <tbody>, so we treat the
 * first <th>-bearing <tr> as the header row and subsequent <tr> rows as data.
 */
export function extractTableByClass(html, classRegex) {
  const tableRe = new RegExp(`<table[^>]*${classRegex.source}[^>]*>([\\s\\S]*?)<\\/table>`, "i")
  const tableMatch = tableRe.exec(html)
  if (!tableMatch) return []

  const tableBody = tableMatch[1]
  const rows = []
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rm
  let headers = null

  while ((rm = rowRe.exec(tableBody)) !== null) {
    const rowHtml = rm[1]
    if (!headers) {
      const heads = []
      const hRe = /<th[^>]*>([\s\S]*?)<\/th>/gi
      let hm
      while ((hm = hRe.exec(rowHtml)) !== null) {
        heads.push(hm[1].replace(/<[^>]+>/g, "").trim())
      }
      if (heads.length > 0) { headers = heads; continue }
    }
    const cells = []
    const cRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let cm
    while ((cm = cRe.exec(rowHtml)) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, "").trim())
    }
    if (headers && cells.length === headers.length) {
      const row = {}
      for (let i = 0; i < headers.length; i++) row[headers[i]] = cells[i]
      rows.push(row)
    }
  }
  return rows
}
