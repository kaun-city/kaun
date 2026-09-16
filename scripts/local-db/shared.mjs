import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
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

// Migrations that rewrite production rows, not only schema. Until production
// has run one, a freshly synced seed still holds the old rows, and those can
// violate what the migration adds: 20260917 adds a unique index that the
// 42,529 pre-dedup bmtc_stops rows break, and turns ward_bus_stops into a view
// the seed's ward_bus_stops rows cannot be copied into. So the seed load runs
// each `beforeSeed` statement, loads the seed, then replays the migration, all
// in the seed's single transaction. beforeSeed may only drop an index the
// replay recreates, or put back the table a replayed view replaces (with the
// baseline's columns). A replayed migration must be a no-op on rows it has
// already rewritten and must not contain BEGIN/COMMIT.
export const seedReplayedMigrations = [
  {
    file: "20260917_bmtc_stops_dedup.sql",
    beforeSeed: [
      "DROP INDEX IF EXISTS public.bmtc_stops_physical_key;",
      "DROP VIEW IF EXISTS public.ward_bus_stops;",
      "CREATE TABLE IF NOT EXISTS public.ward_bus_stops (ward_no integer NOT NULL PRIMARY KEY, stop_count integer, total_trips bigint);",
    ].join(" "),
  },
]

export const replayContainerPath = file => `/tmp/kaun-replay-${file}`

/**
 * psql arguments that load the seed and replay seed-replayed migrations as one
 * transaction: a failure anywhere leaves the freshly migrated, empty database.
 */
export function seedLoadArgs(containerSeed) {
  return [
    "--set", "ON_ERROR_STOP=on",
    "--single-transaction",
    ...seedReplayedMigrations.flatMap(({ beforeSeed }) => ["--command", beforeSeed]),
    "--file", containerSeed,
    // Data dumps set session_replication_role and an empty search_path.
    "--command", "RESET ALL;",
    ...seedReplayedMigrations.flatMap(({ file }) => ["--file", replayContainerPath(file)]),
  ]
}

export function hasNonEmptyFile(path) {
  return existsSync(path) && statSync(path).size > 0
}

/**
 * Restrict a file or directory to the current user.
 *
 * POSIX: mode bits (0600 files, 0700 directories). Windows ignores those bits,
 * so replace the inherited ACL with a single full-control grant for the
 * current account. Throws when the restriction cannot be applied, so a copy of
 * a service-role key is never left readable by other accounts.
 */
export function restrictToOwner(path, { platform = process.platform, env = process.env, spawn = spawnSync } = {}) {
  const isDirectory = statSync(path).isDirectory()
  if (platform !== "win32") {
    chmodSync(path, isDirectory ? 0o700 : 0o600)
    return
  }
  const account = env.USERNAME ? (env.USERDOMAIN ? `${env.USERDOMAIN}\\${env.USERNAME}` : env.USERNAME) : null
  if (!account) throw new Error(`Cannot restrict ${path}: USERNAME is not set`)
  const grant = isDirectory ? `${account}:(OI)(CI)F` : `${account}:F`
  const result = spawn("icacls", [path, "/inheritance:r", "/grant:r", grant], { encoding: "utf8", shell: false })
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? (result.stderr || result.stdout || `exit code ${result.status}`)
    throw new Error(`Cannot restrict ${path} to ${account}: ${String(detail).trim()}`)
  }
}

/**
 * Copy apps/web/.env.local to a timestamped, owner-only file under the
 * git-ignored supabase/.local/ before a script rewrites it, and say where.
 * If the copy cannot be made owner-only it is deleted and the rewrite stops.
 */
export function backupWebEnv({ restrict = restrictToOwner } = {}) {
  mkdirSync(webEnvBackupDir, { recursive: true, mode: 0o700 })
  restrict(webEnvBackupDir)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backup = resolve(webEnvBackupDir, `web.env.local.${stamp}`)
  // Created with 0600 so there is no window where POSIX readers can open it.
  writeFileSync(backup, readFileSync(webEnvFile), { flag: "wx", mode: 0o600 })
  try {
    restrict(backup)
  } catch (error) {
    rmSync(backup, { force: true })
    throw error
  }
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
