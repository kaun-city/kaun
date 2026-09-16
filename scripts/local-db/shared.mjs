import { spawnSync } from "node:child_process"
import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"

export const root = resolve(import.meta.dirname, "../..")
export const baseline = resolve(root, "supabase/migrations/20260505_remote_schema.sql")
export const localDir = resolve(root, "supabase/.local")
export const localSeed = resolve(localDir, "seed.sql")
export const webEnvFile = resolve(root, "apps/web/.env.local")
export const webEnvBackupDir = resolve(localDir, "env-backups")

// Tables never copied into local data snapshots: user questions, precise
// report locations, contributor/voter tokens, analytics, and research
// submissions with their moderation notes and submitter IP hashes.
export const privateTables = [
  "public.ask_kaun_logs",
  "public.ward_reports",
  "public.community_facts",
  "public.fact_votes",
  "public.analytics_events",
  "public.civic_project_research_submissions",
  "public.civic_project_research_cache",
]

// Tables whose rows are inserted by migrations. `supabase db reset` already
// creates these rows, so copying production's copies into the seed would abort
// the single-transaction seed load on duplicate keys.
export const migrationSeededTables = [
  "public.civic_projects",
  "public.civic_project_areas",
]

export function hasNonEmptyFile(path) {
  return existsSync(path) && statSync(path).size > 0
}

/**
 * Copy apps/web/.env.local to a timestamped, owner-only file under the
 * git-ignored supabase/.local/ before a script rewrites it, and say where.
 */
export function backupWebEnv() {
  mkdirSync(webEnvBackupDir, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backup = resolve(webEnvBackupDir, `web.env.local.${stamp}`)
  copyFileSync(webEnvFile, backup, constants.COPYFILE_EXCL)
  chmodSync(backup, 0o600)
  console.log(`Backed up the previous apps/web/.env.local to ${relative(root, backup)}`)
  return backup
}

function redactSensitiveArgs(args) {
  const redacted = [...args]
  for (let index = 0; index < redacted.length; index += 1) {
    if (redacted[index] === "--db-url" && index + 1 < redacted.length) {
      redacted[index + 1] = "[REDACTED_DATABASE_URL]"
      index += 1
    }
  }
  return redacted
}

export function run(command, args, options = {}) {
  const isSupabase = command === "supabase"
  const executable = isSupabase ? process.execPath : command
  const executableArgs = isSupabase
    ? [resolve(root, "node_modules/supabase/dist/supabase.js"), ...args]
    : args
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    shell: false,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : ""
    const safeArgs = redactSensitiveArgs(args)
    throw new Error(`${command} ${safeArgs.join(" ")} failed with exit code ${result.status}${detail}`)
  }
  return result.stdout ?? ""
}

export function requireSnapshot() {
  const missing = []
  if (!hasNonEmptyFile(baseline)) missing.push("schema baseline")
  if (!hasNonEmptyFile(localSeed)) missing.push("local data seed")
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(" and ")}. Run npm run db:sync after setting KAUN_REMOTE_DB_URL.`,
    )
  }
}
