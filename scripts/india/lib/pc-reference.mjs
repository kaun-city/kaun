/**
 * pc-reference.mjs — the 543-seat reference table every loader resolves against,
 * and the ONLY sanctioned way to turn a source's (state, constituency label)
 * into a pc_code.
 *
 * THE RULE (scripts/india/README.md): no loader may resolve a constituency by
 * name similarity. Resolution is alias table first, then an exact match on the
 * normalized name WITHIN a state. Anything else is reported for a human.
 * lib/pc-code.mjs owns that logic; this module owns two things it cannot:
 *
 *   1. WHERE the reference comes from. Preference order:
 *        a. in_constituencies, if the database is reachable — the real thing.
 *        b. data/pc-crosswalk/india_pc_crosswalk.csv (PR #64) — the committed
 *           artifact the seeder itself is built from, so a dry-run resolves
 *           correctly on a laptop with no credentials at all.
 *        c. nothing — every row goes to review, loudly. Never a guess.
 *
 *   2. STATE NAMES. No source publishes a state code that matches Census-2011:
 *      sansad says "NCT of Delhi", eSAKSHI says "Jammu And Kashmir" with its own
 *      id 16, the crosswalk says "Jammu & Kashmir". A state is a closed set of
 *      36 with stable spellings, so a *connector-insensitive* exact match is
 *      safe here in a way it is emphatically not for 543 constituency names —
 *      but it is still exact, never fuzzy, and an unmatched state name is
 *      reported rather than approximated.
 *
 *      One wrinkle worth knowing: st_code → state name is NOT one-to-one.
 *      Dadra & Nagar Haveli and Daman & Diu merged into one UT but kept both
 *      Census codes (25 and 26), so a state name can map to two st_codes. A
 *      label that matches in both is AMBIGUOUS and goes to review; it is never
 *      silently assigned to the first one.
 */
import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { parseCsv } from "../../lib/parsers.mjs"
import { pcCode, normalizeConstituencyName, resolvePc } from "./pc-code.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
export const CROSSWALK_CSV = resolve(
  __dirname, "../../../data/pc-crosswalk/india_pc_crosswalk.csv")

/**
 * Tokens dropped when comparing STATE names only. "and"/"&" differ purely by
 * house style across sources ("Jammu & Kashmir" / "Jammu and Kashmir"), "NCT
 * of" and a trailing "Islands" are decorations, and a leading "The" is
 * eSAKSHI's alone. Nothing here can collapse two distinct states into one.
 */
const STATE_NOISE = new Set(["and", "of", "the", "nct", "islands", "island"])

export function normalizeStateName(name) {
  if (name == null) return ""
  return String(name)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/).filter(t => t && !STATE_NOISE.has(t))
    .join(" ")
    .trim()
}

/**
 * normalizeStateName with the word breaks removed as well.
 *
 * This is what a state label is MATCHED on, and the reason is a printing
 * artefact rather than a naming one: MoSPI's narrow state column wraps a word
 * across two printed lines with no hyphen, and the parser can only rejoin the
 * pieces with a space — "MAHARASHT RA", "MAHARASHTR A", "CHHATTISGA RH",
 * "UTTARAKHA ND". The break lands in a different place every time, so a list of
 * the observed spellings is the wrong shape of fix; ignoring word breaks
 * entirely is the right one.
 *
 * This is still an EXACT match, not a fuzzy one. The 36 states and UTs remain
 * distinct with their spaces removed (india-loaders.test.mjs asserts it), so
 * collapsing "TAMIL NADU" and "TAMILNADU" onto one key cannot merge two real
 * states — it only stops caring where a line wrapped. Nothing here tolerates a
 * changed, missing or extra LETTER; "CHHATISGARH" still does not match
 * "Chhattisgarh" and needs the alias table below.
 */
export function stateKey(name) {
  return normalizeStateName(name).replace(/ /g, "")
}

