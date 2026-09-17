#!/usr/bin/env node
/**
 * myneta-affidavits.mjs — populates in_mp_affidavits from myneta.info (ADR).
 *
 * Usage:
 *   node scripts/india/myneta-affidavits.mjs                 # dry run, all 543
 *   node scripts/india/myneta-affidavits.mjs --limit 10      # bounded sample
 *   node scripts/india/myneta-affidavits.mjs --state KARNATAKA
 *   node scripts/india/myneta-affidavits.mjs --apply
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   (or KAUN_LOCAL_PG for local testing)
 *
 * v1 SCOPE: Lok Sabha 2024 WINNERS only. Losing candidates' affidavits are on
 * the same pages if they are ever wanted; nothing on kaun.city shows them, and
 * scraping ~8,000 extra pages for data no surface renders is not a polite use
 * of a volunteer-run site.
 *
 * Static per election (LS2024 does not change until LS2029 apart from bypolls),
 * so this is manual-dispatch, never a cron.
 *
 * FIELD SCOPE mirrors what kaun.city already shows for MLAs — criminal cases
 * (WardCard's headline trigger and the map-layer choropleth), age, profession,
 * education, and declared net worth over time (the "Net-worth growth (term)"
 * row on ward wiki pages). in_mp_affidavits stores money in whole rupees as
 * bigint rather than the lossy crore figure elected_reps carries.
 *
 * THE JOIN IS THE WHOLE PROBLEM. MyNeta shares no identifier with sansad.in,
 * PRS or eSAKSHI. Its constituency_id is MyNeta-internal — Bangalore Central is
 * MyNeta 185 but ECI PC 25. The permitted resolution path, in order:
 *   1. in_pc_source_aliases (source='myneta', source_key=constituency_id).
 *   2. The structural constraint: exactly one WINNER per seat on each side.
 *      Resolve the seat by exact normalized name within the state, then
 *      corroborate against the roster member who filed it (party must agree).
 *      That is the sitting member only when the seat has had no by-election;
 *      see lib/affidavit-member.mjs.
 *   3. A human, recorded with match_method='manual_reviewed'.
 * Anything else stays needs_review=true, which the RLS policy
 * in_mp_affidavits_anon_read_matched keeps out of public reads. The
 * one-winner-per-PC partial unique index makes a bad join fail at INSERT.
 * match_method's CHECK list has no fuzzy option — by design.
 *
 * A resolved seat with NO corroborating in_mps row (because the roster has not
 * been loaded yet) is written with needs_review=true, not false. The public
 * read path stays closed until a human or a later run clears it.
 *
 * SCRAPE TRAPS ALREADY PAID FOR
 *   - Scrape candidate.php DETAIL pages, never the show_candidates LIST page:
 *     on the list page the winner's assets/liabilities are rendered as an
 *     <img> (image_v2.php), which is anti-scraping, and only for the top row.
 *     Verified still true on 2026-07-26.
 *   - Zero criminal cases produces NO text at all — the whole Crime-O-Meter
 *     widget is omitted rather than showing "0". `extract(...) ?? null` would
 *     mark every clean candidate as unknown. This parser writes an explicit 0
 *     when the page parsed cleanly; in_mp_affidavits_cases_explicit enforces it.
 *   - robots.txt only disallows ?printer=true / ?print=true. Nothing here
 *     touches those; requests are 2.5s apart, cached on disk, Kaun-identified.
 *   - The whole state→constituency map is on ONE page (myneta.info/LokSabha2024/),
 *     so discovery costs a single request rather than 36.
 */
import { openSink } from "./lib/sink.mjs"
import { politeFetch } from "./lib/http.mjs"
import { loadPcReference, loadAliases, aliasCandidate } from "./lib/pc-reference.mjs"
import { opt, intOpt, banner, run } from "./lib/cli.mjs"
import { affidavitOwner, loadAffidavitOwners } from "./lib/affidavit-member.mjs"
import { LS_TERM } from "./sansad-roster.mjs"

const LOADER = "myneta-affidavits"
const ELECTION = "LokSabha2024"
const BASE = `https://myneta.info/${ELECTION}`
const REQUEST_DELAY_MS = 2500

/** Permitted match methods, mirroring in_mp_affidavits_match_method_chk.
 *  There is deliberately no fuzzy/similarity option. */
