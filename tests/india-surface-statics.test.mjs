/**
 * Unit tests for the two baked-in lookups the India surface answers URLs with
 * before it renders anything, and for the modules that read them.
 *
 * WHY THESE EXIST AT ALL. Both of the routes they serve have a loading.tsx.
 * A loading.tsx puts the page inside a Suspense boundary, and Next flushes the
 * shell — status line and headers — before the suspended body runs. Everything
 * a page component throws after that point is ignored: notFound() became a
 * soft 404 (the not-found body under HTTP 200) and permanentRedirect() emitted
 * no Location header at all. Measured on production 2026-07-27:
 *
 *   /c/99-999                    200   should be 404
 *   /projects/GARBAGE123         200   should be 404
 *   /projects/ocms:N24001693     200   should be 308 -> /projects/618581
 *
 * So the answers moved above the boundary: the seat list into a layout, the
 * merge redirects into middleware. Both had to become free of a round trip to
 * belong there, which is what the generated modules are for — and what makes a
 * drift test mandatory. A stale generated file here does not fail loudly; it
 * quietly 404s a real seat or forwards a reader to the wrong project.
 *
 * Run: node --test --experimental-strip-types tests/india-surface-statics.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  readPcCodes, readOcmsRedirects, renderPcCodes, renderOcmsRedirects,
  PC_CODES_TS, OCMS_REDIRECTS_TS,
} from "../scripts/india/build-surface-statics.mjs"
import { PC_CODES, isKnownSeat } from "../apps/web/lib/india/seats.ts"
import { OCMS_MERGE_REDIRECTS } from "../apps/web/lib/india/generated/ocms-redirects.ts"
import {
  mergedProjectPath, mergedProjectCode, survivingProjectCode, projectCodeFromParam,
} from "../apps/web/lib/india/merged-projects.ts"
import { isPcCode, parsePcCode } from "../apps/web/lib/india/pc-code.ts"
import { LOK_SABHA_SEATS } from "../apps/web/lib/india/constants.ts"

// ---------------------------------------------------------------------------
// 1. the drift guard — the whole reason a generated file is allowed to be
//    committed rather than built
// ---------------------------------------------------------------------------

test("the committed generated files are exactly what the generator emits today", () => {
  assert.equal(
    readFileSync(PC_CODES_TS, "utf8"), renderPcCodes(readPcCodes()),
    "apps/web/lib/india/generated/pc-codes.ts is stale — run node scripts/india/build-surface-statics.mjs")
  assert.equal(
    readFileSync(OCMS_REDIRECTS_TS, "utf8"), renderOcmsRedirects(readOcmsRedirects()),
    "apps/web/lib/india/generated/ocms-redirects.ts is stale — run node scripts/india/build-surface-statics.mjs")
})

// ---------------------------------------------------------------------------
// 2. the 543 seats
// ---------------------------------------------------------------------------

test("every Lok Sabha seat is present, exactly once, in delimitation order", () => {
  assert.equal(PC_CODES.length, LOK_SABHA_SEATS)
  assert.equal(new Set(PC_CODES).size, LOK_SABHA_SEATS, "duplicate seat key")
  for (const code of PC_CODES) assert.ok(isPcCode(code), `not a pc_code: ${code}`)

  const pairs = PC_CODES.map(parsePcCode)
  for (let i = 1; i < pairs.length; i++) {
    const a = pairs[i - 1], b = pairs[i]
    assert.ok(a.st_code < b.st_code || (a.st_code === b.st_code && a.pc_no < b.pc_no),
      `out of order at ${PC_CODES[i - 1]} -> ${PC_CODES[i]}`)
  }
})

test("the seat list is the crosswalk's, not a seats-per-state count", () => {
  // Dadra & Nagar Haveli (st_code 26) holds exactly one seat and it is
  // numbered 2. Any implementation that validates "pc_no <= seats in state"
  // rejects the real seat and accepts one that does not exist — which is why
  // the list is enumerated rather than derived.
  assert.ok(isKnownSeat("26-2"), "26-2 is a real seat")
  assert.equal(isKnownSeat("26-1"), false, "26-1 is not")
})

test("isKnownSeat rejects everything that is not one of the 543", () => {
  for (const good of ["29-25", "1-1", "9-80", "38-1", "36-17", "37-25"]) {
    assert.equal(isKnownSeat(good), true, good)
  }
  for (const bad of [
    "99-999",     // the production soft-404, and a state code that cannot exist
    "29-999",     // real state, seat number far past the end of it
    "29-29",      // real state, one seat past its 28
    "28-1",       // st_code 28 is old undivided Andhra; it has no seats
    "029-25",     // leading zeros are not canonical
    "29-0", "0-1", "-1", "29-", "-25", "29", "29-25-1", "29_25",
    "GARBAGE123", "", " ", "29-25 ", null, undefined,
  ]) {
    assert.equal(isKnownSeat(bad), false, `accepted ${JSON.stringify(bad)}`)
  }
})

test("isKnownSeat is strictly stronger than the shape test it backs up", () => {
  // isPcCode() is what the page had, and it is not enough: it passes 99-999.
  assert.equal(isPcCode("99-999"), true)
  assert.equal(isKnownSeat("99-999"), false)
  for (const code of PC_CODES) assert.equal(isPcCode(code), true, code)
})

// ---------------------------------------------------------------------------
// 3. the 708 merged OCMS identities
// ---------------------------------------------------------------------------

test("the redirect map is the committed decision file and nothing more", () => {
  const csv = readOcmsRedirects()
  assert.equal(csv.size, 708, "PR #97 collapsed 708 identities")
  assert.equal(Object.keys(OCMS_MERGE_REDIRECTS).length, csv.size)
  for (const [legacy, survivor] of csv) {
    assert.equal(OCMS_MERGE_REDIRECTS[legacy], survivor, legacy)
  }
})

test("no redirect ever lands on another synthetic code", () => {
  // A survivor beginning "ocms:" would forward one dead URL to a second one.
  for (const [legacy, survivor] of Object.entries(OCMS_MERGE_REDIRECTS)) {
    assert.ok(survivor && !survivor.startsWith("ocms:"), `${legacy} -> ${survivor}`)
    assert.match(survivor, /^\d+$/, `${legacy} -> ${survivor} is not a bare MoSPI code`)
  }
})

test("the OCMS codes with no unique survivor are absent, and stay absent", () => {
  // The merge left these 12 intact on purpose: each is one synthetic row whose
  // OCMS code is carried by two or more real project_codes, so there is no
  // survivor to pick and picking one would send a reader to the wrong project.
  // Their rows still exist and still render; the redirect layer must not touch
  // them. Enumerated from the live table on 2026-07-27, matching the count in
  // merge-ocms-identities.mjs.
  const ambiguous = [
    "N24000979", "N24000983", "N24000989", "N24001278", "N24001281", "N24001323",
    "N24001390", "N24001416", "N24001901", "N24001925", "N24002118", "N24002132",
  ]
  assert.equal(ambiguous.length, 12)
  for (const code of ambiguous) {
    assert.equal(survivingProjectCode(code), null, `${code} must not resolve`)
    assert.equal(mergedProjectCode(`ocms:${code}`), null, code)
    assert.equal(mergedProjectPath(`/india/projects/ocms:${code}`, false), null, code)
  }
})

test("mergedProjectCode only ever answers for a synthetic code", () => {
  assert.equal(mergedProjectCode("ocms:N24001693"), "618581")
  assert.equal(mergedProjectCode("618581"), null, "a real project is not a redirect")
  assert.equal(mergedProjectCode("ocms:"), null)
  assert.equal(mergedProjectCode("ocms:NOPE"), null)
  assert.equal(mergedProjectCode("OCMS:N24001693"), null, "the prefix is case-sensitive")
})

// ---------------------------------------------------------------------------
// 4. the path rule middleware runs
// ---------------------------------------------------------------------------

test("a merged project path forwards under the prefix the request used", () => {
  // Pre-cutover the India surface is /india/*; the bare /projects/ form only
  // becomes national once NEXT_PUBLIC_INDIA_ROOT=1, and must not be claimed
  // before then.
  assert.equal(mergedProjectPath("/india/projects/ocms:N24001693", false), "/india/projects/618581")
  assert.equal(mergedProjectPath("/india/projects/ocms:N24001693", true), "/india/projects/618581")
  assert.equal(mergedProjectPath("/projects/ocms:N24001693", true), "/projects/618581")
  assert.equal(mergedProjectPath("/projects/ocms:N24001693", false), null,
    "before the cutover /projects/* is not the India surface")
})

test("a percent-encoded colon is the same URL", () => {
  // Browsers and crawlers both emit ocms%3A for the same link.
  assert.equal(mergedProjectPath("/india/projects/ocms%3AN24001693", false), "/india/projects/618581")
  assert.equal(mergedProjectPath("/india/projects/ocms%3an24001693", false), null,
    "the code itself is case-sensitive")
})

test("nothing else on the site is matched", () => {
  const untouched = [
    "/", "/india", "/india/", "/india/c/29-25", "/c/29-25",
    "/india/projects", "/india/projects/", "/projects", "/projects/",
    "/how-it-works", "/data", "/admin", "/status", "/nonsense",
    "/api/health", "/api/data/wards", "/india-pc.geojson",
    // a real project, an unmerged synthetic one, and a garbage code all render
    "/india/projects/618581", "/india/projects/ocms:N28000132", "/india/projects/GARBAGE123",
    // not a single trailing segment, so not a project page
    "/india/projects/ocms:N24001693/history",
    // a stray % makes the segment undecodable rather than a code
    "/india/projects/%E0%A4",
  ]
  for (const pathname of untouched) {
    for (const indiaRoot of [false, true]) {
      assert.equal(mergedProjectPath(pathname, indiaRoot), null,
        `${pathname} indiaRoot=${indiaRoot}`)
    }
  }
})

// ---------------------------------------------------------------------------
// 5. the route param the pages actually receive
// ---------------------------------------------------------------------------

test("a route param is decoded before it is used as a project_code", () => {
  // Next hands [project_code] over percent-encoded. "ocms%3AN28000132" is not
  // a row, so every one of the 3,381 surviving synthetic project pages
  // rendered the not-found body — under a 200, because of the streamed shell.
  // Both halves of that had to be fixed or the redirect work would have turned
  // a soft 404 into a hard one for real, reachable projects.
  assert.equal(projectCodeFromParam("ocms%3AN28000132"), "ocms:N28000132")
  assert.equal(projectCodeFromParam("ocms:N28000132"), "ocms:N28000132", "already decoded is a no-op")
  assert.equal(projectCodeFromParam("618581"), "618581", "MoSPI's bare digits never encode")
  // An undecodable segment names no project either way; it must not throw.
  assert.equal(projectCodeFromParam("%E0%A4"), "%E0%A4")
  assert.equal(projectCodeFromParam("100%"), "100%")
})

test("the decoded param and the middleware agree on what a URL means", () => {
  // Both forms of the same merged link must resolve identically, whichever
  // layer sees them: middleware decodes the path segment, the page decodes the
  // param, and a disagreement would 308 one form and 404 the other.
  for (const param of ["ocms:N24001693", "ocms%3AN24001693"]) {
    assert.equal(mergedProjectCode(projectCodeFromParam(param)), "618581", param)
    assert.equal(mergedProjectPath(`/india/projects/${param}`, false), "/india/projects/618581", param)
  }
})

test("every forward target is itself a path the middleware leaves alone", () => {
  // A redirect that redirects again is a bug: the second hop would mean the
  // survivor is itself a merged code, or that the prefix was rewritten.
  for (const legacy of Object.keys(OCMS_MERGE_REDIRECTS)) {
    for (const [prefix, indiaRoot] of [["/india/projects/", false], ["/projects/", true]]) {
      const target = mergedProjectPath(`${prefix}ocms:${legacy}`, indiaRoot)
      assert.ok(target?.startsWith(prefix), `${legacy}: ${target}`)
      assert.equal(mergedProjectPath(target, indiaRoot), null, `${legacy} forwards twice`)
    }
  }
})
