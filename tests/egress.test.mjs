/**
 * Kaun's India egress relay: the scheduled jobs that Indian government sites
 * refuse from GitHub's runners (MoSPI PAIMANA, BBMP IFMS, Sakala) send those
 * requests through kaun.city in Mumbai instead.
 *
 * Run: node --test --experimental-strip-types tests/egress.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  EGRESS_ERROR_HEADER, EGRESS_HOSTS, EGRESS_SECRET_HEADER, FORWARD_REQUEST_HEADERS, FORWARD_RESPONSE_HEADERS,
  GODADDY_G2_INTERMEDIATE, egressTarget,
} from "../apps/web/lib/egress.mjs"
import { egressFetch } from "../scripts/lib/egress.mjs"
import { monthsToLoad } from "../scripts/india/mospi-missing-months.mjs"
import { MAX_FAILED_WARD_SHARE, dollarQuote, swapSql } from "../scripts/adapters/ifms.mjs"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

// ── What the relay will fetch ──────────────────────────────

test("the relay fetches only the government hosts that refuse GitHub's runners", () => {
  assert.deepEqual(Object.keys(EGRESS_HOSTS).sort(), ["accounts.bbmp.gov.in", "paimana-proj.mospi.gov.in", "sakala.kar.nic.in"])
  assert.equal(egressTarget("https://paimana-proj.mospi.gov.in/ReportPage/ViewPdf?id=1322").url.hostname, "paimana-proj.mospi.gov.in")
  assert.equal(egressTarget("http://sakala.kar.nic.in/gsc_rpt/gsc_rpt_menu.aspx").url.protocol, "http:", "Sakala redirects to http")
  assert.match(egressTarget("http://accounts.bbmp.gov.in/PublicView/").error, /http: is not allowed/)
  assert.match(egressTarget("https://example.com/").error, /not relayed/)
  assert.match(egressTarget("https://paimana-proj.mospi.gov.in.evil.com/").error, /not relayed/)
  assert.match(egressTarget("https://user:pw@accounts.bbmp.gov.in/").error, /credentials/)
  assert.match(egressTarget("https://accounts.bbmp.gov.in:8443/").error, /ports/)
  assert.match(egressTarget("not a url").error, /not a URL/)
})

test("only safe headers cross the relay, and BBMP's missing intermediate is the shipped one", () => {
  for (const name of ["authorization", "x-kaun-egress-secret", "host", "x-forwarded-for", "accept-encoding"]) {
    assert.ok(!FORWARD_REQUEST_HEADERS.includes(name), `${name} must not be forwarded upstream`)
  }
  assert.ok(FORWARD_REQUEST_HEADERS.includes("cookie"), "IFMS and Sakala sessions need cookies")
  assert.ok(FORWARD_RESPONSE_HEADERS.includes("set-cookie"))
  assert.ok(!FORWARD_RESPONSE_HEADERS.includes("content-encoding"), "the relay asks upstream for identity")
  assert.equal(GODADDY_G2_INTERMEDIATE.trim(), read("scripts/adapters/ca/godaddy-g2.pem").trim())
})

test("the relay route authenticates, runs in Mumbai, streams, and never follows redirects", () => {
  const route = read("apps/web/app/api/egress/route.ts")
  assert.match(route, /export const preferredRegion = "bom1"/)
  assert.match(route, /const secret = process\.env\.CRON_SECRET\?\.trim\(\)\s*\n\s*if \(!secret\) return failure\(503/)
  assert.match(route, /timingSafeEqual\(actual, expected\)/)
  assert.match(route, /if \(!target\.url\) return failure\(403, target\.error\)/)
  assert.match(route, /ca: CA/)
  assert.match(route, /Readable\.toWeb\(upstream\)/)
  assert.doesNotMatch(route, /redirect: "follow"|maxRedirects/)
  assert.match(route, /headers\["accept-encoding"\] = "identity"/)
})

// ── How a job uses it ───────────────────────────────────────

async function withEnv(env, fetchImpl, run) {
  const saved = { fetch: globalThis.fetch, url: process.env.KAUN_EGRESS_URL, secret: process.env.KAUN_EGRESS_SECRET }
  globalThis.fetch = fetchImpl
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await run()
  } finally {
    globalThis.fetch = saved.fetch
    for (const [key, value] of [["KAUN_EGRESS_URL", saved.url], ["KAUN_EGRESS_SECRET", saved.secret]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const RELAY = { KAUN_EGRESS_URL: "https://kaun.city/api/egress", KAUN_EGRESS_SECRET: "s3cret" }

test("relayed hosts go through kaun.city with the secret; everything else is a plain fetch", async () => {
  const calls = []
  await withEnv(RELAY, async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return new Response("ok")
  }, async () => {
    await egressFetch("https://paimana-proj.mospi.gov.in/", { headers: { "User-Agent": "KaunBot" } })
    await egressFetch("https://kppp.karnataka.gov.in/api", { method: "POST", body: "{}" })
  })
  assert.equal(calls[0].url, "https://kaun.city/api/egress?url=https%3A%2F%2Fpaimana-proj.mospi.gov.in%2F")
  assert.equal(new Headers(calls[0].init.headers).get(EGRESS_SECRET_HEADER), "s3cret")
  assert.equal(new Headers(calls[0].init.headers).get("user-agent"), "KaunBot")
  assert.equal(calls[1].url, "https://kppp.karnataka.gov.in/api", "KPPP works from GitHub; it isn't relayed")
})

test("without the relay configured, even relayed hosts are fetched directly", async () => {
  const calls = []
  await withEnv({ KAUN_EGRESS_URL: undefined, KAUN_EGRESS_SECRET: undefined }, async url => {
    calls.push(String(url))
    return new Response("ok")
  }, () => egressFetch("https://accounts.bbmp.gov.in/PublicView/?l=1"))
  assert.deepEqual(calls, ["https://accounts.bbmp.gov.in/PublicView/?l=1"])
  await withEnv({ KAUN_EGRESS_URL: RELAY.KAUN_EGRESS_URL, KAUN_EGRESS_SECRET: undefined }, async () => new Response("ok"), async () => {
    await assert.rejects(egressFetch("https://accounts.bbmp.gov.in/"), /KAUN_EGRESS_SECRET is not/)
  })
})

test("redirects are followed like fetch would, unless the job asks for them", async () => {
  const seen = []
  const upstream = async (url, init) => {
    const target = decodeURIComponent(String(url).split("?url=")[1])
    seen.push(`${init.method} ${target}`)
    if (target.endsWith("/MISReport_Eng.aspx")) {
      return new Response("", { status: 302, headers: { location: "http://sakala.kar.nic.in/gsc_rpt/gsc_rpt_menu.aspx", "set-cookie": "ASP.NET_SessionId=abc; path=/" } })
    }
    return new Response("menu", { status: 200 })
  }
  const followed = await withEnv(RELAY, upstream, () => egressFetch("https://sakala.kar.nic.in/MISReport_Eng.aspx", { method: "POST", body: "x=1" }))
  assert.equal(await followed.text(), "menu")
  assert.deepEqual(seen, ["POST https://sakala.kar.nic.in/MISReport_Eng.aspx", "GET http://sakala.kar.nic.in/gsc_rpt/gsc_rpt_menu.aspx"], "302 after POST becomes GET")

  seen.length = 0
  const manual = await withEnv(RELAY, upstream, () => egressFetch("https://sakala.kar.nic.in/MISReport_Eng.aspx", { redirect: "manual" }))
  assert.equal(manual.status, 302)
  assert.match(manual.headers.get("set-cookie"), /ASP\.NET_SessionId=abc/, "Sakala's scraper carries its own cookie jar across hops")
  assert.equal(seen.length, 1)
})

test("a relay failure reads as a failed fetch, so the job's retries and exit codes still apply", async () => {
  const relayDown = async () => Response.json({ error: "paimana-proj.mospi.gov.in: ECONNRESET" }, { status: 502, headers: { [EGRESS_ERROR_HEADER]: "1" } })
  await withEnv(RELAY, relayDown, async () => {
    await assert.rejects(egressFetch("https://paimana-proj.mospi.gov.in/"), error => error instanceof TypeError && /egress relay 502: paimana-proj\.mospi\.gov\.in: ECONNRESET/.test(error.message))
  })
  const upstream500 = async () => new Response("IFMS error", { status: 500 })
  const res = await withEnv(RELAY, upstream500, () => egressFetch("https://accounts.bbmp.gov.in/PublicView/vss00CvStatusData.php"))
  assert.equal(res.status, 500, "the site's own errors come back as responses")
})

test("the three jobs send their requests through the relay", () => {
  for (const script of ["scripts/adapters/ifms.mjs", "scripts/refresh-sakala.mjs", "scripts/india/lib/http.mjs"]) {
    const source = read(script)
    assert.match(source, /egressFetch\(/, script)
    assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /[^s]fetch\((HOME_URL|`\$\{DATA_URL\}|hopUrl|pageUrl|url,)/, `${script} still fetches a relayed host directly`)
  }
  for (const workflow of ["refresh-ifms", "refresh-india-mospi", "refresh-sakala"]) {
    const yml = read(`.github/workflows/${workflow}.yml`)
    assert.match(yml, /KAUN_EGRESS_URL: https:\/\/kaun\.city\/api\/egress/, workflow)
    assert.match(yml, /KAUN_EGRESS_SECRET: \$\{\{ secrets\.CRON_SECRET \}\}/, workflow)
  }
  assert.match(read(".github/workflows/refresh-sakala.yml"), /schedule:\s*\n\s*#[^\n]*\n\s*- cron: '30 6 4 \* \*'/, "Sakala runs monthly again")
})

// ── MoSPI: catch up on every unloaded month ─────────────────

test("the monthly MoSPI job loads every month after the newest one, oldest first", () => {
  assert.deepEqual(monthsToLoad("2026-05-01", new Date("2026-09-17T00:00:00Z")), ["2026-06", "2026-07", "2026-08", "2026-09"])
  assert.deepEqual(monthsToLoad("2025-11", new Date("2026-01-10T00:00:00Z")), ["2025-12", "2026-01"])
  assert.deepEqual(monthsToLoad("2026-09-01", new Date("2026-09-30T00:00:00Z")), [])
  assert.throws(() => monthsToLoad("latest"), /not a report month/)

  const workflow = read(".github/workflows/refresh-india-mospi.yml")
  assert.match(workflow, /MONTHS=\$\(node scripts\/india\/mospi-missing-months\.mjs\)/)
  assert.match(workflow, /if \[ "\$status" -eq 78 \]; then echo "No report for \$m yet; stopping\."; break; fi/)
  assert.match(workflow, /if \[ "\$status" -ne 0 \]; then exit "\$status"; fi/)

  const loader = read("scripts/india/load-central-projects.mjs")
  assert.match(loader, /export const NO_REPORT_EXIT = 78/)
  assert.match(loader, /sink\.finish\(\{ gate: "no report found" \}\)\s*\n\s*process\.exit\(NO_REPORT_EXIT\)/)
  // PAIMANA's financial-year list lags the archive; the archive is asked anyway.
  assert.doesNotMatch(loader, /if \(!Array\.isArray\(fyears\) \|\| !fyears\.includes\(fyear\)\) \{\s*sink\.warn/)
  assert.match(loader, /const listed = Array\.isArray\(fyears\) && fyears\.includes\(fyear\)/)
})

// ── IFMS: replace in one transaction, never from a partial scrape ──

test("IFMS rows are swapped in by one transaction from a staging table", () => {
  const sql = swapSql(["work_order_id", "fy", "data_source", 'odd"name'])
  assert.match(sql, /^BEGIN;\n/)
  assert.match(sql, /\nCOMMIT;$/)
  assert.match(sql, /DELETE FROM public\.bbmp_work_orders WHERE data_source = 'ifms_direct';\nINSERT INTO public\.bbmp_work_orders \("work_order_id", "fy", "data_source", "odd""name"\)/)
  assert.match(sql, /FROM public\.bbmp_work_orders_ifms_staging s, jsonb_populate_record\(NULL::public\.bbmp_work_orders, s\.row\) r;/)
  assert.equal(dollarQuote('[{"a":1}]'), '$ifms$[{"a":1}]$ifms$')
  assert.equal(dollarQuote("x $ifms$ y"), "$ifmsx$x $ifms$ y$ifmsx$")

  const adapter = read("scripts/adapters/ifms.mjs")
  assert.equal(MAX_FAILED_WARD_SHARE, 0.1)
  assert.match(adapter, /if \(failed > list\.length \* MAX_FAILED_WARD_SHARE\) \{\s*throw new Error/)
  assert.doesNotMatch(adapter, /insertRows\("bbmp_work_orders"/, "no batched inserts straight into the live table")
  assert.match(adapter, /if \(staged !== rows\.length\) throw new Error/)
})
