import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

/** Create a fresh Redis client per invocation — avoids module-level init before env is ready */
function makeRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

/** AI routes: 10 requests per IP per minute */
export function makeAiLimiter() {
  return new Ratelimit({
    redis: makeRedis(),
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    analytics: false,
    prefix: "kaun:ai",
  })
}

/** Report submission: 5 per IP per hour */
export function makeReportLimiter() {
  return new Ratelimit({
    redis: makeRedis(),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: false,
    prefix: "kaun:report",
  })
}

/** Project research proposals: 10 per IP per hour, separate from issue reports */
export function makeResearchSubmissionLimiter() {
  return new Ratelimit({
    redis: makeRedis(),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: false,
    prefix: "kaun:research-submit",
  })
}

// ---------------------------------------------------------------------------
// Live project research runs a paid OpenAI web search (about $10 per 1,000
// searches, plus model tokens; one answer can run several searches). Two daily
// caps bound that spend. Only live searches count: answers from Kaun's record,
// reviewed research and the research cache are free. Windows are fixed UTC
// days, so both caps reset at 05:30 IST.
// ---------------------------------------------------------------------------

/** Live research searches one IP may start per day. Enough for a curious resident, useless for a scraper. */
export const RESEARCH_SEARCHES_PER_IP_PER_DAY = 5

/** Live research searches all visitors together may start per day: a hard ceiling of a few dollars a day. */
export const RESEARCH_SEARCHES_PER_DAY = 200

/** Per-IP daily bucket for live research searches, separate from Ask Kaun's per-minute AI bucket. */
export function makeResearchSearchLimiter() {
  return new Ratelimit({
    redis: makeRedis(),
    limiter: Ratelimit.fixedWindow(RESEARCH_SEARCHES_PER_IP_PER_DAY, "1 d"),
    analytics: false,
    prefix: "kaun:research-search",
  })
}

/** Site-wide daily ceiling for live research searches. Its own prefix, so no client IP header can collide with it. */
export function makeResearchSearchCeiling() {
  return new Ratelimit({
    redis: makeRedis(),
    limiter: Ratelimit.fixedWindow(RESEARCH_SEARCHES_PER_DAY, "1 d"),
    analytics: false,
    prefix: "kaun:research-search-global",
  })
}

let warnedResearchCapsUnavailable = false

function researchLimitResponse(scope: "visitor" | "desk", reset: number): Response {
  const seconds = Math.max(Math.ceil((reset - Date.now()) / 1000), 1)
  const hours = Math.max(Math.ceil(seconds / 3600), 1)
  const reopens = `New searches reopen in about ${hours} ${hours === 1 ? "hour" : "hours"}.`
  const error = scope === "visitor"
    ? `You’ve reached today’s limit of ${RESEARCH_SEARCHES_PER_IP_PER_DAY} new web searches. Questions Kaun has already answered still work. ${reopens}`
    : `The research desk has reached today’s limit for new web searches. Questions Kaun has already answered still work. ${reopens}`
  return Response.json(
    { error, code: "RESEARCH_SEARCH_LIMIT" },
    { status: 429, headers: { "Retry-After": String(seconds), "X-RateLimit-Reset": String(reset) } },
  )
}

/**
 * Spend one live research search from the per-IP and site-wide daily budgets.
 * Call it only immediately before the paid search. Returns null when the
 * search may run, otherwise the response to send instead (429 at a cap).
 *
 * The per-IP bucket is checked first, so one capped visitor cannot drain the
 * site-wide ceiling. A limiter that times out refuses the search with a 503
 * (the library default would let it through). Without Upstash credentials the
 * caps cannot be enforced: development keeps searching uncapped, production
 * refuses live research. Either way it logs once.
 */
export async function reserveResearchSearch(ip: string): Promise<Response | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL?.trim() || !process.env.UPSTASH_REDIS_REST_TOKEN?.trim()) {
    const production = process.env.NODE_ENV === "production"
    if (!warnedResearchCapsUnavailable) {
      warnedResearchCapsUnavailable = true
      console.warn(production
        ? "project-research: Upstash is not configured, so live research is off (its daily search caps cannot be enforced)."
        : "project-research: Upstash is not configured; live research search caps are off in this development environment.")
    }
    return production ? Response.json({ error: "Live research is not available right now." }, { status: 503 }) : null
  }

  const unavailable = () => Response.json({ error: "Live research is temporarily unavailable. Try again shortly." }, { status: 503 })
  const visitor = await makeResearchSearchLimiter().limit(ip)
  if (visitor.reason === "timeout") return unavailable()
  if (!visitor.success) return researchLimitResponse("visitor", visitor.reset)
  const desk = await makeResearchSearchCeiling().limit("all")
  if (desk.reason === "timeout") return unavailable()
  if (!desk.success) return researchLimitResponse("desk", desk.reset)
  return null
}

const warnedLimitersUnavailable = new Set<string>()

/**
 * Apply a per-IP limiter to a paid or public-write route. Returns null when
 * the request may proceed, otherwise the response to send (429 over the limit).
 *
 * Without Upstash credentials (Vercel preview deployments have none) the
 * limit cannot be enforced: development proceeds unmetered, any deployed
 * environment answers 503 with a plain message instead of crashing into a
 * 500 or running AI calls and writes with no limit. Logs once per feature.
 */
export async function enforceRateLimit(
  makeLimiter: () => Ratelimit,
  req: Request,
  feature: string,
): Promise<Response | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL?.trim() || !process.env.UPSTASH_REDIS_REST_TOKEN?.trim()) {
    const deployed = process.env.NODE_ENV === "production"
    if (!warnedLimitersUnavailable.has(feature)) {
      warnedLimitersUnavailable.add(feature)
      console.warn(`${feature}: Upstash is not configured, so rate limits cannot be enforced${deployed ? "; the route is off on this deployment" : " (development: unmetered)"}.`)
    }
    return deployed
      ? Response.json({ error: `${feature} isn't available on this deployment.` }, { status: 503 })
      : null
  }
  const { success, reset } = await makeLimiter().limit(getIP(req))
  return success ? null : rateLimitResponse(reset)
}

/** Extract best available IP from Vercel/Cloudflare headers */
export function getIP(req: Request): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  )
}

/** Returns a 429 Response with Retry-After header */
export function rateLimitResponse(reset: number): Response {
  const retryAfter = Math.ceil((reset - Date.now()) / 1000)
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(retryAfter, 1)),
        "X-RateLimit-Reset": String(reset),
      },
    }
  )
}
