/**
 * bmtc-stops.mjs — pure logic for BMTC stops: source pinning, CSV parsing,
 * collapsing booth-stop pairs into physical stops, ward statistics and diffs.
 *
 * No network, no filesystem, no environment. The two CLIs in this directory do
 * the I/O; tests/bmtc-stops.test.mjs exercises everything here.
 *
 * THE SOURCE
 * ----------
 * opencity.in package c4d9efee-e13b-4fe9-b5db-ce034a153e55, "BMTC Bus Stops and
 * Routes Map by Ward". 28 CSVs, one per assembly constituency (AC 150-177), plus
 * one all-stops CSV, all with the header
 *
 *   Stop Name,Latitude,Longitude,Num trips in stop,Boothcode,Routes with num trips
 *
 * A per-constituency row is a (polling booth, nearby stop) pair, so a stop near
 * N booths appears N times, sometimes across several constituency files. The
 * all-stops file lists each stop once with one of its booths, and carries a
 * repeated header row and a lone Ctrl-Z row. A booth code is 29 (Karnataka),
 * the 3-digit AC number, then the 3-digit part number.
 *
 * THE MODEL (supabase/migrations/20260917_bmtc_stops_dedup.sql)
 * --------------------------------------------------------------
 *   bmtc_stops        one row per (city_id, stop_name, lat, lng); boothcode NULL;
 *                     assembly_constituency/ac_number only when every linked
 *                     booth is in the same constituency, else NULL
 *   bmtc_stop_booths  one row per distinct (stop, boothcode)
 *
 * The migration and collapseStops() implement the same rules; the tests pin the
 * constituency list in both to the same values.
 */

export const CITY_ID = "bengaluru"
export const OPENCITY_PACKAGE_ID = "c4d9efee-e13b-4fe9-b5db-ce034a153e55"
export const OPENCITY_PACKAGE_URL = `https://data.opencity.in/api/3/action/package_show?id=${OPENCITY_PACKAGE_ID}`

export const CSV_HEADER = [
  "Stop Name",
  "Latitude",
  "Longitude",
  "Num trips in stop",
  "Boothcode",
  "Routes with num trips",
]

/** Constituency names exactly as the opencity CSV titles spell them. */
export const AC_NAMES = Object.freeze({
  150: "Yelahanka",
  151: "Krishnarajapuram",
  152: "Byatarayanapura",
  153: "Yeshwantpur",
  154: "Rajarajeshwarinagar",
  155: "Dasarahalli",
  156: "Mahalakshmi Layout",
  157: "Malleshwaram",
  158: "Hebbal",
  159: "Pulakeshinagar",
  160: "Sarvagnanagar",
  161: "C.V. Raaman Nagar",
  162: "Shivajinagar",
  163: "Shanti Nagar",
  164: "Gandhi Nagar",
  165: "Rajaji Nagar",
  166: "Govindaraj Nagar",
  167: "Vijay Nagar",
  168: "Chamrajpet",
  169: "Chikpet",
  170: "Basavanagudi",
  171: "Padmanabhanagar",
  172: "BTM Layout",
  173: "Jayanagar",
  174: "Mahadevapura",
  175: "Bommanahalli",
  176: "Bangalore South",
  177: "Anekal",
})

/**
 * The one-off 2026 load stored these file titles in assembly_constituency
 * instead of a constituency name, with ac_number NULL.
 */
export const LEGACY_TITLE_LABELS = Object.freeze({
  "Mahalakshmi Layout - AC - Stops with Number of Trips": 156,
  "BMTC Stops with Location and Routes": null, // any constituency; read from the booth code
})

const RESOURCE_BASE = `https://data.opencity.in/dataset/${OPENCITY_PACKAGE_ID}/resource`
const acResource = (id, acNumber, name, file) => ({
  id,
  kind: "ac",
  acNumber,
  name,
  url: `${RESOURCE_BASE}/${id}/download/${file}`,
})

