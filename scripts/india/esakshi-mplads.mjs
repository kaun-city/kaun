#!/usr/bin/env node
/**
 * esakshi-mplads.mjs — populates in_mplads_summary (MPLADS allocation + spend).
 *
 * Usage:
 *   node scripts/india/esakshi-mplads.mjs                          # dry run, eSAKSHI
 *   node scripts/india/esakshi-mplads.mjs --source empoweredindian
 *   node scripts/india/esakshi-mplads.mjs --state Karnataka --apply
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   (or KAUN_LOCAL_PG for local testing)
 *
 * TWO SOURCES, KEPT SEPARATE ON PURPOSE. in_mplads_summary.source is part of
 * the natural key, so both can coexist per MP and a read path always knows
 * which one it is citing:
 *   esakshi          — MOSPI's own system of record. Authoritative, live, but
 *                      the pre-login surface is AGGREGATE ONLY (allocated,
 *                      expenditure, work counts). No itemized per-work list.
 *   empoweredindian  — unofficial third party with genuine per-work
 *                      granularity. Good UX, no SLA, undocumented provenance.
 *                      Never present it as a primary-source citation.
 *
 * THE eSAKSHI WALK — the piece recon left unfinished
 * -------------------------------------------------
 * Recon found getMpNamesData returning an empty array and stopped there. The
 * missing ingredient is the TENURE id: every MP-scoped call takes one, and the
 * dashboard JS supplies it from getTenureData rather than defaulting it.
 * Verified live on 2026-07-26:
 *
 *   getTenureData     {"uname":"0,0,0,2"}            → [{ID:7,CAPTION:"18th Lok Sabha"}]
 *   getStateData      {}                             → [{STATE_NAME, STATE_ID}]
 *   getConstituencyData {"id":"<STATE_ID>"}          → [{ID, CAPTION}]
 *   getMpAndConstCombo {"const_combo":"<constId>,<house>,<tenureId>"}
 *                                                    → [{ID:3019529, CAPTION:"P C Mohan"}]
 *   getTilesData      {"uname":"<st>,<const>,<mp>,<house>,<tenure>"}
 *                                                    → the fund tiles
 *
 * Walking per constituency rather than per state is also what makes the join
 * safe: the tiles come back already scoped to one seat, so the identity of the
 * row is the eSAKSHI constituency id, which the alias table maps to pc_code.
 *
 * TRAPS ALREADY PAID FOR
 *   - Use https:// (443). Plain http:// on mplads.mospi.gov.in silently times
 *     out and looks exactly like a firewall block. It is not one.
 *   - All endpoints are POST with a JSON body, even the ones that read like
 *     GETs.
 *   - eSAKSHI has its own numeric state AND constituency ids, unrelated to
 *     Census/ECI numbering (Karnataka is 18 to eSAKSHI, 29 to Census).
 *     Resolution goes through in_pc_source_aliases (source='esakshi'), never
 *     by name alone.
 *   - Amounts arrive as formatted Indian-grouped strings with paise and a
 *     rupee sign that is frequently mojibaked ("?1,15,55,39,16,595.93").
 *     parseIndianAmount strips everything that is not a digit or a decimal
 *     point, so the encoding accident cannot change a number.
 *   - The API is undocumented and unversioned with no changelog. Every field is
 *     read defensively by key substring, not by exact key, because the tile
 *     labels are display strings.
 *   - These hosts also expose WRITE endpoints (updateWorkReviewByCitizen,
 *     mailing-list/unsubscribe). This ETL never calls them; FORBIDDEN below is
 *     asserted against every URL before it is fetched.
 */
import { openSink } from "./lib/sink.mjs"
import { postJson, politeFetch } from "./lib/http.mjs"
import { loadPcReference, loadAliases, aliasCandidate } from "./lib/pc-reference.mjs"
import { opt, banner, run } from "./lib/cli.mjs"

const LOADER = "esakshi-mplads"

