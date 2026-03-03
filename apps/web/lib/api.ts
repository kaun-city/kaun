/**
 * Kaun API layer — talks to Supabase directly.
 *
 * Spatial queries use PostgreSQL functions (RPC).
 * CRUD uses PostgREST.
 * No separate API server.
 */

import type { BudgetSummary, CommunityFact, PinResult, PropertyTaxData, RedditPost, WardProfile, WardStats } from "./types"
import { rpc, query, insert } from "./supabase"

/**
 * Pin lookup — reverse geocode a lat/lng to a ward.
 */
export async function pinLookup(lat: number, lng: number): Promise<PinResult | null> {
  const data = await rpc<{
    found: boolean
    city_id?: string
    ward_no?: number
    ward_name?: string
    zone?: string | null
    assembly_constituency?: string | null
  }>("pin_lookup", { lat, lng })

  if (!data || !data.found) {
    return { found: false } as PinResult
  }

  return {
    found: true,
    city_id: data.city_id ?? "bengaluru",
    ward_no: data.ward_no ?? 0,
    ward_name: data.ward_name ?? "",
    zone: data.zone ?? null,
    assembly_constituency: data.assembly_constituency ?? null,
    agencies: [],
  }
}

/**
 * Fetch full ward profile via PostgreSQL function.
 */
export async function fetchWardProfile(
  wardNo: number,
  cityId = "bengaluru",
  assemblyConstituency?: string
): Promise<WardProfile | null> {
  const data = await rpc<WardProfile>("ward_profile", {
    p_ward_no: wardNo,
    p_city_id: cityId,
    p_assembly_constituency: assemblyConstituency ?? null,
  })
  return data
}

/**
 * Fetch community facts for a ward.
 */
export async function fetchCommunityFacts(
  wardNo: number,
  cityId = "bengaluru",
  category?: string
): Promise<CommunityFact[]> {
  const params: Record<string, string> = {
    "city_id": `eq.${cityId}`,
    "ward_no": `eq.${wardNo}`,
    "is_active": "eq.true",
  }
  if (category) params["category"] = `eq.${category}`

  return await query<CommunityFact>("community_facts", params, {
    order: "corroboration_count.desc,created_at.desc",
  })
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
  const data = {
    city_id: payload.city_id ?? "bengaluru",
    ward_no: payload.ward_no,
    category: payload.category,
    subject: payload.subject,
    field: payload.field,
    value: payload.value,
    source_type: payload.source_type ?? "community",
    source_note: payload.source_note ?? null,
    contributor_token: payload.contributor_token ?? null,
    corroboration_count: payload.contributor_token ? 1 : 0,
    dispute_count: 0,
    is_active: true,
  }

  const fact = await insert<CommunityFact>("community_facts", data)
  if (!fact) return null

  // Also record the submitter's vote
  if (payload.contributor_token) {
    await insert("fact_votes", {
      fact_id: fact.id,
      vote_type: "corroborate",
      voter_token: payload.contributor_token,
    })
  }

  return {
    ok: true,
    fact: {
      ...fact,
      trust_level: fact.corroboration_count >= 5 ? "community_verified" : "unverified",
    },
    is_duplicate: false,
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
  // Check if already voted
  const existing = await query("fact_votes", {
    "fact_id": `eq.${factId}`,
    "voter_token": `eq.${voterToken}`,
  })

  if (existing.length > 0) {
    return { ok: true, corroboration_count: 0, trust_level: "unverified", already_voted: true }
  }

  // Record vote
  await insert("fact_votes", {
    fact_id: factId,
    vote_type: voteType,
    voter_token: voterToken,
  })

  // Update the fact's counter via RPC
  const col = voteType === "corroborate" ? "corroboration_count" : "dispute_count"
  await rpc("increment_fact_counter", { p_fact_id: factId, p_column: col })

  return { ok: true, corroboration_count: 0, trust_level: "unverified", already_voted: false }
}

/**
 * Fetch ward/constituency statistics (population, infrastructure, etc.)
 */
export async function fetchWardStats(assemblyConstituency: string): Promise<WardStats | null> {
  const data = await rpc<WardStats>("ward_stats_by_ac", {
    p_assembly_constituency: assemblyConstituency,
  })
  return data
}

/**
 * Fetch unanswered questions for a ward — the "what's unknown" prompts.
 */
export async function fetchWardUnknowns(wardNo: number, cityId = "bengaluru") {
  return await rpc<{
    ward_no: number
    total_questions: number
    answered: number
    unanswered: Array<{
      category: string
      subject: string
      field: string
      prompt: string
      icon: string
      priority: number
    }>
  }>("ward_unknowns", { p_ward_no: wardNo, p_city_id: cityId })
}

/**
 * Fetch recent community activity across the city.
 */
export async function fetchRecentActivity(limit = 20) {
  return await rpc<Array<{
    type: string
    ward_no: number
    ward_name: string
    category: string
    subject: string
    field: string
    value: string
    corroborations: number
    created_at: string
    trust_level: string
  }>>("recent_activity", { p_limit: limit })
}

/**
 * Fetch property tax collections for an assembly constituency.
 */
export async function fetchPropertyTax(assemblyConstituency: string): Promise<PropertyTaxData | null> {
  return await rpc<PropertyTaxData>("property_tax_by_ac", {
    p_assembly_constituency: assemblyConstituency,
  })
}

/**
 * Fetch BBMP budget summary.
 */
export async function fetchBudgetSummary(financialYear = "2020-21"): Promise<BudgetSummary | null> {
  return await rpc<BudgetSummary>("budget_summary", {
    p_financial_year: financialYear,
  })
}

/**
 * Fetch departments/agencies.
 */
export async function fetchDepartments(cityId = "bengaluru") {
  return await query("departments", { "city_id": `eq.${cityId}` }, { order: "category,short" })
}

/**
 * Fetch recent r/bangalore posts (client-side, optional).
 */
export async function fetchBuzz(wardName: string): Promise<RedditPost[]> {
  try {
    const q = encodeURIComponent(`${wardName} bangalore`)
    const res = await fetch(
      `https://www.reddit.com/r/bangalore/search.json?q=${q}&restrict_sr=on&sort=new&limit=5`,
      { headers: { "User-Agent": "kaun-civic/1.0" } }
    )
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data?.data?.children ?? []).map((c: any) => ({
      title: c.data.title,
      url: `https://reddit.com${c.data.permalink}`,
      score: c.data.score,
      num_comments: c.data.num_comments,
      created_utc: c.data.created_utc,
      author: c.data.author ?? "",
      flair: c.data.link_flair_text ?? null,
    }))
  } catch {
    return []
  }
}
