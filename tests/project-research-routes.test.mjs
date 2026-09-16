/**
 * Route-level tests for the project research desk, the admin moderation route
 * and submit-report. The real route modules run; only their network edges are
 * replaced (Supabase, OpenAI, Upstash, next/cache) through synchronous module
 * hooks, which also resolve the app's "@/" alias.
 */
import assert from "node:assert/strict"
import { existsSync, statSync } from "node:fs"
import { registerHooks } from "node:module"
import test, { beforeEach } from "node:test"

const mocks = {
  supabase: () => ({ data: [], error: null }),
  supabaseCalls: [],
  limiters: [],
  limitCalls: [],
  limit: () => ({ success: true, reset: Date.now() + 60_000 }),
  openaiCalls: [],
  openaiResponse: null,
  revalidated: [],
}
globalThis.__kaunMocks = mocks

const MOCK_SOURCES = {
  "@supabase/supabase-js": `
    export function createClient() {
      const mocks = globalThis.__kaunMocks
      const from = table => {
        const op = { table, action: "select", filters: [], payload: undefined, terminal: null }
        const builder = {
          select(columns) { if (op.action === "select") op.columns = columns; else op.returning = columns; return builder },
          insert(payload) { op.action = "insert"; op.payload = payload; return builder },
          update(payload) { op.action = "update"; op.payload = payload; return builder },
          upsert(payload, options) { op.action = "upsert"; op.payload = payload; op.options = options; return builder },
          eq(column, value) { op.filters.push(["eq", column, value]); return builder },
          in(column, value) { op.filters.push(["in", column, value]); return builder },
          gt(column, value) { op.filters.push(["gt", column, value]); return builder },
          order() { return builder },
          limit(count) { op.limit = count; return builder },
          single() { op.terminal = "single"; return builder },
          maybeSingle() { op.terminal = "maybeSingle"; return builder },
          then(resolve, reject) {
            mocks.supabaseCalls.push(op)
            return Promise.resolve().then(() => mocks.supabase(op)).then(resolve, reject)
          },
        }
        return builder
      }
      return { from, storage: { from: () => ({ upload: async () => ({ data: null, error: { message: "no storage" } }) }) } }
    }`,
  "@upstash/ratelimit": `
    export class Ratelimit {
      constructor(options) { this.options = options }
      static slidingWindow(tokens, window) { return { kind: "sliding", tokens, window } }
      static fixedWindow(tokens, window) { return { kind: "fixed", tokens, window } }
      async limit(identifier) {
        const mocks = globalThis.__kaunMocks
        mocks.limiters.push(this.options.prefix)
        mocks.limitCalls.push({ prefix: this.options.prefix, identifier, limiter: this.options.limiter })
        return mocks.limit(this.options.prefix, identifier)
      }
    }`,
  "@upstash/redis": "export class Redis { constructor() {} }",
  "openai": `
    export default class OpenAI {
      constructor() {
        this.responses = { create: async request => { globalThis.__kaunMocks.openaiCalls.push(request); return globalThis.__kaunMocks.openaiResponse } }
      }
    }`,
  "next/cache": "export function revalidatePath(path) { globalThis.__kaunMocks.revalidated.push(path) }",
}

