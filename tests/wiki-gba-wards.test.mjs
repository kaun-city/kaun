import { readFile, readdir } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"

const repo = new URL("../", import.meta.url)

test("wiki generator publishes all current GBA ward identities", async () => {
  const [geojsonText, generator] = await Promise.all([
    readFile(new URL("apps/web/public/bengaluru-gba-369.geojson", repo), "utf8"),
    readFile(new URL("scripts/generate-wiki/ward-index.mjs", repo), "utf8"),
  ])
  const collection = JSON.parse(geojsonText)
  const identities = new Set(collection.features.map(feature => {
    const p = feature.properties
    return `${p.corporation_id}:${p.ward_no}`
  }))
  const corporations = new Set(collection.features.map(feature => feature.properties.corporation_id))

  assert.equal(collection.features.length, 369)
  assert.equal(identities.size, 369)
  assert.equal(corporations.size, 5)
  assert.match(generator, /gba-\$\{w\.corporation_id\}-\$\{w\.ward_no\}/)
  assert.match(generator, /gba_corporation=\$\{w\.corporation_id\}&gba_ward=\$\{w\.ward_no\}/)
  assert.match(generator, /currentWards\.length !== 369/)
})

test("wiki labels the current-to-historical centre-point proxy honestly", async () => {
  const [generator, apiDocs] = await Promise.all([
    readFile(new URL("scripts/generate-wiki/ward-index.mjs", repo), "utf8"),
    readFile(new URL("wiki/docs/about/api.md", repo), "utf8"),
  ])

  assert.match(generator, /Current GBA wards \(369\)/)
  assert.match(generator, /Historical BBMP ward layer \(243\)/)
  assert.match(generator, /location-based proxy, not a claim that the two ward boundaries are equivalent/)
  assert.match(generator, /postJson\("\/api\/pin-lookup"/)
  assert.match(generator, /constituencyKey/)
  assert.match(apiDocs, /endpoint remains stable for existing consumers/)
  assert.match(apiDocs, /`corporation_id` \+ `ward_no`/)
})

test("generated ward index links to 369 current and 243 historical pages", async () => {
  const wardsDir = new URL("wiki/docs/bengaluru/wards/", repo)
  const [names, index] = await Promise.all([
    readdir(wardsDir),
    readFile(new URL("index.md", wardsDir), "utf8"),
  ])
  const currentPages = names.filter(name => /^gba-\d+-\d+-.+\.md$/.test(name))
  const historicalPages = names.filter(name => /^\d+-.+\.md$/.test(name))
  const localLinks = [...index.matchAll(/\]\(([^)]+\.md)\)/g)].map(match => match[1])

  assert.equal(currentPages.length, 369)
  assert.equal(historicalPages.length, 243)
  assert.equal(new Set(localLinks).size, 612)
  for (const link of localLinks) assert.ok(names.includes(link), `missing ward page: ${link}`)
})

test("all current ward pages include an MLA and an honest historical-data result", async () => {
  const wardsDir = new URL("wiki/docs/bengaluru/wards/", repo)
  const names = (await readdir(wardsDir)).filter(name => /^gba-\d+-\d+-.+\.md$/.test(name))
  let proxies = 0
  let unresolved = 0

  for (const name of names) {
    const page = await readFile(new URL(name, wardsDir), "utf8")
    assert.doesNotMatch(page, /No MLA record matched/, `${name} has no MLA`)
    if (page.includes("location-based proxy")) proxies++
    if (page.includes("could not resolve the published ward-centre point")) unresolved++
  }

  assert.equal(proxies, 368)
  assert.equal(unresolved, 1)
})
