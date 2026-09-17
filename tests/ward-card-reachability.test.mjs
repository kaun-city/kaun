/**
 * The ward card must load on networks that cannot reach *.supabase.co, and a
 * read that fails must say so instead of loading forever or claiming "no data".
 *
 * Run: node --test --experimental-strip-types tests/ward-card-reachability.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { DB_PROXY_PATH, DEFAULT_SUPABASE_URL, proxiedStorageUrl, publicSupabaseConfig } from "../apps/web/lib/supabase-config.ts"
import { CORPORATION_TENDERS_SHOWN, corporationDepartment, tenderTotal } from "../apps/web/lib/corporation-tenders.ts"

const read = path => readFileSync(new URL(`../apps/web/${path}`, import.meta.url), "utf8")

// ── Same-origin route ───────────────────────────────────────

test("the browser's database route lives under /api, which host routing never rewrites", () => {
  assert.equal(DB_PROXY_PATH, "/api/db")
  const config = read("next.config.ts")
  assert.match(config, /source: `\$\{DB_PROXY_PATH\}\/rest\/v1\/:path\*`, destination: `\$\{SUPABASE_UPSTREAM\}\/rest\/v1\/:path\*`/)
  assert.match(config, /source: `\$\{DB_PROXY_PATH\}\/storage\/v1\/object\/public\/:path\*`/)
  // Live rows are never cached on the way through.
  assert.match(config, /source: `\$\{DB_PROXY_PATH\}\/rest\/v1\/:path\*`,\s*headers: \[\{ key: "Cache-Control", value: "no-store" \}\]/)
})

test("a pasted URL with a trailing newline is cleaned before it becomes a rewrite or a photo URL", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://xgygxfyfsvccqqmtboeu.supabase.co\r\n"
    assert.equal(publicSupabaseConfig().url, "https://xgygxfyfsvccqqmtboeu.supabase.co")
    process.env.NEXT_PUBLIC_SUPABASE_URL = "   "
    assert.equal(publicSupabaseConfig().url, DEFAULT_SUPABASE_URL)
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved
  }
})

test("report photos load through the same route; other image URLs are untouched", () => {
  const base = "https://xgygxfyfsvccqqmtboeu.supabase.co"
  assert.equal(
    proxiedStorageUrl(`${base}/storage/v1/object/public/report-photos/2026/a.jpg`, base),
    "/api/db/storage/v1/object/public/report-photos/2026/a.jpg",
  )
  assert.equal(proxiedStorageUrl(`${base}/storage/v1/object/sign/private/a.jpg`, base), `${base}/storage/v1/object/sign/private/a.jpg`)
  assert.equal(proxiedStorageUrl("https://example.org/a.jpg", base), "https://example.org/a.jpg")
})

test("no browser code builds a supabase.co request of its own", () => {
  for (const path of ["components/HomePage.tsx", "components/MapView.tsx", "components/CityPulse.tsx", "hooks/useWardData.ts", "lib/api.ts"]) {
    const source = read(path)
    assert.doesNotMatch(source, /rest\/v1/, `${path} builds a PostgREST URL`)
    assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_URL|DEFAULT_SUPABASE_URL|publicSupabaseConfig/, `${path} reads the Supabase URL`)
  }
})

// ── Reads fail loudly, with a timeout ───────────────────────

async function withBrowser(fetchImpl, run) {
  const saved = { window: globalThis.window, fetch: globalThis.fetch }
  globalThis.window = { location: { origin: "https://kaun.city" } }
  globalThis.fetch = fetchImpl
  try {
    return await run()
  } finally {
    globalThis.window = saved.window
    globalThis.fetch = saved.fetch
  }
}

const supabase = await import("../apps/web/lib/supabase.ts")

test("in the browser every read goes to kaun.city, with the anon headers and a timeout", async () => {
  const calls = []
  await withBrowser(async (url, init) => {
    calls.push({ url, init })
    return new Response("[]", { status: 200 })
  }, async () => {
    await supabase.queryOrThrow("wards", { ward_no: "eq.1" }, { select: "ward_no", limit: 1 })
    await supabase.rpcOrThrow("ward_profile", { p_ward_no: 1 })
  })
  assert.equal(calls[0].url, "https://kaun.city/api/db/rest/v1/wards?select=ward_no&limit=1&ward_no=eq.1")
  assert.equal(calls[1].url, "https://kaun.city/api/db/rest/v1/rpc/ward_profile")
  assert.equal(calls[1].init.method, "POST")
  assert.equal(calls[1].init.body, JSON.stringify({ p_ward_no: 1 }))
  for (const { init } of calls) {
    assert.ok(init.headers.apikey, "apikey passes through")
    assert.match(init.headers.Authorization, /^Bearer /)
    assert.ok(init.signal instanceof AbortSignal, "browser reads carry a timeout")
  }
  assert.equal(supabase.BROWSER_REQUEST_TIMEOUT_MS, 15_000)
})

test("unreachable, timed out and error responses reject; the lenient helpers still return empty", async () => {
  const cases = [
    [async () => { throw new TypeError("Failed to fetch") }, /unreachable/],
    [async () => { throw new DOMException("signal timed out", "TimeoutError") }, /timed out/],
    [async () => new Response("{}", { status: 503 }), /HTTP 503/],
    [async () => new Response("<html>", { status: 200 }), /unreadable/],
  ]
  for (const [fetchImpl, message] of cases) {
    await withBrowser(fetchImpl, async () => {
      await assert.rejects(supabase.queryOrThrow("wards"), error => error instanceof supabase.DataRequestError && message.test(error.message))
      await assert.rejects(supabase.rpcOrThrow("budget_summary"), supabase.DataRequestError)
      assert.deepEqual(await supabase.query("wards"), [])
      assert.equal(await supabase.rpc("budget_summary"), null)
    })
  }
})

test("server reads go straight to Supabase, with no timeout added to cached fetches", async () => {
  assert.equal(supabase.restUrl("wards").origin, publicSupabaseConfig().url)
  const calls = []
  const savedFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => { calls.push(init); return new Response("[]") }
  try {
    await supabase.queryOrThrow("in_mps", {}, { revalidate: 3600 })
  } finally {
    globalThis.fetch = savedFetch
  }
  assert.deepEqual(calls[0].next, { revalidate: 3600 })
  assert.equal(calls[0].signal, undefined)
})

// ── Tenders ─────────────────────────────────────────────────

test("the card asks for a corporation's few latest tenders and reads the total from the header", () => {
  assert.equal(CORPORATION_TENDERS_SHOWN, 3)
  assert.equal(corporationDepartment("South"), "Bengaluru South City Corporation")
  assert.equal(corporationDepartment(null), null)
  assert.equal(tenderTotal("0-2/628", 3), 628)
  assert.equal(tenderTotal("*/0", 0), 0)
  assert.equal(tenderTotal("0-2/*", 3), 3)
  assert.equal(tenderTotal(null, 2), 2)

  assert.match(read("lib/ward-record.ts"), /fetchCorporationTenders\(department, CORPORATION_TENDERS_SHOWN, cityId\)/)
  assert.doesNotMatch(read("components/tabs/SpendTab.tsx"), /profile\?\.tenders/)

  const sql = read("../../supabase/migrations/20260919_ward_profile_without_tenders.sql")
  const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"))
  assert.doesNotMatch(fn, /FROM tenders|'tenders'|tender_count|tender_total/)
  for (const key of ["'elected_reps', reps", "'officers', officers_json", "'community_facts', community_json", "'governance_alert', governance_alert_json"]) {
    assert.ok(fn.includes(key), `ward_profile still returns ${key}`)
  }
  assert.match(sql, /CREATE INDEX IF NOT EXISTS tenders_city_department_issued_idx\s+ON public\.tenders \(city_id, department, issued_date DESC NULLS LAST\)/)
})

