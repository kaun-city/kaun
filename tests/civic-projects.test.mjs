import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CIVIC_PROJECTS,
  getCivicProject,
  getCivicProjectsForPin,
  sourceMap,
} from "../apps/web/lib/civic-projects.ts"

const pin = (name) => ({
  found: true,
  city_id: "bengaluru",
  gba_ward_name: name,
  ward_name: null,
})
test("the Varthur–Gunjur record has a stable public identity", () => {
  const project = getCivicProject("varthur-gunjur-road")
  assert.ok(project)
  assert.equal(project.ownerAgency.includes("KRDCL"), true)
  assert.equal(project.status, "Delayed")
})

test("the corridor attaches to both current wards and no unrelated ward", () => {
  assert.deepEqual(getCivicProjectsForPin(pin("Varthur")).map(p => p.slug), ["varthur-gunjur-road"])
  assert.deepEqual(getCivicProjectsForPin(pin("GUNJUR")).map(p => p.slug), ["varthur-gunjur-road"])
  assert.deepEqual(getCivicProjectsForPin(pin("Hoodi")), [])
})

test("every published record reference resolves to a web source", () => {
  for (const project of CIVIC_PROJECTS) {
    const sources = sourceMap(project)
    for (const record of project.records) {
      assert.ok(record.sourceIds.length > 0, `${record.id} has no source`)
      for (const sourceId of record.sourceIds) {
        const source = sources.get(sourceId)
        assert.ok(source, `${record.id} references missing source ${sourceId}`)
        assert.match(source.url, /^https?:\/\//)
      }
    }
  }
})

test("projects are findable from map search by name, road, agency or ward", async () => {
  const { searchCivicProjects } = await import("../apps/web/lib/civic-projects.ts")
  for (const query of ["varthur", "Gunjur", "SH-35", "krdcl", "varthur corridor"]) {
    assert.deepEqual(searchCivicProjects(query, "bengaluru").map(project => project.slug), ["varthur-gunjur-road"], query)
  }
  assert.deepEqual(searchCivicProjects("koramangala", "bengaluru"), [])
  assert.deepEqual(searchCivicProjects("varthur", "visakhapatnam"), [])
  assert.deepEqual(searchCivicProjects("v", "bengaluru"), [])
})
