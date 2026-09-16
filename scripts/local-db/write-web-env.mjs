import { readFileSync, writeFileSync } from "node:fs"
import { backupWebEnv, run, webEnvFile } from "./shared.mjs"

const raw = run("supabase", ["status", "-o", "json"], { capture: true })
const status = JSON.parse(raw)
const apiUrl = status.API_URL ?? status.api_url
const anonKey = status.ANON_KEY ?? status.anon_key
const serviceKey = status.SERVICE_ROLE_KEY ?? status.service_role_key

if (!apiUrl || !anonKey || !serviceKey) {
  throw new Error("Supabase status did not return API_URL, ANON_KEY, and SERVICE_ROLE_KEY.")
}

let previous = null
try {
  previous = readFileSync(webEnvFile, "utf8")
} catch {}

const managed = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
])
const lines = (previous ?? "").split(/\r?\n/).filter(line => !managed.has(line.split("=", 1)[0]))
lines.push(
  `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
)
const next = `${lines.filter(Boolean).join("\n")}\n`

if (previous !== next) {
  if (previous !== null) backupWebEnv()
  writeFileSync(webEnvFile, next)
}
console.log("apps/web/.env.local now points at the local Supabase stack.")
console.log("Restart the Next.js dev server after switching environments.")
