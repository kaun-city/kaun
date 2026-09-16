import { localSeed, requireSnapshot, run } from "./shared.mjs"

const container = "supabase_db_kaun"
const containerSeed = "/tmp/kaun-local-seed.sql"
const force = process.argv.includes("--force")

const alreadySeeded = run("docker", [
  "exec",
  container,
  "psql",
  "--username", "postgres",
  "--dbname", "postgres",
  "--tuples-only",
  "--no-align",
  "--command", "SELECT to_regclass('kaun_local.seed_state') IS NOT NULL;",
], { capture: true }).trim() === "t"

if (alreadySeeded && !force) {
  console.log("Local civic-data seed is already loaded.")
  process.exit(0)
}

requireSnapshot()
console.log("Copying the local civic-data seed into PostgreSQL...")
run("docker", ["cp", localSeed, `${container}:${containerSeed}`])

console.log("Loading the local civic-data seed with bounded memory...")
run("docker", [
  "exec",
  container,
  "psql",
  "--username", "postgres",
  "--dbname", "postgres",
  "--set", "ON_ERROR_STOP=on",
  "--single-transaction",
  "--file", containerSeed,
])

run("docker", [
  "exec",
  container,
  "psql",
  "--username", "postgres",
  "--dbname", "postgres",
  "--set", "ON_ERROR_STOP=on",
  "--command",
  "CREATE SCHEMA IF NOT EXISTS kaun_local; CREATE TABLE IF NOT EXISTS kaun_local.seed_state (loaded_at timestamptz NOT NULL DEFAULT now()); TRUNCATE kaun_local.seed_state; INSERT INTO kaun_local.seed_state DEFAULT VALUES;",
])

// The container and this exact temporary path are local and disposable.
run("docker", ["exec", container, "unlink", containerSeed])
console.log("Local civic-data seed loaded.")
