/**
 * pc-code.mjs — the SINGLE source of truth for Kaun's canonical parliamentary
 * constituency key and for constituency-name normalization.
 *
 * Shared by every India loader (and mirrored by a CHECK constraint on
 * in_constituencies), the same way apps/web/lib/pulse-dedup.mjs is shared
 * between the CityPulse route and its migration.
 *
 * WHY A CODE AND NOT `pc_no`
 * --------------------------
 * `pc_no` is NOT nationally unique — it restarts at 1 in every state/UT.
 * Verified against DataMeet's 543-feature PC file: pc_no=1 occurs 36 times
 * (once per state/UT); (st_code, pc_no) is unique 543/543. Anything keyed on
 * pc_no alone silently merges 36 different seats. `pc_code` = UNPADDED
 * "<st_code>-<pc_no>" (Census-2011 state code, the same code DataMeet's PC,
 * AC and district layers all carry), e.g. Kangra HP-1 → "2-1".
 *
 * UNPADDED, to match the pc-crosswalk artifact (data/pc-crosswalk/, PR #64):
 * the crosswalk emits "37-1"-style codes, and ac_no reaches 3 digits (AP 294)
 * so fixed-width padding would be inconsistent across pc/ac anyway. Sorting
 * must use the integer pair (st_code, pc_no), never the string.
 *
 * LADAKH: DataMeet predates the 2019 bifurcation and carries no Ladakh
 * st_code. The crosswalk assigns st_code=38 (first free integer); this
 * helper and every loader MUST use the same value (LADAKH_ST_CODE below).
 *
 * WHY NORMALIZATION IS DELIBERATELY CONSERVATIVE
 * ----------------------------------------------
 * normalizeConstituencyName() only removes *orthographic* noise: case,
 * whitespace, punctuation, and the reservation suffix "(SC)"/"(ST)" that some
 * sources append to the seat name. It does NOT do transliteration folding,
 * edit-distance, soundex or any other similarity trick.
 *
 * "Mahbubnagar" (sansad) vs "Mahabubnagar" (DataMeet) must NOT auto-fold —
 * it goes in in_pc_source_aliases as a reviewed row. That is the whole point:
 * normalization is deterministic and lossless-ish, and every residual
 * mismatch becomes a visible, attributable alias record rather than an
 * invisible fuzzy guess. Same discipline as the ward crosswalk
 * (scripts/wardmap/build-crosswalk.mjs: "no name matching").
 */

/** Census-2011 has no code for Ladakh (2019 bifurcation); 38 = first free
 *  integer, matching data/pc-crosswalk/ (PR #64). */
export const LADAKH_ST_CODE = 38

/** Canonical PC key: unpadded "<st_code>-<pc_no>". Mirrors the
 *  in_constituencies_pc_code_derived CHECK constraint exactly. */
export function pcCode(stCode, pcNo) {
  const s = Number(stCode)
  const p = Number(pcNo)
  if (!Number.isInteger(s) || !Number.isInteger(p) || s < 1 || p < 1) {
    throw new Error(`pcCode: bad (st_code, pc_no) = (${stCode}, ${pcNo})`)
  }
  return `${s}-${p}`
}

/** Inverse of pcCode(). Throws on anything that isn't a canonical code
 *  (leading zeros are not canonical). */
export function parsePcCode(code) {
  const m = /^([1-9]\d*)-([1-9]\d*)$/.exec(String(code ?? ""))
  if (!m) throw new Error(`parsePcCode: not a pc_code: ${code}`)
  return { st_code: Number(m[1]), pc_no: Number(m[2]) }
}

/** Reservation suffix as published by ECI/eSAKSHI/MyNeta seat names. */
const RESERVATION_SUFFIX = /[\s(]*\b(sc|st)\b[\s)]*$/

/**
 * Conservative constituency-name normalizer.
 * Lowercases, strips diacritics, drops a trailing (SC)/(ST) marker, turns
 * punctuation into spaces, collapses whitespace. Nothing else.
 * Returns "" for null/undefined/blank (callers must treat "" as "no key").
 */
export function normalizeConstituencyName(name) {
  if (name == null) return ""
  let s = String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")   // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9()]+/g, " ")     // punctuation → space, keep parens for the suffix test
    .replace(/\s+/g, " ")
    .trim()
  s = s.replace(RESERVATION_SUFFIX, "").trim()
  return s.replace(/[()]/g, " ").replace(/\s+/g, " ").trim()
}

/** Reservation status parsed OUT of a seat name, when present.
 *  NOTE: this is only a hint for cross-checking. The authoritative value for
 *  in_constituencies.reserved_for is the 2008 Delimitation Order — every
 *  roster/boundary source checked in recon under-reports it. */
export function reservationFromName(name) {
  const m = RESERVATION_SUFFIX.exec(
    String(name ?? "").normalize("NFKD").toLowerCase().replace(/\s+/g, " ").trim())
  return m ? m[1].toUpperCase() : null
}

/**
 * Resolve a source's constituency label to a pc_code using ONLY exact matches
 * on the normalized name within a state, plus a pre-loaded alias map.
 * Returns { pc_code, method } or { pc_code: null, reason } — never a guess.
 *
 *   byState:  Map<st_code, Map<normalizedName, pc_code>>   (from in_constituencies)
 *   aliases:  Map<`${source}:${sourceKey}`, pc_code>       (from in_pc_source_aliases)
 */
export function resolvePc({ source, sourceKey, stCode, name, byState, aliases }) {
  const aliasHit = aliases?.get(`${source}:${sourceKey}`)
  if (aliasHit) return { pc_code: aliasHit, method: "alias_table" }

  const norm = normalizeConstituencyName(name)
  if (!norm) return { pc_code: null, reason: "empty_name" }

  const inState = byState?.get(Number(stCode))
  if (!inState) return { pc_code: null, reason: "unknown_state" }

  const hit = inState.get(norm)
  if (!hit) return { pc_code: null, reason: "no_exact_match" }
  return { pc_code: hit, method: "exact_normalized" }
}
