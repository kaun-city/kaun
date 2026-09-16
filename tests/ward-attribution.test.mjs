import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  MATERIAL_OVERLAP,
  attributableHistoricalWards,
  sourceWardNosForLegacyWard,
} from "../apps/web/lib/gba-crosswalk.ts"

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"))
const gba = readJson("../apps/web/public/bengaluru-gba-369-to-datameet-243.json")
const legacy = readJson("../apps/web/public/bengaluru-ward-crosswalk.json")
const prodPairs = readJson("../data/ward-crosswalk/ward_crosswalk_pairs.json")

const gbaRow = (corporationId, wardNo) =>
  gba.rows.find(row => row.corporation_id === corporationId && row.ward_no === wardNo)
const wardNos = refs => refs.map(ref => ref.ward_no)

test("material overlap reuses the live ward_crosswalk threshold", () => {
  assert.equal(MATERIAL_OVERLAP, prodPairs.min_share)
  assert.equal(MATERIAL_OVERLAP, 0.1)
})

test("a sliver of a former ward is never a record source (Varthur does not pull Whitefield)", () => {
  const varthur = gbaRow(3, 40)
  assert.ok(varthur.historical_wards.some(ref => ref.ward_no === 110 && ref.current_share < 0.01))
  assert.deepEqual(wardNos(attributableHistoricalWards(varthur.historical_wards)), [112])
})

test("both directions must be material, and the largest overlap is always kept", () => {
  const refs = [
    { ward_no: 1, ward_name: "Big old ward", current_share: 0.6, legacy_share: 0.04 },
    { ward_no: 2, ward_name: "Material", current_share: 0.25, legacy_share: 0.3 },
    { ward_no: 3, ward_name: "Covers little of this ward", current_share: 0.09, legacy_share: 0.9 },
    { ward_no: 4, ward_name: "Mostly elsewhere", current_share: 0.4, legacy_share: 0.099 },
  ]
  // Ward 1 fails legacy_share but is the primary, so it stays; 3 and 4 drop.
  assert.deepEqual(wardNos(attributableHistoricalWards(refs)), [1, 2])
  assert.deepEqual(attributableHistoricalWards([]), [])

  // Real case: Ambedkarnagar sits 92% inside Agaram, which is only 3% covered.
  const ambedkarnagar = gbaRow(1, 27)
  assert.equal(attributableHistoricalWards(ambedkarnagar.historical_wards)[0].ward_no, 180)
})

test("Manorayanapalya keeps both materially overlapping former wards", () => {
  const row = gbaRow(2, 51)
  assert.deepEqual(wardNos(attributableHistoricalWards(row.historical_wards)), [69, 68])
})

test("every in-city current ward has a record source; survivors are pinned to this artifact", () => {
  let refs = 0
  let survivors = 0
  for (const row of gba.rows) {
    const kept = attributableHistoricalWards(row.historical_wards)
    refs += row.historical_wards.length
    survivors += kept.length
    assert.equal(kept.length > 0, row.historical_wards.length > 0, `${row.corporation_id}:${row.ward_no}`)
  }
  // gba369-dm243-2026.09: update deliberately when the crosswalk is rebuilt.
  assert.equal(gba.version, "gba369-dm243-2026.09")
  assert.equal(refs, 901)
  assert.equal(survivors, 596)
})

test("243 -> 225 contractor bridge reproduces the prod ward_crosswalk pairs exactly", () => {
  const derived = new Set()
  for (let wardNo = 1; wardNo <= 243; wardNo++) {
    for (const bbmp225 of sourceWardNosForLegacyWard(legacy.rows, wardNo)) derived.add(`${bbmp225}:${wardNo}`)
  }
  const expected = new Set(prodPairs.pairs.map(pair => `${pair.bbmp225_no}:${pair.datameet243_no}`))
  assert.equal(expected.size, 437)
  assert.deepEqual([...derived].sort(), [...expected].sort())
})

test("the bridge drops sub-threshold 225 wards (Manorayanapalya's flagged-contractor leak)", () => {
  // 225 ward 63 is 8% inside 243 ward 68; 225 ward 66 is 4% inside 243 ward 69.
  assert.deepEqual(sourceWardNosForLegacyWard(legacy.rows, 68).sort((a, b) => a - b), [64, 65])
  assert.deepEqual(sourceWardNosForLegacyWard(legacy.rows, 69).sort((a, b) => a - b), [64, 65])
  // The primary pair survives even below the threshold.
  assert.deepEqual(
    sourceWardNosForLegacyWard([{ bbmp225_no: 7, datameet243_no: 9, shares: [{ datameet243_no: 9, share: 0.05 }] }], 9),
    [7],
  )
})
