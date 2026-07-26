/**
 * sink.mjs — the write path shared by every India loader.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every loader in scripts/india/ has to satisfy three requirements that pull
 * in different directions:
 *
 *   1. Dry-run by DEFAULT. A loader that is run with no flags must never write
 *      anywhere. It extracts, transforms, and reports exactly what it would
 *      have written — to stdout and to a JSON artifact on disk.
 *   2. `--apply` gated on credentials. Writing requires real credentials in the
 *      environment; there is no "oops" path from a bare invocation to a write.
 *   3. Integration-testable without touching Supabase at all. The India schema
 *      is not applied to prod yet, so the loaders had to be provable against a
 *      throwaway local Postgres before any of this reaches a real database.
 *
 * One sink interface, three backends:
 *
 *   dry-run   (default)                    collects rows, writes .artifacts/india/
 *   postgres  (--apply + KAUN_LOCAL_PG)    psql against a LOCAL database only
 *   supabase  (--apply + SUPABASE_*)       PostgREST upsert, or the Management
 *                                          API when a row needs a raw SQL
 *                                          expression (PostGIS geometry)
 *
 * The postgres backend REFUSES any host that is not localhost. It exists for
 * `npm run` style integration testing and must never become a way to point a
 * loader at something else.
 *
 * READS are always allowed (they are read-only by definition), in every mode,
 * so a dry-run can still resolve pc_code against a populated in_constituencies
 * when credentials happen to be present.
 */
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { resolve, dirname, join } from "path"
import { fileURLToPath } from "url"
import { execFileSync } from "child_process"
import { tmpdir } from "os"

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, "../../..")
export const ARTIFACT_DIR = resolve(REPO_ROOT, ".artifacts/india")

/* ------------------------------------------------------------------------- */
/* SQL literal encoding                                                      */
/* ------------------------------------------------------------------------- */

/** Encode a JS value as a Postgres literal. Objects/arrays become jsonb. */
export function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`sqlLiteral: non-finite number ${v}`)
    return String(v)
  }
  if (v instanceof Date) return `'${v.toISOString()}'`
  if (typeof v === "object") return `${quote(JSON.stringify(v))}::jsonb`
  return quote(String(v))
}

/** Single-quoted, doubled-quote-escaped Postgres string literal. */
export function quote(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

/** Double-quoted Postgres identifier. Loaders only pass literals, but the
 *  table/column names still go through here so nothing can be interpolated
 *  unquoted by accident. */
export function ident(s) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`ident: unsafe identifier ${s}`)
  return `"${s}"`
}

/**
 * Build an idempotent `INSERT ... ON CONFLICT (...) DO UPDATE` for a batch.
 *
 * `raw` maps column name → function(row) returning a SQL EXPRESSION (not a
 * literal). That is how PostGIS geometry gets in: the value is
 * ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('…'),4326)), which no parameterized
 * row encoding can express.
 *
 * `conflict: []` means plain INSERT (used for append-only snapshot tables that
 * carry their own primary key check).
 */
export function buildUpsertSql(table, rows,
  { conflict = [], raw = {}, updateColumns = null, updateExpressions = {} } = {}) {
  if (!rows.length) return null
  // Raw columns (geom) are computed from the row rather than being a key on
  // it, so they must be unioned in explicitly — otherwise they are silently
  // dropped and the write "succeeds" with a NULL geometry.
  const columns = [...new Set([...rows.flatMap(r => Object.keys(r)), ...Object.keys(raw)])].sort()
  const cols = columns.map(ident).join(", ")
  const values = rows.map(row => {
    const cells = columns.map(c => {
      if (raw[c]) return raw[c](row) ?? "NULL"
      return sqlLiteral(row[c] ?? null)
    })
    return `(${cells.join(", ")})`
  })
  let sql = `INSERT INTO ${ident(table)} (${cols}) VALUES\n  ${values.join(",\n  ")}`
  if (conflict.length) {
    const setCols = (updateColumns ?? columns.filter(c => !conflict.includes(c)))
    // updateExpressions lets a column merge rather than overwrite — e.g.
    // first_seen_month must be LEAST(existing, new), not the new value, or a
    // re-ingest of an older report would move a project's first sighting
    // forwards in time.
    sql += setCols.length
      ? `\nON CONFLICT (${conflict.map(ident).join(", ")}) DO UPDATE SET\n  ` +
        setCols.map(c => `${ident(c)} = ${updateExpressions[c] ?? `EXCLUDED.${ident(c)}`}`)
          .join(",\n  ")
      : `\nON CONFLICT (${conflict.map(ident).join(", ")}) DO NOTHING`
  }
  return sql + ";"
}

