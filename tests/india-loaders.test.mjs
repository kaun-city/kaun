/**
 * Unit tests for the India loaders (scripts/india/).
 *
 * These test the parsing and transform logic — the parts that must not change
 * silently — against fixtures, with no network and no database. The integration
 * behaviour (real endpoints, real Postgres) is covered by running the loaders
 * against a local throwaway database; see the PR description.
 *
 * A lot of these assert what the code must NOT do: not fuzzy-match a
 * constituency, not turn an absent criminal-case widget into "unknown", not
 * write 0 for a minister, not drop a geometry column silently.
 *
 * Run: node --test tests/india-loaders.test.mjs
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "fs"

import {
  sqlLiteral, quote, ident, buildUpsertSql, toCsv,
} from "../scripts/india/lib/sink.mjs"
import {
  normalizeStateName, PcReference, aliasCandidate,
} from "../scripts/india/lib/pc-reference.mjs"
import {
  toMultiPolygon, ringArea, sanitizeMultiPolygon, geomSql,
  indexDatameet, indexShijithpk, buildRows, REDELIMITED_ST_CODES,
} from "../scripts/india/seed-constituencies.mjs"
import {
  clean, parseDate, parseTimestamp, rsDisplayName, lsMemberRow, rsMemberRow,
  parsePrsMpTrack, MINISTER_NOTE_RE,
} from "../scripts/india/sansad-roster.mjs"
import {
  parseRupees, parseConstituencyIndex, parseWinnerFromList, parseTitle,
  parseCandidateDetail, parseOtherElections, parseCriminalCharges, samePartyish,
  peelTrailingParens, looksLikeAbbreviation, partyLabels,
} from "../scripts/india/myneta-affidavits.mjs"
import {
  parseDmy, applyMinisterRule, attendancePct, memberForSeat, parsePrsAttendance, parsePrsInt,
  parseMpCodes, parseNameList, nameKey, MINISTER_EXCLUSION_REASON,
} from "../scripts/india/mp-activity.mjs"
import {
  parseIndianAmount, parseCount, readTiles, tenureToTermLabel,
} from "../scripts/india/esakshi-mplads.mjs"
import {
  monthCellToDate, monthsBetween, monthFromFilename, parseHomeReports,
  parseArchiveReports, classifyState, KNOWN_FIELDS,
} from "../scripts/india/load-central-projects.mjs"
import {
  colIndex, unescapeXml, parseSharedStrings, readXlsx,
} from "../scripts/india/lib/xlsx.mjs"
import { SQL as STALENESS_SQL } from "../scripts/migrate-india-project-staleness.mjs"

/* ========================================================================== */
/* sink — SQL generation                                                      */
/* ========================================================================== */

test("sqlLiteral encodes every value kind the loaders produce", () => {
  assert.equal(sqlLiteral(null), "NULL")
  assert.equal(sqlLiteral(undefined), "NULL")
  assert.equal(sqlLiteral(true), "true")
  assert.equal(sqlLiteral(12.5), "12.5")
  assert.equal(sqlLiteral("Bengaluru"), "'Bengaluru'")
  assert.equal(sqlLiteral("O'Brien"), "'O''Brien'")
  assert.equal(sqlLiteral({ a: 1 }), `'{"a":1}'::jsonb`)
  assert.equal(sqlLiteral([{ count: 2 }]), `'[{"count":2}]'::jsonb`)
  assert.throws(() => sqlLiteral(Number.NaN), /non-finite/)
})

