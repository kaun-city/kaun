/**
 * Supabase client for Kaun.
 *
 * All data lives in Supabase (PostgREST + PostgreSQL functions).
 * No separate API server needed.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xgygxfyfsvccqqmtboeu.supabase.co"
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneWd4Znlmc3ZjY3FxbXRib2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDg1NzIsImV4cCI6MjA4ODEyNDU3Mn0.5dzsC5-Ex-Umk-9DTM5xNsQB-t0my-MtWq9WUPhidD4"

const headers = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
}

/** Call a Supabase RPC (PostgreSQL function) */
export async function rpc<T = unknown>(fn: string, params: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Query a Supabase table via PostgREST */
export async function query<T = unknown>(
  table: string,
  params: Record<string, string> = {},
  options: { select?: string; order?: string; limit?: number } = {}
): Promise<T[]> {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
    if (options.select) url.searchParams.set("select", options.select)
    if (options.order) url.searchParams.set("order", options.order)
    if (options.limit) url.searchParams.set("limit", String(options.limit))
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) return []
    return await res.json()
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify(data),
    })
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) ? rows[0] : rows
  } catch {
    return null
  }
}
