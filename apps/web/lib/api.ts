import type { PinResult } from "./types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

/**
 * Call the backend /pin endpoint.
 * Returns null if the backend is unreachable — callers should degrade gracefully.
 */
export async function dropPin(
  lat: number,
  lng: number,
  cityId = "bengaluru",
  issueType?: string
): Promise<PinResult | null> {
  try {
    const res = await fetch(`${API_URL}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, city_id: cityId, issue_type: issueType ?? null }),
    })

    if (!res.ok) return null
    return (await res.json()) as PinResult
  } catch {
    // Backend offline — caller falls back to GeoJSON properties
    return null
  }
}
