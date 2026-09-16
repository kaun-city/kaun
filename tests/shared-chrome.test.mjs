/**
 * One header, one layer picker.
 *
 * Every page used to draw its own chrome: a wordmark chip with an "i" button on
 * the city map, an India-only header, sticky bars on the project records, a
 * bare "← Back" on How it works. And the two maps each had their own layer
 * control. These tests keep it to one of each.
 *
 * The page set is derived from the app directory, not listed by hand, so a new
 * page that hand-rolls its header fails here the day it is added.
 *
 * Run: node --test --experimental-strip-types tests/shared-chrome.test.mjs
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { MAP_LAYERS } from "../apps/web/lib/map-layers.ts"
import { INDIA_LAYERS } from "../apps/web/lib/india/layers.ts"

const root = fileURLToPath(new URL("..", import.meta.url))
const web = join(root, "apps/web")
const rel = path => relative(web, path).replaceAll("\\", "/")

/** Source with comments blanked, so prose about a removed pattern cannot match. */
function code(path) {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, m => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, (_, indent) => indent)
}

/**
 * The className of every <Link>, <button> and <a> in a source. Tags are cut at
 * their className rather than at the first ">", which an arrow function in an
 * onClick would otherwise end early.
 */
function targetClasses(source, tags = "Link|button|a") {
  const re = new RegExp(`<(?:${tags})\\b(?:(?!<(?:${tags})\\b)[\\s\\S])*?className=(\\{\`[\\s\\S]*?\`\\}|"[^"]*")`, "g")
  return [...source.matchAll(re)].map(m => m[1])
}

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

const HEADER = "components/shared/PageHeader.tsx"
const PICKER = "components/shared/MapLayerPicker.tsx"
const header = code(join(web, HEADER))
const picker = code(join(web, PICKER))
const uiFiles = [...walk(join(web, "app")), ...walk(join(web, "components"))]

/** The moderation desk is a private tool behind a password, not a Kaun surface. */
const PRIVATE = new Set(["app/admin/page.tsx"])

/** A rendered route: a page or a loading skeleton, excluding API routes. */
const routes = uiFiles.filter(path => /\/(page|loading)\.tsx$/.test(path) && !rel(path).startsWith("app/api/") && !PRIVATE.has(rel(path)))

/** Resolve "@/components/…" imports one level deep. */
function importedComponents(source) {
  return [...source.matchAll(/from "@\/(components\/[^"]+)"/g)]
    .map(m => join(web, `${m[1]}.tsx`))
    .filter(existsSync)
}

test("the route set is found, not listed", () => {
  const names = routes.map(rel)
  for (const expected of [
    "app/page.tsx",
    "app/india/page.tsx",
    "app/india/c/[pc_code]/page.tsx",
    "app/bengaluru/projects/page.tsx",
    "app/bengaluru/projects/[slug]/page.tsx",
    "app/how-it-works/page.tsx",
    "app/data/page.tsx",
  ]) assert.ok(names.includes(expected), `${expected} missing from the derived route set`)
})

for (const route of routes) {
  test(`${rel(route)} wears the shared PageHeader`, () => {
    const source = code(route)
    const direct = /<PageHeader\b/.test(source)
    const viaComponent = importedComponents(source).some(path => /<PageHeader\b/.test(code(path)))
    // A route-level loading.tsx may delegate to a skeleton that renders it.
    assert.ok(direct || viaComponent, `${rel(route)} renders no PageHeader, directly or through a component it imports`)
  })
}

test("only PageHeader draws the wordmark or places the surface switcher", () => {
  const wordmarks = []
  const switchers = []
  for (const path of uiFiles) {
    const name = rel(path)
    if (name === HEADER || PRIVATE.has(name) || /opengraph-image|icon\.tsx|OgFrame|\/api\//.test(name)) continue
    const source = code(path)
    if (/KAUN<span/.test(source)) wordmarks.push(name)
    if (/<SurfaceSwitcher\b/.test(source)) switchers.push(name)
  }
  assert.deepEqual(wordmarks, [], "hand-rolled wordmarks")
  assert.deepEqual(switchers, [], "surface switchers placed outside PageHeader")
  assert.equal(existsSync(join(web, "components/india/IndiaHeader.tsx")), false)
})

test("the header's parts come in one order: back, wordmark, switcher, nav, actions", () => {
  const order = ["{back}", "<Link", "<SurfaceSwitcher", "{nav && (", "{actions && ("].map(part => header.indexOf(part))
  assert.ok(order.every(i => i > 0), `missing a part: ${order}`)
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] < order[i], "parts out of order")
})

