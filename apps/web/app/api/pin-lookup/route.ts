import { NextResponse } from "next/server"
import { publicSupabaseConfig } from "@/lib/supabase-config"

export const runtime = "nodejs"

type PinLookupRequest = { lat?: unknown; lng?: unknown }

function coordinates(body: unknown): { lat: number; lng: number } | null {
  if (!body || typeof body !== "object") return null
  const candidate = body as PinLookupRequest
  const lat = typeof candidate.lat === "number" ? candidate.lat : Number(candidate.lat)
  const lng = typeof candidate.lng === "number" ? candidate.lng : Number(candidate.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null
  }
  return { lat, lng }
}

/**
 * POST /api/pin-lookup
 *
 * Reverse-geocoding used to call Supabase directly from the browser. That made
 * a pin look outside Bengaluru whenever a visitor's DNS or ISP could not reach
 * the Supabase project hostname. Keep the database call server-side, where the
 * Vercel deployment has a stable network path.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 })
  }

  const point = coordinates(body)
  if (!point) return NextResponse.json({ error: "lat and lng must be valid coordinates" }, { status: 400 })

  const { url, anonKey } = publicSupabaseConfig()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? anonKey

  try {
    const response = await fetch(`${url}/rest/v1/rpc/pin_lookup`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(point),
      cache: "no-store",
    })
    if (!response.ok) return NextResponse.json({ error: "Pin lookup is unavailable" }, { status: 502 })
    return NextResponse.json(await response.json(), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ error: "Pin lookup is unavailable" }, { status: 502 })
  }
}
