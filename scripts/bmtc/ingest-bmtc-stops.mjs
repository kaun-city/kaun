#!/usr/bin/env node
/**
 * ingest-bmtc-stops.mjs — load BMTC stops from opencity.in as one row per
 * physical stop (public.bmtc_stops) plus its polling booths
 * (public.bmtc_stop_booths).
 *
 * Usage:
 *   node scripts/bmtc/ingest-bmtc-stops.mjs                   # dry run (default): no writes
 *   node scripts/bmtc/ingest-bmtc-stops.mjs --apply           # writes; needs SUPABASE_SERVICE_ROLE_KEY
 *   node scripts/bmtc/ingest-bmtc-stops.mjs --apply --prune   # also deletes stops the source dropped
 *
 * Env: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL (default: production),
 *      SUPABASE_SERVICE_ROLE_KEY (--apply only).
 *
 * Replaces the undocumented one-off load that put every (booth, stop) pair in
 * bmtc_stops. See scripts/bmtc/bmtc-stops.mjs for the source and the model.
 *
 * DRY RUN
 *   1. package_show for opencity package c4d9efee-e13b-4fe9-b5db-ce034a153e55;
 *      stops if its CSV list, titles or URLs differ from the pinned list.
 *   2. Downloads and parses the 29 CSVs (quoted route dicts, CRLF, trailing
 *      spaces in names, the all-stops file's repeated header and Ctrl-Z row).
 *   3. Collapses to physical stops and distinct booth links, and flags any stop
 *      whose rows disagree on trips or routes.
 *   4. Diffs against the current bmtc_stops/bmtc_stop_booths (anon GETs).
 *   Exits 1 on conflicts.
 *
 * APPLY (--apply)
 *   Refuses unless the dry-run checks pass, SUPABASE_SERVICE_ROLE_KEY is set and
 *   migration 20260917 has already collapsed bmtc_stops. Then, each step safe
 *   to re-run if a later one fails:
 *     upsert new/changed stops on (city_id, stop_name, lat, lng)
 *     upsert new booth links, then delete links the source no longer lists
 *     with --prune, delete stops the source no longer lists (links cascade)
 *     refresh ward_infra_stats via public.refresh_ward_infra_stats()
 *   Without --prune, stops missing from the source stop the apply before any write.
 */

import { flag, run } from "../india/lib/cli.mjs"
import {
  OPENCITY_PACKAGE_URL,
  PINNED_CSV_RESOURCES,
  checkResources,
  collapseStops,
  compareAllStopsFile,
  diffStops,
  parseStopsCsv,
  physicalKey,
} from "./bmtc-stops.mjs"
import { anonKey, fetchJson, fetchText, formatCount as n, readAll, restWrite, supabaseUrl } from "./io.mjs"

const line = (label, value) => console.log(`  ${label.padEnd(44)} ${value}`)
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))
const stopColumns = "city_id,stop_name,lat,lng,trips,routes,assembly_constituency,ac_number,boothcode"

async function loadSource() {
  const pkg = await fetchJson(OPENCITY_PACKAGE_URL)
  if (!pkg.success) throw new Error(`package_show failed: ${JSON.stringify(pkg.error ?? pkg).slice(0, 300)}`)
  const problems = checkResources(pkg.result.resources)
  if (problems.length) {
    throw new Error(`the opencity package's CSV list changed; review and update PINNED_CSV_RESOURCES:\n  - ${problems.join("\n  - ")}`)
  }
  console.log(`\nSource: ${pkg.result.title} (modified ${pkg.result.metadata_modified}), ${PINNED_CSV_RESOURCES.length} pinned CSVs match`)

  const parsed = []
  for (const batch of chunks(PINNED_CSV_RESOURCES, 6)) {
    parsed.push(...await Promise.all(batch.map(async resource => ({ resource, ...parseStopsCsv(await fetchText(resource.url), resource) }))))
  }
  const acRows = parsed.filter(p => p.resource.kind === "ac").flatMap(p => p.rows)
  const allStopsRows = parsed.filter(p => p.resource.kind === "all-stops").flatMap(p => p.rows)
  const skipped = parsed.flatMap(p => p.skipped.map(s => `${p.resource.name} line ${s.line}: ${s.reason}`))
  return { acRows, allStopsRows, skipped }
}