test("every back link is a BackLink, and the seat page's history-aware one draws it too", () => {
  for (const path of uiFiles) {
    const source = code(path)
    for (const m of source.matchAll(/\bback=\{([\s\S]*?)\}\s*(?:\n|width=|actions=|\/>)/g)) {
      assert.match(m[1], /<(BackLink|BackToMap)\b/, `${rel(path)}: back slot must render BackLink or BackToMap`)
    }
  }
  assert.match(code(join(web, "components/india/BackToMap.tsx")), /<BackLink\b/)
  // No page keeps a hand-rolled "← Back"/"← Map" link of its own.
  for (const route of routes) {
    assert.doesNotMatch(code(route), /&larr;<\/span>\s*(Map|Back)\b|>&larr; Back</, rel(route))
  }
})

test("header controls are 44px at every width", () => {
  const targets = targetClasses(header)
  assert.ok(targets.length >= 3)
  for (const target of targets) assert.match(target, /min-h-11/, target)
  assert.doesNotMatch(header, /\bsm:min-h-9|\bmd:h-9|\bsm:h-9/)
  const home = code(join(web, "components/HomePage.tsx"))
  const actions = home.match(/actions=\{[\s\S]*?\n\s{14}\}/)?.[0] ?? ""
  assert.ok(actions.length > 0, "city map header actions not found")
  const actionTargets = targetClasses(actions, "a|button")
  assert.ok(actionTargets.length >= 2, "the info and search buttons")
  for (const target of actionTargets) {
    assert.match(target, /\bh-11\b/, target)
    assert.doesNotMatch(target, /(sm|md):(w|h)-9/, target)
  }
})

test("both maps use the one layer picker, and nothing else draws a layer legend", () => {
  const home = code(join(web, "components/HomePage.tsx"))
  const india = code(join(web, "components/india/IndiaHome.tsx"))
  assert.match(home, /<MapLayerPicker[\s\S]*?layers=\{MAP_LAYERS\}/)
  assert.match(india, /<MapLayerPicker[\s\S]*?layers=\{INDIA_LAYERS\}/)
  assert.equal(existsSync(join(web, "components/LayerControl.tsx")), false)

  const legends = uiFiles
    .filter(path => rel(path) !== PICKER)
    .filter(path => /(\.ramp|rampFor\([^)]*\))\.map\(/.test(code(path)))
    .map(rel)
  assert.deepEqual(legends, [], "ramp swatches drawn outside MapLayerPicker")
})

test("the picker's no-data key is drawn the way each map draws a blank area", () => {
  const home = code(join(web, "components/HomePage.tsx"))
  const india = code(join(web, "components/india/IndiaHome.tsx"))
  // City: unpainted wards are a stage-grey fill.
  assert.match(code(join(web, "components/MapView.tsx")), /fillColor: PAPER\.stage/)
  assert.match(home, /noDataSwatch="fill"/)
  assert.match(picker, /"border border-ink\/25 bg-paper-stage"/)
  // India: unpainted seats are unfilled with a dashed edge.
  assert.match(code(join(web, "components/india/IndiaMapView.tsx")), /dashArray: "2 2"[^}]*fillOpacity: 0\b/)
  assert.match(india, /noDataSwatch="dashed"/)
  assert.match(picker, /"border border-dashed border-ink\/60"/)
  // And in words.
  assert.match(picker, /No data \(not zero\)/)
})

test("every layer on either map carries a unit and a source for its legend", () => {
  for (const layer of [...MAP_LAYERS, ...INDIA_LAYERS]) {
    assert.ok(layer.unit?.length > 0, `${layer.id}: unit`)
    assert.ok(layer.source?.length > 0, `${layer.id}: source`)
  }
})

test("the picker is foldable, 44px, and leaves layer state and the URL to the map", () => {
  assert.match(picker, /aria-expanded=\{open\}/)
  assert.match(picker, /aria-controls=\{bodyId\}/)
  assert.match(picker, /hidden=\{!open\}/)
  const targets = targetClasses(picker, "button")
  assert.ok(targets.length >= 3)
  for (const target of targets) assert.match(target, /min-h-11/, target)
  assert.doesNotMatch(picker, /history\.|searchParams|location\./)
  // The maps still own ?layer= (city) and the encoded map state (India).
  assert.match(code(join(web, "components/HomePage.tsx")), /params\.set\("layer", activeLayer\)/)
  assert.match(code(join(web, "components/india/IndiaHome.tsx")), /encodeMapState\(\s*\{ seat: selected\?\.pc_code \?\? null, layer: layerId, stateFilter \}/)
})
