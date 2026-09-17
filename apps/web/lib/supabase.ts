/**
 * Supabase client for Kaun.
 *
 * All data lives in Supabase (PostgREST + PostgreSQL functions).
 * No separate API server needed. In the browser every request goes to the
 * same-origin proxy (DB_PROXY_PATH, rewritten by next.config.ts); on the server
 * it goes to Supabase directly.
 */

import { DB_PROXY_PATH, publicSupabaseConfig } from "./supabase-config.ts"

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = publicSupabaseConfig()

const headers = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
}

/** A browser read that has not answered by now is reported as failed, not left loading. */
export const BROWSER_REQUEST_TIMEOUT_MS = 15_000

/** A read that could not be completed: unreachable, timed out, or an error response. */
export class DataRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DataRequestError"
  }
}

/** PostgREST URL for a table or `rpc/<fn>` path. */
export function restUrl(path: string): URL {
  return typeof window === "undefined"
    ? new URL(`${SUPABASE_URL}/rest/v1/${path}`)
    : new URL(`${DB_PROXY_PATH}/rest/v1/${path}`, window.location.origin)
}

/**
 * One PostgREST request. Throws DataRequestError instead of resolving to an
 * empty value, so callers can tell "failed" from "no rows".
 *
 * The timeout is browser-only: server reads may carry Next's `revalidate`
 * cache option, and those are left exactly as they were.
 */
export async function restRequest(url: URL, init: RequestInit & { next?: { revalidate: number } } = {}): Promise<Response> {
  const label = url.pathname.replace(/^.*\/rest\/v1\//, "")
  const inBrowser = typeof window !== "undefined"
  let res: Response
  try {
    res = await fetch(url.toString(), {
      ...init,
      headers: { ...headers, ...init.headers },
      ...(inBrowser ? { signal: AbortSignal.timeout(BROWSER_REQUEST_TIMEOUT_MS) } : {}),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError"
    throw new DataRequestError(`${label}: ${timedOut ? "timed out" : "unreachable"}`)
  }
  if (!res.ok) throw new DataRequestError(`${label}: HTTP ${res.status}`)
  return res
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  try {
    return await res.json()
  } catch {
    throw new DataRequestError(`${label}: unreadable response`)
  }
}

/** Call a Supabase RPC (PostgreSQL function). Throws DataRequestError on failure. */
export async function rpcOrThrow<T = unknown>(fn: string, params: Record<string, unknown> = {}): Promise<T | null> {
  const res = await restRequest(restUrl(`rpc/${fn}`), { method: "POST", body: JSON.stringify(params) })
  return readJson<T | null>(res, `rpc/${fn}`)
}

/** Call a Supabase RPC (PostgreSQL function); null on failure. */
export async function rpc<T = unknown>(fn: string, params: Record<string, unknown> = {}): Promise<T | null> {
  try {
    return await rpcOrThrow<T>(fn, params)
  } catch {
    return null
  }
}

type QueryOptions = { select?: string; order?: string; limit?: number; revalidate?: number }

/**
 * Query a Supabase table via PostgREST. Throws DataRequestError on failure.
 *
 * CACHING IS OPT-IN, PER CALL, AND STAYS THAT WAY.
 * ------------------------------------------------
 * Passing `revalidate` puts the response in Next's Data Cache for that many
 * seconds. Omitting it leaves the request exactly as uncached as it has always
 * been — Next's default for fetch is no-store — which is why adding this
 * option cannot change the behaviour of a single existing caller.
 *
 * That default matters more than the feature does. /api/* is read by the BNP
 * export pipeline and by crons that expect to see what is in the database
 * right now, and a cache turned on globally here would silently start serving
 * them yesterday's rows. Only lib/india/api.ts opts in (see cachedQuery there),
 * and only for reads that back pages whose data refreshes weekly at best.
 *
 * In the browser the `next` key is an unknown RequestInit property and is
 * ignored, so the client components that call through here are unaffected.
 */
export async function queryOrThrow<T = unknown>(
  table: string,
  params: Record<string, string> = {},
  options: QueryOptions = {}
): Promise<T[]> {
  const url = restUrl(table)
  if (options.select) url.searchParams.set("select", options.select)
  if (options.order) url.searchParams.set("order", options.order)
  if (options.limit) url.searchParams.set("limit", String(options.limit))
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await restRequest(url, options.revalidate !== undefined ? { next: { revalidate: options.revalidate } } : {})
  return readJson<T[]>(res, table)
}

/** Query a Supabase table via PostgREST; [] on failure. See queryOrThrow for caching. */
export async function query<T = unknown>(
  table: string,
  params: Record<string, string> = {},
  options: QueryOptions = {}
): Promise<T[]> {
  try {
    return await queryOrThrow<T>(table, params, options)
  } catch {
    return []
  }
}

/** Insert a row into a Supabase table, returns the inserted row */
export async function insert<T = unknown>(
  table: string,
  data: Record<string, unknown>
): Promise<T | null> {
  try {
    const res = await restRequest(restUrl(table), {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify(data),
    })
    const rows = await res.json()
    return Array.isArray(rows) ? rows[0] : rows
  } catch {
    return null
  }
}
