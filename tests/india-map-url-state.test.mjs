/**
 * Unit tests for apps/web/lib/india/map-url-state.ts.
 *
 * Two properties matter here, and only one of them is about the map.
 *
 *   1. Round-tripping. The national map writes its state into the query string
 *      so that a back navigation, a reload and a shared link all restore it.
 *      Everything read back out is validated, because it arrives from the
 *      address bar.
 *
 *   2. THE ONE THAT COULD BREAK PRODUCTION. After the cutover this map is
 *      served at "/" on the root domain, which is also where the viral
 *      Bengaluru deep links land — and lib/host-routing.ts 308s a bare "/" to
 *      bengaluru.kaun.city the moment it carries ward, report, city or layer.
 *      So the map's own parameters must be disjoint from that list, and a fully
 *      populated map URL must still resolve to the map in BOTH cutover modes.
 *      These tests drive the real resolveSurface() rather than asserting on
 *      names, so renaming a parameter to "layer" fails here rather than in a
 *      screenshot from a confused visitor.
 *
 * Run: node --test --experimental-strip-types tests/india-map-url-state.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  decodeMapState, encodeMapState, mapHrefForSeat,
  MAP_STATE_PARAMS, MAP_PARAM_SEAT, MAP_PARAM_LAYER, MAP_PARAM_STATE,
  EMPTY_MAP_URL_STATE,
} from "../apps/web/lib/india/map-url-state.ts"
import { INDIA_LAYERS } from "../apps/web/lib/india/layers.ts"
import { resolveSurface, CITY_UI_PARAMS, indiaHref } from "../apps/web/lib/host-routing.ts"

const FULL = { seat: "29-25", layer: "attendance", stateFilter: 29 }

// ---------------------------------------------------------------------------
// 1. the constraint that protects the existing city URLs
// ---------------------------------------------------------------------------

test("no map parameter collides with a city UI parameter", () => {
  for (const p of MAP_STATE_PARAMS) {
    assert.ok(
      !CITY_UI_PARAMS.includes(p),
      `"${p}" is a city deep-link parameter — a map URL carrying it would 308 to bengaluru`,
    )
  }
})

test("a fully populated map URL still resolves to the map, in both modes", () => {
  const search = encodeMapState(FULL)

  // Post-cutover the map is "/" on the root domain. It must be rewritten to
  // /india, never redirected off the host.
  for (const host of ["kaun.city", "www.kaun.city", "localhost:3000"]) {
    const d = resolveSurface({
      host, pathname: "/", search, indiaRoot: true, allowHostOverride: false,
    })
    assert.equal(d.action, "rewrite", `${host}/${search} -> ${d.action}`)
    assert.equal(d.path, "/india")
    assert.equal(d.search, search)
  }

  // Pre-cutover it is /india, which is passed through untouched.
  for (const host of ["kaun.city", "localhost:3000"]) {
    const d = resolveSurface({
      host, pathname: "/india", search, indiaRoot: false, allowHostOverride: false,
    })
    assert.equal(d.action, "pass")
  }
})

test("the legacy Bengaluru deep links still redirect, map parameters or not", () => {
  const legacy = ["?ward=42", "?report=118", "?city=bengaluru", "?layer=potholes"]
  for (const search of legacy) {
    const d = resolveSurface({
      host: "kaun.city", pathname: "/", search, indiaRoot: true, allowHostOverride: false,
    })
    assert.equal(d.action, "redirect", `${search} -> ${d.action}`)
    assert.equal(d.status, 308)
    assert.equal(d.url, `https://bengaluru.kaun.city/${search}`)
  }

  // And a hybrid — a stale city link that somehow also carries map state —
  // still goes to the city, because ?ward= is the part a human shared.
  const hybrid = "?ward=42&seat=29-25&lyr=attendance"
  const d = resolveSurface({
    host: "kaun.city", pathname: "/", search: hybrid, indiaRoot: true, allowHostOverride: false,
  })
  assert.equal(d.action, "redirect")
  assert.equal(d.url, `https://bengaluru.kaun.city/${hybrid}`)
})

test("map parameters never make /api/* move", () => {
  const search = encodeMapState(FULL)
  for (const host of ["kaun.city", "bengaluru.kaun.city"]) {
    for (const indiaRoot of [false, true]) {
      const d = resolveSurface({
        host, pathname: "/api/export", search, indiaRoot, allowHostOverride: false,
      })
      assert.equal(d.action, "pass")
    }
  }
})

// ---------------------------------------------------------------------------
// 2. encode / decode
// ---------------------------------------------------------------------------

test("round trips a full state", () => {
  assert.deepEqual(decodeMapState(encodeMapState(FULL)), FULL)
})

test("an empty state produces an empty search, not a bare ?", () => {
  assert.equal(encodeMapState(EMPTY_MAP_URL_STATE), "")
  assert.deepEqual(decodeMapState(""), EMPTY_MAP_URL_STATE)
  assert.deepEqual(decodeMapState("?"), EMPTY_MAP_URL_STATE)
})

test("each field survives on its own", () => {
  assert.equal(encodeMapState({ ...EMPTY_MAP_URL_STATE, seat: "1-1" }), "?seat=1-1")
  assert.equal(encodeMapState({ ...EMPTY_MAP_URL_STATE, layer: "criminal_cases" }), "?lyr=criminal_cases")
  assert.equal(encodeMapState({ ...EMPTY_MAP_URL_STATE, stateFilter: 7 }), "?st=7")
})

test("every real layer id round trips", () => {
  for (const l of INDIA_LAYERS) {
    const s = encodeMapState({ ...EMPTY_MAP_URL_STATE, layer: l.id })
    assert.equal(decodeMapState(s).layer, l.id)
  }
})

test("state code 0 is not a state — it is dropped", () => {
  assert.equal(decodeMapState("?st=0").stateFilter, null)
})

test("junk is dropped rather than carried into the UI", () => {
  const junk = [
    "?seat=notaseat", "?seat=29", "?seat=029-25", "?seat=29-0", "?seat=",
    "?lyr=composite_score", "?lyr=", "?lyr=<script>",
    "?st=abc", "?st=-4", "?st=2.5", "?st=",
  ]
  for (const search of junk) {
    assert.deepEqual(decodeMapState(search), EMPTY_MAP_URL_STATE, search)
  }
})

test("parameters this module does not own are preserved", () => {
  const out = encodeMapState(FULL, "?host=bengaluru.localhost:3000&utm_source=x")
  const p = new URLSearchParams(out.slice(1))
  assert.equal(p.get("host"), "bengaluru.localhost:3000")
  assert.equal(p.get("utm_source"), "x")
  assert.equal(p.get(MAP_PARAM_SEAT), "29-25")
  assert.equal(p.get(MAP_PARAM_LAYER), "attendance")
  assert.equal(p.get(MAP_PARAM_STATE), "29")
})

test("clearing a value removes its parameter, leaving the others alone", () => {
  const full = encodeMapState(FULL, "?utm_source=x")
  const cleared = encodeMapState({ seat: null, layer: "attendance", stateFilter: null }, full)
  const p = new URLSearchParams(cleared.slice(1))
  assert.equal(p.has(MAP_PARAM_SEAT), false)
  assert.equal(p.has(MAP_PARAM_STATE), false)
  assert.equal(p.get(MAP_PARAM_LAYER), "attendance")
  assert.equal(p.get("utm_source"), "x")
})

test("re-encoding is idempotent — the URL does not grow on every toggle", () => {
  let search = ""
  for (let i = 0; i < 5; i++) search = encodeMapState(FULL, search)
  assert.equal(search, encodeMapState(FULL))
})

// ---------------------------------------------------------------------------
// 3. the seat page's way back
// ---------------------------------------------------------------------------

test("mapHrefForSeat opens the map on the seat, in both cutover modes", () => {
  assert.equal(mapHrefForSeat(indiaHref("/", false), "29-25"), "/india?seat=29-25")
  assert.equal(mapHrefForSeat(indiaHref("/", true), "29-25"), "/?seat=29-25")
})

test("mapHrefForSeat degrades to the plain map for a seat it cannot trust", () => {
  for (const bad of [null, "", "nope", "029-25"]) {
    assert.equal(mapHrefForSeat("/india", bad), "/india")
  }
})
