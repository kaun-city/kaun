import type { NextConfig } from "next"

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
const IMMUTABLE_ASSETS = ["/india-pc.geojson", "/bengaluru-ward-crosswalk.json"]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
      ...IMMUTABLE_ASSETS.map(source => ({
        source,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      })),
    ]
  },
}

export default nextConfig
