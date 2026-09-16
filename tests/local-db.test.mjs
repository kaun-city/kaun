import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { CIVIC_PROJECTS } from "../apps/web/lib/civic-projects.ts"
import { baseline, migrationSeededTables, privateTables } from "../scripts/local-db/shared.mjs"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const rootPackage = JSON.parse(read("package.json"))
const rootIgnore = read(".gitignore")
const syncScript = read("scripts/local-db/sync-remote.mjs")
const sharedScript = read("scripts/local-db/shared.mjs")
const config = read("supabase/config.toml")
const postgisMigration = read("supabase/migrations/20260504_enable_postgis.sql")
const localSeeder = read("scripts/local-db/seed-local.mjs")

const migrationsDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url))
const migrationFiles = readdirSync(migrationsDir).filter(name => name.endsWith(".sql")).sort()
const migrations = new Map(migrationFiles.map(name => [name, readFileSync(join(migrationsDir, name), "utf8")]))
const baselineName = baseline.split(/[\\/]/).pop()
const afterBaseline = migrationFiles.filter(name => name > baselineName)
const stripSqlComments = sql => sql.replace(/--.*$/gm, "").trim()
const qualified = name => (name.includes(".") ? name : `public.${name}`).replaceAll('"', "")

const createdTables = new Set([...migrations.values()].flatMap(sql =>
  [...sql.matchAll(/^CREATE TABLE IF NOT EXISTS ([\w."]+)/gm)].map(match => qualified(match[1]))))
const migrationInsertTargets = new Set([...migrations.values()].flatMap(sql =>
  [...sql.matchAll(/^INSERT INTO ([\w."]+)/gm)].map(match => qualified(match[1]))))

test("local database commands are project-scoped and reproducible", () => {
  for (const command of ["db:doctor", "db:sync", "db:start", "db:stop", "db:reset", "db:status", "db:use-hosted"]) {
    assert.ok(rootPackage.scripts[command], `${command} script is present`)
  }
  assert.equal(rootPackage.devDependencies.supabase, "^2.117.0")
  assert.match(config, /\[db\.seed\][\s\S]*?enabled = false/)
  assert.match(config, /sql_paths = \["\.\/\.local\/seed\.sql"\]/)
})

test("production-derived local data cannot be committed accidentally", () => {
  assert.match(rootIgnore, /supabase\/\.local\//)
  for (const sensitive of [
    "ask_kaun_logs",
    "ward_reports",
    "community_facts",
    "fact_votes",
    "analytics_events",
    "civic_project_research_submissions",
    "civic_project_research_cache",
  ]) {
    assert.ok(privateTables.includes(`public.${sensitive}`), `${sensitive} stays out of local snapshots`)
  }
  assert.match(syncScript, /\[\.\.\.privateTables, \.\.\.migrationSeededTables\]/)
})

test("every excluded table exists in the migrated schema", () => {
  for (const table of [...privateTables, ...migrationSeededTables]) {
    assert.ok(createdTables.has(table), `${table} is created by a migration; a stale exclusion hides nothing`)
  }
})

test("rows inserted by migrations are never duplicated by the data seed", () => {
  assert.ok(migrationInsertTargets.size > 0)
  for (const table of migrationInsertTargets) {
    assert.ok(migrationSeededTables.includes(table), `${table} is seeded by a migration and excluded from db:sync`)
  }
})

test("hosted network restrictions are never managed from the local config", () => {
  // [db.network_restrictions] applies only to hosted projects via `supabase
  // config push`; it does not restrict the local Docker stack's port bindings.
  const section = config.match(/\[db\.network_restrictions\]([\s\S]*?)\n\[/)?.[1] ?? ""
  assert.match(section, /^enabled = false$/m)
  assert.doesNotMatch(section, /127\.0\.0\.1\/32|::1\/128/)
})

test("database credentials are not echoed in command failures or the process list", () => {
  assert.match(sharedScript, /\[REDACTED_DATABASE_URL\]/)
  assert.doesNotMatch(sharedScript, /`\$\{command\} \$\{args\.join/)
  assert.match(syncScript, /Session pooler URI/)
  assert.doesNotMatch(syncScript, /"--db-url", dbUrl\b/)
  assert.match(syncScript, /dbUrlWithoutPassword\.password = ""/)
  assert.match(syncScript, /PGPASSWORD = decodeURIComponent\(parsedDbUrl\.password\)/)
  assert.match(syncScript, /env: dumpEnv/)
})

test("an empty interrupted dump is not accepted as a schema snapshot", () => {
  assert.match(sharedScript, /statSync\(path\)\.size > 0/)
  assert.match(syncScript, /hasNonEmptyFile\(baseline\)/)
})

test("PostGIS is enabled before the remote schema baseline", () => {
  assert.match(postgisMigration, /CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public/i)
  assert.ok(migrationFiles.indexOf("20260504_enable_postgis.sql") < migrationFiles.indexOf(baselineName))
})

test("migrations replayed after the production baseline do not diverge from production", () => {
  const snapshot = migrations.get(baselineName)
  assert.ok(snapshot, "the baseline is a migration file")
  // Production keeps wards keyed by id; the superseded 20260506 PK swap must stay inert.
  assert.match(snapshot, /"wards_pkey" PRIMARY KEY \("id"\)/)
  assert.equal(stripSqlComments(migrations.get("20260506_multi_city_pin_lookup.sql")), "SELECT 1;")
  for (const name of afterBaseline) {
    assert.doesNotMatch(stripSqlComments(migrations.get(name)), /wards_pkey|DROP CONSTRAINT/i, name)
  }

  // 20260910 is already live, so its replay must be byte-identical to the dump.
  const body = (sql, signature) => {
    const start = sql.indexOf("$$", sql.search(signature)) + 2
    return sql.slice(start, sql.indexOf("$$", start)).replace(/\r\n/g, "\n").trim()
  }
  assert.equal(
    body(migrations.get("20260910_gba_independent_pin_lookup.sql"), /FUNCTION pin_lookup\(/),
    body(snapshot, /FUNCTION "public"\."pin_lookup"\(/),
  )
})

test("migrations after the baseline stay safe to replay on a refreshed baseline", () => {
  for (const name of afterBaseline) {
    const sql = stripSqlComments(migrations.get(name))
    assert.doesNotMatch(sql, /CREATE (?:TABLE|INDEX)(?! IF NOT EXISTS)/, `${name} creates idempotently`)
    assert.doesNotMatch(sql, /ADD COLUMN(?! IF NOT EXISTS)/, `${name} adds columns idempotently`)
    for (const [, policy] of sql.matchAll(/CREATE POLICY (\w+)/g)) {
      assert.match(sql, new RegExp(`DROP POLICY IF EXISTS ${policy}\\b`), `${name} recreates ${policy}`)
    }
    for (const insert of sql.match(/^INSERT INTO[\s\S]*?;/gm) ?? []) {
      assert.match(insert, /ON CONFLICT/, `${name} inserts idempotently`)
    }
  }
})

test("research submissions expose only public columns to anon, covering the app's read path", () => {
  const sql = migrations.get("20260915_civic_project_records.sql")
  assert.match(sql, /REVOKE ALL ON public\.civic_project_research_submissions FROM anon, authenticated;/)
  assert.match(sql, /REVOKE ALL ON public\.civic_project_research_cache FROM anon, authenticated;/)
  assert.doesNotMatch(sql, /GRANT SELECT ON public\.civic_project_research_submissions/)
  const grant = sql.match(/GRANT SELECT \(([^)]+)\)\s+ON public\.civic_project_research_submissions TO anon, authenticated;/)
  assert.ok(grant, "column-level grant is present")
  const granted = new Set(grant[1].split(",").map(column => column.trim()))
  for (const secret of ["review_note", "submitter_ip_hash", "question_key"]) {
    assert.ok(!granted.has(secret), `${secret} is not readable by anon`)
  }
  assert.ok(sql.indexOf("REVOKE ALL ON public.civic_project_research_submissions") < grant.index)

  const server = read("apps/web/lib/civic-projects-server.ts")
  const anonRead = server.slice(server.indexOf("fetchPublishedProjectResearch"))
  const select = anonRead.match(/select: "([^"]+)"/)[1].split(",")
  const order = anonRead.match(/order: "([^"]+)"/)[1].split(",").map(term => term.split(".")[0])
  const filters = [...anonRead.matchAll(/^\s*(\w+): `?"?eq\./gm)].map(match => match[1])
  assert.ok(filters.length > 0)
  for (const column of [...select, ...order, ...filters]) {
    assert.ok(granted.has(column), `anon read path uses ${column}, which must be granted`)
  }
})

test("every static civic project has a database row for research foreign keys", () => {
  const sql = migrations.get("20260915_civic_project_records.sql")
  const insert = sql.match(/^INSERT INTO public\.civic_projects[\s\S]*?;/m)?.[0] ?? ""
  for (const project of CIVIC_PROJECTS) {
    assert.match(insert, new RegExp(`'${project.slug}'`), `${project.slug} is seeded`)
  }
})

test("large civic seed bypasses the memory-heavy Supabase seed parser", () => {
  assert.match(localSeeder, /--single-transaction/)
  assert.match(localSeeder, /ON_ERROR_STOP=on/)
  assert.match(localSeeder, /kaun_local\.seed_state/)
})

test("switching environments backs up apps/web/.env.local before rewriting it", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "kaun-env-"))
  try {
    mkdirSync(join(sandbox, "apps/web"), { recursive: true })
    cpSync(fileURLToPath(new URL("../scripts/local-db/", import.meta.url)), join(sandbox, "scripts/local-db"), { recursive: true })
    const original = "OTHER=1\nNEXT_PUBLIC_SUPABASE_URL=https://example.test\nSUPABASE_SERVICE_ROLE_KEY=secret\n"
    writeFileSync(join(sandbox, "apps/web/.env.local"), original)

    const output = execFileSync(process.execPath, ["scripts/local-db/use-hosted.mjs"], { cwd: sandbox, encoding: "utf8" })
    assert.equal(readFileSync(join(sandbox, "apps/web/.env.local"), "utf8"), "OTHER=1\n")
    const backups = readdirSync(join(sandbox, "supabase/.local/env-backups"))
    assert.equal(backups.length, 1)
    const backup = join(sandbox, "supabase/.local/env-backups", backups[0])
    assert.equal(readFileSync(backup, "utf8"), original)
    assert.equal(statSync(backup).mode & 0o777, 0o600)
    assert.match(output, /supabase\/\.local\/env-backups\/web\.env\.local\./)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
  assert.match(read("scripts/local-db/write-web-env.mjs"), /backupWebEnv\(\)/)
})
