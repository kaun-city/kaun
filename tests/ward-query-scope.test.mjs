import assert from "node:assert/strict"
import test from "node:test"

import {
  BENGALURU_LEGACY_UNSCOPED_TABLES,
  wardQueryScope,
} from "../apps/web/lib/ward-query-scope.ts"

test("legacy Bengaluru-only ward tables omit the unavailable city_id filter", () => {
  for (const table of BENGALURU_LEGACY_UNSCOPED_TABLES) {
    assert.deepEqual(wardQueryScope(table, 186, "bengaluru"), {
      ward_no: "eq.186",
    })
  }
})

test("legacy tables stay city-scoped for every non-Bengaluru city", () => {
  assert.deepEqual(wardQueryScope("ward_reports", 12, "visakhapatnam"), {
    ward_no: "eq.12",
    city_id: "eq.visakhapatnam",
  })
})

test("modern tables remain city-scoped for Bengaluru", () => {
  assert.deepEqual(wardQueryScope("ward_amenities", 186, "bengaluru"), {
    ward_no: "eq.186",
    city_id: "eq.bengaluru",
  })
})
