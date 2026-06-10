// Shared Supabase helpers for scraper scripts

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
  process.exit(1)
}

export async function dbQuery(sql) {
  // Use management API for DDL or complex queries
  const mgmtToken = process.env.SUPABASE_MANAGEMENT_TOKEN
  if (mgmtToken) {
    const projectId = SUPA_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    })
    if (!res.ok) throw new Error(`DB query failed: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return data.value ?? data
  }
  throw new Error("SUPABASE_MANAGEMENT_TOKEN not set")
}

/**
 * Enable RLS on a table with an anon/authenticated public-read policy.
 * Matches the per-bucket pattern established in the May 2026 RLS hardening
 * (scripts/migrate-rls-surgical-fix.mjs): public civic data is readable by
 * everyone; writes only flow through the service role, which bypasses RLS.
 *
 * Idempotent — safe to call on every seeder/adapter run right after
 * CREATE TABLE IF NOT EXISTS. Without this, freshly created tables are
 * unreadable by the frontend's anon key and get flagged by Supabase
 * Security Advisor.
 */
export async function ensurePublicReadRls(table) {
  await dbQuery(`
    DO $$
    BEGIN
      IF NOT (SELECT relrowsecurity FROM pg_class
                WHERE oid = 'public.${table}'::regclass) THEN
        EXECUTE 'ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname = 'public' AND tablename = '${table}'
                        AND policyname = '${table}_anon_read') THEN
        EXECUTE 'CREATE POLICY ${table}_anon_read
                   ON public.${table}
                   FOR SELECT TO anon, authenticated USING (true)';
      END IF;
    END $$;
  `)
}

export async function rpc(fn, args) {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPA_KEY,
      "Authorization": `Bearer ${SUPA_KEY}`,
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function upsertRows(table, rows, conflictCols) {
  if (!rows.length) return
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${conflictCols}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPA_KEY,
      "Authorization": `Bearer ${SUPA_KEY}`,
      "Prefer": "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Upsert to ${table} failed: ${res.status} ${err}`)
  }
}

export async function insertRows(table, rows) {
  if (!rows.length) return
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPA_KEY,
      "Authorization": `Bearer ${SUPA_KEY}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Insert into ${table} failed: ${res.status} ${err}`)
  }
}

export async function selectRows(table, params) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs}`, {
    headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` },
  })
  if (!res.ok) throw new Error(`Select from ${table} failed: ${res.status}`)
  return res.json()
}
