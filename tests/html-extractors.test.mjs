/**
 * Unit tests for scripts/lib/html.mjs — the HTML/JSON extractors used by the
 * UPYOG (CDMA Open Portal) and AP eProc adapters.
 *
 * These exercise the parsing behaviour against representative HTML/JS
 * snippets that mirror what each portal returns. They do not hit the network.
 *
 * Run: node --test tests/html-extractors.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  extractEmbeddedState,
  parseHtmlTable,
  extractTableByClass,
} from "../scripts/lib/html.mjs"

test("extractEmbeddedState reads a flat __INITIAL_STATE__ blob", () => {
  const html = `<html><script>
    window.__INITIAL_STATE__ = {"foo":1,"bar":"baz"};
  </script></html>`
  const state = extractEmbeddedState(html)
  assert.deepEqual(state, { foo: 1, bar: "baz" })
})

test("extractEmbeddedState returns null when variable is absent", () => {
  assert.equal(extractEmbeddedState("<html>no script</html>"), null)
})

test("extractEmbeddedState returns null when JSON is malformed", () => {
  const html = `<script>window.__INITIAL_STATE__ = {bad json};</script>`
  assert.equal(extractEmbeddedState(html), null)
})

test("extractEmbeddedState supports a custom variable name", () => {
  const html = `<script>window.__APP_DATA__ = {"x":42};</script>`
  assert.deepEqual(extractEmbeddedState(html, "__APP_DATA__"), { x: 42 })
})

test("parseHtmlTable picks up a single matching table and yields header-keyed rows", () => {
  const html = `
    <table class="ward-grievances">
      <tr><th>Ward</th><th>Open</th><th>Closed</th></tr>
      <tr><td>1</td><td>10</td><td>50</td></tr>
      <tr><td>2</td><td>3</td><td>22</td></tr>
    </table>
  `
  const rows = parseHtmlTable(html, /<table[^>]*class="ward-grievances"[\s\S]*?<\/table>/i)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { Ward: "1", Open: "10", Closed: "50" })
  assert.deepEqual(rows[1], { Ward: "2", Open: "3", Closed: "22" })
})

test("parseHtmlTable returns [] when the selector finds nothing", () => {
  const rows = parseHtmlTable("<table><tr><th>X</th></tr></table>", /<table[^>]*class="missing"[\s\S]*?<\/table>/i)
  assert.deepEqual(rows, [])
})

test("parseHtmlTable strips inline tags inside cells", () => {
  const html = `
    <table class="x">
      <tr><th>A</th><th>B</th></tr>
      <tr><td><a href="x">link text</a></td><td><span>123</span></td></tr>
    </table>
  `
  const rows = parseHtmlTable(html, /<table[^>]*class="x"[\s\S]*?<\/table>/i)
  assert.deepEqual(rows[0], { A: "link text", B: "123" })
})

test("extractTableByClass parses an AP eProc-style awarded tender table", () => {
  const html = `
    <table class="awarded-tenders table-bordered">
      <thead>
        <tr><th>Tender ID</th><th>Title</th><th>Awarded Amount</th><th>Awardee</th></tr>
      </thead>
      <tbody>
        <tr><td>NIT/2024/001</td><td>Road resurfacing zone-3</td><td>4,82,75,000</td><td>M/s ABC Constructions</td></tr>
        <tr><td>NIT/2024/002</td><td>Drain desilting MVP Colony</td><td>1,12,50,000</td><td>M/s XYZ Co</td></tr>
      </tbody>
    </table>
  `
  const rows = extractTableByClass(html, /class="[^"]*awarded[^"]*"/i)
  assert.equal(rows.length, 2)
  assert.equal(rows[0]["Tender ID"], "NIT/2024/001")
  assert.equal(rows[0]["Awarded Amount"], "4,82,75,000")
  assert.equal(rows[1]["Awardee"], "M/s XYZ Co")
})

test("extractTableByClass falls back through alternate class patterns", () => {
  const html = `
    <table class="tender-list">
      <tr><th>Tender ID</th><th>Title</th></tr>
      <tr><td>T1</td><td>Streetlight LED</td></tr>
    </table>
  `
  const direct = extractTableByClass(html, /class="[^"]*tender-list[^"]*"/i)
  assert.equal(direct.length, 1)
  assert.equal(direct[0]["Tender ID"], "T1")
})

test("extractTableByClass returns [] when no matching table exists", () => {
  assert.deepEqual(extractTableByClass("<p>none</p>", /class="awarded"/), [])
})

test("UPYOG-style by-ward dashboard JSON shape is recognised", () => {
  const html = `<script>
    window.__INITIAL_STATE__ = {
      "grievances": {
        "period": "2025-26",
        "byWard": [
          {"wardNo": 1, "open": 12, "closed": 80, "inProgress": 3, "avgResolutionDays": 4.2, "topCategory": "Sanitation"},
          {"wardNo": 2, "open": 5,  "closed": 45, "inProgress": 1, "avgResolutionDays": 3.1, "topCategory": "Streetlight"}
        ]
      }
    };
  </script>`
  const state = extractEmbeddedState(html)
  assert.equal(state.grievances.byWard.length, 2)
  assert.equal(state.grievances.byWard[0].wardNo, 1)
  assert.equal(state.grievances.byWard[0].topCategory, "Sanitation")
  assert.equal(state.grievances.period, "2025-26")
})
