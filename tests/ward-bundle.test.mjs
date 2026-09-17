/**
 * The ward bundle (lib/ward-record.ts, served by app/api/ward) computes the
 * same figures the ward card's hook computed before the move.
 *
 * tests/fixtures/ward-bundle/expected-<corporation>-<ward>.json are the props
 * the old hooks/useWardData.ts handed each tab, captured on 2026-09-17 from
 * master (0f4b2b7) running against production. responses.json holds the
 * database responses the new builder read for the same wards, recorded by
 * scripts/ward-bundle/record-fixtures.mjs. Replaying them here keeps the test
 * offline and exact.
 *
 * Run: node --test --experimental-strip-types tests/ward-bundle.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { FIXTURE_WARDS, fixtureInputs, requestKey } from "../scripts/ward-bundle/record-fixtures.mjs"
import { buildGbaWardIdentity } from "../scripts/wardmap/build-gba-ward-identity.mjs"

const root = new URL("../", import.meta.url)
const readJson = path => JSON.parse(readFileSync(new URL(path, root), "utf8"))
const readText = path => readFileSync(new URL(path, root), "utf8")
const responses = readJson("tests/fixtures/ward-bundle/responses.json")

function replay(overrides = () => null) {
  const calls = []
  return {
    calls,
    fetch: async (url, init = {}) => {
      const key = requestKey(url, init)
      calls.push(key)
      const override = overrides(key, calls)
      if (override) return override
      const hit = responses[key]
      assert.ok(hit, `no recorded response for ${key}`)
      return new Response(hit.body, { status: hit.status, headers: hit.contentRange ? { "content-range": hit.contentRange } : {} })
    },
  }
}

async function withFetch(fetchImpl, run) {
  const saved = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    return await run()
  } finally {
    globalThis.fetch = saved
  }
}

const { buildWardLive, buildWardRecord, wardRoutePath, SECTION_CONCURRENCY } = await import("../apps/web/lib/ward-record.ts")
const { communityFactTrust } = await import("../apps/web/lib/api.ts")
const { preferredElectedReps } = await import("../apps/web/lib/current-ward.ts")
const { sources, ward } = await fixtureInputs()

const ids = (rows, key) => (rows ?? []).map(row => typeof key === "function" ? key(row) : row[key])

/** The same view of the card the capture took from the old hook's props. */
function cardView(record, live) {
  const profile = record.profile ? { ...record.profile, community_facts: live.communityFacts } : null
  return JSON.parse(JSON.stringify({
    who: {
      electedReps: ids(preferredElectedReps(profile?.elected_reps, record.mlaReps), "id"),
      committeeMeetings: record.committeeMeetings, reportCard: record.reportCard, ladFunds: record.ladFunds,
      corpContacts: ids(record.corpContacts, "id"), corpName: record.corpName,
      officers: ids(profile?.officers, "id"), governance_alert: profile?.governance_alert ?? null,
      facts: ids(profile?.community_facts, "id"), infraStats: record.infraStats, potholes: record.potholes,
    },
    spend: {
      budget: record.budget && { total: record.budget.total_expenditure_lakh, departments: record.budget.departments?.length ?? null },
      workOrders: ids(record.workOrders, row => row.work_order_id || row.id), tradeLicenses: record.tradeLicenses,
      wardSpend: record.wardSpend, wardSpendSettled: true, propertyTax: record.propertyTax,
      wardContractors: ids(record.wardContractors, "entity_id"),
    },
    citizen: {
      wardStats: record.wardStats, potholes: record.potholes, infraStats: record.infraStats, wardBusStats: record.wardBusStats,
      roadCrashes: record.roadCrashes, airQuality: record.airQuality, amenities: record.amenities, waterQuality: record.waterQuality,
    },
    reach: { departments: ids(record.departments, "short"), grievances: record.grievances, sakala: record.sakala },
  }))
}

/**
 * Where the old card itself lost a read while being captured. In both Varthur
 * captures its ward_profile call (3.8 s alone for ward 112, because it built
 * every city tender) hit the database's statement timeout inside the card's
 * burst of ~17 parallel reads, and the old hook showed the MLA without the MP
 * and no governance note: the failure this change removes. These keys are
 * checked for the complete values instead of the captured gap.
 */