const webRoot = new URL("../apps/web/", import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (MOCK_SOURCES[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(MOCK_SOURCES[specifier])}`, shortCircuit: true }
    }
    if (specifier.startsWith("@/")) {
      for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
        const candidate = new URL(`${specifier.slice(2)}${suffix}`, webRoot)
        if (existsSync(candidate) && statSync(candidate).isFile()) return { url: candidate.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const research = await import("../apps/web/app/api/project-research/route.ts")
const submit = await import("../apps/web/app/api/project-research/submit/route.ts")
const admin = await import("../apps/web/app/api/admin/project-research/route.ts")
const report = await import("../apps/web/app/api/submit-report/route.ts")
const { signProjectResearch } = await import("../apps/web/lib/project-research.ts")

const SERVICE_KEY = "service-role-test-key"
const SLUG = "varthur-gunjur-road"
const FRESH_QUESTION = "Has KRDCL published any progress update after August 2026?"
const MISSING_TABLE = {
  code: "PGRST205",
  details: null,
  hint: null,
  message: "Could not find the table 'public.civic_project_research_submissions' in the schema cache",
}

function post(body, headers = {}) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function openaiAnswer(text, url = "https://www.krdcl.in/en/latestprogressreports") {
  return {
    output_text: text,
    output: [{
      type: "message",
      content: [{ type: "output_text", annotations: [{ type: "url_citation", url, title: "KRDCL progress reports" }] }],
    }],
  }
}

async function liveResult(question = FRESH_QUESTION) {
  mocks.openaiResponse = openaiAnswer("KRDCL's progress report page lists no update after August 2026 as of this search.")
  const response = await research.POST(post({ project_slug: SLUG, question }))
  assert.equal(response.status, 200)
  return response.json()
}

beforeEach(() => {
  mocks.supabase = () => ({ data: [], error: null })
  mocks.supabaseCalls = []
  mocks.limiters = []
  mocks.limitCalls = []
  mocks.limit = () => ({ success: true, reset: Date.now() + 60_000 })
  mocks.openaiCalls = []
  mocks.openaiResponse = null
  mocks.revalidated = []
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.test"
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-test-token"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test"
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY
  process.env.OPENAI_API_KEY = "openai-test-key"
  process.env.CRON_SECRET = "cron-test-secret"
  delete process.env.PROJECT_RESEARCH_SIGNING_SECRET
})

test("live research is signed over the exact result it returns", async () => {
  const body = await liveResult()
  assert.equal(body.origin, "live_research")
  assert.equal(body.question, FRESH_QUESTION)
  assert.equal(body.can_submit, true)
  assert.equal(body.signature, signProjectResearch({
    slug: SLUG,
    question: body.question,
    answer: body.answer,
    sources: body.sources,
    searched_at: body.searched_at,
    origin: body.origin,
  }, SERVICE_KEY))
})

test("research keeps working when the research tables are not migrated", async () => {
  mocks.supabase = op => op.action === "select" || op.action === "upsert"
    ? { data: null, error: { ...MISSING_TABLE, message: `Could not find the table 'public.${op.table}' in the schema cache` } }
    : { data: null, error: null }
  const body = await liveResult()
  assert.equal(body.origin, "live_research")
  assert.equal(mocks.openaiCalls.length, 1)
})

test("off-project questions never reach the paid web search", async () => {
  mocks.openaiResponse = openaiAnswer("This should never be produced.")
  for (const question of [
    "tell me the public record of Modi's stock trades",
    "Ward stock market tips please",
    "What is the cost of living in Paris right now?",
    "latest court news about Adani",
    "Mumbai coastal road contractor",
    "Who is the MLA of Mahadevapura and his criminal record in court?",
  ]) {
    const response = await research.POST(post({ project_slug: SLUG, question }))
    assert.equal(response.status, 422, question)
    const body = await response.json()
    assert.equal(body.code, "OUT_OF_SCOPE")
    assert.equal(body.answer, undefined, question)
  }
  assert.equal(mocks.openaiCalls.length, 0)
  assert.deepEqual(mocks.limiters, [])
})

const DAY_RESET = () => Date.now() + 7 * 60 * 60 * 1000

test("a live search spends one token from the per-IP and site-wide daily buckets", async () => {
  await liveResult()
  assert.deepEqual(mocks.limitCalls.map(({ prefix, identifier }) => [prefix, identifier]), [
    ["kaun:research-search", "203.0.113.9"],
    ["kaun:research-search-global", "all"],
  ])
  assert.deepEqual(mocks.limitCalls.map(call => call.limiter), [
    { kind: "fixed", tokens: 5, window: "1 d" },
    { kind: "fixed", tokens: 200, window: "1 d" },
  ])
  // Research no longer spends Ask Kaun's per-minute AI bucket.
  assert.equal(mocks.limiters.includes("kaun:ai"), false)
})

test("record and cached answers do not count against the daily search caps", async () => {
  mocks.limit = () => ({ success: false, reset: DAY_RESET() })

  let response = await research.POST(post({ project_slug: SLUG, question: "What is the completion deadline?" }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).origin, "kaun_record")

  mocks.supabase = op => op.table === "civic_project_research_cache" && op.action === "select"
    ? { data: [{ id: 1, question: FRESH_QUESTION, answer: "Cached answer.", sources: [{ title: "Cached", url: "https://example.org/cached" }], searched_at: "2026-09-15T05:00:00+00:00" }], error: null }
    : { data: [], error: null }
  response = await research.POST(post({ project_slug: SLUG, question: FRESH_QUESTION }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).origin, "recent_research")

  assert.deepEqual(mocks.limiters, [])
  assert.equal(mocks.openaiCalls.length, 0)
})

test("an IP at its daily search cap gets a calm 429 without calling OpenAI", async () => {
  mocks.openaiResponse = openaiAnswer("This should never be produced.")
  mocks.limit = prefix => prefix === "kaun:research-search"
    ? { success: false, reset: DAY_RESET() }
    : { success: true, reset: DAY_RESET() }

  const response = await research.POST(post({ project_slug: SLUG, question: FRESH_QUESTION }))
  assert.equal(response.status, 429)
  const body = await response.json()
  assert.equal(body.code, "RESEARCH_SEARCH_LIMIT")
  assert.match(body.error, /today’s limit of 5 new web searches/)
  assert.match(body.error, /already answered still work/)
  assert.match(body.error, /about 7 hours/)
  assert.ok(Number(response.headers.get("Retry-After")) > 6 * 60 * 60)
  assert.equal(mocks.openaiCalls.length, 0)
  // A capped visitor does not spend the site-wide ceiling.
  assert.deepEqual(mocks.limiters, ["kaun:research-search"])
})

test("the site-wide daily ceiling stops live searches for everyone", async () => {
  mocks.openaiResponse = openaiAnswer("This should never be produced.")
  mocks.limit = prefix => prefix === "kaun:research-search-global"
    ? { success: false, reset: DAY_RESET() }
    : { success: true, reset: DAY_RESET() }

  const response = await research.POST(post({ project_slug: SLUG, question: FRESH_QUESTION }, { "x-real-ip": "198.51.100.4" }))
  assert.equal(response.status, 429)
  assert.match((await response.json()).error, /research desk has reached today’s limit/)
  assert.equal(mocks.openaiCalls.length, 0)
})

test("a limiter timeout refuses the search instead of letting it through", async () => {
  mocks.limit = () => ({ success: true, reset: 0, reason: "timeout" })
  const response = await research.POST(post({ project_slug: SLUG, question: FRESH_QUESTION }))
  assert.equal(response.status, 503)
  assert.equal(mocks.openaiCalls.length, 0)
})

test("without Upstash, development searches uncapped and production refuses, logging once", async t => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  const warn = t.mock.method(console, "warn", () => {})
  const nodeEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = "development"
    const body = await liveResult()
    assert.equal(body.origin, "live_research")
    await liveResult("Has KRDCL published any progress report after August 2026?")
    assert.equal(mocks.openaiCalls.length, 2)
    assert.deepEqual(mocks.limiters, [])

    process.env.NODE_ENV = "production"
    mocks.openaiCalls = []
    const response = await research.POST(post({ project_slug: SLUG, question: FRESH_QUESTION }))
    assert.equal(response.status, 503)
    assert.equal(mocks.openaiCalls.length, 0)
    assert.equal(warn.mock.callCount(), 1)
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  }
})

test("cached answers are reused only for a near-identical question, and labelled as unreviewed cache", async () => {
  const cachedRow = question => ({
    id: 1,
    question,
    answer: "Cached AI answer about the contractor blacklisting question.",
    sources: [{ title: "Cached source", url: "https://example.org/cached" }],
    searched_at: "2026-09-15T05:00:00+00:00",
  })

  mocks.supabase = op => op.table === "civic_project_research_cache" && op.action === "select"
    ? { data: [cachedRow("Has the contractor been blacklisted in any other state?")], error: null }
    : { data: [], error: null }
  mocks.openaiResponse = openaiAnswer("The public record Kaun searched does not name the contractor for this corridor.")
  let response = await research.POST(post({ project_slug: SLUG, question: "Who is the contractor?" }))
  let body = await response.json()
  assert.equal(body.origin, "live_research")
  assert.equal(mocks.openaiCalls.length, 1)

  mocks.supabase = op => op.table === "civic_project_research_cache" && op.action === "select"
    ? { data: [cachedRow("Has KRDCL published a progress update after August 2026")], error: null }
    : { data: [], error: null }
  response = await research.POST(post({ project_slug: SLUG, question: FRESH_QUESTION }))
  body = await response.json()
  assert.equal(body.origin, "recent_research")
  assert.equal(typeof body.signature, "string")
  assert.equal(mocks.openaiCalls.length, 1)
})

test("a signed result enters the review queue with a hashed IP and its own rate-limit bucket", async () => {
  const result = await liveResult()
  mocks.supabaseCalls = []
  mocks.limiters = []
  mocks.supabase = op => op.action === "insert"
    ? { data: { id: 7, status: "pending" }, error: null }
    : { data: [], error: null }

  const response = await submit.POST(post({ project_slug: SLUG, ...result }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, id: 7, status: "pending" })
  assert.deepEqual(mocks.limiters, ["kaun:research-submit"])

  const insert = mocks.supabaseCalls.find(op => op.action === "insert")
  assert.equal(insert.table, "civic_project_research_submissions")
  assert.equal(insert.payload.answer, result.answer)
  assert.deepEqual(insert.payload.sources, result.sources)
  assert.equal(insert.payload.searched_at, result.searched_at)
  assert.match(insert.payload.submitter_ip_hash, /^[0-9a-f]{64}$/)
  assert.equal(JSON.stringify(insert.payload).includes("203.0.113.9"), false)
})

test("fabricated, tampered or unsigned research is rejected before touching storage", async () => {
  const result = await liveResult()
  mocks.supabaseCalls = []
  const attempts = [
    { ...result, answer: `${result.answer} The contractor has been blacklisted in three states.` },
    { ...result, sources: [{ title: "Invented", url: "https://example.com/fake" }] },
    { ...result, searched_at: "2026-01-01T00:00:00.000Z" },
    { ...result, question: "Who is the contractor?" },
    { ...result, origin: "recent_research" },
    { ...result, signature: undefined },
    { ...result, signature: "v1.forged" },
    { ...result, origin: "published_research" },
  ]
  for (const attempt of attempts) {
    const response = await submit.POST(post({ project_slug: SLUG, ...attempt }))
    assert.equal(response.status, 400, JSON.stringify(attempt).slice(0, 120))
  }
  const badJson = await submit.POST(post("{not json"))
  assert.equal(badJson.status, 400)
  assert.equal(mocks.supabaseCalls.length, 0)
})

test("submissions return 503 when no signing secret is configured", async () => {
  const result = await liveResult()
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const response = await submit.POST(post({ project_slug: SLUG, ...result }))
  assert.equal(response.status, 503)
})

test("a dedicated signing secret overrides the service-role key", async () => {
  process.env.PROJECT_RESEARCH_SIGNING_SECRET = "dedicated-secret"
  const result = await liveResult()
  assert.equal(result.signature, signProjectResearch({
    slug: SLUG, question: result.question, answer: result.answer, sources: result.sources,
    searched_at: result.searched_at, origin: result.origin,
  }, "dedicated-secret"))
})

test("submissions say they are not open yet while the table is missing, without leaking DB text", async () => {
  const result = await liveResult()
  mocks.supabase = () => ({ data: null, error: MISSING_TABLE })
  let response = await submit.POST(post({ project_slug: SLUG, ...result }))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: "Research submissions are not open yet." })

  mocks.supabase = op => op.action === "insert"
    ? { data: null, error: { code: "23514", message: "new row violates check constraint \"secret_internal_name\"" } }
    : { data: [], error: null }
  response = await submit.POST(post({ project_slug: SLUG, ...result }))
  assert.equal(response.status, 500)
  assert.equal(JSON.stringify(await response.json()).includes("secret_internal_name"), false)
})

test("admin research route: constant-time auth, JSON errors and missing table", async () => {
  const auth = { authorization: "Bearer cron-test-secret" }
  const get = headers => new Request("http://localhost/api/admin/project-research?status=pending", { headers })

  assert.equal((await admin.GET(get({ authorization: "Bearer wrong" }))).status, 401)
  assert.equal((await admin.GET(get({}))).status, 401)
  delete process.env.CRON_SECRET
  assert.equal((await admin.GET(get(auth))).status, 401)
  process.env.CRON_SECRET = "cron-test-secret"

  mocks.supabase = () => ({ data: [], error: null })
  assert.equal((await admin.GET(get(auth))).status, 200)

  assert.equal((await admin.POST(post("{not json", auth))).status, 400)
  assert.equal((await admin.POST(post({ id: "7", action: "publish" }, auth))).status, 400)

  mocks.supabase = () => ({ data: null, error: MISSING_TABLE })
  let response = await admin.GET(get(auth))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: "Research submissions are not open yet." })
  response = await admin.POST(post({ id: 7, action: "publish" }, auth))
  assert.equal(response.status, 503)

  mocks.supabase = () => ({ data: { id: 7, project_slug: SLUG, status: "published" }, error: null })
  response = await admin.POST(post({ id: 7, action: "publish" }, auth))
  assert.equal(response.status, 200)
  assert.deepEqual(mocks.revalidated, [`/bengaluru/projects/${SLUG}`])
})

const validReport = {
  lat: 12.95,
  lng: 77.74,
  ward_no: 149,
  ward_name: "Varthur",
  boundary_system: "gba-369-2025",
  gba_corporation_id: 3,
  gba_ward_no: 40,
  historical_wards: [{ ward_no: 149, ward_name: "Varthur", current_share: 0.82, legacy_share: 1 }],
  issue_type: "pothole",
}

test("submit-report stores validated current-ward identity", async () => {
  mocks.supabase = op => op.action === "insert" ? { data: { id: 11 }, error: null } : { data: [], error: null }
  const response = await report.POST(post(validReport))
  assert.equal(response.status, 200)
  const insert = mocks.supabaseCalls.find(op => op.action === "insert")
  assert.equal(insert.payload.boundary_system, "gba-369-2025")
  assert.equal(insert.payload.gba_corporation_id, 3)
  assert.equal(insert.payload.gba_ward_no, 40)
  assert.deepEqual(insert.payload.historical_wards, validReport.historical_wards)
  assert.deepEqual(mocks.limiters, ["kaun:report"])

  mocks.supabaseCalls = []
  const withoutIdentity = { lat: 12.95, lng: 77.74, issue_type: "pothole" }
  assert.equal((await report.POST(post(withoutIdentity))).status, 200)
  const bare = mocks.supabaseCalls.find(op => op.action === "insert")
  assert.equal(bare.payload.boundary_system, null)
  assert.deepEqual(bare.payload.historical_wards, [])
})

test("submit-report rejects malformed ward identity", async () => {
  const ward = validReport.historical_wards[0]
  const invalid = [
    { boundary_system: "made-up-2030" },
    { boundary_system: 369 },
    { gba_corporation_id: 0 },
    { gba_corporation_id: "3" },
    { gba_corporation_id: 1000 },
    { gba_ward_no: 1.5 },
    { gba_ward_no: -4 },
    { boundary_system: undefined },
    { historical_wards: "149" },
    { historical_wards: Array.from({ length: 13 }, () => ward) },
    { historical_wards: [{ ...ward, ward_no: "149" }] },
    { historical_wards: [{ ...ward, ward_name: "x".repeat(81) }] },
    { historical_wards: [{ ...ward, ward_name: "" }] },
    { historical_wards: [{ ...ward, current_share: 1.5 }] },
    { historical_wards: [{ ...ward, legacy_share: -0.1 }] },
    { historical_wards: [{ ...ward, legacy_share: "1" }] },
    { historical_wards: [null] },
  ]
  for (const patch of invalid) {
    mocks.supabaseCalls = []
    const response = await report.POST(post({ ...validReport, ...patch }))
    assert.equal(response.status, 400, JSON.stringify(patch).slice(0, 80))
    assert.equal(mocks.supabaseCalls.length, 0)
  }
})

test("submit-report falls back when any ward-identity column is missing, and only then", async () => {
  for (const column of ["boundary_system", "gba_corporation_id", "gba_ward_no", "historical_wards"]) {
    let attempts = 0
    mocks.supabaseCalls = []
    mocks.supabase = op => {
      if (op.action !== "insert") return { data: [], error: null }
      attempts += 1
      return attempts === 1
        ? { data: null, error: { code: "PGRST204", message: `Could not find the '${column}' column of 'ward_reports' in the schema cache` } }
        : { data: { id: 12 }, error: null }
    }
    const response = await report.POST(post(validReport))
    assert.equal(response.status, 200, column)
    const inserts = mocks.supabaseCalls.filter(op => op.action === "insert")
    assert.equal(inserts.length, 2, column)
    assert.equal("gba_ward_no" in inserts[1].payload, false)
    assert.equal("historical_wards" in inserts[1].payload, false)
  }

  mocks.supabaseCalls = []
  mocks.supabase = op => op.action === "insert"
    ? { data: null, error: { code: "23514", message: "new row for relation \"ward_reports\" violates check constraint" } }
    : { data: [], error: null }
  const response = await report.POST(post(validReport))
  assert.equal(response.status, 500)
  assert.equal(mocks.supabaseCalls.filter(op => op.action === "insert").length, 1)
})

test("rate-limited routes answer 503, not 500, on deployments without Upstash", async () => {
  const { enforceRateLimit } = await import("../apps/web/lib/ratelimit.ts")
  const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, env: process.env.NODE_ENV }
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  let made = 0
  const factory = () => { made += 1; throw new Error("limiter must not be built without credentials") }
  try {
    process.env.NODE_ENV = "production"
    const deployed = await enforceRateLimit(factory, new Request("https://example.test"), "Ask Kaun")
    assert.equal(deployed.status, 503)
    assert.match((await deployed.json()).error, /isn't available on this deployment/)
    process.env.NODE_ENV = "development"
    assert.equal(await enforceRateLimit(factory, new Request("https://example.test"), "Ask Kaun"), null)
    assert.equal(made, 0)
  } finally {
    if (saved.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = saved.url
    if (saved.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = saved.token
    process.env.NODE_ENV = saved.env
  }
})