export const MATCH_METHODS = ["alias_table", "one_winner_per_pc", "manual_reviewed"]

/* -------------------------------------------------------------------------- */
/* pure parsers — exported and unit-tested against fixtures                    */
/* -------------------------------------------------------------------------- */

const NBSP = /(&nbsp;| )/g

export function text(s) {
  if (s == null) return null
  const t = String(s).replace(NBSP, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  return t === "" ? null : t
}

/** "Rs&nbsp;81,30,65,207" / "Rs75,55,29,306" / "Nil" → 813065207 | null.
 *  Whole rupees, lossless — the surface layer renders crore. */
export function parseRupees(s) {
  if (s == null) return null
  const t = String(s).replace(NBSP, " ")
  const m = /Rs\.?\s*([\d,]+)/i.exec(t) ?? /^\s*([\d,]{4,})\s*$/.exec(t)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

/**
 * The state → constituency map, straight off the LokSabha2024 landing page.
 * Each state is a dropdown whose button text is the state name and whose items
 * are `index.php?action=show_candidates&constituency_id=N` links.
 */
export function parseConstituencyIndex(html) {
  const out = []
  const blocks = html.split(/class='w3-dropdown-click w3-block'/i).slice(1)
  for (const block of blocks) {
    const stateM = /<button[^>]*dropbtnJS[^>]*>([\s\S]*?)<span/i.exec(block)
    const state = text(stateM?.[1])
    if (!state) continue
    const re = /href=["']?index\.php\?action=show_candidates&constituency_id=(\d+)["']?[^>]*>([\s\S]*?)<\/a>/gi
    let m
    while ((m = re.exec(block))) {
      const label = text(m[2])
      if (!label) continue
      out.push({ state, myneta_constituency_id: Number(m[1]), constituency_label: label })
    }
  }
  return out
}

/**
 * Winner row off a show_candidates page. The winner is the one whose anchor is
 * followed by a green "Winner" marker. Assets/liabilities on this page are
 * images — deliberately not read here.
 */
export function parseWinnerFromList(html) {
  const re = /<a\s+href=["']?candidate\.php\?candidate_id=(\d+)["']?[^>]*>([\s\S]*?)<\/a>([\s\S]{0,260})/gi
  let m
  while ((m = re.exec(html))) {
    if (!/<font[^>]*color=['"]?green[^>]*>\s*Winner\s*<\/font>/i.test(m[3])) continue
    const partyM = /<td>\s*([^<]{1,80}?)\s*<\/td>/i.exec(m[3])
    return {
      myneta_candidate_id: Number(m[1]),
      candidate_name: text(m[2]),
      party_abbr: text(partyM?.[1]),
    }
  }
  return null
}

/**
 * Peel the trailing balanced "(…)" group off a string, scanning from the end
 * so nested parens inside the group survive.
 *
 *   "P C Mohan(Bharatiya Janata Party(BJP))" → { before: "P C Mohan",
 *                                                inner: "Bharatiya Janata Party(BJP)" }
 *   "NORTH WEST DELHI (SC)(DELHI (NCT))"     → { before: "NORTH WEST DELHI (SC)",
 *                                                inner: "DELHI (NCT)" }
 *
 * Same balanced-scanner idea as the MoSPI parser's agency-name handling: a
 * regex cannot do this, and every attempt to fake it splits in the wrong place.
 */
export function peelTrailingParens(s) {
  const str = String(s ?? "").trim()
  if (!str.endsWith(")")) return { before: str, inner: null }
  let depth = 0
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === ")") depth++
    else if (str[i] === "(") {
      depth--
      if (depth === 0) {
        return {
          before: str.slice(0, i).trim(),
          inner: str.slice(i + 1, str.length - 1).trim(),
        }
      }
    }
  }
  return { before: str, inner: null }   // unbalanced — leave it alone
}

/**
 * Is a trailing parenthesised group a party ABBREVIATION, or part of the
 * party's actual name?
 *
 *   "Bharatiya Janata Party(BJP)"                 → BJP is an abbreviation
 *   "ShivSena (Uddhav Balasaheb Thackeray)"       → a faction name, NOT an abbr
 *   "Lok Janshakti Party(Ram Vilas)"              → a faction name, NOT an abbr
 *
 * An abbreviation is short and unspaced. Getting this wrong is not cosmetic:
 * it previously produced party_full="ShivSena", party_abbr="Uddhav Balasaheb
 * Thackeray" and turned every Shiv Sena (UBT) seat into a false party conflict.
 */
export function looksLikeAbbreviation(s) {
  const v = String(s ?? "").trim()
  if (!v || v.length > 12) return false
  if (/\s/.test(v)) return false
  return /^[A-Za-z0-9&.()\-/]+$/.test(v)
}

/** "P C Mohan(Bharatiya Janata Party(BJP)):Constituency- BANGALORE CENTRAL(KARNATAKA) - …" */
export function parseTitle(html) {
  const t = text(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1])
  if (!t) return {}
  const marker = ":Constituency-"
  const split = t.indexOf(marker)
  if (split === -1) return { title_tag: t }

  // Everything after the marker, minus the trailing
  // " - Affidavit Information of Candidate:" tail.
  let seatPart = t.slice(split + marker.length)
  const tail = seatPart.lastIndexOf(" - ")
  if (tail !== -1) seatPart = seatPart.slice(0, tail)

  const name = peelTrailingParens(t.slice(0, split))
  const seat = peelTrailingParens(seatPart)

  let partyFull = name.inner
  let partyAbbr = null
  if (partyFull) {
    const party = peelTrailingParens(partyFull)
    // Only treat the trailing group as an abbreviation when it looks like one;
    // otherwise it is part of the party's name and stays in party_full.
    if (party.inner && looksLikeAbbreviation(party.inner)) {
      partyFull = party.before || partyFull
      partyAbbr = party.inner
    }
  }

  return {
    title_tag: t,
    candidate_name: name.before || null,
    party_full: partyFull || null,
    party_abbr: partyAbbr,
    constituency_label: seat.before || null,
    state_label: seat.inner || null,
  }
}

/**
 * The whole candidate detail page → the in_mp_affidavits field set.
 *
 * criminal_cases is the load-bearing one: a candidate with zero declared cases
 * has NO "Number of Criminal Cases" text at all, so absence means 0 on a page
 * that otherwise parsed. It is only null when the page did not parse.
 */
export function parseCandidateDetail(html) {
  const parsed = { ...parseTitle(html) }
  const grab = (re, group = 1) => text(re.exec(html)?.[group])

  const ageRaw = grab(/<b>\s*Age:\s*<\/b>\s*([^<]+)/i)
  const ageNum = ageRaw ? Number.parseInt(ageRaw, 10) : NaN
  parsed.age = Number.isFinite(ageNum) ? ageNum : null

  parsed.self_profession = grab(/<b>\s*Self Profession:\s*<\/b>\s*([^<]*)/i)
  parsed.spouse_profession = grab(/<b>\s*Spouse Profession:\s*<\/b>\s*([^<]*)/i)

  const edu = /<h3>\s*Educational Details\s*<\/h3>([\s\S]{0,800}?)<\/div>/i.exec(html)?.[1] ?? ""
  parsed.education_category = text(/Category:\s*([^<]*)/i.exec(edu)?.[1])
  parsed.education_detail = text(edu.replace(/[\s\S]*Category:[^<]*<br\s*\/?>/i, ""))

  parsed.total_assets_inr = parseRupees(
    /<td>\s*Assets:\s*<\/td>\s*<td>\s*<b>([\s\S]*?)<\/b>/i.exec(html)?.[1])
  parsed.liabilities_inr = parseRupees(
    /<td>\s*Liabilities:\s*<\/td>\s*<td>\s*<b>([\s\S]*?)<\/b>/i.exec(html)?.[1])

  // ABSENCE MEANS ZERO. See the header note.
  const casesM = /Number of Criminal Cases:\s*<span[^>]*>\s*(\d+)/i.exec(html)
  parsed.criminal_cases = casesM ? Number(casesM[1]) : 0

  parsed.criminal_cases_detail = parseCriminalCharges(html)
  parsed.declared_assets_history = parseOtherElections(html)

  // A page that yielded neither a name nor a money figure did not parse.
  parsed.parse_status =
    parsed.candidate_name && (parsed.total_assets_inr !== null || parsed.liabilities_inr !== null)
      ? "ok"
      : (parsed.candidate_name ? "partial" : "failed")
  if (parsed.parse_status === "failed") parsed.criminal_cases = null
  return parsed
}

/** "Brief Details of IPC / BNS" → [{ count, charge }]. */
export function parseCriminalCharges(html) {
  const section = /Brief Details of IPC[\s\S]{0,120}?<ul>([\s\S]*?)<\/ul>/i.exec(html)?.[1]
  if (!section) return null
  const out = []
  const re = /<li>\s*<span[^>]*>\s*<b>\s*(\d+)\s*<\/span>([\s\S]*?)(?=<li>|$)/gi
  let m
  while ((m = re.exec(section))) {
    const charge = text(m[2])
    if (charge) out.push({ count: Number(m[1]), charge })
  }
  return out.length ? out : null
}

/** The "Other Elections" table → the declared-net-worth trend. */
export function parseOtherElections(html) {
  const table = /<th colspan=3>\s*Other Elections\s*<\/th>([\s\S]*?)<\/table>/i.exec(html)?.[1]
  if (!table) return null
  const out = []
  const re = /<tr>\s*<td><b>([^<]+)<\/b><\/td>\s*<td><b>([\s\S]*?)<\/b>[\s\S]*?<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/gi
  let m
  while ((m = re.exec(table))) {
    const cases = Number.parseInt(text(m[3]) ?? "", 10)
    out.push({
      election: text(m[1]),
      declared_assets_inr: parseRupees(m[2]),
      declared_cases: Number.isFinite(cases) ? cases : null,
    })
  }
  return out.length ? out : null
}

/* ------------------------------------------------------------------------- */
/* Repeated elections in the history                                          */
/* ------------------------------------------------------------------------- */
// "Other Elections" can list one election more than once, with different
// figures and nothing to tell the rows apart: MyNeta files a candidate's
// declaration for each seat they contested, and a by-election held during a
// term, under the same election label (Eatala Rajender: "Telangana 2018" for
// Huzurabad and for the Huzurabad by-election of 30-10-2021). 21 of 543 LS2024
// winners have such a repeat. MyNeta's compare page for the same person names
// each declaration's seat; these functions carry that across where it is
// unambiguous and leave the row unlabelled where it is not.

/** Election labels compare equal across MyNeta's spellings ("Loksabha 2014" = "Lok Sabha 2014" = "LokSabha2014"). */
export function electionKey(label) {
  return String(label ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Election keys that occur more than once across this affidavit's own election and its history. */
export function repeatedElections(election, history) {
  const counts = new Map()
  for (const label of [election, ...(history ?? []).map(h => h.election)]) {
    const k = electionKey(label)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k))
}

/** The candidate page's "Click here for more details" link: MyNeta's comparison of every declaration it holds for this person. */
export function compareProfileUrl(html) {
  const id = /compare_profile\.php\?group_id=([A-Za-z0-9_-]+)/i.exec(html ?? "")?.[1]
  return id ? `https://myneta.info/compare_profile.php?group_id=${id}` : null
}

const BY_ELECTION = /\s*:\s*bye[\s-]*election\b[\s\S]*$/i

/**
 * The compare page -> one row per declaration.
 * Columns: Name (link "X in <election>"), Constituency, Age, Party, Criminal
 * Cases (Yes/No), Number of Cases, Education, Total Assets, Liabilities, PAN.
 */
export function parseCompareProfiles(html) {
  const table = /<table class='w3-table w3-bordered'>([\s\S]*?)<\/table>/i.exec(html ?? "")?.[1]
  if (!table) return []
  const out = []
  for (const tr of table.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1])
    if (cells.length < 8) continue
    const link = /<a href='([^']+)'[^>]*>([\s\S]*?)<\/a>/i.exec(cells[0])
    if (!link) continue
    const seat = text(cells[1]) ?? ""
    const cases = text(cells[5])
    const assets = text(cells[7].split(/<br/i)[0])
    out.push({
      election: / in (.+)$/.exec(text(link[2]) ?? "")?.[1]?.trim() ?? null,
      constituency: seat.replace(BY_ELECTION, "").trim() || null,
      by_election: BY_ELECTION.test(seat),
      profile_url: new URL(link[1], "https://myneta.info/").href,
      declared_cases: cases && /^\d+$/.test(cases) ? Number(cases) : null,
      declared_assets_inr: assets && /^\d[\d,]*$/.test(assets) ? Number(assets.replace(/,/g, "")) : null,
    })
  }
  return out
}

