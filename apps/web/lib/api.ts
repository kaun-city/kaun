import type { CommunityFact, PinResult, RedditPost, WardProfile } from "./types"

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

/**
 * Fetch the full accountability profile for a ward: elected reps, officers, tenders.
 * Returns null on error — caller degrades gracefully.
 */
export async function fetchWardProfile(
  wardNo: number,
  cityId = "bengaluru",
  assemblyConstituency?: string
): Promise<WardProfile | null> {
  try {
    const params = new URLSearchParams({ ward_no: String(wardNo), city_id: cityId })
    if (assemblyConstituency) params.set("assembly_constituency", assemblyConstituency)
    const res = await fetch(`${API_URL}/ward-profile?${params}`)
    if (!res.ok) return null
    return (await res.json()) as WardProfile
  } catch {
    return null
  }
}

/**
 * Submit a community fact.
 */
export async function submitFact(payload: {
  city_id?: string
  ward_no: number
  category: string
  subject: string
  field: string
  value: string
  source_type?: string
  source_note?: string
  contributor_token?: string
}): Promise<{ ok: boolean; fact: CommunityFact; is_duplicate: boolean } | null> {
  try {
    const res = await fetch(`${API_URL}/community/facts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city_id: "bengaluru", source_type: "community", ...payload }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Corroborate (+) or dispute a community fact.
 */
export async function voteFact(
  factId: number,
  voteType: "corroborate" | "dispute",
  voterToken: string
): Promise<{ ok: boolean; corroboration_count: number; trust_level: string; already_voted: boolean } | null> {
  try {
    const res = await fetch(`${API_URL}/community/facts/${factId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote_type: voteType, voter_token: voterToken }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Fetch recent r/bangalore posts mentioning a ward or area name.
 * Fetches directly from Reddit's public JSON API (browser-side, no CORS issues).
 * Falls back gracefully — never throws, never blocks the UI.
 */
export async function fetchBuzz(wardName: string): Promise<RedditPost[]> {
  try {
    const params = new URLSearchParams({
      q: wardName,
      sort: "new",
      limit: "5",
      restrict_sr: "1",
      t: "year",
    })
    const res = await fetch(
      `https://www.reddit.com/r/bangalore/search.json?${params}`,
      { headers: { Accept: "application/json" } }
    )
    if (!res.ok) return []
    const json = await res.json()
    const children = json?.data?.children ?? []
    return children.map((c: Record<string, Record<string, unknown>>) => ({
      title: c.data.title as string,
      url: `https://reddit.com${c.data.permalink}`,
      score: c.data.score as number,
      num_comments: c.data.num_comments as number,
      created_utc: c.data.created_utc as number,
      author: c.data.author as string,
      flair: (c.data.link_flair_text as string) ?? null,
    }))
  } catch {
    return []
  }
}