test("a quote inside a value cannot break out of its literal", () => {
  const nasty = "'); DROP TABLE in_mps; --"
  const sql = buildUpsertSql("in_mps", [{ name: nasty }], { conflict: [] })
  // The payload survives verbatim with its quote DOUBLED, so it stays inside
  // one literal instead of terminating it.
  assert.ok(sql.includes("'''); DROP TABLE in_mps; --'"))
  // Every quote is either a delimiter or half of a doubled pair, so the count
  // is even and no literal is left open.
  assert.equal((sql.match(/'/g) ?? []).length % 2, 0)
  assert.equal(sqlLiteral(nasty).slice(1, -1).replace(/''/g, ""), "); DROP TABLE in_mps; --")
})

test("ident refuses anything that is not a plain identifier", () => {
  assert.equal(ident("in_mps"), '"in_mps"')
  assert.throws(() => ident("in_mps; drop"), /unsafe identifier/)
})

test("buildUpsertSql includes raw expression columns that are not row keys", () => {
  // The bug this locks down: geom is computed from the row, not a key on it, so
  // an earlier version dropped it and wrote 543 rows with a NULL geometry.
  const sql = buildUpsertSql("in_constituencies", [{ pc_code: "29-25" }], {
    conflict: ["pc_code"],
    raw: { geom: () => "ST_Multi(ST_GeomFromGeoJSON('{}'))" },
  })
  assert.ok(sql.includes('"geom"'))
  assert.ok(sql.includes("ST_Multi(ST_GeomFromGeoJSON('{}'))"))
  assert.ok(sql.includes('ON CONFLICT ("pc_code") DO UPDATE'))
})

test("updateExpressions let a column merge instead of overwrite", () => {
  const sql = buildUpsertSql("in_central_projects",
    [{ project_code: "612786", first_seen_month: "2026-05-01" }], {
      conflict: ["project_code"],
      updateExpressions: {
        first_seen_month: `LEAST("in_central_projects".first_seen_month, EXCLUDED.first_seen_month)`,
      },
    })
  assert.ok(sql.includes('LEAST("in_central_projects".first_seen_month, EXCLUDED.first_seen_month)'))
})

test("updateColumns restricts what a pass is allowed to overwrite", () => {
  // mp-activity relies on this: the questions pass must not blank attendance.
  const sql = buildUpsertSql("in_mp_activity",
    [{ mp_id: 1, period_kind: "session", session_no: 3, questions_asked: 24 }], {
      conflict: ["mp_id", "period_kind", "session_no"],
      updateColumns: ["questions_asked"],
    })
  assert.ok(sql.includes('"questions_asked" = EXCLUDED."questions_asked"'))
  assert.ok(!sql.includes('"signed_days"'))
})

test("toCsv quotes embedded commas, quotes and newlines", () => {
  const csv = toCsv([{ a: 'x,"y"\nz', b: null }])
  assert.equal(csv, 'a,b\n"x,""y""\nz",\n')
})

/* ========================================================================== */
/* pc-reference — state names and the no-fuzzy-matching rule                  */
/* ========================================================================== */

test("state-name normalization folds only connector noise", () => {
  const same = [
    ["Jammu & Kashmir", "Jammu and Kashmir", "Jammu And Kashmir"],
    ["Andaman & Nicobar", "Andaman and Nicobar Islands", "Andaman And Nicobar Islands"],
    ["Delhi", "NCT of Delhi"],
    ["Dadra and Nagar Haveli and Daman and Diu", "The Dadra And Nagar Haveli And Daman And Diu"],
  ]
  for (const group of same) {
    const norms = new Set(group.map(normalizeStateName))
    assert.equal(norms.size, 1, `${group.join(" / ")} should normalize alike, got ${[...norms]}`)
  }
  // …and never folds two genuinely different states together.
  assert.notEqual(normalizeStateName("Telangana"), normalizeStateName("Andhra Pradesh"))
  assert.notEqual(normalizeStateName("Ladakh"), normalizeStateName("Jammu & Kashmir"))
})

const REF = new PcReference([
  { pc_code: "29-25", st_code: 29, pc_no: 25, state_name: "Karnataka", pc_name: "Bangalore Central", pc_name_norm: "bangalore central" },
  { pc_code: "29-24", st_code: 29, pc_no: 24, state_name: "Karnataka", pc_name: "Bangalore North", pc_name_norm: "bangalore north" },
  { pc_code: "36-6", st_code: 36, pc_no: 6, state_name: "Telangana", pc_name: "Mahabubnagar", pc_name_norm: "mahabubnagar" },
  { pc_code: "25-1", st_code: 25, pc_no: 1, state_name: "Dadra and Nagar Haveli and Daman and Diu", pc_name: "Daman & Diu", pc_name_norm: "daman diu" },
  { pc_code: "26-2", st_code: 26, pc_no: 2, state_name: "Dadra and Nagar Haveli and Daman and Diu", pc_name: "Dadra & Nagar Haveli", pc_name_norm: "dadra nagar haveli" },
], "fixture")

test("resolution is exact-within-state, never a similarity guess", () => {
  assert.deepEqual(
    REF.resolve({ source: "sansad", sourceKey: "1", stateName: "Karnataka", name: "Bangalore Central" }),
    { pc_code: "29-25", method: "exact_normalized" })

  // The whole reason in_pc_source_aliases exists: sansad says "Mahbubnagar",
  // the crosswalk says "Mahabubnagar". One letter. It must NOT auto-fold.
  const near = REF.resolve({ source: "sansad", sourceKey: "2", stateName: "Telangana", name: "Mahbubnagar" })
  assert.equal(near.pc_code, null)
  assert.equal(near.reason, "no_exact_match")

  // …and it resolves once a human has recorded the alias.
  const aliases = new Map([["sansad:2", "36-6"]])
  assert.deepEqual(
    REF.resolve({ source: "sansad", sourceKey: "2", stateName: "Telangana", name: "Mahbubnagar", aliases }),
    { pc_code: "36-6", method: "alias_table" })
})

test("a reservation suffix is orthographic noise, a wrong state is not", () => {
  assert.equal(
    REF.resolve({ source: "esakshi", sourceKey: "x", stateName: "Karnataka", name: "BANGALORE NORTH(SC)" }).pc_code,
    "29-24")
  assert.equal(
    REF.resolve({ source: "esakshi", sourceKey: "x", stateName: "Atlantis", name: "Bangalore North" }).reason,
    "unknown_state")
})

test("a UT spanning two st_codes resolves per seat, and refuses when ambiguous", () => {
  // Dadra & Nagar Haveli and Daman & Diu merged but kept Census codes 25 and 26.
  assert.equal(
    REF.resolve({ source: "sansad", sourceKey: "a", stateName: "Dadra and Nagar Haveli and Daman and Diu", name: "Daman & Diu" }).pc_code,
    "25-1")
  const ambiguous = new PcReference([
    { pc_code: "25-1", st_code: 25, pc_no: 1, state_name: "X", pc_name: "Same", pc_name_norm: "same" },
    { pc_code: "26-1", st_code: 26, pc_no: 1, state_name: "X", pc_name: "Same", pc_name_norm: "same" },
  ], "fixture")
  assert.equal(
    ambiguous.resolve({ source: "s", sourceKey: "k", stateName: "X", name: "Same" }).reason,
    "ambiguous_across_state_codes")
})

test("an alias candidate is a proposal, never a decision", () => {
  const c = aliasCandidate({
    source: "sansad", sourceKey: 371, sourceLabel: "Andaman and Nicobar Islands",
    stateName: "Andaman and Nicobar Islands", reason: "no_exact_match",
  })
  assert.equal(c.pc_code, "")      // a human fills these in
  assert.equal(c.method, "")
  assert.equal(c.reviewed_by, "")
  assert.equal(c.unresolved_reason, "no_exact_match")
})

/* ========================================================================== */
/* seed-constituencies — geometry                                             */
/* ========================================================================== */

const SQUARE = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]

test("Polygon is normalised to MultiPolygon before it reaches SQL", () => {
  assert.deepEqual(toMultiPolygon({ type: "Polygon", coordinates: [SQUARE] }),
    { type: "MultiPolygon", coordinates: [[SQUARE]] })
  assert.throws(() => toMultiPolygon({ type: "LineString", coordinates: [] }), /unsupported/)
})

test("ringArea measures enclosure, not vertex count", () => {
  assert.equal(ringArea(SQUARE), 1)
  assert.equal(ringArea([[0, 0], [1, 1], [0, 0]]), 0)
})

test("degenerate rings are dropped so ST_MakeValid cannot return NULL", () => {
  // The real defect: DataMeet's Bharatpur (8-9) is a 602-part MultiPolygon
  // containing rings with fewer than four positions. PostGIS parses it, then
  // ST_MakeValid returns NULL ("Too few points in geometry component") and the
  // row lands with no boundary at all — silently.
  const dirty = {
    type: "MultiPolygon",
    coordinates: [
      [SQUARE],
      [[[5, 5], [5, 6], [5, 5]]],        // zero-area sliver
      [[[9, 9], [9, 9]]],                // too few points
    ],
  }
  const out = sanitizeMultiPolygon(dirty)
  assert.equal(out.geometry.coordinates.length, 1)
  assert.equal(out.droppedPolygons, 2)
  assert.equal(out.droppedRings, 2)
  assert.deepEqual(out.geometry.coordinates[0][0], SQUARE)
})

test("an unclosed ring is closed rather than discarded", () => {
  const open = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0]]] }
  const out = sanitizeMultiPolygon(open)
  const ring = out.geometry.coordinates[0][0]
  assert.deepEqual(ring[0], ring[ring.length - 1])
  assert.equal(out.droppedRings, 0)
})