async function loadCurrent(key) {
  const stops = await readAll("bmtc_stops", { select: `id,${stopColumns}`, order: "id", key })
  const booths = await readAll("bmtc_stop_booths", { select: "stop_id,boothcode,ac_number,assembly_constituency", order: "stop_id,boothcode", key })
  const current = collapseStops(stops)
  const idToKey = new Map(current.stops.map(stop => [stop.id, stop.key]))
  const seen = new Set(current.links.map(link => `${link.key}|${link.boothcode}`))
  for (const link of booths ?? []) {
    const stopKey = idToKey.get(link.stop_id)
    if (stopKey === undefined || seen.has(`${stopKey}|${link.boothcode}`)) continue
    seen.add(`${stopKey}|${link.boothcode}`)
    current.links.push({ key: stopKey, boothcode: link.boothcode, ac_number: link.ac_number, assembly_constituency: link.assembly_constituency, stop_id: link.stop_id })
  }
  const collapsedInDb = Boolean(booths) && current.stops.length === stops.length && stops.every(row => row.boothcode === null)
  return { rows: stops.length, current, collapsedInDb }
}

function report(desired, source, currentState, diff) {
  const { acRows, allStopsRows, skipped } = source
  console.log("\nParsed")
  line("constituency-file rows", n(acRows.length))
  line("all-stops-file rows", n(allStopsRows.length))
  line("rows skipped (blank, repeated header)", `${n(skipped.length)}${skipped.length ? `: ${skipped.join("; ")}` : ""}`)
  line("physical stops", n(desired.stops.length))
  line("booth links", n(desired.links.length))
  line("stops with NULL trips", n(desired.stops.filter(s => s.trips === null).length))
  line("stops with booths in more than one AC", n(desired.stops.filter(s => s.ac_number === null).length))
  line("stops whose rows disagree on trips/routes", n(desired.conflicts.length))
  for (const c of desired.conflicts.slice(0, 10)) console.log(`    conflict: ${JSON.stringify(c.stop_name)} ${c.field} ${JSON.stringify(c.values)}`)

  const drift = compareAllStopsFile(acRows, allStopsRows)
  console.log("\nAll-stops file against the constituency files")
  line("stops only in the all-stops file", n(drift.onlyInAllStops.length))
  line("stops only in constituency files", n(drift.onlyInAcFiles.length))
  line("all-stops booths not in constituency files", n(drift.boothsNotInAcFiles))

  console.log(`\nAgainst ${supabaseUrl()}`)
  line("bmtc_stops rows now", n(currentState.rows))
  line("migration 20260917 applied", currentState.collapsedInDb ? "yes" : "no (--apply will refuse)")
  line("stops to add", n(diff.added.length))
  line("stops to remove (--prune)", n(diff.removed.length))
  line("stops to update", n(diff.changed.length))
  line("stops unchanged", n(diff.unchanged))
  line("booth links to add", n(diff.linksAdded.length))
  line("booth links to remove", n(diff.linksRemoved.length))
  const sample = (label, items, show) => items.slice(0, 5).forEach(item => console.log(`    ${label}: ${show(item)}`))
  sample("add", diff.added, s => `${JSON.stringify(s.stop_name)} (${s.lat}, ${s.lng}) trips ${s.trips}`)
  sample("remove", diff.removed, s => `${JSON.stringify(s.stop_name)} (${s.lat}, ${s.lng}) id ${s.id}`)
  sample("update", diff.changed, c => `${JSON.stringify(c.stop_name)} ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`)
}

