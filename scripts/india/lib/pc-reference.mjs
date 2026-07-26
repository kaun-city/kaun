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
