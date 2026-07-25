/**
 * http.mjs — the one polite HTTP client every India loader uses.
 *
 * Four of the six sources here are undocumented government endpoints or a
 * volunteer-run site with no API at all. None of them owes us anything, so the
 * rules are the same everywhere:
 *
 *   - identify Kaun honestly in the User-Agent (never spoof a bare browser),
 *   - leave a delay between requests to the same host,
 *   - retry a small, bounded number of times with backoff on 429/5xx,
 *   - cache every response on disk so a re-run of a dry-run costs the source
 *     nothing at all.
 *
 * The cache is the important one. Developing a MyNeta parser means running the
 * same fetch dozens of times; without a cache that is dozens of hits per page
 * on a site that publishes affidavits as a public service.
 *
 * sansad.in in particular drops connections from curl's default UA and needs a
 * browser-shaped UA string — so the UA below is browser-shaped AND still says
 * who we are and how to contact us. That is the compromise the skeletons
 * documented and it is deliberate.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "fs"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { createHash } from "crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))
export const CACHE_DIR = resolve(__dirname, "../../../.cache/india")

export const KAUN_UA =
  "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency; +https://kaun.city)"

const lastHit = new Map()

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function cachePath(namespace, key) {
  const h = createHash("sha1").update(key).digest("hex").slice(0, 32)
  return join(CACHE_DIR, namespace, `${h}.json`)
}

/**
 * Fetch with politeness, retries and an on-disk cache.
 *
 *   namespace   cache sub-directory, one per source
 *   cacheKey    defaults to `${method} ${url} ${body}`
 *   maxAgeMs    cache entries older than this are refetched (default: forever)
 *   delayMs     minimum gap between two requests to the same host
 */
export async function politeFetch(url, {
  method = "GET",
  body = null,
  headers = {},
  namespace = "misc",
  cacheKey = null,
  cache = true,
  maxAgeMs = Infinity,
  delayMs = 1200,
  retries = 3,
  json = true,
  timeoutMs = 60000,
} = {}) {
  const key = cacheKey ?? `${method} ${url} ${body ?? ""}`
  const file = cachePath(namespace, key)

  if (cache && existsSync(file)) {
    const age = Date.now() - statSync(file).mtimeMs
    if (age <= maxAgeMs) {
      const hit = JSON.parse(readFileSync(file, "utf8"))
      return json ? hit.json : hit.text
    }
  }

  const host = new URL(url).host
  const since = Date.now() - (lastHit.get(host) ?? 0)
  if (since < delayMs) await sleep(delayMs - since)

  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(1500 * 2 ** (attempt - 1))
    lastHit.set(host, Date.now())
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      let res
      try {
        res = await fetch(url, {
          method,
          headers: { "User-Agent": KAUN_UA, ...headers },
          body,
          signal: ctrl.signal,
          redirect: "follow",
        })
      } finally { clearTimeout(timer) }

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${res.status} from ${url}`)
        continue
      }
      if (!res.ok) throw new Error(`${res.status} from ${url}: ${(await res.text()).slice(0, 300)}`)

      const text = await res.text()
      let parsed = null
      if (json) {
        try { parsed = JSON.parse(text) }
        catch { throw new Error(`non-JSON response from ${url}: ${text.slice(0, 200)}`) }
      }
      if (cache) {
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, JSON.stringify({ url, method, fetched_at: new Date().toISOString(), json: parsed, text }))
      }
      return json ? parsed : text
    } catch (e) {
      lastErr = e
      if (e.name === "AbortError") lastErr = new Error(`timeout after ${timeoutMs}ms: ${url}`)
    }
  }
  throw lastErr ?? new Error(`fetch failed: ${url}`)
}

/** POST a JSON body. eSAKSHI serves everything this way, including reads. */
export function postJson(url, payload, opts = {}) {
  return politeFetch(url, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json; charset=utf-8", ...(opts.headers ?? {}) },
    ...opts,
  })
}

/** Fetch a binary file (MoSPI PDFs) straight to disk, cached by name. */
export async function fetchToFile(url, destPath, { headers = {}, timeoutMs = 300000 } = {}) {
  if (existsSync(destPath) && statSync(destPath).size > 0) return { path: destPath, cached: true }
  mkdirSync(dirname(destPath), { recursive: true })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { "User-Agent": KAUN_UA, ...headers }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
    writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
  } finally { clearTimeout(timer) }
  return { path: destPath, cached: false }
}