/**
 * Label repeated-election rows with the seat MyNeta filed them under.
 *
 * A history row is matched to compare-page rows of the same person with the
 * same election AND the same declared assets and cases, excluding this
 * affidavit's own row. Rows sharing those figures are identical, so pairing
 * them in order keeps every label true, with each compare row used once:
 *   - as many compare rows as history rows: all labelled;
 *   - fewer (the compare page omits some declarations — Somanna's two
 *     identical "Karnataka 2023" rows, only Varuna listed): that many
 *     labelled, the rest left unlabelled;
 *   - more than history rows: none labelled, since a row could be either seat;
 *   - none (Shatrughan Sinha's second "Lok Sabha 2019"): unlabelled.
 * Figures and order are never changed.
 */
export function annotateRepeatedNominations(history, profiles, { election, profileUrl } = {}) {
  if (!Array.isArray(history) || history.length === 0) return history
  const repeated = repeatedElections(election, history)
  if (repeated.size === 0) return history

  const own = String(profileUrl ?? "").toLowerCase()
  const figures = r => `${electionKey(r.election)}|${r.declared_assets_inr}|${r.declared_cases}`
  const available = new Map()
  for (const p of profiles ?? []) {
    if (!p.election || String(p.profile_url).toLowerCase() === own) continue
    const k = figures(p)
    available.set(k, [...(available.get(k) ?? []), p])
  }
  const wanted = new Map()
  for (const h of history) {
    if (repeated.has(electionKey(h.election))) wanted.set(figures(h), (wanted.get(figures(h)) ?? 0) + 1)
  }

  const taken = new Map()
  return history.map(h => {
    if (!repeated.has(electionKey(h.election))) return h
    const k = figures(h)
    const matches = available.get(k) ?? []
    if (matches.length === 0 || matches.length > wanted.get(k)) return h
    const i = taken.get(k) ?? 0
    if (i >= matches.length) return h
    taken.set(k, i + 1)
    const p = matches[i]
    return { ...h, constituency: p.constituency, by_election: p.by_election, profile_url: p.profile_url }
  })
}