const ESAKSHI = "https://mplads.mospi.gov.in/rest/PreLoginDashboardData"
const ENDPOINTS = {
  states: `${ESAKSHI}/getStateData`,
  constituencies: `${ESAKSHI}/getConstituencyData`,
  mpsForConstituency: `${ESAKSHI}/getMpAndConstCombo`,
  tiles: `${ESAKSHI}/getTilesData`,
  tenures: `${ESAKSHI}/getTenureData`,
}
const EMPOWERED_INDIAN = "https://api.empoweredindian.in/api"

/** House codes as eSAKSHI encodes them. Not the same as in_mps.house. */
const HOUSE_CODE = { RS: "1", LS: "2" }

/** Endpoints on these hosts that mutate state. Never call these. */
const FORBIDDEN = ["updateWorkReviewByCitizen", "mailing-list/unsubscribe"]

function assertReadOnly(url) {
  for (const f of FORBIDDEN) {
    if (url.includes(f)) throw new Error(`refusing to call a write endpoint: ${url}`)
  }
  return url
}

/* -------------------------------------------------------------------------- */
/* pure helpers — exported for tests                                          */
/* -------------------------------------------------------------------------- */

/**
 * "₹1,15,55,39,16,595.93" → 11555391659593 paise? No — rupees, keeping paise as
 * decimals: 115553916595.93. Indian digit grouping is irregular (2,2,3), so
 * never try to interpret the separators; strip them.
 */
