import type { NextConfig } from "next"
import { DB_PROXY_PATH, publicSupabaseConfig } from "./lib/supabase-config"

/**
 * The two committed map assets are the largest things Kaun serves and the
 * slowest-changing: 1.4 MB of parliamentary constituency outlines that move
 * when a delimitation does, and 156 KB of ward crosswalk that moves when the
 * crosswalk is rebuilt. Both are otherwise served with `max-age=0,
 * must-revalidate`, so every visitor pays a round trip to be told nothing has
 * changed — and on the India map that round trip is in front of the map
 * drawing at all.
 *
 * They are safe to freeze for a year because neither is fetched by its bare
 * path: both call sites append the asset's own declared version as a query
 * parameter (PC_GEOJSON_URL in lib/india/constants.ts, WARD_CROSSWALK_URL in
 * lib/constants.ts), and both versions are asserted against the files
 * themselves in the test suite. Regenerate an asset without bumping its
 * version and the tests fail before anyone can be served a stale year.
 *
 * `source` matches the pathname only, so the versioned URLs are covered.
 */
const IMMUTABLE_ASSETS = [
  "/india-pc.geojson",
  "/bengaluru-ward-crosswalk.json",
  "/bengaluru-gba-369-to-datameet-243.json",
  "/bengaluru-bbmp-198-to-datameet-243.json",
]
const BUILD_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local"
const BUILD_REF = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.GITHUB_REF_NAME ?? "local"
const BUILD_TIME = new Date().toISOString()

/**
 * Browser reads and writes reach Supabase through kaun.city (see DB_PROXY_PATH
 * in lib/supabase-config.ts): some Indian networks cannot connect to
 * *.supabase.co. A rewrite to an external origin is proxied by Vercel's edge,
 * so no function runs and methods, bodies and the apikey/Authorization/Prefer
 * headers pass through. Only PostgREST and public Storage objects (report
 * photos) are exposed, exactly what the anon key could already reach.
 */
const SUPABASE_UPSTREAM = publicSupabaseConfig().url

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  env: {
    NEXT_PUBLIC_KAUN_BUILD_SHA: BUILD_SHA,
    NEXT_PUBLIC_KAUN_BUILD_REF: BUILD_REF,
    NEXT_PUBLIC_KAUN_BUILD_TIME: BUILD_TIME,
  },
  async rewrites() {
    return [
      { source: `${DB_PROXY_PATH}/rest/v1/:path*`, destination: `${SUPABASE_UPSTREAM}/rest/v1/:path*` },
      { source: `${DB_PROXY_PATH}/storage/v1/object/public/:path*`, destination: `${SUPABASE_UPSTREAM}/storage/v1/object/public/:path*` },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
      // Live rows, never a shared cache: PostgREST sends no Cache-Control, and
      // this keeps the edge and the browser from inventing one.
      {
        source: `${DB_PROXY_PATH}/rest/v1/:path*`,
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      ...IMMUTABLE_ASSETS.map(source => ({
        source,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      })),
    ]
  },
}

export default nextConfig