// ── Failed, loading and empty are different ────────────────

test("every ward-card read that can fail marks its section", () => {
  const record = read("lib/ward-record.ts")
  const sections = [...record.matchAll(/\brun\("(\w+)"/g)].map(match => match[1])
  assert.equal(sections.length, 29, "one guarded read per record and live section")
  assert.equal(new Set(sections).size, sections.length)
  // Offices are read per point in the hook; every other section is built here.
  const declared = [...record.match(/export type LoadSection =([\s\S]*?)\n\n/)[1].matchAll(/"(\w+)"/g)].map(match => match[1])
  assert.deepEqual([...sections, "offices"].sort(), [...declared].sort())
  // A missing crosswalk is a failure, not "no rows".
  assert.equal(record.match(/await bbmp198\(\)/g)?.length, 3)
  assert.match(read("lib/api.ts"), /throw new DataRequestError\("ward crosswalk: unavailable"\)/)
  const hook = read("hooks/useWardData.ts")
  assert.match(hook, /\(\) => \{ if \(active\) setRecord\(\{ identity: wardIdentity, value: null, failed: true \}\) \}/)
  assert.match(hook, /\(\) => \{ if \(active\) setLive\(\{ identity: wardIdentity, value: null, failed: true \}\) \}/)
  assert.match(hook, /setAttempt\(value => value \+ 1\)/)
})

test("placeholders end in data, an empty state, or Couldn't load · Retry", () => {
  const spend = read("components/tabs/SpendTab.tsx")
  assert.match(spend, /\) : loadFailed\("budget"\) \? \([\s\S]*?<LoadFailed what="the BBMP budget"[\s\S]*?\) : loadDone\("budget"\) \? null : \(/)
  assert.match(spend, /\) : loadFailed\("wardSpend"\) \? \([\s\S]*?<LoadFailed what="ward spending"/)
  assert.match(spend, /failed=\{loadFailed\("tenders"\)\}/)

  const citizen = read("components/tabs/CitizenTab.tsx")
  assert.match(citizen, /!wardStats && loadFailed\("wardStats"\) \? \([\s\S]*?<LoadFailed[\s\S]*?\) : !wardStats && !loadDone\("wardStats"\) \? \(\s*<SkeletonStats \/>/)
  assert.match(citizen, /loadFailed\("reportCount"\)/)

  const reach = read("components/tabs/ReachTab.tsx")
  assert.match(reach, /loadFailed\("offices"\)[\s\S]*?loadDone\("offices"\) \? null/)
  assert.match(reach, /loadFailed\("departments"\)[\s\S]*?loadDone\("departments"\) \? null/)

  const who = read("components/tabs/WhoTab.tsx")
  assert.match(who, /loadFailed\("profile"\) \|\| loadFailed\("reps"\) \?/)
  assert.match(who, /loadFailed\("reportCard"\) \?/)

  const card = read("components/WardCard.tsx")
  assert.match(card, /failed=\{HEADLINE_SECTIONS\.some\(ward\.loadFailed\)\}/)
  assert.match(card, /failed=\{SNAPSHOT_SECTIONS\.some\(ward\.loadFailed\)\}/)

  const failed = read("components/shared/LoadFailed.tsx")
  assert.match(failed, /message \?\? <>Couldn&apos;t load/)
  assert.match(failed, />\s*Retry\s*</)
})
