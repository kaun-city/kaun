import { readFile } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"

const migrationUrl = new URL(
  "../supabase/migrations/20260910_gba_independent_pin_lookup.sql",
  import.meta.url,
)
const apiUrl = new URL("../apps/web/lib/api.ts", import.meta.url)

test("pin lookup accepts either the legacy or current GBA boundary", async () => {
  const sql = await readFile(migrationUrl, "utf8")

  assert.match(sql, /FROM wards w[\s\S]*legacy_found := FOUND;/)
  assert.match(sql, /FROM gba_wards g[\s\S]*gba_found := FOUND;/)
  assert.match(sql, /IF NOT legacy_found AND NOT gba_found THEN/)
  assert.doesNotMatch(sql, /IF ward_row IS NULL THEN/)
})

test("GBA-only matches keep legacy ward identity empty", async () => {
  const sql = await readFile(migrationUrl, "utf8")
  const api = await readFile(apiUrl, "utf8")
  const branchStart = sql.search(/ELSE\r?\n    -- Keep the historical identity empty/)
  assert.notEqual(branchStart, -1)
  const gbaOnlyBranch = sql.slice(branchStart)

  assert.match(gbaOnlyBranch, /'found', true/)
  assert.match(gbaOnlyBranch, /'city_id', 'bengaluru'/)
  assert.match(gbaOnlyBranch, /'ward_no', NULL/)
  assert.match(gbaOnlyBranch, /IF gba_found THEN[\s\S]*'gba_ward_no'/)
  assert.match(api, /ward_no: data\.ward_no \?\? null/)
  assert.match(api, /ward_name: data\.ward_name \?\? null/)
})