const OLD_CARD_LOST = { "3-40": ["who.electedReps", "who.governance_alert"] }

test("the server's identity table is exactly the boundary layer's ward properties", () => {
  const layer = readJson("apps/web/public/bengaluru-gba-369.geojson")
  assert.deepEqual(readJson("apps/web/lib/gba-ward-identity.json"), buildGbaWardIdentity(layer))
})

for (const [corporation, number] of FIXTURE_WARDS) {
  const name = `${corporation}-${number}`
  const expected = readJson(`tests/fixtures/ward-bundle/expected-${name}.json`)

  test(`ward ${name}: the server builds the same ward identity the map did`, () => {
    const { result } = ward(corporation, number)
    for (const field of ["city_id", "ward_no", "ward_name", "assembly_constituency", "gba_ward_no", "gba_ward_name", "gba_corporation", "gba_corporation_id", "gba_ac", "historical_wards", "historical_crosswalk_tier", "historical_crosswalk_version"]) {
      assert.deepEqual(result[field] ?? null, expected.result[field] ?? null, field)
    }
    assert.equal(wardRoutePath(result), `/api/ward/${corporation}/${number}`)
  })

  test(`ward ${name}: every figure matches what the old ward card showed`, async () => {
    const { result, centre } = ward(corporation, number)
    const { record, live } = await withFetch(replay().fetch, async () => ({
      record: await buildWardRecord(result, sources, centre),
      live: await buildWardLive(result),
    }))
    assert.deepEqual(record.failed, [])
    assert.deepEqual(live.failed, [])
    const actual = cardView(record, live)
    const lost = OLD_CARD_LOST[name] ?? []
    for (const tab of ["who", "spend", "citizen", "reach"]) {
      for (const key of Object.keys(expected[tab])) {
        if (lost.includes(`${tab}.${key}`)) continue
        assert.deepEqual(actual[tab][key], expected[tab][key], `${tab}.${key}`)
      }
    }
    if (lost.length) {
      assert.ok(actual.who.electedReps.length > expected.who.electedReps.length, "the MP the old card lost is back")
      assert.ok(actual.who.governance_alert?.title, "the governance note the old card lost is back")
    }
  })
}

test("a ward with no former-ward overlap still gets its constituency-level record and nothing ward-tagged", async () => {
  const { result, centre } = ward(3, 28)
  assert.deepEqual(result.historical_wards, [])
  const record = await withFetch(replay().fetch, () => buildWardRecord(result, sources, centre))
  assert.equal(record.profile, null)
  assert.deepEqual([record.workOrders, record.wardContractors, record.waterQuality], [[], [], []])
  assert.equal(record.wardSpend, null)
  assert.ok(record.wardStats, "constituency statistics do not need a former ward")
})

test("a read that fails twice marks only its section; a single failure is retried", async () => {
  const { result, centre } = ward(4, 31)
  const budgetFails = replay(key => key.includes("/rpc/budget_summary") ? new Response("{}", { status: 500 }) : null)
  const record = await withFetch(budgetFails.fetch, () => buildWardRecord(result, sources, centre))
  assert.deepEqual(record.failed, ["budget"])
  assert.equal(record.budget, null)
  assert.ok(record.wardSpend, "other sections are unaffected")
  assert.equal(budgetFails.calls.filter(key => key.includes("/rpc/budget_summary")).length, 2, "tried twice")

  let first = true
  const flaky = replay(key => {
    if (key.includes("/rpc/budget_summary") && first) { first = false; return new Response("{}", { status: 500 }) }
    return null
  })
  const retried = await withFetch(flaky.fetch, () => buildWardRecord(result, sources, centre))
  assert.deepEqual(retried.failed, [])
  assert.ok(retried.budget)
})

test("a missing crosswalk fails spend, potholes and committees instead of reading as no data", async () => {
  const { result, centre } = ward(4, 31)
  const record = await withFetch(replay().fetch, () => buildWardRecord(result, { ...sources, bbmp198Index: async () => null }, centre))
  assert.deepEqual(record.failed, ["committee", "wardSpend", "potholes"])
})

