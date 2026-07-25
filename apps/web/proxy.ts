import { NextResponse, type NextRequest } from "next/server"
import { resolveSurface } from "@/lib/host-routing"

/**
 * Host-based surface routing. All the logic lives in lib/host-routing.ts as
 * pure functions (tests/host-routing.test.mjs); this file only adapts it to
 * NextRequest/NextResponse.
 *
 * Named proxy.ts, not middleware.ts: Next 16 renamed the convention and warns
 * on every build about the old name.
 *
 *   kaun.city            national India layer  (only once NEXT_PUBLIC_INDIA_ROOT=1;
 *                                               until then, unchanged Bengaluru)
 *   bengaluru.kaun.city  the existing city UI
 *
 * The matcher below already excludes /api, /_next and static files, and
 * resolveSurface() refuses to touch them a second time — belt and braces,
 * because every cron, the wiki generator and the BNP export pipeline call
 * kaun.city/api/... and a rewrite there would break them silently.
 */
export default function proxy(req: NextRequest) {
  const url = req.nextUrl

  // ?host= is a dev affordance for testing subdomain routing without DNS.
  // Production ignores it, so a crafted link cannot steer anyone's routing.
  const devHost = process.env.VERCEL_ENV !== "production" ? url.searchParams.get("host") : null

  // Strip the override before anything downstream sees the query string, so it
  // never ends up baked into a 308 target or a shared link.
  const search = (() => {
    if (!devHost) return url.search
    const q = new URLSearchParams(url.search)
    q.delete("host")
    const s = q.toString()
    return s ? `?${s}` : ""
  })()

  const decision = resolveSurface({
    host: devHost || req.headers.get("host") || "",
    pathname: url.pathname,
    search,
    indiaRoot: process.env.NEXT_PUBLIC_INDIA_ROOT === "1",
    allowHostOverride: process.env.VERCEL_ENV !== "production",
  })

  if (decision.action === "redirect") {
    return NextResponse.redirect(decision.url, decision.status)
  }
  if (decision.action === "rewrite") {
    const target = url.clone()
    target.pathname = decision.path
    if (decision.search !== undefined) target.search = decision.search
    return NextResponse.rewrite(target)
  }
  return NextResponse.next()
}

export const config = {
  /**
   * Skip API routes, Next internals and any path with a file extension.
   * apps/web/public/india-pc.geojson is 1.4 MB and served on every India map
   * load — it must not pay for a middleware invocation.
   */
  matcher: ["/((?!api/|_next/|_vercel/|.*\\.[a-zA-Z0-9]+$).*)"],
}
