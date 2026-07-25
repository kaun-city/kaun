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
 *      corroborate against the single sitting in_mps row (party must agree).
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

/** "P C Mohan(Bharatiya Janata Party(BJP)):Constituency- BANGALORE CENTRAL(KARNATAKA) - …" */
export function parseTitle(html) {
  const t = text(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1])
  if (!t) return {}
  const m = /^(.*?)\((.*)\):Constituency-\s*(.*?)\(([^()]*)\)\s*-/.exec(t)
  if (!m) return { title_tag: t }
  // party arrives as "Bharatiya Janata Party(BJP" — the closing paren is eaten
  // by the outer group, so split rather than trying to balance it.
  const partyBlob = m[2]
  const abbrM = /\(([^()]+)\)?\s*$/.exec(partyBlob)
  return {
    title_tag: t,
    candidate_name: m[1].trim() || null,
    party_full: partyBlob.replace(/\(([^()]*)\)?$/, "").trim() || null,
    party_abbr: abbrM ? abbrM[1].trim() : null,
    constituency_label: m[3].trim() || null,
    state_label: m[4].trim() || null,
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

/** Party comparison for the structural check. "Ind." vs "IND" must agree. */
export function samePartyish(a, b) {
  const n = s => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const x = n(a), y = n(b)
  if (!x || !y) return null            // unknown on one side, not a disagreement
  if (x === y) return true
  const IND = new Set(["IND", "INDEPENDENT"])
  return IND.has(x) && IND.has(y)
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

  // Sitting MPs, for the party-agreement corroboration. Absent → every row
  // stays needs_review, which is the safe default rather than a silent guess.
  const mpRows = await sink.select("in_mps", { columns: "id,pc_code,name,party_abbr,house,status" })
  const sittingByPc = new Map(
    mpRows.filter(m => m.house === "LS" && m.status === "Sitting" && m.pc_code)
      .map(m => [m.pc_code, m]))
  sink.count("sitting LS MPs available for corroboration", sittingByPc.size)

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

    const res = reference?.resolve({
      source: "myneta", sourceKey: String(c.myneta_constituency_id),
      stateName: c.state, name: c.constituency_label, aliases,
    }) ?? { pc_code: null, reason: "no_pc_reference" }

    let pc_code = null
    let match_method = null
    let needs_review = true
    let reviewReason = null

    if (res.pc_code) {
      const mp = sittingByPc.get(res.pc_code)
      const partyAgrees = mp ? samePartyish(winner.party_abbr ?? d.party_abbr, mp.party_abbr) : null
      pc_code = res.pc_code
      match_method = res.method === "alias_table" ? "alias_table" : "one_winner_per_pc"
      if (!mp) {
        reviewReason = "no sitting in_mps row to corroborate (run sansad-roster first)"
      } else if (partyAgrees === false) {
        reviewReason = `party disagreement: myneta "${winner.party_abbr}" vs roster "${mp.party_abbr}"`
      } else if (partyAgrees === null) {
        reviewReason = "party unknown on one side"
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
      mp_id: pc_code ? (sittingByPc.get(pc_code)?.id ?? null) : null,
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
