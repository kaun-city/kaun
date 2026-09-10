import { test } from "node:test"
import assert from "node:assert/strict"
import { currentWardMeta, featureContains } from "../apps/web/lib/current-ward.ts"

const feature = {
  type: "Feature",
  properties: {
    boundary_system: "gba-369-2025",
    ward_no: 7,
    ward_name: "Example Ward",
    corporation: "East",
    corporation_id: 3,
    population: 20000,
  },
  geometry: {
    type: "Polygon",
    coordinates: [[[77, 12], [78, 12], [78, 13], [77, 13], [77, 12]]],
  },
}

test("current GBA metadata is attached from the visible boundary feature", () => {
  assert.deepEqual(currentWardMeta(feature), {
    gba_ward_no: 7,
    gba_ward_name: "Example Ward",
    gba_ward_name_kn: null,
    gba_corporation: "East",
    gba_corporation_id: 3,
    gba_ac: null,
    gba_ac_no: null,
    gba_zone: null,
    gba_zone_name: null,
    gba_population: 20000,
  })
})

test("point containment accepts inside points and rejects outside points", () => {
  assert.equal(featureContains(feature, 12.5, 77.5), true)
  assert.equal(featureContains(feature, 11.5, 77.5), false)
})