test("geomSql produces a valid-multipolygon expression with SRID 4326", () => {
  const sql = geomSql({ type: "Polygon", coordinates: [SQUARE] })
  assert.match(sql, /^ST_Multi\(ST_CollectionExtract\(ST_MakeValid\(ST_SetSRID\(ST_GeomFromGeoJSON\('/)
  assert.match(sql, /\), 4326\)\), 3\)\)$/)
})

test("geometry joins on IDs and prefers the 2024 supplement for re-delimited states", () => {
  const geom = { type: "Polygon", coordinates: [SQUARE] }
  const datameet = indexDatameet({ features: [
    { properties: { st_code: 29, pc_no: 25, pc_id: 4029, pc_name_hi: "x", wikidata_qid: "Q1" }, geometry: geom },
    { properties: { st_code: 18, pc_no: 5, pc_id: 1805 }, geometry: geom },
  ] })
  const shijithpk = indexShijithpk({ features: [
    { properties: { unique_id: "S10_25", ls_seat_code: "25" }, geometry: geom },
    { properties: { unique_id: "S03_5", ls_seat_code: "5" }, geometry: geom },
    { properties: { unique_id: "U08_999", ls_seat_code: "999" }, geometry: geom },   // not a seat
  ] })
  assert.ok(!shijithpk.has("U08_999"), "ls_seat_code 999 is filler, not a constituency")

  const { rows, problems } = buildRows([
    { st_code: 29, pc_no: 25, state_name: "Karnataka", pc_name: "Bangalore Central",
      pc_name_norm: "bangalore central", pc_id: "S10_25", pc_code_datameet: "29-25",
      reserved_for: null, reserved_source: null },
    { st_code: 18, pc_no: 5, state_name: "Assam", pc_name: "Guwahati",
      pc_name_norm: "guwahati", pc_id: "S03_5", pc_code_datameet: "18-5",
      reserved_for: "ST", reserved_source: "2023-delimitation-order" },
  ], { datameet, shijithpk })

  assert.equal(problems.length, 0)
  assert.equal(rows[0].row.geom_source, "datameet")
  assert.equal(rows[0].row.pc_id_datameet, 4029)
  // Assam is re-delimited (2023), so DataMeet's boundary must not be used.
  assert.ok(REDELIMITED_ST_CODES.has(18))
  assert.equal(rows[1].row.geom_source, "shijithpk-2024")
  assert.equal(rows[1].row.pc_id_datameet, null)
})

test("a reservation without a source is dropped, not smuggled in", () => {
  // in_constituencies_reserved_has_source would reject it at INSERT; the loader
  // must not get there with a half-attributed claim.
  const geom = { type: "Polygon", coordinates: [SQUARE] }
  const datameet = indexDatameet({ features: [
    { properties: { st_code: 29, pc_no: 25, pc_id: 1, pc_category: "SC" }, geometry: geom }] })
  const { rows } = buildRows([{
    st_code: 29, pc_no: 25, state_name: "Karnataka", pc_name: "X", pc_name_norm: "x",
    pc_id: null, pc_code_datameet: "29-25", reserved_for: null, reserved_source: null,
  }], { datameet, shijithpk: new Map() })
  assert.equal(rows[0].row.reserved_for, null)
  assert.equal(rows[0].row.reserved_source, null)
})

/* ========================================================================== */
/* sansad-roster                                                              */
/* ========================================================================== */

test("sansad's fixed-width padding is cleaned without losing content", () => {
  assert.equal(clean("Kerala                       "), "Kerala")
  assert.equal(clean("   "), null)
  assert.equal(clean(null), null)
})

test("both sansad date dialects parse to ISO", () => {
  assert.equal(parseDate("1968-08-31"), "1968-08-31")   // LS
  assert.equal(parseDate("01/07/1950"), "1950-07-01")   // RS, DD/MM/YYYY
  assert.equal(parseDate("7/1/1950"), "1950-01-07")
  assert.equal(parseDate(""), null)
  assert.equal(parseTimestamp("2025-08-15 14:09:37.975701"), "2025-08-15T14:09:37.975Z")
})

test("RS publishes 'Surname, Honorific' and it is reduced to a name", () => {
  assert.equal(rsDisplayName({ name: "Abdul Wahab, Shri " }), "Abdul Wahab")
  assert.equal(rsDisplayName({ name: "  ", lastName: "Fallback  " }), "Fallback")
})

test("an LS member row carries no reserved status and no pc_code of its own", () => {
  const row = lsMemberRow({
    mpsno: 5814, mpFirstLastName: "Mani A", stateName: "Tamil Nadu", constName: "Dharmapuri",
    partySname: "DMK", partyFname: "Dravida Munnetra Kazhagam", gender: "Male",
    dob: "1968-08-31", age: 57, noOfTerms: 1, qualification: "Graduate",
    profession: "Advocate", profession2: "Agriculturist", status: "Sitting",
    categoryCode: "SC", updatedAt: "2025-08-15 14:09:37.975701",
  })
  assert.equal(row.mpsno, 5814)
  assert.equal(row.house, "LS")
  assert.equal(row.term_label, "LS18")
  assert.equal(row.profession, "Advocate; Agriculturist")
  // categoryCode is badly under-populated upstream; in_constituencies owns it.
  assert.ok(!("categoryCode" in row) && !("reserved_for" in row))
  assert.ok(!("pc_code" in row))
})

test("an RS row keeps its own minister flag and never a pc_code", () => {
  const row = rsMemberRow({
    mpsno: 1929, name: "Abdul Wahab, Shri ", state: "Kerala      ", party: "IUML",
    partyCode: "IUML", term: "2021-2027", termCount: 3, status: "Sitting",
    currentMinister: true, notificationDate: "24/04/2021", expirationDate: "23/04/2027",
  })
  assert.equal(row.house, "RS")
  assert.equal(row.term_label, "RS-2021-2027")
  assert.equal(row.constituency_label, null)
  assert.equal(row.is_minister, true)
  assert.equal(row.term_start, "2021-04-24")
})

test("PRS's minister sentence is what sets the exclusion flag", () => {
  const csv = [
    "mp_name,pc_name,state,mp_note,mp_house",
    '"Harsh Malhotra","East Delhi","Delhi","This MP is a minister. Ministers represent the government in debates, so we do not report their participation.","Lok Sabha"',
    '"Someone Else","Dharmapuri","Tamil Nadu","","Lok Sabha"',
    '"RS Member","","Kerala","","Rajya Sabha"',
  ].join("\n")
  const rows = parsePrsMpTrack(csv)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].is_minister, true)
  assert.equal(rows[1].is_minister, false)
  assert.equal(rows[2].house, "RS")
  assert.ok(MINISTER_NOTE_RE.test("This MP is a minister."))
  assert.ok(!MINISTER_NOTE_RE.test("This MP asked 40 questions."))
})

/* ========================================================================== */
/* myneta-affidavits                                                          */
/* ========================================================================== */

test("rupee amounts are parsed losslessly in whole rupees", () => {
  assert.equal(parseRupees("Rs&nbsp;81,30,65,207"), 813065207)
  assert.equal(parseRupees("Rs75,55,29,306"), 755529306)
  assert.equal(parseRupees("Nil"), null)
  assert.equal(parseRupees(null), null)
})

const LIST_HTML = `
<tr>
  <td> 12 </td>
  <td><a href=candidate.php?candidate_id=1866>P C Mohan</a><b>&nbsp&nbsp<font color=green size=1> Winner </font></td>
  <td>BJP</td>
  <td align=center><span class='w3-badge'><b> 2 </b></span></td>
  <td>12th Pass</td><td>60</td>
  <td align=right><img src=https://myneta.info/image_v2.php?candidate_id=1866&col=ta></td>
</tr>
<tr>
  <td> 13 </td>
  <td><a href=candidate.php?candidate_id=9999>Runner Up</a></td>
  <td>INC</td>
</tr>`

test("only the green-flagged winner is taken from a list page", () => {
  const w = parseWinnerFromList(LIST_HTML)
  assert.equal(w.myneta_candidate_id, 1866)
  assert.equal(w.candidate_name, "P C Mohan")
  assert.equal(w.party_abbr, "BJP")
})

test("assets are never read off a list page (they are images there)", () => {
  // Regression guard for the documented anti-scraping trap: the winner's
  // Total Assets cell on show_candidates is an <img src=image_v2.php>.
  assert.ok(/image_v2\.php/.test(LIST_HTML))
  const w = parseWinnerFromList(LIST_HTML)
  assert.ok(!("total_assets_inr" in w))
})

test("the state → constituency map is read off the single index page", () => {
  const html = `
    <div class='w3-dropdown-click w3-block'>
      <button class='w3-button w3-block dropbtnJS'> KARNATAKA <span class='w3-right'></span></button>
      <div id=item_16>
        <a href=index.php?action=show_constituencies&state_id=16> ALL CONSTITUENCIES </a>
        <a href=index.php?action=show_candidates&constituency_id=185 title='x'>BANGALORE CENTRAL</a>
        <a href=index.php?action=show_candidates&constituency_id=184 title='x'>BANGALORE NORTH</a>
      </div>
    </div>`
  const out = parseConstituencyIndex(html)
  assert.equal(out.length, 2)
  assert.deepEqual(out[0], { state: "KARNATAKA", myneta_constituency_id: 185, constituency_label: "BANGALORE CENTRAL" })
})

const DETAIL_HTML = `
<title>P C Mohan(Bharatiya Janata Party(BJP)):Constituency- BANGALORE CENTRAL(KARNATAKA) - Affidavit Information of Candidate:</title>
<div><b>Age:</b> 60 </div>
<p> <b>Self Profession:</b>Business and Social Worker<br> <b>Spouse Profession:</b>Business </p>
<table class='w3-table w3-striped w3-centered'>
<tr valign=top><th colspan=3>Other Elections </th></tr>
<tr><th>Declaration in</th><th>Declared Assets</th><th>Declared Cases</th></tr>
<tr><td><b>Lok Sabha 2019</b></td><td><b>Rs75,55,29,306</b><span>~75 Crore+</span></td><td>0</td></tr>
<tr><td><b>Loksabha 2014</b></td><td><b>Rs47,57,96,999</b><span>~47 Crore+</span></td><td>2</td></tr>
</table>
<div align=center> Number of Criminal Cases: <span style='font-weight:bold'>2</span></div>
<table class='w3-table w3-striped'>
<tr><td> Assets: </td><td> <b>Rs&nbsp;81,30,65,207</b><span> ~81&nbsp;Crore+</span> </td></tr>
<tr><td> Liabilities: </td><td> <b>Rs&nbsp;16,56,94,024</b><span> ~16&nbsp;Crore+</span> </td></tr>
</table>
<h3>Educational Details</h3> <hr> Category: 12th Pass <br> 2nd PUC, Vijaya College, Bengaluru, 1981 </div>
<h4>Brief Details of IPC / BNS </h4><div class='w3-small'><ul>
<li><span class='w3-badge'><b>1 </span> charges related to False statement in connection with an election (IPC Section-171G)</b><br>
<li><span class='w3-badge'><b>1 </span> charges related to Giving false evidence (IPC Section-191)</b><br>
</ul></div>`