export function parseIndianAmount(s) {
  if (s == null) return null
  const cleaned = String(s).replace(/[^0-9.]/g, "")
  if (!cleaned || cleaned === ".") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** A tile value is [amount] or [count, amount, croreLabel]; take the count. */
export function parseCount(v) {
  const first = Array.isArray(v) ? v[0] : v
  const n = Number.parseInt(String(first ?? "").replace(/[^0-9-]/g, ""), 10)
  return Number.isFinite(n) ? n : null
}

/** A tile value is [amount, croreLabel] or [count, amount, croreLabel]. */
export function parseTileAmount(v) {
  const arr = Array.isArray(v) ? v : [v]
  // The amount is the entry with a decimal part or the longest digit run.
  const candidates = arr.map(parseIndianAmount).filter(n => n != null)
  if (!candidates.length) return null
  return arr.length > 2 ? candidates[1] ?? candidates[0] : candidates[0]
}

/**
 * The tiles object uses display labels as keys, and those labels change
 * ("Allocated Limit" nationally vs "Allocated Limit for Hon'ble MPs" per MP).
 * Match on a substring of the label rather than on an exact key.
 */
export function readTiles(tiles) {
  const entries = Object.entries(tiles ?? {})
  const find = (...needles) => {
    for (const [k, v] of entries) {
      const key = k.toLowerCase()
      if (needles.every(n => key.includes(n))) return v
    }
    return null
  }
  /**
   * Count tiles must be matched on a label that BEGINS with "works".
   * "Expenditure on Completed and On-going Works as on Date" contains both
   * "works" and "completed", so a loose substring match reads a rupee figure
   * as a work count — which is how this first blew up (integer out of range on
   * a ₹10-crore "count"). Anchoring the label is the fix.
   */
  const findWorks = needle => {
    for (const [k, v] of entries) {
      const key = k.toLowerCase().trim()
      if (/^works?\b/.test(key) && key.includes(needle)) return v
    }
    return null
  }
  const allocated = parseTileAmount(find("allocated"))
  const expenditure = parseTileAmount(find("expenditure"))
  const count = v => {
    const n = parseCount(v)
    // A work count in the millions is a misread tile, not a real number.
    return n != null && n >= 0 && n < 1e6 ? n : null
  }
  return {
    allocated_inr: allocated,
    expenditure_inr: expenditure,
    unspent_inr: allocated != null && expenditure != null
      ? Math.round((allocated - expenditure) * 100) / 100 : null,
    utilization_pct: allocated ? Math.round((expenditure / allocated) * 10000) / 100 : null,
    works_recommended: count(findWorks("recommended")),
    works_sanctioned: count(findWorks("sanction")),
    works_completed: count(findWorks("completed")),
  }
}

/** "18th Lok Sabha" → "LS18", so it lines up with in_mps.term_label. */
export function tenureToTermLabel(caption) {
  const m = /(\d+)\s*(?:st|nd|rd|th)?\s*lok\s*sabha/i.exec(String(caption ?? ""))
  return m ? `LS${m[1]}` : String(caption ?? "").trim() || "unknown"
}

/* -------------------------------------------------------------------------- */

async function esakshiPost(url, payload) {
  return postJson(assertReadOnly(url), payload, {
    namespace: "esakshi", delayMs: 900, maxAgeMs: 24 * 3600e3,
  })
}

async function loadEsakshi(sink, { reference, aliases, stateFilter }) {
  const tenures = await esakshiPost(ENDPOINTS.tenures, { uname: `0,0,0,${HOUSE_CODE.LS}` })
  // Highest ID = current tenure; the caption is what names the term.
  const tenure = (tenures ?? []).slice().sort((a, b) => Number(b.ID) - Number(a.ID))[0]
  if (!tenure) throw new Error("getTenureData returned no tenures")
  const termLabel = tenureToTermLabel(tenure.CAPTION)
  sink.note(`eSAKSHI tenure ${tenure.ID} = "${tenure.CAPTION}" → term_label ${termLabel}`)

  let states = await esakshiPost(ENDPOINTS.states, {})
  if (stateFilter) {
    const want = stateFilter.toLowerCase()
    states = (states ?? []).filter(s => String(s.STATE_NAME).toLowerCase().includes(want))
  }
  sink.count("eSAKSHI states", states.length)

  const rows = []
  const aliasCandidates = []
  for (const st of states) {
    const constituencies = await esakshiPost(ENDPOINTS.constituencies, { id: String(st.STATE_ID) })
    for (const c of constituencies ?? []) {
      if (c.CAPTION == null) continue
      const mps = await esakshiPost(ENDPOINTS.mpsForConstituency, {
        const_combo: `${c.ID},${HOUSE_CODE.LS},${tenure.ID}`,
      })
      if (!mps?.length) {
        sink.warn(`no MP for eSAKSHI constituency ${c.ID} (${c.CAPTION}, ${st.STATE_NAME})`)
        continue
      }
      const res = reference?.resolve({
        source: "esakshi", sourceKey: String(c.ID),
        stateName: st.STATE_NAME, name: c.CAPTION, aliases,
      }) ?? { pc_code: null, reason: "no_pc_reference" }
      if (!res.pc_code) {
        aliasCandidates.push(aliasCandidate({
          source: "esakshi", sourceKey: c.ID, sourceLabel: c.CAPTION,
          stateName: st.STATE_NAME, reason: res.reason,
          extra: { esakshi_state_id: st.STATE_ID, mp: mps[0]?.CAPTION },
        }))
      }

      for (const mp of mps) {
        const tiles = await esakshiPost(ENDPOINTS.tiles, {
          uname: `${st.STATE_ID},${c.ID},${mp.ID},${HOUSE_CODE.LS},${tenure.ID}`,
        })
        rows.push({
          ...readTiles(tiles),
          pc_code: res.pc_code,
          house: "LS",
          term_label: termLabel,
          source: "esakshi",
          source_mp_key: String(mp.ID),
          source_constituency_key: String(c.ID),
          mp_name_source: String(mp.CAPTION ?? "").trim() || null,
          captured_at: new Date().toISOString(),
          data_source: "eSAKSHI pre-login dashboard (mplads.mospi.gov.in)",
        })
      }
    }
    sink.count(`constituencies walked (${st.STATE_NAME})`, (constituencies ?? []).length)
  }
  return { rows, aliasCandidates }
}

async function loadEmpoweredIndian(sink, { reference, aliases }) {
  const rows = []
  const aliasCandidates = []
  const pageSize = 500
  for (let page = 1; page <= 20; page++) {
    const body = await politeFetch(
      assertReadOnly(`${EMPOWERED_INDIAN}/summary/mps?page=${page}&limit=${pageSize}`),
      { namespace: "empoweredindian", delayMs: 1200, maxAgeMs: 24 * 3600e3 })
    const list = body?.data ?? []
    if (!list.length) break
    for (const m of list) {
      const house = /rajya/i.test(m.house ?? "") ? "RS" : "LS"
      let pc_code = null
      if (house === "LS") {
        const res = reference?.resolve({
          source: "empoweredindian", sourceKey: String(m.id ?? m._id ?? ""),
          stateName: m.state, name: m.constituency, aliases,
        }) ?? { pc_code: null, reason: "no_pc_reference" }
        pc_code = res.pc_code
        if (!pc_code) {
          aliasCandidates.push(aliasCandidate({
            source: "empoweredindian", sourceKey: m.id ?? m._id,
            sourceLabel: m.constituency, stateName: m.state, reason: res.reason,
            extra: { mp: m.mpName },
          }))
        }
      }
      rows.push({
        pc_code,
        house,
        // Empowered Indian does not publish a term; keep the LS18 label for LS
        // rows so they sit next to the eSAKSHI ones, and mark RS explicitly.
        term_label: house === "LS" ? "LS18" : "RS-sitting",
        source: "empoweredindian",
        source_mp_key: String(m.id ?? m._id ?? m.mpName),
        source_constituency_key: m.constituency ?? null,
        mp_name_source: m.mpName ?? null,
        allocated_inr: Number.isFinite(m.allocatedAmount) ? m.allocatedAmount : null,
        expenditure_inr: Number.isFinite(m.totalExpenditure) ? m.totalExpenditure : null,
        unspent_inr: Number.isFinite(m.unspentAmount) ? m.unspentAmount : null,
        utilization_pct: Number.isFinite(m.utilizationPercentage)
          ? Math.round(m.utilizationPercentage * 100) / 100 : null,
        works_recommended: Number.isFinite(m.recommendedWorksCount) ? m.recommendedWorksCount : null,
        works_sanctioned: null,
        works_completed: Number.isFinite(m.completedWorksCount) ? m.completedWorksCount : null,
        captured_at: new Date().toISOString(),
        data_source: "empoweredindian.in (unofficial third party — not a primary-source citation)",
      })
    }
    if (list.length < pageSize) break
  }
  return { rows, aliasCandidates }
}

/* -------------------------------------------------------------------------- */

async function main() {
  const source = (opt("source", "esakshi") ?? "esakshi").toLowerCase()
  const stateFilter = opt("state")
  const apply = banner(LOADER, { source, state: stateFilter ?? "all" })
  if (!["esakshi", "empoweredindian"].includes(source)) {
    console.error(`--source must be esakshi or empoweredindian (in_mplads_summary_source_chk)`)
    process.exit(1)
  }
  const sink = openSink({ loader: LOADER, apply })

  const reference = await loadPcReference(sink)
  const aliases = await loadAliases(sink, [source])

  const mpRows = await sink.select("in_mps", { columns: "id,pc_code,mpsno,house,status,term_label" })
  const sittingByPc = new Map(mpRows
    .filter(m => m.house === "LS" && m.status === "Sitting" && m.pc_code)
    .map(m => [m.pc_code, m]))
  sink.count("sitting LS MPs available to link", sittingByPc.size)

  const { rows, aliasCandidates } = source === "esakshi"
    ? await loadEsakshi(sink, { reference, aliases, stateFilter })
    : await loadEmpoweredIndian(sink, { reference, aliases })

  for (const r of rows) {
    const mp = r.pc_code ? sittingByPc.get(r.pc_code) : null
    r.mp_id = mp?.id ?? null
    r.mpsno = mp?.mpsno ?? null
    // in_mplads_summary_pc_only_for_ls
    if (r.house !== "LS") r.pc_code = null
  }

  sink.count("summary rows", rows.length)
  sink.count("resolved to a pc_code", rows.filter(r => r.pc_code).length)
  sink.count("linked to an in_mps row", rows.filter(r => r.mp_id).length)
  sink.count("with an allocated amount", rows.filter(r => r.allocated_inr != null).length)
  if (aliasCandidates.length) sink.review("alias-candidates", aliasCandidates)

  await sink.upsert("in_mplads_summary", rows, {
    conflict: ["source", "house", "term_label", "source_mp_key"], batch: 200,
  })
  sink.finish({ source })
}

run(main, import.meta.url)
