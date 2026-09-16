import { requireSnapshot, run } from "./shared.mjs"

requireSnapshot()
run("supabase", ["db", "reset", "--local"])
run("node", ["scripts/local-db/seed-local.mjs", "--force"])
run("node", ["scripts/local-db/write-web-env.mjs"])