/**
 * The CSV resources as published on 2026-09-16. The ingest refuses to run if
 * the package's CSV list, titles or URLs differ: a new or renamed file needs a
 * reviewed change here, not a silent reinterpretation.
 */
export const PINNED_CSV_RESOURCES = Object.freeze([
  acResource("c4c013d2-76ee-4d9f-80c6-804dd9ecee9d", 150, "Yelahanka - AC 150 Stops with Number of Trips", "ac150-stops.csv"),
  acResource("d0338e6f-1c23-4f2b-85e9-16f7fb2a27bb", 151, "Krishnarajapuram - AC 151 Stops with Number of Trips", "ac151-stops.csv"),
  acResource("4f96e038-29a8-41e2-b644-7bb7c9c4098d", 152, "Byatarayanapura - AC 152 Stops with Number of Trips", "ac152-stops.csv"),
  acResource("98b3f9d4-74f3-4544-8d96-36b335c39a25", 153, "Yeshwantpur - AC 153 Stops with Number of Trips", "ac153-stops.csv"),
  acResource("c3d8a717-f52a-460a-96a6-b57534bea41f", 154, "Rajarajeshwarinagar - AC 154 Stops with Number of Trips", "ac154-stops.csv"),
  acResource("e93ca76c-2229-4673-bb8a-0eb7d2ed24cf", 155, "Dasarahalli - AC 155 Stops with Number of Trips", "ac155-stops.csv"),
  acResource("73ac523c-0e85-4052-b28b-0f41912915f9", 156, "Mahalakshmi Layout - AC - Stops with Number of Trips", "ac156-stops.csv"),
  acResource("e74e12bf-804b-454b-841e-fb9540d2b335", 157, "Malleshwaram - AC 157 Stops with Number of Trips", "ac157-stops.csv"),
  acResource("a6f52d63-bba0-4ab1-aa14-1ad1346f2165", 158, "Hebbal - AC 158 Stops with Number of Trips", "ac158-stops.csv"),
  acResource("7749b0e4-6986-432d-b0de-82f34e9684fc", 159, "Pulakeshinagar - AC 159 Stops with Number of Trips", "ac159-stops.csv"),
  acResource("ea39f807-3eee-4632-a6f2-50b2c016fe76", 160, "Sarvagnanagar - AC 160 Stops with Number of Trips", "ac160-stops.csv"),
  acResource("5bd6db28-ef8a-4a61-8fa4-7d936401a2aa", 161, "C.V. Raaman Nagar - AC 161 Stops with Number of Trips", "ac161-stops.csv"),
  acResource("94c8f0e6-08ed-42fc-80c4-cc1a8a314808", 162, "Shivajinagar - AC 162 Stops with Number of Trips", "ac162-stops.csv"),
  acResource("8607b310-0544-43f4-a085-2fad9efaace0", 163, "Shanti Nagar - AC 163 - Stops with Number of Trips", "ac163-stops.csv"),
  acResource("2f7d9912-561b-4453-9033-002503fdca90", 164, "Gandhi Nagar - AC 164 - Stops with Number of Trips", "ac164-stops.csv"),
  acResource("7fb401fa-e99b-4ac5-9699-aa2e1aa6aa6d", 165, "Rajaji Nagar - AC 165 - Stops with Number of Trips", "ac165-stops.csv"),
  acResource("2e448c85-cb1a-413f-b19c-0bfdd6195a1f", 166, "Govindaraj Nagar - AC 166 - Stops with Number of Trips", "ac166-stops.csv"),
  acResource("78f6081d-438c-4ed1-8397-4c6032bf3058", 167, "Vijay Nagar - AC 167 - Stops with Number of Trips", "ac167-stops.csv"),
  acResource("e4bf13af-7d7e-4a26-bfc1-a586f3cd541d", 168, "Chamrajpet - AC 168 Stops with Number of Trips", "ac168-stops.csv"),
  acResource("15dbd7b0-eb1c-458e-a689-13f83ed986ad", 169, "Chikpet - AC 169 Stops with Number of Trips", "ac169-stops.csv"),
  acResource("d8ed8865-fc09-439f-99a8-4a469a7075fc", 170, "Basavanagudi - AC 170 Stops with Number of Trips", "ac170-stops.csv"),
  acResource("dca99de3-4352-462e-b574-095fd8bda0a5", 171, "Padmanabhanagar - AC 171 Stops with Number of Trips", "ac171-stops.csv"),
  acResource("b382e67e-6061-4fe0-97cf-9e9b610579ef", 172, "BTM Layout - AC 172 - Stops with Number of Trips", "ac172-stops.csv"),
  acResource("3d9fe082-115b-4d0c-b99d-6b1eac02983e", 173, "Jayanagar - AC 173 Stops with Number of Trips", "ac173-stops.csv"),
  acResource("7385e0eb-2b54-483a-b948-59b80d77ae50", 174, "Mahadevapura - AC 174 Stops with Number of Trips", "ac174-stops.csv"),
  acResource("e1278575-155b-4ceb-91ec-4438f19d4e79", 175, "Bommanahalli - AC 175 Stops with Number of Trips", "ac175-stops.csv"),
  acResource("aec5087b-beb7-429b-9bd6-da810e0ba7bc", 176, "Bangalore South - AC 176 - Stops with Number of Trips", "ac176-stops.csv"),
  acResource("520289a7-b258-4770-94a9-630ffecaa29f", 177, "Anekal - AC 177 Stops with Number of Trips", "ac177-stops.csv"),
  {
    id: "bf5a6f93-e758-4e2d-be31-997188b10fe3",
    kind: "all-stops",
    acNumber: null,
    name: "BMTC Stops with Location and Routes",
    url: `${RESOURCE_BASE}/bf5a6f93-e758-4e2d-be31-997188b10fe3/download/b17353f8-2637-4d1d-910d-a2b73677c3a7.csv`,
  },
])