const IND_ALIASES = new Set(["IND", "INDEPENDENT", "INDEPENDENTS"])

/**
 * Every party label a source offers, normalized to alphanumerics — which also
 * absorbs the en-dash/hyphen and spacing differences between the two sites.
 */
export function partyLabels(...labels) {
  const out = new Set()
  for (const l of labels) {
    const n = String(l ?? "")
      .toUpperCase()
      .replace(/&/g, " AND ")          // "Jammu & Kashmir" ≡ "Jammu and Kashmir"
      .split(/[^A-Z0-9]+/)
      .filter(t => t && t !== "AND")   // the connector is house style, nothing more
      .join("")
    if (n) out.add(IND_ALIASES.has(n) ? "IND" : n)
  }
  return out
}

/**
 * Party comparison for the structural check — COMPARE LIKE WITH LIKE.
 *
 * MyNeta and sansad each publish an abbreviation AND a full name, but they do
 * not agree on which goes where: MyNeta's list page shows "Nationalist Congress
 * Party – Sharadchandra Pawar" where sansad's partySname is "NCPSP", and
 * sansad's partySname is itself sometimes a long name ("YSR Congress Party").
 * Comparing one side's full name against the other's abbreviation produced 58
 * phantom "disagreements" on the first full pass — every one the same party.
 *
 * So both sides pass in every label they have, and any match is agreement.
 *
 * Returns true (corroborated), false (both sides named a party and nothing
 * matched — a real conflict, worth a human), or null (one side told us nothing,
 * so there is nothing to corroborate).
 */
