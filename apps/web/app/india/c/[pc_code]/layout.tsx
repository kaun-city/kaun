import { notFound } from "next/navigation"
import { isKnownSeat } from "@/lib/india/seats"

/**
 * The seat gate — and the only reason this layout exists.
 *
 * loading.tsx in this segment wraps page.tsx in a Suspense boundary, and Next
 * flushes the shell (status line, headers, the skeleton) before the suspended
 * body runs. A notFound() thrown by the page therefore arrives after 200 OK
 * has gone out: /c/99-999 served the not-found body under an HTTP 200 on
 * production. Search engines index that as a real page and anything reading
 * Kaun programmatically is told a seat exists when it does not.
 *
 * A layout is OUTSIDE that boundary. Nothing has been flushed when it runs, so
 * notFound() here is a real 404 — which is what makes this file worth the extra
 * nesting level.
 *
 * IT IS ALSO WHY THE SKELETON SURVIVES. The obvious alternative — hoisting
 * fetchConstituencyProfile() up here — would make the shell wait on Supabase
 * and there would be nothing left for loading.tsx to cover. isKnownSeat() is a
 * Set lookup over 543 committed strings (lib/india/seats.ts): no await, no
 * round trip, no measurable delay before the skeleton paints. The skeletons
 * from #84/#88 are untouched.
 *
 * The page keeps its own notFound() for the case this cannot see — a seat that
 * exists in the delimitation but has no row yet, e.g. under fixture mode. That
 * one still streams, and is a soft 404 in exactly the configuration where
 * nobody is crawling.
 */
export default async function ConstituencyLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ pc_code: string }>
}) {
  const { pc_code } = await params
  if (!isKnownSeat(pc_code)) notFound()
  return children
}
