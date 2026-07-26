#!/usr/bin/env node
/**
 * sansad-roster.mjs — populates in_mps from sansad.in (+ the minister flag from
 * PRS's MP Track CSV).
 *
 * Usage:
 *   node scripts/india/sansad-roster.mjs                # dry run, LS + RS
 *   node scripts/india/sansad-roster.mjs --house LS     # one house only
 *   node scripts/india/sansad-roster.mjs --apply        # writes
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   (or KAUN_LOCAL_PG for local testing)
 *
 * mpsno is Kaun's canonical MP id. It is the ONE strong numeric identifier in
 * the whole India recon, and it is the same value as the Zenodo bulk export's
 * mpCode (cross-checked: 5814 = "Shri Mani A" in both). Two members appear in
 * both houses, which is why the natural key is (mpsno, house, term_label) and
 * not mpsno alone.
 *
 * ENDPOINT TRAPS ALREADY PAID FOR
 *   - Pagination is 1-INDEXED. page=0 returns a 500 with an opaque
 *     {"errorCode":1004}. This loader starts at page=1 and keeps going until it
 *     has metaDatasDto.totalElements rows, so a page-size change upstream
 *     cannot silently truncate the roster.
 *   - sansad.in returns an empty reply to curl's default UA; the JSON APIs need
 *     a browser-shaped User-Agent + Referer. lib/http.mjs sends one that is
 *     browser-shaped AND still says it is Kaun.
 *   - The LS payload has NO PC number, only constName. That is what the alias
 *     table exists for.
 *   - 544 records for 543 seats: Nanded has both a deceased and a bypoll MP.
 *     3 seats (Nagaon, Basirhat, Shillong) currently have no sitting MP.
 *     The in_mps_one_sitting_per_pc partial index expects exactly this shape,
 *     and this loader pre-checks it rather than letting the INSERT discover it.
 *   - categoryCode (reserved status) is badly under-populated. It is not written
 *     anywhere; in_constituencies.reserved_for owns that fact.
 *
 * THE MINISTER FLAG, AND WHY IT IS HANDLED SO CAREFULLY
 *   in_mp_activity refuses to store 0 for a member flagged metrics_excluded —
 *   it must store NULL. That protection is only as good as is_minister, so a
 *   refresh that loses the minister list must NOT quietly reset the column to
 *   false. If the PRS download fails, is_minister/minister_note are dropped
 *   from the UPDATE set entirely and the existing values survive untouched.
 *
 *   Rajya Sabha needs none of this: its payload carries currentMinister
 *   directly.
 */
import { openSink } from "./lib/sink.mjs"
import { politeFetch } from "./lib/http.mjs"
import { loadPcReference, loadAliases, aliasCandidate } from "./lib/pc-reference.mjs"
import { normalizeConstituencyName } from "./lib/pc-code.mjs"
import { parseCsv } from "../lib/parsers.mjs"
import { opt, banner, run } from "./lib/cli.mjs"

const LOADER = "sansad-roster"

const SANSAD = "https://sansad.in"
const LS_MEMBERS = `${SANSAD}/api_ls/member`
const RS_MEMBERS = `${SANSAD}/api_rs/member/sitting-members`
const PRS_MP_TRACK =
  "https://prsindia.org/mptrack/download?file_path=files/mptrack/18-lok-sabha/Mp-Track/18%20LS%20MP%20Track.csv"

const HEADERS = { Accept: "application/json, */*", Referer: `${SANSAD}/` }

/** Terms Kaun tracks. term_label is part of in_mps' natural key. */
export const LS_TERM = { lok_sabha_no: 18, term_label: "LS18" }

/** in_mps_status_chk. Anything outside this list is reported, never coerced. */
const ALLOWED_STATUS = new Set(["Sitting", "Died", "Resigned", "Disqualified", "Term Ended"])

/* -------------------------------------------------------------------------- */
/* pure transforms (exported for tests)                                        */
/* -------------------------------------------------------------------------- */

/** sansad pads a lot of its RS strings to fixed width. */
export function clean(s) {
  if (s == null) return null
  const t = String(s).replace(/\s+/g, " ").trim()
  return t === "" ? null : t
}

/** "01/07/1950" (RS) or "1950-07-01" (LS) → "1950-07-01". */
export function parseDate(s) {
  const v = clean(s)
  if (!v) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  return null
}

