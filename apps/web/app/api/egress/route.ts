import { request as httpRequest, type IncomingMessage } from "node:http"
import { request as httpsRequest } from "node:https"
import { rootCertificates } from "node:tls"
import { timingSafeEqual } from "node:crypto"
import { Readable } from "node:stream"
import {
  EGRESS_ERROR_HEADER, EGRESS_SECRET_HEADER, FORWARD_REQUEST_HEADERS, FORWARD_RESPONSE_HEADERS,
  GODADDY_G2_INTERMEDIATE, egressTarget,
} from "@/lib/egress"

export const runtime = "nodejs"
// The point of this route is where it runs: next to Indian government sites
// that refuse GitHub's US runners. vercel.json already defaults to bom1.
export const preferredRegion = "bom1"
export const maxDuration = 60

const UPSTREAM_TIMEOUT_MS = 50_000
const CA = [...rootCertificates, GODADDY_G2_INTERMEDIATE]

/**
 * /api/egress?url=<target> — a relay for Kaun's scheduled data jobs
 * (scripts/lib/egress.mjs), for the government hosts in lib/egress.mjs only.
 *
 * - Requires the job's CRON_SECRET in x-kaun-egress-secret; 503 if the
 *   deployment has none (previews).
 * - Passes the method, body and an allowlist of request headers upstream, and
 *   the status, an allowlist of response headers (including every Set-Cookie)
 *   and the body back, streamed, so report PDFs larger than a function's
 *   buffered response limit get through.
 * - Never follows redirects: the job's wrapper does, like fetch would.
 * - Relay failures carry x-kaun-egress-error so a job can tell them from the
 *   upstream site's own error pages.
 */
async function relay(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return failure(503, "egress relay is not configured on this deployment")
  const given = request.headers.get(EGRESS_SECRET_HEADER) ?? ""
  const expected = Buffer.from(secret)
  const actual = Buffer.from(given)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return failure(401, "unauthorized")

  const target = egressTarget(new URL(request.url).searchParams.get("url"))
  if (!target.url) return failure(403, target.error)

  const headers: Record<string, string> = {}
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) headers[name] = value
  }
  headers["accept-encoding"] = "identity"
  const body = request.method === "GET" || request.method === "HEAD" ? null : Buffer.from(await request.arrayBuffer())
  if (body) headers["content-length"] = String(body.length)

  let upstream: IncomingMessage
  try {
    upstream = await new Promise<IncomingMessage>((resolve, reject) => {
      const send = target.url.protocol === "https:" ? httpsRequest : httpRequest
      const req = send(target.url, { method: request.method, headers, ca: CA, timeout: UPSTREAM_TIMEOUT_MS }, resolve)
      req.on("timeout", () => req.destroy(new Error(`upstream timed out after ${UPSTREAM_TIMEOUT_MS} ms`)))
      req.on("error", reject)
      req.end(body ?? undefined)
    })
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    return failure(502, `${target.url.hostname}: ${e.code ?? e.message}`)
  }

  const out = new Headers({ "Cache-Control": "no-store" })
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers[name]
    if (Array.isArray(value)) for (const item of value) out.append(name, item)
    else if (value !== undefined) out.set(name, String(value))
  }
  const noBody = request.method === "HEAD" || upstream.statusCode === 204 || upstream.statusCode === 304
  if (noBody) upstream.resume()
  return new Response(noBody ? null : (Readable.toWeb(upstream) as ReadableStream), { status: upstream.statusCode ?? 502, headers: out })
}

function failure(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { [EGRESS_ERROR_HEADER]: "1", "Cache-Control": "no-store" } })
}

export const GET = relay
export const POST = relay
export const HEAD = relay