test("a candidate detail page yields the full MLA-equivalent field set", () => {
  const d = parseCandidateDetail(DETAIL_HTML)
  assert.equal(d.candidate_name, "P C Mohan")
  assert.equal(d.party_abbr, "BJP")
  assert.equal(d.party_full, "Bharatiya Janata Party")
  assert.equal(d.state_label, "KARNATAKA")
  assert.equal(d.age, 60)
  assert.equal(d.self_profession, "Business and Social Worker")
  assert.equal(d.spouse_profession, "Business")
  assert.equal(d.education_category, "12th Pass")
  assert.equal(d.education_detail, "2nd PUC, Vijaya College, Bengaluru, 1981")
  assert.equal(d.total_assets_inr, 813065207)
  assert.equal(d.liabilities_inr, 165694024)
  assert.equal(d.criminal_cases, 2)
  assert.equal(d.criminal_cases_detail.length, 2)
  assert.equal(d.declared_assets_history.length, 2)
  assert.deepEqual(d.declared_assets_history[0],
    { election: "Lok Sabha 2019", declared_assets_inr: 755529306, declared_cases: 0 })
  assert.equal(d.parse_status, "ok")
})

test("ZERO criminal cases is an absent widget, and must be recorded as 0", () => {
  // The trap the MLA scrape fell into: `extract(...) ?? null` marks every clean
  // candidate as unknown. in_mp_affidavits_cases_explicit rejects a parsed row
  // with a NULL count, so absence has to become an explicit 0.
  const clean = DETAIL_HTML.replace(/<div align=center> Number of Criminal Cases:[\s\S]*?<\/div>/, "")
  assert.ok(!/Number of Criminal Cases/.test(clean))
  const d = parseCandidateDetail(clean)
  assert.equal(d.criminal_cases, 0)
  assert.notEqual(d.criminal_cases, null)
  assert.equal(d.parse_status, "ok")
})

test("an unparseable page reports failure instead of inventing a zero", () => {
  const d = parseCandidateDetail("<html><body>503 Service Unavailable</body></html>")
  assert.equal(d.parse_status, "failed")
  assert.equal(d.criminal_cases, null)
})

test("title parsing survives the unbalanced party parenthesis", () => {
  const t = parseTitle("<title>X Y(Indian National Congress(INC)):Constituency- SOMEWHERE(KERALA) - Affidavit</title>")
  assert.equal(t.candidate_name, "X Y")
  assert.equal(t.party_abbr, "INC")
  assert.equal(t.party_full, "Indian National Congress")
  assert.equal(t.state_label, "KERALA")
})

test("charge and other-election tables degrade to null, not to []", () => {
  assert.equal(parseCriminalCharges("<html></html>"), null)
  assert.equal(parseOtherElections("<html></html>"), null)
})

test("party agreement tolerates house style but not a real disagreement", () => {
  assert.equal(samePartyish("Ind.", "IND"), true)
  assert.equal(samePartyish("BJP", "BJP"), true)
  assert.equal(samePartyish("BJP", "INC"), false)
  assert.equal(samePartyish("BJP", null), null)     // unknown is not a disagreement
})

/* --- regressions from the first full 543-seat pass ------------------------ */

test("a trailing paren group is peeled by balance, not by regex", () => {
  assert.deepEqual(peelTrailingParens("P C Mohan(Bharatiya Janata Party(BJP))"),
    { before: "P C Mohan", inner: "Bharatiya Janata Party(BJP)" })
  // Delhi: the STATE itself contains parens, and the seat carries an (SC) tag.
  assert.deepEqual(peelTrailingParens("NORTH WEST DELHI (SC)(DELHI (NCT))"),
    { before: "NORTH WEST DELHI (SC)", inner: "DELHI (NCT)" })
  assert.deepEqual(peelTrailingParens("no parens here"),
    { before: "no parens here", inner: null })
  // Unbalanced input is left alone rather than mangled.
  assert.deepEqual(peelTrailingParens("broken ))"), { before: "broken ))", inner: null })
})

test("an abbreviation is short and unspaced; a faction name is not", () => {
  assert.equal(looksLikeAbbreviation("BJP"), true)
  assert.equal(looksLikeAbbreviation("JD(S)"), true)
  assert.equal(looksLikeAbbreviation("Uddhav Balasaheb Thackeray"), false)
  assert.equal(looksLikeAbbreviation("Ram Vilas"), false)
  assert.equal(looksLikeAbbreviation(""), false)
})

test("titles parse when the STATE contains parentheses (all 7 Delhi seats)", () => {
  // The first full pass marked every Delhi winner parse_status='failed' — the
  // state is published as "DELHI (NCT)" and the old regex required a state with
  // no parens in it. Seven seats silently lost their criminal-case counts.
  const t = parseTitle("<title>Yogender Chandoliya(Bharatiya Janata Party(BJP)):" +
    "Constituency- NORTH WEST DELHI (SC)(DELHI (NCT)) - Affidavit Information of Candidate:</title>")
  assert.equal(t.candidate_name, "Yogender Chandoliya")
  assert.equal(t.party_full, "Bharatiya Janata Party")
  assert.equal(t.party_abbr, "BJP")
  assert.equal(t.constituency_label, "NORTH WEST DELHI (SC)")
  assert.equal(t.state_label, "DELHI (NCT)")
})

test("a factional party name is not mistaken for an abbreviation", () => {
  // Old behaviour: party_full="ShivSena", party_abbr="Uddhav Balasaheb
  // Thackeray" — which turned every Shiv Sena (UBT) seat into a party conflict.
  const t = parseTitle("<title>Bandu Haribhau Jadhav(ShivSena (Uddhav Balasaheb Thackeray)):" +
    "Constituency- PARBHANI(MAHARASHTRA) - Affidavit Information of Candidate:</title>")
  assert.equal(t.candidate_name, "Bandu Haribhau Jadhav")
  assert.equal(t.party_full, "ShivSena (Uddhav Balasaheb Thackeray)")
  assert.equal(t.party_abbr, null)
  assert.equal(t.constituency_label, "PARBHANI")
  assert.equal(t.state_label, "MAHARASHTRA")
})

test("party comparison compares like with like, across both sides' labels", () => {
  // The 58 phantom conflicts on the first pass were MyNeta's FULL name compared
  // against sansad's ABBREVIATION. Both sides now offer everything they have.
  assert.equal(samePartyish(
    partyLabels("Nationalist Congress Party – Sharadchandra Pawar"),
    partyLabels("NCPSP", "Nationalist Congress Party - Sharadchandra Pawar")), true)
  assert.equal(samePartyish(
    partyLabels("Lok Janshakti Party(Ram Vilas)"),
    partyLabels("LJSP(RV)", "Lok Jan Shakti Party (Ram Vilas)")), true)
  // "&" and "and" are house style, exactly as for state names.
  assert.equal(samePartyish(
    partyLabels("Jammu & Kashmir National Conference"),
    partyLabels("J&KNC", "Jammu and Kashmir National Conference")), true)
  // A genuine conflict still fails, and is not folded away.
  assert.equal(samePartyish(partyLabels("BJP"), partyLabels("INC", "Indian National Congress")), false)
  // Transliteration differences are NOT folded — same rule as constituency
  // names. These stay flagged for a human.
  assert.equal(samePartyish(
    partyLabels("Aazad Samaj Party (Kanshi Ram)"),
    partyLabels("Azad Samaj Party (Kanshi Ram)")), false)
})

