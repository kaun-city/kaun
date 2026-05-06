/**
 * Unit tests for scripts/lib/parsers.mjs — quoted CSV parser, contractor
 * name/phone extractor, and AC-name normaliser. Covers tricky inputs that
 * have shown up in real BBMP / MyNeta exports.
 *
 * Run: node --test tests/parsers.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { parseCsv, extractContractor, stripAcNumber } from "../scripts/lib/parsers.mjs"

test("parseCsv handles plain rows", () => {
  const out = parseCsv("a,b,c\n1,2,3\n")
  assert.deepEqual(out, [["a", "b", "c"], ["1", "2", "3"]])
})

test("parseCsv keeps commas inside quoted fields", () => {
  const out = parseCsv(`name,note\n"Smith, J.","ok, fine"\n`)
  assert.deepEqual(out, [["name", "note"], ["Smith, J.", "ok, fine"]])
})

test("parseCsv keeps newlines inside quoted fields", () => {
  const text = `addr\n"Line 1\nLine 2"\n`
  const out = parseCsv(text)
  assert.deepEqual(out, [["addr"], ["Line 1\nLine 2"]])
})

test("parseCsv tolerates \\r\\n line endings", () => {
  const out = parseCsv("a,b\r\n1,2\r\n")
  assert.deepEqual(out, [["a", "b"], ["1", "2"]])
})

test("parseCsv ignores stray blank lines", () => {
  const out = parseCsv("a,b\n\n1,2\n\n\n")
  assert.deepEqual(out, [["a", "b"], ["1", "2"]])
})

test("extractContractor pulls trailing phone and strips M/s prefix", () => {
  assert.deepEqual(extractContractor("M/s. ABC Constructions 9876543210"),
    { name: "ABC Constructions", phone: "9876543210" })
})

test("extractContractor handles 6-digit code prefix", () => {
  assert.deepEqual(extractContractor("123456 M/s XYZ Co. 9123456789"),
    { name: "XYZ Co", phone: "9123456789" })
})

test("extractContractor returns null phone when none present", () => {
  assert.deepEqual(extractContractor("M/s ABC Constructions"),
    { name: "ABC Constructions", phone: null })
})

test("extractContractor handles Sri/Smt prefixes", () => {
  assert.deepEqual(extractContractor("Sri R. Kumar 9876543210"),
    { name: "R. Kumar", phone: "9876543210" })
  assert.deepEqual(extractContractor("Smt. P. Lakshmi 9876543210"),
    { name: "P. Lakshmi", phone: "9876543210" })
})

test("extractContractor handles null/empty input safely", () => {
  assert.deepEqual(extractContractor(""), { name: null, phone: null })
  assert.deepEqual(extractContractor(null), { name: null, phone: null })
  assert.deepEqual(extractContractor(undefined), { name: null, phone: null })
})

test("stripAcNumber removes trailing AC code in parens", () => {
  assert.equal(stripAcNumber("Yelahanka (150)"), "Yelahanka")
  assert.equal(stripAcNumber("Visakhapatnam North (16)"), "Visakhapatnam North")
})

test("stripAcNumber leaves clean names alone", () => {
  assert.equal(stripAcNumber("Bheemili"), "Bheemili")
  assert.equal(stripAcNumber(""), "")
  assert.equal(stripAcNumber(null), "")
})