/* ------------------------------------------------------------------------- */
/* Backends                                                                  */
/* ------------------------------------------------------------------------- */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""])

/** Refuse anything that is not a local database. This backend is a test
 *  harness, not a deployment path. */
function assertLocalPgUrl(url) {
  let parsed
  try { parsed = new URL(url) } catch { throw new Error(`KAUN_LOCAL_PG is not a URL: ${url}`) }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error(`KAUN_LOCAL_PG must be a postgres:// URL, got ${parsed.protocol}`)
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `KAUN_LOCAL_PG host must be localhost (got "${parsed.hostname}"). ` +
      `This backend is the local integration-test harness and refuses remote hosts.`)
  }
  return parsed
}

function psql(url, args, input) {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-X", "-q", url, ...args], {
    input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C", PGCLIENTENCODING: "UTF8" },
  })
}

class PostgresBackend {
  constructor(url) { this.url = url; assertLocalPgUrl(url); this.label = "postgres (local)" }

  async runSql(sql) {
    const f = join(tmpdir(), `kaun-india-${process.pid}-${Date.now()}.sql`)
    writeFileSync(f, sql)
    try { psql(this.url, ["-f", f]) } finally { rmSync(f, { force: true }) }
  }

  async selectJson(sql) {
    const out = psql(this.url, ["-A", "-t", "-c", `SELECT row_to_json(t) FROM (${sql}) t`])
    return out.split("\n").map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l))
  }
}

class SupabaseBackend {
  constructor({ url, serviceKey, mgmtToken }) {
    this.url = url.replace(/\/+$/, "")
    this.serviceKey = serviceKey
    this.mgmtToken = mgmtToken
    this.project = this.url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null
    this.label = "supabase"
  }

  get restHeaders() {
    return { apikey: this.serviceKey, Authorization: `Bearer ${this.serviceKey}` }
  }