/* ========================================================================== */
/* mp-activity — the minister rule                                            */
/* ========================================================================== */

test("a minister's metrics are NULL, never 0", () => {
  // in_mp_activity_excluded_is_null_not_zero enforces this in the database; the
  // loader must never even attempt the row. A "worst attendance" ranking built
  // on ministerial zeros would be defamatory nonsense.
  const row = applyMinisterRule({
    mp_id: 1, signed_days: 0, attendance_pct: 0, questions_asked: 0, private_member_bills: 0,
  }, true)
  assert.equal(row.signed_days, null)
  assert.equal(row.attendance_pct, null)
  assert.equal(row.questions_asked, null)
  assert.equal(row.private_member_bills, null)
  assert.equal(row.metrics_excluded, true)
  assert.equal(row.metrics_excluded_reason, MINISTER_EXCLUSION_REASON)
  assert.ok(row.metrics_excluded_reason.length > 0)   // excluded_has_reason
})

test("a backbencher's real zero is preserved", () => {
  const row = applyMinisterRule({ mp_id: 2, signed_days: 0, attendance_pct: 0 }, false)
  assert.equal(row.signed_days, 0)
  assert.equal(row.attendance_pct, 0)
  assert.equal(row.metrics_excluded, false)
  assert.equal(row.metrics_excluded_reason, null)
})

test("attendance percentage is bounded and refuses a zero denominator", () => {
  assert.equal(attendancePct(2, 28), 7.14)
  assert.equal(attendancePct(28, 28), 100)
  assert.equal(attendancePct(5, 0), null)
  assert.equal(attendancePct(null, 20), null)
  assert.equal(attendancePct(30, 28), 100)      // in_mp_activity_attendance_range
})

test("PRS's NA and percent-or-fraction attendance both parse", () => {
  assert.equal(parsePrsAttendance("83%"), 83)
  assert.equal(parsePrsAttendance("0.83"), 83)
  assert.equal(parsePrsAttendance("NA"), null)
  assert.equal(parsePrsAttendance(""), null)
  assert.equal(parsePrsInt("1,234"), 1234)
  assert.equal(parsePrsInt("NA"), null)
})

test("sitting dates and Zenodo's python-repr columns parse", () => {
  assert.equal(parseDmy("24/06/2024"), "2024-06-24")
  assert.equal(parseDmy("garbage"), null)
  assert.deepEqual(parseMpCodes("[{'mpName': 'Shri Mani A', 'mpCode': 5814, 'mpPartCode': 1}]"), [5814])
  assert.deepEqual(parseNameList("['Shri Mani A', 'Dr. X Y']"), ["Shri Mani A", "Dr. X Y"])
  assert.deepEqual(parseNameList("[]"), [])
})

test("a by-election successor owns the seat's term row, not the member who died", () => {
  // Nanded (27-16). PRS publishes one row per seat describing whoever holds it
  // now; the roster holds both members. Writing the term row against the member
  // who died would put the successor's record under a dead member's name.
  const died = { id: 29, name: "Chavan Vasantrao Balwantrao", status: "Died" }
  const successor = { id: 1315, name: "Chavan Ravindra Vasantrao", status: "Sitting" }
  assert.equal(memberForSeat([died, successor])?.id, 1315)
  assert.equal(memberForSeat([successor, died])?.id, 1315)
})

test("a seat whose only member has died or resigned still gets its term row", () => {
  // Basirhat (19-18) and Nagaon (18-9). Their time in the House happened, PRS
  // still publishes it, and pass 1 already writes their session rows — dropping
  // only the term total would leave the page with sessions and no total.
  assert.equal(memberForSeat([{ id: 154, status: "Died" }])?.id, 154)
  assert.equal(memberForSeat([{ id: 64, status: "Resigned" }])?.id, 64)
  assert.equal(memberForSeat([{ id: 271, status: "Sitting" }])?.id, 271)
})

test("a roster the loader cannot read one member out of goes to review", () => {
  assert.equal(memberForSeat([]), null)
  assert.equal(memberForSeat(undefined), null)
  assert.equal(memberForSeat([{ id: 1, status: "Sitting" }, { id: 2, status: "Sitting" }]), null)
  assert.equal(memberForSeat([{ id: 1, status: "Died" }, { id: 2, status: "Resigned" }]), null)
})

test("PRS's own constituency spellings do not resolve, and must not", () => {
  // The 17 labels that cost 17 members their term row. Each one is a real seat
  // under a different spelling — which is an alias decision for a human, never
  // a similarity match here. What the loader owes is a loud, reviewable gap.
  const ref = new PcReference([
    { pc_code: "19-19", st_code: 19, pc_no: 19, state_name: "West Bengal", pc_name: "Jaynagar", pc_name_norm: "jaynagar" },
    { pc_code: "10-31", st_code: 10, pc_no: 31, state_name: "Bihar", pc_name: "Pataliputra", pc_name_norm: "pataliputra" },
    { pc_code: "26-2", st_code: 26, pc_no: 2, state_name: "Dadra and Nagar Haveli and Daman and Diu", pc_name: "Dadra & Nagar Haveli", pc_name_norm: "dadra nagar haveli" },
  ], "test")

  assert.equal(ref.resolve({ source: "prs", sourceKey: "West Bengal|Joynagar", stateName: "West Bengal", name: "Joynagar" }).pc_code, null)
  assert.equal(ref.resolve({ source: "prs", sourceKey: "Bihar|Patliputra", stateName: "Bihar", name: "Patliputra" }).pc_code, null)
  // PRS names the pre-merger UT, which is not the merged UT's name at all.
  assert.equal(
    ref.resolve({ source: "prs", sourceKey: "Dadra and Nagar Haveli|Dadra and Nagar Haveli", stateName: "Dadra and Nagar Haveli", name: "Dadra and Nagar Haveli" }).reason,
    "unknown_state")
  // The exact spelling still resolves — this is not a claim that PRS is broken.
  assert.equal(ref.resolve({ source: "prs", sourceKey: "West Bengal|Jaynagar", stateName: "West Bengal", name: "Jaynagar" }).pc_code, "19-19")
  // And a reviewed alias is what closes each gap.
  const aliases = new Map([["prs:West Bengal|Joynagar", "19-19"]])
  assert.equal(ref.resolve({ source: "prs", sourceKey: "West Bengal|Joynagar", stateName: "West Bengal", name: "Joynagar", aliases }).pc_code, "19-19")
})

test("question-author matching is exact within one system", () => {
  // Both sides come from the same Sansad person record, so collapsing runs of
  // whitespace and case is safe. Nothing looser is: a name from here must never
  // reach a MyNeta or PRS row.
  assert.equal(nameKey("Shri  Sanjay   Dina Patil"), nameKey("Shri Sanjay Dina Patil"))
  assert.notEqual(nameKey("Shri Sanjay Patil"), nameKey("Shri Sanjay Dina Patil"))
})

/* ========================================================================== */
/* esakshi-mplads                                                             */
/* ========================================================================== */

test("Indian-grouped amounts parse regardless of the rupee sign's encoding", () => {
  assert.equal(parseIndianAmount("₹1,15,55,39,16,595.93"), 115553916595.93)
  assert.equal(parseIndianAmount("�15,99,95,711.11"), 159995711.11)
  assert.equal(parseIndianAmount(""), null)
  assert.equal(parseCount(["19", "₹2,59,27,005.00"]), 19)
})

