import test from "node:test"
import assert from "node:assert/strict"

import { BASE_TILE_OPTIONS, BASE_TILE_URL } from "../apps/web/lib/base-map.ts"

test("base map tiles use a no-key provider", () => {
  assert.equal(BASE_TILE_URL, "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
  assert.doesNotMatch(BASE_TILE_URL, /cartocdn|stadiamaps|mapbox|maptiler|apiKey|access_token/i)
  assert.match(BASE_TILE_OPTIONS.attribution, /OpenStreetMap/)
})
