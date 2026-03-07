export const runtime = "nodejs"

export async function GET(req: Request) {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  // Ping Redis directly via HTTP
  let ping = "no_url"
  if (url && token) {
    try {
      const r = await fetch(`${url}/ping`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      ping = await r.text()
    } catch (e) {
      ping = `error: ${e}`
    }
  }
  return Response.json({
    url_set: !!url,
    token_set: !!token,
    url_prefix: url?.substring(0, 30),
    token_prefix: token?.substring(0, 10),
    ping
  })
}