/**
 * The key a STATE ALIAS is recorded under: lowercased, with everything that is
 * not a letter or digit removed and nothing dropped.
 *
 * Deliberately less lossy than stateKey. The labels that need an alias are the
 * ones normalizeStateName mangles — "A & N ISLANDS" loses "islands" to
 * STATE_NOISE and comes out as the two-letter "an" — so aliases are keyed on
 * something that keeps every letter the source printed ("anislands").
 */
export function stateAliasKey(name) {
  return String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** A loaded reference: rows plus the lookup structures resolvePc() expects. */
export class PcReference {
  constructor(rows, origin) {
    this.origin = origin
    this.rows = rows
    this.byCode = new Map(rows.map(r => [r.pc_code, r]))
    this.byState = new Map()          // st_code → Map(normalized pc name → pc_code)
    this.statesByName = new Map()     // normalized state name → [st_code, …]
    for (const r of rows) {
      if (!this.byState.has(r.st_code)) this.byState.set(r.st_code, new Map())
      this.byState.get(r.st_code).set(r.pc_name_norm, r.pc_code)
      const s = normalizeStateName(r.state_name)
      if (!this.statesByName.has(s)) this.statesByName.set(s, new Set())
      this.statesByName.get(s).add(r.st_code)
    }
    for (const [k, v] of this.statesByName) this.statesByName.set(k, [...v].sort((a, b) => a - b))
  }

  get size() { return this.rows.length }

  stCodesForState(stateName) {
    return this.statesByName.get(normalizeStateName(stateName)) ?? []
  }

  /**
   * The one resolution entry point for sources that publish a state name and a
   * constituency label and nothing else (sansad, eSAKSHI, MyNeta, PRS).
   * Returns { pc_code, method } or { pc_code: null, reason, ... }.
   */
  resolve({ source, sourceKey, stateName, name, aliases }) {
    const aliasHit = aliases?.get(`${source}:${sourceKey}`)
    if (aliasHit) return { pc_code: aliasHit, method: "alias_table" }

    const stCodes = this.stCodesForState(stateName)
    if (!stCodes.length) return { pc_code: null, reason: "unknown_state" }

    const hits = []
    for (const stCode of stCodes) {
      const r = resolvePc({ source, sourceKey, stCode, name, byState: this.byState, aliases: null })
      if (r.pc_code) hits.push(r.pc_code)
    }
    if (hits.length === 1) return { pc_code: hits[0], method: "exact_normalized" }
    if (hits.length > 1) return { pc_code: null, reason: "ambiguous_across_state_codes", hits }
    return { pc_code: null, reason: normalizeConstituencyName(name) ? "no_exact_match" : "empty_name" }
  }
}

/** in_constituencies rows → PcReference. */
function fromDbRows(rows) {
  return new PcReference(rows.map(r => ({
    pc_code: r.pc_code,
    st_code: Number(r.st_code),
    pc_no: Number(r.pc_no),
    state_name: r.state_name,
    pc_name: r.pc_name,
    pc_name_norm: r.pc_name_norm ?? normalizeConstituencyName(r.pc_name),
  })), "in_constituencies")
}

/** data/pc-crosswalk/india_pc_crosswalk.csv → PcReference. */
export function referenceFromCrosswalk(path = CROSSWALK_CSV) {
  if (!existsSync(path)) return null
  const rows = parseCsv(readFileSync(path, "utf8"))
  if (rows.length < 2) return null
  const head = rows[0]
  const idx = Object.fromEntries(head.map((h, i) => [h, i]))
  for (const need of ["pc_code", "st_code", "pc_no", "state_ut", "pc_name"]) {
    if (!(need in idx)) throw new Error(`pc-crosswalk CSV is missing column ${need}`)
  }
  const out = rows.slice(1).filter(r => r[idx.pc_code]).map(r => {
    const st_code = Number(r[idx.st_code])
    const pc_no = Number(r[idx.pc_no])
    const pc_name = r[idx.pc_name]
    return {
      pc_code: pcCode(st_code, pc_no),
      st_code, pc_no,
      state_name: r[idx.state_ut],
      pc_name,
      pc_name_norm: normalizeConstituencyName(pc_name),
      pc_name_hi: idx.pc_name_hi !== undefined ? r[idx.pc_name_hi] || null : null,
      pc_name_former: idx.pc_name_former !== undefined ? r[idx.pc_name_former] || null : null,
      reserved_for: idx.reserved_status !== undefined
        ? (["SC", "ST"].includes(r[idx.reserved_status]) ? r[idx.reserved_status] : null) : null,
      reserved_source: idx.reserved_source !== undefined ? r[idx.reserved_source] || null : null,
      wikidata_qid: idx.wikidata_qid !== undefined ? r[idx.wikidata_qid] || null : null,
      // The crosswalk's two geometry-join keys. pc_id is the ECI-style
      // "S03_13" code (identical to shijithpk's unique_id, 543/543);
      // pc_code_datameet is DataMeet's own "<st_code>-<pc_no>" (541/543).
      // Neither is DataMeet's integer pc_id — that comes off the feature.
      pc_id: idx.pc_id !== undefined ? r[idx.pc_id] || null : null,
      pc_code_datameet: idx.pc_code_datameet !== undefined ? r[idx.pc_code_datameet] || null : null,
    }
  })
  return new PcReference(out, "data/pc-crosswalk/india_pc_crosswalk.csv")
}

/**
 * Load the reference: database first, committed crosswalk artifact second.
 * Returns null (with a warning on the sink) when neither is available — the
 * caller then sends every row to review instead of guessing.
 */
export async function loadPcReference(sink) {
  const dbRows = await sink.select("in_constituencies", {
    columns: "pc_code,st_code,pc_no,state_name,pc_name,pc_name_norm",
  })
  if (dbRows.length) {
    sink.note(`pc reference: ${dbRows.length} row(s) from in_constituencies`)
    return fromDbRows(dbRows)
  }
  const xw = referenceFromCrosswalk()
  if (xw) {
    sink.note(`pc reference: ${xw.size} row(s) from ${xw.origin} (database empty or unreachable)`)
    return xw
  }
  sink.warn(
    "no PC reference available — in_constituencies is empty and " +
    "data/pc-crosswalk/ is absent (it lands with PR #64). Every constituency " +
    "join will be reported for review instead of resolved.")
  return null
}

/** in_pc_source_aliases → Map("<source>:<source_key>" → pc_code). */
export async function loadAliases(sink, sources) {
  const rows = await sink.select("in_pc_source_aliases", { columns: "source,source_key,pc_code" })
  const wanted = new Set(sources)
  const m = new Map()
  for (const r of rows) {
    if (wanted.has(r.source)) m.set(`${r.source}:${r.source_key}`, r.pc_code)
  }
  if (m.size) sink.note(`alias table: ${m.size} entr(ies) for ${[...wanted].join(", ")}`)
  return m
}

/**
 * Shape an unresolved row as a PROPOSED in_pc_source_aliases entry.
 * method is left blank on purpose: a human decides between 'official_lookup',
 * 'exact_normalized' and 'manual_reviewed', and the CHECK constraint requires
 * reviewed_by whenever it is 'manual_reviewed'.
 */
export function aliasCandidate({ source, sourceKey, sourceLabel, stateName, reason, extra = {} }) {
  return {
    source,
    source_key: String(sourceKey),
    source_label: sourceLabel ?? null,
    state_name_source: stateName ?? null,
    normalized_label: normalizeConstituencyName(sourceLabel ?? ""),
    unresolved_reason: reason,
    pc_code: "",            // ← a human fills this in
    method: "",             // ← official_lookup | exact_normalized | manual_reviewed
    reviewed_by: "",
    ...extra,
  }
}

/* ==========================================================================
 * STATE RESOLUTION
 *
 * Every in_* loader that carries a state string resolves it here, so the rules
 * are written once and every adapter gets the same ones. In resolution order:
 *
 *   1. the committed state-alias table (data/india/state-aliases.csv) — a
 *      human decision with a citable reason, one row per label;
 *   2. MoSPI's own multi-state wording;
 *   3. an EXACT match on stateKey() against the reference's 36 state names.
 *
 * Anything else stays NULL and is reported. There is no similarity scoring
 * anywhere in this path and there must never be: a state misattributed by one
 * letter is a project counted in the wrong place on a public map.
 * ========================================================================== */

export const STATE_ALIASES_CSV = resolve(
  __dirname, "../../../data/india/state-aliases.csv")

/** The three things a committed alias row may say about a label. */
export const STATE_RESOLUTIONS = new Set(["state", "multi_state", "not_a_state"])

/**
 * data/india/state-aliases.csv → Map(stateAliasKey(label) → row).
 *
 * Columns: source,label,resolution,st_code,state_name,reason
 *   source      the loader that sees the label ("mospi"), or "*" for any
 *   resolution  state | multi_state | not_a_state
 *   st_code     required when resolution is "state", empty otherwise
 *   reason      why, in words, for the person reading the diff. Required.
 *
 * Validated, never guessed: a row missing its reason, naming an unknown
 * resolution, or carrying an st_code the reference does not know is a hard
 * error here rather than a silently-wrong state downstream.
 */
export function readStateAliases(path = STATE_ALIASES_CSV, { reference = null } = {}) {
  const out = new Map()
  if (!existsSync(path)) return out
  const rows = parseCsv(readFileSync(path, "utf8"))
  if (rows.length < 2) return out
  const head = rows[0]
  const idx = Object.fromEntries(head.map((h, i) => [h, i]))
  for (const need of ["source", "label", "resolution", "st_code", "reason"]) {
    if (!(need in idx)) throw new Error(`${path} is missing column ${need}`)
  }
  const known = reference ? new Set(reference.rows.map(r => r.st_code)) : null
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const label = r[idx.label]
    const resolution = r[idx.resolution]
    if (!label) throw new Error(`${path}:${line}: empty label`)
    if (!STATE_RESOLUTIONS.has(resolution)) {
      throw new Error(`${path}:${line}: resolution ${resolution || "(empty)"} is not one of ` +
        [...STATE_RESOLUTIONS].join(", "))
    }
    if (!r[idx.reason]) throw new Error(`${path}:${line}: every alias needs a reason`)
    let stCode = null
    if (resolution === "state") {
      stCode = Number(r[idx.st_code])
      if (!Number.isInteger(stCode)) throw new Error(`${path}:${line}: st_code is required for resolution=state`)
      if (known && !known.has(stCode)) throw new Error(`${path}:${line}: st_code ${stCode} is not in the reference`)
    } else if (r[idx.st_code]) {
      throw new Error(`${path}:${line}: resolution=${resolution} must leave st_code empty`)
    }
    const key = stateAliasKey(label)
    if (out.has(key)) throw new Error(`${path}:${line}: duplicate alias for ${label}`)
    out.set(key, {
      source: r[idx.source] || "*", label, resolution, st_code: stCode,
      state_name: idx.state_name !== undefined ? r[idx.state_name] || null : null,
      reason: r[idx.reason],
    })
  })
  return out
}

