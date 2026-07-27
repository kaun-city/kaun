/**
 * merged-projects.ts — where the 708 collapsed `ocms:` project URLs went.
 *
 * PR #97 (scripts/india/merge-ocms-identities.mjs) deleted 708 synthetic
 * `ocms:<CODE>` rows that were a second copy of a project already holding a
 * real MoSPI project_code. Those URLs were served, they render in caches and
 * they can have been linked or crawled, so each one owes its visitor a
 * permanent forward to the project it always meant.
 *
 * WHY THE FORWARD IS ISSUED IN MIDDLEWARE AND NOT IN THE PAGE
 * -----------------------------------------------------------
 * The page already tries: permanentRedirect(), on the 404 path, in
 * app/india/projects/[project_code]/page.tsx. It never worked in production.
 * That route has a loading.tsx, so the page body renders inside a Suspense
 * boundary and Next has already flushed the shell — 200 OK, headers sent — by
 * the time the redirect throws. The Location header has nowhere to go.
 * Measured against kaun.city: `/projects/ocms:N24001693` returned 200 with the
 * not-found body and no Location at all.
 *
 * proxy.ts runs before rendering starts, so a redirect there is a real one.
 *
 * WHY THE MAP IS BAKED IN AND NOT QUERIED
 * ---------------------------------------
 * Middleware runs on every request that is not an asset or an /api route.
 * A Supabase lookup there would put a network round trip in front of the map,
 * the tracker and every seat page, to answer a question about 708 URLs whose
 * answers were decided by hand and committed. The decision file is the
 * authority; scripts/india/build-surface-statics.mjs bakes it into
 * generated/ocms-redirects.ts and a test asserts the two never drift.
 *
 * WHAT IS DELIBERATELY NOT REDIRECTED
 * -----------------------------------
 * Only codes in the committed file. The 12 OCMS codes whose synthetic row is
 * held by two or more real project_codes have no unique survivor, were left
 * intact by the merge, and are absent here — they fall through to the normal
 * render, which is right whether the row still exists (200) or not (404).
 * Guessing a survivor for them would send a reader to the wrong project, which
 * is worse than either.
 */
import { OCMS_MERGE_REDIRECTS } from "./generated/ocms-redirects.ts"

/** Mirrors SYNTHETIC_PREFIX in lib/india/api.ts — MoSPI's own codes are bare digits. */
export const SYNTHETIC_PREFIX = "ocms:"

/**
 * The two path prefixes a project page is served under. Pre-cutover the India
 * surface lives at /india/*; after NEXT_PUBLIC_INDIA_ROOT=1 the root domain
 * serves /projects/* too (see NATIONAL_ROOT_PREFIXES in host-routing.ts).
 */
const PROJECT_PREFIXES = ["/india/projects/", "/projects/"] as const

/** The surviving project_code for a bare legacy OCMS code, or null. */
export function survivingProjectCode(ocmsCode: string): string | null {
  return Object.prototype.hasOwnProperty.call(OCMS_MERGE_REDIRECTS, ocmsCode)
    ? OCMS_MERGE_REDIRECTS[ocmsCode]
    : null
}

/**
 * The surviving project_code for a full `ocms:<CODE>` project_code, or null.
 * Anything that is not a synthetic code resolves to null — a real project is
 * not a redirect.
 */
export function mergedProjectCode(projectCode: string): string | null {
  if (!projectCode.startsWith(SYNTHETIC_PREFIX)) return null
  const ocms = projectCode.slice(SYNTHETIC_PREFIX.length)
  return ocms ? survivingProjectCode(ocms) : null
}

/** A path segment as written in the URL, decoded; null if it is not decodable. */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    // A stray "%" is not a project code, and decodeURIComponent throws on it.
    return null
  }
}

/**
 * The project_code a [project_code] route param actually names.
 *
 * NEXT HANDS THE SEGMENT OVER STILL PERCENT-ENCODED. A request for
 * /projects/ocms:N28000132 arrives in the page as `ocms%3AN28000132`, and
 * "ocms%3AN28000132" is not a row in in_central_projects. Every synthetic
 * project page — 3,381 of them, the historical MoSPI projects that completed
 * before the modern ongoing list and legitimately have no other identity — has
 * therefore rendered the not-found body since the day it shipped, under an
 * HTTP 200 because of the same streamed-shell bug. Verified on production
 * 2026-07-27: /projects/ocms:N28000132 answers 200 with the generic India
 * title and no project in it.
 *
 * MoSPI's own codes are bare digits and survive the round trip unchanged,
 * which is why the tracker and every link off it always looked fine.
 *
 * An undecodable segment (a stray "%") is returned as it arrived: it names no
 * project either way, and the caller turns that into a 404.
 */
export function projectCodeFromParam(param: string): string {
  return decodeSegment(param) ?? param
}

/**
 * The path a request for a merged project URL should be forwarded to, or null
 * when this path is not one.
 *
 * The prefix the request used is preserved, so the forward is correct in both
 * modes and never names a host: /india/projects/ocms:X -> /india/projects/<s>,
 * /projects/ocms:X -> /projects/<s>. `indiaRoot` gates the bare /projects/
 * form, because before the cutover that path is not the India surface's.
 *
 * Only a single trailing segment matches; /india/projects/ocms:X/anything is
 * not a project page and is left alone.
 */
export function mergedProjectPath(pathname: string, indiaRoot: boolean): string | null {
  for (const prefix of PROJECT_PREFIXES) {
    if (prefix === "/projects/" && !indiaRoot) continue
    if (!pathname.startsWith(prefix)) continue
    const segment = pathname.slice(prefix.length)
    if (!segment || segment.includes("/")) return null
    const code = decodeSegment(segment)
    if (code === null) return null
    const survivor = mergedProjectCode(code)
    return survivor ? `${prefix}${survivor}` : null
  }
  return null
}
