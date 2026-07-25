/**
 * cli.mjs — argument parsing shared by the India loaders.
 *
 * Deliberately tiny and dependency-free (the repo has no node_modules for
 * scripts/). The only thing worth centralising is `--apply`, because the whole
 * safety story of this directory rests on it meaning exactly one thing
 * everywhere: "you may write".
 */

import { pathToFileURL } from "url"

/** Presence flag: --backfill, --apply, … */
export function flag(name, argv = process.argv) {
  return argv.includes(`--${name}`)
}

/** Valued option: --month 2026-05, --state 16, --limit 25. */
export function opt(name, fallback = null, argv = process.argv) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1 || i === argv.length - 1) return fallback
  const v = argv[i + 1]
  return v.startsWith("--") ? fallback : v
}

export function intOpt(name, fallback = null, argv = process.argv) {
  const v = opt(name, null, argv)
  if (v === null) return fallback
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n)) throw new Error(`--${name} expects an integer, got ${v}`)
  return n
}

/** Every loader starts the same way, and says so out loud. */
export function banner(loader, extra = {}) {
  const apply = flag("apply")
  console.log(`\n${loader} — ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`)
  for (const [k, v] of Object.entries(extra)) console.log(`  ${k}: ${v}`)
  return apply
}

/**
 * Standard top-level error handler: never leave a non-zero-exit ambiguity.
 *
 * `moduleUrl` (pass import.meta.url) makes the loader a no-op when it is
 * IMPORTED rather than executed — which is what lets the unit tests import a
 * loader's pure transforms without the loader going off and hitting a live
 * government API on `node --test`.
 */
export function run(main, moduleUrl) {
  if (moduleUrl && !isEntryPoint(moduleUrl)) return
  main().catch(e => {
    console.error(`\nFAILED: ${e.message}`)
    if (process.env.KAUN_DEBUG) console.error(e.stack)
    process.exit(1)
  })
}

export function isEntryPoint(moduleUrl) {
  if (!process.argv[1]) return false
  return pathToFileURL(process.argv[1]).href === moduleUrl
}
