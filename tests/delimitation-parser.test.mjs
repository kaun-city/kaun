/**
 * Unit tests for scripts/lib/delimitation.mjs — the positioned-text parser for
 * the ECI Delimitation of Parliamentary and Assembly Constituencies Order, 2008,
 * used by scripts/india/build-pc-crosswalk.mjs.
 *
 * Every fixture below is real text or real coordinates lifted from the Order —
 * the separator zoo in Table B is not hypothetical.
 *
 * Run: node --test tests/delimitation-parser.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  groupLinesByY,
  rowText,
  inferColumnSplit,
  splitRow,
  joinWrapped,
  parsePcHeading,
  parseDistrictHeading,
  parseAcRefs,
  isWholeStateExtent,
  cleanName,
  titleCase,
  normKey,
} from "../scripts/lib/delimitation.mjs"

const item = (s, x, y) => ({ s, x, y })

test("groupLinesByY rebuilds visual lines top-to-bottom, left-to-right", () => {
  const rows = groupLinesByY([
    item("Sirpur", 220, 700), item("1-", 194, 700.8),
    item("2-PEDDAPALLE", 72, 680),
  ])
  assert.equal(rows.length, 2)
  assert.equal(rowText(rows[0]), "1- Sirpur")
  assert.equal(rowText(rows[1]), "2-PEDDAPALLE")
})

test("inferColumnSplit finds the right-hand column margin", () => {
  // One entry row starting at the left margin plus two wrapped continuation
  // rows starting at the extent margin — the AP Table B shape.
  const rows = groupLinesByY([
    item("1-ADILABAD (ST)", 72, 700), item("1-Sirpur, 5-Asifabad (ST),", 194, 700),
    item("8-Boath (ST), 9-Nirmal", 194, 686),
    item("2-PEDDAPALLE (SC)", 72, 672), item("2-Chennur (SC),", 194, 672),
    item("22-Dharmapuri (SC),", 194, 658),
  ])
  const splitX = inferColumnSplit(rows)
  assert.equal(splitX, 190)
  const { left, right } = splitRow(rows[0], splitX)
  assert.equal(left, "1-ADILABAD (ST)")
  assert.equal(right, "1-Sirpur, 5-Asifabad (ST),")
})

test("inferColumnSplit ignores a left sub-column and returns null without two columns", () => {
  // Table A pages put the AC number at ~63 and its name at ~106; only the
  // extent margin (~207) carries a continuation on most rows.
  const rows = groupLinesByY([
    item("15.", 63, 700), item("Yellareddy", 106, 700), item("Yellareddy, Nagareddipet", 207, 700),
    item("Sadasivanagar Mandals.", 207, 686),
    item("17.", 63, 672), item("Nizamabad", 106, 672), item("Nizamabad (M).", 207, 672),
    item("(Urban)", 106, 658),
    item("19.", 63, 644), item("Balkonda", 106, 644), item("Balkonda, Mortad", 207, 644),
    item("Mandals.", 207, 630),
  ])
  assert.equal(inferColumnSplit(rows), 203)
  assert.equal(inferColumnSplit(groupLinesByY([item("only one column", 72, 700)])), null)
})

test("joinWrapped glues hyphen-broken tokens and spaces the rest", () => {
  assert.equal(joinWrapped(["19. DABGRAM-", "FULBARI and 20. MAL (ST)"]),
    "19. DABGRAM-FULBARI and 20. MAL (ST)")
  assert.equal(joinWrapped(["75—", "Sootea, 76-Biswanath"]), "75—Sootea, 76-Biswanath")
  assert.equal(joinWrapped(["1-Sirpur,", "5-Asifabad (ST)."]), "1-Sirpur, 5-Asifabad (ST).")
})

test("parsePcHeading reads number, name and reservation across the Order's styles", () => {
  assert.deepEqual(parsePcHeading("1-ADILABAD (ST)"), { no: 1, name: "ADILABAD", reserved: "ST" })
  assert.deepEqual(parsePcHeading("2.ALIPURDUARS (ST)"), { no: 2, name: "ALIPURDUARS", reserved: "ST" })
  assert.deepEqual(parsePcHeading("8- SECUNDERABAD"), { no: 8, name: "SECUNDERABAD", reserved: "GEN" })
  assert.deepEqual(parsePcHeading("1 – Nandurbar (ST)"), { no: 1, name: "Nandurbar", reserved: "ST" })
  // a bare number is a wrapped heading, not an entry
  assert.equal(parsePcHeading("17-"), null)
  assert.equal(parsePcHeading("Sl. No. & Name"), null)
})

test("parseDistrictHeading reads the Table A district bands", () => {
  assert.deepEqual(parseDistrictHeading("16 – DISTRICT : DAKSHIN BASTAR (DANTEWADA)"),
    { no: 16, name: "Dakshin Bastar (Dantewada)" })
  assert.deepEqual(parseDistrictHeading("48 - DISTRICT: NEEMUCH"), { no: 48, name: "Neemuch" })
  assert.equal(parseDistrictHeading("48. Ibrahimpatnam"), null)
})

test("parseAcRefs handles every separator style the Order actually uses", () => {
  const dash = parseAcRefs("1-Sirpur, 5-Asifabad (ST), 9-Nirmal and 10-Mudhole.")
  assert.deepEqual(dash.acs.map(a => a.ac_no), [1, 5, 9, 10])
  assert.equal(dash.acs[1].ac_reserved, "ST")
  assert.equal(dash.acs[1].ac_name, "Asifabad")
  assert.deepEqual(dash.unparsed, [])

  // spaces instead of dashes, and a missing space after "and"
  assert.deepEqual(
    parseAcRefs("101-Dharapuram (SC) and102 Kangayam").acs.map(a => a.ac_no), [101, 102])
  // no separator at all between entries (Goa, Maharashtra, Tamil Nadu)
  assert.deepEqual(
    parseAcRefs("23-Marcaim 24-Mormugao; 26-Dabolim 27-Cortalim").acs.map(a => a.ac_no),
    [23, 24, 26, 27])
  assert.deepEqual(
    parseAcRefs("144-Manachanallur 145 Musiri, 146-Thuraiyur").acs.map(a => a.ac_no),
    [144, 145, 146])
  // no separator between number and name, em dashes, tildes, leading zeros
  assert.deepEqual(parseAcRefs("22Virugambakkam, 23Saidapet").acs.map(a => a.ac_name),
    ["Virugambakkam", "Saidapet"])
  assert.deepEqual(parseAcRefs("36—Wabgai, 48~Boko (SC)").acs.map(a => a.ac_no), [36, 48])
  assert.deepEqual(parseAcRefs("01. MEKLIGANJ (SC), 15. DHUPGURI (SC)").acs.map(a => a.ac_no), [1, 15])
  // a stray glyph in front of an entry number must not lose the entry
  assert.deepEqual(parseAcRefs("205-Sivakasi, \\206 Virudhunagar").acs.map(a => a.ac_no), [205, 206])
  // stray punctuation between number and name (Kerala)
  assert.deepEqual(parseAcRefs("94- Kaduthuruthy 95-,Vaikom (SC)").acs.map(a => a.ac_no), [94, 95])
})

test("parseAcRefs returns unparsable tokens instead of dropping them", () => {
  const { acs, unparsed } = parseAcRefs("Baramulla district")
  assert.deepEqual(acs, [])
  assert.deepEqual(unparsed, ["Baramulla district"])
})

test("isWholeStateExtent recognises the single-seat states", () => {
  assert.ok(isWholeStateExtent("The entire area of the State of Mizoram"))
  assert.ok(isWholeStateExtent("The entire area of the Union Territory of Puducherry"))
  assert.ok(!isWholeStateExtent("1-Sirpur, 5-Asifabad (ST)"))
})

test("cleanName / titleCase / normKey normalise for cross-source matching", () => {
  assert.equal(cleanName("  ,Vaikom  "), "Vaikom")
  assert.equal(cleanName("Rajgarh –Laxmangarh ."), "Rajgarh –Laxmangarh")
  assert.equal(titleCase("DAKSHIN BASTAR"), "Dakshin Bastar")
  assert.equal(titleCase("Dakshin Bastar"), "Dakshin Bastar")   // mixed case left alone
  assert.equal(normKey("Kaziranga (ex Kaliabor)"), "kaziranga")
  assert.equal(normKey("Dadra & Nagar Haveli"), "dadraandnagarhaveli")
  assert.equal(normKey("Andaman & Nicobar"), "andamanandnicobar")
})
