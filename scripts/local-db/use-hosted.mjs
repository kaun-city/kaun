import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { root } from "./shared.mjs"

const target = resolve(root, "apps/web/.env.local")
if (!existsSync(target)) {
  console.log("No apps/web/.env.local file exists; Kaun already uses its hosted defaults.")
  process.exit(0)
}

const managed = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
])
const remaining = readFileSync(target, "utf8")
  .split(/\r?\n/)
  .filter(line => line && !managed.has(line.split("=", 1)[0]))

if (remaining.length) writeFileSync(target, `${remaining.join("\n")}\n`)
else unlinkSync(target)

console.log("Kaun will use hosted Supabase defaults after the Next.js dev server restarts.")