test("a work-count tile is never read off the expenditure tile", () => {
  // This is the bug that produced "integer out of range": the label
  // "Expenditure on Completed and On-going Works as on Date" contains both
  // "works" and "completed", so a loose substring match read ₹1.04 crore as a
  // completed-work count.
  const tiles = {
    "Allocated Limit for Hon'ble MPs": ["₹15,99,95,711.11", "₹16.00 Crore"],
    "Expenditure on Completed and On-going Works as on Date": ["₹1,04,39,505.00", "₹1.04 Crore"],
    "Works Recommended": ["19", "₹2,59,27,005.00", "₹2.59 Crore"],
    "Works Completed": ["2", "₹53,39,505.00", "₹0.53 Crore"],
    "Works Sanctioned": ["10", "₹1,21,39,505.00", "₹1.21 Crore"],
    "Current Tenure": [{ ID: 7, CAPTION: "18th Lok Sabha" }],
  }
  const t = readTiles(tiles)
  assert.equal(t.allocated_inr, 159995711.11)   // ₹15.99 crore, matching the tile label
  assert.equal(t.expenditure_inr, 10439505)
  assert.equal(t.works_recommended, 19)
  assert.equal(t.works_completed, 2)
  assert.equal(t.works_sanctioned, 10)
  assert.equal(t.unspent_inr, 149556206.11)
  assert.equal(t.utilization_pct, 6.52)
})

test("tenure captions map onto in_mps.term_label", () => {
  assert.equal(tenureToTermLabel("18th Lok Sabha"), "LS18")
  assert.equal(tenureToTermLabel("17th Lok Sabha"), "LS17")
  assert.equal(tenureToTermLabel(""), "unknown")
})

/* ========================================================================== */
/* load-central-projects                                                      */
/* ========================================================================== */

test("MoSPI MM/YYYY cells become the first of that month", () => {
  assert.equal(monthCellToDate("07/2026"), "2026-07-01")
  assert.equal(monthCellToDate("1/2024"), "2024-01-01")
  assert.equal(monthCellToDate("13/2024"), null)
  assert.equal(monthCellToDate("-"), null)
})

test("schedule slip is whole months between the two commissioning dates", () => {
  assert.equal(monthsBetween("2026-01-01", "2026-07-01"), 6)
  assert.equal(monthsBetween("2026-01-01", "2025-11-01"), -2)
  assert.equal(monthsBetween(null, "2026-07-01"), null)
})

test("report months come off the filename, and split parts are flagged", () => {
  assert.deepEqual(monthFromFilename("FlashReport_March_2026.pdf"), { year: 2026, month: 3 })
  assert.equal(monthFromFilename("Review Report Dec 25.pdf"), null)

  const home = parseHomeReports(`
    <a href="/Home/ViewPdf/31?path=FlashReport_March_2026.pdf">x</a>
    <a href="/Home/ViewPdf/29?path=Review%20Report%20Jan26.pdf">y</a>`)
  assert.equal(home.length, 1)
  assert.equal(home[0].month, 3)
  assert.ok(home[0].url.endsWith("/Home/ViewPdf/31?path=FlashReport_March_2026.pdf"))

  const archive = parseArchiveReports(
    `<a href='../ReportPage/ViewPdf?id=61&path=Content\\ArchiveReport\\flash\\2024-25\\April_Part-I_Synopsis.pdf'><img></a>`,
    "2024-25", 4)
  assert.equal(archive.length, 1)
  assert.equal(archive[0].is_split_part, true, "Part-I/Part-II splits must be visible, not silently loaded")
})

test("state strings resolve, or are marked multi-state, or go to review", () => {
  const byNorm = new Map([
    [normalizeStateName("Andhra Pradesh"), 37],
    [normalizeStateName("Telangana"), 36],
  ])
  assert.deepEqual(classifyState("Andhra Pradesh", byNorm),
    { st_code: 37, is_multi_state: false, unresolved: false })
  assert.deepEqual(classifyState("Multi State", byNorm),
    { st_code: null, is_multi_state: true, unresolved: false })
  assert.deepEqual(classifyState("Andhra Pradesh, Telangana", byNorm),
    { st_code: null, is_multi_state: true, unresolved: false })
  // "Offshore" and "PAN India" are real MoSPI values; neither is a state.
  assert.equal(classifyState("Offshore", byNorm).unresolved, true)
  assert.equal(classifyState("Offshore", byNorm).st_code, null)
})

test("unknown parser fields fall through to snapshots.raw rather than being dropped", () => {
  // PMGID appeared in April 2026 without warning; the next such column must not
  // break an ingest either.
  assert.ok(KNOWN_FIELDS.has("pmgid"))
  assert.ok(!KNOWN_FIELDS.has("some_new_2027_column"))
})

/* ========================================================================== */
/* xlsx — the dependency-free Zenodo reader                                   */
/* ========================================================================== */

test("spreadsheet column references decode to indexes", () => {
  assert.equal(colIndex("A1"), 0)
  assert.equal(colIndex("Z9"), 25)
  assert.equal(colIndex("AA1"), 26)
  assert.equal(colIndex("BC12"), 54)
})

test("shared strings and XML entities decode", () => {
  assert.equal(unescapeXml("A &amp; B &lt;x&gt; &#65;"), "A & B <x> A")
  assert.deepEqual(
    parseSharedStrings("<sst><si><t>one</t></si><si><t>tw</t><t>o</t></si></sst>"),
    ["one", "two"])
})

test("a real Zenodo workbook reads back with its header and rows", { skip: !zenodoSample() },
  () => {
    const { rows, header } = readXlsx(zenodoSample())
    assert.ok(header.includes("mpCode"))
    assert.ok(rows.length > 700, `expected the full Sansad_details sheet, got ${rows.length}`)
    // mpCode is the join key that makes the whole backfill possible.
    assert.equal(rows[0].mpCode, "5814")
    assert.equal(rows[0].name, "Shri Mani A")
  })

function zenodoSample() {
  const p = "/Users/nivyaajit/Documents/Kaun/india-recon/mp-records/samples/zenodo/Sansad_details.xlsx"
  return existsSync(p) ? p : false
}

/* ========================================================================== */
/* migrate-india-project-staleness — the "longest unchanged" view             */
/* ========================================================================== */

test("the staleness migration is additive: it touches nothing it did not create", () => {
  // The whole safety claim of this migration is that it creates one view and
  // nothing else. Assert it, rather than trusting a reading of the SQL.
  for (const forbidden of [/\bALTER\s+TABLE\b/i, /\bDROP\s+TABLE\b/i, /\bTRUNCATE\b/i,
                           /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w+\s+SET\b/i,
                           /\bINSERT\s+INTO\b/i, /\bCREATE\s+TABLE\b/i,
                           /\bCREATE\s+POLICY\b/i, /spatial_ref_sys/i]) {
    assert.ok(!forbidden.test(STALENESS_SQL), `staleness SQL must not contain ${forbidden}`)
  }
  // Exactly one DROP, and it is of the view this migration owns.
  const drops = STALENESS_SQL.match(/\bDROP\s+\w+/gi) ?? []
  assert.equal(drops.length, 1)
  assert.match(STALENESS_SQL, /DROP VIEW IF EXISTS public\.v_in_central_project_staleness;/)
  assert.equal((STALENESS_SQL.match(/\bCREATE VIEW\b/gi) ?? []).length, 1)
})

test("the staleness migration is transactional and reloads PostgREST", () => {
  assert.ok(STALENESS_SQL.startsWith("--"))
  assert.match(STALENESS_SQL, /\bBEGIN;/)
  assert.match(STALENESS_SQL, /\bCOMMIT;/)
  assert.match(STALENESS_SQL, /NOTIFY pgrst, 'reload schema';/)
})

test("staleness exposes the columns the tracker asked for", () => {
  for (const col of ["project_code", "months_unchanged", "last_change_month",
                     "is_in_latest_report", "snapshot_count"]) {
    assert.ok(STALENESS_SQL.includes(col), `view must expose ${col}`)
  }
})

