export const runtime = "nodejs"

export async function GET(req: Request) {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  const ip         = req.headers.get("x-real-ip")
  const forwarded  = req.headers.get("x-forwarded-for")
  const cfIP       = req.headers.get("cf-connecting-ip")

  // Ping Redis
  let ping = "no_url"
  if (url && token) {
    try {
      const r = await fetch(`${url}/ping`, { headers: { Authorization: `Bearer ${token}` } })
      ping = await r.text()
    } catch (e) { ping = `error: ${e}` }
  }

  // Try a real rate limit check
  let rl_result = "skipped"
  if (url && token) {
    try {
      const { Ratelimit } = await import("@upstash/ratelimit")
      const { Redis } = await import("@upstash/redis")
      const redis = new Redis({ url: url!, token: token! })
      const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "10 s"), analytics: false, prefix: "kaun:debug" })
      const testKey = ip ?? forwarded?.split(",")[0]?.trim() ?? "unknown"
      const result = await limiter.limit(testKey)
      rl_result = `success=${result.success} remaining=${result.remaining} key=${testKey}`
    } catch (e) { rl_result = `error: ${e}` }
  }

  return Response.json({ ping, ip, forwarded, cfIP, rl_result })
}