/** "2025-08-15 14:09:37.975701" → ISO. */
export function parseTimestamp(s) {
  const v = clean(s)
  if (!v) return null
  const d = new Date(v.replace(" ", "T") + (/[Zz]|[+-]\d{2}:?\d{2}$/.test(v) ? "" : "Z"))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** "Abdul Wahab, Shri " → "Abdul Wahab". RS publishes "Last, Honorific". */
export function rsDisplayName(record) {
  const raw = clean(record.name)
  if (!raw) return clean(record.lastName) ?? "unknown"
  const [surname] = raw.split(",")
  return clean(surname) || raw
}

export function lsMemberRow(m) {
  return {
    mpsno: Number(m.mpsno),
    house: "LS",
    term_label: LS_TERM.term_label,
    lok_sabha_no: LS_TERM.lok_sabha_no,
    state_name: clean(m.stateName),
    constituency_label: clean(m.constName),
    name: clean(m.mpFirstLastName) ?? clean(m.mpLastFirstName) ?? "unknown",
    name_norm: normalizeConstituencyName(m.mpFirstLastName ?? ""),
    party_abbr: clean(m.partySname),
    party_full: clean(m.partyFname),
    gender: clean(m.gender),
    dob: parseDate(m.dob),
    age: Number.isFinite(m.age) ? m.age : null,
    no_of_terms: Number.isFinite(m.noOfTerms) ? m.noOfTerms : null,
    qualification: clean(m.qualification),
    profession: [clean(m.profession), clean(m.profession2)].filter(Boolean).join("; ") || null,
    status: clean(m.status),
    profile_url: clean(m.profileUrl) ?? `${SANSAD}/ls/members/biography/${m.mpsno}`,
    image_url: clean(m.imageUrl),
    source_updated_at: parseTimestamp(m.updatedAt),
    data_source: "sansad.in api_ls/member",
  }
}

export function rsMemberRow(m) {
  const term = clean(m.term)
  return {
    mpsno: Number(m.mpsno),
    house: "RS",
    term_label: term ? `RS-${term}` : "RS",
    lok_sabha_no: null,
    // RS members represent a state, not a seat. in_mps_pc_only_for_ls enforces
    // that pc_code stays NULL here; state_name still carries the state.
    state_name: clean(m.state),
    constituency_label: null,
    name: rsDisplayName(m),
    name_norm: null,
    party_abbr: clean(m.partyCode),
    party_full: clean(m.party),
    gender: clean(m.gender),
    dob: parseDate(m.dob),
    age: Number.isFinite(m.age) ? m.age : null,
    no_of_terms: Number.isFinite(m.termCount) ? m.termCount : null,
    qualification: null,
    profession: null,
    status: clean(m.status),
    term_start: parseDate(m.notificationDate),
    term_end: parseDate(m.expirationDate),
    // The one place a minister flag arrives without any join at all.
    is_minister: Boolean(m.currentMinister),
    minister_note: m.currentMinister
      ? "Current minister (sansad.in api_rs currentMinister)" : null,
    profile_url: clean(m.profileUrl),
    image_url: clean(m.imageUrl),
    source_updated_at: parseTimestamp(m.updatedAt),
    data_source: "sansad.in api_rs/member/sitting-members",
  }
}

/**
 * PRS states the minister exclusion in words, per MP, in mp_note. That exact
 * sentence is the corroborating source the schema comment cites, so match on
 * its stable core rather than on a list of names.
 */
export const MINISTER_NOTE_RE = /this mp is a minister/i

export function parsePrsMpTrack(csvText) {
  const rows = parseCsv(csvText)
  if (rows.length < 2) return []
  const head = rows[0]
  const idx = Object.fromEntries(head.map((h, i) => [h.trim(), i]))
  for (const n of ["mp_name", "pc_name", "state", "mp_note", "mp_house"]) {
    if (!(n in idx)) throw new Error(`PRS CSV missing column ${n}`)
  }
  return rows.slice(1)
    .filter(r => r.length > idx.mp_house)
    .map(r => ({
      mp_name: r[idx.mp_name],
      pc_name: r[idx.pc_name],
      state: r[idx.state],
      house: /rajya/i.test(r[idx.mp_house] ?? "") ? "RS" : "LS",
      mp_note: r[idx.mp_note] ?? "",
      is_minister: MINISTER_NOTE_RE.test(r[idx.mp_note] ?? ""),
      mp_election_index: idx.mp_election_index !== undefined ? r[idx.mp_election_index] : null,
    }))
}

/* -------------------------------------------------------------------------- */
/* extract                                                                     */
/* -------------------------------------------------------------------------- */

/** 1-INDEXED pagination, and keep going until totalElements is satisfied. */
async function fetchAllLs() {
  const size = 600
  const out = []
  let page = 1
  let total = null
  for (;;) {
    const url = `${LS_MEMBERS}?loksabha=${LS_TERM.lok_sabha_no}&page=${page}&size=${size}`
    const body = await politeFetch(url, { namespace: "sansad", headers: HEADERS, maxAgeMs: 6 * 3600e3 })
    const list = body?.membersDtoList ?? []
    total = body?.metaDatasDto?.totalElements ?? total
    out.push(...list)
    if (!list.length || (total != null && out.length >= total) || page > 20) break
    page++
  }
  return { members: out, total }
}

/**
 * The RS endpoint is called "sitting-members" and is not one: it returns the
 * complete Rajya Sabha membership back to 1952 (2,547 records, statuses
 * "Retirement" / "Death" / "Resignation" / "Elected to Lok Sabha" / …), of
 * which exactly 244 are Sitting. No filter parameter was found that changes
 * that, so the filter happens here — one request, filtered client-side, rather
 * than 510 paginated requests for data we discard.
 *
 * The historic rows are deliberately NOT loaded in v1: their status vocabulary
 * does not map onto in_mps_status_chk without an editorial decision (is
 * "Elected to Lok Sabha" a 'Term Ended'?), and nothing in the product needs
 * them yet.
 */
async function fetchAllRs() {
  const url = `${RS_MEMBERS}?page=1&size=3000`
  const body = await politeFetch(url, {
    namespace: "sansad", headers: HEADERS, maxAgeMs: 6 * 3600e3, timeoutMs: 120000,
  })
  const all = body?.records ?? []
  const total = body?._metadata?.totalElements ?? all.length
  return { members: all.filter(m => clean(m.status) === "Sitting"), total, fetched: all.length }
}

/* -------------------------------------------------------------------------- */

async function main() {
  const houses = (opt("house", "LS,RS") ?? "LS,RS").toUpperCase().split(",").map(s => s.trim())
  const apply = banner(LOADER, { houses: houses.join("+") })
  const sink = openSink({ loader: LOADER, apply })

  const reference = await loadPcReference(sink)
  const aliases = await loadAliases(sink, ["sansad", "prs"])

  const rows = []
  const aliasCandidates = []

  /* ---- Lok Sabha ------------------------------------------------------- */
  let prsAvailable = false
  const prsByPc = new Map()
  let prsMinisterRows = []

  if (houses.includes("LS")) {
    const { members, total } = await fetchAllLs()
    sink.count("sansad LS records", members.length)
    if (total != null && members.length !== total) {
      sink.warn(`LS roster incomplete: fetched ${members.length} of ${total} reported records`)
    }

    // PRS MP Track — the minister flag. A failure here must not clear the flag.
    try {
      const csv = await politeFetch(PRS_MP_TRACK, {
        namespace: "prs", json: false, maxAgeMs: 7 * 24 * 3600e3,
      })
      const prs = parsePrsMpTrack(csv).filter(r => r.house === "LS")
      prsAvailable = prs.length > 0
      prsMinisterRows = prs.filter(r => r.is_minister)
      sink.count("PRS LS rows", prs.length)
      sink.count("PRS rows flagged minister", prsMinisterRows.length)
      for (const r of prs) {
        const res = reference?.resolve({
          source: "prs", sourceKey: `${r.state}|${r.pc_name}`,
          stateName: r.state, name: r.pc_name, aliases,
        }) ?? { pc_code: null, reason: "no_pc_reference" }
        if (res.pc_code) {
          prsByPc.set(res.pc_code, r)
        } else if (r.is_minister) {
          // Only worth a human's time when it costs us a minister flag.
          aliasCandidates.push(aliasCandidate({
            source: "prs", sourceKey: `${r.state}|${r.pc_name}`, sourceLabel: r.pc_name,
            stateName: r.state, reason: res.reason,
            extra: { note: "PRS row flagged as minister could not be matched to a seat", mp_name: r.mp_name },
          }))
        }
      }
      sink.count("PRS rows resolved to a seat", prsByPc.size)
    } catch (e) {
      sink.warn(`PRS MP Track unavailable (${e.message.slice(0, 120)}). ` +
        `is_minister / minister_note will be left exactly as they are in the database.`)
    }

    for (const m of members) {
      const base = lsMemberRow(m)
      if (!ALLOWED_STATUS.has(base.status)) {
        sink.warn(`skipping mpsno ${base.mpsno}: unknown status "${base.status}" (in_mps_status_chk)`)
        continue
      }
      const res = reference?.resolve({
        source: "sansad", sourceKey: String(base.mpsno),
        stateName: base.state_name, name: base.constituency_label, aliases,
      }) ?? { pc_code: null, reason: "no_pc_reference" }

      if (res.pc_code) {
        base.pc_code = res.pc_code
        base.pc_match_method = res.method
      } else {
        base.pc_code = null
        base.pc_match_method = null
        aliasCandidates.push(aliasCandidate({
          source: "sansad", sourceKey: base.mpsno, sourceLabel: base.constituency_label,
          stateName: base.state_name, reason: res.reason,
          extra: { mp_name: base.name, party: base.party_abbr, status: base.status },
        }))
      }

      const prsRow = base.pc_code ? prsByPc.get(base.pc_code) : null
      base.is_minister = Boolean(prsRow?.is_minister)
      base.minister_note = prsRow?.is_minister ? clean(prsRow.mp_note) : null
      rows.push(base)
    }
  }

  /* ---- Rajya Sabha ------------------------------------------------------ */
  if (houses.includes("RS")) {
    const { members, total, fetched } = await fetchAllRs()
    sink.count("sansad RS records (all history)", fetched)
    sink.count("sansad RS sitting members", members.length)
    if (fetched !== total) {
      sink.warn(`RS roster incomplete: fetched ${fetched} of ${total} reported records`)
    }
    for (const m of members) {
      const row = rsMemberRow(m)
      if (!ALLOWED_STATUS.has(row.status)) {
        sink.warn(`skipping RS mpsno ${row.mpsno}: unknown status "${row.status}"`)
        continue
      }
      rows.push(row)
    }
  }

  /* ---- report + gates --------------------------------------------------- */
  const ls = rows.filter(r => r.house === "LS")
  const resolved = ls.filter(r => r.pc_code)
  sink.count("rows to write", rows.length)
  sink.count("LS resolved to a pc_code", resolved.length)
  sink.count("LS unresolved (→ review)", ls.length - resolved.length)
  sink.count("ministers flagged", rows.filter(r => r.is_minister).length)

  if (prsAvailable && prsMinisterRows.length) {
    const flagged = ls.filter(r => r.is_minister).length
    if (flagged < prsMinisterRows.length) {
      sink.warn(`PRS lists ${prsMinisterRows.length} LS ministers but only ${flagged} matched a ` +
        `roster row — the unmatched ones are in the review file and must be resolved before ` +
        `mp-activity runs, or their attendance would be stored as 0 rather than NULL.`)
    }
  }

  // in_mps_one_sitting_per_pc would raise a unique violation; catch it here
  // instead, where the offending pair can actually be named.
  const sittingByPc = new Map()
  const collisions = []
  for (const r of ls) {
    if (r.status !== "Sitting" || !r.pc_code) continue
    if (sittingByPc.has(r.pc_code)) {
      collisions.push({ pc_code: r.pc_code, a: sittingByPc.get(r.pc_code).name, b: r.name })
    } else sittingByPc.set(r.pc_code, r)
  }
  sink.count("seats with a sitting MP", sittingByPc.size)

  if (aliasCandidates.length) sink.review("alias-candidates", aliasCandidates)
  if (collisions.length) {
    sink.review("sitting-collisions", collisions)
    sink.warn(`${collisions.length} seat(s) resolved to two sitting MPs — ` +
      `in_mps_one_sitting_per_pc would reject this. Refusing to write.`)
    sink.finish({ gate: "failed" })
    process.exit(1)
  }

  // If PRS was unavailable, do not let the refresh clear a minister flag.
  const key = ["mpsno", "house", "term_label"]
  const allCols = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const protectedCols = prsAvailable ? [] : ["is_minister", "minister_note"]
  const updateColumns = allCols.filter(c => !key.includes(c) && !protectedCols.includes(c))
  if (protectedCols.length && houses.includes("LS")) {
    sink.note("PRS unavailable → is_minister / minister_note excluded from the UPDATE set")
  }

  await sink.upsert("in_mps", rows, { conflict: key, batch: 200, updateColumns })
  sink.finish({ prs_available: prsAvailable })
}

run(main, import.meta.url)
