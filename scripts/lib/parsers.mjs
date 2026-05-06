/**
 * lib/parsers.mjs — small pure helpers used by multiple seed/refresh scripts.
 *
 * Pure functions, no I/O — safe to unit-test under Node's built-in test runner.
 *
 * Currently exports:
 *   - parseCsv(text)              quote/newline-aware CSV → array of arrays
 *   - extractContractor(raw)      "M/s ABC Co. 9876543210" → { name, phone }
 *   - extractACFromName(s)        "MLA-LAD AC Yelahanka 150" → "Yelahanka"
 */

/**
 * Parse a CSV string, respecting double-quoted fields (which may contain
 * commas and newlines). Returns an array of rows, each row being an array
 * of trimmed string fields. Tolerates \r\n and \n line endings.
 */
export function parseCsv(text) {
  const rows = []
  let inQuote = false
  let cur = ""
  let fields = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === "," && !inQuote) {
      fields.push(cur.trim()); cur = ""
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (cur.trim() || fields.length) {
        fields.push(cur.trim()); rows.push(fields); fields = []; cur = ""
      }
      if (ch === "\r" && text[i + 1] === "\n") i++
    } else {
      cur += ch
    }
  }
  if (cur.trim() || fields.length) { fields.push(cur.trim()); rows.push(fields) }
  return rows
}

const PHONE_RE = /(\d{10})$/
const PREFIX_RE = /^(M\/[Ss]\.?\s*|Sri\.?\s*|Smt\.?\s*)/

/**
 * Pull a contractor name + 10-digit phone out of a free-form string like
 *   "100234 M/s. ABC Constructions, 9876543210"
 *
 * Trims a leading 6-digit code, M/s/Sri/Smt prefix and any trailing punctuation.
 */
export function extractContractor(raw) {
  if (!raw) return { name: null, phone: null }
  let s = String(raw).trim()

  const phoneMatch = PHONE_RE.exec(s)
  const phone = phoneMatch ? phoneMatch[1] : null
  if (phone) s = s.slice(0, -10).trim()

  s = s.replace(/^\d{6}\s*/, "")
  s = s.replace(PREFIX_RE, "").trim()
  s = s.replace(/[.,/]+$/, "").trim()

  return { name: s || null, phone }
}

/**
 * Strip MyNeta-style suffixes from an AC name:
 *   "Yelahanka (150)" → "Yelahanka"
 *   "Visakhapatnam North (16)" → "Visakhapatnam North"
 */
export function stripAcNumber(s) {
  if (!s) return ""
  return String(s).replace(/\s*\(\d+\)\s*$/, "").trim()
}