  /** PostgREST upsert — the repo's normal data path (scripts/lib/db.mjs).
   *  PostgREST requires every object in a bulk payload to carry the SAME
   *  keys (PGRST102 otherwise). Loaders legitimately emit ragged rows —
   *  an RS member has no pc_code, a legacy row has no PMGID — so pad each
   *  row to the union of the batch's keys with explicit nulls. This is the
   *  behavior the SQL path (buildUpsertSql) already has; only keys some
   *  loader row actually emits are padded, so DB-side DEFAULT columns
   *  (id, created_at) are never touched. */
  async upsertRest(table, rows, conflict) {
    rows = padToUniformKeys(rows)
    const qs = conflict.length ? `?on_conflict=${conflict.join(",")}` : ""
    const r = await fetch(`${this.url}/rest/v1/${table}${qs}`, {
      method: "POST",
      headers: {
        ...this.restHeaders,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    })
    if (!r.ok) throw new Error(`upsert ${table} failed: ${r.status} ${(await r.text()).slice(0, 600)}`)
  }

  /** Management API — needed only where a column takes a SQL expression
   *  (in_constituencies.geom). Same mechanism as scripts/seed-boundaries.mjs. */
  async runSql(sql) {
    if (!this.mgmtToken) {
      throw new Error("SUPABASE_MANAGEMENT_TOKEN is required for geometry writes (raw SQL columns)")
    }
    const r = await fetch(`https://api.supabase.com/v1/projects/${this.project}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.mgmtToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    })
    const t = await r.text()
    if (!r.ok) throw new Error(`DB ${r.status}: ${t.slice(0, 600)}`)
    try { return JSON.parse(t) } catch { return t }
  }

  async selectJson(sql) {
    const out = await this.runSql(sql)
    return Array.isArray(out) ? out.map(r => r.row_to_json ?? r) : []
  }

  async selectRest(table, { columns = "*", limit = 100000, order = null } = {}) {
    const params = new URLSearchParams({ select: columns, limit: String(limit) })
    if (order) params.set("order", order)
    const r = await fetch(`${this.url}/rest/v1/${table}?${params}`, { headers: this.restHeaders })
    if (!r.ok) throw new Error(`select ${table} failed: ${r.status}`)
    return r.json()
  }
}

/* ------------------------------------------------------------------------- */
/* Sink                                                                      */
/* ------------------------------------------------------------------------- */

export class Sink {
  constructor({ loader, apply, backend, reason }) {
    this.loader = loader
    this.apply = apply
    this.backend = backend
    this.reason = reason
    this.mode = apply ? `apply → ${backend.label}` : "dry-run"
    this.planned = []          // [{ table, conflict, rows, preview }]
    this.reviews = []          // [{ name, rows }]
    this.warnings = []
    this.notes = []
    this.counters = {}
    this.startedAt = new Date()
  }

  note(msg) { this.notes.push(msg); console.log(`  · ${msg}`) }
  warn(msg) { this.warnings.push(msg); console.warn(`  ! ${msg}`) }
  count(key, n = 1) { this.counters[key] = (this.counters[key] ?? 0) + n }

  /** Rows a human must look at before they can be loaded (alias candidates,
   *  unresolved joins). Never written to the database by a loader. */
  review(name, rows) {
    if (!rows.length) return
    // Two passes over the same table would otherwise overwrite each other's
    // review file and quietly lose the first one's findings.
    let unique = name
    for (let n = 2; this.reviews.some(r => r.name === unique); n++) unique = `${name}-${n}`
    this.reviews.push({ name: unique, rows })
  }

  /**
   * Declare an idempotent upsert. In dry-run this only records the intent.
   *
   * opts.raw     — column → fn(row) returning a SQL expression (geometry).
   * opts.preview — fn(row) returning the shape written to the dry-run artifact
   *                (used to keep 10 MB of geometry out of a JSON report).
   * opts.batch   — rows per statement. Small for geometry: the Supabase
   *                Management API rejects oversized bodies (seed-boundaries
   *                uses 10 for ward-sized polygons; PC polygons are bigger).
   */
  async upsert(table, rows, opts = {}) {
    const { conflict = [], raw = {}, preview = null, batch = 500,
            updateColumns = null, updateExpressions = {} } = opts
    if (!rows.length) { this.note(`${table}: nothing to write`); return }
    if (conflict.length) rows = this.#dedupe(table, rows, conflict)
    this.planned.push({
      table, conflict, count: rows.length,
      preview: rows.slice(0, 3).map(r => (preview ? preview(r) : r)),
      rows: this.apply ? [] : rows.map(r => (preview ? preview(r) : r)),
    })
    if (!this.apply) {
      console.log(`  would upsert ${rows.length} row(s) → ${table}` +
        (conflict.length ? ` on (${conflict.join(", ")})` : " (insert)"))
      return
    }
    // PostgREST cannot express either a SQL expression column (geom) or a
    // merge expression (LEAST/GREATEST), so those force the SQL path.
    const usesRaw = Object.keys(raw).length > 0 || Object.keys(updateExpressions).length > 0
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch)
      if (this.backend instanceof SupabaseBackend && !usesRaw) {
        await this.backend.upsertRest(table, chunk, conflict)
      } else {
        const sql = buildUpsertSql(table, chunk, { conflict, raw, updateColumns, updateExpressions })
        await this.backend.runSql(sql)
      }
      // Progress on a terminal only — a \r-per-batch progress bar turns into
      // hundreds of lines in a GitHub Actions log.
      if (process.stdout.isTTY) {
        process.stdout.write(`\r  wrote ${Math.min(i + batch, rows.length)}/${rows.length} → ${table}`)
      }
    }
    if (process.stdout.isTTY) process.stdout.write("\n")
    console.log(`  wrote ${rows.length} row(s) → ${table}`)
  }

  /**
   * Collapse rows that share a conflict key.
   *
   * Postgres refuses this outright ("ON CONFLICT DO UPDATE command cannot
   * affect row a second time") and PostgREST does the same, so a duplicate in
   * an upstream feed would otherwise abort a whole run. sansad.in's attendance
   * endpoint really does repeat an mpsno within a session, so this is not
   * hypothetical.
   *
   * The last row wins, and any duplicate whose CONTENT differs is written to a
   * review file — a silent collapse of two disagreeing records is exactly the
   * kind of thing that should be visible.
   */
  #dedupe(table, rows, conflict) {
    const seen = new Map()
    const conflicting = []
    for (const r of rows) {
      const k = conflict.map(c => String(r[c] ?? "")).join("\u0001")
      const prev = seen.get(k)
      if (prev && JSON.stringify(prev) !== JSON.stringify(r)) {
        conflicting.push({ key: k.replace(/\u0001/g, " / "), previous: prev, kept: r })
      }
      seen.set(k, r)
    }
    const collapsed = rows.length - seen.size
    if (collapsed) {
      this.warn(`${table}: collapsed ${collapsed} duplicate row(s) on (${conflict.join(", ")})` +
        (conflicting.length ? `; ${conflicting.length} of them disagreed` : " (identical)"))
      this.count(`${table} duplicates collapsed`, collapsed)
      if (conflicting.length) this.review(`${table}-duplicate-conflicts`, conflicting)
    }
    return [...seen.values()]
  }

  /** Read-only. Safe in every mode; returns [] (with a warning) when no
   *  backend is configured, so a credential-free dry-run still runs. */
  async select(table, { columns = "*", sql = null } = {}) {
    if (!this.backend) {
      this.warn(`cannot read ${table} (no database configured) — continuing without it`)
      return []
    }
    try {
      if (this.backend instanceof SupabaseBackend && !sql) {
        return await this.backend.selectRest(table, { columns })
      }
      return await this.backend.selectJson(sql ?? `SELECT ${columns} FROM ${ident(table)}`)
    } catch (e) {
      this.warn(`read of ${table} failed (${e.message.slice(0, 140)}) — continuing without it`)
      return []
    }
  }

  /** Write the dry-run artifact + review files and print the summary block. */
  finish(extra = {}) {
    mkdirSync(ARTIFACT_DIR, { recursive: true })
    const summary = {
      loader: this.loader,
      mode: this.mode,
      backend_reason: this.reason,
      started_at: this.startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      counters: this.counters,
      tables: this.planned.map(p => ({
        table: p.table, conflict: p.conflict, rows: p.count, sample: p.preview,
      })),
      reviews: this.reviews.map(r => ({ name: r.name, rows: r.rows.length })),
      warnings: this.warnings,
      notes: this.notes,
      ...extra,
    }
    const base = join(ARTIFACT_DIR, this.loader)
    writeFileSync(`${base}.summary.json`, JSON.stringify(summary, null, 2))
    if (!this.apply) {
      writeFileSync(`${base}.dry-run.json`, JSON.stringify(
        { ...summary, would_write: Object.fromEntries(this.planned.map(p => [p.table, p.rows])) },
        null, 2))
    }
    for (const r of this.reviews) {
      const f = `${base}.review-${r.name}`
      writeFileSync(`${f}.json`, JSON.stringify(r.rows, null, 2))
      writeFileSync(`${f}.csv`, toCsv(r.rows))
    }

    console.log(`\n=== ${this.loader} — ${this.mode} ===`)
    if (this.reason) console.log(`backend: ${this.reason}`)
    for (const [k, v] of Object.entries(this.counters)) console.log(`  ${k.padEnd(38)} ${v}`)
    for (const p of this.planned) {
      console.log(`  ${(this.apply ? "wrote" : "would write").padEnd(11)} ${String(p.count).padStart(6)}  → ${p.table}`)
    }
    for (const r of this.reviews) {
      console.log(`  REVIEW ${String(r.rows.length).padStart(6)} row(s) → ${base}.review-${r.name}.csv`)
    }
    if (this.warnings.length) console.log(`  warnings: ${this.warnings.length}`)
    console.log(`artifact: ${base}${this.apply ? ".summary" : ".dry-run"}.json`)
    return summary
  }
}

/** Minimal CSV writer for the human-review files. */
/** Pad ragged rows to the union of the batch's keys with explicit nulls —
 *  PostgREST bulk payloads must be uniform (PGRST102). Pure; exported for
 *  tests. */
export function padToUniformKeys(rows) {
  const allKeys = [...new Set(rows.flatMap(r => Object.keys(r)))]
  return rows.map(r => Object.fromEntries(allKeys.map(k => [k, r[k] ?? null])))
}

export function toCsv(rows) {
  if (!rows.length) return ""
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const cell = v => {
    if (v === null || v === undefined) return ""
    const s = typeof v === "object" ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\n") + "\n"
}

/**
 * Choose a backend.
 *
 * --apply with neither KAUN_LOCAL_PG nor SUPABASE_* present is a hard failure:
 * a loader must never silently degrade an apply run into a no-op.
 */
export function openSink({ loader, apply }) {
  const localPg = process.env.KAUN_LOCAL_PG
  const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const mgmt = process.env.SUPABASE_MANAGEMENT_TOKEN

  let backend = null
  let reason = "no database configured (extract + transform only)"
  if (localPg) {
    backend = new PostgresBackend(localPg)
    reason = "KAUN_LOCAL_PG set — local throwaway Postgres (integration test harness)"
  } else if (sbUrl && sbKey) {
    backend = new SupabaseBackend({ url: sbUrl, serviceKey: sbKey, mgmtToken: mgmt })
    reason = `SUPABASE_URL + service key${mgmt ? " + management token" : " (no management token: geometry writes unavailable)"}`
  }

  if (apply && !backend) {
    console.error(
      "--apply needs credentials. Set SUPABASE_URL + SUPABASE_SERVICE_KEY " +
      "(and SUPABASE_MANAGEMENT_TOKEN for geometry), or KAUN_LOCAL_PG for a local test database.\n" +
      "Refusing to write.")
    process.exit(1)
  }
  return new Sink({ loader, apply, backend, reason })
}
