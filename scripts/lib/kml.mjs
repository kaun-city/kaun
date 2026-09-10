/**
 * lib/kml.mjs — minimal KML → GeoJSON parser used by ward-boundary seeders.
 *
 * Handles the subset of KML produced by OpenCity / GVMC / BBMP exports:
 *   - <Placemark> with <name>, <ExtendedData> using Data or SimpleData
 *   - <Polygon> with <outerBoundaryIs> + optional <innerBoundaryIs> (holes)
 *   - <MultiGeometry> wrapping multiple <Polygon> blocks
 *   - <coordinates> as "lng,lat[,alt] lng,lat[,alt] ..."
 *
 * Pure functions, no I/O — safe to unit-test.
 */

export function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

export function parseCoords(text) {
  const points = []
  for (const triplet of text.trim().split(/\s+/)) {
    const parts = triplet.split(",")
    if (parts.length < 2) continue
    const lng = parseFloat(parts[0])
    const lat = parseFloat(parts[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    points.push([lng, lat])
  }
  return points
}

export function extractFirst(block, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block)
  return m ? m[1].trim() : null
}

export function extractAll(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi")
  const out = []
  let m
  while ((m = re.exec(block)) !== null) out.push(m[1])
  return out
}

/** Extract ExtendedData values from both common KML encodings. */
export function extractProperties(block) {
  const properties = {}
  const dataRe = /<Data\s+[^>]*name=["']([^"']+)["'][^>]*>[\s\S]*?<value[^>]*>([\s\S]*?)<\/value>[\s\S]*?<\/Data>/gi
  const simpleDataRe = /<SimpleData\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/SimpleData>/gi

  for (const re of [dataRe, simpleDataRe]) {
    let m
    while ((m = re.exec(block)) !== null) {
      properties[decodeXmlEntities(m[1]).trim()] = decodeXmlEntities(m[2]).trim()
    }
  }
  return properties
}

export function parsePlacemark(block) {
  const extended = extractProperties(block)
  const rawName = extractFirst(block, "name") || extended.Ward_Name || extended.ward_name || ""
  const name = decodeXmlEntities(rawName.replace(/<!\[CDATA\[(.*?)\]\]>/, "$1")).trim()

  const ward_no = (() => {
    const raw = extended.WARD_NO ?? extended.ward_no ?? extended.ward_id
    const parsed = parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : null
  })()

  const polygons = []
  for (const poly of extractAll(block, "Polygon")) {
    const outer = extractFirst(poly, "outerBoundaryIs")
    if (!outer) continue
    const coordsBlock = extractFirst(outer, "coordinates")
    if (!coordsBlock) continue
    const ring = parseCoords(coordsBlock)
    if (ring.length < 4) continue

    const inner = []
    for (const innerBoundary of extractAll(poly, "innerBoundaryIs")) {
      const cb = extractFirst(innerBoundary, "coordinates")
      if (!cb) continue
      const ringInner = parseCoords(cb)
      if (ringInner.length >= 4) inner.push(ringInner)
    }
    polygons.push([ring, ...inner])
  }

  if (polygons.length === 0) return null

  const geometry = polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons.map(p => p) }

  return {
    type: "Feature",
    properties: { ...extended, name, ward_no },
    geometry,
  }
}

export function kmlToGeoJSON(kmlText) {
  const features = []
  const re = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi
  let m
  while ((m = re.exec(kmlText)) !== null) {
    const f = parsePlacemark(m[1])
    if (f) features.push(f)
  }
  return { type: "FeatureCollection", features }
}

export function resolveWardNo(feature, idx) {
  if (Number.isFinite(feature.properties.ward_no)) return feature.properties.ward_no
  const m = /(?:^|ward[\s-]*)(\d+)/i.exec(feature.properties.name || "")
  if (m) return parseInt(m[1], 10)
  return idx + 1
}

export function resolveWardName(feature) {
  const raw = feature.properties.name || ""
  return raw
    .replace(/^ward[\s-]*\d+\s*[—:-]\s*/i, "")
    .replace(/^ward[\s-]*\d+\s*/i, "")
    .trim() || raw
}
