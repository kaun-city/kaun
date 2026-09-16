import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const rootPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
const rootIgnore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8")
const syncScript = readFileSync(new URL("../scripts/local-db/sync-remote.mjs", import.meta.url), "utf8")
const sharedScript = readFileSync(new URL("../scripts/local-db/shared.mjs", import.meta.url), "utf8")
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8")
const postgisMigration = readFileSync(
  new URL("../supabase/migrations/20260504_enable_postgis.sql", import.meta.url),
  "utf8",
)
const localSeeder = readFileSync(new URL("../scripts/local-db/seed-local.mjs", import.meta.url), "utf8")

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
    "civic_project_research_submissions",
  ]) {
    assert.match(syncScript, new RegExp(`public\\.${sensitive}`))
  }
})

test("the local database is restricted to loopback clients", () => {
  assert.match(config, /allowed_cidrs = \["127\.0\.0\.1\/32"\]/)
  assert.match(config, /allowed_cidrs_v6 = \["::1\/128"\]/)
})

test("database credentials are not echoed in command failures", () => {
  assert.match(sharedScript, /\[REDACTED_DATABASE_URL\]/)
  assert.doesNotMatch(sharedScript, /`\$\{command\} \$\{args\.join/)
  assert.match(syncScript, /Session pooler URI/)
})

test("an empty interrupted dump is not accepted as a schema snapshot", () => {
  assert.match(sharedScript, /statSync\(path\)\.size > 0/)
  assert.match(syncScript, /hasNonEmptyFile\(baseline\)/)
})

test("PostGIS is enabled before the remote schema baseline", () => {
  assert.match(postgisMigration, /CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public/i)
})

test("large civic seed bypasses the memory-heavy Supabase seed parser", () => {
  assert.match(localSeeder, /--single-transaction/)
  assert.match(localSeeder, /ON_ERROR_STOP=on/)
  assert.match(localSeeder, /kaun_local\.seed_state/)
})