// ---------------------------------------------------------------------------
// source pinning
// ---------------------------------------------------------------------------

/**
 * Compare a CKAN package_show `result.resources` list with the pinned CSVs.
 * Non-CSV resources (the KML route maps) are ignored.
 */
export function checkResources(resources, pinned = PINNED_CSV_RESOURCES) {
  const problems = []
  const live = new Map(
    resources.filter(r => String(r.format ?? "").toUpperCase() === "CSV").map(r => [r.id, r]),
  )
  for (const pin of pinned) {
    const r = live.get(pin.id)
    if (!r) {
      problems.push(`pinned CSV ${pin.id} (${pin.name}) is no longer in the package`)
      continue
    }
    if (r.name !== pin.name) problems.push(`${pin.id} was renamed: ${JSON.stringify(pin.name)} -> ${JSON.stringify(r.name)}`)
    if (r.url !== pin.url) problems.push(`${pin.id} moved: ${pin.url} -> ${r.url}`)
  }
  const pinnedIds = new Set(pinned.map(p => p.id))
  for (const r of live.values()) {
    if (!pinnedIds.has(r.id)) problems.push(`new CSV in the package: ${r.id} (${r.name}) ${r.url}`)
  }
  return problems
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  for (; i < text.length; i += 1) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') { field += '"'; i += 1 }
      else quoted = false
    } else if (c === '"') {
      quoted = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += c
    }
  }
  if (quoted) throw new Error("CSV ends inside a quoted field")
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const DECIMAL = /^-?\d+(?:\.\d+)?$/
const BOOTHCODE = /^29\d{6}$/
// Whitespace and control characters only: blank lines and the stray Ctrl-Z.
const isBlankRow = fields => fields.every(f => f.replace(/[\s -]/g, "") === "")

/** Constituency number encoded in a booth code, or null if it is not one. */
export function acFromBoothcode(boothcode) {
  return typeof boothcode === "string" && BOOTHCODE.test(boothcode) ? Number(boothcode.slice(2, 5)) : null
}

