#!/usr/bin/env node
/**
 * dedup-bmtc-stops.mjs — plan, rehearse and verify
 * supabase/migrations/20260917_bmtc_stops_dedup.sql.
 *
 * Usage:
 *   node scripts/bmtc/dedup-bmtc-stops.mjs              # plan (default): read-only anon GETs
 *   node scripts/bmtc/dedup-bmtc-stops.mjs --rehearse   # needs SUPABASE_ACCESS_TOKEN
 *
 * PLAN (default, read-only)
 *   Reads bmtc_stops, bmtc_stop_booths (if it exists yet), ward_boundaries,
 *   traffic_signals, ward_bus_stops and ward_infra_stats with the public anon
 *   key, and applies the migration's rules in JavaScript (scripts/bmtc/bmtc-stops.mjs):
 *   rows before and after, rows to delete, booth links to preserve, constituency
 *   labels normalised or nulled, per-ward ward_infra_stats before -> after, and
 *   the after-state checked against ward_bus_stops. Exits 1 if the migration's
 *   prechecks would refuse the data or its after-state would not match
 *   ward_bus_stops. Once production is migrated, the same command is the
 *   verification step: it reports the table as collapsed and checks the live view.
 *
 * REHEARSE (--rehearse)
 *   Sends the migration to the Supabase Management API
 *   (POST https://api.supabase.com/v1/projects/<ref>/database/query) as
 *     BEGIN; <migration>; DO <block that always raises with the counts>; ROLLBACK;
 *   The last block raises unconditionally, so the transaction can only roll
 *   back; the counts come back in that error. It holds locks on bmtc_stops and
 *   ward_infra_stats for the few seconds it runs, so reads of the view wait.
 *
 * APPLYING FOR REAL
 *   Not here. Production takes the migration through the documented path
 *   (docs/bmtc-stops.md, docs/local-database.md "Production rollout"):
 *   `supabase migration repair` for the already-live versions, then
 *   `supabase db push`. Run this plan again afterwards to verify.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { flag, run } from "../india/lib/cli.mjs"
import {
  AC_NAMES,
  LEGACY_TITLE_LABELS,
  buildRehearsalSql,
  collapseStops,
  compareWithWardBusStops,
  legacyRowProblem,
  parseRehearsalResult,
  wardInfraStats,
} from "./bmtc-stops.mjs"
import { formatCount as n, projectRef, readAll, supabaseUrl } from "./io.mjs"

const MIGRATION = resolve(import.meta.dirname, "../../supabase/migrations/20260917_bmtc_stops_dedup.sql")

const line = (label, value) => console.log(`  ${label.padEnd(56)} ${value}`)

async function readState() {
  const [stops, booths, wards, signals, wardBusStops, infra] = await Promise.all([
    readAll("bmtc_stops", { select: "id,city_id,stop_name,lat,lng,trips,routes,boothcode,assembly_constituency,ac_number", order: "id" }),
    readAll("bmtc_stop_booths", { select: "stop_id,boothcode,ac_number,assembly_constituency", order: "stop_id,boothcode" }),
    readAll("ward_boundaries", { select: "ward_no,ward_name,geom", order: "ward_no", pageSize: 100 }),
    readAll("traffic_signals", { select: "id,lat,lng", order: "id" }),
    readAll("ward_bus_stops", { select: "ward_no,stop_count,total_trips", order: "ward_no" }),
    readAll("ward_infra_stats", { select: "ward_no,ward_name,signal_count,bus_stop_count,daily_trips", order: "ward_no" })
      .catch(error => ({ error })),
  ])
  for (const [name, rows] of Object.entries({ bmtc_stops: stops, ward_boundaries: wards, traffic_signals: signals, ward_bus_stops: wardBusStops })) {
    if (!rows) throw new Error(`${name} does not exist at ${supabaseUrl()}`)
  }
  return { stops, booths, wards, signals, wardBusStops, infra }
}

async function plan() {
  console.log(`\nBMTC stops dedup plan (read-only) — ${supabaseUrl()} — ${new Date().toISOString()}`)
  const { stops, booths, wards, signals, wardBusStops, infra } = await readState()
  let ok = true

  const problems = stops.map(row => [row, legacyRowProblem(row)]).filter(([, problem]) => problem)
  const collapsed = collapseStops(stops)
  const physical = collapsed.stops.length
  const alreadyCollapsed = physical === stops.length && stops.every(row => row.boothcode === null)
  const pendingLinks = collapsed.links.length

  // Links already in bmtc_stop_booths count towards what every stop keeps.
  const idToKey = new Map(collapsed.stops.map(stop => [stop.id, stop.key]))
  const linkKeys = new Set(collapsed.links.map(link => `${link.key}|${link.boothcode}`))
  let orphanLinks = 0
  for (const link of booths ?? []) {
    const key = idToKey.get(link.stop_id)
    if (key === undefined) orphanLinks += 1
    else linkKeys.add(`${key}|${link.boothcode}`)
  }
  const linkedStops = new Set([...linkKeys].map(k => k.slice(0, k.lastIndexOf("|"))))

  console.log("\nbmtc_stops")
  line("rows now", n(stops.length))
  line("physical stops (rows after)", n(physical))
  line("rows to delete", n(stops.length - physical))
  line("physical stops with NULL trips", n(collapsed.stops.filter(s => s.trips === null).length))
  line("stops whose rows disagree on trips/routes", n(collapsed.conflicts.length))
  line("rows the migration precheck would refuse", n(problems.length))
  line("status", alreadyCollapsed ? "already one row per stop (migration applied)" : "not yet collapsed")
  if (collapsed.conflicts.length || problems.length) ok = false
  for (const conflict of collapsed.conflicts.slice(0, 5)) console.log(`    conflict: ${conflict.stop_name} ${conflict.field} ${JSON.stringify(conflict.values)}`)
  for (const [row, problem] of problems.slice(0, 5)) console.log(`    refused: row ${row.id}: ${problem}`)

  console.log("\nbmtc_stop_booths")
  line("table exists", booths ? `yes (${n(booths.length)} rows)` : "no (created by the migration)")
  line("distinct (stop, booth) pairs still on bmtc_stops rows", n(pendingLinks))
  line("links after the migration", n(linkKeys.size))
  line("distinct booths", n(new Set([...linkKeys].map(k => k.slice(k.lastIndexOf("|") + 1))).size))
  const stopsWithoutBooth = physical - collapsed.stops.filter(s => linkedStops.has(s.key)).length
  line("stops left without any booth", n(stopsWithoutBooth))
  if (orphanLinks) line("links pointing at a non-surviving stop id", n(orphanLinks))
  if (stopsWithoutBooth) ok = false

  console.log("\nConstituency labels")
  for (const label of Object.keys(LEGACY_TITLE_LABELS)) {
    const rows = stops.filter(row => row.assembly_constituency === label && row.boothcode !== null)
    const acs = [...new Set(rows.map(row => Number(row.boothcode.slice(2, 5))))].sort()
    line(`rows labelled "${label}"`, `${n(rows.length)} -> AC ${acs.join(", ") || "-"} from booth codes`)
  }
  const survivorsById = new Map(stops.map(row => [row.id, row]))
  let kept = 0, nulled = 0, relabelled = 0, unchanged = 0
  for (const stop of collapsed.stops) {
    if (stop.ac_number === null) nulled += 1
    else kept += 1
    const before = survivorsById.get(stop.id)
    if (before.assembly_constituency === stop.assembly_constituency && before.ac_number === stop.ac_number) unchanged += 1
    else if (stop.ac_number !== null) relabelled += 1
  }
  line("stops keeping a constituency (all booths agree)", n(kept))
  line("stops set to NULL (booths in more than one AC)", n(nulled))
  line("surviving rows whose label changes to a name", n(relabelled))
  line("surviving rows whose label is unchanged", n(unchanged))
  line("constituencies pinned", `${Object.keys(AC_NAMES).length} (AC ${Object.keys(AC_NAMES)[0]}-${Object.keys(AC_NAMES).at(-1)})`)

  const after = wardInfraStats(wards, collapsed.stops, signals)
  const beforeRows = Array.isArray(infra) ? infra : null
  const before = new Map((beforeRows ?? []).map(row => [row.ward_no, row]))
  const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0)
  const afterRows = [...after.values()]

  console.log(`\nward_infra_stats (${n(afterRows.length)} wards)`)
  if (!beforeRows) console.log(`  current view unreadable: ${infra.error.message}`)
  line("bus_stop_count total", `${n(beforeRows && sum(beforeRows, "bus_stop_count"))} -> ${n(sum(afterRows, "bus_stop_count"))}`)
  line("daily_trips total", `${n(beforeRows && sum(beforeRows, "daily_trips"))} -> ${n(sum(afterRows, "daily_trips"))}`)
  line("signal_count total", `${n(beforeRows && sum(beforeRows, "signal_count"))} -> ${n(sum(afterRows, "signal_count"))}`)
  const signalChanges = afterRows.filter(row => before.has(row.ward_no) && Number(before.get(row.ward_no).signal_count) !== row.signal_count)
  line("wards whose signal_count would change", n(signalChanges.length))

  console.log("\n  ward  name                              stops before -> after      daily trips before -> after   signals")
  for (const row of afterRows) {
    const b = before.get(row.ward_no)
    const cell = (from, to, width) => `${n(from)} -> ${n(to)}`.padStart(width)
    console.log(`  ${String(row.ward_no).padStart(4)}  ${String(row.ward_name ?? "").slice(0, 32).padEnd(32)} ${cell(b?.bus_stop_count, row.bus_stop_count, 22)} ${cell(b?.daily_trips, row.daily_trips, 32)} ${cell(b?.signal_count, row.signal_count, 10)}`)
  }

  console.log(`\nVerification against ward_bus_stops (${n(wardBusStops.length)} wards)`)
  const mismatches = compareWithWardBusStops(after, wardBusStops)
  line("wards matching after the migration", `${n(wardBusStops.length - mismatches.filter(m => wardBusStops.some(b => b.ward_no === m.ward_no)).length)} / ${n(wardBusStops.length)}`)
  line("wards outside ward_bus_stops that would have stops", n(mismatches.filter(m => !wardBusStops.some(b => b.ward_no === m.ward_no)).length))
  line("ward_bus_stops totals", `${n(sum(wardBusStops, "stop_count"))} stops, ${n(sum(wardBusStops, "total_trips"))} trips`)
  for (const m of mismatches.slice(0, 10)) console.log(`    ward ${m.ward_no}: expected ${JSON.stringify(m.expected)}, computed ${JSON.stringify(m.actual && { stops: m.actual.bus_stop_count, trips: m.actual.daily_trips })}`)
  if (mismatches.length) ok = false

  if (alreadyCollapsed && beforeRows) {
    const live = compareWithWardBusStops(new Map(beforeRows.map(row => [row.ward_no, { ...row, bus_stop_count: Number(row.bus_stop_count), daily_trips: Number(row.daily_trips) }])), wardBusStops)
    line("live ward_infra_stats matching ward_bus_stops", `${live.length ? "NO" : "yes"} (${n(live.length)} wards differ)`)
    if (live.length) ok = false
  }

  console.log(`\n${ok ? "PLAN OK" : "PLAN FAILED"}: ${ok ? "the migration's checks would pass on this data." : "the migration would refuse or fail its assertions; see above."}`)
  if (!ok) process.exitCode = 1
}

async function rehearse() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error("--rehearse needs SUPABASE_ACCESS_TOKEN (a Supabase personal access token)")
  const ref = projectRef()
  if (!ref) throw new Error(`--rehearse needs a hosted project URL, got ${supabaseUrl()}`)
  const sql = buildRehearsalSql(readFileSync(MIGRATION, "utf8"))

  console.log(`\nRehearsing ${MIGRATION} on project ${ref} inside a transaction that always rolls back...`)
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  let message = text
  try {
    const body = JSON.parse(text)
    message = body.message ?? body.error ?? text
  } catch { /* not JSON */ }

  if (res.ok) {
    throw new Error(`the rehearsal returned HTTP ${res.status} instead of its closing error. Check production state now: ${text.slice(0, 500)}`)
  }
  const result = parseRehearsalResult(message) ?? parseRehearsalResult(text)
  if (!result) {
    console.error(`\nThe migration failed before the rehearsal finished (rolled back, nothing committed):\n${String(message).slice(0, 2000)}`)
    process.exitCode = 1
    return
  }

  console.log("\nPost-migration state (rolled back):")
  for (const [key, value] of Object.entries(result)) line(key, n(value))
  const failures = [
    result.stop_rows !== result.physical_stops && "stop rows != physical stops",
    result.rows_with_boothcode !== 0 && "rows still carry a boothcode",
    result.stops_without_links !== 0 && "stops without booth links",
    result.wards_disagreeing !== 0 && "wards disagree with ward_bus_stops",
    Number(result.bus_stop_count) !== Number(result.ward_bus_stops_stop_count) && "bus_stop_count total != ward_bus_stops",
    Number(result.daily_trips) !== Number(result.ward_bus_stops_total_trips) && "daily_trips total != ward_bus_stops",
  ].filter(Boolean)
  console.log(`\n${failures.length ? `REHEARSAL FAILED: ${failures.join("; ")}` : "REHEARSAL OK"} (transaction rolled back)`)
  if (failures.length) process.exitCode = 1
}

run(() => (flag("rehearse") ? rehearse() : plan()), import.meta.url)
