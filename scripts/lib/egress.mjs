/**
 * egressFetch — fetch() for the scheduled data jobs, routed through Kaun's
 * India egress relay (apps/web/app/api/egress) for the government hosts that
 * refuse GitHub's runners (apps/web/lib/egress.mjs lists them and says why).
 *
 * With KAUN_EGRESS_URL and KAUN_EGRESS_SECRET set (the workflows set them to
 * https://kaun.city/api/egress and CRON_SECRET), requests to those hosts go
 * through the relay; everything else, and every request when the variables
 * are unset (a developer's own machine in India), is a plain fetch.
 *
 * The relay never follows redirects, so this does, the way fetch would:
 * 301/302/303 become GET without a body, 307/308 keep both. Pass
 * redirect: "manual" to see them yourself (Sakala's cookie hops need that).
 */
import { EGRESS_ERROR_HEADER, EGRESS_SECRET_HEADER, isEgressUrl } from "../../apps/web/lib/egress.mjs"

const MAX_REDIRECTS = 10

export function egressConfigured() {
  return Boolean(process.env.KAUN_EGRESS_URL)
}

export async function egressFetch(input, init = {}) {
  const relay = process.env.KAUN_EGRESS_URL
  const first = String(input instanceof URL ? input.href : input)
  if (!relay || !isEgressUrl(first)) return fetch(input, init)
  const secret = process.env.KAUN_EGRESS_SECRET
  if (!secret) throw new Error("KAUN_EGRESS_URL is set but KAUN_EGRESS_SECRET is not")

  let url = first
  let method = (init.method ?? "GET").toUpperCase()
  let body = init.body ?? null
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers = new Headers(init.headers)
    headers.set(EGRESS_SECRET_HEADER, secret)
    if (!body) headers.delete("content-type")
    const res = await fetch(`${relay}?url=${encodeURIComponent(url)}`, {
      method, headers, body, signal: init.signal, redirect: "manual",
    })
    if (res.headers.get(EGRESS_ERROR_HEADER)) {
      const reason = await res.json().then(data => data.error, () => res.statusText)
      throw new TypeError(`fetch failed (egress relay ${res.status}: ${reason})`)
    }
    const location = res.headers.get("location")
    if (init.redirect === "manual" || ![301, 302, 303, 307, 308].includes(res.status) || !location) return res
    await res.body?.cancel()
    url = new URL(location, url).href
    if (!isEgressUrl(url)) return fetch(url, { ...init, method, body, redirect: init.redirect })
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
      method = "GET"
      body = null
    }
  }
  throw new TypeError(`fetch failed (more than ${MAX_REDIRECTS} redirects from ${first})`)
}
