import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Allow cross-origin requests to the datameet CDN for GeoJSON
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ]
  },
}

export default nextConfig
