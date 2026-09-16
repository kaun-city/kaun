/**
 * Create/update Kaun's local Supabase clone from the hosted PostgreSQL DB.
 *
 * Required: KAUN_REMOTE_DB_URL (a percent-encoded Supabase connection string).
 * Data is written under supabase/.local/ and is deliberately git-ignored.
 * The schema baseline is created once, before Kaun's incremental migrations.
 */
import { mkdirSync } from "node:fs"
import {
  baseline,
  hasNonEmptyFile,
  localDir,
  localSeed,
  migrationSeededTables,
  privateTables,
  run,
} from "./shared.mjs"

const dbUrl = process.env.KAUN_REMOTE_DB_URL
const schemaOnly = process.argv.includes("--schema-only")
const refreshSchema = process.argv.includes("--refresh-schema")

if (!dbUrl) {
  console.error("Set KAUN_REMOTE_DB_URL to the hosted Supabase Postgres connection string.")
  console.error("Use the Dashboard connection string and percent-encode special characters in its password.")
  process.exit(1)
}

if (/YOUR[-_ ]?(?:ACTUAL|PASSWORD)|\[YOUR-PASSWORD\]/i.test(dbUrl)) {
  console.error("KAUN_REMOTE_DB_URL still contains a placeholder. Replace it with the real connection string.")
  process.exit(1)
}

let parsedDbUrl
try {
  parsedDbUrl = new URL(dbUrl)
} catch {
  console.error("KAUN_REMOTE_DB_URL is not a valid PostgreSQL connection string.")
  process.exit(1)
}

if (!/^postgres(?:ql)?:$/.test(parsedDbUrl.protocol)) {
  console.error("KAUN_REMOTE_DB_URL must start with postgres:// or postgresql://.")
  process.exit(1)
}

if (/^db\.[^.]+\.supabase\.co$/i.test(parsedDbUrl.hostname)) {
  console.warn("Using Supabase's direct database hostname, which requires IPv6 connectivity.")
  console.warn("If hostname lookup fails, copy the Session pooler URI from Dashboard > Connect instead.")
}

// Keep the password out of the process list: the Supabase CLI resolves a
// password-less --db-url with PGPASSWORD from its environment (libpq rules).
const { KAUN_REMOTE_DB_URL: _remoteUrl, ...dumpEnv } = process.env
if (parsedDbUrl.password) {
  try {
    dumpEnv.PGPASSWORD = decodeURIComponent(parsedDbUrl.password)
  } catch {
    console.error("KAUN_REMOTE_DB_URL has an invalid percent-encoded password.")
    process.exit(1)
  }
}
const dbUrlWithoutPassword = new URL(parsedDbUrl)
dbUrlWithoutPassword.password = ""
const connectionArgs = ["--db-url", dbUrlWithoutPassword.toString()]

mkdirSync(localDir, { recursive: true })

const hasSchemaBaseline = hasNonEmptyFile(baseline)

if (!hasSchemaBaseline || refreshSchema) {
  console.log(`${hasSchemaBaseline ? "Refreshing" : "Creating"} schema baseline...`)
  run("supabase", [
    "db", "dump",
    ...connectionArgs,
    "--schema", "public",
    "--file", baseline,
  ], { env: dumpEnv })
} else {
  console.log("Keeping the committed schema baseline; incremental migrations remain authoritative.")
  console.log("Pass --refresh-schema only when intentionally rebasing the local clone.")
}

if (schemaOnly) {
  console.log("Schema-only sync complete.")
  process.exit(0)
}

// Public civic source tables are copied. Private tables stay out of local
// snapshots even though they live in the public schema, and migration-seeded
// tables are left to the migrations so the seed cannot collide with them.
const excluded = [...privateTables, ...migrationSeededTables].join(",")

console.log("Refreshing the git-ignored, privacy-filtered local data seed...")
run("supabase", [
  "db", "dump",
  ...connectionArgs,
  "--data-only",
  "--use-copy",
  "--schema", "public",
  "--exclude", excluded,
  "--file", localSeed,
], { env: dumpEnv })

console.log("Snapshot complete. Start Docker Desktop, then run npm run db:start.")
