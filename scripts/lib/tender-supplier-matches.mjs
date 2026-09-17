// Match Kaun's contractors (contractor_profiles, built from BBMP work orders)
// to the suppliers awarded tenders in blr-tenders-bids, by company name.
//
// Neither dataset has a registration number, so the only link is the name,
// and a wrong link would put one firm's tenders on another. So a contractor is
// matched only through a firm name that identifies one firm:
//   - It reads as a firm: it has a trade word such as CONSTRUCTIONS,
//     ENTERPRISES, INFRA or PVT LTD, or ends in one cut short by the
//     20-character limit of BBMP's work-order exports ("SAMRUDHI CONSTRUCTIO").
//     Personal names are never matched: "ANANDA KUMAR" wins 79 tenders in the
//     dataset, very likely as different people.
//   - It has a rare word: one used by at most RARE_WORD_MAX of the dataset's
//     2,433 firm names. On the 2026-08-21 snapshot BALAJI is in 11 and
//     MANJUNATHA in 17, while SAMRUDHI, TEJUS and NIKSHEP are in 1 to 3.
//   - KPPP never shows it for two different people. KPPP writes a winner as
//     "PERSON( COMPANY )"; 21 company names there belong to two or more
//     people ("SRI SAI CONSTRUCTIONS" to three).
//   - It equals the contractor's name once case, spacing, punctuation, "M/S"
//     and legal forms are ignored, or, when the contractor's name was cut at
//     20 characters, it is the only firm name beginning that way.

/** Words that make a name read as a firm, not a person. A cut-off last word counts if it begins one. */
export const TRADE_WORDS = [
  "CONSTRUCTION", "CONSTRUCTIONS", "ENTERPRISE", "ENTERPRISES", "ENGINEER", "ENGINEERS", "ENGINEERING",
  "ASSOCIATES", "TRADERS", "TRADING", "INFRA", "INFRASTRUCTURE", "INFRASTRUCTURES", "INFRATECH", "INFRAPROJECTS",
  "PROJECT", "PROJECTS", "SERVICES", "SOLUTIONS", "WORKS", "BUILDERS", "DEVELOPERS", "INDUSTRIES",
  "TECHNOLOGIES", "TECHNOCRATS", "CONSULTANTS", "CONSULTANCY", "CORPORATION", "COMPANY", "ELECTRICALS",
  "AGENCIES", "AGENCY", "SYSTEMS", "EQUIPMENTS", "ASPHALTS", "CRUSHERS", "CONTRACTORS", "PVT", "LTD",
  "LIMITED", "PRIVATE", "LLP",
]
const TRADE = new Set(TRADE_WORDS)
/** Honorific and legal-form words dropped before names are compared. */
const DROPPED = new Set(["MS", "PVT", "PRIVATE", "LTD", "LIMITED", "LLP", "FORMERLY", "KNOWN"])
/** Words too common to identify a firm, besides the trade words. */
const COMMON = new Set(["AND", "THE", "GROUP", "INDIA", "BANGALORE", "BENGALURU", "KARNATAKA"])

/** A word in at most this many of the dataset's firm names can identify a firm. */
export const RARE_WORD_MAX = 5
/** A name is cut off when it reaches the export's 20-character limit. */
export const TRUNCATED_LENGTH = 19
const MIN_EXACT = 6
const MIN_PREFIX = 12

