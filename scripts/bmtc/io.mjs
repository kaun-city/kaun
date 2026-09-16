/**
 * io.mjs — network helpers for the BMTC stop scripts (fetch only, no deps).
 *
 * Reads default to the public anon key the browser bundle already ships
 * (apps/web/lib/supabase-config.ts; tests/bmtc-stops.test.mjs keeps the two in
 * step). Writes take an explicit key and are only called behind --apply.
 */

export const DEFAULT_SUPABASE_URL = "https://xgygxfyfsvccqqmtboeu.supabase.co"
export const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneWd4Znlmc3ZjY3FxbXRib2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDg1NzIsImV4cCI6MjA4ODEyNDU3Mn0.5dzsC5-Ex-Umk-9DTM5xNsQB-t0my-MtWq9WUPhidD4"

export const supabaseUrl = () =>
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).replace(/\/+$/, "")
export const anonKey = () =>
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY

/** Project ref of a hosted Supabase URL, or null for anything else (e.g. local). */
export function projectRef(url = supabaseUrl()) {
  return url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null
}

export const formatCount = n => (n === null || n === undefined ? "n/a" : Number(n).toLocaleString("en-US"))

const MISSING_RELATION = new Set(["PGRST205", "42P01"])

/**
 * Every row of a table or view through paged PostgREST GETs, ordered by a
 * unique column list so pages cannot overlap. Returns null when the relation
 * does not exist (e.g. bmtc_stop_booths before the migration).
 */
export async function readAll(table, { select = "*", order, key = anonKey(), url = supabaseUrl(), pageSize = 1000 } = {}) {
  if (!order) throw new Error(`readAll(${table}) needs a unique order`)
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ select, order, offset: String(offset), limit: String(pageSize) })
    const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    })
    if (!res.ok) {
      const body = await res.text()
      let code = null
      try { code = JSON.parse(body).code } catch { /* not JSON */ }
      if (MISSING_RELATION.has(code)) return null
      throw new Error(`GET ${table} failed: ${res.status} ${body.slice(0, 300)}`)
    }
    const page = await res.json()
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

export async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  return res.text()
}

export async function fetchJson(url) {
  return JSON.parse(await fetchText(url))
}

/** A PostgREST write with an explicit (service-role) key. */
export async function restWrite(method, path, { key, url = supabaseUrl(), body, prefer } = {}) {
  if (!key) throw new Error("restWrite needs a key")
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: ${res.status} ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}