/**
 * Parse one opencity stops CSV into source rows. Blank rows and repeated
 * headers are skipped and reported; anything else malformed throws, naming the
 * resource and line, because a guessed row would publish a wrong number.
 */
export function parseStopsCsv(text, resource) {
  const [header, ...body] = parseCsv(text)
  if (!header || header.join(",") !== CSV_HEADER.join(",")) {
    throw new Error(`${resource.name}: unexpected header ${JSON.stringify(header)}`)
  }
  const rows = []
  const skipped = []
  body.forEach((fields, index) => {
    const line = index + 2
    if (isBlankRow(fields)) return skipped.push({ line, reason: "blank" })
    if (fields.join(",") === CSV_HEADER.join(",")) return skipped.push({ line, reason: "repeated header" })
    const fail = why => { throw new Error(`${resource.name} line ${line}: ${why}: ${JSON.stringify(fields)}`) }
    if (fields.length !== CSV_HEADER.length) fail(`expected ${CSV_HEADER.length} fields, got ${fields.length}`)
    const [rawName, lat, lng, trips, boothcode, routes] = fields
    if (!DECIMAL.test(lat) || !DECIMAL.test(lng)) fail("latitude/longitude is not a decimal")
    if (trips !== "" && !/^\d+$/.test(trips)) fail("trips is not a whole number")
    const ac = acFromBoothcode(boothcode)
    if (ac === null || !AC_NAMES[ac]) fail("boothcode is not a Bengaluru booth code")
    if (resource.kind === "ac" && ac !== resource.acNumber) fail(`booth is in AC ${ac}, file is AC ${resource.acNumber}`)
    rows.push({
      city_id: CITY_ID,
      // The legacy load trimmed names; the source has trailing spaces and tabs.
      stop_name: rawName.trim(),
      lat: Number(lat),
      lng: Number(lng),
      trips: trips === "" ? null : Number(trips),
      routes,
      boothcode,
      resource: resource.id,
    })
  })
  return { rows, skipped }
}

// ---------------------------------------------------------------------------
// collapsing
// ---------------------------------------------------------------------------

/** The physical-stop key, matching the unique index bmtc_stops_physical_key. */
export function physicalKey({ city_id: cityId, stop_name: name, lat, lng }) {
  return JSON.stringify([cityId, name, Number(lat), Number(lng)])
}

/**
 * Problems with one legacy bmtc_stops row that the migration's precheck would
 * reject. Rows with a NULL boothcode are already collapsed and pass.
 */
export function legacyRowProblem(row) {
  if (row.boothcode === null || row.boothcode === undefined) return null
  const ac = acFromBoothcode(row.boothcode)
  if (ac === null || !AC_NAMES[ac]) return `boothcode ${JSON.stringify(row.boothcode)} is not a Bengaluru booth code`
  if (row.ac_number !== null && row.ac_number !== undefined) {
    if (row.ac_number !== ac) return `ac_number ${row.ac_number} but booth is in AC ${ac}`
    if (row.assembly_constituency !== AC_NAMES[ac]) {
      return `assembly_constituency ${JSON.stringify(row.assembly_constituency)} is not ${JSON.stringify(AC_NAMES[ac])}`
    }
    return null
  }
  const label = row.assembly_constituency ?? ""
  if (!Object.hasOwn(LEGACY_TITLE_LABELS, label)) return `unexpected constituency label ${JSON.stringify(label)}`
  const expected = LEGACY_TITLE_LABELS[label]
  if (expected !== null && expected !== ac) return `${JSON.stringify(label)} row has an AC ${ac} booth`
  return null
}

const sameValue = (a, b) => (a ?? null) === (b ?? null)

/**
 * Collapse source rows (CSV rows or legacy bmtc_stops rows) into physical
 * stops and distinct booth links.
 *
 * Rows with an `id` keep the lowest id, as the migration does. A key whose rows
 * disagree on trips or routes is reported in `conflicts`; the stop keeps the
 * surviving row's values, so callers must refuse to write while conflicts exist.
 */
