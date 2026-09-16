/**
 * Create/update Kaun's local Supabase clone from the hosted PostgreSQL DB.
 *
 * Required: KAUN_REMOTE_DB_URL (a percent-encoded Supabase connection string).
 * Data is written under supabase/.local/ and is deliberately git-ignored.
 * The schema baseline is created once, before Kaun's incremental migrations.
 */
import { mkdirSync } from "node:fs"
import { baseline, hasNonEmptyFile, localDir, localSeed, run } from "./shared.mjs"

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

mkdirSync(localDir, { recursive: true })

const hasSchemaBaseline = hasNonEmptyFile(baseline)

if (!hasSchemaBaseline || refreshSchema) {
  console.log(`${hasSchemaBaseline ? "Refreshing" : "Creating"} schema baseline...`)
  run("supabase", [
    "db", "dump",
    "--db-url", dbUrl,
    "--schema", "public",
    "--file", baseline,
  ])
} else {
  console.log("Keeping the committed schema baseline; incremental migrations remain authoritative.")
  console.log("Pass --refresh-schema only when intentionally rebasing the local clone.")
}

if (schemaOnly) {
  console.log("Schema-only sync complete.")
  process.exit(0)
}

// Public civic source tables are copied. User questions, precise report
// locations, moderation queues, and research submissions stay out of local
// snapshots by default even when they live in the public schema.
const excluded = [
  "public.ask_kaun_logs",
  "public.ward_reports",
  "public.community_facts",
  "public.civic_project_research_submissions",
  "public.civic_project_research_events",
  "public.analytics_events",
  "public.rate_limits",
].join(",")

console.log("Refreshing the git-ignored, privacy-filtered local data seed...")
run("supabase", [
  "db", "dump",
  "--db-url", dbUrl,
  "--data-only",
  "--use-copy",
  "--schema", "public",
  "--exclude", excluded,
  "--file", localSeed,
])

console.log("Snapshot complete. Start Docker Desktop, then run npm run db:start.")
