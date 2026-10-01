"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

/** Count navigation without cookies, visitor IDs, query strings, or locations. */
export default function PageActivity() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)
  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return
    lastPath.current = pathname
    if (pathname === "/status" || pathname.startsWith("/admin")) return
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "page_view" }),
      keepalive: true,
    }).catch(() => {})
  }, [pathname])
  return null
}
