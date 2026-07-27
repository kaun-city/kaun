import { notFound, permanentRedirect } from "next/navigation"
import { projectExists, resolveMergedProjectCode } from "@/lib/india/api"
import { projectCodeFromParam } from "@/lib/india/merged-projects"
import { indiaHref } from "@/lib/host-routing"

/**
 * The project gate — the only reason this layout exists.
 *
 * A loading.tsx wraps its whole subtree in a Suspense boundary, and Next
 * flushes the shell before the suspended body runs. Everything the page threw
 * after that point was therefore ignored: /projects/GARBAGE123 served the
 * not-found body under HTTP 200, and permanentRedirect() for a merged `ocms:`
 * code produced no Location header at all. A layout runs outside the boundary,
 * with nothing yet on the wire, so both work here.
 *
 * THIS FILE IS ONLY HALF THE FIX, AND THE OTHER HALF IS NOT IN THIS FOLDER.
 * There were TWO boundaries over this route: the segment's own loading.tsx,
 * and the tracker's, which sat at app/india/projects/loading.tsx and therefore
 * wrapped this subtree as well. The outer one flushed first, so this layout ran
 * and threw and was still answered with a 200. The tracker's skeleton has moved
 * into an app/india/projects/(tracker)/ route group — URL-invisible, same page,
 * same prefetch — so that it covers the page it was written for and nothing
 * else. Measured before and after on a clean build: 200 -> 404.
 *
 * WHY THIS ONE COSTS A QUERY WHEN THE SEAT GATE DOES NOT.
 * There are 543 seats and the list is committed, so /c/<seat> can be checked
 * for free. Project codes cannot: there are thousands, MoSPI adds and retires
 * them every month, and a shape test would only catch /projects/GARBAGE123
 * while still soft-404ing the well-formed /projects/999999 — which is the
 * case a crawler actually finds. So the gate is the identity read alone
 * (projectExists), one indexed lookup, and the page keeps the expensive part:
 * every monthly snapshot folded into a timeline, still below the boundary,
 * still covered by the #84/#88 skeleton. The shell waits on a primary-key
 * lookup, not on the page.
 *
 * THE REDIRECT HERE IS THE FALLBACK, NOT THE PRIMARY PATH.
 * proxy.ts already 308s the 708 merged codes from the committed decision file
 * before rendering starts (lib/india/merged-projects.ts). This catches a merge
 * that has been applied to the database but whose CSV has not been baked in
 * yet — the same query the page used to run, on the same miss path.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ project_code: string }>
}) {
  const { project_code } = await params
  // Next hands this over percent-encoded, so every `ocms:` code arrives as
  // `ocms%3A…` and matches nothing. See projectCodeFromParam.
  const code = projectCodeFromParam(project_code)

  if (!(await projectExists(code))) {
    const merged = await resolveMergedProjectCode(code)
    if (merged) permanentRedirect(indiaHref(`/projects/${merged}`))
    notFound()
  }

  return children
}
