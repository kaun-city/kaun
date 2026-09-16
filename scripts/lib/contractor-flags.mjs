/**
 * contractor-flags.mjs — the one place contractor_profiles.blacklist_flags
 * text is made, and the one name matcher that decides which firm gets it.
 *
 * A flag is printed next to a named firm on kaun.city, in the public data API
 * and on the wiki. So every flag must be:
 *   - one fact in neutral words: who did what, and when;
 *   - cited: it ends "(<publisher>, <d Mon yyyy>)";
 *   - in Kaun's money format: "₹4,721 Cr", never "Rs 4,700 crore".
 * checkFlag() tests all three and scripts/scrape-blacklists.mjs refuses to
 * write a flag that fails it.
 *
 * WHY THE MATCHER IS STRICT
 * The September 2026 review found flags on the wrong firms. The old matcher
 * treated "one normalised name contains the other" as a match with no length
 * floor, so a profile whose parsed name was just "L" matched "KRIDL" and one
 * named "N" matched "Karnataka Rural Infrastructure Development": two
 * one-contract firms were shown as blacklisted. Containment now has to land on
 * whole words, and the shorter name has to be distinctive on its own.
 */

// ---------------------------------------------------------------------------
// Documented cases. Every fact is from the cited report; nothing is inferred.
// ---------------------------------------------------------------------------

const DH_KRIDL_TURNOVER = {
  publisher: "Deccan Herald",
  date: "24 Jun 2020",
  url: "https://www.deccanherald.com/india/karnataka/rural-mandate-bengaluru-work-kridl-doubles-turnover-853373.html",
}
const DH_KRIDL_4G = {
  publisher: "Deccan Herald",
  date: "23 Sep 2020",
  url: "https://www.deccanherald.com/india/karnataka/bengaluru/a-4g-scam-in-bbmp-rs-4700-cr-projects-went-to-single-contractor-without-tendering-891623.html",
}

export function cite(fact, { publisher, date }) {
  return `${fact} (${publisher}, ${date})`
}

