/**
 * rest.mjs — PostgREST reads and guarded writes for scripts that must be able
 * to dry-run without credentials.
 *
 * scripts/lib/db.mjs exits at import when the service key is missing, so a
 * script built on it cannot even show what it would change. This client reads
 * with whatever key it has — the public anon key by default, because every
 * table these scripts reconcile is public-read — and refuses to write without
 * the service key.
 *
 * Writes ask for return=representation and compare the rows touched with the
 * rows expected, so a filter that matched nothing (or more than it should)
 * fails loudly instead of returning an ambiguous 204.
 */

const DEFAULT_URL = "https://xgygxfyfsvccqqmtboeu.supabase.co"
// The same public anon key as apps/web/lib/supabase-config.ts; it ships to browsers.
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneWd4Znlmc3ZjY3FxbXRib2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDg1NzIsImV4cCI6MjA4ODEyNDU3Mn0.5dzsC5-Ex-Umk-9DTM5xNsQB-t0my-MtWq9WUPhidD4"

export function restConfig(env = process.env) {
  return {
    url: (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL).replace(/\/+$/, ""),
    serviceKey: env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null,
    anonKey: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY,
  }
}

export function createRest(config = restConfig(), fetchImpl = globalThis.fetch) {
  const auth = key => ({ apikey: key, Authorization: `Bearer ${key}` })
  const readKey = config.serviceKey ?? config.anonKey

  function writeKey() {
    if (!config.serviceKey) {
      throw new Error("writing needs SUPABASE_SERVICE_KEY (a dry run does not)")
    }
    return config.serviceKey
  }

  /**
   * Every row, in pages. PostgREST caps a response at 1,000 rows without
   * saying so, so a single request silently reads a partial table.
   */
  async function selectAll(table, params, { pageSize = 1000 } = {}) {
    if (!params?.order) throw new Error(`selectAll(${table}) needs an order, or pages can skip or repeat rows`)
    const rows = []
    for (let offset = 0; ; offset += pageSize) {
      const qs = new URLSearchParams({ ...params, limit: String(pageSize), offset: String(offset) })
      const r = await fetchImpl(`${config.url}/rest/v1/${table}?${qs}`, { headers: auth(readKey) })
      if (!r.ok) throw new Error(`read ${table} failed: ${r.status} ${(await r.text()).slice(0, 300)}`)
      const page = await r.json()
      rows.push(...page)
      if (page.length < pageSize) return rows
    }
  }

  async function write(method, table, query, body, expect) {
    const key = writeKey()
    const qs = new URLSearchParams(query)
    const r = await fetchImpl(`${config.url}/rest/v1/${table}${qs.size ? `?${qs}` : ""}`, {
      method,
      headers: {
        ...auth(key),
        "Content-Type": "application/json",
        Prefer: method === "POST"
          ? "resolution=merge-duplicates,return=representation"
          : "return=representation",
      },
      body: JSON.stringify(body),
    })
    const text = await r.text()
    if (!r.ok) throw new Error(`${method} ${table} failed: ${r.status} ${text.slice(0, 300)}`)
    const rows = JSON.parse(text)
    if (rows.length !== expect) {
      throw new Error(`${method} ${table}${qs.size ? `?${qs}` : ""} touched ${rows.length} row(s), expected ${expect}`)
    }
    return rows
  }

  return {
    config,
    canWrite: Boolean(config.serviceKey),
    selectAll,
    /** PATCH the rows matching `filter` (PostgREST operators, e.g. { id: "eq.12" }). */
    patch: (table, filter, body, { expect = 1 } = {}) => write("PATCH", table, filter, body, expect),
    /** Upsert on `onConflict`; every row must come back. */
    upsert: (table, rows, onConflict) =>
      write("POST", table, { on_conflict: onConflict }, rows, rows.length),
  }
}