/**
 * The lookup a loader hands to classifyState.
 *
 *   reference    a PcReference (or null — then only aliases can resolve)
 *   pcAliases    in_pc_source_aliases rows already loaded by loadAliases(),
 *                as Map("<source>:<label>" → pc_code). Historical wart: state
 *                aliases used to be smuggled through the CONSTITUENCY alias
 *                table by pointing a state label at any seat inside it. Still
 *                honoured so nothing already in the database stops working;
 *                new entries belong in state-aliases.csv.
 *   source       which committed alias rows apply ("mospi")
 *
 * The st_code → name direction is not one-to-one (Dadra & Nagar Haveli and
 * Daman & Diu is one UT holding Census codes 25 and 26), so a name that spans
 * two codes keeps the lower one and is recorded in `ambiguous` for the caller
 * to report. That is the pre-existing behaviour, made visible rather than
 * changed.
 */
export function buildStateIndex({ reference = null, pcAliases = null,
                                  stateAliases = null, source = null } = {}) {
  const states = new Map()
  const ambiguous = new Map()
  for (const r of reference?.rows ?? []) {
    const k = stateKey(r.state_name)
    if (!states.has(k)) states.set(k, r.st_code)
    else if (states.get(k) !== r.st_code) {
      if (!ambiguous.has(k)) ambiguous.set(k, new Set([states.get(k)]))
      ambiguous.get(k).add(r.st_code)
    }
  }
  const prefix = source ? `${source}:` : null
  for (const [key, pcCodeValue] of pcAliases ?? []) {
    if (prefix && !key.startsWith(prefix)) continue
    const row = reference?.byCode.get(pcCodeValue)
    if (row) states.set(stateKey(prefix ? key.slice(prefix.length) : key), row.st_code)
  }
  const aliases = new Map()
  for (const [k, row] of stateAliases ?? []) {
    if (source && row.source !== "*" && row.source !== source) continue
    aliases.set(k, row)
    // Also index the alias under the SHARED normaliser's key, so one committed
    // row covers the connector spellings the normaliser already treats as the
    // same thing: "J & K" and "J and K" are one decision, not two.
    const loose = stateKey(row.label)
    if (loose && !aliases.has(loose)) aliases.set(loose, row)
  }
  return { states, aliases, ambiguous }
}