test("only the four tracker-visible fields count as a change", () => {
  // The ROW(...) comparison decides what "unchanged" means. sl_no is a row
  // number in that month's PDF and shifts whenever a project is inserted above
  // it; source_page, parser_version, raw and ingested_at move for reasons that
  // have nothing to do with the project. Letting any of them count would make
  // every project look active and the ranking would be worthless.
  const rowCompare = /ROW\(s\.revised_cost_cr[\s\S]*?lag\(s\.physical_progress_pct\)\s+OVER w\) \)/
      .exec(STALENESS_SQL)
  assert.ok(rowCompare, "the ROW(...) IS DISTINCT FROM ROW(...) comparison should be present")
  const expr = rowCompare[0]
  for (const tracked of ["revised_cost_cr", "revised_doc_month",
                         "cumulative_expenditure_cr", "physical_progress_pct"]) {
    assert.ok(expr.includes(tracked), `${tracked} must count as a change`)
  }
  for (const noise of ["sl_no", "source_page", "parser_version", "raw", "ingested_at",
                       "original_cost_cr", "approval_month"]) {
    assert.ok(!expr.includes(noise), `${noise} must NOT count as a change`)
  }
})

test("the staleness view is read-only to the public, like every other in_* object", () => {
  assert.match(STALENESS_SQL, /GRANT SELECT ON public\.v_in_central_project_staleness TO anon, authenticated;/)
  assert.ok(!/GRANT\s+(INSERT|UPDATE|DELETE|ALL)/i.test(STALENESS_SQL))
})

test("padToUniformKeys: ragged loader rows become a uniform PostgREST payload", async () => {
  const { padToUniformKeys } = await import("../scripts/india/lib/sink.mjs")
  const padded = padToUniformKeys([
    { mpsno: 1, house: "LS", pc_code: "29-25" },
    { mpsno: 2, house: "RS" },                       // RS: no pc_code by design
    { mpsno: 3, house: "LS", pc_code: "2-1", term_start: "2024-06-04" },
  ])
  const keys = padded.map(r => Object.keys(r).sort().join(","))
  assert.equal(new Set(keys).size, 1)                 // uniform
  assert.equal(padded[1].pc_code, null)               // padded, explicitly null
  assert.equal(padded[0].term_start, null)
  assert.equal(padded[2].pc_code, "2-1")              // real values untouched
  assert.equal(padded[0].mpsno, 1)
})

test("cli flag() prepends the dashes — '--apply' in argv is flag('apply')", async () => {
  const { flag } = await import("../scripts/india/lib/cli.mjs")
  const argv = ["node", "loader.mjs", "--apply"]
  assert.equal(flag("apply", argv), true)
  // The regression: a hand-rolled flag("--apply") silently never matches.
  assert.equal(flag("--apply", argv), false)
})

test("load-aliases honors --apply: refuses to run without credentials", async () => {
  const { spawnSync } = await import("node:child_process")
  // If --apply parsed as dry-run (the original bug), this exits 0 having
  // written nothing; the correct behavior without credentials is the
  // openSink refusal path, exit 1 with the 'needs credentials' message.
  const env = { ...process.env }
  delete env.SUPABASE_URL; delete env.NEXT_PUBLIC_SUPABASE_URL
  delete env.SUPABASE_SERVICE_KEY; delete env.SUPABASE_SERVICE_ROLE_KEY
  delete env.KAUN_LOCAL_PG
  const r = spawnSync("node", ["scripts/india/load-aliases.mjs", "--apply"], { env, encoding: "utf8" })
  assert.equal(r.status, 1)
  assert.match(r.stderr + r.stdout, /--apply needs credentials/)
})

/* ========================================================================== */
/* load-affidavit-review — the human sign-off that clears needs_review        */
/* ========================================================================== */

const REVIEW_REF = new PcReference([
  { pc_code: "27-31", st_code: 27, pc_no: 31, state_name: "Maharashtra", pc_name: "Mumbai South", pc_name_norm: "mumbai south" },
  { pc_code: "27-40", st_code: 27, pc_no: 40, state_name: "Maharashtra", pc_name: "Osmanabad", pc_name_norm: "osmanabad" },
  { pc_code: "9-5", st_code: 9, pc_no: 5, state_name: "Uttar Pradesh", pc_name: "Nagina", pc_name_norm: "nagina" },
], "fixture")

/** A minimal well-formed decision row; spread over it to break one thing. */
function reviewRow(over = {}) {
  return {
    election: "LokSabha2024", pc_code: "27-31", myneta_candidate_id: "111",
    state: "MAHARASHTRA", constituency: "MUMBAI SOUTH",
    mp_name_source: "Arvind Ganpat Sawant", mp_name_roster: "Arvind Ganpat Sawant",
    source_party: "ShivSena (Uddhav Balasaheb Thackeray)", roster_party: "SHSUBT",
    resolution: "accept", rationale: "same party, two labels", reviewed_by: null,
    ...over,
  }
}

test("parseResolution accepts exactly the four decision forms", async () => {
  const { parseResolution } = await import("../scripts/india/load-affidavit-review.mjs")
  assert.deepEqual(parseResolution("accept"), { kind: "accept", party_abbr: null })
  assert.deepEqual(parseResolution("reject"), { kind: "reject", party_abbr: null })
  assert.deepEqual(parseResolution("UNRESOLVED"), { kind: "UNRESOLVED", party_abbr: null })
  assert.deepEqual(parseResolution("map_to:SHSUBT"), { kind: "map_to", party_abbr: "SHSUBT" })
  assert.deepEqual(parseResolution("map_to:ASP (KR)"), { kind: "map_to", party_abbr: "ASP (KR)" })
  // Not decisions: a bare map_to would clear needs_review and change nothing.
  assert.equal(parseResolution("map_to:"), null)
  assert.equal(parseResolution("map_to"), null)
  assert.equal(parseResolution("Accept"), null)
  assert.equal(parseResolution(""), null)
  assert.equal(parseResolution(null), null)
})

test("decisionPatch touches only the review fields, and reject/UNRESOLVED touch nothing", async () => {
  const { decisionPatch, parseResolution } = await import("../scripts/india/load-affidavit-review.mjs")
  const now = "2026-07-26T00:00:00.000Z"

  const accept = decisionPatch(parseResolution("accept"), now)
  assert.deepEqual(accept, { needs_review: false, match_method: "manual_reviewed", updated_at: now })
  assert.ok(!("party_abbr" in accept))          // accept never rewrites the source's label

  assert.deepEqual(decisionPatch(parseResolution("map_to:SHSUBT"), now), {
    needs_review: false, match_method: "manual_reviewed", updated_at: now, party_abbr: "SHSUBT",
  })

  // A rejected or undecided row must stay private — no patch at all.
  assert.equal(decisionPatch(parseResolution("reject"), now), null)
  assert.equal(decisionPatch(parseResolution("UNRESOLVED"), now), null)
})

test("validate refuses anything that is not a named, evidenced, resolvable decision", async () => {
  const { validate } = await import("../scripts/india/load-affidavit-review.mjs")
  const bad = rows => validate(rows, { ref: REVIEW_REF, apply: false }).bad
  const problem = rows => bad(rows)[0].problem

  assert.equal(bad([reviewRow()]).length, 0)
  assert.match(problem([reviewRow({ pc_code: "027-031" })]), /malformed pc_code/)
  assert.match(problem([reviewRow({ pc_code: "29-25" })]), /not in the 543-seat reference/)
  assert.match(problem([reviewRow({ myneta_candidate_id: "abc" })]), /not an integer/)
  assert.match(problem([reviewRow({ rationale: null })]), /no rationale/)
  assert.match(problem([reviewRow({ resolution: "looks fine to me" })]), /bad resolution/)
  assert.match(problem([reviewRow({ election: null })]), /missing election/)

  // Two decisions for one seat, or one candidate reviewed twice: both are a
  // human editing error, and both would trip a database constraint.
  assert.match(
    problem([reviewRow(), reviewRow({ myneta_candidate_id: "222" })]),
    /duplicate pc_code 27-31/)
  assert.match(
    problem([reviewRow(), reviewRow({ pc_code: "9-5" })]),
    /duplicate \(myneta_candidate_id, election\)/)
})