export function collapseStops(rows) {
  const groups = new Map()
  rows.forEach((row, order) => {
    const key = physicalKey(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ row, order })
  })

  const stops = []
  const links = []
  const conflicts = []
  const byId = (a, b) => (a.row.id ?? Infinity) - (b.row.id ?? Infinity) || a.order - b.order
  for (const [key, members] of groups) {
    members.sort(byId)
    const survivor = members[0].row
    for (const field of ["trips", "routes"]) {
      const values = [...new Set(members.map(m => JSON.stringify(m.row[field] ?? null)))]
      if (values.length > 1) conflicts.push({ key, stop_name: survivor.stop_name, field, values: values.map(v => JSON.parse(v)) })
    }
    const booths = new Map()
    for (const { row } of members) {
      if (row.boothcode === null || row.boothcode === undefined || booths.has(row.boothcode)) continue
      const ac = acFromBoothcode(row.boothcode)
      booths.set(row.boothcode, { key, boothcode: row.boothcode, ac_number: ac, assembly_constituency: AC_NAMES[ac] ?? null })
    }
    const acs = new Set([...booths.values()].map(b => b.ac_number))
    const [onlyAc] = acs
    stops.push({
      key,
      id: survivor.id ?? null,
      city_id: survivor.city_id,
      stop_name: survivor.stop_name,
      lat: Number(survivor.lat),
      lng: Number(survivor.lng),
      trips: survivor.trips ?? null,
      routes: survivor.routes ?? null,
      // With no booths (an already-collapsed row) the row's own values stand.
      assembly_constituency: booths.size ? (acs.size === 1 ? AC_NAMES[onlyAc] : null) : (survivor.assembly_constituency ?? null),
      ac_number: booths.size ? (acs.size === 1 ? onlyAc : null) : (survivor.ac_number ?? null),
      boothcode: null,
      source_rows: members.length,
    })
    links.push(...[...booths.values()].sort((a, b) => a.boothcode.localeCompare(b.boothcode)))
  }
  return { stops, links, conflicts }
}

/**
 * The all-stops CSV should list exactly the stops of the constituency files,
 * each with one of the booths those files pair it with. Differences are not
 * fatal (both feed the load) but say the publisher's files have drifted apart.
 */
export function compareAllStopsFile(acRows, allStopsRows) {
  const acKeys = new Set(acRows.map(physicalKey))
  const acPairs = new Set(acRows.map(row => `${physicalKey(row)}|${row.boothcode}`))
  const allKeys = new Set(allStopsRows.map(physicalKey))
  return {
    onlyInAllStops: [...allKeys].filter(key => !acKeys.has(key)),
    onlyInAcFiles: [...acKeys].filter(key => !allKeys.has(key)),
    boothsNotInAcFiles: allStopsRows.filter(row => !acPairs.has(`${physicalKey(row)}|${row.boothcode}`)).length,
  }
}

// ---------------------------------------------------------------------------
// geometry: ST_Within(point, polygon) semantics
// ---------------------------------------------------------------------------

function onSegment(x, y, [ax, ay], [bx, by]) {
  if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) !== 0) return false
  return Math.min(ax, bx) <= x && x <= Math.max(ax, bx) && Math.min(ay, by) <= y && y <= Math.max(ay, by)
}

/** 1 inside, 0 outside, -1 on the ring. */
function ringPosition(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    if (onSegment(x, y, ring[j], ring[i])) return -1
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside ? 1 : 0
}

/**
 * Whether a point lies in the interior of a GeoJSON Polygon or MultiPolygon, as
 * PostGIS ST_Within decides it: points on a boundary are not within, and every
 * ring after the first is a hole even when it lies outside the shell.
 */
export function pointWithin(lng, lat, geometry) {
  if (!geometry) return false
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]
  return polygons.some(([shell, ...holes]) => {
    if (ringPosition(lng, lat, shell) !== 1) return false
    return holes.every(hole => ringPosition(lng, lat, hole) === 0)
  })
}

