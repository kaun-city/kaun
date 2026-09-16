import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { GBA_CROSSWALK_URL, GBA_CROSSWALK_VERSION } from "../apps/web/lib/constants.ts"

const artifact = JSON.parse(readFileSync(
  new URL("../apps/web/public/bengaluru-gba-369-to-datameet-243.json", import.meta.url),
  "utf8",
))

test("current-to-historical crosswalk covers every composite GBA identity", () => {
  assert.equal(artifact.version, GBA_CROSSWALK_VERSION)
  assert.equal(GBA_CROSSWALK_URL, `/bengaluru-gba-369-to-datameet-243.json?v=${GBA_CROSSWALK_VERSION}`)
  assert.equal(artifact.rows.length, 369)
  assert.equal(new Set(artifact.rows.map(row => `${row.corporation_id}:${row.ward_no}`)).size, 369)
  assert.equal(artifact.summary.outside, 1)
  assert.ok(artifact.summary.multi_legacy > 300)
})

test("overlap vectors retain both interpretation and allocation shares", () => {
  for (const row of artifact.rows) {
    for (const ref of row.historical_wards) {
      assert.ok(ref.ward_no >= 1 && ref.ward_no <= 243)
      assert.ok(ref.current_share > 0 && ref.current_share <= 1)
      assert.ok(ref.legacy_share >= 0 && ref.legacy_share <= 1)
    }
    const currentTotal = row.historical_wards.reduce((sum, ref) => sum + ref.current_share, 0) + row.outside_legacy_share
    assert.ok(currentTotal > 0.97 && currentTotal < 1.03, `${row.corporation_id}:${row.ward_no} sums to ${currentTotal}`)
  }
})

test("Varthur and Gunjur retain their distinct current identities and historical provenance", () => {
  const varthur = artifact.rows.find(row => row.corporation_id === 3 && row.ward_no === 40)
  const gunjur = artifact.rows.find(row => row.corporation_id === 3 && row.ward_no === 50)
  assert.equal(varthur.ward_name, "Varthur")
  assert.equal(gunjur.ward_name, "Gunjur")
  assert.equal(varthur.historical_wards[0].ward_no, 112)
  assert.equal(gunjur.historical_wards[0].ward_no, 112)
  assert.notDeepEqual(varthur.historical_wards, gunjur.historical_wards)
})

test("the research copy of the crosswalk is byte-identical to the published artifact", () => {
  const published = readFileSync(new URL("../apps/web/public/bengaluru-gba-369-to-datameet-243.json", import.meta.url))
  const research = readFileSync(new URL("../data/ward-crosswalk/gba2025_369_to_datameet_243.json", import.meta.url))
  assert.ok(research.equals(published), "data/ward-crosswalk copy differs from apps/web/public artifact")
})

test("the crosswalk builder is reproducible: pinned DataMeet commit and explicit generated_at", () => {
  const builder = readFileSync(new URL("../scripts/wardmap/build-gba-crosswalk.mjs", import.meta.url), "utf8")
  assert.match(builder, /const LEGACY_COMMIT = "[0-9a-f]{40}"/)
  assert.match(builder, /Municipal_Spatial_Data\/\$\{LEGACY_COMMIT\}\/Bangalore\/BBMP\.geojson/)
  assert.doesNotMatch(builder, /Municipal_Spatial_Data\/(?:master|main)\//)
  assert.doesNotMatch(builder, /generated_at: new Date\(\)/)
  assert.match(builder, /generated_at: generatedAt/)
})