test("load-affidavit-review will not apply a decision nobody has signed", async () => {
  const { validate } = await import("../scripts/india/load-affidavit-review.mjs")
  const rows = [
    reviewRow(),                                                    // unsigned accept
    reviewRow({ pc_code: "9-5", myneta_candidate_id: "222", resolution: "map_to:ASP (KR)" }),
    reviewRow({ pc_code: "27-40", myneta_candidate_id: "333", resolution: "UNRESOLVED" }),
  ]

  // Dry run: the committed file legitimately ships unsigned, so it must parse.
  const dry = validate(rows, { ref: REVIEW_REF, apply: false })
  assert.equal(dry.bad.length, 0)
  assert.equal(dry.rows.length, 3)

  // --apply: the two rows that would actually be written are refused; the
  // UNRESOLVED one needs no signature because it is never written.
  const applied = validate(rows, { ref: REVIEW_REF, apply: true })
  assert.equal(applied.bad.length, 2)
  for (const b of applied.bad) assert.match(b.problem, /without reviewed_by/)
  assert.deepEqual(applied.rows.map(r => r.resolution), ["UNRESOLVED"])

  // Signed, and the same rows go through.
  const signed = validate(rows.map(r => ({ ...r, reviewed_by: "bharatnyusta" })),
    { ref: REVIEW_REF, apply: true })
  assert.equal(signed.bad.length, 0)
  assert.equal(signed.rows.length, 3)
})

test("planWrites merges onto the stored row and refuses an unsafe seat assignment", async () => {
  const { validate, planWrites } = await import("../scripts/india/load-affidavit-review.mjs")
  const now = "2026-07-26T00:00:00.000Z"
  const decide = over => validate([reviewRow({ reviewed_by: "bharatnyusta", ...over })],
    { ref: REVIEW_REF, apply: true }).rows

  const stored = {
    id: 7, myneta_candidate_id: 111, election: "LokSabha2024", pc_code: null,
    candidate_name: "Arvind Ganpat Sawant", party_abbr: "ShivSena (Uddhav Balasaheb Thackeray)",
    criminal_cases: 2, needs_review: true, match_method: null, parse_status: "ok",
  }

  const { writes, problems } = planWrites(decide({ resolution: "map_to:SHSUBT" }), [stored], now)
  assert.equal(problems.length, 0)
  assert.equal(writes.length, 1)
  assert.ok(!("id" in writes[0]))                    // the bigserial is never rewritten
  assert.equal(writes[0].criminal_cases, 2)          // untouched columns survive the merge
  assert.equal(writes[0].pc_code, "27-31")           // the reviewed seat is assigned
  assert.equal(writes[0].party_abbr, "SHSUBT")
  assert.equal(writes[0].needs_review, false)
  assert.equal(writes[0].match_method, "manual_reviewed")

  // A review file naming a row the table does not have describes fiction.
  assert.match(planWrites(decide({ myneta_candidate_id: "999" }), [stored], now)
    .problems[0].problem, /no in_mp_affidavits row/)

  // in_mp_affidavits_one_winner_per_pc: never hand a seat to a second winner.
  const occupied = [stored, { ...stored, id: 8, myneta_candidate_id: 222, pc_code: "27-31" }]
  assert.match(planWrites(decide({}), occupied, now).problems[0].problem,
    /already held by myneta_candidate_id 222/)

  // A stored pc_code that disagrees with the review file is a human error, not
  // a thing to overwrite.
  assert.match(planWrites(decide({}), [{ ...stored, pc_code: "27-40" }], now)
    .problems[0].problem, /disagrees with the review file/)

  // reject / UNRESOLVED stay private: no write is planned at all.
  for (const resolution of ["reject", "UNRESOLVED"]) {
    const r = planWrites(decide({ resolution }), [stored], now)
    assert.equal(r.writes.length, 0)
    assert.equal(r.problems.length, 0)
  }
})

test("the committed affidavit-review.csv is a valid, fully evidenced decision file", async () => {
  const { readCsv, validate, COLUMNS, CSV_PATH } =
    await import("../scripts/india/load-affidavit-review.mjs")
  const { referenceFromCrosswalk } = await import("../scripts/india/lib/pc-reference.mjs")
  const ref = referenceFromCrosswalk()
  if (!ref) return                                   // crosswalk absent: nothing to check against

  const rows = readCsv(CSV_PATH)
  assert.ok(rows.length > 0)
  assert.deepEqual(Object.keys(rows[0]), COLUMNS)

  // It must pass the dry-run gate as committed (reviewed_by is Bharat's to
  // fill), and every row must carry its evidence.
  const { bad } = validate(rows, { ref, apply: false })
  assert.deepEqual(bad.map(b => `${b.pc_code}: ${b.problem}`), [])
  for (const r of rows) assert.ok(r.rationale && r.rationale.length > 20, `thin rationale on ${r.pc_code}`)
})

test("load-affidavit-review honors --apply: refuses to run without credentials", async () => {
  const { spawnSync } = await import("node:child_process")
  const env = { ...process.env }
  delete env.SUPABASE_URL; delete env.NEXT_PUBLIC_SUPABASE_URL
  delete env.SUPABASE_SERVICE_KEY; delete env.SUPABASE_SERVICE_ROLE_KEY
  delete env.KAUN_LOCAL_PG
  const r = spawnSync("node", ["scripts/india/load-affidavit-review.mjs", "--apply"],
    { env, encoding: "utf8" })
  assert.equal(r.status, 1)
  assert.match(r.stderr + r.stdout, /--apply needs credentials/)
})

test("load-affidavit-review --apply exits non-zero when reviewed_by is empty", async () => {
  const { spawnSync } = await import("node:child_process")
  const { writeFileSync, rmSync, mkdtempSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const { COLUMNS } = await import("../scripts/india/load-affidavit-review.mjs")

  const dir = mkdtempSync(join(tmpdir(), "kaun-review-"))
  const csv = join(dir, "affidavit-review.csv")
  const row = {
    election: "LokSabha2024", pc_code: "27-31", myneta_candidate_id: "111",
    state: "MAHARASHTRA", constituency: "MUMBAI SOUTH",
    mp_name_source: "Arvind Ganpat Sawant", mp_name_roster: "Arvind Ganpat Sawant",
    source_party: "SHSUBT", roster_party: "SHSUBT", resolution: "accept",
    rationale: "same party under two published labels; nothing factual in dispute",
    reviewed_by: "",
  }
  const render = r => [COLUMNS.join(","), COLUMNS.map(c => r[c]).join(",")].join("\n") + "\n"

  // Past the credentials gate (a local throwaway URL that is never reached,
  // because validation fails first), an unsigned decision must stop the run.
  const env = { ...process.env }
  delete env.SUPABASE_URL; delete env.NEXT_PUBLIC_SUPABASE_URL
  delete env.SUPABASE_SERVICE_KEY; delete env.SUPABASE_SERVICE_ROLE_KEY
  env.KAUN_LOCAL_PG = "postgres://localhost:5499/kaun_review_test_absent"
  const runIt = () => spawnSync("node",
    ["scripts/india/load-affidavit-review.mjs", "--apply", "--csv", csv],
    { env, encoding: "utf8" })

  try {
    writeFileSync(csv, render(row))
    const unsigned = runIt()
    assert.equal(unsigned.status, 1)
    assert.match(unsigned.stderr + unsigned.stdout, /without reviewed_by/)
    assert.match(unsigned.stderr + unsigned.stdout, /nothing written/)

    // Signed, the same file gets past validation and on to the database (which
    // is deliberately absent here, so it fails later and differently).
    writeFileSync(csv, render({ ...row, reviewed_by: "bharatnyusta" }))
    const signed = runIt()
    assert.doesNotMatch(signed.stderr + signed.stdout, /without reviewed_by/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