function bbox(geometry) {
  const box = [Infinity, Infinity, -Infinity, -Infinity]
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]
  for (const polygon of polygons) for (const ring of polygon) for (const [x, y] of ring) {
    box[0] = Math.min(box[0], x)
    box[1] = Math.min(box[1], y)
    box[2] = Math.max(box[2], x)
    box[3] = Math.max(box[3], y)
  }
  return box
}

/**
 * What the recreated ward_infra_stats computes: per ward, signals and physical
 * stops counted independently; NULL trips count as a stop and add no trips.
 * `stops` must already be one per physical stop.
 */
export function wardInfraStats(wards, stops, signals) {
  const stats = new Map()
  for (const ward of [...wards].sort((a, b) => a.ward_no - b.ward_no)) {
    const row = { ward_no: ward.ward_no, ward_name: ward.ward_name, signal_count: 0, bus_stop_count: 0, daily_trips: 0 }
    if (ward.geom) {
      const [minX, minY, maxX, maxY] = bbox(ward.geom)
      const inWard = p => p.lng >= minX && p.lng <= maxX && p.lat >= minY && p.lat <= maxY && pointWithin(p.lng, p.lat, ward.geom)
      for (const signal of signals) if (inWard(signal)) row.signal_count += 1
      for (const stop of stops) {
        if (!inWard(stop)) continue
        row.bus_stop_count += 1
        row.daily_trips += stop.trips ?? 0
      }
    }
    stats.set(ward.ward_no, row)
  }
  return stats
}

/**
 * Mirror of the migration's final assertion: every ward_bus_stops row must
 * match, and wards it does not list must have no stops.
 */
export function compareWithWardBusStops(stats, wardBusStops) {
  const mismatches = []
  const listed = new Set()
  for (const b of wardBusStops) {
    listed.add(b.ward_no)
    const s = stats.get(b.ward_no)
    if (!s || s.bus_stop_count !== Number(b.stop_count) || s.daily_trips !== Number(b.total_trips)) {
      mismatches.push({ ward_no: b.ward_no, expected: { stop_count: b.stop_count, total_trips: b.total_trips }, actual: s ?? null })
    }
  }
  for (const s of stats.values()) {
    if (!listed.has(s.ward_no) && (s.bus_stop_count !== 0 || s.daily_trips !== 0)) {
      mismatches.push({ ward_no: s.ward_no, expected: { stop_count: 0, total_trips: 0 }, actual: s })
    }
  }
  return mismatches
}

// ---------------------------------------------------------------------------
// diff (ingest dry run)
// ---------------------------------------------------------------------------

const STOP_FIELDS = ["trips", "routes", "assembly_constituency", "ac_number"]

/**
 * Diff the desired state (collapsed source) against the current database state
 * (collapsed bmtc_stops plus any bmtc_stop_booths links).
 */
export function diffStops(desired, current) {
  const currentStops = new Map(current.stops.map(s => [s.key, s]))
  const desiredStops = new Map(desired.stops.map(s => [s.key, s]))
  const added = desired.stops.filter(s => !currentStops.has(s.key))
  const removed = current.stops.filter(s => !desiredStops.has(s.key))
  const changed = []
  for (const s of desired.stops) {
    const c = currentStops.get(s.key)
    if (!c) continue
    const fields = STOP_FIELDS.filter(f => !sameValue(s[f], c[f]))
    if (fields.length) changed.push({ key: s.key, stop_name: s.stop_name, fields, from: Object.fromEntries(fields.map(f => [f, c[f] ?? null])), to: Object.fromEntries(fields.map(f => [f, s[f] ?? null])) })
  }
  const linkKey = l => `${l.key} ${l.boothcode}`
  const currentLinks = new Set(current.links.map(linkKey))
  const desiredLinks = new Set(desired.links.map(linkKey))
  return {
    added,
    removed,
    changed,
    unchanged: desired.stops.length - added.length - changed.length,
    linksAdded: desired.links.filter(l => !currentLinks.has(linkKey(l))),
    linksRemoved: current.links.filter(l => !desiredLinks.has(linkKey(l))),
  }
}