export function samePartyish(a, b) {
  const x = a instanceof Set ? a : partyLabels(a)
  const y = b instanceof Set ? b : partyLabels(b)
  if (!x.size || !y.size) return null
  for (const v of x) if (y.has(v)) return true
  return false
}

/* -------------------------------------------------------------------------- */

async function main() {
  const limit = intOpt("limit", null)
  const stateFilter = opt("state")
  const apply = banner(LOADER, {
    election: ELECTION, delay_ms: REQUEST_DELAY_MS,
    scope: stateFilter ? `state=${stateFilter}` : (limit ? `first ${limit} seats` : "all winners"),
  })
  const sink = openSink({ loader: LOADER, apply })

  const reference = await loadPcReference(sink)
  const aliases = await loadAliases(sink, ["myneta"])

  // The Lok Sabha roster, every status, to find the member who FILED each
  // seat's general-election affidavit (lib/affidavit-member.mjs) — not
  // whoever sits there now, which after a by-election is someone else.
  // Absent → every row stays needs_review, the safe default.
  // party_full as well as party_abbr: the corroboration compares every label
  // each side offers, not one field against a differently-shaped one.
  const mpRows = await sink.select("in_mps", {
    columns: "id,mpsno,pc_code,name,party_abbr,party_full,house,status,term_label",
  })
  const lsRows = mpRows.filter(m => m.house === "LS" && m.term_label === LS_TERM.term_label && m.pc_code)
  const owners = loadAffidavitOwners()
  sink.count("LS roster rows available for corroboration", lsRows.length)

  const index = parseConstituencyIndex(
    await politeFetch(`${BASE}/`, { namespace: "myneta", json: false, delayMs: REQUEST_DELAY_MS }))
  sink.count("constituencies on the MyNeta index", index.length)
  if (index.length < 500) {
    sink.warn(`only ${index.length} constituencies found on the index page — the layout may have moved`)
  }

  let targets = index
  if (stateFilter) {
    const want = stateFilter.toUpperCase()
    targets = targets.filter(c => c.state.toUpperCase().includes(want))
  }
  if (limit) targets = targets.slice(0, limit)
  sink.count("constituencies to scrape", targets.length)

  const rows = []
  const aliasCandidates = []
  const reviewRows = []

  for (const c of targets) {
    const listHtml = await politeFetch(
      `${BASE}/index.php?action=show_candidates&constituency_id=${c.myneta_constituency_id}`,
      { namespace: "myneta", json: false, delayMs: REQUEST_DELAY_MS })
    const winner = parseWinnerFromList(listHtml)
    if (!winner) {
      sink.warn(`no winner marked for ${c.state} / ${c.constituency_label} (myneta ${c.myneta_constituency_id})`)
      continue
    }

    const detailHtml = await politeFetch(
      `${BASE}/candidate.php?candidate_id=${winner.myneta_candidate_id}`,
      { namespace: "myneta", json: false, delayMs: REQUEST_DELAY_MS })
    const d = parseCandidateDetail(detailHtml)
    // One extra request, only for the few winners whose history repeats an election.
    if (repeatedElections(ELECTION, d.declared_assets_history).size) {
      const compareUrl = compareProfileUrl(detailHtml)
      if (compareUrl) {
        const compareHtml = await politeFetch(compareUrl, { namespace: "myneta", json: false, delayMs: REQUEST_DELAY_MS })
        d.declared_assets_history = annotateRepeatedNominations(d.declared_assets_history, parseCompareProfiles(compareHtml), {
          election: ELECTION, profileUrl: `${BASE}/candidate.php?candidate_id=${winner.myneta_candidate_id}`,
        })
        sink.count("histories with a repeated election (compare page read)")
      } else {
        sink.warn(`${d.candidate_name}: history repeats an election but the page has no compare link`)
      }
    }

    const res = reference?.resolve({
      source: "myneta", sourceKey: String(c.myneta_constituency_id),
      stateName: c.state, name: c.constituency_label, aliases,
    }) ?? { pc_code: null, reason: "no_pc_reference" }

    let pc_code = null
    let match_method = null
    let needs_review = true
    let reviewReason = null

    let owner = null
    if (res.pc_code) {
      const found = affidavitOwner(res.pc_code, lsRows, owners)
      const mp = found.member
      owner = mp
      const partyAgrees = mp
        ? samePartyish(partyLabels(winner.party_abbr, d.party_abbr, d.party_full),
                       partyLabels(mp.party_abbr, mp.party_full))
        : null
      pc_code = res.pc_code
      match_method = res.method === "alias_table" ? "alias_table" : "one_winner_per_pc"
      if (!mp) {
        reviewReason = `no roster member to link: ${found.reason} (run sansad-roster first if the roster is empty)`
      } else if (partyAgrees === false) {
        reviewReason = `party conflict: myneta "${d.party_full ?? winner.party_abbr}" ` +
          `vs roster "${mp.party_full ?? mp.party_abbr}"`
      } else if (partyAgrees === null) {
        reviewReason = "party missing on one side — nothing to corroborate"
      } else {
        needs_review = false
      }
    } else {
      aliasCandidates.push(aliasCandidate({
        source: "myneta", sourceKey: c.myneta_constituency_id,
        sourceLabel: c.constituency_label, stateName: c.state, reason: res.reason,
        extra: { winner: winner.candidate_name, party: winner.party_abbr },
      }))
      reviewReason = res.reason
    }
    if (reviewReason) {
      reviewRows.push({
        myneta_candidate_id: winner.myneta_candidate_id,
        myneta_constituency_id: c.myneta_constituency_id,
        state: c.state, constituency: c.constituency_label,
        winner: winner.candidate_name, party: winner.party_abbr,
        proposed_pc_code: pc_code ?? "", reason: reviewReason,
      })
    }

    const now = new Date().toISOString()
    rows.push({
      myneta_candidate_id: winner.myneta_candidate_id,
      election: ELECTION,
      profile_url: `${BASE}/candidate.php?candidate_id=${winner.myneta_candidate_id}`,
      myneta_constituency_id: c.myneta_constituency_id,
      constituency_label: c.constituency_label,
      state_label: c.state,
      pc_code,
      // The member who filed this affidavit. Surfaces show it only when that
      // member is the one sitting (apps/web/lib/india/affidavit.ts).
      mp_id: owner?.id ?? null,
      is_winner: true,
      candidate_name: d.candidate_name ?? winner.candidate_name ?? "unknown",
      party_abbr: winner.party_abbr ?? d.party_abbr ?? null,
      party_full: d.party_full ?? null,
      age: d.age,
      self_profession: d.self_profession,
      spouse_profession: d.spouse_profession,
      education_category: d.education_category,
      education_detail: d.education_detail,
      criminal_cases: d.criminal_cases,
      criminal_cases_detail: d.criminal_cases_detail,
      total_assets_inr: d.total_assets_inr,
      liabilities_inr: d.liabilities_inr,
      declared_assets_history: d.declared_assets_history,
      parse_status: d.parse_status,
      match_method,
      needs_review,
      data_source: "ECI affidavits via myneta.info (ADR)",
      scraped_at: now,
      updated_at: now,
    })
  }

  sink.count("winners parsed", rows.length)
  sink.count("parse_status=ok", rows.filter(r => r.parse_status === "ok").length)
  sink.count("parse_status=partial", rows.filter(r => r.parse_status === "partial").length)
  sink.count("parse_status=failed", rows.filter(r => r.parse_status === "failed").length)
  sink.count("matched + public-readable", rows.filter(r => !r.needs_review).length)
  sink.count("needs_review (RLS keeps these private)", rows.filter(r => r.needs_review).length)
  sink.count("with declared criminal cases", rows.filter(r => (r.criminal_cases ?? 0) > 0).length)
  sink.count("zero criminal cases (explicit 0, not null)",
    rows.filter(r => r.criminal_cases === 0).length)

  if (aliasCandidates.length) sink.review("alias-candidates", aliasCandidates)
  if (reviewRows.length) sink.review("unmatched-winners", reviewRows)

  // in_mp_affidavits_one_winner_per_pc: one winner per (election, pc_code).
  const seen = new Map()
  const collisions = []
  for (const r of rows) {
    if (!r.pc_code) continue
    if (seen.has(r.pc_code)) collisions.push({ pc_code: r.pc_code, a: seen.get(r.pc_code), b: r.candidate_name })
    else seen.set(r.pc_code, r.candidate_name)
  }
  if (collisions.length) {
    sink.review("winner-collisions", collisions)
    sink.warn(`${collisions.length} seat(s) resolved to two winners — ` +
      `in_mp_affidavits_one_winner_per_pc would reject this. Refusing to write.`)
    sink.finish({ gate: "failed" })
    process.exit(1)
  }

  await sink.upsert("in_mp_affidavits", rows, {
    conflict: ["myneta_candidate_id", "election"], batch: 100,
  })
  sink.finish({ election: ELECTION, scraped_constituencies: targets.length })
}

run(main, import.meta.url)
