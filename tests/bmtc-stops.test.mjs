/**
 * BMTC stops: collapsing booth-stop pairs into physical stops, the 20260917
 * dedup migration (including ward_bus_stops becoming a view over
 * ward_infra_stats), and the plan/ingest scripts' safety gates.
 *
 * Run: node --test --experimental-strip-types tests/bmtc-stops.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  AC_NAMES,
  CITY_ID,
  PINNED_CSV_RESOURCES,
  acFromBoothcode,
  buildRehearsalSql,
  checkResources,
  collapseStops,
  compareAllStopsFile,
  compareWithWardBusStops,
  diffStops,
  diffWardBusStops,
  legacyRowProblem,
  parseCsv,
  parseRehearsalResult,
  parseStopsCsv,
  physicalKey,
  pointWithin,
  wardBusStopsView,
  wardInfraStats,
} from "../scripts/bmtc/bmtc-stops.mjs"
import { DEFAULT_ANON_KEY, DEFAULT_SUPABASE_URL } from "../scripts/bmtc/io.mjs"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const fixture = name => read(`tests/fixtures/bmtc-stops/${name}`)
const resource = acNumber => PINNED_CSV_RESOURCES.find(r => r.acNumber === acNumber)
const allStopsResource = PINNED_CSV_RESOURCES.find(r => r.kind === "all-stops")
const migration = read("supabase/migrations/20260917_bmtc_stops_dedup.sql")
const code = migration.replace(/--.*$/gm, "")

const parseFixtures = () => {
  const ac150 = parseStopsCsv(fixture("ac150-stops.csv"), resource(150))
  const ac151 = parseStopsCsv(fixture("ac151-stops.csv"), resource(151))
  const allStops = parseStopsCsv(fixture("all-stops.csv"), allStopsResource)
  return { ac150, ac151, allStops, rows: [...ac150.rows, ...ac151.rows, ...allStops.rows] }
}
const stopNamed = (stops, name, lat) => stops.filter(s => s.stop_name === name && (lat === undefined || s.lat === lat))

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

test("CSV parser keeps quoted route dicts whole and handles CRLF, BOM and escaped quotes", () => {
  const text = "﻿a,b,c\r\nx,\"{'K-1': 2, 'K-2': 3}\",\"say \"\"hi\"\", ok\"\r\nlast,,row"
  assert.deepEqual(parseCsv(text), [
    ["a", "b", "c"],
    ["x", "{'K-1': 2, 'K-2': 3}", 'say "hi", ok'],
    ["last", "", "row"],
  ])
  assert.throws(() => parseCsv('a,"open'), /inside a quoted field/)
})

test("stops CSV rows are trimmed, typed and validated against their constituency file", () => {
  const { ac150, ac151, allStops } = parseFixtures()
  assert.equal(ac150.rows.length, 8)
  assert.deepEqual(ac150.rows[0], {
    city_id: CITY_ID,
    stop_name: "Yelahanka Old Town",
    lat: 13.10038064,
    lng: 77.58865078,
    trips: 120,
    routes: "{'401-K': 60, '285-M': 60}",
    boothcode: "29150001",
    resource: resource(150).id,
  })
  assert.equal(ac150.rows[2].stop_name, "Border Circle", "leading tab trimmed")
  const quiet = ac150.rows.find(r => r.stop_name === "Quiet Stop")
  assert.equal(quiet.trips, null)
  assert.equal(quiet.routes, "")
  assert.equal(ac151.rows[2].stop_name, 'Hebbal "Flyover", East')

  // The all-stops file repeats its header mid-file and ends with a Ctrl-Z row.
  assert.equal(allStops.rows.length, 2)
  assert.deepEqual(allStops.skipped.map(s => s.reason), ["repeated header", "blank"])

  // CRLF on the wire parses the same.
  const crlf = parseStopsCsv(fixture("ac150-stops.csv").replace(/\n/g, "\r\n"), resource(150))
  assert.deepEqual(crlf.rows, ac150.rows)
})

test("malformed source rows fail loudly instead of being guessed", () => {
  const header = "Stop Name,Latitude,Longitude,Num trips in stop,Boothcode,Routes with num trips\n"
  assert.throws(() => parseStopsCsv(`${header}A,13.0,77.5,10,29151001,{}\n`, resource(150)), /booth is in AC 151, file is AC 150/)
  assert.throws(() => parseStopsCsv(`${header}A,north,77.5,10,29150001,{}\n`, resource(150)), /not a decimal/)
  assert.throws(() => parseStopsCsv(`${header}A,13.0,77.5,ten,29150001,{}\n`, resource(150)), /whole number/)
  assert.throws(() => parseStopsCsv(`${header}A,13.0,77.5,10,1234,{}\n`, resource(150)), /booth code/)
  assert.throws(() => parseStopsCsv(`${header}A,13.0,77.5\n`, resource(150)), /expected 6 fields/)
  assert.throws(() => parseStopsCsv("Name,Lat\n", resource(150)), /unexpected header/)
})

test("booth codes carry the constituency in digits 3-5", () => {
  assert.equal(acFromBoothcode("29156123"), 156)
  assert.equal(acFromBoothcode("2915612"), null)
  assert.equal(acFromBoothcode(null), null)
})

// ---------------------------------------------------------------------------
// collapsing
// ---------------------------------------------------------------------------

test("booth-stop pairs collapse to one stop per (city, name, lat, lng) with distinct booth links", () => {
  const { rows } = parseFixtures()
  const { stops, links, conflicts } = collapseStops(rows)
  assert.deepEqual(conflicts, [])
  assert.equal(stops.length, 8)

  // Near two booths in one file, and listed again in the all-stops file.
  const [oldTown] = stopNamed(stops, "Yelahanka Old Town")
  assert.equal(oldTown.source_rows, 3)
  assert.deepEqual(links.filter(l => l.key === oldTown.key).map(l => l.boothcode), ["29150001", "29150002"])
  assert.equal(oldTown.ac_number, 150)
  assert.equal(oldTown.assembly_constituency, "Yelahanka")
  assert.equal(oldTown.boothcode, null)

  // Listed in two constituency files: booths span two ACs, so no single AC.
  const [border] = stopNamed(stops, "Border Circle")
  assert.equal(border.source_rows, 3, "exact duplicate row and the tab-prefixed copy collapse")
  assert.deepEqual(links.filter(l => l.key === border.key).map(l => [l.boothcode, l.ac_number]), [["29150003", 150], ["29151007", 151]])
  assert.equal(border.ac_number, null)
  assert.equal(border.assembly_constituency, null)

  // NULL trips survive as NULL; zero stays zero.
  assert.equal(stopNamed(stops, "Quiet Stop")[0].trips, null)
  assert.equal(stopNamed(stops, "Zero Trip Stop")[0].trips, 0)

  // The same name at two locations is two stops.
  const unnamed = stopNamed(stops, "")
  assert.equal(unnamed.length, 2)
  assert.deepEqual(unnamed.map(s => s.trips).sort(), [25, null])
})

test("a stop whose rows disagree on trips or routes is reported, not silently merged", () => {
  const base = { city_id: CITY_ID, stop_name: "A", lat: 13, lng: 77, routes: "{}", boothcode: "29150001" }
  const { conflicts } = collapseStops([
    { ...base, trips: 10 },
    { ...base, trips: 11, boothcode: "29150002" },
    { ...base, trips: 10, routes: "{'X': 1}", boothcode: "29150003" },
  ])
  assert.deepEqual(conflicts.map(c => [c.field, c.values]), [["trips", [10, 11]], ["routes", ["{}", "{'X': 1}"]]])
})

test("legacy rows: lowest id survives and file-title labels resolve through booth codes", () => {
  const stop = { city_id: CITY_ID, trips: 5, routes: "{}", ac_number: null }
  const mahalakshmi = "Mahalakshmi Layout - AC - Stops with Number of Trips"
  const allStops = "BMTC Stops with Location and Routes"
  const rows = [
    { ...stop, id: 10, stop_name: "A", lat: 13.01, lng: 77.51, boothcode: "29156001", assembly_constituency: mahalakshmi },
    { ...stop, id: 3, stop_name: "A", lat: 13.01, lng: 77.51, boothcode: "29156002", assembly_constituency: mahalakshmi },
    { ...stop, id: 20, stop_name: "A", lat: 13.01, lng: 77.51, boothcode: "29156001", assembly_constituency: mahalakshmi },
    { ...stop, id: 7, stop_name: "B", lat: 13.02, lng: 77.52, boothcode: "29150001", assembly_constituency: allStops },
    { ...stop, id: 8, stop_name: "B", lat: 13.02, lng: 77.52, boothcode: "29150001", assembly_constituency: "Yelahanka", ac_number: 150 },
    { ...stop, id: 9, stop_name: "B", lat: 13.02, lng: 77.52, boothcode: "29157003", assembly_constituency: "Malleshwaram", ac_number: 157 },
  ]
  assert.deepEqual(rows.map(legacyRowProblem), [null, null, null, null, null, null])
  const { stops, links } = collapseStops(rows)
  const [a, b] = stops
  assert.deepEqual([a.id, a.ac_number, a.assembly_constituency], [3, 156, "Mahalakshmi Layout"])
  assert.deepEqual([b.id, b.ac_number, b.assembly_constituency], [7, null, null])
  assert.equal(links.length, 4)

  // Already-collapsed rows (boothcode NULL) keep their own constituency.
  const [kept] = collapseStops([{ ...stop, id: 1, stop_name: "C", lat: 1, lng: 2, boothcode: null, assembly_constituency: "Hebbal", ac_number: 158 }]).stops
  assert.deepEqual([kept.ac_number, kept.assembly_constituency], [158, "Hebbal"])
})

test("legacy rows the migration's precheck refuses are reported", () => {
  const row = { boothcode: "29150001", assembly_constituency: "Yelahanka", ac_number: 150 }
  assert.equal(legacyRowProblem({ ...row, boothcode: null }), null)
  assert.match(legacyRowProblem({ ...row, ac_number: 151 }), /booth is in AC 150/)
  assert.match(legacyRowProblem({ ...row, assembly_constituency: "Yelahanka " }), /is not "Yelahanka"/)
  assert.match(legacyRowProblem({ ...row, ac_number: null, assembly_constituency: "Mahalakshmi Layout - AC - Stops with Number of Trips" }), /AC 150 booth/)
  assert.match(legacyRowProblem({ ...row, ac_number: null, assembly_constituency: "Somewhere" }), /unexpected constituency label/)
  assert.match(legacyRowProblem({ ...row, boothcode: "29199001" }), /not a Bengaluru booth code/)
})

test("the all-stops file is checked against the constituency files", () => {
  const { ac150, ac151, allStops } = parseFixtures()
  const drift = compareAllStopsFile([...ac150.rows, ...ac151.rows], allStops.rows)
  assert.equal(drift.onlyInAllStops.length, 0)
  assert.equal(drift.onlyInAcFiles.length, 6)
  assert.equal(drift.boothsNotInAcFiles, 0)
})

// ---------------------------------------------------------------------------
// ward statistics
// ---------------------------------------------------------------------------

const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]

test("point-in-ward follows ST_Within: boundaries excluded, every later ring is a hole", () => {
  const ward = { type: "MultiPolygon", coordinates: [[square(0, 0, 10, 10), square(4, 4, 6, 6)]] }
  assert.equal(pointWithin(2, 2, ward), true)
  assert.equal(pointWithin(5, 5, ward), false, "inside the hole")
  assert.equal(pointWithin(4, 5, ward), false, "on the hole's edge")
  assert.equal(pointWithin(0, 5, ward), false, "on the shell's edge")
  assert.equal(pointWithin(10, 10, ward), false, "on a vertex")
  assert.equal(pointWithin(11, 5, ward), false)

  // Production wards 1 and 105 have "holes" outside their shell; PostGIS
  // still treats them as holes, so points there are not in the ward.
  const odd = { type: "Polygon", coordinates: [square(0, 0, 10, 10), square(20, 20, 30, 30)] }
  assert.equal(pointWithin(25, 25, odd), false)
  assert.equal(pointWithin(5, 5, odd), true)
  assert.equal(pointWithin(1, 1, null), false)
})

test("ward stats count physical stops once, NULL trips as a stop with no trips, and signals independently", () => {
  const wards = [
    { ward_no: 2, ward_name: "Two", geom: { type: "Polygon", coordinates: [square(10, 0, 20, 10)] } },
    { ward_no: 1, ward_name: "One", geom: { type: "Polygon", coordinates: [square(0, 0, 10, 10)] } },
    { ward_no: 3, ward_name: "Empty", geom: null },
  ]
  const stops = [
    { lng: 1, lat: 1, trips: 100 },
    { lng: 2, lat: 2, trips: null },
    { lng: 3, lat: 3, trips: 0 },
    { lng: 15, lat: 5, trips: 7 },
    { lng: 10, lat: 5, trips: 1000 }, // on the shared edge: in neither ward
  ]
  const signals = [{ lng: 5, lat: 5 }, { lng: 6, lat: 6 }, { lng: 12, lat: 1 }]
  const stats = wardInfraStats(wards, stops, signals)
  assert.deepEqual([...stats.keys()], [1, 2, 3])
  assert.deepEqual(stats.get(1), { ward_no: 1, ward_name: "One", signal_count: 2, bus_stop_count: 3, daily_trips: 100 })
  assert.deepEqual(stats.get(2), { ward_no: 2, ward_name: "Two", signal_count: 1, bus_stop_count: 1, daily_trips: 7 })
  assert.deepEqual(stats.get(3), { ward_no: 3, ward_name: "Empty", signal_count: 0, bus_stop_count: 0, daily_trips: 0 })

  assert.deepEqual(compareWithWardBusStops(stats, [
    { ward_no: 1, stop_count: 3, total_trips: "100" },
    { ward_no: 2, stop_count: 1, total_trips: 7 },
  ]), [])
  const mismatches = compareWithWardBusStops(stats, [{ ward_no: 1, stop_count: 2, total_trips: 100 }])
  assert.deepEqual(mismatches.map(m => m.ward_no), [1, 2], "ward 2 has stops but no ward_bus_stops row")

  // The ward_bus_stops view: wards with a stop only, like the table it replaces.
  const view = wardBusStopsView(stats)
  assert.deepEqual(view, [
    { ward_no: 1, stop_count: 3, total_trips: 100 },
    { ward_no: 2, stop_count: 1, total_trips: 7 },
  ])
  const table = [{ ward_no: 2, stop_count: 1, total_trips: "7" }, { ward_no: 1, stop_count: 3, total_trips: 100 }]
  assert.deepEqual(diffWardBusStops(table, view), [])

  // The swap refuses what the dedup assertion tolerates: a 0-stop table row the view would drop.
  const zeroRow = [...table, { ward_no: 3, stop_count: 0, total_trips: 0 }]
  assert.deepEqual(compareWithWardBusStops(stats, zeroRow), [])
  assert.deepEqual(diffWardBusStops(zeroRow, view), [{ ward_no: 3, table: { stop_count: 0, total_trips: 0 }, view: null }])
  assert.deepEqual(diffWardBusStops(table.slice(0, 1), view).map(d => [d.ward_no, d.table]), [[1, null]])
  assert.deepEqual(diffWardBusStops([{ ward_no: 1, stop_count: 3, total_trips: 101 }, table[0]], view).map(d => d.ward_no), [1])
  assert.deepEqual(diffWardBusStops([{ ward_no: 1, stop_count: 3, total_trips: null }, table[0]], [{ ...view[0], total_trips: 0 }, view[1]]).map(d => d.ward_no), [1], "NULL is not 0")
})

// ---------------------------------------------------------------------------
// source pinning and diff
// ---------------------------------------------------------------------------

test("the ingest refuses a changed opencity resource list", () => {
  const live = [
    ...PINNED_CSV_RESOURCES.map(r => ({ id: r.id, name: r.name, url: r.url, format: "CSV" })),
    { id: "kml-1", name: "BMTC Stops and routes map for division 150 - Yelahanka", url: "https://x/ac150.kml", format: "KML" },
  ]
  assert.equal(PINNED_CSV_RESOURCES.length, 29)
  assert.deepEqual(new Set(PINNED_CSV_RESOURCES.filter(r => r.kind === "ac").map(r => r.acNumber)), new Set(Object.keys(AC_NAMES).map(Number)))
  assert.deepEqual(checkResources(live), [])

  const renamed = live.map(r => (r.id === resource(156).id ? { ...r, name: "Mahalakshmi Layout - AC 156 Stops" } : r))
  assert.match(checkResources(renamed).join("\n"), /renamed/)
  const moved = live.map(r => (r.id === resource(150).id ? { ...r, url: `${r.url}?v=2` } : r))
  assert.match(checkResources(moved).join("\n"), /moved/)
  assert.match(checkResources(live.filter(r => r.id !== resource(177).id)).join("\n"), /no longer in the package/)
  assert.match(checkResources([...live, { id: "new", name: "AC 178", url: "https://x/ac178.csv", format: "csv" }]).join("\n"), /new CSV/)
})

test("the ingest diff reports added, removed and changed stops and booth links", () => {
  const { rows } = parseFixtures()
  const desired = collapseStops(rows)
  assert.deepEqual(Object.values(diffStops(desired, desired)).map(v => (Array.isArray(v) ? v.length : v)), [0, 0, 0, 8, 0, 0])

  const current = collapseStops([
    ...rows.filter(r => r.stop_name !== "KR Puram Station" && !(r.stop_name === "Yelahanka Old Town" && r.boothcode === "29150002")),
    { city_id: CITY_ID, stop_name: "Gone Stop", lat: 1, lng: 1, trips: 3, routes: "{}", boothcode: "29150009" },
  ].map(r => (r.stop_name === "Zero Trip Stop" ? { ...r, trips: 4 } : r)))
  const diff = diffStops(desired, current)
  assert.deepEqual(diff.added.map(s => s.stop_name), ["KR Puram Station"])
  assert.deepEqual(diff.removed.map(s => s.stop_name), ["Gone Stop"])
  assert.deepEqual(diff.changed.map(c => [c.stop_name, c.fields]), [["Zero Trip Stop", ["trips"]]])
  assert.deepEqual(diff.linksAdded.map(l => l.boothcode).sort(), ["29150002", "29151008"])
  assert.deepEqual(diff.linksRemoved.map(l => l.boothcode), ["29150009"])
})

test("physical keys match lat/lng numerically, not by source text", () => {
  const row = { city_id: CITY_ID, stop_name: "A", lat: "13.01477770", lng: 77.5 }
  assert.equal(physicalKey(row), physicalKey({ ...row, lat: 13.0147777 }))
  assert.notEqual(physicalKey(row), physicalKey({ ...row, stop_name: "A " }))
})

// ---------------------------------------------------------------------------
// migration text guards
// ---------------------------------------------------------------------------

const viewSql = code.match(/CREATE MATERIALIZED VIEW public\.ward_infra_stats AS([\s\S]*?);/)?.[1] ?? ""

test("migration: a unique index on the physical key keeps duplicates out", () => {
  assert.match(code, /CREATE UNIQUE INDEX IF NOT EXISTS bmtc_stops_physical_key\s+ON public\.bmtc_stops \(city_id, stop_name, lat, lng\);/)
  assert.ok(code.indexOf("bmtc_stops_physical_key") > code.search(/DELETE FROM public\.bmtc_stops/), "index is created after the duplicates are gone")
  assert.doesNotMatch(code, /ALTER TABLE public\.bmtc_stops[\s\S]*?DROP COLUMN/i, "the public bmtc_stops shape is unchanged")
})

test("migration: ward_infra_stats no longer joins signals and stops in one FROM", () => {
  assert.ok(viewSql, "the view is recreated")
  assert.doesNotMatch(viewSql, /JOIN\s+public\.(?:traffic_signals|bmtc_stops)\b/)
  const fromClauses = viewSql.split(/\bFROM\b/).slice(1).map(clause => clause.split(/\bWHERE\b|\)/)[0])
  assert.ok(fromClauses.some(clause => /public\.traffic_signals/.test(clause)))
  assert.ok(fromClauses.some(clause => /public\.bmtc_stops/.test(clause)))
  for (const clause of fromClauses) {
    assert.ok(!(/traffic_signals/.test(clause) && /bmtc_stops/.test(clause)), `one FROM lists both tables: ${clause}`)
  }
  assert.equal((viewSql.match(/CROSS JOIN LATERAL/g) ?? []).length, 2)
  assert.doesNotMatch(viewSql, /count\(DISTINCT bs\.id\)/)

  // Same public columns, in order, as the baseline view.
  const baseline = read("supabase/migrations/20260505_remote_schema.sql")
  const baselineColumns = [...baseline.match(/CREATE MATERIALIZED VIEW "public"\."ward_infra_stats" AS([\s\S]*?)FROM/)[1].matchAll(/AS "(\w+)"|"wb"\."(\w+)"/g)].map(m => m[1] ?? m[2])
  const columns = [...viewSql.split(/\bFROM\b/)[0].matchAll(/\.(\w+)\s*(?:,|$)/g)].map(m => m[1])
  assert.deepEqual(columns, baselineColumns)
})

test("migration: the view is populated, indexed, granted and refreshable only by the service role", () => {
  const create = code.indexOf("CREATE MATERIALIZED VIEW public.ward_infra_stats")
  assert.ok(code.indexOf("DROP MATERIALIZED VIEW IF EXISTS public.ward_infra_stats;") < create)
  assert.ok(code.indexOf("REFRESH MATERIALIZED VIEW public.ward_infra_stats;") > create)
  assert.match(code, /CREATE UNIQUE INDEX IF NOT EXISTS idx_ward_infra_stats_ward_no\s+ON public\.ward_infra_stats \(ward_no\);/)
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.match(code, new RegExp(`GRANT ALL ON TABLE public\\.ward_infra_stats TO ${role};`))
  }
  assert.match(code, /CREATE OR REPLACE FUNCTION public\.refresh_ward_infra_stats\(\)[\s\S]*?SECURITY DEFINER\s+SET search_path = ''/)
  assert.match(code, /REVOKE ALL ON FUNCTION public\.refresh_ward_infra_stats\(\) FROM PUBLIC;/)
  assert.match(code, /REVOKE ALL ON FUNCTION public\.refresh_ward_infra_stats\(\) FROM anon, authenticated;/)
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.refresh_ward_infra_stats\(\) TO service_role;/)
  assert.doesNotMatch(code, /GRANT EXECUTE ON FUNCTION public\.refresh_ward_infra_stats\(\) TO [^;]*\b(?:anon|authenticated|PUBLIC)\b/)
})

test("migration: booth links are preserved before any row is deleted, publicly readable, service-role written", () => {
  const insert = code.search(/INSERT INTO public\.bmtc_stop_booths/)
  const update = code.search(/UPDATE public\.bmtc_stops/)
  const del = code.search(/DELETE FROM public\.bmtc_stops/)
  assert.ok(insert > 0 && insert < update && update < del)
  assert.match(code, /PRIMARY KEY \(stop_id, boothcode\)/)
  assert.match(code, /REFERENCES public\.bmtc_stops \(id\) ON DELETE CASCADE/)
  assert.match(code, /ALTER TABLE public\.bmtc_stop_booths ENABLE ROW LEVEL SECURITY;/)
  assert.match(code, /CREATE POLICY bmtc_stop_booths_public_read ON public\.bmtc_stop_booths\s+FOR SELECT USING \(true\);/)
  assert.match(code, /REVOKE ALL ON public\.bmtc_stop_booths FROM anon, authenticated;\s*GRANT SELECT ON public\.bmtc_stop_booths TO anon, authenticated;/)
  // Survivor is the lowest id, in both the link insert and the delete.
  assert.equal((code.match(/min\(id\) OVER \(PARTITION BY city_id, stop_name, lat, lng\)/g) ?? []).length, 2)
})

test("migration: prechecks and assertions raise so the whole file rolls back", () => {
  const precheck = code.indexOf("DO $bmtc_precheck$")
  const verify = code.indexOf("DO $bmtc_verify$")
  assert.ok(precheck > 0 && precheck < code.search(/CREATE TABLE IF NOT EXISTS public\.bmtc_stop_booths/), "checks run before any change")
  assert.ok(verify > code.indexOf("REFRESH MATERIALIZED VIEW public.ward_infra_stats;"), "assertions read the refreshed view")
  const verifyBlock = code.slice(verify)
  assert.match(verifyBlock, /IF stop_rows = 0 THEN[\s\S]*?RETURN;/, "an empty local replay passes trivially")
  assert.match(verifyBlock, /IF stop_rows <> physical_stops THEN\s+RAISE EXCEPTION/)
  assert.match(verifyBlock, /boothcode IS NOT NULL\) THEN\s+RAISE EXCEPTION/)
  assert.match(verifyBlock, /FROM public\.ward_bus_stops b\s+LEFT JOIN public\.ward_infra_stats w/)
  assert.match(verifyBlock, /w\.bus_stop_count IS DISTINCT FROM b\.stop_count::bigint/)
  assert.match(verifyBlock, /w\.daily_trips IS DISTINCT FROM b\.total_trips/)
  assert.match(verifyBlock, /NOT EXISTS \(SELECT 1 FROM public\.ward_bus_stops b WHERE b\.ward_no = w\.ward_no\)/)
  assert.match(code.slice(precheck, verify), /trips_values > 1 OR routes_values > 1[\s\S]*?RAISE EXCEPTION/)
  // NULL trips: a stop, no trips; exactly how ward_bus_stops was built.
  assert.match(viewSql, /count\(\*\) AS bus_stop_count,\s+coalesce\(sum\(bs\.trips\), 0\)::bigint AS daily_trips/)
})

test("migration: replay-safe and free of transaction control", () => {
  assert.match(code, /CREATE TABLE IF NOT EXISTS public\.bmtc_stop_booths/)
  assert.match(code, /DROP POLICY IF EXISTS bmtc_stop_booths_public_read/)
  assert.match(code, /ON CONFLICT \(stop_id, boothcode\) DO NOTHING;/)
  assert.match(code, /WHERE s\.id = links\.stop_id\s+AND s\.boothcode IS NOT NULL;/, "only uncollapsed rows are rewritten")
  assert.match(code, /IF removed = '0' THEN[\s\S]*?RETURN;/, "a replay over collapsed rows skips the ward_bus_stops cross-check")
  assert.match(code, /CREATE TEMP TABLE bmtc_dedup_ac_names \(ac_number, name\) ON COMMIT DROP AS/)
  assert.doesNotThrow(() => buildRehearsalSql(migration))
})

test("migration: ward_bus_stops becomes a read-only view over ward_infra_stats with the table's columns", () => {
  const view = code.match(/CREATE OR REPLACE VIEW public\.ward_bus_stops\s+WITH \(security_invoker = true\) AS([\s\S]*?);/)?.[1] ?? ""
  assert.ok(view, "ward_bus_stops is a security-invoker view")
  assert.match(view, /^\s*SELECT ward_no,\s+bus_stop_count::integer AS stop_count,\s+daily_trips AS total_trips\s+FROM public\.ward_infra_stats\s+WHERE bus_stop_count > 0\s*$/)

  // Same public columns and types as the baseline table, and the migration
  // raises unless the created view has exactly those.
  const baseline = read("supabase/migrations/20260505_remote_schema.sql")
  const table = baseline.match(/CREATE TABLE IF NOT EXISTS "public"\."ward_bus_stops" \(([\s\S]*?)\n\);/)[1]
  const columns = table.split(",").map(column => column.trim().replaceAll('"', "").split(/\s+/).slice(0, 2).join(" ")).join(", ")
  assert.equal(columns, "ward_no integer, stop_count integer, total_trips bigint")
  assert.match(code, new RegExp(`IF columns IS DISTINCT FROM '${columns}' THEN\\s+RAISE EXCEPTION`))

  assert.match(code, /REVOKE ALL ON public\.ward_bus_stops FROM anon, authenticated, service_role;\s*GRANT SELECT ON public\.ward_bus_stops TO anon, authenticated, service_role;/)
  assert.doesNotMatch(code, /GRANT (?:ALL|INSERT|UPDATE|DELETE|TRUNCATE)[^;]*ON (?:TABLE )?public\.ward_bus_stops\b/)
})

test("migration: the ward_bus_stops table checks the collapse, then is dropped only after the view matches it row for row", () => {
  const dedupCheck = code.indexOf("DO $bmtc_verify$")
  const rename = code.indexOf("ALTER TABLE public.ward_bus_stops RENAME TO ward_bus_stops_static;")
  const create = code.indexOf("CREATE OR REPLACE VIEW public.ward_bus_stops")
  const compare = code.search(/FROM public\.ward_bus_stops_static t\s+FULL JOIN public\.ward_bus_stops v ON v\.ward_no = t\.ward_no/)
  const refuse = code.indexOf("RAISE EXCEPTION 'ward_bus_stops view would change published figures")
  const drop = code.indexOf("DROP TABLE public.ward_bus_stops_static;")
  assert.ok(dedupCheck > 0 && dedupCheck < rename, "the dedup assertion reads the static table")
  assert.ok(rename < create && create < compare && compare < refuse && refuse < drop)
  assert.equal((code.match(/DROP TABLE/g) ?? []).length, 1, "only the renamed, compared table is dropped")

  const compareBlock = code.slice(compare, refuse)
  for (const condition of ["t.ward_no IS NULL", "v.ward_no IS NULL", "t.stop_count IS DISTINCT FROM v.stop_count", "t.total_trips IS DISTINCT FROM v.total_trips"]) {
    assert.ok(compareBlock.includes(condition), condition)
  }
  assert.match(code, /IF to_regclass\('public\.ward_bus_stops_static'\) IS NOT NULL THEN\s+RAISE EXCEPTION/, "a leftover static table is never overwritten")
  assert.match(code, /IF EXISTS \(SELECT 1 FROM public\.ward_bus_stops_static\) THEN/, "an empty local table has nothing to compare")
})

test("migration: a replay over a migrated database drops the dependent view before rebuilding ward_infra_stats", () => {
  const unview = code.search(/= 'v' THEN\s+DROP VIEW public\.ward_bus_stops;/)
  assert.ok(unview > 0 && unview < code.indexOf("DROP MATERIALIZED VIEW IF EXISTS public.ward_infra_stats;"))
  assert.doesNotMatch(code, /DROP MATERIALIZED VIEW[^;]*CASCADE/)
})

test("migration and scripts pin the same constituency names", () => {
  const values = code.match(/CREATE TEMP TABLE bmtc_dedup_ac_names[\s\S]*?;/)[0]
  const pinned = Object.fromEntries([...values.matchAll(/\((\d+), '([^']+)'\)/g)].map(m => [m[1], m[2]]))
  assert.deepEqual(pinned, Object.fromEntries(Object.entries(AC_NAMES)))
})

// ---------------------------------------------------------------------------
// scripts
// ---------------------------------------------------------------------------

test("rehearsal SQL can only roll back and its counts are recoverable from the error", () => {
  const sql = buildRehearsalSql(migration)
  assert.match(sql, /^BEGIN;\n/)
  // Published rows are copied before the migration swaps the table for a view,
  // and the counts compare the view with that copy.
  assert.match(sql, /^BEGIN;\n\nCREATE TEMP TABLE kaun_rehearsal_published ON COMMIT DROP AS\nSELECT ward_no, stop_count, total_trips FROM public\.ward_bus_stops;\n/)
  assert.ok(sql.indexOf("CREATE TEMP TABLE kaun_rehearsal_published") < sql.indexOf(migration))
  const counts = sql.slice(sql.indexOf("DO $kaun_rehearsal$"))
  assert.match(counts, /'ward_bus_stops_stop_count', \(SELECT sum\(stop_count\) FROM pg_temp\.kaun_rehearsal_published\)/)
  assert.match(counts, /'ward_bus_stops_relkind'/)
  assert.match(counts, /FROM pg_temp\.kaun_rehearsal_published b\s+FULL JOIN public\.ward_bus_stops v/)
  assert.match(sql, /RAISE EXCEPTION 'KAUN_REHEARSAL_RESULT %', result::text;\nEND\n\$kaun_rehearsal\$;\n\nROLLBACK;\n$/)
  assert.doesNotMatch(sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ""), /^\s*COMMIT\b/im)
  for (const bad of ["COMMIT;", "select 1;\ncommit;", "END;", "SAVEPOINT a;", "START TRANSACTION;"]) {
    assert.throws(() => buildRehearsalSql(`CREATE TABLE IF NOT EXISTS x (a int);\n${bad}`), /transaction control/, bad)
  }
  assert.doesNotThrow(() => buildRehearsalSql("DO $x$ BEGIN RAISE NOTICE 'hi'; END $x$;\nSELECT 'COMMIT';"))

  const message = 'ERROR:  P0001: KAUN_REHEARSAL_RESULT {"stop_rows": 2972, "rows_removed": "39557"}\nCONTEXT: PL/pgSQL function inline_code_block line 24 at RAISE'
  assert.deepEqual(parseRehearsalResult(message), { stop_rows: 2972, rows_removed: "39557" })
  assert.deepEqual(parseRehearsalResult(JSON.stringify({ message })), { stop_rows: 2972, rows_removed: "39557" })
  assert.equal(parseRehearsalResult("ERROR: bmtc_stops dedup: 5 rows for 4 physical stops"), null)
})

test("scripts read with the same public anon key and URL as the web app", () => {
  const config = read("apps/web/lib/supabase-config.ts")
  assert.equal(config.match(/DEFAULT_SUPABASE_URL = "([^"]+)"/)[1], DEFAULT_SUPABASE_URL)
  assert.equal(config.match(/DEFAULT_SUPABASE_ANON_KEY = "([^"]+)"/)[1], DEFAULT_ANON_KEY)
  const payload = JSON.parse(Buffer.from(DEFAULT_ANON_KEY.split(".")[1], "base64url").toString())
  assert.equal(payload.role, "anon")
})

test("writes are gated behind explicit flags and credentials", () => {
  const plan = read("scripts/bmtc/dedup-bmtc-stops.mjs")
  const ingest = read("scripts/bmtc/ingest-bmtc-stops.mjs")
  const pure = read("scripts/bmtc/bmtc-stops.mjs")

  assert.doesNotMatch(pure, /\bfetch\(|process\.env|node:fs|node:child_process/, "the collapse module is pure")

  assert.doesNotMatch(plan, /restWrite|--apply|method: "(?:PATCH|DELETE|PUT)"/, "the plan never writes through PostgREST")
  assert.match(plan, /flag\("rehearse"\) \? rehearse\(\) : plan\(\)/)
  assert.match(plan, /if \(!token\) throw new Error\("--rehearse needs SUPABASE_ACCESS_TOKEN/)
  assert.equal((plan.match(/api\.supabase\.com/g) ?? []).length, 2, "one documented and one real Management API call")
  assert.ok(plan.indexOf("buildRehearsalSql(") < plan.indexOf("database/query`"), "only rehearsal SQL is sent")
  assert.match(plan, /diffWardBusStops\(wardBusStops, wardBusStopsView\(after\)\)/, "the plan mirrors the view swap check")
  assert.match(plan, /result\.ward_bus_stops_relkind !== "v"/, "a rehearsal that leaves a table fails")

  assert.match(ingest, /if \(applying && !serviceKey\) throw new Error\("--apply needs SUPABASE_SERVICE_ROLE_KEY"\)/)
  assert.match(ingest, /if \(!applying\) return\n/)
  const beforeApply = ingest.slice(ingest.indexOf("async function main"), ingest.indexOf("if (!applying) return"))
  assert.doesNotMatch(beforeApply, /restWrite|apply\(/, "nothing writes before the --apply gate")
  assert.match(ingest, /if \(diff\.removed\.length && !prune\)/)
  assert.ok(ingest.indexOf("if (diff.removed.length && !prune)") < ingest.indexOf('restWrite("POST"'), "the prune guard runs before any write")
  assert.match(ingest, /if \(!currentState\.collapsedInDb\)/)

  // collapsedInDb means the migration ran, so ward_bus_stops is the view and
  // refreshing ward_infra_stats is the only step that keeps it current.
  assert.match(ingest, /restWrite\("POST", "rpc\/refresh_ward_infra_stats"/)
  assert.doesNotMatch(ingest, /restWrite\([^)]*ward_bus_stops/)
  assert.doesNotMatch(read("docs/bmtc-stops.md"), /ingest does not rebuild it|legitimately differ/)
})

test("importing the CLIs does not run them", async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error("a CLI ran on import") }
  try {
    await import("../scripts/bmtc/dedup-bmtc-stops.mjs")
    await import("../scripts/bmtc/ingest-bmtc-stops.mjs")
  } finally {
    globalThis.fetch = realFetch
  }
})
