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
