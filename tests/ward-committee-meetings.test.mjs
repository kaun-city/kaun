/**
 * ward_committee_meetings: load the opencity file without inventing zeros or
 * a denominator.
 *
 * The fixture is the real source file (opencity.in, public domain, fetched
 * 2026-09-16). It has 198 rows for 196 wards: two misfiled zero-count copies
 * sit on other wards' numbers, and wards 64 and 104 have no row.
 *
 * Run: node --test tests/ward-committee-meetings.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  parseWardCommitteeCsv, planCommitteeChanges, normalizeConstituency, BBMP_WARDS, PERIOD,
} from "../scripts/load-ward-committee-meetings.mjs"

const SOURCE = readFileSync(new URL("./fixtures/opencity-ward-committee-meetings-2020-22.csv", import.meta.url), "utf8")
const HEADER = "﻿Ward #,Ward Name,Constituency,Meeting Count,Constituency,Meeting Count"

test("the real file parses to 196 wards with no problems", () => {
  const { rows, problems, missing } = parseWardCommitteeCsv(SOURCE)
  assert.deepEqual(problems, [])
  assert.equal(rows.length, 196)
  assert.equal(new Set(rows.map(r => r.ward_no)).size, 196)
  assert.deepEqual(missing, [64, 104])
})

test("misfiled zero rows never land on another ward's number", () => {
  const { rows, dropped } = parseWardCommitteeCsv(SOURCE)
  const ward = n => rows.find(r => r.ward_no === n)
  assert.deepEqual([ward(145).ward_name, ward(145).meetings_count], ["Hombegowda Nagar", 37])
  assert.deepEqual([ward(181).ward_name, ward(181).meetings_count], ["Kumaraswamy Layout", 27])
  assert.deepEqual([ward(95).ward_name, ward(95).meetings_count], ["Subhash Nagar", 15])
  assert.deepEqual([ward(138).ward_name, ward(138).meetings_count], ["Chalavadipalya", 37])
  assert.deepEqual(dropped.map(d => [d.ward_no, d.ward_name, d.meetings_count]).sort(), [
    [145, "Chalavadipalya", 0],
    [181, "Subhash Nagar", 0],
  ])
  // With the copies gone, no ward in the file recorded zero meetings.
  assert.equal(rows.filter(r => r.meetings_count === 0).length, 0)
})

test("wards absent from the file are not written as zero", () => {
  const { rows } = parseWardCommitteeCsv(SOURCE)
  assert.equal(rows.some(r => r.ward_no === 64 || r.ward_no === 104), false)
  assert.ok(rows.every(r => r.ward_no >= 1 && r.ward_no <= BBMP_WARDS))
})

test("counts above any monthly schedule are kept as recorded", () => {
  // Rule 5 of the 2016 Ward Committee Rules sets a monthly floor, not a cap,
  // so a high count is not an error to clip.
  const { rows } = parseWardCommitteeCsv(SOURCE)
  assert.equal(Math.max(...rows.map(r => r.meetings_count)), 56)
  assert.equal(rows.filter(r => r.meetings_count > 48).length, 6)
})

test("reservation suffixes are dropped from constituency names", () => {
  assert.equal(normalizeConstituency("PULAKESHI NAGAR (SC)"), "PULAKESHI NAGAR")
  assert.equal(normalizeConstituency("C.V. RAMAN NAGAR (SC)"), "C.V. RAMAN NAGAR")
  assert.equal(normalizeConstituency("CHICKPET"), "CHICKPET")
  const { rows } = parseWardCommitteeCsv(SOURCE)
  assert.equal(rows.some(r => /\((SC|ST)\)/.test(r.assembly_constituency)), false)
})

test("the file's constituency totals are checked against its ward rows", () => {
  const broken = SOURCE.replace("143,Vishveshwarapura,CHICKPET,56,", "143,Vishveshwarapura,CHICKPET,57,")
  assert.match(parseWardCommitteeCsv(broken).problems.join("\n"), /CHICKPET: file total 203, ward rows sum to 204/)
})

test("blank counts, bad ward numbers and unresolvable duplicates are problems, not rows", () => {
  const csv = [
    HEADER,
    "1,Kempegowda Ward,YELAHANKA,,YELAHANKA,5",
    "2,Chowdeswari Ward,YELAHANKA,5,,",
    "2,Some Other Ward,YELAHANKA,3,,",
    "199,Nowhere,YELAHANKA,1,,",
  ].join("\n")
  const { problems } = parseWardCommitteeCsv(csv)
  assert.ok(problems.some(p => /ward 1 count "" is not a whole number/.test(p)))
  assert.ok(problems.some(p => /ward "199" is not 1-198/.test(p)))
  assert.ok(problems.some(p => /ward 2: 2 rows .* no way to tell/.test(p)))
  assert.equal(parseWardCommitteeCsv("Ward,Name\n1,x").problems.length, 1)
})

test("the plan against the table inserts, updates and reports what the file does not support", () => {
  const rows = [
    { ward_no: 1, ward_name: "A", assembly_constituency: "X", meetings_count: 3 },
    { ward_no: 2, ward_name: "B", assembly_constituency: "X", meetings_count: 4 },
    { ward_no: 3, ward_name: "C", assembly_constituency: "X", meetings_count: 5 },
  ]
  const current = [
    { ward_no: 1, ward_name: "A", assembly_constituency: "X", meetings_count: 3, period: PERIOD },
    { ward_no: 2, ward_name: "B", assembly_constituency: "X (SC)", meetings_count: 4, period: PERIOD },
    { ward_no: 64, ward_name: "Z", assembly_constituency: "X", meetings_count: 0, period: PERIOD },
  ]
  const { upserts, unsupported } = planCommitteeChanges(rows, current)
  assert.deepEqual(upserts.map(u => [u.action, u.ward_no]), [["update", 2], ["insert", 3]])
  assert.deepEqual(upserts[0].changed, ["assembly_constituency"])
  assert.deepEqual(unsupported.map(u => u.ward_no), [64])
})
