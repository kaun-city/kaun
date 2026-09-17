import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  CIVIC_PROJECTS,
  getCivicProject,
  getCivicProjectsForPin,
  sourceMap,
} from "../apps/web/lib/civic-projects.ts"

const pin = (corporationId, wardNo, name = null) => ({
  found: true,
  city_id: "bengaluru",
  gba_corporation_id: corporationId,
  gba_ward_no: wardNo,
  gba_ward_name: name,
  ward_name: name,
})
const slugs = projects => projects.map(project => project.slug)
const gbaWards = JSON.parse(readFileSync(new URL("../apps/web/public/bengaluru-gba-369.geojson", import.meta.url), "utf8"))
  .features.map(feature => feature.properties)
test("the Varthur–Gunjur record has a stable public identity", () => {
  const project = getCivicProject("varthur-gunjur-road")
  assert.ok(project)
  assert.equal(project.ownerAgency.includes("KRDCL"), true)
  assert.equal(project.status, "Delayed")
})

test("the corridor attaches to both current wards and no unrelated ward", () => {
  // Varthur and Gunjur also sit on the Peripheral Ring Road alignment.
  assert.ok(slugs(getCivicProjectsForPin(pin(3, 40, "Varthur"))).includes("varthur-gunjur-road"))
  assert.ok(slugs(getCivicProjectsForPin(pin(3, 50, "Gunjur"))).includes("varthur-gunjur-road"))
  assert.deepEqual(getCivicProjectsForPin(pin(3, 29, "Hoodi")), [])
})

test("projects attach to a pin by GBA ward id, never by a matching name", () => {
  assert.deepEqual(getCivicProjectsForPin({ ...pin(null, null, "Varthur") }), [])
  assert.deepEqual(getCivicProjectsForPin(pin(4, 72, "Varthur")), slugs([getCivicProject("namma-metro-phase-2a-orr")]).map(getCivicProject))
  assert.deepEqual(getCivicProjectsForPin({ ...pin(3, 40), city_id: "visakhapatnam" }), [])
})

test("every attached ward exists in the GBA-369 boundary file under the same name", () => {
  for (const project of CIVIC_PROJECTS) {
    assert.ok(project.wardBasis.length > 20, `${project.slug} explains how its wards were chosen`)
    const seen = new Set()
    for (const ward of project.affectedWards) {
      const key = `${ward.corporationId}:${ward.wardNo}`
      assert.ok(!seen.has(key), `${project.slug} lists ${key} twice`)
      seen.add(key)
      const boundary = gbaWards.find(row => row.corporation_id === ward.corporationId && row.ward_no === ward.wardNo)
      assert.ok(boundary, `${project.slug}: no GBA ward ${key}`)
      assert.equal(ward.name, boundary.ward_name, `${project.slug}: ${key} name`)
      assert.equal(ward.corporation, boundary.corporation, `${project.slug}: ${key} corporation`)
    }
  }
})

test("record trails run oldest first and never post-date the review", () => {
  for (const project of CIVIC_PROJECTS) {
    const dates = project.records.map(record => record.date)
    assert.deepEqual(dates, [...dates].sort(), `${project.slug} records are in date order`)
    assert.ok(dates.every(date => date <= project.latestAsOf), `${project.slug} has no record after its review date`)
    assert.equal(new Set(project.records.map(record => record.id)).size, project.records.length, `${project.slug} record ids are unique`)
  }
})

test("tiles get short values: four metrics, compact targets and ward notes", () => {
  for (const project of CIVIC_PROJECTS) {
    assert.equal(project.metrics.length, 4, `${project.slug} fills one row of metric tiles`)
    for (const metric of project.metrics) assert.ok(metric.value.length <= 24, `${project.slug}: "${metric.value}" is too long for a metric tile`)
    for (const signal of project.signals) assert.ok(signal.value.length <= 60, `${project.slug}: "${signal.value}" is too long for a signal headline`)
    assert.ok(project.nextTarget.length <= 12, `${project.slug}: next target "${project.nextTarget}"`)
    assert.ok(project.wardSignalNote.length <= 90, `${project.slug}: ward signal note`)
  }
})

test("no project text carries leftover research citations or rupee abbreviations", () => {
  for (const project of CIVIC_PROJECTS) {
    const ids = project.sources.map(source => source.id)
    const text = [
      project.summary, project.statusNote, project.alert, project.wardSignalNote,
      ...project.metrics.flatMap(metric => [metric.value, metric.note]),
      ...project.records.flatMap(record => [record.title, record.body]),
      ...project.signals.flatMap(signal => [signal.value, signal.explanation]),
    ].join("\n")
    for (const id of ids) assert.ok(!text.includes(id), `${project.slug} prose cites the raw source id ${id}`)
    assert.doesNotMatch(text, /\bRs\.?\s?\d/, `${project.slug} writes ₹, not Rs`)
  }
})

test("every published record reference resolves to a web source", () => {
  for (const project of CIVIC_PROJECTS) {
    const sources = sourceMap(project)
    assert.equal(sources.size, project.sources.length, `${project.slug} source ids are unique`)
    const cited = new Set()
    for (const record of project.records) {
      assert.ok(record.sourceIds.length > 0, `${record.id} has no source`)
      for (const sourceId of record.sourceIds) {
        const source = sources.get(sourceId)
        assert.ok(source, `${record.id} references missing source ${sourceId}`)
        assert.match(source.url, /^https?:\/\//)
        assert.doesNotMatch(source.url, /news\.google\.com/, `${sourceId} links the publisher, not a Google News redirect`)
        cited.add(sourceId)
      }
    }
    for (const signal of project.signals) {
      if (signal.evidence !== "unknown") assert.ok(signal.sourceIds.length > 0, `${project.slug}: ${signal.id} has no source`)
      for (const sourceId of signal.sourceIds) {
        assert.ok(sources.get(sourceId), `${signal.id} references missing source ${sourceId}`)
        cited.add(sourceId)
      }
    }
    for (const source of project.sources) assert.ok(cited.has(source.id), `${project.slug}: ${source.id} is listed but never cited`)
  }
})

test("projects are findable from map search by name, road, agency or ward", async () => {
  const { searchCivicProjects } = await import("../apps/web/lib/civic-projects.ts")
  for (const query of ["SH-35", "krdcl", "varthur kodi"]) {
    assert.deepEqual(searchCivicProjects(query, "bengaluru").map(project => project.slug), ["varthur-gunjur-road"], query)
  }
  // A ward on two project routes finds both records.
  for (const query of ["varthur", "Gunjur"]) {
    assert.deepEqual(searchCivicProjects(query, "bengaluru").map(project => project.slug),
      ["varthur-gunjur-road", "peripheral-ring-road-bengaluru-business-corridor"], query)
  }
  assert.deepEqual(slugs(searchCivicProjects("koramangala flyover", "bengaluru")), ["ejipura-kendriya-sadan-flyover"])
  assert.deepEqual(slugs(searchCivicProjects("mallige", "bengaluru")), ["bsrp-corridor-2-mallige-line"])
  assert.deepEqual(slugs(searchCivicProjects("HSR Layout", "bengaluru")), ["namma-metro-phase-2a-orr"])
  assert.deepEqual(slugs(searchCivicProjects("bwssb", "bengaluru")), ["cauvery-water-supply-scheme-stage-v"])
  assert.deepEqual(searchCivicProjects("hoodi", "bengaluru"), [])
  assert.deepEqual(searchCivicProjects("varthur", "visakhapatnam"), [])
  assert.deepEqual(searchCivicProjects("v", "bengaluru"), [])
})
