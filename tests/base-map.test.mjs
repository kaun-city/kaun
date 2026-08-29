import test from "node:test"
import assert from "node:assert/strict"

import { BASE_TILE_OPTIONS, BASE_TILE_URL, resolveBaseMapConfig } from "../apps/web/lib/base-map.ts"

test("base map tiles use a no-key provider", () => {
  assert.equal(BASE_TILE_URL, "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
  assert.doesNotMatch(BASE_TILE_URL, /cartocdn|stadiamaps|mapbox|maptiler|apiKey|access_token/i)
  assert.match(BASE_TILE_OPTIONS.attribution, /OpenStreetMap/)
})

test("base map provider can be changed through deployment configuration", () => {
  assert.deepEqual(resolveBaseMapConfig({
    url: "https://maps.example.test/{z}/{x}/{y}.png",
    attribution: "Example Maps",
    maxZoom: "17",
  }), {
    url: "https://maps.example.test/{z}/{x}/{y}.png",
    attribution: "Example Maps",
    maxZoom: 17,
  })
})

test("base map configuration rejects an invalid maximum zoom", () => {
  assert.equal(resolveBaseMapConfig({ maxZoom: "not-a-number" }).maxZoom, 19)
})
