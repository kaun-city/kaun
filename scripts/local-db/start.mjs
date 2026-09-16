import { requireSnapshot, run } from "./shared.mjs"

requireSnapshot()
run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true })
run("supabase", ["start"])
run("node", ["scripts/local-db/seed-local.mjs"])
run("node", ["scripts/local-db/write-web-env.mjs"])
