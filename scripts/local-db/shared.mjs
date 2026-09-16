import { spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"

export const root = resolve(import.meta.dirname, "../..")
export const baseline = resolve(root, "supabase/migrations/20260505_remote_schema.sql")
export const localDir = resolve(root, "supabase/.local")
export const localSeed = resolve(localDir, "seed.sql")

export function hasNonEmptyFile(path) {
  return existsSync(path) && statSync(path).size > 0
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
