/**
 * Record the database responses behind tests/ward-bundle.test.mjs.
 *
 * Builds the ward record and live parts (apps/web/lib/ward-record.ts) for the
 * fixture wards against production with the public anon key (reads only), and
 * saves every PostgREST response it used. The test replays them, so it runs
 * offline and checks the record against what the old ward-card hook showed.
 *
 * Re-record together with the expected-*.json captures, or the two drift apart.
 *
 * Run: node --experimental-strip-types scripts/ward-bundle/record-fixtures.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const OUT = resolve(ROOT, "tests/fixtures/ward-bundle/responses.json")
export const FIXTURE_WARDS = [[4, 31], [1, 15], [3, 40], [3, 28]]

/** The request a response answers; time windows are relative to "now", so they are blanked. */
export function requestKey(url, init = {}) {
  const u = new URL(String(url))
  for (const [key, value] of [...u.searchParams]) {
    if (/^gte\.\d{4}-\d{2}-\d{2}T/.test(value)) u.searchParams.set(key, "gte.<since>")
  }
  const body = typeof init.body === "string" ? ` ${init.body}` : ""
  return `${init.method ?? "GET"} ${u.pathname}${u.search}${body}`
}

/** Sources and identity for the record, read from the checked-in files like the route bundles them. */
export async function fixtureInputs() {
  const read = path => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"))
  const { indexBbmp198Crosswalk } = await import("../../apps/web/lib/bbmp198-crosswalk.ts")
  const { gbaWardKey, indexGbaCrosswalk } = await import("../../apps/web/lib/gba-crosswalk.ts")
  const { gbaWardResult } = await import("../../apps/web/lib/ward-record.ts")
  const identity = read("apps/web/lib/gba-ward-identity.json")
  const gba = read("apps/web/public/bengaluru-gba-369-to-datameet-243.json")
  const bbmp198 = indexBbmp198Crosswalk(read("apps/web/public/bengaluru-bbmp-198-to-datameet-243.json"))
  const legacyRows = read("apps/web/public/bengaluru-ward-crosswalk.json").rows
  const identities = new Map(identity.wards.map(row => [gbaWardKey(row.corporation_id, row.ward_no), row]))
  const crosswalk = indexGbaCrosswalk(gba)
  return {
    sources: { bbmp198Index: async () => bbmp198, legacySourceRows: async () => legacyRows },
    ward: (corporation, ward) => gbaWardResult(identities.get(gbaWardKey(corporation, ward)), crosswalk.get(gbaWardKey(corporation, ward)), gba.version),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const realFetch = globalThis.fetch
  const responses = {}
  globalThis.fetch = async (url, init = {}) => {
    const res = await realFetch(url, init).catch(error => {
      console.error(`FETCH ERROR ${requestKey(url, init).slice(0, 120)}: ${error.cause?.code ?? error.message}`)
      throw error
    })
    let body = await res.text()
    if (!res.ok) console.error(`HTTP ${res.status} ${requestKey(url, init).slice(0, 120)}: ${body.slice(0, 160)}`)
    // The record no longer reads tenders from ward_profile; before migration
    // 20260919 the function still returns all of them (~6.6 MB). Drop them.
    if (String(url).endsWith("/rpc/ward_profile") && res.ok) {
      const { tenders: _t, tender_count: _c, tender_total_lakh: _l, ...rest } = JSON.parse(body)
      body = JSON.stringify(rest)
    }
    responses[requestKey(url, init)] = { status: res.status, contentRange: res.headers.get("content-range"), body }
    return new Response(body, { status: res.status, headers: res.headers })
  }
  const { buildWardLive, buildWardRecord } = await import("../../apps/web/lib/ward-record.ts")
  const { sources, ward } = await fixtureInputs()
  for (const [corporation, number] of FIXTURE_WARDS) {
    const { result, centre } = ward(corporation, number)
    const [record, live] = await Promise.all([buildWardRecord(result, sources, centre), buildWardLive(result)])
    console.log(`${corporation}/${number} ${result.gba_ward_name}: record failed=[${record.failed}] live failed=[${live.failed}]`)
  }
  const sorted = Object.fromEntries(Object.entries(responses).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`)
  console.log(`${Object.keys(sorted).length} responses -> ${OUT}`)
}
