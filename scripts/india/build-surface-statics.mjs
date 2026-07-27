#!/usr/bin/env node
/**
 * build-surface-statics.mjs — bake two committed data files into TypeScript
 * modules the Next app (and its middleware) can consult without a round trip.
 *
 * WHY BAKE ANYTHING AT ALL
 * ------------------------
 * Both consumers run BEFORE a page can be rendered, and both have to answer
 * from nothing but the URL:
 *
 *   OCMS merge redirects  apps/web/proxy.ts issues a 308 for the 708 project
 *                         URLs that PR #97 collapsed. Middleware is the only
 *                         place a Location header can still be set — by the
 *                         time a page component runs, a route with a
 *                         loading.tsx has already flushed its 200. A database
 *                         lookup there would put a Supabase round trip on the
 *                         hot path of every single request, so the decision
 *                         file ships as a map instead.
 *
 *   the 543 seat codes    apps/web/app/india/c/[pc_code]/layout.tsx rejects a
 *                         seat that cannot exist before the Suspense boundary
 *                         below it flushes a 200. That check has to cost
 *                         nothing, or the loading skeleton it sits in front of
 *                         stops being worth having.
 *
 * NEITHER OUTPUT IS EDITED BY HAND, AND NEITHER IS TRUSTED BLIND.
 * tests/india-surface-statics.test.mjs re-runs the generation in memory and
 * asserts the committed files are byte-identical, so a stale artifact fails
 * the suite rather than serving a wrong redirect. Regenerate with:
 *
 *   node scripts/india/build-surface-statics.mjs
 *
 * There is deliberately no prebuild hook: a generated file that is committed
 * and diffable is reviewable, and a Vercel build that silently regenerates one
 * is not.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseCsv } from "../lib/parsers.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

export const CROSSWALK_CSV = resolve(ROOT, "data/pc-crosswalk/india_pc_crosswalk.csv")
export const OCMS_MERGES_CSV = resolve(ROOT, "data/india/ocms-identity-merges.csv")
export const OUT_DIR = resolve(ROOT, "apps/web/lib/india/generated")
export const PC_CODES_TS = resolve(OUT_DIR, "pc-codes.ts")
export const OCMS_REDIRECTS_TS = resolve(OUT_DIR, "ocms-redirects.ts")

/** The prefix load-mospi-historical.mjs mints; mirrors SYNTHETIC_PREFIX in lib/india/api.ts. */
const SYNTHETIC_PREFIX = "ocms:"

/** Header row -> index map, so a column reorder in the CSV cannot silently shift a field. */
function columns(rows, file, required) {
  const header = rows[0] ?? []
  const idx = {}
  for (const name of required) {
    const i = header.indexOf(name)
    if (i === -1) throw new Error(`${file}: missing column "${name}"`)
    idx[name] = i
  }
  return idx
}

/**
 * The 543 canonical seat keys, sorted by (st_code, pc_no).
 *
 * Read from the crosswalk rather than derived from a seats-per-state count,
 * because pc_no is NOT contiguous within every state: Dadra & Nagar Haveli
 * (st_code 26) holds exactly one seat and it is numbered 2, not 1. A count map
 * would reject the real /c/26-2 and accept a /c/26-1 that does not exist.
 */
export function readPcCodes(path = CROSSWALK_CSV) {
  const rows = parseCsv(readFileSync(path, "utf8"))
  const idx = columns(rows, path, ["pc_code", "st_code", "pc_no"])
  const seen = new Set()
  const out = []
  for (const row of rows.slice(1)) {
    const code = row[idx.pc_code]
    const stCode = Number(row[idx.st_code])
    const pcNo = Number(row[idx.pc_no])
    if (!code) continue
    if (code !== `${stCode}-${pcNo}`) {
      throw new Error(`${path}: pc_code "${code}" disagrees with (st_code, pc_no) = (${stCode}, ${pcNo})`)
    }
    if (seen.has(code)) throw new Error(`${path}: duplicate pc_code "${code}"`)
    seen.add(code)
    out.push({ code, stCode, pcNo })
  }
  if (out.length !== 543) throw new Error(`${path}: expected 543 seats, found ${out.length}`)
  out.sort((a, b) => a.stCode - b.stCode || a.pcNo - b.pcNo)
  return out.map(r => r.code)
}

/**
 * legacy OCMS code -> surviving MoSPI project_code, from the reviewed decision
 * file that scripts/india/merge-ocms-identities.mjs executed.
 *
 * Keyed on the bare OCMS code because that is what the URL segment carries
 * after its "ocms:" prefix is stripped. Only rows whose synthetic twin is
 * genuinely gone belong here, which is exactly what the file records: a pair it
 * does not list was not merged, so its URL still resolves on its own.
 */
export function readOcmsRedirects(path = OCMS_MERGES_CSV) {
  const rows = parseCsv(readFileSync(path, "utf8"))
  const idx = columns(rows, path, ["legacy_ocms_code", "synthetic_project_code", "surviving_project_code"])
  const out = new Map()
  for (const row of rows.slice(1)) {
    const legacy = row[idx.legacy_ocms_code]
    const synthetic = row[idx.synthetic_project_code]
    const survivor = row[idx.surviving_project_code]
    if (!legacy) continue
    if (synthetic !== `${SYNTHETIC_PREFIX}${legacy}`) {
      throw new Error(`${path}: synthetic_project_code "${synthetic}" is not "${SYNTHETIC_PREFIX}${legacy}"`)
    }
    if (!survivor) throw new Error(`${path}: ${legacy} has no surviving_project_code`)
    // A survivor that is itself synthetic would redirect one dead URL to
    // another. The merge script never emits one; refuse rather than ship it.
    if (survivor.startsWith(SYNTHETIC_PREFIX)) {
      throw new Error(`${path}: ${legacy} survives as another synthetic code "${survivor}"`)
    }
    if (out.has(legacy)) throw new Error(`${path}: duplicate legacy_ocms_code "${legacy}"`)
    out.set(legacy, survivor)
  }
  if (out.size === 0) throw new Error(`${path}: no merge rows`)
  return out
}

const BANNER = (source, exportName) => `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source:     ${source}
 * Generator:  scripts/india/build-surface-statics.mjs
 * Drift test: tests/india-surface-statics.test.mjs
 *
 * ${exportName} is consulted before any page renders, so it cannot be a query.
 */
`

export function renderPcCodes(codes) {
  const body = codes.map(c => `  "${c}",`).join("\n")
  return `${BANNER("data/pc-crosswalk/india_pc_crosswalk.csv", "PC_CODES")}
/** Every Lok Sabha seat key that exists, sorted by (st_code, pc_no). */
export const PC_CODES: readonly string[] = [
${body}
]
`
}

export function renderOcmsRedirects(map) {
  const body = [...map.entries()].map(([k, v]) => `  "${k}": "${v}",`).join("\n")
  return `${BANNER("data/india/ocms-identity-merges.csv", "OCMS_MERGE_REDIRECTS")}
/** Bare legacy OCMS code -> the MoSPI project_code its snapshots moved to. */
export const OCMS_MERGE_REDIRECTS: Readonly<Record<string, string>> = {
${body}
}
`
}

function main() {
  const codes = readPcCodes()
  const redirects = readOcmsRedirects()
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(PC_CODES_TS, renderPcCodes(codes))
  writeFileSync(OCMS_REDIRECTS_TS, renderOcmsRedirects(redirects))
  console.log(`pc-codes.ts        ${codes.length} seats`)
  console.log(`ocms-redirects.ts  ${redirects.size} merged OCMS codes`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
