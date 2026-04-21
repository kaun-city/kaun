import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * GET /api/data/contractors?ward=42&flagged=true&limit=50
 *
 * Public API for contractor profiles. Open for any civic tool to consume.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const ward = url.searchParams.get("ward")
  const flagged = url.searchParams.get("flagged")
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  let query = supabase
    .from("contractor_profiles")
    .select("entity_id, canonical_name, aliases, phone, total_contracts, total_value_lakh, total_paid_lakh, total_deduction_lakh, avg_deduction_pct, ward_count, wards, first_seen, last_seen, is_govt_entity, blacklist_flags")
    .eq("city_id", "bengaluru")
    .order("total_value_lakh", { ascending: false })
    .limit(limit)

  if (ward) query = query.contains("wards", [parseInt(ward)])
  if (flagged === "true") query = query.neq("blacklist_flags", "{}")

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })

  return Response.json({
    data: data ?? [],
    count: data?.length ?? 0,
    source: "kaun.city — BBMP work orders via opencity.in",
    license: "Public data, MIT licensed platform",
    updated: new Date().toISOString(),
  }, { headers: CORS_HEADERS })
}