/**
 * Fold a state string into an st_code, or say why it could not be.
 *
 * MoSPI writes plain state names for single-state projects and things like
 * "Multi State" / "Andhra Pradesh, Telangana" / "Multi-States (Bihar,
 * Jharkhand)" otherwise. Never guessed: an unrecognised single-state string
 * becomes an alias candidate.
 *
 * Returns { st_code, is_multi_state, unresolved, reason, member_st_codes }.
 * `reason` is the thing the old boolean pair could not say — the difference
 * between "the source printed no state at all" (the 2009-10 and April 2010
 * annexures print none, and the post-2020 on-schedule cuts clip the cell before
 * it), "this is not a place" (an offshore oil block) and "we do not recognise
 * this label", which are three very different admissions.
 */
export function classifyState(stateRaw, index) {
  const none = { st_code: null, is_multi_state: false, unresolved: false, member_st_codes: [] }
  const states = index?.states ?? new Map()
  const aliases = index?.aliases ?? new Map()
  const raw = String(stateRaw ?? "").trim()
  if (!raw) return { ...none, reason: "no_state_printed" }

  const alias = aliases.get(stateAliasKey(raw)) ?? aliases.get(stateKey(raw))
  if (alias) {
    if (alias.resolution === "state") {
      return { ...none, st_code: alias.st_code, reason: "alias_table" }
    }
    if (alias.resolution === "multi_state") {
      return { ...none, is_multi_state: true, reason: "alias_table_multi_state" }
    }
    return { ...none, reason: "not_a_state" }        // offshore, and anything like it
  }

  // MoSPI's own words for "more than one state". The member list, when it
  // prints one ("Multi-States (Bihar, Jharkhand)"), is resolved and returned
  // rather than thrown away — st_code stays NULL either way.
  if (/multi[\s-]*state|all india|various/i.test(raw)) {
    return { ...none, is_multi_state: true, reason: "multi_state",
             member_st_codes: memberStates(raw, states) }
  }

  const direct = states.get(stateKey(raw))
  if (direct != null) return { ...none, st_code: direct, reason: "exact_normalized" }

  const parts = splitStateList(raw)
  if (parts.length > 1) {
    const hits = [...new Set(parts.map(p => states.get(stateKey(p))).filter(v => v != null))]
    if (hits.length > 1) {
      return { ...none, is_multi_state: true, reason: "multi_state",
               member_st_codes: hits.sort((a, b) => a - b) }
    }
  }
  return { ...none, unresolved: true, reason: "no_exact_state_match" }
}

function splitStateList(raw) {
  return String(raw).replace(/[()]/g, ",")
    .split(/\s*[,;/&]\s*|\s+and\s+/i).map(s => s.trim()).filter(Boolean)
}

/** The states named inside a multi-state label, when it names any. */
function memberStates(raw, states) {
  const hits = new Set()
  for (const p of splitStateList(raw)) {
    const code = states.get(stateKey(p))
    if (code != null) hits.add(code)
  }
  return [...hits].sort((a, b) => a - b)
}
