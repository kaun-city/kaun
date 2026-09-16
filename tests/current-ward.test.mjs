import test from "node:test"
import assert from "node:assert/strict"

import { currentWardPinResult, preferredElectedReps } from "../apps/web/lib/current-ward.ts"

const currentWard = {
  gba_ward_no: 4,
  gba_ward_name: "Sampangirama Nagar",
  gba_ward_name_kn: null,
  gba_corporation: "Central",
  gba_corporation_id: 1,
  gba_ac: "Shivajinagar",
  gba_ac_no: 162,
  gba_zone: null,
  gba_zone_name: null,
  gba_population: 31_200,
  historical_wards: [{ ward_no: 129, ward_name: "Sampangiram Nagar", current_share: 0.46, legacy_share: 0.42 }],
  historical_crosswalk_tier: "split-primary",
  historical_crosswalk_version: "test",
}

test("a local Bengaluru boundary remains found when enrichment is unavailable", () => {
  const result = currentWardPinResult(currentWard, null, "bengaluru")

  assert.equal(result.found, true)
  assert.equal(result.city_id, "bengaluru")
  assert.equal(result.gba_ward_no, 4)
  assert.equal(result.gba_ward_name, "Sampangirama Nagar")
  assert.equal(result.assembly_constituency, "Shivajinagar")
})

test("point enrichment cannot masquerade as the current ward's historical identity", () => {
  const result = currentWardPinResult({ ...currentWard, gba_ward_no: 5 }, {
    found: true,
    city_id: "bengaluru",
    ward_no: 111,
    ward_name: "Legacy ward",
    zone: "East",
    assembly_constituency: "Legacy AC",
    gba_ward_no: 999,
    gba_ward_name: "Wrong current ward",
    gba_ward_name_kn: null,
    gba_corporation: null,
    gba_corporation_id: null,
    gba_ac: null,
    gba_ac_no: null,
    gba_zone: null,
    gba_zone_name: null,
    gba_population: null,
  }, "bengaluru")

  assert.equal(result.ward_no, null)
  assert.equal(result.ward_name, null)
  assert.equal(result.gba_ward_no, 5)
  assert.equal(result.gba_ward_name, "Sampangirama Nagar")
  assert.equal(result.historical_wards[0].ward_no, 129)
})

const rep = (role, name) => ({ id: name.length, role, constituency: "Shivajinagar", name, party: null })

test("the ward profile's reps win over the MLA-only list in either arrival order", () => {
  const profile = [rep("MLA", "Profile MLA"), rep("MP", "Profile MP"), rep("CORPORATOR", "Profile Corporator")]
  const mlaOnly = [rep("MLA", "Direct MLA")]

  assert.deepEqual(preferredElectedReps(profile, mlaOnly).map(r => r.name), ["Profile MLA", "Profile MP", "Profile Corporator"])
  // Profile not landed yet (or failed): the MLA-only list is the fallback.
  assert.deepEqual(preferredElectedReps(null, mlaOnly).map(r => r.name), ["Direct MLA"])
  assert.deepEqual(preferredElectedReps([], mlaOnly).map(r => r.name), ["Direct MLA"])
  // MLA-only not landed yet: nothing lost.
  assert.deepEqual(preferredElectedReps(profile, []).map(r => r.name), ["Profile MLA", "Profile MP", "Profile Corporator"])
})

test("the MLA-only list fills only a missing MLA role in the profile", () => {
  const profile = [rep("MP", "Profile MP"), rep("CORPORATOR", "Profile Corporator")]
  const mlaOnly = [rep("MLA", "Direct MLA")]
  assert.deepEqual(preferredElectedReps(profile, mlaOnly).map(r => r.name), ["Profile MP", "Profile Corporator", "Direct MLA"])
})

test("letters cite a current ward by corporation, never by its former ward number", async () => {
  const { wardCitation } = await import("../apps/web/lib/current-ward.ts")
  assert.equal(wardCitation({ gba_corporation: "East", gba_ward_no: 50, ward_no: null }), "Bengaluru East corporation, ward 50")
  assert.equal(wardCitation({ gba_corporation: null, gba_ward_no: null, ward_no: 112 }), "Ward #112")
})