async function apply(desired, current, diff, key) {
  const prune = flag("prune")
  if (diff.removed.length && !prune) {
    throw new Error(`${diff.removed.length} stops in bmtc_stops are no longer in the source; re-run with --prune to delete them`)
  }
  const url = supabaseUrl()
  console.log(`\nApplying to ${url}`)

  const ids = new Map(current.stops.map(stop => [stop.key, stop.id]))

  const toWrite = [...diff.added, ...diff.changed.map(c => desired.stops.find(s => s.key === c.key))]
  for (const batch of chunks(toWrite, 500)) {
    const body = batch.map(s => ({
      city_id: s.city_id, stop_name: s.stop_name, lat: s.lat, lng: s.lng, trips: s.trips, routes: s.routes,
      assembly_constituency: s.assembly_constituency, ac_number: s.ac_number, boothcode: null,
    }))
    const written = await restWrite("POST", `bmtc_stops?on_conflict=city_id,stop_name,lat,lng&columns=${stopColumns}&select=id,city_id,stop_name,lat,lng`, {
      key, url, body, prefer: "resolution=merge-duplicates,return=representation",
    })
    for (const row of written) ids.set(physicalKey(row), row.id)
  }
  line("stops upserted", n(toWrite.length))

  const links = diff.linksAdded.map(link => {
    const stopId = ids.get(link.key)
    if (stopId === undefined) throw new Error(`no stop id for booth link ${link.key} ${link.boothcode}`)
    return { stop_id: stopId, boothcode: link.boothcode, ac_number: link.ac_number, assembly_constituency: link.assembly_constituency }
  })
  for (const batch of chunks(links, 1000)) {
    await restWrite("POST", "bmtc_stop_booths?on_conflict=stop_id,boothcode", { key, url, body: batch, prefer: "resolution=merge-duplicates,return=minimal" })
  }
  line("booth links upserted", n(links.length))

  const stale = new Map()
  for (const link of diff.linksRemoved) {
    const stopId = link.stop_id ?? ids.get(link.key)
    if (!stale.has(stopId)) stale.set(stopId, [])
    stale.get(stopId).push(link.boothcode)
  }
  for (const [stopId, codes] of stale) {
    for (const batch of chunks(codes, 200)) {
      await restWrite("DELETE", `bmtc_stop_booths?stop_id=eq.${stopId}&boothcode=in.(${batch.join(",")})`, { key, url, prefer: "return=minimal" })
    }
  }
  line("booth links deleted", n(diff.linksRemoved.length))

  if (prune) {
    for (const batch of chunks(diff.removed.map(s => s.id), 200)) {
      await restWrite("DELETE", `bmtc_stops?id=in.(${batch.join(",")})`, { key, url, prefer: "return=minimal" })
    }
    line("stops deleted", n(diff.removed.length))
  }

  await restWrite("POST", "rpc/refresh_ward_infra_stats", { key, url, body: {} })
  line("ward_infra_stats", "refreshed")

  const after = await loadCurrent(key)
  const recheck = diffStops(desired, after.current)
  const clean = [recheck.added, recheck.removed, recheck.changed, recheck.linksAdded, recheck.linksRemoved].every(list => list.length === 0)
  line("re-read matches the source", clean ? "yes" : "NO — run the dry run to see what differs")
  if (!clean) process.exitCode = 1
}

async function main() {
  const applying = flag("apply")
  console.log(`\ningest-bmtc-stops — ${applying ? "APPLY (writes)" : "DRY RUN (no writes)"}`)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (applying && !serviceKey) throw new Error("--apply needs SUPABASE_SERVICE_ROLE_KEY")

  const source = await loadSource()
  const desired = collapseStops([...source.acRows, ...source.allStopsRows])
  const currentState = await loadCurrent(applying ? serviceKey : anonKey())
  const diff = diffStops(desired, currentState.current)
  report(desired, source, currentState, diff)

  if (desired.conflicts.length) {
    process.exitCode = 1
    console.log("\nStops disagree with themselves in the source; nothing can be written until that is resolved.")
    return
  }
  if (!applying) return
  if (!currentState.collapsedInDb) {
    throw new Error("bmtc_stops is not collapsed yet; apply supabase/migrations/20260917_bmtc_stops_dedup.sql first")
  }
  await apply(desired, currentState.current, diff, serviceKey)
}

run(main, import.meta.url)
