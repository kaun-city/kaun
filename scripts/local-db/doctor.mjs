import { baseline, hasNonEmptyFile, localSeed, run } from "./shared.mjs"

let docker = false
try {
  const version = run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true }).trim()
  docker = Boolean(version)
  console.log(`OK Docker engine ${version}`)
} catch {
  console.log("MISSING Docker Desktop engine (Docker is installed, but the engine is not running)")
}

try {
  const version = run("supabase", ["--version"], { capture: true }).trim()
  console.log(`OK Supabase CLI ${version}`)
} catch {
  console.log("MISSING project Supabase CLI; run npm install")
}

const hasBaseline = hasNonEmptyFile(baseline)
const hasSeed = hasNonEmptyFile(localSeed)

console.log(`${hasBaseline ? "OK" : "MISSING"} schema baseline: ${baseline}`)
console.log(`${hasSeed ? "OK" : "MISSING"} private local seed: ${localSeed}`)

if (!docker || !hasBaseline || !hasSeed) process.exitCode = 1