/** procurement_tender_winners.supplier_key, computed the way the loader's SQL does. */
export function supplierKey(name) {
  return String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

/** A firm name's words, without punctuation, "M/S" or legal forms. */
export function firmWords(name) {
  let words = String(name ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  if (words[0] === "M" && words[1] === "S") words = words.slice(2)
  return words.filter(word => !DROPPED.has(word))
}

/** The name as compared: firm words run together. */
export function compactName(name) {
  return firmWords(name).join("")
}

/** Whether a name reads as a firm (see TRADE_WORDS). */
export function isCompanyName(name) {
  const raw = String(name ?? "").trim()
  const words = raw.toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  if (words.some(word => TRADE.has(word))) return true
  // BBMP's exports cut names at 20 characters, often mid-word: "SRI CHOWDESHWARI ENT".
  const last = words.at(-1)
  return raw.length >= TRUNCATED_LENGTH && !!last && last.length >= 3 && TRADE_WORDS.some(word => word.length > last.length && word.startsWith(last))
}

/** The company in KPPP's "PERSON( COMPANY )", with the person; null for any other name. */
export function personAndCompany(name) {
  const parts = String(name).match(/^(.*?)\(\s*(.*?)\s*\)\s*$/)
  return parts ? { person: parts[1].trim(), company: parts[2] } : null
}

/**
 * Index the dataset's firm names.
 * rows: [{ awarded_bidders: string[] }] (procurement_tenders rows)
 * Returns { byName: Map<compact firm name, Set<supplier_key> | null>, names: sorted compact names }.
 * A firm name that doesn't identify one firm (see the top of this file) maps to
 * null: it matches nothing, and it still makes a cut-off name that begins it
 * ambiguous.
 */
export function indexWinners(rows) {
  const firms = new Map() // compact -> { words, keys, people }
  for (const row of rows) {
    for (const winner of row.awarded_bidders ?? []) {
      const pair = personAndCompany(winner)
      const name = pair ? pair.company : winner
      if (!isCompanyName(name)) continue
      const compact = compactName(name)
      if (compact.length < MIN_EXACT) continue
      if (!firms.has(compact)) firms.set(compact, { words: new Set(firmWords(name)), keys: new Set(), people: new Set() })
      const firm = firms.get(compact)
      firm.keys.add(supplierKey(winner))
      if (pair) firm.people.add(compactName(pair.person))
    }
  }

  const firmsUsing = new Map()
  for (const { words } of firms.values()) {
    for (const word of words) firmsUsing.set(word, (firmsUsing.get(word) ?? 0) + 1)
  }
  const identifies = firm =>
    firm.people.size <= 1 &&
    [...firm.words].some(word => word.length >= 4 && !TRADE.has(word) && !COMMON.has(word) && firmsUsing.get(word) <= RARE_WORD_MAX)

  const byName = new Map()
  for (const [compact, firm] of firms) byName.set(compact, identifies(firm) ? firm.keys : null)
  return { byName, names: [...byName.keys()].sort() }
}

function namesStartingWith(sortedNames, prefix) {
  let low = 0
  let high = sortedNames.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (sortedNames[mid] < prefix) low = mid + 1
    else high = mid
  }
  const found = []
  for (let i = low; i < sortedNames.length && sortedNames[i].startsWith(prefix); i++) found.push(sortedNames[i])
  return found
}

/**
 * Match contractors to winners.
 * profiles: [{ id, canonical_name, aliases }]
 * Returns contractor_supplier_matches rows:
 *   { contractor_profile_id, supplier_key, matched_name, match_kind: "exact" | "truncated" }
 */
export function matchContractors(profiles, index) {
  const matches = new Map()
  for (const profile of profiles) {
    const names = [...new Set([profile.canonical_name, ...(profile.aliases ?? [])].filter(Boolean))]
    for (const name of names) {
      if (!isCompanyName(name)) continue
      const compact = compactName(name)
      if (compact.length < MIN_EXACT) continue

      let keys = null
      let kind = "exact"
      if (index.byName.has(compact)) {
        keys = index.byName.get(compact)
      } else if (String(name).trim().length >= TRUNCATED_LENGTH && compact.length >= MIN_PREFIX) {
        const candidates = namesStartingWith(index.names, compact)
        // Only an unambiguous beginning: two firms starting the same way match
        // neither, and neither does one that can't be told apart from others.
        // "…CONSTRUCTION" and "…CONSTRUCTIONS" are one firm.
        const oneFirm = new Set(candidates.map(candidate => candidate.replace(/S$/, ""))).size === 1
        if (oneFirm && candidates.every(candidate => index.byName.get(candidate))) {
          keys = new Set(candidates.flatMap(candidate => [...index.byName.get(candidate)]))
          kind = "truncated"
        }
      }
      for (const key of keys ?? []) {
        const id = `${profile.id} ${key}`
        // An exact match through any name beats a cut-off one.
        if (!matches.has(id) || (kind === "exact" && matches.get(id).match_kind !== "exact")) {
          matches.set(id, { contractor_profile_id: profile.id, supplier_key: key, matched_name: name, match_kind: kind })
        }
      }
    }
  }
  return [...matches.values()].sort((a, b) => a.contractor_profile_id - b.contractor_profile_id || a.supplier_key.localeCompare(b.supplier_key))
}