test("the record reads a few sections at a time, not all at once", async () => {
  const { result, centre } = ward(1, 15)
  let inFlight = 0
  let peak = 0
  const base = replay().fetch
  const slow = async (url, init) => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise(resolve => setTimeout(resolve, 5))
    try {
      return await base(url, init)
    } finally {
      inFlight--
    }
  }
  await withFetch(slow, () => buildWardRecord(result, sources, centre))
  assert.equal(SECTION_CONCURRENCY, 6)
  // A section reads each of its former wards in parallel: Indiranagar has 4.
  assert.ok(peak <= SECTION_CONCURRENCY * result.historical_wards.length, `peak ${peak}`)
  assert.ok(peak < Object.keys(responses).length / 4, `peak ${peak} is well below firing everything together`)
})

test("a legacy ward number has no cached route and builds in the browser", () => {
  assert.equal(wardRoutePath({ found: true, city_id: "bengaluru", ward_no: 150, gba_corporation_id: null, gba_ward_no: null }), null)
  assert.equal(wardRoutePath({ found: false }), null)
  assert.equal(wardRoutePath(null), null)
})

test("community fact trust follows ward_profile's SQL, branch for branch", () => {
  const fact = (source_type, corroboration_count, dispute_count) => ({ source_type, corroboration_count, dispute_count })
  assert.equal(communityFactTrust(fact("official", 0, 9)), "official")
  assert.equal(communityFactTrust(fact("rti", 0, 9)), "rti")
  assert.equal(communityFactTrust(fact("community", 2, 3)), "disputed")
  assert.equal(communityFactTrust(fact("community", 3, 3)), "unverified", "a tie is not disputed")
  assert.equal(communityFactTrust(fact("community", 1, 2)), "unverified", "fewer than 3 disputes is not disputed")
  assert.equal(communityFactTrust(fact("community", 5, 0)), "community_verified")
  assert.equal(communityFactTrust(fact("community", 4, 0)), "unverified")
  const sql = readText("supabase/migrations/20260919_ward_profile_without_tenders.sql")
  assert.match(sql, /WHEN source_type = 'official' THEN 'official'\s+WHEN source_type = 'rti' THEN 'rti'\s+WHEN dispute_count > corroboration_count AND dispute_count >= 3 THEN 'disputed'\s+WHEN corroboration_count >= 5 THEN 'community_verified'\s+ELSE 'unverified'/)
})

test("only the ward routes cache, a day for the record and a minute for live parts, never a failure", () => {
  const recordRoute = readText("apps/web/app/api/ward/[corporation]/[ward]/route.ts")
  const liveRoute = readText("apps/web/app/api/ward/[corporation]/[ward]/live/route.ts")
  assert.match(recordRoute, /record\.failed\.length\s*\?\s*"no-store"\s*:\s*"public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"/)
  assert.match(liveRoute, /live\.failed\.length\s*\?\s*"no-store"\s*:\s*"public, max-age=0, s-maxage=60, stale-while-revalidate=300"/)
  for (const route of [recordRoute, liveRoute]) {
    assert.match(route, /if \(!gbaWard\) \{\s*return Response\.json\(\{ error: "No such GBA ward" \}, \{ status: 404/)
  }
  // lib/supabase.ts keeps caching opt-in: nothing there sets a CDN cache.
  assert.doesNotMatch(readText("apps/web/lib/supabase.ts"), /s-maxage/)
})

test("functions run next to the database, except the OpenAI-heavy signals cron", () => {
  const vercel = readJson("apps/web/vercel.json")
  assert.deepEqual(vercel.regions, ["bom1"])
  assert.match(readText("apps/web/app/api/ingest-signals/route.ts"), /export const preferredRegion = "iad1"/)
})

test("the browser asks the ward routes for a current ward and never builds its record itself", () => {
  const hook = readText("apps/web/hooks/useWardData.ts")
  assert.match(hook, /routePath \? fetchWardRoute<WardRecord>\(routePath\) : buildWardRecord\(result, BROWSER_SOURCES\)/)
  assert.match(hook, /routePath \? fetchWardRoute<WardLive>\(`\$\{routePath\}\/live`\) : buildWardLive\(result\)/)
  assert.doesNotMatch(hook, /from "@\/lib\/api"[^\n]*fetchWardSpendByBbmp198/)
})
