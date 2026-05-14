/**
 * Unit tests for scripts/lib/kml.mjs — the embedded KML → GeoJSON parser
 * used by ward-boundary seeders.
 *
 * Run: node --test tests/kml-parser.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  decodeXmlEntities,
  parseCoords,
  extractFirst,
  extractAll,
  parsePlacemark,
  kmlToGeoJSON,
  resolveWardNo,
  resolveWardName,
} from "../scripts/lib/kml.mjs"

test("decodeXmlEntities decodes the standard XML entities", () => {
  assert.equal(decodeXmlEntities("Tom &amp; Jerry"), "Tom & Jerry")
  assert.equal(decodeXmlEntities("&lt;tag&gt;"), "<tag>")
  assert.equal(decodeXmlEntities("she said &quot;hi&quot; &apos;ok&apos;"), 'she said "hi" \'ok\'')
})

test("parseCoords parses lng,lat triplets and ignores altitude", () => {
  const pts = parseCoords("83.2185,17.6868,0 83.2186,17.6869 83.2200,17.69")
  assert.deepEqual(pts, [[83.2185, 17.6868], [83.2186, 17.6869], [83.22, 17.69]])
})

test("parseCoords rejects malformed entries gracefully", () => {
  assert.deepEqual(parseCoords("garbage no-comma 1,abc"), [])
  assert.deepEqual(parseCoords(""), [])
  assert.deepEqual(parseCoords("12.5,77.5,extra,extra2 13.0,77.6"), [[12.5, 77.5], [13.0, 77.6]])
})

test("extractFirst pulls the first matching tag's text", () => {
  const xml = "<root><name>Asilmetta</name><name>Other</name></root>"
  assert.equal(extractFirst(xml, "name"), "Asilmetta")
  assert.equal(extractFirst(xml, "missing"), null)
})

test("extractAll yields every match in document order", () => {
  const xml = "<r><Polygon>A</Polygon><Polygon>B</Polygon></r>"
  assert.deepEqual(extractAll(xml, "Polygon"), ["A", "B"])
})

test("parsePlacemark builds a Polygon Feature with name + ward_no", () => {
  const pm = `
    <name><![CDATA[Ward 42 — Asilmetta]]></name>
    <ExtendedData><Data name="WARD_NO"><value>42</value></Data></ExtendedData>
    <Polygon>
      <outerBoundaryIs><LinearRing>
        <coordinates>83.20,17.68 83.21,17.68 83.21,17.69 83.20,17.69 83.20,17.68</coordinates>
      </LinearRing></outerBoundaryIs>
    </Polygon>
  `
  const f = parsePlacemark(pm)
  assert.equal(f.type, "Feature")
  assert.equal(f.geometry.type, "Polygon")
  assert.equal(f.properties.ward_no, 42)
  assert.equal(f.properties.name, "Ward 42 — Asilmetta")
  assert.equal(f.geometry.coordinates[0].length, 5)
})

test("parsePlacemark returns null when no polygon is present", () => {
  const pm = `<name>Empty</name>`
  assert.equal(parsePlacemark(pm), null)
})

test("parsePlacemark handles MultiPolygon (multiple <Polygon> blocks)", () => {
  const pm = `
    <name>MultiWard</name>
    <Polygon><outerBoundaryIs><coordinates>0,0 1,0 1,1 0,1 0,0</coordinates></outerBoundaryIs></Polygon>
    <Polygon><outerBoundaryIs><coordinates>2,2 3,2 3,3 2,3 2,2</coordinates></outerBoundaryIs></Polygon>
  `
  const f = parsePlacemark(pm)
  assert.equal(f.geometry.type, "MultiPolygon")
  assert.equal(f.geometry.coordinates.length, 2)
})

test("kmlToGeoJSON yields a FeatureCollection from multiple Placemarks", () => {
  const kml = `<?xml version="1.0"?><kml><Document>
    <Placemark>
      <name>Ward 1</name>
      <Polygon><outerBoundaryIs><coordinates>0,0 1,0 1,1 0,1 0,0</coordinates></outerBoundaryIs></Polygon>
    </Placemark>
    <Placemark>
      <name>Ward 2</name>
      <Polygon><outerBoundaryIs><coordinates>5,5 6,5 6,6 5,6 5,5</coordinates></outerBoundaryIs></Polygon>
    </Placemark>
  </Document></kml>`
  const fc = kmlToGeoJSON(kml)
  assert.equal(fc.type, "FeatureCollection")
  assert.equal(fc.features.length, 2)
  assert.equal(fc.features[0].properties.name, "Ward 1")
  assert.equal(fc.features[1].properties.name, "Ward 2")
})

test("resolveWardNo prefers <Data name=WARD_NO>, then name, then index", () => {
  assert.equal(resolveWardNo({ properties: { ward_no: 7, name: "Ward 99 — X" } }, 0), 7)
  assert.equal(resolveWardNo({ properties: { ward_no: null, name: "Ward 99 — X" } }, 0), 99)
  assert.equal(resolveWardNo({ properties: { ward_no: null, name: "Asilmetta" } }, 41), 42)
})

test("resolveWardName strips 'Ward N — ' prefixes", () => {
  assert.equal(resolveWardName({ properties: { name: "Ward 42 — Asilmetta" } }), "Asilmetta")
  assert.equal(resolveWardName({ properties: { name: "Ward-7 MVP Colony" } }), "MVP Colony")
  assert.equal(resolveWardName({ properties: { name: "Just A Locality" } }), "Just A Locality")
  assert.equal(resolveWardName({ properties: { name: "" } }), "")
})