export const DOCUMENTED_CASES = [
  {
    id: "kridl",
    // Matched as whole-word phrases against a profile's name and aliases.
    names: ["KRIDL", "Karnataka Rural Infrastructure Development"],
    flags: [
      // DH 24 Jun 2020: "the BBMP had, in 2010, blacklisted the agency" and
      // "In October 2018, the social welfare department had blacklisted KRIDL".
      cite("Blacklisted by BBMP in 2010", DH_KRIDL_TURNOVER),
      cite("Blacklisted by Karnataka's Social Welfare Department in Oct 2018", DH_KRIDL_TURNOVER),
      // DH 23 Sep 2020 reports BNP's analysis of five years of BBMP projects
      // from 2015: "Projects worth Rs 4,721 crore were given to the KRIDL",
      // without tendering, under KTPP Act 4(g). The headline rounds to 4,700.
      cite("₹4,721 Cr of BBMP projects in 2015–20 given without tender under KTPP Act Section 4(g), per a Bengaluru NavaNirmana Party analysis", DH_KRIDL_4G),
    ],
    sources: [DH_KRIDL_TURNOVER.url, DH_KRIDL_4G.url],
  },
]

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** 2026-09-16 -> "16 Sep 2026" (the date format every citation uses). */
export function citeDate(d) {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "4700" / "4,700" / "111234.5" -> "4,700" / "1,11,234.5" (Indian grouping, decimals as written). */
function groupIndianDigits(raw) {
  const [int, dec] = raw.replace(/,/g, "").split(".")
  return `${Number(int).toLocaleString("en-IN")}${dec ? `.${dec}` : ""}`
}

const MONEY_WITH_UNIT = /(?:₹|\bRs\.?|\bINR)\s*(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?)\b\.?/gi
const MONEY_BARE = /(?:\bRs\.?|\bINR)\s*(\d[\d,]*(?:\.\d+)?)/gi

/** "Rs 4,700 crore" -> "₹4,700 Cr"; "Rs. 18.5 lakh" -> "₹18.5 L"; "Rs 4103" -> "₹4,103". */
export function normalizeMoney(text) {
  return String(text)
    .replace(MONEY_WITH_UNIT, (_, amount, unit) => `₹${groupIndianDigits(amount)} ${/^c/i.test(unit) ? "Cr" : "L"}`)
    .replace(MONEY_BARE, (_, amount) => `₹${groupIndianDigits(amount)}`)
}

export function normalizeFlag(text) {
  return normalizeMoney(text).replace(/\s+/g, " ").trim()
}

/** Words that argue rather than report. A flag states an action and its source. */
const EDITORIAL = /\b(scam|scandal|notorious|shoddy|brazen|mega|loot(?:ed|ing)?|fraud(?:ulent)?|despite|continued to|same as|infamous|corrupt(?:ion)?)\b/i
const CITATION = /\([^()]+, (?:retrieved )?\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\)$/

/** Problems with a flag string; an empty list means it may be published. */
export function checkFlag(flag) {
  const problems = []
  if (typeof flag !== "string" || !flag.trim()) return ["empty flag"]
  if (/\bRs\.?\s|\bINR\b|\bcrores?\b|\blakhs?\b|\blacs?\b/i.test(flag)) {
    problems.push("money is not in ₹ … Cr / ₹ … L form")
  }
  const editorial = EDITORIAL.exec(flag)
  if (editorial) problems.push(`editorial wording: "${editorial[0]}"`)
  if (!CITATION.test(flag)) problems.push('no "(publisher, d Mon yyyy)" citation at the end')
  if (flag.length > 240) problems.push("longer than 240 characters")
  return problems
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

/** Honorifics, legal forms and place words that say nothing about identity. */
const NOISE = /\b(M\/S|MS|MR|MRS|SMT|SRI|SHRI|PVT|LTD|LIMITED|PRIVATE|INDIA|BANGALORE|BENGALURU)\b/g

/** Trade words shared by thousands of unrelated firms. */
const GENERIC = new Set([
  "AND", "THE", "OF", "CO", "COMPANY", "CORPORATION", "GROUP", "ENTERPRISE", "ENTERPRISES",
  "CONSTRUCTION", "CONSTRUCTIONS", "CONTRACTOR", "CONTRACTORS", "ENGINEER", "ENGINEERS",
  "ENGINEERING", "ASSOCIATES", "TRADERS", "TRADING", "INFRA", "INFRASTRUCTURE", "PROJECTS",
  "SERVICES", "SOLUTIONS", "WORKS", "BUILDERS", "DEVELOPERS", "INDUSTRIES", "TECHNOLOGIES",
])

export function normalizeName(name) {
  if (!name) return ""
  return String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9\s/]/g, " ")
    .replace(NOISE, " ")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** A name that could identify one firm by itself: some non-generic word of 4+ characters. */
export function isDistinctive(normalized) {
  return normalized.split(" ").some(t => t.length >= 4 && !GENERIC.has(t))
}

/** Whole-word containment: "KRIDL" is in "KRIDL BHUSIRI ACCOU"; "L" is not in "KRIDL". */
export function containsPhrase(haystack, needle) {
  return Boolean(needle) && ` ${haystack} `.includes(` ${needle} `)
}

export const FUZZY_THRESHOLD = 0.4

/** 0 = same firm name, 1 = unrelated. Only distinctive names can ever score below 1. */
export function nameDistance(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 1
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (!isDistinctive(shorter)) return 1
  if (na === nb) return 0
  if (containsPhrase(longer, shorter)) return 0.1

  const meaningful = s => new Set(s.split(" ").filter(t => t.length > 2 && !GENERIC.has(t)))
  const ta = meaningful(na)
  const tb = meaningful(nb)
  if (!ta.size || !tb.size) return 1
  const shared = [...ta].filter(t => tb.has(t)).length
  return 1 - shared / new Set([...ta, ...tb]).size
}

function profileNames(profile) {
  return [profile.canonical_name, ...(profile.aliases ?? [])].filter(Boolean)
}

/**
 * The flags every profile should carry, given this run's sources.
 *
 * entries: [{ names: string[], flags: string[], match: "phrase" | "fuzzy" }]
 *   phrase — curated names; a profile matches when one of its names contains
 *            one of them as whole words (documented cases).
 *   fuzzy  — scraped list names; nameDistance() within FUZZY_THRESHOLD.
 */
export function desiredFlags(profiles, entries) {
  const out = new Map()
  for (const profile of profiles) {
    const names = profileNames(profile).map(normalizeName)
    const flags = []
    for (const entry of entries) {
      const hit = entry.match === "phrase"
        ? entry.names.some(n => names.some(own => containsPhrase(own, normalizeName(n))))
        : entry.names.some(n => profileNames(profile).some(own => nameDistance(n, own) <= FUZZY_THRESHOLD))
      if (!hit) continue
      for (const flag of entry.flags.map(normalizeFlag)) if (!flags.includes(flag)) flags.push(flag)
    }
    out.set(profile.entity_id, flags)
  }
  return out
}

/** Profiles whose stored flags differ from `desired` — additions, rewrites and removals alike. */
export function planFlagChanges(profiles, desired) {
  const changes = []
  for (const profile of profiles) {
    const before = profile.blacklist_flags ?? []
    const after = desired.get(profile.entity_id) ?? []
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    changes.push({
      entity_id: profile.entity_id,
      canonical_name: profile.canonical_name,
      total_contracts: profile.total_contracts ?? null,
      action: after.length === 0 ? "clear" : before.length === 0 ? "add" : "rewrite",
      before,
      after,
    })
  }
  return changes
}
