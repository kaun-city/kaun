import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { backupWebEnv, webEnvFile } from "./shared.mjs"

if (!existsSync(webEnvFile)) {
  console.log("No apps/web/.env.local file exists; Kaun already uses its hosted defaults.")
  process.exit(0)
}

const managed = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
])
const lines = readFileSync(webEnvFile, "utf8").split(/\r?\n/).filter(Boolean)
const remaining = lines.filter(line => !managed.has(line.split("=", 1)[0]))

if (remaining.length !== lines.length) {
  backupWebEnv()
  if (remaining.length) writeFileSync(webEnvFile, `${remaining.join("\n")}\n`)
  else unlinkSync(webEnvFile)
}

console.log("Kaun will use hosted Supabase defaults after the Next.js dev server restarts.")
