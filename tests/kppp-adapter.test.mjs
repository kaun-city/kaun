import { test } from "node:test"
import assert from "node:assert/strict"
import { AGENCIES, toRow } from "../scripts/adapters/kppp.mjs"

test("KPPP coverage uses exact department IDs for the five corporations and civic agencies", () => {
  assert.equal(new Set(AGENCIES.map(a => a.id)).size, AGENCIES.length)
  assert.deepEqual(
    AGENCIES.filter(a => a.name.includes("City Corporation")).map(a => a.name).sort(),
    [
      "Bengaluru Central City Corporation",
      "Bengaluru East City Corporation",
      "Bengaluru North City Corporation",
      "Bengaluru South City Corporation",
      "Bengaluru West City Corporation",
    ],
  )
})

test("toRow keeps the canonical department and extracts a legacy ward reference", () => {
  const agency = AGENCIES[0]
  const row = toRow({
    id: 42,
    title: "Road works in Ward Nos. 153 and 158",
    deptName: agency.name,
    publishedDate: "04-09-2026 13:45:12",
  }, agency)
  assert.equal(row.agency, agency.name)
  assert.equal(row.department, agency.name)
  assert.equal(row.ward_no, 153)
  assert.equal(row.issued_date, "2026-09-04")
})