// ---------------------------------------------------------------------------
// rehearsal SQL
// ---------------------------------------------------------------------------

export const REHEARSAL_MARKER = "KAUN_REHEARSAL_RESULT"

/**
 * Wrap a migration so it runs inside an explicit transaction that can only end
 * in an error: the final DO block always raises, carrying the post-migration
 * counts as JSON, so nothing can commit. Refuses SQL with its own transaction
 * control, which could commit part of the rehearsal.
 */
export function buildRehearsalSql(migrationSql) {
  const code = migrationSql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "") // dollar-quoted bodies
    .replace(/'(?:[^']|'')*'/g, "") // string literals
    .replace(/--.*$/gm, "")
  if (/^\s*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|START\s+TRANSACTION|PREPARE\s+TRANSACTION)\b/im.test(code)) {
    throw new Error("migration contains transaction control; refusing to rehearse it")
  }
  return `BEGIN;

${migrationSql}

DO $kaun_rehearsal$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'stop_rows', (SELECT count(*) FROM public.bmtc_stops),
    'physical_stops', (SELECT count(DISTINCT (city_id, stop_name, lat, lng)) FROM public.bmtc_stops),
    'rows_removed', current_setting('kaun.bmtc_stops_dedup_removed', true),
    'rows_with_boothcode', (SELECT count(*) FROM public.bmtc_stops WHERE boothcode IS NOT NULL),
    'stops_with_ac', (SELECT count(*) FROM public.bmtc_stops WHERE ac_number IS NOT NULL),
    'stops_without_ac', (SELECT count(*) FROM public.bmtc_stops WHERE ac_number IS NULL),
    'null_trip_stops', (SELECT count(*) FROM public.bmtc_stops WHERE trips IS NULL),
    'booth_links', (SELECT count(*) FROM public.bmtc_stop_booths),
    'stops_without_links', (SELECT count(*) FROM public.bmtc_stops s WHERE NOT EXISTS (SELECT 1 FROM public.bmtc_stop_booths l WHERE l.stop_id = s.id)),
    'ward_infra_stats_rows', (SELECT count(*) FROM public.ward_infra_stats),
    'bus_stop_count', (SELECT sum(bus_stop_count) FROM public.ward_infra_stats),
    'daily_trips', (SELECT sum(daily_trips) FROM public.ward_infra_stats),
    'signal_count', (SELECT sum(signal_count) FROM public.ward_infra_stats),
    'ward_bus_stops_stop_count', (SELECT sum(stop_count) FROM public.ward_bus_stops),
    'ward_bus_stops_total_trips', (SELECT sum(total_trips) FROM public.ward_bus_stops),
    'wards_disagreeing', (
      SELECT count(*) FROM public.ward_bus_stops b
      LEFT JOIN public.ward_infra_stats w ON w.ward_no = b.ward_no
      WHERE w.ward_no IS NULL OR w.bus_stop_count <> b.stop_count OR w.daily_trips <> b.total_trips)
  ) INTO result;
  RAISE EXCEPTION '${REHEARSAL_MARKER} %', result::text;
END
$kaun_rehearsal$;

ROLLBACK;
`
}

/** Pull the JSON counts out of the error the rehearsal always ends with. */
export function parseRehearsalResult(errorText) {
  // The counts object is flat, so it has no nested braces. It may arrive still
  // JSON-escaped when the API response body was not itself parsed.
  const match = String(errorText).match(new RegExp(`${REHEARSAL_MARKER} (\\{[^{}]*\\})`))
  if (!match) return null
  for (const candidate of [match[1], match[1].replace(/\\"/g, '"')]) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try the unescaped form
    }
  }
  return null
}
