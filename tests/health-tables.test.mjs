/**
 * /api/health reads each table's freshness from one date column. A column the
 * database does not have makes PostgREST reject the query, which health used to
 * report as a healthy table with nothing recent (tenders.created_at, among others).
 *
 * Run: node --test --experimental-strip-types tests/health-tables.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"

import { checkTable, HEALTH_TABLES } from "../apps/web/lib/health-tables.ts"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

// Column name -> type per public table, replaying supabase/migrations in order.
function migrationSchema() {
  const tables = new Map()
  const name = raw => raw.replaceAll('"', "").replace(/^public\./, "")
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()
  for (const file of files) {
    const sql = read(`supabase/migrations/${file}`).replace(/--.*$/gm, "")
    const statements = /CREATE TABLE(?: IF NOT EXISTS)? ([\w."]+) \(|ALTER TABLE(?: IF EXISTS)?(?: ONLY)? ([\w."]+)([^;]*);|DROP TABLE(?: IF EXISTS)? ([\w."]+)/gi
    for (const match of sql.matchAll(statements)) {
      if (match[1]) {
        let depth = 1
        let end = match.index + match[0].length
        for (; depth > 0; end++) depth += sql[end] === "(" ? 1 : sql[end] === ")" ? -1 : 0
        const body = sql.slice(match.index + match[0].length, end - 1)
        const columns = new Map()
        for (const line of body.split("\n")) {
          const column = line.trim().match(/^"?(\w+)"?\s+(.+?),?$/)
          if (column && !/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)$/i.test(column[1])) {
            columns.set(column[1], column[2].replaceAll('"', ""))
          }
        }
        tables.set(name(match[1]), columns)
      } else if (match[2]) {
        const table = name(match[2])
        const clauses = match[3]
        const renamed = clauses.match(/^\s*RENAME TO ([\w."]+)/i)
        if (renamed) {
          tables.set(name(renamed[1]), tables.get(table))
          tables.delete(table)
          continue
        }
        const columns = tables.get(table)
        if (!columns) continue
        for (const [, column, type] of clauses.matchAll(/ADD COLUMN(?: IF NOT EXISTS)? "?(\w+)"? ([^,]+)/gi)) {
          columns.set(column, type.trim().replaceAll('"', ""))
        }
        for (const [, column] of clauses.matchAll(/DROP COLUMN(?: IF EXISTS)? "?(\w+)"?/gi)) columns.delete(column)
        for (const [, from, to] of clauses.matchAll(/RENAME COLUMN "?(\w+)"? TO "?(\w+)"?/gi)) {
          columns.set(to, columns.get(from))
          columns.delete(from)
        }
      } else {
        tables.delete(name(match[4]))
      }
    }
  }
  return tables
}

const schema = migrationSchema()

test("the migration reader sees the columns that broke health", () => {
  const tenders = schema.get("tenders")
  assert.ok(tenders, "public.tenders is created by the migrations")
  assert.equal(tenders.has("created_at"), false)
  assert.equal(tenders.get("issued_date"), "date")
  assert.equal(schema.get("ward_reports")?.get("gba_ward_no"), "integer", "later ADD COLUMNs are applied")
  assert.equal(schema.has("ward_bus_stops_static"), false, "renamed then dropped tables are gone")
})

test("every table health checks exists in the migrations", () => {
  for (const { table } of HEALTH_TABLES) {
    assert.ok(schema.has(table), `supabase/migrations creates public.${table}`)
  }
})

test("every health freshness column is a date or timestamp column in the migrations", () => {
  const wrong = HEALTH_TABLES.filter(({ dateColumn }) => dateColumn !== null).flatMap(({ table, dateColumn }) => {
    const type = schema.get(table)?.get(dateColumn)
    if (!type) return [`public.${table}.${dateColumn} is not in supabase/migrations`]
    return /^(date|timestamp)\b/.test(type) ? [] : [`public.${table}.${dateColumn} is ${type}, not a date or timestamp`]
  })
  assert.deepEqual(wrong, [])
})

test("health checks exactly the pinned table list", () => {
  const route = read("apps/web/app/api/health/route.ts")
  assert.match(route, /HEALTH_TABLES\.map\(table => checkTable\(supabase, table\)\)/)
  assert.doesNotMatch(route, /checkTable\(supabase, "/, "no table/column pair outside HEALTH_TABLES")
  assert.equal(new Set(HEALTH_TABLES.map(t => t.table)).size, HEALTH_TABLES.length, "no table listed twice")
})

// A stand-in for the supabase-js query builder: `respond` decides each query's result.
function fakeSupabase(respond) {
  const queries = []
  return {
    queries,
    from(table) {
      const query = { table, filters: [] }
      queries.push(query)
      const builder = {
        select(columns, options) { Object.assign(query, { columns, head: options?.head ?? false }); return builder },
        gte(column, value) { query.filters.push({ column, value }); return builder },
        order(column, options) { query.order = { column, ...options }; return builder },
        limit(n) { query.limit = n; return builder },
        then(resolve, reject) { return Promise.resolve().then(() => respond(query)).then(resolve, reject) },
      }
      return builder
    },
  }
}

const NOW = Date.parse("2026-09-17T12:00:00Z")

test("a table with a date column reports counts and its newest non-null value", async () => {
  const supabase = fakeSupabase(query => query.head
    ? { count: query.filters.length ? 3 : 120, error: null, status: 200 }
    : { data: [{ issued_date: "2026-09-12" }], error: null, status: 200 })
  const check = await checkTable(supabase, { table: "tenders", dateColumn: "issued_date" }, NOW)

  assert.deepEqual(check, {
    table: "tenders",
    date_column: "issued_date",
    total: 120,
    recent_24h: 3,
    recent_7d: 3,
    latest_at: "2026-09-12",
    status: "ok",
  })
  assert.deepEqual(supabase.queries.at(-1).order, { column: "issued_date", ascending: false, nullsFirst: false })
})

test("a failed freshness query marks the table as an error, not as zero recent rows", async () => {
  // What PostgREST does for tenders.created_at: 42703 on GET, an empty-bodied 400 on HEAD.
  const supabase = fakeSupabase(query => {
    if (query.head && query.filters.length === 0) return { count: 15756, error: null, status: 200 }
    if (query.head) return { count: null, error: { message: "" }, status: 400 }
    return { data: null, error: { message: "column tenders.created_at does not exist" }, status: 400 }
  })
  const check = await checkTable(supabase, { table: "tenders", dateColumn: "created_at" }, NOW)

  assert.equal(check.status, "error")
  assert.equal(check.total, 15756)
  assert.equal(check.recent_24h, null)
  assert.equal(check.recent_7d, null)
  assert.equal(check.latest_at, null)
  assert.deepEqual(check.errors, [
    "recent_24h (created_at): HTTP 400",
    "recent_7d (created_at): HTTP 400",
    "latest_at (created_at): column tenders.created_at does not exist",
  ])
})

test("a count that comes back without a number is an error, not an empty table", async () => {
  // supabase-js turns a HEAD 404 (table missing) into no error and no count.
  const check = await checkTable(fakeSupabase(() => ({ count: null, error: null, status: 204 })), { table: "wards", dateColumn: null }, NOW)
  assert.equal(check.status, "error")
  assert.equal(check.total, null)
  assert.deepEqual(check.errors, ["total: no count returned"])
})

test("a thrown request is an error", async () => {
  const check = await checkTable(fakeSupabase(() => { throw new Error("fetch failed") }), { table: "wards", dateColumn: null }, NOW)
  assert.equal(check.status, "error")
  assert.deepEqual(check.errors, ["wards: fetch failed"])
})

test("a table without a date column is counted and its freshness left untracked", async () => {
  const supabase = fakeSupabase(() => ({ count: 0, error: null, status: 200 }))
  const check = await checkTable(supabase, { table: "ward_grievances", dateColumn: null }, NOW)

  assert.equal(supabase.queries.length, 1, "only the row count is queried")
  assert.deepEqual(check, {
    table: "ward_grievances",
    date_column: null,
    total: 0,
    recent_24h: null,
    recent_7d: null,
    latest_at: null,
    status: "empty",
  })
})
